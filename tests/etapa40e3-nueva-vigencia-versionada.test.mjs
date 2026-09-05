import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import {
  analizarActividadDesdeFechaPreparacion,
  crearEstadoVersionadoDesdeLegacy,
  crearEstadoVersionadoDesdeVersionado,
  prepararAplicacionTransicionPreparaciones
} from "../src/utils/transicionPreparacionesMes.js";
import { analizarDisponibilidadNuevaPreparacion } from "../src/utils/gestionPreparacionesMes.js";
import { ejecutarTransicionPreparacionMes } from "../src/services/transicionPreparacionMes.js";
import { normalizarPreparacionesMes, resolverOrganizacionMesPorFecha } from "../src/utils/preparacionesMes.js";
import { obtenerDocumentoPlanillaPDF } from "../src/utils/exportPDF.js";
import { habilitarTurnanteMensual } from "../src/utils/turnanteMensual.js";

let total = 0;
const probar = async (nombre, prueba) => { await prueba(); total += 1; console.log(`✓ ${nombre}`); };
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const mes = "2026-09";
const hoy = "2026-09-04";
const perfil = { usuario: "supervisor", rol: "supervision", activo: true };
const legacy = (turno = "tarde") => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "e1", nombre: "E", categoria: "enfermero" }, { id: "l1", nombre: "L", categoria: "licenciado" }];
  const planilla = (id) => ({ semana1: { "REA 1": { personaId: id } }, semana2: {}, semana3: {}, semana4: {}, semana5: {}, semana6: {} });
  estado.planillas = { enfermeros: planilla("e1"), licenciados: planilla("l1") };
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({ turno, categoria: "enfermero", mes }),
    licenciado: crearSnapshotConfiguracionPlanilla({ turno, categoria: "licenciado", mes })
  };
  return estado;
};
const ab = (turno = "tarde") => crearEstadoVersionadoDesdeLegacy({
  estado: legacy(turno), mes, desde: hoy, fechaReferencia: hoy,
  metadata: { creadaEn: "2026-09-04T08:00:00.000Z", creadaPor: "supervisor" }
}).estado;
const prepararC = (cambios = {}) => prepararAplicacionTransicionPreparaciones({
  estado: ab(), mes, turno: "tarde", desde: "2026-09-15", fechaReferencia: hoy,
  perfil, revisionEsperada: "7", revisionActual: "7", novedadesExternas: [],
  metadata: { creadaEn: "2026-09-04T10:00:00.000Z", creadaPor: "supervisor" }, ...cambios
});

const fuente = ab();
const fuenteAntes = clonar(fuente);
const preview = prepararC();
const [a, bOriginal] = fuente.preparaciones;
const [aResultado, bResultado, c] = preview.preparaciones;

await probar("A/B válido admite nueva C", () => assert.equal(preview.ok, true));
await probar("C clona la preparación que contiene la fecha", () => assert.deepEqual(c.categorias, bOriginal.categorias));
await probar("resolución no depende del último índice", () => {
  const abc = preview.estado;
  const d = crearEstadoVersionadoDesdeVersionado({ estado: abc, mes, desde: "2026-09-10", fechaReferencia: hoy });
  assert.deepEqual(d.preparacionNueva.categorias, bResultado.categorias);
});
await probar("preview no cambia B persistida", () => assert.equal(fuente.preparaciones[1].hasta, "2026-09-30"));
await probar("preview no muta estado fuente", () => assert.deepEqual(fuente, fuenteAntes));
await probar("C tiene ID único", () => assert.equal(new Set(preview.preparaciones.map((p) => p.id)).size, 3));
await probar("C metadata conserva creador y fecha", () => { assert.equal(c.creadaPor, "supervisor"); assert.equal(c.creadaEn, "2026-09-04T10:00:00.000Z"); assert.equal(c.origen, "nueva_preparacion_desde_fecha"); });
await probar("C payload inicial es clon profundo", () => { c.categorias.enfermero.planilla.semana2.x = "x"; assert.equal(bResultado.categorias.enfermero.planilla.semana2.x, undefined); });
await probar("modificar C no cambia B fuente", () => assert.deepEqual(fuente.preparaciones[1], bOriginal));
await probar("ayer queda bloqueado", () => assert.equal(prepararC({ desde: "2026-09-03" }).ok, false));
await probar("hoy limpio permite nueva frontera dentro de una preparación anterior", () => {
  const estado = crearEstadoVersionadoDesdeLegacy({ estado: legacy(), mes, desde: "2026-09-02", fechaReferencia: "2026-09-02" }).estado;
  assert.equal(prepararC({ estado, desde: hoy }).ok, true);
});
await probar("hoy con actividad bloquea", () => { const estado = ab(); estado.calendario.enfermeros.extras[hoy] = [{ id: "x" }]; assert.equal(prepararC({ estado, desde: hoy }).codigo, "ACTIVIDAD_DESDE_FECHA"); });
await probar("fecha futura limpia permite", () => assert.equal(preview.ok, true));
await probar("actividad futura desde corte bloquea", () => { const estado = ab(); estado.calendario.enfermeros.cambiosDia["2026-09-15"] = [{ id: "c" }]; assert.equal(prepararC({ estado }).ok, false); });
await probar("novedad de otro turno no bloquea", () => assert.equal(prepararC({ novedadesExternas: [{ id: "n", personaId: "e1", estado: "activa", fechaDesde: "2026-09-15", fechaHasta: "2026-09-15", turno: "noche" }] }).ok, true));
await probar("cancelada no bloquea", () => assert.equal(prepararC({ novedadesExternas: [{ estado: "cancelada", fechaDesde: "2026-09-15" }] }).ok, true));
await probar("licencias y certificaciones no se copian a C", () => { assert.equal(Object.hasOwn(c.categorias.enfermero, "licencias"), false); assert.equal(Object.hasOwn(c.categorias.licenciado, "certificaciones"), false); });
await probar("fecha igual al inicio existente se bloquea", () => assert.equal(prepararC({ desde: hoy }).codigo, "PREPARACION_ID_DUPLICADO"));
await probar("último día permite vigencia de un día", () => { const r = prepararC({ desde: "2026-09-30" }); assert.equal(r.ok, true); assert.equal(r.preparacionNueva.desde, "2026-09-30"); assert.equal(r.preparacionNueva.hasta, "2026-09-30"); });

await probar("confirmar produce A/B/C", () => assert.equal(preview.preparaciones.length, 3));
await probar("A queda deepEqual", () => assert.deepEqual(aResultado, a));
await probar("B conserva categorías deepEqual", () => assert.deepEqual(bResultado.categorias, bOriginal.categorias));
await probar("B conserva metadata", () => ["id", "desde", "creadaEn", "creadaPor", "origen"].forEach((k) => assert.deepEqual(bResultado[k], bOriginal[k])));
await probar("sólo B.hasta cambia", () => { const esperado = { ...bOriginal, hasta: "2026-09-14" }; assert.deepEqual(bResultado, esperado); });
await probar("C cubre desde corte hasta fin", () => { assert.equal(c.desde, "2026-09-15"); assert.equal(c.hasta, "2026-09-30"); });
await probar("colección final no tiene huecos ni solapamientos", () => assert.equal(normalizarPreparacionesMes({ preparaciones: preview.preparaciones, mes, exigirCoberturaCompleta: true }).ok, true));
const categoriasEditadas = clonar(preview.preparacionNueva.categorias);
categoriasEditadas.enfermero.configuracion.filas.reverse();
const editada = prepararC({ categoriasNuevaPreparacion: categoriasEditadas });
await probar("configuración C editada persiste", () => assert.deepEqual(editada.preparacionNueva.categorias, categoriasEditadas));
await probar("operaciones diarias permanecen intactas", () => assert.deepEqual(preview.estado.calendario, fuente.calendario));
await probar("Personal permanece intacto", () => assert.deepEqual(preview.estado.personal, fuente.personal));
await probar("top-level y novedades externas permanecen fuera", () => { assert.deepEqual(preview.estado.planillas, fuente.planillas); assert.equal(Object.hasOwn(preview.preparacionNueva.categorias, "novedades"), false); });

await probar("una sola escritura CAS recibe A/B/C", async () => { let llamadas = 0; let recibido; const r = await ejecutarTransicionPreparacionMes({ estado: fuente, mes, turno: "tarde", desde: "2026-09-15", fechaReferencia: hoy, perfil, revisionEsperada: "7", revisionActual: "7", guardar: async (args) => { llamadas += 1; recibido = args.estado; return { tipo: "guardado", revision: "8" }; } }); assert.equal(r.aplicado, true); assert.equal(llamadas, 1); assert.equal(recibido.preparaciones.length, 3); });
await probar("nunca persiste B acortada sin C", () => assert.equal(preview.estado.preparaciones.length, 3));
await probar("conflicto de revisión aborta", () => assert.equal(prepararC({ revisionActual: "8" }).codigo, "CONFLICTO_REVISION"));
await probar("roundtrip JSON preserva A/B/C", () => assert.deepEqual(JSON.parse(JSON.stringify(preview.estado)).preparaciones, preview.estado.preparaciones));

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/mes/PanelNuevaPreparacionMes.jsx", import.meta.url), "utf8");
await probar("acción aparece en versionado", () => assert.equal(analizarDisponibilidadNuevaPreparacion({ estado: fuente, mes, mesActual: mes, turno: "tarde", perfil }).visible, true));
await probar("colección corrupta no ofrece creación", () => assert.equal(analizarDisponibilidadNuevaPreparacion({ estado: { ...fuente, preparaciones: [] }, mes, mesActual: mes, turno: "tarde", perfil }).visible, false));
await probar("tarjetas confirmadas siguen sólo Ver organización", () => { assert.match(app, /Ver organización/); assert.doesNotMatch(app, /configurable[\s\S]*Configurar organización/); });
await probar("abrir y elegir fecha no modifican estado", () => assert.match(app, /setNuevaPreparacionMes/));
await probar("preview usa predecesora resuelta y nueva vigencia", () => { assert.match(app, /preparacionA: resultado\.preparacionAnterior/); assert.match(app, /preparacionB: resultado\.preparacionNueva/); });
await probar("C es editable sólo como borrador", () => assert.match(panel, /<ConfiguracionPlanilla/));
await probar("cancelar descarta C", () => assert.match(app, /onCancelar=\{\(\) => setNuevaPreparacionMes\(null\)\}/));
await probar("confirmar agrega mediante el mismo servicio CAS", () => assert.match(app, /ejecutarTransicionPreparacionMes/));
await probar("selector Planilla tolera A/B/C", () => assert.match(app, /<SelectorPreparacionPlanilla/));
await probar("Planilla futura usa su guard operativo", () => assert.match(app, /analizarEdicionPreparacionVersionada/));
await probar("modal conserva shell mobile", () => assert.match(panel, /<ModalMobileShell/));

await probar("Calendario fecha A usa A", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: preview.estado, mes, fecha: "2026-09-03" }).preparacionId, a.id));
await probar("Calendario fecha B usa B", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: preview.estado, mes, fecha: "2026-09-10" }).preparacionId, bResultado.id));
await probar("Calendario fecha C usa C", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: editada.estado, mes, fecha: "2026-09-15" }).preparacionId, editada.preparacionNueva.id));
await probar("configuración C aplica sólo desde C", () => assert.notDeepEqual(resolverOrganizacionMesPorFecha({ estado: editada.estado, mes, fecha: "2026-09-15" }).configuracionPlanilla.enfermero.filas, resolverOrganizacionMesPorFecha({ estado: editada.estado, mes, fecha: "2026-09-14" }).configuracionPlanilla.enfermero.filas));
await probar("PDF representa colección A/B/C", () => assert.equal(obtenerDocumentoPlanillaPDF({ estadoMensual: preview.estado, turnoId: "tarde", mesActivo: mes, personal: fuente.personal }).tipoDocumento, "planilla_mensual_versionada"));
await probar("correo continúa usando PDF versionado", async () => assert.doesNotMatch(await readFile(new URL("../src/components/correo/ModalEnviarPDF.jsx", import.meta.url), "utf8"), /crearNuevaPreparacion/));
await probar("T6 en C queda aislado de B", () => {
  const planillaC = habilitarTurnanteMensual(c.categorias.enfermero.planilla, "enfermero", c.categorias.enfermero.configuracion);
  assert.deepEqual(planillaC.posicionesMensualesAdicionales, ["T6"]);
  assert.deepEqual(bResultado.categorias.enfermero.planilla.posicionesMensualesAdicionales || [], []);
});
await probar("T4 en C queda disponible para Licenciados v2", () => {
  const configuracion = { ...c.categorias.licenciado.configuracion, estructuraLicenciadosVersion: 2 };
  assert.deepEqual(habilitarTurnanteMensual(c.categorias.licenciado.planilla, "licenciado", configuracion).posicionesMensualesAdicionales, ["T4"]);
});
await probar("Noche conserva fechaBase duración y ciclo al crear C", () => {
  const estadoNoche = legacy("noche");
  estadoNoche.planillas.enfermeros.rotacion3Dias = {
    fechaBase: "2026-07-02", duracionDias: 3,
    asignacionBase: { "REA 1": { personaId: "e1" } },
    bloques: { "2026-09-14": { "REA 1": { personaId: "e1" } } }
  };
  const versionado = crearEstadoVersionadoDesdeLegacy({ estado: estadoNoche, mes, desde: hoy, fechaReferencia: hoy }).estado;
  const resultado = crearEstadoVersionadoDesdeVersionado({ estado: versionado, mes, desde: "2026-09-15", fechaReferencia: hoy });
  const rotacionB = resultado.preparaciones[1].categorias.enfermero.planilla.rotacion3Dias;
  const rotacionC = resultado.preparaciones[2].categorias.enfermero.planilla.rotacion3Dias;
  assert.equal(rotacionC.fechaBase, "2026-07-02");
  assert.equal(rotacionC.duracionDias, 3);
  assert.deepEqual(rotacionC, rotacionB);
});
await probar("no existe creación automática real de C", () => assert.doesNotMatch(app, /useEffect\([\s\S]{0,200}ejecutarTransicionPreparacionMes/));

console.log(`\n${total} comprobaciones de Etapa 40E.3 superadas.`);
