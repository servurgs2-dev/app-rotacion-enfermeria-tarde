import assert from "node:assert/strict";
import fs from "node:fs";

const rutaNueva = "supabase/migrations/20260825162000_agregar_guardado_vigencias_turno_propio.sql";
const rutaOriginal = "supabase/migrations/20260825_crear_vigencias_turno_personal_mes.sql";
const sql = fs.readFileSync(rutaNueva, "utf8");
const original = fs.readFileSync(rutaOriginal, "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

probar("migracion nueva existe y es posterior", () => {
  assert.equal(fs.existsSync(rutaNueva), true);
  assert.ok("20260825162000" > "20260825");
});
probar("migracion original conserva RPC completo", () => assert.match(original,
  /create or replace function public\.guardar_vigencias_turno_personal_mes\(/));
probar("RPC parcial existe", () => assert.match(sql,
  /create or replace function public\.guardar_vigencias_turno_personal_mes_turno_propio\(/));
probar("RPC no recibe turno", () => assert.doesNotMatch(sql,
  /guardar_vigencias_turno_personal_mes_turno_propio\([\s\S]*?p_turno\s+text/));
probar("RPC recibe rangos", () => assert.match(sql, /p_rangos jsonb/));
probar("turno se obtiene en backend", () => assert.match(sql,
  /v_turno text := \(select private\.usuario_app_turno_licenciado\(\)\)/));
probar("helper exige licenciado activo", () => assert.match(sql,
  /p\.activo[\s\S]*p\.rol = 'licenciado'/));
probar("helper usa auth uid", () => assert.match(sql,
  /p\.user_id = \(select auth\.uid\(\)\)/));
probar("turnos backend cerrados", () => assert.match(sql,
  /p\.turno in \('noche', 'manana', 'tarde', 'vespertino'\)/));
probar("enfermeria y supervision quedan fuera del helper", () => {
  assert.doesNotMatch(sql, /p\.rol in \([^)]*'enfermeria'/);
  assert.doesNotMatch(sql, /p\.rol in \([^)]*'supervision'/);
});
probar("helper sin execute publico", () => assert.match(sql,
  /revoke all on function private\.usuario_app_turno_licenciado\(\)[\s\S]*from public, anon, authenticated/));
probar("RPC security definer", () => assert.match(sql,
  /guardar_vigencias_turno_personal_mes_turno_propio[\s\S]*security definer/));
probar("RPC search path seguro", () => assert.match(sql,
  /guardar_vigencias_turno_personal_mes_turno_propio[\s\S]*set search_path = ''/));
probar("fechas estrictas y reales", () => {
  assert.match(sql, /make_date\(/);
  assert.match(sql, /substring\(v_desde from 1 for 7\) <> p_mes/);
  assert.match(sql, /v_desde > v_hasta/);
});
probar("claves extra rechazadas", () => assert.match(sql,
  /jsonb_object_keys\(v_rango\)[\s\S]*clave not in \('desde', 'hasta'\)/));
probar("array vacio permitido como entrada", () => assert.doesNotMatch(sql,
  /jsonb_array_length\(p_rangos\) = 0/));
probar("resultado global vacio prohibido", () => assert.match(sql,
  /jsonb_array_length\(v_vigencias\) = 0[\s\S]*CONFIGURACION_EXPLICITA_VACIA_NO_PERMITIDA/));
probar("primera configuracion consulta turno fuente", () => assert.match(sql,
  /from public\.estado_por_turno_mes e[\s\S]*where e\.mes = p_mes/));
probar("identidad legacy usa personal id", () => assert.match(sql,
  /persona ->> 'id' = v_persona_id/));
probar("no compara nombre ni funcionario", () => {
  const bloqueLegacy = sql.match(/select count\(\*\)[\s\S]*?if v_apariciones = 0/)?.[0] ?? "";
  assert.doesNotMatch(bloqueLegacy, /nombre|funcionario|hash/i);
});
probar("persona no identificable rechazada", () => assert.match(sql,
  /PERSONA_LEGACY_NO_IDENTIFICABLE/));
probar("duplicado legacy rechazado", () => assert.match(sql,
  /PERSONA_DUPLICADA_ENTRE_TURNOS/));
probar("otro turno fuente rechazado", () => assert.match(sql,
  /v_turno_fuente is distinct from v_turno[\s\S]*CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE/));
probar("mismo turno fuente construye rango backend", () => assert.match(sql,
  /jsonb_build_object\([\s\S]*'turno', v_turno,[\s\S]*'desde', rango ->> 'desde'/));
probar("merge retira solo turno propio", () => assert.match(sql,
  /where rango ->> 'turno' is distinct from v_turno[\s\S]*union all/));
probar("merge preserva rangos ajenos", () => assert.match(sql,
  /from jsonb_array_elements\(v_fila\.vigencias\) as rango[\s\S]*where rango ->> 'turno' is distinct from v_turno/));
probar("orden canonico determinista", () => assert.match(sql,
  /jsonb_agg\(rango order by desde, hasta, turno\)/));
probar("validacion global reutilizada", () => assert.match(sql,
  /private\.vigencias_turno_personal_mes_validas\(p_mes, v_vigencias\)/));
probar("CAS create usa PK", () => assert.match(sql,
  /on conflict \(mes, persona_id\) do nothing/));
probar("CAS create contempla eliminacion concurrente", () => assert.match(sql,
  /if not found then[\s\S]*select \* into v_fila[\s\S]*if found then[\s\S]*'existe', true[\s\S]*'existe', false/));
probar("expected cero prioriza conflicto existente", () => assert.match(sql,
  /if p_revision_esperada = 0 then[\s\S]*for update;[\s\S]*if found then[\s\S]*REVISION_CONFLICTO/));
probar("CAS update bloquea fila", () => assert.equal(
  (sql.match(/for update;/g) || []).length >= 2,
  true
));
probar("CAS update compara revision", () => assert.match(sql,
  /v_fila\.revision is distinct from p_revision_esperada/));
probar("respuesta conflicto compatible", () => assert.match(sql,
  /'resultado', 'conflicto',[\s\S]*'codigo', 'REVISION_CONFLICTO'/));
probar("historico protegido en Montevideo", () => assert.match(sql,
  /America\/Montevideo[\s\S]*MES_HISTORICO_PROTEGIDO/));
probar("trigger actualizado", () => assert.match(sql,
  /create or replace function private\.preparar_vigencias_turno_personal_mes\(\)/));
probar("trigger INSERT licenciado solo propio", () => assert.match(sql,
  /tg_op = 'INSERT'[\s\S]*rango ->> 'turno' is distinct from v_turno_licenciado[\s\S]*RANGOS_AJENOS_NO_MODIFICABLES/));
probar("trigger UPDATE canoniza rangos ajenos", () => assert.equal(
  (sql.match(/jsonb_agg\(rango order by rango ->> 'desde', rango ->> 'hasta', rango ->> 'turno'\)/g) || []).length,
  2
));
probar("trigger compara rangos ajenos", () => assert.match(sql,
  /v_ajenas_nuevas is distinct from v_ajenas_anteriores[\s\S]*RANGOS_AJENOS_NO_MODIFICABLES/));
probar("trigger conserva revision old mas uno", () => assert.match(sql,
  /new\.revision is distinct from old\.revision \+ 1/));
probar("trigger conserva PK", () => assert.match(sql,
  /new\.mes is distinct from old\.mes[\s\S]*new\.persona_id is distinct from old\.persona_id/));
probar("escritura directa no se concede", () => assert.doesNotMatch(sql,
  /grant\s+(insert|update|delete)/i));
probar("historial existente no se reemplaza", () => assert.doesNotMatch(sql,
  /create or replace function private\.registrar_historial_vigencias/));
probar("RPC parcial no elimina fila", () => assert.doesNotMatch(sql,
  /delete from public\.vigencias_turno_personal_mes/));
probar("anon y public sin execute", () => assert.match(sql,
  /revoke all on function public\.guardar_vigencias_turno_personal_mes_turno_propio[\s\S]*from public, anon, authenticated/));
probar("authenticated obtiene execute", () => assert.match(sql,
  /grant execute on function public\.guardar_vigencias_turno_personal_mes_turno_propio[\s\S]*to authenticated/));
probar("migracion transaccional", () => {
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;\s*$/);
});
probar("sin integracion React o UI", () => {
  assert.doesNotMatch(sql, /React|ListaPersonal|repositorioVigenciasTurnoPersonal/);
  const archivos = [
    "src/App.jsx",
    "src/components/personal/ListaPersonal.jsx",
    "src/components/personal/EstadoVigenciasTurnoPersona.jsx",
    "src/components/planilla/PlanillaMensual.jsx",
    "src/components/calendario/CalendarioDiario.jsx",
    "src/components/supervision/VistaSupervision.jsx"
  ];
  archivos.filter((archivo) => fs.existsSync(archivo)).forEach((archivo) => assert.doesNotMatch(
    fs.readFileSync(archivo, "utf8"),
    /guardar_vigencias_turno_personal_mes_turno_propio/
  ));
});
probar("script registrado", () => assert.equal(
  packageJson.scripts["test:vigencias-turno-propio-sql"],
  "node tests/vigencias-turno-propio-sql.test.mjs"
));

console.log(`Vigencias de turno propio SQL: ${total}/${total} comprobaciones OK.`);
