begin;

create or replace function private.vigencias_turno_personal_mes_validas(
  p_mes text,
  p_vigencias jsonb
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

  if p_vigencias is null
    or jsonb_typeof(p_vigencias) <> 'array'
    or jsonb_array_length(p_vigencias) = 0 then
    return false;
  end if;

  for v_rango in select value from jsonb_array_elements(p_vigencias)
  loop
    if jsonb_typeof(v_rango) <> 'object'
      or not (v_rango ? 'turno')
      or not (v_rango ? 'desde')
      or not (v_rango ? 'hasta')
      or exists (
        select 1
        from jsonb_object_keys(v_rango) as clave
        where clave not in ('turno', 'desde', 'hasta')
      )
      or jsonb_typeof(v_rango -> 'turno') <> 'string'
      or jsonb_typeof(v_rango -> 'desde') <> 'string'
      or jsonb_typeof(v_rango -> 'hasta') <> 'string'
      or v_rango ->> 'turno' not in ('noche', 'manana', 'tarde', 'vespertino') then
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
    from jsonb_array_elements(p_vigencias) with ordinality as izquierda(rango, posicion)
    join jsonb_array_elements(p_vigencias) with ordinality as derecha(rango, posicion)
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

revoke all on function private.vigencias_turno_personal_mes_validas(text, jsonb)
  from public, anon, authenticated;

create table if not exists public.vigencias_turno_personal_mes (
  mes text not null,
  persona_id text not null,
  vigencias jsonb not null,
  revision bigint not null default 1,
  creado_en timestamptz not null default now(),
  creado_por uuid not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid not null,
  constraint vigencias_turno_personal_mes_pkey primary key (mes, persona_id),
  constraint vigencias_turno_personal_mes_mes_check check (case
    when mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      then substring(mes from 1 for 4)::integer between 1 and 9999
    else false
  end),
  constraint vigencias_turno_personal_mes_persona_id_check
    check (btrim(persona_id) <> ''),
  constraint vigencias_turno_personal_mes_vigencias_check
    check (private.vigencias_turno_personal_mes_validas(mes, vigencias)),
  constraint vigencias_turno_personal_mes_revision_check
    check (revision >= 1)
);

create table if not exists public.historial_vigencias_turno_personal_mes (
  id bigint generated always as identity primary key,
  mes text not null,
  persona_id text not null,
  vigencias jsonb not null,
  revision bigint not null,
  accion text not null,
  cambiado_en timestamptz not null default now(),
  cambiado_por uuid not null,
  constraint historial_vigencias_turno_personal_mes_mes_check check (case
    when mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      then substring(mes from 1 for 4)::integer between 1 and 9999
    else false
  end),
  constraint historial_vigencias_turno_personal_mes_persona_id_check
    check (btrim(persona_id) <> ''),
  constraint historial_vigencias_turno_personal_mes_vigencias_check
    check (private.vigencias_turno_personal_mes_validas(mes, vigencias)),
  constraint historial_vigencias_turno_personal_mes_revision_check
    check (revision >= 1),
  constraint historial_vigencias_turno_personal_mes_accion_check
    check (accion in ('INSERT', 'UPDATE', 'DELETE'))
);

create or replace function private.preparar_vigencias_turno_personal_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.usuario_app_es_supervision()) then
    raise exception 'PERMISO_SUPERVISION_REQUERIDO';
  end if;

  if tg_op = 'INSERT' then
    new.revision := 1;
    new.creado_en := now();
    new.creado_por := v_actor;
  else
    if new.mes is distinct from old.mes
      or new.persona_id is distinct from old.persona_id
      or new.revision is distinct from old.revision + 1 then
      raise exception 'REVISION_INVALIDA';
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

create trigger vigencias_turno_personal_mes_preparar_trigger
before insert or update on public.vigencias_turno_personal_mes
for each row
execute function private.preparar_vigencias_turno_personal_mes();

create or replace function private.registrar_historial_vigencias_turno_personal_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_fila public.vigencias_turno_personal_mes%rowtype;
begin
  if tg_op = 'DELETE' then
    v_fila := old;
  else
    v_fila := new;
  end if;
  insert into public.historial_vigencias_turno_personal_mes (
    mes,
    persona_id,
    vigencias,
    revision,
    accion,
    cambiado_en,
    cambiado_por
  ) values (
    v_fila.mes,
    v_fila.persona_id,
    v_fila.vigencias,
    v_fila.revision,
    tg_op,
    now(),
    v_actor
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.registrar_historial_vigencias_turno_personal_mes()
  from public, anon, authenticated;

create trigger vigencias_turno_personal_mes_historial_trigger
after insert or update or delete on public.vigencias_turno_personal_mes
for each row
execute function private.registrar_historial_vigencias_turno_personal_mes();

alter table public.vigencias_turno_personal_mes enable row level security;
alter table public.historial_vigencias_turno_personal_mes enable row level security;

revoke all privileges on table public.vigencias_turno_personal_mes
  from public, anon, authenticated;
revoke all privileges on table public.historial_vigencias_turno_personal_mes
  from public, anon, authenticated;

grant select on table public.vigencias_turno_personal_mes to authenticated;
grant select on table public.historial_vigencias_turno_personal_mes to authenticated;

create policy perfiles_activos_select_vigencias_turno_personal_mes
on public.vigencias_turno_personal_mes
for select to authenticated
using ((select private.usuario_app_activo()));

create policy supervision_select_historial_vigencias_turno_personal_mes
on public.historial_vigencias_turno_personal_mes
for select to authenticated
using ((select private.usuario_app_es_supervision()));

create or replace function public.guardar_vigencias_turno_personal_mes(
  p_mes text,
  p_persona_id text,
  p_vigencias jsonb,
  p_revision_esperada bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_mes_actual text := to_char(
    current_timestamp at time zone 'America/Montevideo',
    'YYYY-MM'
  );
  v_persona_id text := btrim(coalesce(p_persona_id, ''));
  v_fila public.vigencias_turno_personal_mes%rowtype;
begin
  if v_actor is null or not (select private.usuario_app_es_supervision()) then
    raise exception 'PERMISO_SUPERVISION_REQUERIDO';
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
  if not private.vigencias_turno_personal_mes_validas(p_mes, p_vigencias) then
    raise exception 'VIGENCIAS_INVALIDAS';
  end if;
  if p_revision_esperada is null or p_revision_esperada < 0 then
    raise exception 'REVISION_ESPERADA_INVALIDA';
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
      p_vigencias,
      1,
      v_actor,
      v_actor
    )
    on conflict (mes, persona_id) do nothing
    returning * into v_fila;
  else
    update public.vigencias_turno_personal_mes
    set
      vigencias = p_vigencias,
      revision = revision + 1,
      actualizado_por = v_actor
    where mes = p_mes
      and persona_id = v_persona_id
      and revision = p_revision_esperada
    returning * into v_fila;
  end if;

  if found then
    return jsonb_build_object(
      'resultado', 'guardado',
      'existe', true,
      'mes', v_fila.mes,
      'persona_id', v_fila.persona_id,
      'revision', v_fila.revision::text,
      'actualizado_en', v_fila.actualizado_en,
      'vigencias', v_fila.vigencias
    );
  end if;

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
end;
$$;

create or replace function public.eliminar_vigencias_turno_personal_mes(
  p_mes text,
  p_persona_id text,
  p_revision_esperada bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_mes_actual text := to_char(
    current_timestamp at time zone 'America/Montevideo',
    'YYYY-MM'
  );
  v_persona_id text := btrim(coalesce(p_persona_id, ''));
  v_fila public.vigencias_turno_personal_mes%rowtype;
begin
  if v_actor is null or not (select private.usuario_app_es_supervision()) then
    raise exception 'PERMISO_SUPERVISION_REQUERIDO';
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
  if p_revision_esperada is null or p_revision_esperada < 1 then
    raise exception 'REVISION_ESPERADA_INVALIDA';
  end if;

  delete from public.vigencias_turno_personal_mes
  where mes = p_mes
    and persona_id = v_persona_id
    and revision = p_revision_esperada
  returning * into v_fila;

  if found then
    return jsonb_build_object(
      'resultado', 'eliminado',
      'existe', false,
      'mes', v_fila.mes,
      'persona_id', v_fila.persona_id,
      'revision_eliminada', v_fila.revision::text,
      'vigencias', null
    );
  end if;

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
end;
$$;

revoke all on function public.guardar_vigencias_turno_personal_mes(
  text, text, jsonb, bigint
) from public, anon, authenticated;
grant execute on function public.guardar_vigencias_turno_personal_mes(
  text, text, jsonb, bigint
) to authenticated;

revoke all on function public.eliminar_vigencias_turno_personal_mes(
  text, text, bigint
) from public, anon, authenticated;
grant execute on function public.eliminar_vigencias_turno_personal_mes(
  text, text, bigint
) to authenticated;

commit;
