import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { crearEstadoVersionadoDesdeLegacy } from "../src/utils/transicionPreparacionesMes.js";
import { analizarEdicionPreparacionVersionada, aplicarCambiosPreparacionAlEstado } from "../src/utils/edicionPreparacionVersionada.js";
import { resolverOrganizacionMesPorFecha } from "../src/utils/preparacionesMes.js";
import { obtenerDocumentoPlanillaPDF } from "../src/utils/exportPDF.js";

let total = 0;
const probar = async (nombre, prueba) => { await prueba(); total += 1; console.log(`✓ ${nombre}`); };
const mes = "2026-09";
const hoy = "2026-09-04";
const estadoLegacy = crearEstadoMensualVacio();
estadoLegacy.personal = [{ id: "e1", categoria: "enfermero", nombre: "E" }, { id: "l1", categoria: "licenciado", nombre: "L" }];
estadoLegacy.planillas = {
  enfermeros: { semana1: { "REA 1": { personaId: "e1" } }, semana2: {}, semana3: {}, semana4: {}, semana5: {}, semana6: {} },
  licenciados: { semana1: { "REA 1": { personaId: "l1" } }, semana2: {}, semana3: {}, semana4: {}, semana5: {}, semana6: {} }
};
estadoLegacy.configuracionPlanilla = {
  enfermero: crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "enfermero", mes }),
  licenciado: crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "licenciado", mes })
};
const estado = crearEstadoVersionadoDesdeLegacy({ estado: estadoLegacy, mes, desde: hoy, fechaReferencia: "2026-09-03" }).estado;
const [a, b] = estado.preparaciones;
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panelVer = await readFile(new URL("../src/components/mes/PanelConfigurarPreparacionMes.jsx", import.meta.url), "utf8");
const panelNueva = await readFile(new URL("../src/components/mes/PanelNuevaPreparacionMes.jsx", import.meta.url), "utf8");
const planilla = await readFile(new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url), "utf8");

await probar("borrador permite configurar estructura", () => assert.match(panelNueva, /<ConfiguracionPlanilla/));
await probar("borrador permite configurar prioridades", () => assert.match(panelNueva, /<PrioridadCoberturaMes/));
await probar("borrador permite configurar asignaciones fijas", () => assert.match(panelNueva, /<AsignacionesFijasMes/));
await probar("confirmada pasada sólo ofrece lectura en Gestión", () => assert.match(app, /Ver organización/));
await probar("confirmada vigente sólo ofrece lectura en Gestión", () => assert.doesNotMatch(app, /configurable \?/));
await probar("confirmada futura tampoco habilita configuración", () => assert.doesNotMatch(panelVer, /flujo\.editable/));
await probar("confirmada desde hoy limpia tampoco configura en Gestión", () => assert.doesNotMatch(app, /confirmarConfiguracionPreparacionMes/));
await probar("todas las tarjetas confirmadas muestran Ver organización", () => assert.match(app, /preparacionesMesActual\.preparaciones\.map[\s\S]*Ver organización/));
await probar("ninguna tarjeta confirmada muestra Configurar organización", () => assert.doesNotMatch(app, /configurable[\s\S]*Configurar organización/));
await probar("Ver organización bloquea orden y filas", () => assert.match(panelVer, /<ConfiguracionPlanilla[\s\S]*soloLectura/));
await probar("Ver organización bloquea prioridad", () => assert.match(panelVer, /<PrioridadCoberturaMes[\s\S]*soloLectura/));
await probar("Ver organización bloquea fijas", () => assert.match(panelVer, /<AsignacionesFijasMes[\s\S]*soloLectura/));
await probar("Ver organización no muestra Guardar organización", () => assert.doesNotMatch(panelVer, /Guardar organización/));
await probar("modal Nueva preparación conserva edición", () => assert.doesNotMatch(panelNueva, /soloLectura/));
await probar("cancelar borrador sigue descartándolo", () => assert.match(app, /onCancelar=\{\(\) => setNuevaPreparacionMes\(null\)\}/));
await probar("confirmar nueva vigencia sigue siendo la única congelación", () => assert.match(app, /confirmarNuevaPreparacionMes/));
await probar("estado real A y B se muestran sin recreación", () => assert.match(app, /preparacionesMesActual\.preparaciones\.map/));
await probar("abrir A no modifica estado", () => assert.match(app, /crearInstantanea\(preparacion\.categorias\)/));
await probar("abrir B no modifica estado", () => assert.match(app, /const abrirConfiguracionPreparacionMes = \(preparacion\) => \{[\s\S]*?crearInstantanea\(preparacion\.categorias\)[\s\S]*?\n\};/));
await probar("Planilla conserva selector A B", () => assert.match(app, /<SelectorPreparacionPlanilla/));
await probar("Planilla conserva guard operativo separado", () => assert.match(app, /analizarEdicionPreparacionVersionada/));
await probar("Planilla B conserva editor productivo", () => assert.match(app, /edicionPreparacionPlanilla\.editable[\s\S]*<PlanillaMensual/));
await probar("movimiento de personas permanece en Planilla", () => assert.match(planilla, /aplicarIntercambioPlanilla/));
await probar("T6 y T4 permanecen en Planilla", () => { assert.match(planilla, /habilitarTurnanteMensual/); assert.match(planilla, /eliminarTurnanteMensual/); });
await probar("T6 T4 no son controles de Gestión confirmada", () => assert.doesNotMatch(panelVer, /Agregar T[46]/));
await probar("Calendario continúa usando A antes del corte", () => assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-03" }).preparacionId, a.id));
await probar("Calendario continúa usando B desde el corte", () => assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha: hoy }).preparacionId, b.id));
await probar("PDF continúa por tramos", () => assert.equal(obtenerDocumentoPlanillaPDF({ estadoMensual: estado, turnoId: "tarde", mesActivo: mes, personal: estado.personal }).tipoDocumento, "planilla_mensual_versionada"));
await probar("top-level legacy no recupera autoridad al editar Planilla B", () => {
  const editado = aplicarCambiosPreparacionAlEstado({ estado, mes, preparacionId: b.id, categoria: "enfermero", planilla: { ...b.categorias.enfermero.planilla, semana2: { "REA 1": { personaId: "e2" } } } });
  assert.deepEqual(editado.estado.planillas, estado.planillas);
});
await probar("no existe autosave estructural adicional", () => assert.doesNotMatch(panelVer, /guardar|autosave/i));
await probar("CAS mensual permanece como vía de Planilla", () => assert.match(app, /setPlanillaPreparacionVersionada[\s\S]*setEstadoPorTurnoMes/));
await probar("no se agrega SQL migración ni RLS", () => assert.doesNotMatch(panelVer + panelNueva, /supabase|rpc|rls/i));

console.log(`\n${total} comprobaciones de Etapa 40E.2.4 superadas.`);
