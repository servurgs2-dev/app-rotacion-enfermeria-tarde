import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import {
  analizarDisponibilidadNuevaPreparacion,
  describirPrimerHallazgoPreparacion,
  validarCategoriasBorradorNuevaPreparacion
} from "../src/utils/gestionPreparacionesMes.js";
import {
  CODIGOS_TRANSICION_PREPARACIONES,
  crearEstadoVersionadoDesdeLegacy,
  prepararAplicacionTransicionPreparaciones
} from "../src/utils/transicionPreparacionesMes.js";
import { ejecutarTransicionPreparacionMes } from "../src/services/transicionPreparacionMes.js";
import { resolverOrganizacionMesPorFecha, resolverTramosPlanillaMes } from "../src/utils/preparacionesMes.js";
import { obtenerDocumentoPlanillaPDF } from "../src/utils/exportPDF.js";
import { analizarRecuperacionMesActual } from "../src/utils/recuperacionMesActual.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const mes = "2026-09";
const hoy = "2026-09-13";
const perfilSupervision = { usuario: "supervisor", rol: "supervision", turno: null, activo: true };
const perfilLicenciado = { usuario: "lic-tarde", rol: "licenciado", turno: "tarde", activo: true };
const perfilEnfermeria = { usuario: "enfermeria", rol: "enfermeria", turno: null, activo: true };
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const planilla = (personaId) => ({
  semana1: { "REA 1": { personaId } }, semana2: { "REA 1": { personaId } },
  semana3: { "REA 1": { personaId } }, semana4: { "REA 1": { personaId } },
  semana5: { "REA 1": { personaId } }, semana6: {}, coberturaLibreSM: {}
});
const estadoLegacy = (turno = "tarde") => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [
    { id: "e1", nombre: "Enfermera", categoria: "enfermero" },
    { id: "l1", nombre: "Licenciada", categoria: "licenciado" }
  ];
  estado.planillas = { enfermeros: planilla("e1"), licenciados: planilla("l1") };
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({ turno, categoria: "enfermero", mes }),
    licenciado: crearSnapshotConfiguracionPlanilla({ turno, categoria: "licenciado", mes })
  };
  return estado;
};
const disponibilidad = (cambios = {}) => analizarDisponibilidadNuevaPreparacion({
  estado: estadoLegacy(), mes, mesActual: mes, turno: "tarde", perfil: perfilSupervision,
  ...cambios
});
const preparar = (cambios = {}) => prepararAplicacionTransicionPreparaciones({
  estado: estadoLegacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy,
  perfil: perfilSupervision, revisionEsperada: "4", revisionActual: "4",
  metadata: { creadaEn: "2026-09-13T09:00:00Z", creadaPor: "supervisor" },
  ...cambios
});

await probar("acción disponible en R legacy preparado", () => assert.equal(disponibilidad().visible, true));
await probar("acción no disponible en R vacío", () => assert.equal(disponibilidad({ estado: crearEstadoMensualVacio() }).visible, false));
await probar("40B permanece disponible en vacío", () => assert.equal(analizarRecuperacionMesActual({ estado: crearEstadoMensualVacio(), mes, mesReferencia: mes, fechaReferencia: new Date(2026, 8, 13, 12), turno: "tarde", novedadesExternas: [], padronVigencias: { personas: [] }, auditoriaExternaDisponible: true }).permitida, true));
await probar("40B y nueva preparación no aparecen simultáneamente", () => {
  const vacio = crearEstadoMensualVacio();
  assert.equal(analizarDisponibilidadNuevaPreparacion({ estado: vacio, mes, mesActual: mes, turno: "tarde", perfil: perfilSupervision }).visible, false);
});
await probar("acción no aparece en R+1", () => assert.equal(disponibilidad({ mes: "2026-10", mesActual: mes }).visible, false));
await probar("acción no aparece en R-1", () => assert.equal(disponibilidad({ mes: "2026-08", mesActual: mes }).visible, false));
await probar("acción no aparece en histórico", () => assert.equal(disponibilidad({ mes: "2026-07", mesActual: mes }).visible, false));
await probar("acción aparece también en estado versionado válido", () => assert.equal(disponibilidad({ estado: crearEstadoVersionadoDesdeLegacy({ estado: estadoLegacy(), mes, desde: hoy, fechaReferencia: hoy }).estado }).visible, true));
await probar("Supervisión ve la acción", () => assert.equal(disponibilidad().visible, true));
await probar("Licenciado propio ve la acción", () => assert.equal(disponibilidad({ perfil: perfilLicenciado }).visible, true));
await probar("Licenciado ajeno no ve la acción", () => assert.equal(disponibilidad({ perfil: perfilLicenciado, turno: "noche" }).visible, false));
await probar("Enfermería no ve la acción", () => assert.equal(disponibilidad({ perfil: perfilEnfermeria }).visible, false));
for (const [nombre, cambios] of [
  ["conflicto", { conflicto: true }], ["guardado pendiente", { guardadosPendientes: true }],
  ["restauración bloqueada", { bloqueadoTrasRestauracion: true }], ["carga", { cargando: true }],
  ["solo lectura", { modoSoloLectura: true }]
]) await probar(`${nombre} oculta la acción`, () => assert.equal(disponibilidad(cambios).visible, false));

await probar("fecha de ayer es inválida", () => assert.equal(preparar({ desde: "2026-09-12" }).ok, false));
await probar("hoy limpio es válido", () => assert.equal(preparar().ok, true));
await probar("hoy con actividad bloquea", () => {
  const estado = estadoLegacy();
  estado.calendario.enfermeros.extras[hoy] = [{ id: "extra" }];
  assert.equal(preparar({ estado }).codigo, CODIGOS_TRANSICION_PREPARACIONES.ACTIVIDAD_DESDE_FECHA);
});
await probar("mañana limpio es válido", () => assert.equal(preparar({ desde: "2026-09-14" }).ok, true));
await probar("fecha fuera del mes es inválida", () => assert.equal(preparar({ desde: "2026-10-01" }).ok, false));

await probar("abrir modal no cambia estado", () => { const estado = estadoLegacy(); const antes = clonar(estado); disponibilidad({ estado }); assert.deepEqual(estado, antes); });
await probar("elegir fecha no cambia estado", () => { const estado = estadoLegacy(); const antes = clonar(estado); preparar({ estado, desde: "2026-09-14" }); assert.deepEqual(estado, antes); });
await probar("crear preview no cambia revisión", () => assert.equal(preparar().revisionEsperada, "4"));
await probar("cancelar se limita a descartar estado del modal", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /onCancelar=\{\(\) => setNuevaPreparacionMes\(null\)\}/);
});
await probar("A preview es exacta", () => assert.deepEqual(preparar().preparaciones[0].categorias.enfermero.planilla, estadoLegacy().planillas.enfermeros));
await probar("B nace como clon de A", () => assert.deepEqual(preparar().preparaciones[1].categorias, preparar().preparaciones[0].categorias));
await probar("modificar B no modifica A", () => {
  const preview = preparar();
  preview.preparacionNueva.categorias.enfermero.configuracion.filas[0].etiqueta = "Nueva";
  assert.notEqual(preview.preparaciones[0].categorias.enfermero.configuracion.filas[0].etiqueta, "Nueva");
});
await probar("editor no admite Personal", () => {
  const categorias = preparar().preparacionNueva.categorias;
  categorias.enfermero.personal = [];
  assert.equal(crearEstadoVersionadoDesdeLegacy({ estado: estadoLegacy(), mes, desde: hoy, fechaReferencia: hoy, categoriasNuevaPreparacion: categorias }).ok, false);
});
await probar("editor no admite Calendario", () => {
  const categorias = preparar().preparacionNueva.categorias;
  categorias.licenciado.calendario = {};
  assert.equal(crearEstadoVersionadoDesdeLegacy({ estado: estadoLegacy(), mes, desde: hoy, fechaReferencia: hoy, categoriasNuevaPreparacion: categorias }).ok, false);
});
await probar("el borrador sólo reemplaza categorías y no metadata/rangos", () => {
  const categorias = preparar().preparacionNueva.categorias;
  categorias.enfermero.configuracion.filas[0].etiqueta = "Editada";
  const resultado = crearEstadoVersionadoDesdeLegacy({ estado: estadoLegacy(), mes, desde: hoy, fechaReferencia: hoy, categoriasNuevaPreparacion: categorias });
  assert.equal(resultado.preparacionNueva.id, "preparacion-2026-09-13");
  assert.equal(resultado.preparacionNueva.desde, hoy);
  assert.equal(resultado.preparaciones[0].hasta, "2026-09-12");
});
await probar("configuración B se valida con helpers existentes", () => assert.equal(validarCategoriasBorradorNuevaPreparacion({ categorias: preparar().preparacionNueva.categorias, turno: "tarde", mes }).ok, true));

await probar("revisión cambiada aborta revalidación", () => assert.equal(preparar({ revisionActual: "5" }).codigo, CODIGOS_TRANSICION_PREPARACIONES.CONFLICTO_REVISION));
await probar("actividad aparecida durante modal aborta", () => {
  const estado = estadoLegacy(); estado.calendario.enfermeros.noDisponibles[hoy] = [{ personaId: "e1" }];
  assert.equal(preparar({ estado }).ok, false);
});
await probar("misma frontera de vigencia versionada se rechaza", () => assert.equal(preparar({ estado: crearEstadoVersionadoDesdeLegacy({ estado: estadoLegacy(), mes, desde: hoy, fechaReferencia: hoy }).estado }).codigo, "PREPARACION_ID_DUPLICADO"));

await probar("confirmación persiste una sola vez", async () => {
  const llamadas = [];
  const resultado = await ejecutarTransicionPreparacionMes({ estado: estadoLegacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, perfil: perfilSupervision, revisionEsperada: "4", revisionActual: "4", guardar: async (args) => { llamadas.push(args); return { tipo: "guardado", revision: "5" }; } });
  assert.equal(resultado.aplicado, true); assert.equal(llamadas.length, 1);
});
await probar("CAS recibe A+B juntas", async () => {
  let recibido;
  await ejecutarTransicionPreparacionMes({ estado: estadoLegacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, perfil: perfilSupervision, revisionEsperada: "4", revisionActual: "4", guardar: async (args) => { recibido = args; return { tipo: "guardado", revision: "5" }; } });
  assert.equal(recibido.estado.preparaciones.length, 2); assert.equal(recibido.revisionEsperada, "4");
});
await probar("A se reconstruye desde el estado real al confirmar", () => {
  const real = estadoLegacy(); real.planillas.enfermeros.semana1["REA 1"] = { personaId: "actualizada" };
  assert.equal(preparar({ estado: real }).preparaciones[0].categorias.enfermero.planilla.semana1["REA 1"].personaId, "actualizada");
});
await probar("B usa las categorías editadas", () => {
  const categorias = preparar().preparacionNueva.categorias;
  categorias.enfermero.configuracion.filas[0].etiqueta = "B editada";
  assert.equal(crearEstadoVersionadoDesdeLegacy({ estado: estadoLegacy(), mes, desde: hoy, fechaReferencia: hoy, categoriasNuevaPreparacion: categorias }).preparacionNueva.categorias.enfermero.configuracion.filas[0].etiqueta, "B editada");
});
await probar("conflicto no se informa como éxito", async () => assert.equal((await ejecutarTransicionPreparacionMes({ estado: estadoLegacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, perfil: perfilSupervision, revisionEsperada: "4", revisionActual: "4", guardar: async () => ({ tipo: "conflicto", revision: "5" }) })).aplicado, false));

const estadoAB = preparar().estado;
await probar("Planilla cambia a tramos A/B", () => assert.equal(new Set(resolverTramosPlanillaMes({ estado: estadoAB, mes, turno: "tarde", categoria: "enfermero" }).tramos.map((tramo) => tramo.preparacionId)).size, 2));
await probar("Calendario anterior usa A", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: estadoAB, mes, fecha: "2026-09-12" }).preparacionId, estadoAB.preparaciones[0].id));
await probar("Calendario posterior usa B", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: estadoAB, mes, fecha: hoy }).preparacionId, estadoAB.preparaciones[1].id));
await probar("PDF pasa automáticamente a versión por tramos", () => assert.equal(obtenerDocumentoPlanillaPDF({ estadoMensual: estadoAB, turnoId: "tarde", mesActivo: mes, personal: estadoAB.personal }).tipoDocumento, "planilla_mensual_versionada"));
await probar("historial no se escribe manualmente", async () => {
  const servicio = await readFile(new URL("../src/services/transicionPreparacionMes.js", import.meta.url), "utf8");
  assert.doesNotMatch(servicio, /historial_estado|registrarHistorial|historial:/);
});

await probar("Noche conserva fechaBase y no reinicia ciclo", () => {
  const estado = estadoLegacy("noche");
  estado.planillas.enfermeros.rotacion3Dias = { fechaBase: "2026-07-02", duracionDias: 3, asignacionBase: { "REA 1": { personaId: "e1" } }, bloques: {}, coberturaLibreSM: {} };
  const resultado = crearEstadoVersionadoDesdeLegacy({ estado, mes, desde: hoy, fechaReferencia: hoy });
  assert.equal(resultado.preparaciones[1].categorias.enfermero.planilla.rotacion3Dias.fechaBase, "2026-07-02");
  assert.deepEqual(resultado.preparaciones[1].categorias.enfermero.planilla.rotacion3Dias, resultado.preparaciones[0].categorias.enfermero.planilla.rotacion3Dias);
});
await probar("resumen A/B está conectado tras versionar", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /Preparaciones del mes/); assert.match(app, /preparacionesMesActual\.preparaciones\.map/);
});
await probar("se ofrece una nueva vigencia para un estado versionado válido", () => assert.equal(disponibilidad({ estado: estadoAB }).visible, true));

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/mes/PanelNuevaPreparacionMes.jsx", import.meta.url), "utf8");
await probar("acción vive en Gestión del mes", () => assert.match(app, /subvistaMas === "gestionMes"[\s\S]*Nueva preparación desde una fecha/));
await probar("modal usa ModalMobileShell", () => assert.match(panel, /<ModalMobileShell/));
await probar("selector date limita mínimo y máximo", () => assert.match(panel, /type="date"[\s\S]*min=\{fechaMinima\}[\s\S]*max=\{fechaMaxima\}/));
await probar("botones mobile son accesibles", () => assert.match(panel, /min-h-11[\s\S]*Cancelar[\s\S]*min-h-11[\s\S]*Confirmar nueva preparación/));
await probar("A es informativa y B configura estructura sin Turnantes mensuales", () => {
  assert.match(panel, /Organización anterior[\s\S]*no puede editarse/);
  assert.match(panel, /Nueva organización[\s\S]*<ConfiguracionPlanilla/);
  assert.match(panel, /ocultarTurnanteMensual/);
});
await probar("preflight muestra lenguaje comprensible", () => assert.equal(describirPrimerHallazgoPreparacion({ hallazgos: [{ campo: "extras", fecha: hoy }] }), "Extra · 13/09"));
await probar("App actualiza estado local sólo después de guardado", () => assert.match(app, /if \(!resultado\.aplicado\)[\s\S]*referenciasEstadoRef\.current\.set[\s\S]*setEstadoPorTurnoMes/));
await probar("referencia evita segundo autosave", () => assert.match(app, /referenciasEstadoRef\.current\.set\(flujo\.clave, resultado\.estado\);[\s\S]*setEstadoPorTurnoMes/));
await probar("conflicto usa tratamiento existente", () => assert.match(app, /aplicarConflictoConcurrencia\(actuales, resultado\.persistencia, resultado\.estado\)/));
await probar("éxito actualiza metadata CAS", () => assert.match(app, /aplicarExitoConcurrencia\(actuales, resultado\.persistencia\)/));
await probar("40B sigue conectado", () => assert.match(app, /Preparar mes actual/));

console.log(`\n${total} comprobaciones de Etapa 40E.2 superadas.`);
