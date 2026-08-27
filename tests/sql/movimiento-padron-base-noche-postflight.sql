-- READ-ONLY. Ejecutar después de aplicar la migración N3B.
with funcion as (
  select
    p.oid,
    p.proowner,
    p.proacl,
    p.prosecdef,
    p.proconfig,
    pg_get_function_identity_arguments(p.oid) as argumentos,
    pg_get_functiondef(p.oid) as definicion
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'mover_persona_padron_base_turno_mes'
), checks as (
  select 'rpc_existe' as nombre, exists(select 1 from funcion) as ok
  union all select 'firma_exacta', exists (
    select 1 from funcion
    where argumentos = 'p_mes text, p_persona_id text, p_turno_origen text, p_turno_destino text, p_revision_origen_esperada bigint, p_revision_destino_esperada bigint'
  )
  union all select 'security_definer', coalesce((select prosecdef from funcion), false)
  union all select 'search_path_vacio', coalesce((
    select proconfig @> array['search_path=""']::text[] from funcion
  ), false)
  union all select 'authenticated_execute', coalesce((
    select has_function_privilege('authenticated', oid, 'EXECUTE') from funcion
  ), false)
  union all select 'anon_sin_execute', not coalesce((
    select has_function_privilege('anon', oid, 'EXECUTE') from funcion
  ), true)
  union all select 'public_sin_execute', not exists (
    select 1
    from funcion f
    cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  )
  union all select 'helper_supervision',
    to_regprocedure('private.usuario_app_es_supervision()') is not null
  union all select 'rls_habilitada', coalesce((
    select relrowsecurity
    from pg_class
    where oid = 'public.estado_por_turno_mes'::regclass
  ), false)
  union all select 'trigger_revision_enabled', exists (
    select 1 from pg_trigger
    where tgrelid = 'public.estado_por_turno_mes'::regclass
      and tgname = 'estado_turno_mes_revision_trigger'
      and tgenabled <> 'D'
  )
  union all select 'trigger_historial_enabled', exists (
    select 1 from pg_trigger
    where tgrelid = 'public.estado_por_turno_mes'::regclass
      and tgname = 'estado_turno_mes_historial_trigger'
      and tgenabled <> 'D'
  )
  union all select 'definicion_rotacion_nocturna', coalesce((
    select definicion ilike '%rotacion3Dias%'
      and definicion ilike '%asignacionBase%'
      and definicion ilike '%bloques%'
      and definicion ilike '%coberturaLibreSM%'
    from funcion
  ), false)
  union all select 'sin_bloqueo_diferido', not coalesce((
    select definicion like '%MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO%'
    from funcion
  ), true)
)
select
  case when bool_and(ok)
    then 'POSTFLIGHT_NOCHE_OK'
    else 'REVISAR_POSTFLIGHT_NOCHE'
  end as resultado,
  jsonb_object_agg(nombre, ok order by nombre) as checks
from checks;
