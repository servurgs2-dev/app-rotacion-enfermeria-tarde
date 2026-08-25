import assert from "node:assert/strict";
import fs from "node:fs";
import {
  esPerfilSupervision,
  esSoloLectura,
  puedeEditarTurno,
  puedeLeerAplicacion
} from "../src/utils/permisos.js";

const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const perfilesSql = leer("supabase/migrations/20260720_crear_perfiles_usuario.sql");
const estadosSql = leer("supabase/migrations/20260721_proteger_estados_por_roles.sql");
const novedadesSql = leer("supabase/migrations/20260816_crear_novedades_personal.sql");
const configuracionSql = leer("supabase/migrations/20260820_crear_configuracion_dotacion_supervision_mes.sql");
const app = leer("src/App.jsx");
const selector = leer("src/components/turnos/SelectorTurno.jsx");
const packageJson = JSON.parse(leer("package.json"));

const supervision = { usuario: "supervisor", rol: "supervision", turno: null, activo: true };
const licenciado = { usuario: "licenciado.tarde", rol: "licenciado", turno: "tarde", activo: true };
const enfermeria = { usuario: "enfermeria", rol: "enfermeria", turno: null, activo: true };
const inactivo = { ...licenciado, activo: false };
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

probar("perfiles admiten los tres roles", () =>
  assert.match(perfilesSql, /rol in \('supervision', 'licenciado', 'enfermeria'\)/));
probar("Licenciado requiere turno", () =>
  assert.match(perfilesSql, /rol = 'licenciado' and turno in \('noche', 'manana', 'tarde', 'vespertino'\)/));
probar("Supervisión y Enfermería no tienen turno", () =>
  assert.match(perfilesSql, /rol in \('supervision', 'enfermeria'\) and turno is null/));
probar("perfil activo puede leer la aplicación", () => assert.equal(puedeLeerAplicacion(licenciado), true));
probar("perfil inactivo no puede leer la aplicación", () => assert.equal(puedeLeerAplicacion(inactivo), false));

probar("Supervisión edita Noche", () => assert.equal(puedeEditarTurno(supervision, "noche"), true));
probar("Supervisión edita Vespertino", () => assert.equal(puedeEditarTurno(supervision, "vespertino"), true));
probar("Licenciado edita su turno", () => assert.equal(puedeEditarTurno(licenciado, "tarde"), true));
probar("Licenciado no edita turno ajeno", () => assert.equal(puedeEditarTurno(licenciado, "noche"), false));
probar("Licenciado ve turno ajeno en solo lectura", () => assert.equal(esSoloLectura(licenciado, "noche"), true));
probar("Enfermería no edita ningún turno", () => {
  for (const turno of ["noche", "manana", "tarde", "vespertino"]) {
    assert.equal(puedeEditarTurno(enfermeria, turno), false);
    assert.equal(esSoloLectura(enfermeria, turno), true);
  }
});
probar("inactivo no edita", () => assert.equal(puedeEditarTurno(inactivo, "tarde"), false));
probar("sólo Supervisión abre Panel", () => {
  assert.equal(esPerfilSupervision(supervision), true);
  assert.equal(esPerfilSupervision(licenciado), false);
  assert.equal(esPerfilSupervision(enfermeria), false);
});

probar("estado SELECT es transversal para perfil activo", () =>
  assert.match(estadosSql, /roles_select_estado_por_turno_mes[\s\S]*using \(\(select private\.usuario_app_activo\(\)\)\)/));
probar("estado INSERT exige permiso de edición del turno", () =>
  assert.match(estadosSql, /roles_insert_estado_por_turno_mes[\s\S]*usuario_app_puede_editar_turno\(turno\)/));
probar("estado UPDATE exige permiso de edición al leer y escribir", () =>
  assert.match(estadosSql, /roles_update_estado_por_turno_mes[\s\S]*using \(\(select private\.usuario_app_puede_editar_turno\(turno\)\)\)[\s\S]*with check \(\(select private\.usuario_app_puede_editar_turno\(turno\)\)\)/));
probar("estado DELETE exige permiso de edición", () =>
  assert.match(estadosSql, /roles_delete_estado_por_turno_mes[\s\S]*usuario_app_puede_editar_turno\(turno\)/));
probar("estado anon no tiene privilegios", () =>
  assert.match(estadosSql, /revoke all privileges on table public\.estado_por_turno_mes from anon/));

probar("Novedades SELECT es transversal para perfil activo", () =>
  assert.match(novedadesSql, /novedades_personal_select[\s\S]*using \(\(select private\.usuario_app_activo\(\)\)\)/));
probar("Novedades INSERT exige permiso del turno", () =>
  assert.match(novedadesSql, /novedades_personal_insert[\s\S]*usuario_app_puede_editar_turno\(turno\)/));
probar("Novedades UPDATE exige permiso al leer y escribir", () =>
  assert.match(novedadesSql, /novedades_personal_update[\s\S]*using \(\(select private\.usuario_app_puede_editar_turno\(turno\)\)\)[\s\S]*with check \(\(select private\.usuario_app_puede_editar_turno\(turno\)\)\)/));
probar("Novedades DELETE exige permiso del turno", () =>
  assert.match(novedadesSql, /novedades_personal_delete[\s\S]*usuario_app_puede_editar_turno\(turno\)/));
probar("Novedades anon no tiene privilegios", () =>
  assert.match(novedadesSql, /revoke all privileges on table public\.novedades_personal from anon/));

probar("helper activo rechaza perfil inexistente o inactivo", () =>
  assert.match(perfilesSql, /select coalesce\(\(select p\.activo[\s\S]*auth\.uid\(\)\)\), false\)/));
probar("helper de edición expresa Supervisión o Licenciado propio", () =>
  assert.match(perfilesSql, /p\.rol = 'supervision' or \(p\.rol = 'licenciado' and p\.turno = turno_consultado\)/));
probar("no existe helper redundante de lectura por turno", () =>
  assert.doesNotMatch(perfilesSql, /usuario_app_puede_leer_turno/));

probar("configuración SELECT es exclusiva de Supervisión", () =>
  assert.match(configuracionSql, /supervision_select_configuracion_dotacion_supervision_mes[\s\S]*usuario_app_es_supervision/));
probar("historial de configuración es exclusivo de Supervisión", () =>
  assert.match(configuracionSql, /supervision_select_historial_configuracion_dotacion_supervision_mes[\s\S]*usuario_app_es_supervision/));
probar("configuración no permite escritura directa authenticated", () =>
  assert.match(configuracionSql, /revoke all privileges on table public\.configuracion_dotacion_supervision_mes[\s\S]*from public, anon, authenticated/));
probar("RPC de configuración exige Supervisión", () =>
  assert.match(configuracionSql, /if v_actor is null or not \(select private\.usuario_app_es_supervision\(\)\)/));

probar("selector conserva los cuatro turnos para roles lectores", () =>
  assert.match(selector, /ORDEN_TURNOS\.map\(\(turnoId\) => turnos\[turnoId\]\)/));
probar("App calcula modo solo lectura por perfil y turno", () =>
  assert.match(app, /const modoSoloLectura = esSoloLectura\(perfil, turnoActivo\)/));
probar("App protege guardado con permiso de turno", () =>
  assert.match(app, /if \(!data \|\| !puedeEditarTurno\(perfil, turnoId\)\)/));
probar("Panel sólo se muestra a Supervisión", () =>
  assert.match(app, /mostrarSupervision=\{esPerfilSupervision\(perfil\)\}/));
probar("Panel sólo se monta para Supervisión", () =>
  assert.match(app, /vistaInicial === "supervision" && esPerfilSupervision\(perfil\)/));
probar("suite contractual registrada", () =>
  assert.equal(packageJson.scripts["test:permisos-roles-turnos"], "node tests/permisos-roles-turnos.test.mjs"));

console.log(`Permisos por rol y turno: ${total}/${total} comprobaciones OK.`);
