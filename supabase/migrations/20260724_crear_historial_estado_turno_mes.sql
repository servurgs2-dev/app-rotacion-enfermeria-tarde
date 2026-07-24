begin;

create table if not exists public.historial_estado_turno_mes (
  id bigint generated always as identity primary key,
  turno text not null,
  mes text not null,
  revision bigint not null,
  revision_anterior bigint null,
  data jsonb not null,
  accion text not null,
  usuario_id uuid null,
  usuario_snapshot text null,
  rol_snapshot text null,
  turno_perfil_snapshot text null,
  secciones_cambiadas text[] not null default array[]::text[],
  origen_revision bigint null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint historial_estado_turno_mes_revision_unica
    unique (turno, mes, revision),
  constraint historial_estado_turno_mes_turno_check
    check (turno in ('noche', 'manana', 'tarde', 'vespertino')),
  constraint historial_estado_turno_mes_mes_check
    check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint historial_estado_turno_mes_revision_check
    check (revision >= 1),
  constraint historial_estado_turno_mes_revision_anterior_check
    check (revision_anterior is null or revision_anterior >= 0),
  constraint historial_estado_turno_mes_origen_revision_check
    check (origen_revision is null or origen_revision >= 1),
  constraint historial_estado_turno_mes_data_objeto_check
    check (jsonb_typeof(data) = 'object'),
  constraint historial_estado_turno_mes_metadata_objeto_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint historial_estado_turno_mes_accion_check
    check (accion in ('linea_base', 'creacion', 'actualizacion_cas'))
);

create index if not exists historial_estado_turno_mes_contexto_revision_idx
  on public.historial_estado_turno_mes (turno, mes, revision desc);
create index if not exists historial_estado_turno_mes_created_at_idx
  on public.historial_estado_turno_mes (created_at desc);
create index if not exists historial_estado_turno_mes_usuario_created_at_idx
  on public.historial_estado_turno_mes (usuario_id, created_at desc);
create index if not exists historial_estado_turno_mes_accion_created_at_idx
  on public.historial_estado_turno_mes (accion, created_at desc);

lock table public.estado_por_turno_mes
in share row exclusive mode;

insert into public.historial_estado_turno_mes (
  turno,
  mes,
  revision,
  revision_anterior,
  data,
  accion,
  usuario_id,
  usuario_snapshot,
  rol_snapshot,
  turno_perfil_snapshot,
  secciones_cambiadas,
  origen_revision,
  created_at,
  metadata
)
select
  estado.turno,
  estado.mes,
  estado.revision,
  null,
  estado.data,
  'linea_base',
  null,
  null,
  null,
  null,
  coalesce(
    (
      select array_agg(clave order by clave)
      from jsonb_object_keys(estado.data) as claves(clave)
    ),
    array[]::text[]
  ),
  null,
  now(),
  jsonb_build_object(
    'motivo', 'activacion_historial',
    'estado_updated_at', estado.updated_at
  )
from public.estado_por_turno_mes as estado
on conflict (turno, mes, revision) do nothing;

create or replace function private.secciones_cambiadas_estado_turno_mes(
  data_anterior jsonb,
  data_nueva jsonb
)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  with entradas as (
    select
      case
        when jsonb_typeof(data_anterior) = 'object' then data_anterior
        else '{}'::jsonb
      end as anterior,
      case
        when jsonb_typeof(data_nueva) = 'object' then data_nueva
        else '{}'::jsonb
      end as nueva
  ),
  claves as (
    select jsonb_object_keys(anterior) as clave from entradas
    union
    select jsonb_object_keys(nueva) as clave from entradas
  )
  select coalesce(
    array_agg(claves.clave order by claves.clave)
      filter (
        where entradas.anterior -> claves.clave
          is distinct from entradas.nueva -> claves.clave
      ),
    array[]::text[]
  )
  from claves
  cross join entradas
$$;

revoke all on function private.secciones_cambiadas_estado_turno_mes(
  jsonb,
  jsonb
) from public;
revoke all on function private.secciones_cambiadas_estado_turno_mes(
  jsonb,
  jsonb
) from anon;
revoke all on function private.secciones_cambiadas_estado_turno_mes(
  jsonb,
  jsonb
) from authenticated;

create or replace function private.registrar_historial_estado_turno_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor_id uuid := (select auth.uid());
  autor_usuario text;
  autor_rol text;
  autor_turno text;
  revision_previa bigint;
  accion_registrada text;
  data_previa jsonb;
begin
  select
    perfil.usuario,
    perfil.rol,
    perfil.turno
  into
    autor_usuario,
    autor_rol,
    autor_turno
  from public.perfiles_usuario as perfil
  where perfil.user_id = autor_id;

  if tg_op = 'INSERT' then
    revision_previa := 0;
    accion_registrada := 'creacion';
    data_previa := null;
  else
    revision_previa := old.revision;
    accion_registrada := 'actualizacion_cas';
    data_previa := old.data;
  end if;

  insert into public.historial_estado_turno_mes (
    turno,
    mes,
    revision,
    revision_anterior,
    data,
    accion,
    usuario_id,
    usuario_snapshot,
    rol_snapshot,
    turno_perfil_snapshot,
    secciones_cambiadas,
    origen_revision,
    created_at,
    metadata
  )
  values (
    new.turno,
    new.mes,
    new.revision,
    revision_previa,
    new.data,
    accion_registrada,
    autor_id,
    autor_usuario,
    autor_rol,
    autor_turno,
    private.secciones_cambiadas_estado_turno_mes(
      data_previa,
      new.data
    ),
    null,
    now(),
    '{}'::jsonb
  );

  return new;
end;
$$;

revoke all on function private.registrar_historial_estado_turno_mes()
  from public;
revoke all on function private.registrar_historial_estado_turno_mes()
  from anon;
revoke all on function private.registrar_historial_estado_turno_mes()
  from authenticated;

drop trigger if exists estado_turno_mes_historial_trigger
  on public.estado_por_turno_mes;

create trigger estado_turno_mes_historial_trigger
after insert or update on public.estado_por_turno_mes
for each row
execute function private.registrar_historial_estado_turno_mes();

alter table public.historial_estado_turno_mes enable row level security;
revoke all privileges on table public.historial_estado_turno_mes from public;
revoke all privileges on table public.historial_estado_turno_mes from anon;
revoke all privileges on table public.historial_estado_turno_mes from authenticated;
grant select on table public.historial_estado_turno_mes to authenticated;

drop policy if exists supervision_select_historial_estado_turno_mes
  on public.historial_estado_turno_mes;
create policy supervision_select_historial_estado_turno_mes
on public.historial_estado_turno_mes
for select
to authenticated
using ((select private.usuario_app_es_supervision()));

commit;
