begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;

create table if not exists public.perfiles_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null unique,
  rol text not null,
  turno text null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint perfiles_usuario_usuario_normalizado_check
    check (usuario = lower(btrim(usuario)) and usuario ~ '^[a-z0-9._-]+$'),
  constraint perfiles_usuario_rol_check
    check (rol in ('supervision', 'licenciado', 'enfermeria')),
  constraint perfiles_usuario_turno_check
    check (turno is null or turno in ('noche', 'manana', 'tarde', 'vespertino')),
  constraint perfiles_usuario_rol_turno_check
    check (
      (rol = 'licenciado' and turno in ('noche', 'manana', 'tarde', 'vespertino'))
      or (rol in ('supervision', 'enfermeria') and turno is null)
    )
);

do $$
declare desconocidas text;
begin
  select string_agg(policyname, ', ' order by policyname)
  into desconocidas
  from pg_policies
  where schemaname = 'public'
    and tablename = 'perfiles_usuario'
    and policyname <> 'perfil_usuario_select_propio';

  if desconocidas is not null then
    raise exception 'Se encontraron políticas RLS desconocidas en public.perfiles_usuario: %. Revisalas antes de ejecutar esta migración.', desconocidas;
  end if;
end $$;

alter table public.perfiles_usuario enable row level security;
revoke all privileges on table public.perfiles_usuario from anon;
revoke insert, update, delete on table public.perfiles_usuario from authenticated;
grant select on table public.perfiles_usuario to authenticated;

drop policy if exists perfil_usuario_select_propio on public.perfiles_usuario;
create policy perfil_usuario_select_propio
on public.perfiles_usuario for select to authenticated
using (user_id = (select auth.uid()));

create or replace function private.usuario_app_activo()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.activo from public.perfiles_usuario p
    where p.user_id = (select auth.uid())), false)
$$;

create or replace function private.usuario_app_puede_editar_turno(turno_consultado text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.activo and
    (p.rol = 'supervision' or (p.rol = 'licenciado' and p.turno = turno_consultado))
    from public.perfiles_usuario p where p.user_id = (select auth.uid())), false)
$$;

create or replace function private.usuario_app_es_supervision()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.activo and p.rol = 'supervision'
    from public.perfiles_usuario p where p.user_id = (select auth.uid())), false)
$$;

revoke all on function private.usuario_app_activo() from public, anon;
revoke all on function private.usuario_app_puede_editar_turno(text) from public, anon;
revoke all on function private.usuario_app_es_supervision() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.usuario_app_activo() to authenticated;
grant execute on function private.usuario_app_puede_editar_turno(text) to authenticated;
grant execute on function private.usuario_app_es_supervision() to authenticated;

commit;
