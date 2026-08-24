begin;

create or replace function private.configuracion_dotacion_supervision_valida(
  p_configuracion jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_turno text;
  v_categorias jsonb;
  v_categoria text;
  v_umbral jsonb;
begin
  if p_configuracion is null
    or jsonb_typeof(p_configuracion) <> 'object'
    or not (p_configuracion ? 'defaults')
    or jsonb_typeof(p_configuracion -> 'defaults') <> 'object'
    or not ((p_configuracion -> 'defaults') ? 'licenciado')
    or not ((p_configuracion -> 'defaults') ? 'enfermero') then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_configuracion) as clave
    where clave not in ('defaults', 'overridesTurno')
  ) or exists (
    select 1
    from jsonb_object_keys(p_configuracion -> 'defaults') as clave
    where clave not in ('licenciado', 'enfermero')
  ) then
    return false;
  end if;

  foreach v_categoria in array array['licenciado', 'enfermero'] loop
    v_umbral := p_configuracion -> 'defaults' -> v_categoria;
    if jsonb_typeof(v_umbral) <> 'object'
      or not (v_umbral ? 'minimo')
      or not (v_umbral ? 'optimo')
      or exists (
        select 1 from jsonb_object_keys(v_umbral) as clave
        where clave not in ('minimo', 'optimo')
      )
      or jsonb_typeof(v_umbral -> 'minimo') <> 'number'
      or jsonb_typeof(v_umbral -> 'optimo') <> 'number'
      or (v_umbral ->> 'minimo') !~ '^(0|[1-9][0-9]*)$'
      or (v_umbral ->> 'optimo') !~ '^(0|[1-9][0-9]*)$'
      or (v_umbral ->> 'optimo')::numeric < (v_umbral ->> 'minimo')::numeric then
      return false;
    end if;
  end loop;

  if p_configuracion ? 'overridesTurno' then
    if jsonb_typeof(p_configuracion -> 'overridesTurno') <> 'object' then
      return false;
    end if;

    for v_turno, v_categorias in
      select key, value from jsonb_each(p_configuracion -> 'overridesTurno')
    loop
      if v_turno not in ('noche', 'manana', 'tarde', 'vespertino')
        or jsonb_typeof(v_categorias) <> 'object' then
        return false;
      end if;

      for v_categoria, v_umbral in
        select key, value from jsonb_each(v_categorias)
      loop
        if v_categoria not in ('licenciado', 'enfermero')
          or jsonb_typeof(v_umbral) <> 'object'
          or not (v_umbral ? 'minimo')
          or not (v_umbral ? 'optimo')
          or exists (
            select 1 from jsonb_object_keys(v_umbral) as clave
            where clave not in ('minimo', 'optimo')
          )
          or jsonb_typeof(v_umbral -> 'minimo') <> 'number'
          or jsonb_typeof(v_umbral -> 'optimo') <> 'number'
          or (v_umbral ->> 'minimo') !~ '^(0|[1-9][0-9]*)$'
          or (v_umbral ->> 'optimo') !~ '^(0|[1-9][0-9]*)$'
          or (v_umbral ->> 'optimo')::numeric < (v_umbral ->> 'minimo')::numeric then
          return false;
        end if;
      end loop;
    end loop;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.configuracion_dotacion_supervision_valida(jsonb)
  from public, anon, authenticated;

create table if not exists public.configuracion_dotacion_supervision_mes (
  mes text primary key,
  configuracion jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  constraint configuracion_dotacion_supervision_mes_mes_check
    check (case
      when mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        then substring(mes from 1 for 4)::integer between 1 and 9999
      else false
    end),
  constraint configuracion_dotacion_supervision_mes_configuracion_check
    check (private.configuracion_dotacion_supervision_valida(configuracion)),
  constraint configuracion_dotacion_supervision_mes_revision_check
    check (revision >= 1)
);

create table if not exists public.historial_configuracion_dotacion_supervision_mes (
  mes text not null,
  revision bigint not null,
  configuracion jsonb not null,
  operacion text not null,
  changed_at timestamptz not null,
  changed_by uuid not null,
  constraint historial_configuracion_dotacion_supervision_mes_pkey
    primary key (mes, revision),
  constraint historial_configuracion_dotacion_supervision_mes_mes_check
    check (case
      when mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        then substring(mes from 1 for 4)::integer between 1 and 9999
      else false
    end),
  constraint historial_configuracion_dotacion_supervision_mes_revision_check
    check (revision >= 1),
  constraint historial_configuracion_dotacion_supervision_mes_configuracion_check
    check (private.configuracion_dotacion_supervision_valida(configuracion)),
  constraint historial_configuracion_dotacion_supervision_mes_operacion_check
    check (operacion in ('creacion', 'actualizacion_cas'))
);

create or replace function private.preparar_configuracion_dotacion_supervision_mes()
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
    new.created_at := now();
    new.created_by := v_actor;
  else
    if new.mes is distinct from old.mes
      or new.revision is distinct from old.revision + 1 then
      raise exception 'REVISION_INVALIDA';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;

  new.updated_at := now();
  new.updated_by := v_actor;
  return new;
end;
$$;

revoke all on function private.preparar_configuracion_dotacion_supervision_mes()
  from public, anon, authenticated;

create trigger configuracion_dotacion_supervision_mes_preparar_trigger
before insert or update on public.configuracion_dotacion_supervision_mes
for each row
execute function private.preparar_configuracion_dotacion_supervision_mes();

create or replace function private.registrar_historial_configuracion_dotacion_supervision_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.historial_configuracion_dotacion_supervision_mes (
    mes,
    revision,
    configuracion,
    operacion,
    changed_at,
    changed_by
  ) values (
    new.mes,
    new.revision,
    new.configuracion,
    case when tg_op = 'INSERT' then 'creacion' else 'actualizacion_cas' end,
    new.updated_at,
    new.updated_by
  );
  return new;
end;
$$;

revoke all on function private.registrar_historial_configuracion_dotacion_supervision_mes()
  from public, anon, authenticated;

create trigger configuracion_dotacion_supervision_mes_historial_trigger
after insert or update on public.configuracion_dotacion_supervision_mes
for each row
execute function private.registrar_historial_configuracion_dotacion_supervision_mes();

alter table public.configuracion_dotacion_supervision_mes enable row level security;
alter table public.historial_configuracion_dotacion_supervision_mes enable row level security;

revoke all privileges on table public.configuracion_dotacion_supervision_mes
  from public, anon, authenticated;
revoke all privileges on table public.historial_configuracion_dotacion_supervision_mes
  from public, anon, authenticated;

grant select on table public.configuracion_dotacion_supervision_mes to authenticated;
grant select on table public.historial_configuracion_dotacion_supervision_mes to authenticated;

create policy supervision_select_configuracion_dotacion_supervision_mes
on public.configuracion_dotacion_supervision_mes
for select to authenticated
using ((select private.usuario_app_es_supervision()));

create policy supervision_select_historial_configuracion_dotacion_supervision_mes
on public.historial_configuracion_dotacion_supervision_mes
for select to authenticated
using ((select private.usuario_app_es_supervision()));

create or replace function public.guardar_configuracion_dotacion_supervision_mes(
  p_mes text,
  p_configuracion jsonb,
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
  v_fila public.configuracion_dotacion_supervision_mes%rowtype;
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

  if not private.configuracion_dotacion_supervision_valida(p_configuracion) then
    raise exception 'CONFIGURACION_INVALIDA';
  end if;

  if p_revision_esperada is null or p_revision_esperada < 0 then
    raise exception 'REVISION_ESPERADA_INVALIDA';
  end if;

  if p_revision_esperada = 0 then
    insert into public.configuracion_dotacion_supervision_mes (
      mes,
      configuracion,
      revision,
      created_by,
      updated_by
    ) values (
      p_mes,
      p_configuracion,
      1,
      v_actor,
      v_actor
    )
    on conflict (mes) do nothing
    returning * into v_fila;
  else
    update public.configuracion_dotacion_supervision_mes
    set
      configuracion = p_configuracion,
      revision = revision + 1,
      updated_by = v_actor
    where mes = p_mes
      and revision = p_revision_esperada
    returning * into v_fila;
  end if;

  if found then
    return jsonb_build_object(
      'resultado', 'guardado',
      'existe', true,
      'mes', v_fila.mes,
      'revision', v_fila.revision::text,
      'updated_at', v_fila.updated_at,
      'configuracion', null
    );
  end if;

  select * into v_fila
  from public.configuracion_dotacion_supervision_mes
  where mes = p_mes;

  if found then
    return jsonb_build_object(
      'resultado', 'conflicto',
      'codigo', 'REVISION_CONFLICTO',
      'existe', true,
      'mes', v_fila.mes,
      'revision', v_fila.revision::text,
      'updated_at', v_fila.updated_at,
      'configuracion', v_fila.configuracion
    );
  end if;

  return jsonb_build_object(
    'resultado', 'conflicto',
    'codigo', 'REVISION_CONFLICTO',
    'existe', false,
    'mes', p_mes,
    'revision', '0',
    'updated_at', null,
    'configuracion', null
  );
end;
$$;

revoke all on function public.guardar_configuracion_dotacion_supervision_mes(
  text,
  jsonb,
  bigint
) from public, anon;
grant execute on function public.guardar_configuracion_dotacion_supervision_mes(
  text,
  jsonb,
  bigint
) to authenticated;

commit;
