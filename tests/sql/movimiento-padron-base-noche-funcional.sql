-- Ejecutar en Supabase SQL Editor sólo después de POSTFLIGHT_NOCHE_OK.
-- Fixtures sintéticos, mes futuro aislado y ROLLBACK obligatorio.
begin;

do $$
declare
  v_mes constant text := '2099-11';
  v_supervision uuid;
  v_resultado jsonb;
  v_rev_o bigint;
  v_rev_d bigint;
  v_digest_vigencias text;
  v_digest_vigencias_despues text;
  v_escenario text;
  v_ruta text[];
  v_valor jsonb;
  v_persona jsonb := jsonb_build_object(
    'id', 'fixture-noche-enf',
    'nombre', 'Fixture Noche Enfermero',
    'funcionario', 'NOCHE 001',
    'categoria', 'enfermero',
    'horario', '20 a 08',
    'libre', false,
    'metadataCompleta', jsonb_build_object('preservar', true)
  );
begin
  if exists (select 1 from public.estado_por_turno_mes where mes = v_mes) then
    raise exception 'MES_FIXTURE_OCUPADO';
  end if;

  select user_id into v_supervision
  from public.perfiles_usuario
  where activo and rol = 'supervision'
  order by user_id limit 1;
  if v_supervision is null then
    raise exception 'SIN_SUPERVISION_ACTIVA_PARA_TEST';
  end if;
  perform set_config('request.jwt.claim.sub', v_supervision::text, true);

  select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.mes, v.persona_id)::text, '[]'))
  into v_digest_vigencias
  from public.vigencias_turno_personal_mes v;

  insert into public.estado_por_turno_mes(turno, mes, data)
  select turno, v_mes, jsonb_build_object(
    'personal', case when turno = 'manana' then jsonb_build_array(v_persona) else '[]'::jsonb end,
    'planillas', jsonb_build_object(
      'enfermeros', case when turno = 'noche' then jsonb_build_object(
        'rotacion3Dias', jsonb_build_object(
          'asignacionBase', jsonb_build_object(
            'T1', jsonb_build_object('personaId', 'fixture-noche-enf', 'nombre', 'Nombre no autoritativo')
          ),
          'bloques', jsonb_build_object(
            '2099-11-01', jsonb_build_object(
              'T2', jsonb_build_object('personaId', 'fixture-noche-enf', 'nombre', 'Otro nombre')
            )
          ),
          'coberturaLibreSM', jsonb_build_object(
            '2099-11-01', jsonb_build_object('id', 'fixture-noche-enf', 'nombre', 'Moderno')
          )
        )
      ) else '{}'::jsonb end,
      'licenciados', '{}'::jsonb
    ),
    'calendario', jsonb_build_object('enfermeros', '{}'::jsonb, 'licenciados', '{}'::jsonb),
    'marcaFixture', turno
  )
  from unnest(array['manana','tarde','vespertino','noche']) turno;

  -- A-I: moderno en las tres estructuras no bloquea; objeto/revisiones se preservan.
  select revision into v_rev_o from public.estado_por_turno_mes where mes = v_mes and turno = 'manana';
  select revision into v_rev_d from public.estado_por_turno_mes where mes = v_mes and turno = 'noche';
  v_resultado := public.mover_persona_padron_base_turno_mes(
    v_mes, 'fixture-noche-enf', 'manana', 'noche', v_rev_o, v_rev_d
  );
  if (v_resultado ->> 'revisionOrigen')::bigint <> v_rev_o + 1
    or (v_resultado ->> 'revisionDestino')::bigint <> v_rev_d + 1 then
    raise exception 'REVISION_NO_INCREMENTADA_UNA_VEZ';
  end if;
  if v_resultado #> '{estadoDestino,personal,0}' <> v_persona then
    raise exception 'OBJETO_COMPLETO_NO_PRESERVADO';
  end if;
  if v_resultado #>> '{estadoDestino,marcaFixture}' <> 'noche'
    or v_resultado #>> '{estadoOrigen,marcaFixture}' <> 'manana' then
    raise exception 'OTROS_CAMPOS_MODIFICADOS';
  end if;
  if v_resultado #>> '{estadoDestino,planillas,enfermeros,rotacion3Dias,asignacionBase,T1,personaId}'
      <> 'fixture-noche-enf' then
    raise exception 'REFERENCIA_MODERNA_ASIGNACIONBASE_MODIFICADA';
  end if;
  if v_resultado #>> '{estadoDestino,planillas,enfermeros,rotacion3Dias,bloques,2099-11-01,T2,personaId}'
      <> 'fixture-noche-enf' then
    raise exception 'REFERENCIA_MODERNA_BLOQUES_MODIFICADA';
  end if;
  if v_resultado #>> '{estadoDestino,planillas,enfermeros,rotacion3Dias,coberturaLibreSM,2099-11-01,id}'
      <> 'fixture-noche-enf' then
    raise exception 'REFERENCIA_MODERNA_COBERTURALIBRESM_MODIFICADA';
  end if;

  -- B: Enfermero Noche -> Tarde permitido.
  perform public.mover_persona_padron_base_turno_mes(
    v_mes, 'fixture-noche-enf', 'noche', 'tarde',
    (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'noche'),
    (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
  );

  -- F: CAS stale sigue bloqueando.
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-noche-enf', 'tarde', 'manana', 0,
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana')
    );
    raise exception 'CAS_NO_RECHAZADO';
  exception when others then
    if sqlerrm <> 'REVISION_ORIGEN_CONFLICTO' then raise; end if;
  end;

  -- J-L: cada ubicación legacy inequívoca nocturna bloquea.
  foreach v_escenario in array array['asignacionBase', 'bloques', 'coberturaLibreSM']
  loop
    v_ruta := case v_escenario
      when 'asignacionBase' then array['planillas','enfermeros','rotacion3Dias','asignacionBase']
      when 'bloques' then array['planillas','enfermeros','rotacion3Dias','bloques']
      else array['planillas','enfermeros','rotacion3Dias','coberturaLibreSM']
    end;
    v_valor := case v_escenario
      when 'asignacionBase' then jsonb_build_object('T1', 'Fixture Noche Enfermero')
      when 'bloques' then jsonb_build_object(
        '2099-11-01', jsonb_build_object('T1', 'Fixture Noche Enfermero')
      )
      else jsonb_build_object('2099-11-01', 'Fixture Noche Enfermero')
    end;
    update public.estado_por_turno_mes
    set data = jsonb_set(data, '{personal}', case when turno = 'manana'
      then jsonb_build_array(v_persona) else '[]'::jsonb end, true),
      revision = revision + 1
    where mes = v_mes;
    update public.estado_por_turno_mes
    set data = jsonb_set(data, '{planillas,enfermeros,rotacion3Dias}', '{}'::jsonb, true),
      revision = revision + 1
    where mes = v_mes and turno = 'noche';
    update public.estado_por_turno_mes
    set data = jsonb_set(
      data,
      v_ruta,
      v_valor,
      true
    ), revision = revision + 1
    where mes = v_mes and turno = 'noche';
    begin
      perform public.mover_persona_padron_base_turno_mes(
        v_mes, 'fixture-noche-enf', 'manana', 'noche',
        (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
        (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'noche')
      );
      raise exception 'LEGACY_NOCTURNO_NO_RECHAZADO_%', v_escenario;
    exception when others then
      if sqlerrm <> 'REFERENCIA_LEGACY_OPERATIVA_PENDIENTE' then raise; end if;
    end;
  end loop;

  -- M: homónimo legacy nocturno ambiguo.
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{personal}', case
    when turno = 'manana' then jsonb_build_array(jsonb_build_object(
      'id', 'fixture-noche-homonimo-1', 'nombre', 'Noche Homónima', 'categoria', 'enfermero'))
    when turno = 'vespertino' then jsonb_build_array(jsonb_build_object(
      'id', 'fixture-noche-homonimo-2', 'nombre', 'Noche Homónima', 'categoria', 'enfermero'))
    else '[]'::jsonb end, true), revision = revision + 1
  where mes = v_mes;
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{planillas,enfermeros,rotacion3Dias}', '{}'::jsonb, true),
    revision = revision + 1
  where mes = v_mes and turno = 'noche';
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{planillas,enfermeros,rotacion3Dias,asignacionBase}',
    jsonb_build_object('T1', 'Noche Homónima'), true), revision = revision + 1
  where mes = v_mes and turno = 'noche';
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-noche-homonimo-1', 'manana', 'noche',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'noche')
    );
    raise exception 'LEGACY_AMBIGUA_NO_RECHAZADA';
  exception when others then
    if sqlerrm <> 'REFERENCIA_LEGACY_AMBIGUA' then raise; end if;
  end;

  -- N: Calendario local sigue bloqueando.
  update public.estado_por_turno_mes
  set data = jsonb_set(
    jsonb_set(data, '{personal}', case when turno = 'manana'
      then jsonb_build_array(v_persona) else '[]'::jsonb end, true),
    '{calendario,enfermeros,cambiosDia}',
    case when turno = 'manana' then jsonb_build_object(
      '2099-11-02', jsonb_build_object('T1', jsonb_build_object(
        'personaId', 'fixture-noche-enf', 'nombre', 'Fixture Noche Enfermero'
      ))
    ) else '{}'::jsonb end, true
  ), revision = revision + 1
  where mes = v_mes;
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-noche-enf', 'manana', 'noche',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'noche')
    );
    raise exception 'CALENDARIO_LOCAL_NO_RECHAZADO';
  exception when others then
    if sqlerrm <> 'REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES' then raise; end if;
  end;

  -- P: duplicado en tercer turno conserva el bloqueo.
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{calendario,enfermeros}', '{}'::jsonb, true),
      revision = revision + 1
  where mes = v_mes;
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{personal}', case when turno in ('manana','vespertino')
    then jsonb_build_array(v_persona) else '[]'::jsonb end, true),
    revision = revision + 1
  where mes = v_mes;
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-noche-enf', 'manana', 'noche',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'noche')
    );
    raise exception 'TERCER_TURNO_NO_RECHAZADO';
  exception when others then
    if sqlerrm <> 'PERSONA_DUPLICADA_ENTRE_TURNOS' then raise; end if;
  end;

  -- Q: ninguna vigencia se modifica.
  select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.mes, v.persona_id)::text, '[]'))
  into v_digest_vigencias_despues
  from public.vigencias_turno_personal_mes v;
  if v_digest_vigencias_despues is distinct from v_digest_vigencias then
    raise exception 'VIGENCIAS_MODIFICADAS';
  end if;
end
$$;

-- R: elimina estados, revisiones e historial generado por los fixtures.
rollback;
