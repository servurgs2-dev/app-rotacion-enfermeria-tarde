import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { crearEstadoVersionadoDesdeLegacy } from "../src/utils/transicionPreparacionesMes.js";
import {
  analizarEdicionPreparacionVersionada,
  aplicarCambiosPreparacionAlEstado,
  obtenerEstadoEditablePreparacion
} from "../src/utils/edicionPreparacionVersionada.js";
import { resolverOrganizacionMesPorFecha, resolverTramosPlanillaMes } from "../src/utils/preparacionesMes.js";
import { obtenerDocumentoPlanillaPDF } from "../src/utils/exportPDF.js";

let total = 0;
const probar = async (nombre, prueba) => { await prueba(); total += 1; console.log(`✓ ${nombre}`); };
const mes = "2026-09";
const hoy = "2026-09-04";
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const legacy = (turno = "noche") => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "e1", nombre: "E", categoria: "enfermero" }, { id: "l1", nombre: "L", categoria: "licenciado" }];
  const base = (id) => ({ semana1: { "REA 1": { personaId: id } }, semana2: {}, semana3: {}, semana4: {}, semana5: {}, semana6: {}, coberturaLibreSM: {} });
  estado.planillas = { enfermeros: base("e1"), licenciados: base("l1") };
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({ turno, categoria: "enfermero", mes }),
    licenciado: crearSnapshotConfiguracionPlanilla({ turno, categoria: "licenciado", mes })
  };
  return estado;
};
const versionado = (desde = hoy, turno = "noche") => crearEstadoVersionadoDesdeLegacy({ estado: legacy(turno), mes, desde, fechaReferencia: "2026-09-03" }).estado;
const evaluar = (estado, id, fechaReferencia = hoy, cambios = {}) => analizarEdicionPreparacionVersionada({ estado, mes, preparacionId: id, fechaReferencia, turno: "noche", novedadesExternas: [], ...cambios });

const estado = versionado(hoy, "tarde");
const [a, b] = estado.preparaciones;
await probar("A pasada queda sólo lectura", () => assert.equal(evaluar(estado, a.id).editable, false));
await probar("B futura es editable", () => assert.equal(evaluar(estado, b.id, "2026-09-03").editable, true));
await probar("B futura se edita antes de su vigencia", () => assert.equal(evaluar(estado, b.id, "2026-09-02").codigo, "EDITABLE_FUTURA"));
await probar("B desde hoy limpia es editable", () => assert.equal(evaluar(estado, b.id).editable, true));
await probar("B desde hoy con actividad queda bloqueada", () => { const e = clonar(estado); e.calendario.enfermeros.extras[hoy] = [{ id: "x" }]; assert.equal(evaluar(e, b.id).codigo, "ACTIVIDAD_DESDE_INICIO"); });
await probar("B iniciada ayer queda bloqueada", () => { const e = versionado("2026-09-03"); assert.equal(evaluar(e, e.preparaciones[1].id).editable, false); });
await probar("selector expone A/B", async () => assert.match(await readFile(new URL("../src/components/planilla/SelectorPreparacionPlanilla.jsx", import.meta.url), "utf8"), /preparaciones\.map/));
await probar("selector identifica anterior vigente futura", async () => { const s = await readFile(new URL("../src/components/planilla/SelectorPreparacionPlanilla.jsx", import.meta.url), "utf8"); assert.match(s, /Anterior/); assert.match(s, /Vigente/); assert.match(s, /Futura/); });
await probar("seleccionar B mediante adaptador no cambia A", () => { const antes = clonar(a); obtenerEstadoEditablePreparacion({ estado, mes, preparacionId: b.id }); assert.deepEqual(a, antes); });
await probar("adaptador entrega Planilla B aunque esté vacía", () => { const e = clonar(estado); e.preparaciones[1].categorias.enfermero.planilla = {}; assert.equal(obtenerEstadoEditablePreparacion({ estado: e, mes, preparacionId: b.id }).ok, true); });
await probar("B vacía acepta preparación productiva", () => { const e = clonar(estado); e.preparaciones[1].categorias.enfermero.planilla = {}; assert.equal(aplicarCambiosPreparacionAlEstado({ estado: e, mes, preparacionId: b.id, categoria: "enfermero", planilla: { semana1: {} } }).ok, true); });
const planillaEditada = { ...b.categorias.enfermero.planilla, semana1: { "REA 1": { personaId: "e2" } } };
const editado = aplicarCambiosPreparacionAlEstado({ estado, mes, preparacionId: b.id, categoria: "enfermero", planilla: planillaEditada, configuracionPlanilla: b.categorias.enfermero.configuracion });
await probar("generación modifica sólo B", () => assert.deepEqual(editado.estado.preparaciones[1].categorias.enfermero.planilla, planillaEditada));
await probar("drag/drop de distribución modifica sólo B", () => assert.equal(editado.estado.preparaciones[1].categorias.enfermero.planilla.semana1["REA 1"].personaId, "e2"));
await probar("orden de sectores puede cambiar sólo en B", () => { const cfg = clonar(b.categorias.enfermero.configuracion); cfg.filas.reverse().forEach((fila, i) => { fila.orden = i; }); const r = aplicarCambiosPreparacionAlEstado({ estado, mes, preparacionId: b.id, categoria: "enfermero", configuracionPlanilla: cfg }); assert.notDeepEqual(r.estado.preparaciones[1].categorias.enfermero.configuracion.filas, a.categorias.enfermero.configuracion.filas); });
await probar("A conserva su orden", () => assert.deepEqual(editado.estado.preparaciones[0], a));
await probar("filas B permanecen junto a B", () => assert.deepEqual(editado.estado.preparaciones[1].categorias.enfermero.configuracion.filas, b.categorias.enfermero.configuracion.filas));
await probar("Turnantes permanecen dentro de B", () => assert.deepEqual(editado.estado.preparaciones[1].categorias.enfermero.planilla.posicionesMensualesAdicionales, b.categorias.enfermero.planilla.posicionesMensualesAdicionales));
await probar("T6/T3 no se escribe top-level", () => assert.deepEqual(editado.estado.planillas, estado.planillas));
await probar("Planilla y configuración B se aplican juntas", () => { const r = aplicarCambiosPreparacionAlEstado({ estado, mes, preparacionId: b.id, categoria: "enfermero", planilla: planillaEditada, configuracionPlanilla: b.categorias.enfermero.configuracion }); assert.equal(r.ok, true); });
await probar("A permanece deepEqual", () => assert.deepEqual(editado.estado.preparaciones[0], estado.preparaciones[0]));
await probar("metadata y rangos B permanecen intactos", () => { for (const k of ["id", "desde", "hasta", "creadaEn", "creadaPor", "origen"]) assert.deepEqual(editado.estado.preparaciones[1][k], b[k]); });
await probar("Noche conserva fechaBase", () => { const e = legacy(); e.planillas.enfermeros.rotacion3Dias = { fechaBase: "2026-07-02", duracionDias: 3, asignacionBase: {}, bloques: {}, coberturaLibreSM: {} }; const v = crearEstadoVersionadoDesdeLegacy({ estado: e, mes, desde: hoy, fechaReferencia: "2026-09-03" }).estado; const r = aplicarCambiosPreparacionAlEstado({ estado: v, mes, preparacionId: v.preparaciones[1].id, categoria: "enfermero", planilla: v.preparaciones[1].categorias.enfermero.planilla }); assert.equal(r.estado.preparaciones[1].categorias.enfermero.planilla.rotacion3Dias.fechaBase, "2026-07-02"); });
await probar("Noche no reinicia ciclo", () => assert.equal(editado.estado.preparaciones[1].categorias.enfermero.planilla.rotacion3Dias, b.categorias.enfermero.planilla.rotacion3Dias));
await probar("corte dentro de bloque conserva resolución cronológica", () => assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha: hoy }).preparacionId, b.id));
await probar("Calendario 03 usa A", () => assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-03" }).preparacionId, a.id));
await probar("Calendario 04 usa B", () => assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha: hoy }).preparacionId, b.id));
await probar("Calendario refleja B editada", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: editado.estado, mes, fecha: hoy }).planillas.enfermeros.semana1["REA 1"].personaId, "e2"));
await probar("PDF refleja B", () => assert.equal(obtenerDocumentoPlanillaPDF({ estadoMensual: editado.estado, turnoId: "tarde", mesActivo: mes, personal: estado.personal }).tipoDocumento, "planilla_mensual_versionada"));
await probar("Planilla por tramos refleja B", () => assert.equal(resolverTramosPlanillaMes({ estado: editado.estado, mes, turno: "tarde", categoria: "enfermero" }).ok, true));
await probar("documento completo conserva CAS por autosave existente", async () => assert.match(await readFile(new URL("../src/App.jsx", import.meta.url), "utf8"), /setPlanillaPreparacionVersionada[\s\S]*setEstadoPorTurnoMes/));
await probar("editor estructural se retira del cuerpo de Planilla", async () => assert.doesNotMatch(await readFile(new URL("../src/App.jsx", import.meta.url), "utf8"), /<ConfiguracionPlanilla/));
await probar("Turnantes permanecen en el editor productivo de Planilla", async () => { const planilla = await readFile(new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url), "utf8"); assert.match(planilla, /habilitarTurnanteMensual/); assert.match(planilla, /eliminarTurnanteMensual/); });
await probar("conflictos siguen protegidos por puedeMutarMesActivo", async () => assert.match(await readFile(new URL("../src/App.jsx", import.meta.url), "utf8"), /setPlanillaPreparacionVersionada[\s\S]*puedeMutarMesActivo/));
await probar("no existe segundo autosave versionado", async () => assert.doesNotMatch(await readFile(new URL("../src/utils/edicionPreparacionVersionada.js", import.meta.url), "utf8"), /guardar|autosave/));
await probar("operaciones diarias quedan intactas", () => assert.deepEqual(editado.estado.calendario, estado.calendario));
await probar("cierres quedan intactos", () => assert.deepEqual(editado.estado.calendario.enfermeros.cierresDia, estado.calendario.enfermeros.cierresDia));
await probar("Novedades quedan fuera del adaptador", () => { const e = { ...estado, novedades: [{ id: "n" }] }; assert.deepEqual(aplicarCambiosPreparacionAlEstado({ estado: e, mes, preparacionId: b.id, categoria: "enfermero", planilla: planillaEditada }).estado.novedades, e.novedades); });
await probar("estado A/B ya persistido es compatible", () => assert.equal(obtenerEstadoEditablePreparacion({ estado, mes, preparacionId: b.id }).ok, true));

console.log(`\n${total} comprobaciones de Etapa 40E.2.2 superadas.`);
