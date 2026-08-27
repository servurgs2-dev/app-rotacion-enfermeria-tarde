import assert from "node:assert/strict";
import fs from "node:fs";

const ruta = "supabase/migrations/20260825_crear_vigencias_turno_personal_mes.sql";
const sql = fs.readFileSync(ruta, "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const productivos = [
  "src/App.jsx",
  "src/components/personal/ListaPersonal.jsx",
  "src/components/planilla/PlanillaMensual.jsx",
  "src/components/calendario/CalendarioDiario.jsx",
  "src/components/supervision/VistaSupervision.jsx",
  "src/utils/preparacionMesNuevo.js"
];
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

probar("tabla principal transversal", () => assert.match(sql,
  /create table if not exists public\.vigencias_turno_personal_mes/));
probar("PK mes y persona", () => assert.match(sql,
  /constraint vigencias_turno_personal_mes_pkey primary key \(mes, persona_id\)/));
probar("personaId y mes no se repiten dentro del JSON", () => assert.match(sql,
  /where clave not in \('turno', 'desde', 'hasta'\)/));
probar("JSON debe ser array", () => assert.match(sql,
  /jsonb_typeof\(p_vigencias\) <> 'array'/));
probar("JSON no puede estar vacío", () => assert.match(sql,
  /jsonb_array_length\(p_vigencias\) = 0/));
probar("cada rango debe ser objeto", () => assert.match(sql,
  /jsonb_typeof\(v_rango\) <> 'object'/));
probar("claves turno desde hasta obligatorias", () => {
  for (const clave of ["turno", "desde", "hasta"]) {
    assert.match(sql, new RegExp(`not \\(v_rango \\? '${clave}'\\)`));
  }
});
probar("claves arbitrarias rechazadas", () => assert.match(sql,
  /jsonb_object_keys\(v_rango\)[\s\S]*clave not in \('turno', 'desde', 'hasta'\)/));
probar("turnos válidos", () => assert.match(sql,
  /'noche', 'manana', 'tarde', 'vespertino'/));
probar("fechas son strings", () => assert.match(sql,
  /jsonb_typeof\(v_rango -> 'desde'\) <> 'string'[\s\S]*jsonb_typeof\(v_rango -> 'hasta'\) <> 'string'/));
probar("fechas reales usan make_date", () => assert.equal(
  (sql.match(/make_date\(/g) || []).length >= 2,
  true
));
probar("fechas deben pertenecer al mes", () => assert.match(sql,
  /substring\(v_desde from 1 for 7\) <> p_mes[\s\S]*substring\(v_hasta from 1 for 7\) <> p_mes/));
probar("desde no supera hasta", () => assert.match(sql, /v_desde > v_hasta/));
probar("validador central privado", () => assert.match(sql,
  /private\.vigencias_turno_personal_mes_validas\(\s*p_mes text,\s*p_vigencias jsonb/));
probar("validador reutilizado por CHECK", () => assert.match(sql,
  /check \(private\.vigencias_turno_personal_mes_validas\(mes, vigencias\)\)/));
probar("validador SECURITY INVOKER", () => assert.match(sql,
  /vigencias_turno_personal_mes_validas[\s\S]*security invoker[\s\S]*set search_path = ''/));
probar("solapamiento se compara entre pares", () => assert.match(sql,
  /with ordinality as izquierda[\s\S]*with ordinality as derecha[\s\S]*izquierda\.posicion < derecha\.posicion/));
probar("solapamiento usa intersección inclusiva", () => assert.match(sql,
  /izquierda\.rango ->> 'desde'\)::date <= \(derecha\.rango ->> 'hasta'\)::date[\s\S]*derecha\.rango ->> 'desde'\)::date <= \(izquierda\.rango ->> 'hasta'\)::date/));
probar("rangos contiguos no se rechazan como solapados", () => assert.doesNotMatch(sql,
  /izquierda\.rango ->> 'hasta'\)::date \+ 1/));
probar("persona_id trim no vacío", () => assert.match(sql, /check \(btrim\(persona_id\) <> ''\)/));
probar("mes válido y año no cero", () => assert.match(sql,
  /substring\(mes from 1 for 4\)::integer between 1 and 9999/));
probar("revision inicia en uno", () => assert.match(sql, /revision bigint not null default 1/));
probar("revision positiva", () => assert.match(sql, /check \(revision >= 1\)/));
probar("trigger controla revisión", () => assert.match(sql,
  /new\.revision is distinct from old\.revision \+ 1/));
probar("RPC guardar existe", () => assert.match(sql,
  /create or replace function public\.guardar_vigencias_turno_personal_mes/));
probar("crear exige expected cero", () => assert.match(sql,
  /if p_revision_esperada = 0 then[\s\S]*on conflict \(mes, persona_id\) do nothing/));
probar("actualización usa CAS", () => assert.match(sql,
  /revision = revision \+ 1[\s\S]*and revision = p_revision_esperada/));
probar("conflicto estable", () => assert.match(sql, /'codigo', 'REVISION_CONFLICTO'/));
probar("respuesta devuelve estado persistido", () => assert.match(sql,
  /'revision', v_fila\.revision::text[\s\S]*'vigencias', v_fila\.vigencias/));
probar("RPC eliminar existe", () => assert.match(sql,
  /create or replace function public\.eliminar_vigencias_turno_personal_mes/));
probar("eliminar exige revisión existente", () => assert.match(sql,
  /p_revision_esperada is null or p_revision_esperada < 1/));
probar("eliminación usa CAS", () => assert.match(sql,
  /delete from public\.vigencias_turno_personal_mes[\s\S]*and revision = p_revision_esperada[\s\S]*returning \* into v_fila/));
probar("eliminación física vuelve a ausencia canónica", () => assert.doesNotMatch(sql,
  /set\s+vigencias\s*=\s*'\[\]'/));
probar("historial existe", () => assert.match(sql,
  /create table if not exists public\.historial_vigencias_turno_personal_mes/));
probar("historial usa evento independiente", () => assert.match(sql,
  /id bigint generated always as identity primary key/));
probar("historial registra tres acciones", () => assert.match(sql,
  /accion in \('INSERT', 'UPDATE', 'DELETE'\)/));
probar("trigger historial incluye DELETE", () => assert.match(sql,
  /after insert or update or delete on public\.vigencias_turno_personal_mes/));
probar("DELETE conserva OLD", () => assert.match(sql,
  /if tg_op = 'DELETE' then\s+v_fila := old/));
probar("historial usa actor backend", () => assert.match(sql,
  /v_actor uuid := \(select auth\.uid\(\)\)[\s\S]*cambiado_por[\s\S]*v_actor/));
probar("operación e historial son transaccionales", () => assert.match(sql,
  /^begin;[\s\S]*commit;\s*$/));
probar("RLS habilitada en ambas tablas", () => assert.equal(
  (sql.match(/enable row level security/g) || []).length,
  2
));
probar("lectura principal para perfiles activos", () => assert.match(sql,
  /perfiles_activos_select_vigencias_turno_personal_mes[\s\S]*private\.usuario_app_activo\(\)/));
probar("historial sólo Supervisión", () => assert.match(sql,
  /supervision_select_historial_vigencias_turno_personal_mes[\s\S]*private\.usuario_app_es_supervision\(\)/));
probar("escritura directa revocada", () => assert.match(sql,
  /revoke all privileges on table public\.vigencias_turno_personal_mes[\s\S]*from public, anon, authenticated/));
probar("authenticated sólo recibe SELECT de tabla", () => {
  assert.match(sql, /grant select on table public\.vigencias_turno_personal_mes to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete) on table/);
});
probar("anon no recibe privilegios", () => assert.doesNotMatch(sql, /grant [^;]+ to anon/));
probar("guardar sólo Supervisión", () => assert.match(sql,
  /guardar_vigencias_turno_personal_mes[\s\S]*not \(select private\.usuario_app_es_supervision\(\)\)/));
probar("eliminar sólo Supervisión", () => assert.match(sql,
  /eliminar_vigencias_turno_personal_mes[\s\S]*not \(select private\.usuario_app_es_supervision\(\)\)/));
probar("RPCs derivan actor de auth.uid", () => assert.equal(
  (sql.match(/v_actor uuid := \(select auth\.uid\(\)\)/g) || []).length >= 3,
  true
));
probar("mes histórico protegido en ambos RPC", () => assert.equal(
  (sql.match(/MES_HISTORICO_PROTEGIDO/g) || []).length,
  2
));
probar("zona horaria Montevideo en ambos RPC", () => assert.equal(
  (sql.match(/America\/Montevideo/g) || []).length,
  2
));
probar("RPCs SECURITY DEFINER", () => assert.equal(
  (sql.match(/language plpgsql\s+security definer\s+set search_path = ''/g) || []).length >= 4,
  true
));
probar("ejecución pública revocada", () => {
  assert.match(sql, /revoke all on function public\.guardar_vigencias_turno_personal_mes[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.eliminar_vigencias_turno_personal_mes[\s\S]*from public, anon, authenticated/);
});
probar("authenticated ejecuta únicamente RPCs públicas", () => {
  assert.match(sql, /grant execute on function public\.guardar_vigencias_turno_personal_mes/);
  assert.match(sql, /grant execute on function public\.eliminar_vigencias_turno_personal_mes/);
  assert.doesNotMatch(sql, /grant execute on function private\./);
});
probar("no crea padrón global Personas", () => assert.doesNotMatch(sql,
  /create table(?: if not exists)? public\.(personas|personal)(?:\s|\()/i));
probar("no permite vigencias vacías persistidas", () => assert.match(sql,
  /jsonb_array_length\(p_vigencias\) = 0/));
probar("sin integración React o productiva", () => {
  productivos.forEach((archivo) => {
    assert.doesNotMatch(fs.readFileSync(archivo, "utf8"), /vigencias_turno_personal_mes|guardar_vigencias_turno_personal_mes/);
  });
  assert.doesNotMatch(sql, /React|src\/components|src\/hooks/);
});
probar("script registrado", () => assert.equal(
  packageJson.scripts["test:vigencias-turno-personal-sql"],
  "node tests/vigencias-turno-personal-sql.test.mjs"
));

console.log(`Vigencias de turno SQL: ${total}/${total} comprobaciones OK.`);
