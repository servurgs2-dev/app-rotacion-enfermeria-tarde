import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { crearEstadoVersionadoDesdeLegacy } from "../src/utils/transicionPreparacionesMes.js";
import {
  analizarEdicionPreparacionVersionada,
  aplicarCambiosPreparacionAlEstado,
  reconciliarPlanillaConConfiguracion
} from "../src/utils/edicionPreparacionVersionada.js";
import { resolverOrganizacionMesPorFecha } from "../src/utils/preparacionesMes.js";
import {
  eliminarTurnanteMensual,
  habilitarTurnanteMensual,
  obtenerPosicionTurnanteMensual
} from "../src/utils/turnanteMensual.js";
import { obtenerDocumentoPlanillaPDF } from "../src/utils/exportPDF.js";

let total = 0;
const probar = async (nombre, prueba) => { await prueba(); total += 1; console.log(`✓ ${nombre}`); };
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const mes = "2026-09";
const hoy = "2026-09-04";
const crearLegacy = (turno = "noche") => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [
    { id: "e1", nombre: "Enfermera", categoria: "enfermero" },
    { id: "l1", nombre: "Licenciada", categoria: "licenciado" }
  ];
  const planilla = (id) => ({
    semana1: { "REA 1": { personaId: id } }, semana2: {}, semana3: {},
    semana4: {}, semana5: {}, semana6: {}, posicionesMensualesAdicionales: []
  });
  estado.planillas = { enfermeros: planilla("e1"), licenciados: planilla("l1") };
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({ turno, categoria: "enfermero", mes }),
    licenciado: crearSnapshotConfiguracionPlanilla({ turno, categoria: "licenciado", mes })
  };
  return estado;
};
const crearVersionado = (turno = "noche") => crearEstadoVersionadoDesdeLegacy({
  estado: crearLegacy(turno), mes, desde: hoy, fechaReferencia: "2026-09-03"
}).estado;
const evaluar = (estado, preparacion, fechaReferencia = hoy) => analizarEdicionPreparacionVersionada({
  estado, mes, preparacionId: preparacion.id, fechaReferencia, turno: "noche", novedadesExternas: []
});

const estado = crearVersionado("tarde");
const [a, b] = estado.preparaciones;
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const selector = await readFile(new URL("../src/components/planilla/SelectorPreparacionPlanilla.jsx", import.meta.url), "utf8");
const planillaUi = await readFile(new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url), "utf8");
const panelGestion = await readFile(new URL("../src/components/mes/PanelConfigurarPreparacionMes.jsx", import.meta.url), "utf8");
const panelNueva = await readFile(new URL("../src/components/mes/PanelNuevaPreparacionMes.jsx", import.meta.url), "utf8");

await probar("selector A/B permanece en Planilla", () => assert.match(app, /<SelectorPreparacionPlanilla/));
await probar("selector distingue Anterior Vigente Futura", () => ["Anterior", "Vigente", "Futura"].forEach((texto) => assert.match(selector, new RegExp(texto))));
await probar("Planilla no renderiza ConfiguracionPlanilla general", () => assert.doesNotMatch(app, /<ConfiguracionPlanilla/));
await probar("Planilla B editable mantiene editor productivo", () => assert.match(app, /edicionPreparacionPlanilla\.editable[\s\S]*<PlanillaMensual/));
await probar("Planilla A conserva vista por tramos", () => assert.match(app, /<PlanillaMensualPorTramos/));
await probar("editor estructural vive en Gestión", () => assert.match(panelGestion, /<ConfiguracionPlanilla/));
await probar("Gestión presenta tarjetas por preparación", () => assert.match(app, /preparacionesMesActual\.preparaciones\.map/));
await probar("Gestión ofrece Ver organización para preparaciones confirmadas", () => assert.match(app, /Ver organizaci/));
await probar("Gestión legacy se conserva sin preparaciones", () => assert.match(app, /!tienePreparacionesVersionadasMes && !destinoActivoPreparacion\.permitido/));
await probar("Gestión versionada oculta el mensaje legacy dominante", () => assert.match(app, /!tienePreparacionesVersionadasMes && mesActivo === mesActual/));
await probar("A y B se renderizan desde sus rangos reales", () => { assert.match(app, /preparacion\.desde\.slice/); assert.match(app, /preparacion\.hasta\.slice/); });
await probar("las tarjetas no presentan IDs técnicos", () => assert.doesNotMatch(app, /\{preparacion\.id\}<\/p>/));
await probar("A pasada no es configurable", () => assert.equal(evaluar(estado, a).editable, false));
await probar("B futura es configurable", () => assert.equal(evaluar(estado, b, "2026-09-03").editable, true));
await probar("B vigente desde hoy limpia es configurable", () => assert.equal(evaluar(estado, b).editable, true));
await probar("B con actividad queda bloqueada", () => { const e = clonar(estado); e.calendario.enfermeros.extras[hoy] = [{ id: "x" }]; assert.equal(evaluar(e, e.preparaciones[1]).editable, false); });
await probar("B iniciada ayer queda bloqueada", () => { const e = crearEstadoVersionadoDesdeLegacy({ estado: crearLegacy(), mes, desde: "2026-09-03", fechaReferencia: "2026-09-02" }).estado; assert.equal(evaluar(e, e.preparaciones[1]).editable, false); });

const configB = clonar(b.categorias.enfermero.configuracion);
configB.filas.reverse().forEach((fila, indice) => { fila.orden = indice; });
const cambioOrden = aplicarCambiosPreparacionAlEstado({ estado, mes, preparacionId: b.id, categoria: "enfermero", configuracionPlanilla: configB });
await probar("orden de sectores B cambia desde adaptador de Gestión", () => assert.deepEqual(cambioOrden.estado.preparaciones[1].categorias.enfermero.configuracion, configB));
await probar("orden de A permanece intacto", () => assert.deepEqual(cambioOrden.estado.preparaciones[0], a));
await probar("Planilla consume configuración B por vigencia", () => assert.deepEqual(
  resolverOrganizacionMesPorFecha({ estado: cambioOrden.estado, mes, fecha: hoy }).configuracionPlanilla.enfermero,
  configB
));
await probar("desactivar fila retira asignaciones huérfanas de B", () => {
  const configuracion = clonar(b.categorias.enfermero.configuracion);
  const fila = configuracion.filas.find((item) => item.etiqueta === "REA 1") || configuracion.filas[0];
  fila.activo = false;
  const planilla = { ...b.categorias.enfermero.planilla, semana1: { ...b.categorias.enfermero.planilla.semana1, [fila.etiqueta]: { personaId: "e1" } } };
  assert.equal(Object.hasOwn(reconciliarPlanillaConConfiguracion({ planilla, configuracion }).semana1, fila.etiqueta), false);
});
await probar("reordenar conserva identidades estables", () => assert.deepEqual(new Set(configB.filas.map((fila) => fila.filaId)), new Set(b.categorias.enfermero.configuracion.filas.map((fila) => fila.filaId))));
await probar("estructura Licenciados permanece aislada", () => assert.deepEqual(cambioOrden.estado.preparaciones[1].categorias.licenciado, b.categorias.licenciado));
await probar("prioridades B permanecen en configuración B", () => assert.deepEqual(cambioOrden.estado.preparaciones[1].categorias.enfermero.configuracion.prioridadCoberturaSectorIds, configB.prioridadCoberturaSectorIds));
await probar("asignaciones fijas se administran desde Gestión", () => assert.match(panelGestion, /<AsignacionesFijasMes/));
await probar("prioridad se administra desde Gestión", () => assert.match(panelGestion, /<PrioridadCoberturaMes/));
await probar("Ver organización incluye prioridades en sólo lectura", () => assert.match(panelGestion, /PrioridadCoberturaMes[\s\S]*soloLectura/));
await probar("Ver organización incluye asignaciones fijas", () => assert.match(panelGestion, /AsignacionesFijasMes[\s\S]*soloLectura/));

await probar("T6 sigue en Planilla Enfermeros", () => assert.match(planillaUi, /Agregar \{posicionTurnanteMensual\} mensual/));
await probar("T4 dinámico sigue soportado en Planilla Licenciados", () => assert.equal(obtenerPosicionTurnanteMensual("licenciado", { estructuraLicenciadosVersion: 2 }), "T4"));
await probar("Gestión oculta el Turnante mensual", () => { assert.match(panelGestion, /ocultarTurnanteMensual/); assert.doesNotMatch(panelGestion, /Agregar T[46]/); });
await probar("creación de B también oculta T6/T4", () => assert.match(panelNueva, /ocultarTurnanteMensual/));
const planillaT6 = habilitarTurnanteMensual(b.categorias.enfermero.planilla, "enfermero", b.categorias.enfermero.configuracion);
const conT6 = aplicarCambiosPreparacionAlEstado({ estado, mes, preparacionId: b.id, categoria: "enfermero", planilla: planillaT6, configuracionPlanilla: b.categorias.enfermero.configuracion });
await probar("agregar T6 modifica sólo B", () => assert.deepEqual(conT6.estado.preparaciones[1].categorias.enfermero.planilla.posicionesMensualesAdicionales, ["T6"]));
await probar("agregar T6 no modifica A", () => assert.deepEqual(conT6.estado.preparaciones[0], a));
const sinT6 = eliminarTurnanteMensual(conT6.estado.preparaciones[1].categorias.enfermero.planilla, "enfermero", b.categorias.enfermero.configuracion);
await probar("quitar T6 funciona dentro de B", () => assert.deepEqual(sinT6.planilla.posicionesMensualesAdicionales, []));
const cfgLic = { ...b.categorias.licenciado.configuracion, estructuraLicenciadosVersion: 2 };
const planillaT4 = habilitarTurnanteMensual(b.categorias.licenciado.planilla, "licenciado", cfgLic);
const conT4 = aplicarCambiosPreparacionAlEstado({ estado, mes, preparacionId: b.id, categoria: "licenciado", planilla: planillaT4, configuracionPlanilla: cfgLic });
await probar("agregar T4 modifica sólo B", () => assert.deepEqual(conT4.estado.preparaciones[1].categorias.licenciado.planilla.posicionesMensualesAdicionales, ["T4"]));
await probar("quitar T4 funciona dentro de B", () => assert.deepEqual(eliminarTurnanteMensual(conT4.estado.preparaciones[1].categorias.licenciado.planilla, "licenciado", cfgLic).planilla.posicionesMensualesAdicionales, []));
await probar("T4 no modifica A", () => assert.deepEqual(conT4.estado.preparaciones[0], a));
await probar("recargar JSON conserva T6 de B", () => assert.deepEqual(JSON.parse(JSON.stringify(conT6.estado)).preparaciones[1].categorias.enfermero.planilla.posicionesMensualesAdicionales, ["T6"]));
await probar("recargar JSON conserva T4 de B", () => assert.deepEqual(JSON.parse(JSON.stringify(conT4.estado)).preparaciones[1].categorias.licenciado.planilla.posicionesMensualesAdicionales, ["T4"]));
await probar("preparación no editable no expone editor productivo", () => assert.match(app, /edicionPreparacionPlanilla\.editable[\s\S]*PlanillaMensualPorTramos/));
await probar("futura seleccionada usa el mismo guard editable", () => assert.match(app, /analizarEdicionPreparacionVersionada/));

const distribuida = aplicarCambiosPreparacionAlEstado({ estado, mes, preparacionId: b.id, categoria: "enfermero", planilla: { ...b.categorias.enfermero.planilla, semana2: { "REA 1": { personaId: "e2" } } } });
await probar("generar B modifica sólo B", () => assert.equal(distribuida.estado.preparaciones[1].categorias.enfermero.planilla.semana2["REA 1"].personaId, "e2"));
await probar("drag and drop B no modifica A", () => assert.deepEqual(distribuida.estado.preparaciones[0], a));
await probar("B sin distribuir conserva acceso a Planilla", () => assert.match(app, /estadoEditablePreparacionPlanilla\?\.ok[\s\S]*<PlanillaMensual/));
await probar("Noche conserva fechaBase y duración", () => {
  const e = crearLegacy(); e.planillas.enfermeros.rotacion3Dias = { fechaBase: "2026-07-02", duracionDias: 3, asignacionBase: {}, bloques: {} };
  const v = crearEstadoVersionadoDesdeLegacy({ estado: e, mes, desde: hoy, fechaReferencia: "2026-09-03" }).estado;
  const rotacion = v.preparaciones[1].categorias.enfermero.planilla.rotacion3Dias;
  assert.equal(rotacion.fechaBase, "2026-07-02"); assert.equal(rotacion.duracionDias, 3);
});
await probar("Calendario anterior usa A", () => assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-03" }).preparacionId, a.id));
await probar("Calendario vigente usa B", () => assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha: hoy }).preparacionId, b.id));
await probar("PDF mensual consume estado versionado", () => assert.equal(obtenerDocumentoPlanillaPDF({ estadoMensual: conT6.estado, turnoId: "tarde", mesActivo: mes, personal: estado.personal }).tipoDocumento, "planilla_mensual_versionada"));
await probar("correo sigue consumiendo el PDF sin vía nueva", async () => assert.doesNotMatch(await readFile(new URL("../src/components/correo/ModalEnviarPDF.jsx", import.meta.url), "utf8"), /preparaciones/));
await probar("Gestión usa ModalMobileShell", () => assert.match(panelGestion, /<ModalMobileShell/));
await probar("preparaciones confirmadas se abren sobre una copia de lectura", () => assert.match(app, /setConfiguracionPreparacionMes[\s\S]*crearInstantanea\(preparacion\.categorias\)/));
await probar("Gestión no persiste cambios sobre preparaciones confirmadas", () => assert.doesNotMatch(app, /confirmarConfiguracionPreparacionMes/));
await probar("no existe autosave específico por preparación", async () => assert.doesNotMatch(await readFile(new URL("../src/utils/edicionPreparacionVersionada.js", import.meta.url), "utf8"), /autosave|guardar/));
await probar("conflicto y pendientes bloquean configuración", () => { assert.match(app, /metadatosActivos\?\.conflicto/); assert.match(app, /hayPendientesEnClave\(claveActiva\)/); });
await probar("operaciones diarias permanecen fuera", () => assert.deepEqual(distribuida.estado.calendario, estado.calendario));
await probar("nuevas vigencias reutilizan la acción independiente", () => assert.match(app, /disponibilidadNuevaPreparacion/));

console.log(`\n${total} comprobaciones de Etapa 40E.2.3 superadas.`);
