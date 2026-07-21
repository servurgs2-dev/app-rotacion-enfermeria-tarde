begin;

do $$
declare desconocidas text;
begin
  select string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname)
  into desconocidas
  from pg_policies
  where schemaname = 'public'
    and tablename in ('estado_por_turno_mes', 'estado_por_mes')
    and (tablename, policyname) not in (
      values
        ('estado_por_turno_mes', 'authenticated_select_estado_por_turno_mes'),
        ('estado_por_turno_mes', 'authenticated_insert_estado_por_turno_mes'),
        ('estado_por_turno_mes', 'authenticated_update_estado_por_turno_mes'),
        ('estado_por_turno_mes', 'authenticated_delete_estado_por_turno_mes'),
        ('estado_por_turno_mes', 'roles_select_estado_por_turno_mes'),
        ('estado_por_turno_mes', 'roles_insert_estado_por_turno_mes'),
        ('estado_por_turno_mes', 'roles_update_estado_por_turno_mes'),
        ('estado_por_turno_mes', 'roles_delete_estado_por_turno_mes'),
        ('estado_por_mes', 'authenticated_select_estado_por_mes'),
        ('estado_por_mes', 'authenticated_insert_estado_por_mes'),
        ('estado_por_mes', 'authenticated_update_estado_por_mes'),
        ('estado_por_mes', 'authenticated_delete_estado_por_mes'),
        ('estado_por_mes', 'roles_select_estado_por_mes'),
        ('estado_por_mes', 'roles_insert_estado_por_mes'),
        ('estado_por_mes', 'roles_update_estado_por_mes'),
        ('estado_por_mes', 'roles_delete_estado_por_mes')
    );
  if desconocidas is not null then
    raise exception 'Se encontraron políticas RLS desconocidas: %. Revisalas antes de ejecutar esta migración.', desconocidas;
  end if;
end $$;

alter table public.estado_por_turno_mes enable row level security;
alter table public.estado_por_mes enable row level security;
revoke all privileges on table public.estado_por_turno_mes from anon;
revoke all privileges on table public.estado_por_mes from anon;
grant select, insert, update, delete on table public.estado_por_turno_mes to authenticated;
grant select, insert, update, delete on table public.estado_por_mes to authenticated;

drop policy if exists authenticated_select_estado_por_turno_mes on public.estado_por_turno_mes;
drop policy if exists authenticated_insert_estado_por_turno_mes on public.estado_por_turno_mes;
drop policy if exists authenticated_update_estado_por_turno_mes on public.estado_por_turno_mes;
drop policy if exists authenticated_delete_estado_por_turno_mes on public.estado_por_turno_mes;
drop policy if exists roles_select_estado_por_turno_mes on public.estado_por_turno_mes;
drop policy if exists roles_insert_estado_por_turno_mes on public.estado_por_turno_mes;
drop policy if exists roles_update_estado_por_turno_mes on public.estado_por_turno_mes;
drop policy if exists roles_delete_estado_por_turno_mes on public.estado_por_turno_mes;

create policy roles_select_estado_por_turno_mes on public.estado_por_turno_mes
for select to authenticated using ((select private.usuario_app_activo()));
create policy roles_insert_estado_por_turno_mes on public.estado_por_turno_mes
for insert to authenticated with check ((select private.usuario_app_puede_editar_turno(turno))));
create policy roles_update_estado_por_turno_mes on public.estado_por_turno_mes
for update to authenticated
using ((select private.usuario_app_puede_editar_turno(turno)))
with check ((select private.usuario_app_puede_editar_turno(turno)));
create policy roles_delete_estado_por_turno_mes on public.estado_por_turno_mes
for delete to authenticated using ((select private.usuario_app_puede_editar_turno(turno)));

drop policy if exists authenticated_select_estado_por_mes on public.estado_por_mes;
drop policy if exists authenticated_insert_estado_por_mes on public.estado_por_mes;
drop policy if exists authenticated_update_estado_por_mes on public.estado_por_mes;
drop policy if exists authenticated_delete_estado_por_mes on public.estado_por_mes;
drop policy if exists roles_select_estado_por_mes on public.estado_por_mes;
drop policy if exists roles_insert_estado_por_mes on public.estado_por_mes;
drop policy if exists roles_update_estado_por_mes on public.estado_por_mes;
drop policy if exists roles_delete_estado_por_mes on public.estado_por_mes;

create policy roles_select_estado_por_mes on public.estado_por_mes
for select to authenticated using ((select private.usuario_app_activo()));
create policy roles_insert_estado_por_mes on public.estado_por_mes
for insert to authenticated with check ((select private.usuario_app_es_supervision()));
create policy roles_update_estado_por_mes on public.estado_por_mes
for update to authenticated using ((select private.usuario_app_es_supervision()))
with check ((select private.usuario_app_es_supervision()));
create policy roles_delete_estado_por_mes on public.estado_por_mes
for delete to authenticated using ((select private.usuario_app_es_supervision()));

commit;
