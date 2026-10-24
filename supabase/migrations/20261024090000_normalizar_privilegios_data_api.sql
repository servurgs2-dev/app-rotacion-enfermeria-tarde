begin;

-- Convencion Data API (vigente para toda tabla nueva de public):
-- la misma migracion que crea la tabla debe definir conscientemente los
-- privilegios de public, anon, authenticated y service_role, ademas de RLS y
-- sus policies cuando correspondan. No depender de default privileges.

-- Estado mensual: lectura y escritura directa autenticada, limitadas por RLS.
revoke all privileges on table public.estado_por_turno_mes
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.estado_por_turno_mes
  to authenticated;

-- Tabla legacy administrada por la aplicacion mientras exista compatibilidad.
revoke all privileges on table public.estado_por_mes
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.estado_por_mes
  to authenticated;

-- Perfil propio: lectura autenticada; no admite escrituras directas.
revoke all privileges on table public.perfiles_usuario
  from public, anon, authenticated, service_role;
grant select on table public.perfiles_usuario to authenticated;

-- Historial del estado: lectura autenticada; escritura interna por trigger/RPC.
revoke all privileges on table public.historial_estado_turno_mes
  from public, anon, authenticated, service_role;
grant select on table public.historial_estado_turno_mes to authenticated;

-- Auditoria tecnica escrita exclusivamente por la Edge Function de correo.
revoke all privileges on table public.envios_correo_pdf
  from public, anon, authenticated, service_role;
grant insert on table public.envios_correo_pdf to service_role;

-- Novedades: CRUD directo autenticado, siempre limitado por sus policies RLS.
revoke all privileges on table public.novedades_personal
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.novedades_personal
  to authenticated;

-- Configuracion de dotacion: lectura directa y escritura exclusivamente por RPC.
revoke all privileges on table public.configuracion_dotacion_supervision_mes
  from public, anon, authenticated, service_role;
grant select on table public.configuracion_dotacion_supervision_mes
  to authenticated;

-- Historial de configuracion: lectura directa; escritura interna por trigger.
revoke all privileges on table public.historial_configuracion_dotacion_supervision_mes
  from public, anon, authenticated, service_role;
grant select on table public.historial_configuracion_dotacion_supervision_mes
  to authenticated;

-- Vigencias: lectura directa y escritura exclusivamente por RPC.
revoke all privileges on table public.vigencias_turno_personal_mes
  from public, anon, authenticated, service_role;
grant select on table public.vigencias_turno_personal_mes to authenticated;

-- Historial de vigencias: lectura directa; escritura interna por trigger.
revoke all privileges on table public.historial_vigencias_turno_personal_mes
  from public, anon, authenticated, service_role;
grant select on table public.historial_vigencias_turno_personal_mes
  to authenticated;

commit;
