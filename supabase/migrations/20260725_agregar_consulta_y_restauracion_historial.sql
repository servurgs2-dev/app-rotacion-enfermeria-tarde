begin;

alter table public.historial_estado_turno_mes
  drop constraint if exists historial_estado_turno_mes_accion_check;

alter table public.historial_estado_turno_mes
  add constraint historial_estado_turno_mes_accion_check
  check (
    accion in (
      'linea_base',
      'creacion',
      'actualizacion_cas',
      'restauracion'
    )
  );

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
  contexto_accion text := current_setting(
    'app_urgencias.accion_historial',
    true
  );
  contexto_origen_texto text := current_setting(
    'app_urgencias.origen_revision',
    true
  );
  revision_origen bigint;
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
    revision_origen := null;
  else
    revision_previa := old.revision;
    accion_registrada := 'actualizacion_cas';
    data_previa := old.data;
    revision_origen := null;

    if contexto_accion = 'restauracion'
      and contexto_origen_texto ~ '^[1-9][0-9]*$' then
      revision_origen := contexto_origen_texto::bigint;

      if exists (
        select 1
        from public.historial_estado_turno_mes as origen
        where origen.turno = new.turno
          and origen.mes = new.mes
          and origen.revision = revision_origen
          and origen.data = new.data
      ) then
        accion_registrada := 'restauracion';
      else
        revision_origen := null;
      end if;
    end if;
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
    revision_origen,
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

create or replace function public.restaurar_estado_turno_mes_desde_historial(
  p_historial_id bigint,
  p_revision_esperada bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  origen public.historial_estado_turno_mes%rowtype;
  fila public.estado_por_turno_mes%rowtype;
begin
  if p_historial_id is null or p_historial_id < 1 then
    raise exception 'El identificador histórico no es válido.';
  end if;

  if p_revision_esperada is null or p_revision_esperada < 1 then
    raise exception 'La revisión esperada debe ser 1 o superior.';
  end if;

  if not (select private.usuario_app_es_supervision()) then
    raise exception 'No tenés permiso para restaurar revisiones históricas.'
      using errcode = '42501';
  end if;

  select *
  into origen
  from public.historial_estado_turno_mes
  where id = p_historial_id;

  if not found then
    return jsonb_build_object(
      'resultado', 'no_encontrado'
    );
  end if;

  perform set_config(
    'app_urgencias.accion_historial',
    'restauracion',
    true
  );
  perform set_config(
    'app_urgencias.origen_revision',
    origen.revision::text,
    true
  );

  update public.estado_por_turno_mes
  set
    data = origen.data,
    revision = revision + 1
  where turno = origen.turno
    and mes = origen.mes
    and revision = p_revision_esperada
  returning * into fila;

  if found then
    return jsonb_build_object(
      'resultado', 'restaurado',
      'turno', fila.turno,
      'mes', fila.mes,
      'revision', fila.revision::text,
      'revision_anterior', p_revision_esperada::text,
      'origen_revision', origen.revision::text,
      'updated_at', fila.updated_at
    );
  end if;

  select *
  into fila
  from public.estado_por_turno_mes
  where turno = origen.turno
    and mes = origen.mes;

  return jsonb_build_object(
    'resultado', 'conflicto',
    'existe', found,
    'turno', origen.turno,
    'mes', origen.mes,
    'revision', case when found then fila.revision::text else '0' end,
    'updated_at', case when found then fila.updated_at else null end
  );
end;
$$;

revoke all on function public.restaurar_estado_turno_mes_desde_historial(
  bigint,
  bigint
) from public;
revoke all on function public.restaurar_estado_turno_mes_desde_historial(
  bigint,
  bigint
) from anon;
grant execute on function public.restaurar_estado_turno_mes_desde_historial(
  bigint,
  bigint
) to authenticated;

commit;
