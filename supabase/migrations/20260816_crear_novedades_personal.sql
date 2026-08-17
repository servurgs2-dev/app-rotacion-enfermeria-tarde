begin;

create table if not exists public.novedades_personal (
  id uuid primary key default gen_random_uuid(),
  persona_id text not null,
  persona_nombre text not null,
  tipo text not null,
  fecha_desde date not null,
  fecha_hasta date not null,
  turno text null,
  categoria text null,
  observacion text not null default '',
  afecta_disponibilidad boolean not null default false,
  requiere_seguimiento boolean not null default false,
  estado text not null default 'pendiente',
  datos jsonb not null default '{}'::jsonb,
  creado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint novedades_personal_persona_id_check check (btrim(persona_id) <> ''),
  constraint novedades_personal_persona_nombre_check check (btrim(persona_nombre) <> ''),
  constraint novedades_personal_tipo_check check (tipo in (
    'licencia', 'certificacion', 'suspension', 'adhesion_paro',
    'olvido_tarjeta', 'cambio_horario', 'excedente', 'otra'
  )),
  constraint novedades_personal_fechas_check check (fecha_hasta >= fecha_desde),
  constraint novedades_personal_turno_check check (
    turno is null or turno in ('noche', 'manana', 'tarde', 'vespertino')
  ),
  constraint novedades_personal_categoria_check check (
    categoria is null or categoria in ('enfermero', 'licenciado')
  ),
  constraint novedades_personal_estado_check check (
    estado in ('activa', 'pendiente', 'revisada', 'resuelta', 'cancelada')
  ),
  constraint novedades_personal_datos_objeto_check check (jsonb_typeof(datos) = 'object')
);

create index if not exists novedades_personal_persona_fechas_idx
  on public.novedades_personal (persona_id, fecha_desde, fecha_hasta);
create index if not exists novedades_personal_rango_idx
  on public.novedades_personal (fecha_desde, fecha_hasta);
create index if not exists novedades_personal_tipo_estado_idx
  on public.novedades_personal (tipo, estado);
create index if not exists novedades_personal_turno_categoria_idx
  on public.novedades_personal (turno, categoria);

create or replace function public.actualizar_novedad_personal_auditoria()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := (select auth.uid());
    new.created_at := now();
  else
    new.creado_por := old.creado_por;
    new.created_at := old.created_at;
  end if;
  new.actualizado_por := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.actualizar_novedad_personal_auditoria() from public, anon;

drop trigger if exists novedades_personal_auditoria_trigger on public.novedades_personal;
create trigger novedades_personal_auditoria_trigger
before insert or update on public.novedades_personal
for each row execute function public.actualizar_novedad_personal_auditoria();

alter table public.novedades_personal enable row level security;
revoke all privileges on table public.novedades_personal from anon;
grant select, insert, update, delete on table public.novedades_personal to authenticated;

drop policy if exists novedades_personal_select on public.novedades_personal;
drop policy if exists novedades_personal_insert on public.novedades_personal;
drop policy if exists novedades_personal_update on public.novedades_personal;
drop policy if exists novedades_personal_delete on public.novedades_personal;

create policy novedades_personal_select on public.novedades_personal
for select to authenticated
using ((select private.usuario_app_activo()));

create policy novedades_personal_insert on public.novedades_personal
for insert to authenticated
with check ((select private.usuario_app_puede_editar_turno(turno)));

create policy novedades_personal_update on public.novedades_personal
for update to authenticated
using ((select private.usuario_app_puede_editar_turno(turno)))
with check ((select private.usuario_app_puede_editar_turno(turno)));

create policy novedades_personal_delete on public.novedades_personal
for delete to authenticated
using ((select private.usuario_app_puede_editar_turno(turno)));

commit;
