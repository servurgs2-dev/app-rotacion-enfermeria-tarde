-- DISEÑO FUNCIONAL. Ejecutar en Supabase SQL Editor sólo después de POSTFLIGHT_OK.
-- Usa un mes futuro aislado, identidades sintéticas y ROLLBACK obligatorio.
begin;

do $$
declare
  v_mes constant text := '2099-12';
  v_supervision uuid;
  v_resultado jsonb;
  v_rev_o bigint;
  v_rev_d bigint;
  v_data_o jsonb;
  v_data_d jsonb;
  v_digest_vigencias text;
  v_digest_vigencias_despues text;
  v_persona_lic jsonb := jsonb_build_object(
    'id', 'fixture-movimiento-lic',
    'nombre', 'Fixture Movimiento Lic',
    'funcionario', 'fixture-001',
    'categoria', 'licenciado',
    'horario', 'fixture',
    'libre', false,
    'maternal', false,
    'campoNoReconstruible', jsonb_build_object('preservar', true)
  );
begin
  if exists (select 1 from public.estado_por_turno_mes where mes = v_mes) then
    raise exception 'MES_FIXTURE_OCUPADO: elegí otro mes futuro aislado';
  end if;

  select user_id into v_supervision
  from public.perfiles_usuario
  where activo and rol = 'supervision'
  order by user_id
  limit 1;
  if v_supervision is null then
    raise exception 'SIN_SUPERVISION_ACTIVA_PARA_TEST';
  end if;
  perform set_config('request.jwt.claim.sub', v_supervision::text, true);

  select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.mes, v.persona_id)::text, '[]'))
  into v_digest_vigencias
  from public.vigencias_turno_personal_mes as v;

  insert into public.estado_por_turno_mes(turno, mes, data)
  select turno, v_mes, jsonb_build_object(
    'personal', case when turno = 'manana'
      then jsonb_build_array(
        jsonb_build_object('id', 'fixture-movimiento-antes', 'nombre', 'Antes', 'categoria', 'licenciado'),
        v_persona_lic,
        jsonb_build_object('id', 'fixture-movimiento-despues', 'nombre', 'Después', 'categoria', 'licenciado')
      ) else '[]'::jsonb end,
    'planillas', jsonb_build_object('enfermeros', '{}'::jsonb, 'licenciados', '{}'::jsonb),
    'calendario', jsonb_build_object('enfermeros', '{}'::jsonb, 'licenciados', '{}'::jsonb),
    'licencias', jsonb_build_array(jsonb_build_object('id', 'fixture-licencia-intacta')),
    'certificaciones', jsonb_build_array(jsonb_build_object('id', 'fixture-cert-intacta')),
    'extrasFixture', jsonb_build_object('preservar', turno),
    'marcaFixture', turno
  )
  from unnest(array['manana','tarde','vespertino','noche']) as turno;

  select revision, data into v_rev_o, v_data_o
  from public.estado_por_turno_mes where turno = 'manana' and mes = v_mes;
  select revision, data into v_rev_d, v_data_d
  from public.estado_por_turno_mes where turno = 'tarde' and mes = v_mes;

  -- A-E: movimiento, objeto completo, otros campos intactos y revisión +1 exacta.
  v_resultado := public.mover_persona_padron_base_turno_mes(
    v_mes, 'fixture-movimiento-lic', 'manana', 'tarde', v_rev_o, v_rev_d
  );
  if (v_resultado ->> 'revisionOrigen')::bigint <> v_rev_o + 1
    or (v_resultado ->> 'revisionDestino')::bigint <> v_rev_d + 1 then
    raise exception 'REVISION_NO_INCREMENTADA_EXACTAMENTE_UNA_VEZ';
  end if;
  if v_resultado #> '{estadoDestino,personal,0}' <> v_persona_lic then
    raise exception 'OBJETO_COMPLETO_NO_PRESERVADO';
  end if;
  if v_resultado #>> '{estadoOrigen,personal,0,id}' <> 'fixture-movimiento-antes'
    or v_resultado #>> '{estadoOrigen,personal,1,id}' <> 'fixture-movimiento-despues' then
    raise exception 'ORDEN_ORIGEN_NO_PRESERVADO';
  end if;
  if (v_resultado -> 'estadoOrigen') - 'personal' <> v_data_o - 'personal'
    or (v_resultado -> 'estadoDestino') - 'personal' <> v_data_d - 'personal' then
    raise exception 'OTROS_CAMPOS_JSON_MODIFICADOS';
  end if;

  -- F: CAS stale.
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-movimiento-lic', 'tarde', 'vespertino', v_rev_d, 1
    );
    raise exception 'CAS_NO_RECHAZADO';
  exception when others then
    if sqlerrm <> 'REVISION_ORIGEN_CONFLICTO' then raise; end if;
  end;

  -- G: ya existe en destino.
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{personal}', jsonb_build_array(jsonb_build_object(
    'id', 'fixture-movimiento-destino', 'nombre', 'Destino', 'categoria', 'licenciado'
  )), true), revision = revision + 1
  where mes = v_mes and turno in ('manana', 'tarde');
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-movimiento-destino', 'manana', 'tarde',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
    );
    raise exception 'DESTINO_DUPLICADO_NO_RECHAZADO';
  exception when others then
    if sqlerrm <> 'PERSONA_YA_EXISTE_EN_DESTINO' then raise; end if;
  end;

  -- H: misma identidad en tercer turno.
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{personal}', case when turno in ('manana','vespertino')
    then jsonb_build_array(jsonb_build_object(
      'id', 'fixture-movimiento-tercero', 'nombre', 'Tercero', 'categoria', 'licenciado'
    )) else '[]'::jsonb end, true), revision = revision + 1
  where mes = v_mes;
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-movimiento-tercero', 'manana', 'tarde',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
    );
    raise exception 'TERCER_TURNO_NO_RECHAZADO';
  exception when others then
    if sqlerrm <> 'PERSONA_DUPLICADA_ENTRE_TURNOS' then raise; end if;
  end;

  -- I: duplicada dentro de origen.
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{personal}', case when turno = 'manana'
    then jsonb_build_array(
      jsonb_build_object('id', 'fixture-movimiento-doble', 'nombre', 'Doble', 'categoria', 'licenciado'),
      jsonb_build_object('id', 'fixture-movimiento-doble', 'nombre', 'Doble', 'categoria', 'licenciado')
    ) else '[]'::jsonb end, true), revision = revision + 1
  where mes = v_mes;
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-movimiento-doble', 'manana', 'tarde',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
    );
    raise exception 'DUPLICADA_ORIGEN_NO_RECHAZADA';
  exception when others then
    if sqlerrm <> 'PERSONA_DUPLICADA_EN_ORIGEN' then raise; end if;
  end;

  -- J: Enfermero hacia Noche bloqueado.
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{personal}', case when turno = 'manana'
    then jsonb_build_array(jsonb_build_object(
      'id', 'fixture-movimiento-enf', 'nombre', 'Enfermero', 'categoria', 'enfermero'
    )) else '[]'::jsonb end, true), revision = revision + 1
  where mes = v_mes;
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-movimiento-enf', 'manana', 'noche',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'noche')
    );
    raise exception 'NOCHE_ENFERMERO_NO_RECHAZADA';
  exception when others then
    if sqlerrm <> 'MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO' then raise; end if;
  end;

  -- K: Licenciado hacia y desde Noche permitido.
  update public.estado_por_turno_mes
  set data = jsonb_set(data, '{personal}', case when turno = 'manana'
    then jsonb_build_array(jsonb_build_object(
      'id', 'fixture-movimiento-lic-noche', 'nombre', 'Lic Noche', 'categoria', 'licenciado'
    )) else '[]'::jsonb end, true), revision = revision + 1
  where mes = v_mes;
  perform public.mover_persona_padron_base_turno_mes(
    v_mes, 'fixture-movimiento-lic-noche', 'manana', 'noche',
    (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
    (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'noche')
  );
  perform public.mover_persona_padron_base_turno_mes(
    v_mes, 'fixture-movimiento-lic-noche', 'noche', 'tarde',
    (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'noche'),
    (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
  );

  -- L: Calendario local moderno bloquea.
  update public.estado_por_turno_mes
  set data = jsonb_set(
    jsonb_set(data, '{personal}', case when turno = 'manana'
      then jsonb_build_array(jsonb_build_object(
        'id', 'fixture-movimiento-cal', 'nombre', 'Calendario', 'categoria', 'licenciado'
      )) else '[]'::jsonb end, true),
    '{calendario,licenciados,cambiosDia}',
    case when turno = 'manana' then jsonb_build_object(
      '2099-12-01', jsonb_build_object('T1', jsonb_build_object(
        'personaId', 'fixture-movimiento-cal', 'nombre', 'Calendario'
      ))
    ) else '{}'::jsonb end, true
  ), revision = revision + 1
  where mes = v_mes;
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-movimiento-cal', 'manana', 'tarde',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
    );
    raise exception 'CALENDARIO_LOCAL_NO_RECHAZADO';
  exception when others then
    if sqlerrm <> 'REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES' then raise; end if;
  end;

  -- M: referencia semanal legacy inequívoca bloquea.
  update public.estado_por_turno_mes
  set data = jsonb_set(
    jsonb_set(data, '{personal}', case when turno = 'manana'
      then jsonb_build_array(jsonb_build_object(
        'id', 'fixture-movimiento-legacy', 'nombre', 'Nombre Legacy',
        'funcionario', 'LEG 001', 'categoria', 'licenciado'
      )) else '[]'::jsonb end, true),
    '{planillas,licenciados,semana1}',
    case when turno = 'manana' then jsonb_build_object('T1', 'Nombre Legacy')
      else '{}'::jsonb end, true
  ), revision = revision + 1
  where mes = v_mes;
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-movimiento-legacy', 'manana', 'tarde',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
    );
    raise exception 'LEGACY_NO_RECHAZADO';
  exception when others then
    if sqlerrm <> 'REFERENCIA_LEGACY_OPERATIVA_PENDIENTE' then raise; end if;
  end;

  -- N: homónimo legacy ambiguo bloquea con código específico.
  update public.estado_por_turno_mes
  set data = jsonb_set(
    jsonb_set(data, '{personal}', case
      when turno = 'manana' then jsonb_build_array(jsonb_build_object(
        'id', 'fixture-movimiento-homonimo-1', 'nombre', 'Mismo Nombre', 'categoria', 'licenciado'))
      when turno = 'vespertino' then jsonb_build_array(jsonb_build_object(
        'id', 'fixture-movimiento-homonimo-2', 'nombre', 'Mismo Nombre', 'categoria', 'licenciado'))
      else '[]'::jsonb end, true),
    '{planillas,licenciados,semana1}',
    case when turno = 'manana' then jsonb_build_object('T1', 'Mismo Nombre')
      else '{}'::jsonb end, true
  ), revision = revision + 1
  where mes = v_mes;
  begin
    perform public.mover_persona_padron_base_turno_mes(
      v_mes, 'fixture-movimiento-homonimo-1', 'manana', 'tarde',
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
      (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
    );
    raise exception 'LEGACY_AMBIGUA_NO_RECHAZADA';
  exception when others then
    if sqlerrm <> 'REFERENCIA_LEGACY_AMBIGUA' then raise; end if;
  end;

  -- O: referencia semanal moderna no bloquea.
  update public.estado_por_turno_mes
  set data = jsonb_set(
    jsonb_set(data, '{personal}', case when turno = 'manana'
      then jsonb_build_array(jsonb_build_object(
        'id', 'fixture-movimiento-moderno', 'nombre', 'Moderno', 'categoria', 'licenciado'
      )) else '[]'::jsonb end, true),
    '{planillas,licenciados,semana1}',
    case when turno = 'manana' then jsonb_build_object('T1', jsonb_build_object(
      'personaId', 'fixture-movimiento-moderno', 'nombre', 'Moderno'
    )) else '{}'::jsonb end, true
  ), revision = revision + 1
  where mes = v_mes;
  perform public.mover_persona_padron_base_turno_mes(
    v_mes, 'fixture-movimiento-moderno', 'manana', 'tarde',
    (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'manana'),
    (select revision from public.estado_por_turno_mes where mes = v_mes and turno = 'tarde')
  );

  -- P: ninguna vigencia, propia o ajena, se modifica.
  select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.mes, v.persona_id)::text, '[]'))
  into v_digest_vigencias_despues
  from public.vigencias_turno_personal_mes as v;
  if v_digest_vigencias_despues is distinct from v_digest_vigencias then
    raise exception 'VIGENCIAS_MODIFICADAS';
  end if;
end
$$;

-- Q: incluso si una aserción falla, la transacción puede abortarse; en éxito,
-- este ROLLBACK elimina filas, historial y revisiones de todos los fixtures.
rollback;
