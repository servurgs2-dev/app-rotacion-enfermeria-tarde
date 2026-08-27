begin;

create or replace function private.usuario_app_turno_licenciado()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.activo
      and p.rol = 'licenciado'
      and p.turno in ('noche', 'manana', 'tarde', 'vespertino')
      then p.turno
    else null
  end
  from public.perfiles_usuario p
  where p.user_id = (select auth.uid())
$$;

revoke all on function private.usuario_app_turno_licenciado()
  from public, anon, authenticated;

create or replace function private.vigencias_turno_personal_rangos_propios_validos(
  p_mes text,
  p_rangos jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_rango jsonb;
  v_desde text;
  v_hasta text;
begin
  if p_mes is null or not (case
    when p_mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      then substring(p_mes from 1 for 4)::integer between 1 and 9999
    else false
  end) then
    return false;
  end if;

  if p_rangos is null or jsonb_typeof(p_rangos) <> 'array' then
    return false;
  end if;

  for v_rango in select value from jsonb_array_elements(p_rangos)
  loop
    if jsonb_typeof(v_rango) <> 'object'
      or not (v_rango ? 'desde')
      or not (v_rango ? 'hasta')
      or exists (
        select 1
        from jsonb_object_keys(v_rango) as clave
        where clave not in ('desde', 'hasta')
      )
      or jsonb_typeof(v_rango -> 'desde') <> 'string'
      or jsonb_typeof(v_rango -> 'hasta') <> 'string' then
      return false;
    end if;

    v_desde := v_rango ->> 'desde';
    v_hasta := v_rango ->> 'hasta';
    if v_desde !~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$'
      or v_hasta !~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$'
      or make_date(
        substring(v_desde from 1 for 4)::integer,
        substring(v_desde from 6 for 2)::integer,
        substring(v_desde from 9 for 2)::integer
      )::text <> v_desde
      or make_date(
        substring(v_hasta from 1 for 4)::integer,
        substring(v_hasta from 6 for 2)::integer,
        substring(v_hasta from 9 for 2)::integer
      )::text <> v_hasta
      or substring(v_desde from 1 for 7) <> p_mes
      or substring(v_hasta from 1 for 7) <> p_mes
      or v_desde > v_hasta then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_rangos) with ordinality as izquierda(rango, posicion)
    join jsonb_array_elements(p_rangos) with ordinality as derecha(rango, posicion)
      on izquierda.posicion < derecha.posicion
    where (izquierda.rango ->> 'desde')::date <= (derecha.rango ->> 'hasta')::date
      and (derecha.rango ->> 'desde')::date <= (izquierda.rango ->> 'hasta')::date
  ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.vigencias_turno_personal_rangos_propios_validos(text, jsonb)
  from public, anon, authenticated;

create or replace function private.preparar_vigencias_turno_personal_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_es_supervision boolean := (select private.usuario_app_es_supervision());
  v_turno_licenciado text := (select private.usuario_app_turno_licenciado());
  v_ajenas_anteriores jsonb;
  v_ajenas_nuevas jsonb;
begin
  if v_actor is null or (not v_es_supervision and v_turno_licenciado is null) then
    raise exception 'PERMISO_VIGENCIAS_REQUERIDO';
  end if;

  if tg_op = 'INSERT' then
    if v_turno_licenciado is not null and exists (
      select 1
      from jsonb_array_elements(new.vigencias) as rango
      where rango ->> 'turno' is distinct from v_turno_licenciado
    ) then
      raise exception 'RANGOS_AJENOS_NO_MODIFICABLES';
    end if;
    new.revision := 1;
    new.creado_en := now();
    new.creado_por := v_actor;
  else
    if new.mes is distinct from old.mes
      or new.persona_id is distinct from old.persona_id
      or new.revision is distinct from old.revision + 1 then
      raise exception 'REVISION_INVALIDA';
    end if;

    if v_turno_licenciado is not null then
      select coalesce(
        jsonb_agg(rango order by rango ->> 'desde', rango ->> 'hasta', rango ->> 'turno'),
        '[]'::jsonb
      ) into v_ajenas_anteriores
      from jsonb_array_elements(old.vigencias) as rango
      where rango ->> 'turno' is distinct from v_turno_licenciado;

      select coalesce(
        jsonb_agg(rango order by rango ->> 'desde', rango ->> 'hasta', rango ->> 'turno'),
        '[]'::jsonb
      ) into v_ajenas_nuevas
      from jsonb_array_elements(new.vigencias) as rango
      where rango ->> 'turno' is distinct from v_turno_licenciado;

      if v_ajenas_nuevas is distinct from v_ajenas_anteriores then
        raise exception 'RANGOS_AJENOS_NO_MODIFICABLES';
      end if;
    end if;

    new.creado_en := old.creado_en;
    new.creado_por := old.creado_por;
  end if;

  new.actualizado_en := now();
  new.actualizado_por := v_actor;
  return new;
end;
$$;

revoke all on function private.preparar_vigencias_turno_personal_mes()
  from public, anon, authenticated;

create or replace function public.guardar_vigencias_turno_personal_mes_turno_propio(
  p_mes text,
  p_persona_id text,
  p_rangos jsonb,
  p_revision_esperada bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_turno text := (select private.usuario_app_turno_licenciado());
  v_mes_actual text := to_char(
    current_timestamp at time zone 'America/Montevideo',
    'YYYY-MM'
  );
  v_persona_id text := btrim(coalesce(p_persona_id, ''));
  v_fila public.vigencias_turno_personal_mes%rowtype;
  v_vigencias jsonb;
  v_apariciones integer;
  v_turno_fuente text;
begin
  if v_actor is null or v_turno is null then
    raise exception 'PERMISO_LICENCIADO_REQUERIDO';
  end if;

  if p_mes is null or not (case
    when p_mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      then substring(p_mes from 1 for 4)::integer between 1 and 9999
    else false
  end) then
    raise exception 'MES_INVALIDO';
  end if;
  if p_mes < v_mes_actual then
    raise exception 'MES_HISTORICO_PROTEGIDO';
  end if;
  if v_persona_id = '' then
    raise exception 'PERSONA_ID_INVALIDA';
  end if;
  if not private.vigencias_turno_personal_rangos_propios_validos(p_mes, p_rangos) then
    raise exception 'RANGOS_PROPIOS_INVALIDOS';
  end if;
  if p_revision_esperada is null or p_revision_esperada < 0 then
    raise exception 'REVISION_ESPERADA_INVALIDA';
  end if;

  if p_revision_esperada = 0 then
    select * into v_fila
    from public.vigencias_turno_personal_mes
    where mes = p_mes and persona_id = v_persona_id
    for update;

    if found then
      return jsonb_build_object(
        'resultado', 'conflicto',
        'codigo', 'REVISION_CONFLICTO',
        'existe', true,
        'mes', v_fila.mes,
        'persona_id', v_fila.persona_id,
        'revision', v_fila.revision::text,
        'actualizado_en', v_fila.actualizado_en,
        'vigencias', v_fila.vigencias
      );
    end if;

    select count(*), min(e.turno)
    into v_apariciones, v_turno_fuente
    from public.estado_por_turno_mes e
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(e.data -> 'personal') = 'array' then e.data -> 'personal'
        else '[]'::jsonb
      end
    ) as persona
    where e.mes = p_mes
      and persona ->> 'id' = v_persona_id;

    if v_apariciones = 0 then
      raise exception 'PERSONA_LEGACY_NO_IDENTIFICABLE';
    end if;
    if v_apariciones > 1 then
      raise exception 'PERSONA_DUPLICADA_ENTRE_TURNOS';
    end if;
    if v_turno_fuente is distinct from v_turno then
      raise exception 'CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'turno', v_turno,
          'desde', rango ->> 'desde',
          'hasta', rango ->> 'hasta'
        ) order by rango ->> 'desde', rango ->> 'hasta', v_turno
      ),
      '[]'::jsonb
    ) into v_vigencias
    from jsonb_array_elements(p_rangos) as rango;
  else
    select * into v_fila
    from public.vigencias_turno_personal_mes
    where mes = p_mes and persona_id = v_persona_id
    for update;

    if not found or v_fila.revision is distinct from p_revision_esperada then
      if found then
        return jsonb_build_object(
          'resultado', 'conflicto',
          'codigo', 'REVISION_CONFLICTO',
          'existe', true,
          'mes', v_fila.mes,
          'persona_id', v_fila.persona_id,
          'revision', v_fila.revision::text,
          'actualizado_en', v_fila.actualizado_en,
          'vigencias', v_fila.vigencias
        );
      end if;
      return jsonb_build_object(
        'resultado', 'conflicto',
        'codigo', 'REVISION_CONFLICTO',
        'existe', false,
        'mes', p_mes,
        'persona_id', v_persona_id,
        'revision', '0',
        'actualizado_en', null,
        'vigencias', null
      );
    end if;

    select coalesce(jsonb_agg(rango order by desde, hasta, turno), '[]'::jsonb)
    into v_vigencias
    from (
      select
        rango,
        rango ->> 'desde' as desde,
        rango ->> 'hasta' as hasta,
        rango ->> 'turno' as turno
      from jsonb_array_elements(v_fila.vigencias) as rango
      where rango ->> 'turno' is distinct from v_turno
      union all
      select
        jsonb_build_object(
          'turno', v_turno,
          'desde', rango ->> 'desde',
          'hasta', rango ->> 'hasta'
        ) as rango,
        rango ->> 'desde' as desde,
        rango ->> 'hasta' as hasta,
        v_turno as turno
      from jsonb_array_elements(p_rangos) as rango
    ) as fusion;
  end if;

  if jsonb_array_length(v_vigencias) = 0 then
    raise exception 'CONFIGURACION_EXPLICITA_VACIA_NO_PERMITIDA';
  end if;
  if not private.vigencias_turno_personal_mes_validas(p_mes, v_vigencias) then
    raise exception 'VIGENCIAS_RESULTANTES_INVALIDAS';
  end if;

  if p_revision_esperada = 0 then
    insert into public.vigencias_turno_personal_mes (
      mes,
      persona_id,
      vigencias,
      revision,
      creado_por,
      actualizado_por
    ) values (
      p_mes,
      v_persona_id,
      v_vigencias,
      1,
      v_actor,
      v_actor
    )
    on conflict (mes, persona_id) do nothing
    returning * into v_fila;

    if not found then
      select * into v_fila
      from public.vigencias_turno_personal_mes
      where mes = p_mes and persona_id = v_persona_id;
      if found then
        return jsonb_build_object(
          'resultado', 'conflicto',
          'codigo', 'REVISION_CONFLICTO',
          'existe', true,
          'mes', v_fila.mes,
          'persona_id', v_fila.persona_id,
          'revision', v_fila.revision::text,
          'actualizado_en', v_fila.actualizado_en,
          'vigencias', v_fila.vigencias
        );
      end if;
      return jsonb_build_object(
        'resultado', 'conflicto',
        'codigo', 'REVISION_CONFLICTO',
        'existe', false,
        'mes', p_mes,
        'persona_id', v_persona_id,
        'revision', '0',
        'actualizado_en', null,
        'vigencias', null
      );
    end if;
  else
    update public.vigencias_turno_personal_mes
    set
      vigencias = v_vigencias,
      revision = revision + 1,
      actualizado_por = v_actor
    where mes = p_mes
      and persona_id = v_persona_id
      and revision = p_revision_esperada
    returning * into v_fila;
  end if;

  return jsonb_build_object(
    'resultado', 'guardado',
    'existe', true,
    'mes', v_fila.mes,
    'persona_id', v_fila.persona_id,
    'revision', v_fila.revision::text,
    'actualizado_en', v_fila.actualizado_en,
    'vigencias', v_fila.vigencias
  );
end;
$$;

revoke all on function public.guardar_vigencias_turno_personal_mes_turno_propio(
  text, text, jsonb, bigint
) from public, anon, authenticated;
grant execute on function public.guardar_vigencias_turno_personal_mes_turno_propio(
  text, text, jsonb, bigint
) to authenticated;

commit;
