import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const historica = "supabase/migrations/20260826120000_agregar_movimiento_padron_base_personal.sql";
const migracion = "supabase/migrations/20260826183000_habilitar_movimiento_enfermeros_noche.sql";
const sqlHistorico = fs.readFileSync(historica, "utf8");
const sql = fs.readFileSync(migracion, "utf8");
const postflight = fs.readFileSync("tests/sql/movimiento-padron-base-noche-postflight.sql", "utf8");
const funcional = fs.readFileSync("tests/sql/movimiento-padron-base-noche-funcional.sql", "utf8");
const rpc = sql.match(/create or replace function public\.mover_persona_padron_base_turno_mes[\s\S]+?\n\$\$;/i)?.[0] || "";
const cuenta = (patron) => [...sql.matchAll(patron)].length;

test("la nueva migración es posterior, transaccional y redefine el RPC exacto", () => {
  assert.ok(migracion > historica);
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
  assert.match(rpc, /p_mes text[\s\S]+p_persona_id text[\s\S]+p_turno_origen text[\s\S]+p_turno_destino text[\s\S]+p_revision_origen_esperada bigint[\s\S]+p_revision_destino_esperada bigint/i);
  assert.match(rpc, /returns jsonb/i);
});

test("preserva SECURITY DEFINER, search_path, auth y permiso de Supervisión", () => {
  assert.match(rpc, /security definer\s+set search_path = ''/i);
  assert.match(rpc, /auth\.uid\(\)/i);
  assert.match(rpc, /private\.usuario_app_es_supervision\(\)/i);
  assert.match(rpc, /PERMISO_SUPERVISION_REQUERIDO/);
  assert.doesNotMatch(rpc, /p_(usuario|rol|actor)/i);
});

test("preserva mes, históricos Montevideo y turnos", () => {
  assert.match(rpc, /America\/Montevideo/);
  for (const codigo of ["MES_INVALIDO", "MES_HISTORICO_PROTEGIDO", "TURNO_ORIGEN_INVALIDO", "TURNO_DESTINO_INVALIDO", "TURNOS_IGUALES"]) {
    assert.match(rpc, new RegExp(codigo));
  }
});

test("preserva advisory, lock de tabla, row locks y CAS doble", () => {
  assert.match(rpc, /pg_advisory_xact_lock/i);
  assert.match(rpc, /hashtextextended\(p_mes[\s\S]+v_persona_id/i);
  assert.match(rpc, /lock table public\.estado_por_turno_mes in share row exclusive mode/i);
  assert.match(rpc, /where e\.mes = p_mes[\s\S]+order by e\.turno[\s\S]+for update/i);
  assert.match(rpc, /v_origen\.revision is distinct from p_revision_origen_esperada/i);
  assert.match(rpc, /v_destino\.revision is distinct from p_revision_destino_esperada/i);
});

test("preserva unicidad física en cuatro turnos e identidad por personal id", () => {
  assert.ok(cuenta(/where e\.mes = p_mes/gi) >= 2);
  assert.match(rpc, /persona ->> 'id'/);
  assert.doesNotMatch(rpc, /where[^;]+(nombre|funcionario)[^;]*=\s*v_persona_id/i);
  for (const codigo of ["PERSONA_NO_ENCONTRADA_EN_ORIGEN", "PERSONA_DUPLICADA_EN_ORIGEN", "PERSONA_YA_EXISTE_EN_DESTINO", "PERSONA_DUPLICADA_ENTRE_TURNOS", "PERSONA_CATEGORIA_INVALIDA"]) {
    assert.match(rpc, new RegExp(codigo));
  }
});

test("backend vigente habilita Enfermeros Noche y conserva la migración histórica", () => {
  assert.match(sqlHistorico, /MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO/);
  assert.doesNotMatch(rpc, /MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO/);
  assert.doesNotMatch(rpc, /v_categoria\s*=\s*'enfermero'[\s\S]{0,160}p_turno_(?:origen|destino)\s*=\s*'noche'[\s\S]{0,160}raise exception/i);
});

test("inspecciona explícitamente las tres estructuras de rotación nocturna", () => {
  assert.match(rpc, /rotacion3Dias' -> 'asignacionBase'/);
  assert.match(rpc, /rotacion3Dias' -> 'bloques'/);
  assert.match(rpc, /rotacion3Dias' -> 'coberturaLibreSM'/);
  assert.match(rpc, /REFERENCIA_LEGACY_OPERATIVA_PENDIENTE/);
  assert.match(rpc, /REFERENCIA_LEGACY_AMBIGUA/);
  assert.doesNotMatch(rpc, /jsonb_path_query|jsonb_each_recursive/i);
});

test("personaId o id moderno tiene prioridad absoluta sobre legacy", () => {
  assert.match(sql, /when private\.movimiento_padron_referencia_id\(p_referencia\) is not null then false/i);
  assert.match(sql, /coalesce\(p_referencia ->> 'personaId', p_referencia ->> 'id'/i);
});

test("Calendario local y legacy semanal conservan sus bloqueos", () => {
  for (const campo of ["cambiosDia", "cambiosParoDia", "noDisponibles", "asistenciaDia", "personaCoberturaId"]) {
    assert.match(rpc, new RegExp(campo));
  }
  assert.match(rpc, /REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES/);
  assert.match(rpc, /\^semana\[1-6\]\$/);
  assert.match(rpc, /asignacionesParciales/);
});

test("mueve el objeto completo, preserva orden y agrega al final", () => {
  assert.match(rpc, /select p\.persona\s+into strict v_persona/i);
  assert.match(rpc, /jsonb_agg\(p\.persona order by p\.ord\)/i);
  assert.match(rpc, /v_personal_destino[\s\S]+\|\| jsonb_build_array\(v_persona\)/i);
  assert.doesNotMatch(rpc, /jsonb_build_object\(\s*'id'[\s\S]+v_persona/i);
});

test("sólo realiza dos UPDATE de data.personal y usa triggers existentes", () => {
  const updates = [...rpc.matchAll(/update public\.estado_por_turno_mes[\s\S]+?returning \* into v_(?:origen|destino);/gi)];
  assert.equal(updates.length, 2);
  for (const [update] of updates) {
    assert.match(update, /jsonb_set\([^;]+\{personal\}/i);
    assert.match(update, /revision\s*=/i);
    assert.doesNotMatch(update, /planillas|calendario|licencias|certificaciones|configuracionPlanilla|extras/i);
  }
  assert.doesNotMatch(rpc, /historial_estado_turno_mes/i);
});

test("no escribe vigencias ni altera estructuras operativas", () => {
  assert.doesNotMatch(rpc, /(insert into|update|delete from)\s+public\.vigencias_turno_personal_mes/i);
  assert.equal(cuenta(/update public\.estado_por_turno_mes/gi), 2);
  assert.doesNotMatch(rpc, /limpiarReferenciasDePersona|PLANILLA_REFERENCIA_PERSONA/);
});

test("respuesta, errores y privilegios permanecen estables", () => {
  for (const clave of ["revisionOrigen", "revisionDestino", "estadoOrigen", "estadoDestino", "personaId", "turnoOrigen", "turnoDestino"]) assert.match(rpc, new RegExp(`'${clave}'`));
  for (const codigo of ["REVISION_ORIGEN_CONFLICTO", "REVISION_DESTINO_CONFLICTO", "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE", "REFERENCIA_LEGACY_AMBIGUA", "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES"]) assert.match(rpc, new RegExp(codigo));
  assert.match(sql, /revoke all on function public\.mover_persona_padron_base_turno_mes[\s\S]+from public/i);
  assert.match(sql, /from anon/i);
  assert.match(sql, /grant execute on function public\.mover_persona_padron_base_turno_mes[\s\S]+to authenticated/i);
});

test("postflight nocturno es read-only y verifica definición vigente", () => {
  assert.doesNotMatch(postflight, /\b(insert|update|delete|alter|drop|create)\s+/i);
  for (const control of ["firma_exacta", "security_definer", "search_path_vacio", "authenticated_execute", "anon_sin_execute", "public_sin_execute", "trigger_revision_enabled", "trigger_historial_enabled", "helper_supervision", "rls_habilitada", "definicion_rotacion_nocturna", "sin_bloqueo_diferido"]) assert.match(postflight, new RegExp(`'${control}'`));
  assert.match(postflight, /POSTFLIGHT_NOCHE_OK/);
});

test("funcional nocturno queda sintético, transaccional y sin residuos", () => {
  assert.match(funcional, /^\s*--[\s\S]*?\bbegin;/i);
  assert.match(funcional, /rollback;\s*$/i);
  assert.doesNotMatch(funcional, /\bcommit\s*;/i);
  assert.match(funcional, /fixture-noche-/i);
  for (const control of ["asignacionBase", "bloques", "coberturaLibreSM", "REVISION_ORIGEN_CONFLICTO", "PERSONA_DUPLICADA_ENTRE_TURNOS", "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES", "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE", "REFERENCIA_LEGACY_AMBIGUA", "vigencias_turno_personal_mes"]) assert.match(funcional, new RegExp(control));
  assert.doesNotMatch(funcional, /MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO/);
});
