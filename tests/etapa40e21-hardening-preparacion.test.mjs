import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import {
  analizarActividadDesdeFechaPreparacion,
  prepararAplicacionTransicionPreparaciones
} from "../src/utils/transicionPreparacionesMes.js";
import { validarCategoriasBorradorNuevaPreparacion } from "../src/utils/gestionPreparacionesMes.js";
import { resolverOrganizacionMesPorFecha, resolverTramosPlanillaMes } from "../src/utils/preparacionesMes.js";
import { obtenerDocumentoPlanillaPDF } from "../src/utils/exportPDF.js";
import { ejecutarTransicionPreparacionMes } from "../src/services/transicionPreparacionMes.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const mes = "2026-09";
const hoy = "2026-09-13";
const perfil = { usuario: "supervisor", rol: "supervision", activo: true };
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const estadoLegacy = (turno = "tarde") => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [
    { id: "e1", nombre: "Enfermera", categoria: "enfermero" },
    { id: "l1", nombre: "Licenciada", categoria: "licenciado" }
  ];
  const planilla = (personaId) => ({
    semana1: { "REA 1": { personaId } }, semana2: { "REA 1": { personaId } },
    semana3: { "REA 1": { personaId } }, semana4: { "REA 1": { personaId } },
    semana5: { "REA 1": { personaId } }, semana6: {}, coberturaLibreSM: {}
  });
  estado.planillas = { enfermeros: planilla("e1"), licenciados: planilla("l1") };
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({ turno, categoria: "enfermero", mes }),
    licenciado: crearSnapshotConfiguracionPlanilla({ turno, categoria: "licenciado", mes })
  };
  return estado;
};
const padron = (turno) => ({ porPersonaId: { e1: { personaId: "e1", vigencias: [{ desde: "2026-09-01", hasta: "2026-09-30", turno }] } } });
const novedad = (cambios = {}) => ({
  id: "nov-1", personaId: "e1", turno: "tarde", estado: "activa",
  fechaDesde: hoy, fechaHasta: hoy, ...cambios
});
const actividad = (cambios = {}) => analizarActividadDesdeFechaPreparacion({
  estado: estadoLegacy(), mes, desde: hoy, fechaReferencia: hoy,
  turno: "tarde", padronVigencias: padron("tarde"), novedadesExternas: [novedad()], ...cambios
});
const preparar = (cambios = {}) => prepararAplicacionTransicionPreparaciones({
  estado: estadoLegacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy,
  novedadesExternas: [], padronVigencias: padron("tarde"), perfil,
  revisionEsperada: "3", revisionActual: "3", ...cambios
});

await probar("Tarde con novedad efectiva de Tarde bloquea", () => assert.equal(actividad().actividadDetectada, true));
await probar("Tarde con novedad efectiva de Noche no bloquea", () => assert.equal(actividad({ padronVigencias: padron("noche") }).actividadDetectada, false));
await probar("turno original distinto y vigencia Tarde bloquea Tarde", () => assert.equal(actividad({ novedadesExternas: [novedad({ turno: "noche" })] }).actividadDetectada, true));
await probar("turno original Tarde y vigencia Noche no bloquea Tarde", () => assert.equal(actividad({ padronVigencias: padron("noche") }).actividadDetectada, false));
await probar("novedad cancelada no bloquea", () => assert.equal(actividad({ novedadesExternas: [novedad({ estado: "cancelada" })] }).actividadDetectada, false));
await probar("novedad inactiva no bloquea", () => assert.equal(actividad({ novedadesExternas: [novedad({ estado: "resuelta" })] }).actividadDetectada, false));
await probar("novedad futura programada conserva contrato", () => assert.equal(actividad({ novedadesExternas: [novedad({ fechaDesde: "2026-09-20", fechaHasta: "2026-09-20" })] }).actividadDetectada, false));
await probar("Licencia y Certificación futura no se copian a B", () => {
  const resultado = preparar({ novedadesExternas: [novedad({ tipo: "licencia", fechaDesde: "2026-09-20", fechaHasta: "2026-09-22" }), novedad({ id: "cert", tipo: "certificacion", fechaDesde: "2026-09-24", fechaHasta: "2026-09-24" })] });
  assert.equal(resultado.ok, true);
  assert.equal(Object.hasOwn(resultado.preparacionNueva.categorias.enfermero, "licencias"), false);
  assert.equal(Object.hasOwn(resultado.preparacionNueva.categorias.licenciado, "certificaciones"), false);
});
await probar("preflight productivo usa atribución efectiva", () => assert.equal(preparar({ novedadesExternas: [novedad()], padronVigencias: padron("noche") }).ok, true));

const preview = preparar();
await probar("B inicial sigue siendo clon de A", () => assert.deepEqual(preview.preparaciones[1].categorias, preview.preparaciones[0].categorias));
await probar("editar prioridad B no modifica A", () => {
  const b = clonar(preview.preparacionNueva.categorias);
  b.enfermero.configuracion.prioridadCoberturaSectorIds.reverse();
  assert.notDeepEqual(b.enfermero.configuracion.prioridadCoberturaSectorIds, preview.preparaciones[0].categorias.enfermero.configuracion.prioridadCoberturaSectorIds);
});
await probar("prioridad es config-only y valida con Planilla clonada", () => {
  const b = clonar(preview.preparacionNueva.categorias);
  b.enfermero.configuracion.prioridadCoberturaSectorIds.reverse();
  assert.equal(validarCategoriasBorradorNuevaPreparacion({ categorias: b, categoriasBase: preview.preparacionNueva.categorias, personal: estadoLegacy().personal, turno: "tarde", mes }).ok, true);
});
await probar("filas y sectores se reconcilian antes de persistir", () => {
  const b = clonar(preview.preparacionNueva.categorias);
  const orden = b.enfermero.configuracion.filas[0].orden;
  b.enfermero.configuracion.filas[0].orden = b.enfermero.configuracion.filas[1].orden;
  b.enfermero.configuracion.filas[1].orden = orden;
  assert.equal(validarCategoriasBorradorNuevaPreparacion({ categorias: b, categoriasBase: preview.preparacionNueva.categorias, personal: estadoLegacy().personal, turno: "tarde", mes }).ok, true);
});
await probar("Turnantes T6/T3 no pueden divergir de Planilla B", () => {
  const b = clonar(preview.preparacionNueva.categorias);
  b.enfermero.planilla.posicionesMensualesAdicionales = ["T6"];
  assert.equal(validarCategoriasBorradorNuevaPreparacion({ categorias: b, categoriasBase: preview.preparacionNueva.categorias, personal: estadoLegacy().personal, turno: "tarde", mes }).ok, false);
});
await probar("A y su Planilla quedan intactas al editar B", () => assert.deepEqual(preview.preparaciones[0].categorias.enfermero.planilla, estadoLegacy().planillas.enfermeros));
await probar("Calendario anterior conserva A", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: preview.estado, mes, fecha: "2026-09-12" }).preparacionId, preview.preparaciones[0].id));
await probar("Calendario desde corte consume B", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: preview.estado, mes, fecha: hoy }).preparacionId, preview.preparaciones[1].id));
await probar("Planilla por tramos consume B", () => assert.equal(new Set(resolverTramosPlanillaMes({ estado: preview.estado, mes, turno: "tarde", categoria: "enfermero" }).tramos.map((tramo) => tramo.preparacionId)).size, 2));
await probar("PDF consume B versionada", () => assert.equal(obtenerDocumentoPlanillaPDF({ estadoMensual: preview.estado, turnoId: "tarde", mesActivo: mes, personal: preview.estado.personal }).tipoDocumento, "planilla_mensual_versionada"));
await probar("confirmación continúa siendo una escritura CAS", async () => {
  let escrituras = 0;
  const resultado = await ejecutarTransicionPreparacionMes({ estado: estadoLegacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, novedadesExternas: [], padronVigencias: padron("tarde"), perfil, revisionEsperada: "3", revisionActual: "3", guardar: async () => { escrituras += 1; return { tipo: "guardado", revision: "4" }; } });
  assert.equal(resultado.aplicado, true); assert.equal(escrituras, 1);
});
await probar("Noche conserva fechaBase", () => {
  const estado = estadoLegacy("noche");
  estado.planillas.enfermeros.rotacion3Dias = { fechaBase: "2026-07-02", duracionDias: 3, asignacionBase: {}, bloques: {}, coberturaLibreSM: {} };
  assert.equal(preparar({ estado, turno: "noche" }).preparacionNueva.categorias.enfermero.planilla.rotacion3Dias.fechaBase, "2026-07-02");
});
const panel = await readFile(new URL("../src/components/mes/PanelNuevaPreparacionMes.jsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
await probar("estructura se edita sin trasladar T6/T4 a Gestión", () => { assert.match(panel, /<ConfiguracionPlanilla/); assert.match(panel, /ocultarTurnanteMensual/); });
await probar("fijas y prioridades permanecen editables", () => { assert.match(panel, /<PrioridadCoberturaMes/); assert.match(panel, /<AsignacionesFijasMes/); });
await probar("cancelar sigue descartando sin persistir", () => assert.match(app, /onCancelar=\{\(\) => setNuevaPreparacionMes\(null\)\}/));
await probar("preflight inicial y final propagan padrón", () => assert.equal((app.match(/padronVigencias: vigenciasPersonal\.padron/g) || []).length >= 2, true));
await probar("referencia previa al estado evita doble autosave", () => assert.match(app, /referenciasEstadoRef\.current\.set\(flujo\.clave, resultado\.estado\);[\s\S]*setEstadoPorTurnoMes/));

console.log(`\n${total} comprobaciones de Etapa 40E.2.1 superadas.`);
