begin;

create or replace function private.movimiento_padron_texto_normalizado(p_valor text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select translate(
    lower(regexp_replace(btrim(coalesce(p_valor, '')), '[[:space:]]+', ' ', 'g')),
    'áéíóúüñàèìòùâêîôûäëïö',
    'aeiouunaeiouaeiouaeiou'
  )
$$;

create or replace function private.movimiento_padron_funcionario_normalizado(p_valor text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_valor, '')), '[[:space:]]+', '', 'g'))
$$;

create or replace function private.movimiento_padron_referencia_id(p_referencia jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_referencia) = 'object' then
      nullif(btrim(coalesce(p_referencia ->> 'personaId', p_referencia ->> 'id', '')), '')
    else null
  end
$$;

create or replace function private.movimiento_padron_referencia_legacy_coincide(
  p_referencia jsonb,
  p_persona jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_referencia is null or jsonb_typeof(p_persona) <> 'object' then false
    when private.movimiento_padron_referencia_id(p_referencia) is not null then false
    when jsonb_typeof(p_referencia) = 'string' then
      private.movimiento_padron_texto_normalizado(p_referencia #>> '{}') <> ''
      and private.movimiento_padron_texto_normalizado(p_referencia #>> '{}') =
          private.movimiento_padron_texto_normalizado(p_persona ->> 'nombre')
    when jsonb_typeof(p_referencia) = 'object'
      and private.movimiento_padron_funcionario_normalizado(p_referencia ->> 'funcionario') <> '' then
      private.movimiento_padron_funcionario_normalizado(p_referencia ->> 'funcionario') =
        private.movimiento_padron_funcionario_normalizado(p_persona ->> 'funcionario')
    when jsonb_typeof(p_referencia) = 'object' then
      private.movimiento_padron_texto_normalizado(p_referencia ->> 'nombre') <> ''
      and private.movimiento_padron_texto_normalizado(p_referencia ->> 'nombre') =
          private.movimiento_padron_texto_normalizado(p_persona ->> 'nombre')
    else false
  end
$$;

create or replace function private.movimiento_padron_referencia_legacy_ambigua(
  p_referencia jsonb,
  p_mes text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) > 1
  from public.estado_por_turno_mes as e
  cross join lateral jsonb_array_elements(
    coalesce(e.data -> 'personal', '[]'::jsonb)
  ) as p(persona)
  where e.mes = p_mes
    and private.movimiento_padron_referencia_legacy_coincide(
      p_referencia,
      p.persona
    )
$$;

revoke all on function private.movimiento_padron_texto_normalizado(text)
  from public, anon, authenticated;
revoke all on function private.movimiento_padron_funcionario_normalizado(text)
  from public, anon, authenticated;
revoke all on function private.movimiento_padron_referencia_id(jsonb)
  from public, anon, authenticated;
revoke all on function private.movimiento_padron_referencia_legacy_coincide(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.movimiento_padron_referencia_legacy_ambigua(jsonb, text)
  from public, anon, authenticated;

create or replace function public.mover_persona_padron_base_turno_mes(
  p_mes text,
  p_persona_id text,
  p_turno_origen text,
  p_turno_destino text,
  p_revision_origen_esperada bigint,
  p_revision_destino_esperada bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_persona_id text := btrim(coalesce(p_persona_id, ''));
  v_mes_actual text := to_char(
    current_timestamp at time zone 'America/Montevideo',
    'YYYY-MM'
  );
  v_origen public.estado_por_turno_mes%rowtype;
  v_destino public.estado_por_turno_mes%rowtype;
  v_estado public.estado_por_turno_mes%rowtype;
  v_persona jsonb;
  v_categoria text;
  v_categoria_plural text;
  v_cantidad_origen integer := 0;
  v_cantidad_destino integer := 0;
  v_cantidad_otros integer := 0;
  v_personal_origen jsonb;
  v_personal_destino jsonb;
  v_planilla jsonb;
  v_calendario jsonb;
  v_seccion record;
  v_periodo record;
  v_referencia record;
  v_referencia_json jsonb;
  v_coincide_legacy boolean;
  v_coincidencias_legacy integer;
begin
  if v_actor is null or not (select private.usuario_app_es_supervision()) then
    raise exception using message = 'PERMISO_SUPERVISION_REQUERIDO', errcode = 'P0001';
  end if;

  if p_mes is null or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception using message = 'MES_INVALIDO', errcode = 'P0001';
  end if;
  if p_mes < v_mes_actual then
    raise exception using message = 'MES_HISTORICO_PROTEGIDO', errcode = 'P0001';
  end if;
  if p_turno_origen is null
    or p_turno_origen not in ('noche', 'manana', 'tarde', 'vespertino') then
    raise exception using message = 'TURNO_ORIGEN_INVALIDO', errcode = 'P0001';
  end if;
  if p_turno_destino is null
    or p_turno_destino not in ('noche', 'manana', 'tarde', 'vespertino') then
    raise exception using message = 'TURNO_DESTINO_INVALIDO', errcode = 'P0001';
  end if;
  if p_turno_origen = p_turno_destino then
    raise exception using message = 'TURNOS_IGUALES', errcode = 'P0001';
  end if;
  if v_persona_id = '' then
    raise exception using message = 'PERSONA_NO_IDENTIFICABLE', errcode = 'P0001';
  end if;

  -- Serializa movimientos de la misma identidad. El lock de tabla posterior
  -- también impide INSERT concurrente de una fila faltante para un tercer turno.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_mes || chr(31) || v_persona_id, 0)
  );
  lock table public.estado_por_turno_mes in share row exclusive mode;

  -- Orden estable para los locks de fila de todos los estados existentes del mes.
  perform 1
  from public.estado_por_turno_mes as e
  where e.mes = p_mes
  order by e.turno
  for update;

  select * into v_origen
  from public.estado_por_turno_mes as e
  where e.turno = p_turno_origen and e.mes = p_mes;
  if not found then
    raise exception using message = 'ESTADO_ORIGEN_INEXISTENTE', errcode = 'P0001';
  end if;

  select * into v_destino
  from public.estado_por_turno_mes as e
  where e.turno = p_turno_destino and e.mes = p_mes;
  if not found then
    raise exception using message = 'ESTADO_DESTINO_INEXISTENTE', errcode = 'P0001';
  end if;

  if p_revision_origen_esperada is null
    or v_origen.revision is distinct from p_revision_origen_esperada then
    raise exception using message = 'REVISION_ORIGEN_CONFLICTO', errcode = 'P0001';
  end if;
  if p_revision_destino_esperada is null
    or v_destino.revision is distinct from p_revision_destino_esperada then
    raise exception using message = 'REVISION_DESTINO_CONFLICTO', errcode = 'P0001';
  end if;

  for v_estado in
    select * from public.estado_por_turno_mes as e
    where e.mes = p_mes
    order by e.turno
  loop
    if coalesce(jsonb_typeof(v_estado.data -> 'personal'), 'array') <> 'array' then
      raise exception using message = 'PERSONA_NO_IDENTIFICABLE', errcode = 'P0001';
    end if;
    select count(*)::integer
    into v_coincidencias_legacy
    from jsonb_array_elements(coalesce(v_estado.data -> 'personal', '[]'::jsonb)) as p(persona)
    where jsonb_typeof(p.persona) = 'object'
      and btrim(coalesce(p.persona ->> 'id', '')) = v_persona_id;

    if v_estado.turno = p_turno_origen then
      v_cantidad_origen := v_coincidencias_legacy;
    elsif v_estado.turno = p_turno_destino then
      v_cantidad_destino := v_coincidencias_legacy;
    else
      v_cantidad_otros := v_cantidad_otros + v_coincidencias_legacy;
    end if;
  end loop;

  if v_cantidad_origen = 0 then
    raise exception using message = 'PERSONA_NO_ENCONTRADA_EN_ORIGEN', errcode = 'P0001';
  end if;
  if v_cantidad_origen > 1 then
    raise exception using message = 'PERSONA_DUPLICADA_EN_ORIGEN', errcode = 'P0001';
  end if;
  if v_cantidad_destino > 0 then
    raise exception using message = 'PERSONA_YA_EXISTE_EN_DESTINO', errcode = 'P0001';
  end if;
  if v_cantidad_otros > 0 then
    raise exception using message = 'PERSONA_DUPLICADA_ENTRE_TURNOS', errcode = 'P0001';
  end if;

  select p.persona
  into strict v_persona
  from jsonb_array_elements(v_origen.data -> 'personal') as p(persona)
  where jsonb_typeof(p.persona) = 'object'
    and btrim(coalesce(p.persona ->> 'id', '')) = v_persona_id;

  v_categoria := btrim(coalesce(v_persona ->> 'categoria', ''));
  if v_categoria not in ('enfermero', 'licenciado') then
    raise exception using message = 'PERSONA_CATEGORIA_INVALIDA', errcode = 'P0001';
  end if;
  v_categoria_plural := case v_categoria
    when 'enfermero' then 'enfermeros'
    else 'licenciados'
  end;

  -- Inspección acotada de referencias legacy conocidas de Planilla y de los
  -- registros locales de Calendario en los cuatro documentos del mes.
  for v_estado in
    select * from public.estado_por_turno_mes as e
    where e.mes = p_mes
    order by e.turno
  loop
    v_planilla := v_estado.data #> array['planillas', v_categoria_plural];
    if jsonb_typeof(v_planilla) = 'object' then
      for v_seccion in select key, value from jsonb_each(v_planilla)
      loop
        if v_seccion.key ~ '^semana[1-6]$' and jsonb_typeof(v_seccion.value) = 'object' then
          for v_referencia in select key, value from jsonb_each(v_seccion.value)
          loop
            v_referencia_json := v_referencia.value;
            v_coincide_legacy := private.movimiento_padron_referencia_legacy_coincide(
              v_referencia_json, v_persona
            );
            if v_coincide_legacy then
              if private.movimiento_padron_referencia_legacy_ambigua(
                v_referencia_json, p_mes
              ) then
                raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
              end if;
              raise exception using message = 'REFERENCIA_LEGACY_OPERATIVA_PENDIENTE', errcode = 'P0001';
            end if;
          end loop;
        end if;
      end loop;

      if jsonb_typeof(v_planilla -> 'asignacionesParciales') = 'object' then
        for v_periodo in select key, value from jsonb_each(v_planilla -> 'asignacionesParciales')
        loop
          if jsonb_typeof(v_periodo.value) = 'array' then
            for v_referencia_json in select value from jsonb_array_elements(v_periodo.value)
            loop
              if private.movimiento_padron_referencia_legacy_coincide(v_referencia_json, v_persona) then
                if private.movimiento_padron_referencia_legacy_ambigua(
                  v_referencia_json, p_mes
                ) then
                  raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
                end if;
                raise exception using message = 'REFERENCIA_LEGACY_OPERATIVA_PENDIENTE', errcode = 'P0001';
              end if;
            end loop;
          end if;
        end loop;
      end if;

      -- Inspección acotada de las tres estructuras de rotación nocturna.
      -- Un personaId/id explícito siempre gana: los helpers sólo consideran legacy.
      if v_categoria = 'enfermero'
        and jsonb_typeof(v_planilla -> 'rotacion3Dias' -> 'asignacionBase') = 'object' then
        for v_referencia in
          select key, value
          from jsonb_each(v_planilla -> 'rotacion3Dias' -> 'asignacionBase')
        loop
          if private.movimiento_padron_referencia_legacy_coincide(
            v_referencia.value, v_persona
          ) then
            if private.movimiento_padron_referencia_legacy_ambigua(
              v_referencia.value, p_mes
            ) then
              raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
            end if;
            raise exception using message = 'REFERENCIA_LEGACY_OPERATIVA_PENDIENTE', errcode = 'P0001';
          end if;
        end loop;
      end if;

      if v_categoria = 'enfermero'
        and jsonb_typeof(v_planilla -> 'rotacion3Dias' -> 'bloques') = 'object' then
        for v_periodo in
          select key, value
          from jsonb_each(v_planilla -> 'rotacion3Dias' -> 'bloques')
        loop
          if jsonb_typeof(v_periodo.value) = 'object' then
            for v_referencia in select key, value from jsonb_each(v_periodo.value)
            loop
              if private.movimiento_padron_referencia_legacy_coincide(
                v_referencia.value, v_persona
              ) then
                if private.movimiento_padron_referencia_legacy_ambigua(
                  v_referencia.value, p_mes
                ) then
                  raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
                end if;
                raise exception using message = 'REFERENCIA_LEGACY_OPERATIVA_PENDIENTE', errcode = 'P0001';
              end if;
            end loop;
          end if;
        end loop;
      end if;

      if v_categoria = 'enfermero'
        and jsonb_typeof(v_planilla -> 'rotacion3Dias' -> 'coberturaLibreSM') = 'object' then
        for v_referencia in
          select key, value
          from jsonb_each(v_planilla -> 'rotacion3Dias' -> 'coberturaLibreSM')
        loop
          if private.movimiento_padron_referencia_legacy_coincide(
            v_referencia.value, v_persona
          ) then
            if private.movimiento_padron_referencia_legacy_ambigua(
              v_referencia.value, p_mes
            ) then
              raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
            end if;
            raise exception using message = 'REFERENCIA_LEGACY_OPERATIVA_PENDIENTE', errcode = 'P0001';
          end if;
        end loop;
      end if;

      if jsonb_typeof(v_planilla -> 'coberturaLibreSM') = 'object' then
        for v_referencia in select key, value from jsonb_each(v_planilla -> 'coberturaLibreSM')
        loop
          if private.movimiento_padron_referencia_legacy_coincide(v_referencia.value, v_persona) then
            if private.movimiento_padron_referencia_legacy_ambigua(
              v_referencia.value, p_mes
            ) then
              raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
            end if;
            raise exception using message = 'REFERENCIA_LEGACY_OPERATIVA_PENDIENTE', errcode = 'P0001';
          end if;
        end loop;
      end if;
    end if;

    v_calendario := v_estado.data #> array['calendario', v_categoria_plural];
    if jsonb_typeof(v_calendario) = 'object' then
      for v_seccion in
        select key, value from jsonb_each(v_calendario)
        where key in ('cambiosDia', 'cambiosParoDia')
      loop
        if jsonb_typeof(v_seccion.value) = 'object' then
          for v_periodo in select key, value from jsonb_each(v_seccion.value)
          loop
            if jsonb_typeof(v_periodo.value) = 'object' then
              for v_referencia in select key, value from jsonb_each(v_periodo.value)
              loop
                if private.movimiento_padron_referencia_legacy_coincide(
                  v_referencia.value, v_persona
                ) and private.movimiento_padron_referencia_legacy_ambigua(
                  v_referencia.value, p_mes
                ) then
                  raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
                end if;
                if private.movimiento_padron_referencia_id(v_referencia.value) = v_persona_id
                  or private.movimiento_padron_referencia_legacy_coincide(
                    v_referencia.value, v_persona
                  ) then
                  raise exception using
                    message = 'REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES',
                    detail = v_estado.turno || '/' || v_seccion.key || '/' || v_periodo.key,
                    errcode = 'P0001';
                end if;
              end loop;
            end if;
          end loop;
        end if;
      end loop;

      if jsonb_typeof(v_calendario -> 'noDisponibles') = 'object' then
        for v_periodo in select key, value from jsonb_each(v_calendario -> 'noDisponibles')
        loop
          if jsonb_typeof(v_periodo.value) = 'array' then
            for v_referencia_json in select value from jsonb_array_elements(v_periodo.value)
            loop
              if private.movimiento_padron_referencia_legacy_coincide(
                v_referencia_json, v_persona
              ) and private.movimiento_padron_referencia_legacy_ambigua(
                v_referencia_json, p_mes
              ) then
                raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
              end if;
              if private.movimiento_padron_referencia_id(v_referencia_json) = v_persona_id
                or btrim(coalesce(v_referencia_json ->> 'personaCoberturaId', '')) = v_persona_id
                or private.movimiento_padron_referencia_legacy_coincide(
                  v_referencia_json, v_persona
                ) then
                raise exception using
                  message = 'REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES',
                  detail = v_estado.turno || '/noDisponibles/' || v_periodo.key,
                  errcode = 'P0001';
              end if;
            end loop;
          end if;
        end loop;
      end if;

      if jsonb_typeof(v_calendario -> 'asistenciaDia') = 'object' then
        for v_periodo in select key, value from jsonb_each(v_calendario -> 'asistenciaDia')
        loop
          if jsonb_typeof(v_periodo.value) = 'object' then
            for v_referencia in select key, value from jsonb_each(v_periodo.value)
            loop
              if jsonb_typeof(v_referencia.value) = 'object'
                and private.movimiento_padron_referencia_legacy_coincide(
                  v_referencia.value -> 'persona', v_persona
                )
                and private.movimiento_padron_referencia_legacy_ambigua(
                  v_referencia.value -> 'persona', p_mes
                ) then
                raise exception using message = 'REFERENCIA_LEGACY_AMBIGUA', errcode = 'P0001';
              end if;
              if v_referencia.key in (v_persona_id, 'id:' || v_persona_id)
                or (
                  jsonb_typeof(v_referencia.value) = 'object'
                  and (
                    private.movimiento_padron_referencia_id(
                      v_referencia.value -> 'persona'
                    ) = v_persona_id
                    or private.movimiento_padron_referencia_legacy_coincide(
                      v_referencia.value -> 'persona', v_persona
                    )
                  )
                ) then
                raise exception using
                  message = 'REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES',
                  detail = v_estado.turno || '/asistenciaDia/' || v_periodo.key,
                  errcode = 'P0001';
              end if;
            end loop;
          end if;
        end loop;
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(p.persona order by p.ord), '[]'::jsonb)
  into v_personal_origen
  from jsonb_array_elements(v_origen.data -> 'personal') with ordinality as p(persona, ord)
  where not (
    jsonb_typeof(p.persona) = 'object'
    and btrim(coalesce(p.persona ->> 'id', '')) = v_persona_id
  );

  v_personal_destino := coalesce(v_destino.data -> 'personal', '[]'::jsonb)
    || jsonb_build_array(v_persona);

  update public.estado_por_turno_mes
  set data = jsonb_set(v_origen.data, '{personal}', v_personal_origen, true),
      revision = v_origen.revision + 1
  where turno = p_turno_origen
    and mes = p_mes
    and revision = p_revision_origen_esperada
  returning * into v_origen;
  if not found then
    raise exception using message = 'REVISION_ORIGEN_CONFLICTO', errcode = 'P0001';
  end if;

  update public.estado_por_turno_mes
  set data = jsonb_set(v_destino.data, '{personal}', v_personal_destino, true),
      revision = v_destino.revision + 1
  where turno = p_turno_destino
    and mes = p_mes
    and revision = p_revision_destino_esperada
  returning * into v_destino;
  if not found then
    raise exception using message = 'REVISION_DESTINO_CONFLICTO', errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'mes', p_mes,
    'personaId', v_persona_id,
    'turnoOrigen', p_turno_origen,
    'turnoDestino', p_turno_destino,
    'revisionOrigen', v_origen.revision::text,
    'revisionDestino', v_destino.revision::text,
    'estadoOrigen', v_origen.data,
    'estadoDestino', v_destino.data
  );
end;
$$;

revoke all on function public.mover_persona_padron_base_turno_mes(
  text, text, text, text, bigint, bigint
) from public;
revoke all on function public.mover_persona_padron_base_turno_mes(
  text, text, text, text, bigint, bigint
) from anon;
grant execute on function public.mover_persona_padron_base_turno_mes(
  text, text, text, text, bigint, bigint
) to authenticated;

commit;
