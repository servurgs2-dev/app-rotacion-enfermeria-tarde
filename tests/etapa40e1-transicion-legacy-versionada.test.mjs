import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio, normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import {
  CODIGOS_PREPARACIONES_MES,
  extraerSnapshotOrganizativo,
  resolverOrganizacionMesPorFecha,
  resolverTramosPlanillaMes
} from "../src/utils/preparacionesMes.js";
import {
  CODIGOS_TRANSICION_PREPARACIONES,
  analizarActividadDesdeFechaPreparacion,
  crearEstadoVersionadoDesdeLegacy,
  prepararAplicacionTransicionPreparaciones
} from "../src/utils/transicionPreparacionesMes.js";
import { ejecutarTransicionPreparacionMes } from "../src/services/transicionPreparacionMes.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";
import { obtenerDocumentoPlanillaPDF } from "../src/utils/exportPDF.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const mes = "2026-09";
const hoy = "2026-09-13";
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const perfilSupervision = { usuario: "supervisor", rol: "supervision", turno: null, activo: true };
const perfilLicenciado = { usuario: "lic-tarde", rol: "licenciado", turno: "tarde", activo: true };
const perfilEnfermeria = { usuario: "enfermeria", rol: "enfermeria", turno: null, activo: true };
const planilla = (marca) => ({
  semana1: { "REA 1": { personaId: `persona-${marca}` } },
  semana2: { "REA 1": { personaId: `persona-${marca}` } },
  semana3: { "REA 1": { personaId: `persona-${marca}` } },
  semana4: { "REA 1": { personaId: `persona-${marca}` } },
  semana5: { "REA 1": { personaId: `persona-${marca}` } },
  semana6: {},
  coberturaLibreSM: { semana2: { personaId: `cobertura-${marca}` } },
  posicionesMensualesAdicionales: [`T-${marca}`]
});
const configuracion = (turno, categoria, marca) => ({
  ...crearSnapshotConfiguracionPlanilla({ turno, categoria, mes }),
  marca,
  prioridadCoberturaSectorIds: [`prioridad-${marca}`],
  asignacionesFijas: [{ sectorId: `fija-${marca}`, personaId: `persona-${marca}` }],
  ...(categoria === "licenciado" ? { estructuraLicenciadosVersion: 2 } : {})
});
const legacy = (turno = "tarde") => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [
    { id: "persona-E", nombre: "Enfermera", categoria: "enfermero" },
    { id: "persona-L", nombre: "Licenciada", categoria: "licenciado" }
  ];
  estado.planillas = { enfermeros: planilla("E"), licenciados: planilla("L") };
  estado.configuracionPlanilla = {
    enfermero: configuracion(turno, "enfermero", "E"),
    licenciado: configuracion(turno, "licenciado", "L")
  };
  estado.licencias = [{ id: "lic-1", personaId: "persona-E", desde: "2026-09-20", hasta: "2026-09-21" }];
  estado.certificaciones = [{ id: "cert-1", personaId: "persona-L", desde: "2026-09-22", hasta: "2026-09-22" }];
  estado.responsables = { "2026-09-05": "supervisor" };
  estado.historial = [{ accion: "legacy" }];
  return estado;
};
const transicionar = (estado = legacy(), opciones = {}) => crearEstadoVersionadoDesdeLegacy({
  estado,
  mes,
  desde: hoy,
  fechaReferencia: hoy,
  metadata: { creadaEn: "2026-09-13T08:00:00Z", creadaPor: "supervisor" },
  ...opciones
});
const agregarActividad = (estado, campo, fecha, valor = { dato: true }, categoria = "enfermeros") => {
  if (campo === "diasParo") estado.calendario.diasParo[fecha] = valor;
  else estado.calendario[categoria][campo][fecha] = valor;
  return estado;
};

await probar("legacy válido se transforma en A+B", () => assert.equal(transicionar().preparaciones.length, 2));
await probar("A cubre 01–12", () => assert.deepEqual(transicionar().preparaciones.slice(0, 1).map(({ desde, hasta }) => ({ desde, hasta })), [{ desde: "2026-09-01", hasta: "2026-09-12" }]));
await probar("B cubre 13–30", () => assert.deepEqual(transicionar().preparaciones.slice(1).map(({ desde, hasta }) => ({ desde, hasta })), [{ desde: "2026-09-13", hasta: "2026-09-30" }]));
await probar("IDs de A y B son distintos y estables", () => assert.deepEqual(transicionar().preparaciones.map((item) => item.id), ["preparacion-2026-09-01", "preparacion-2026-09-13"]));
await probar("A registra metadata de materialización", () => {
  const a = transicionar().preparaciones[0];
  assert.equal(a.origen, "materializada_desde_legacy");
  assert.equal(a.creadaPor, "supervisor");
});
await probar("B registra metadata de nueva vigencia", () => {
  const b = transicionar().preparaciones[1];
  assert.equal(b.origen, "nueva_preparacion_desde_fecha");
  assert.equal(b.creadaEn, "2026-09-13T08:00:00Z");
});
await probar("A conserva el snapshot organizativo exacto", () => assert.deepEqual(transicionar().preparaciones[0].categorias, extraerSnapshotOrganizativo(legacy()).categorias));
await probar("B nace como clon profundo exacto del payload de A", () => assert.deepEqual(transicionar().preparaciones[1].categorias, transicionar().preparaciones[0].categorias));
await probar("mutar B no cambia A", () => {
  const resultado = transicionar();
  resultado.preparaciones[1].categorias.enfermero.planilla.semana1["REA 1"].personaId = "otro";
  assert.equal(resultado.preparaciones[0].categorias.enfermero.planilla.semana1["REA 1"].personaId, "persona-E");
});
await probar("mutar resultado no cambia estado fuente", () => {
  const estado = legacy();
  const antes = clonar(estado);
  transicionar(estado).estado.personal[0].nombre = "Mutada";
  assert.deepEqual(estado, antes);
});

for (const [nombre, seleccionar] of [
  ["Personal", (e) => e.personal],
  ["Calendario", (e) => e.calendario],
  ["Licencias", (e) => e.licencias],
  ["Certificaciones", (e) => e.certificaciones],
  ["Responsables", (e) => e.responsables],
  ["Historial", (e) => e.historial]
]) {
  await probar(`${nombre} permanece intacto`, () => {
    const estado = legacy();
    assert.deepEqual(seleccionar(transicionar(estado).estado), seleccionar(estado));
  });
}

await probar("cambios previos permanecen intactos", () => {
  const estado = agregarActividad(legacy(), "cambiosDia", "2026-09-10");
  assert.deepEqual(transicionar(estado).estado.calendario.enfermeros.cambiosDia, estado.calendario.enfermeros.cambiosDia);
});
await probar("Extras previos permanecen intactos", () => {
  const estado = agregarActividad(legacy(), "extras", "2026-09-10", [{ id: "extra" }]);
  assert.deepEqual(transicionar(estado).estado.calendario.enfermeros.extras, estado.calendario.enfermeros.extras);
});
await probar("No disponibles previos permanecen intactos", () => {
  const estado = agregarActividad(legacy(), "noDisponibles", "2026-09-10", [{ personaId: "persona-E" }]);
  assert.deepEqual(transicionar(estado).estado.calendario.enfermeros.noDisponibles, estado.calendario.enfermeros.noDisponibles);
});
await probar("asistencia previa permanece intacta", () => {
  const estado = agregarActividad(legacy(), "asistenciaDia", "2026-09-10", { "persona-E": "presente" });
  assert.deepEqual(transicionar(estado).estado.calendario.enfermeros.asistenciaDia, estado.calendario.enfermeros.asistenciaDia);
});
await probar("cierre previo permanece intacto y no bloquea", () => {
  const estado = agregarActividad(legacy(), "cierresDia", "2026-09-10", { estado: "cerrado", snapshot: { versionSnapshot: 2 } });
  const actividad = analizarActividadDesdeFechaPreparacion({ estado, mes, desde: hoy, fechaReferencia: hoy });
  assert.equal(actividad.actividadDetectada, false);
  assert.deepEqual(transicionar(estado).estado.calendario.enfermeros.cierresDia, estado.calendario.enfermeros.cierresDia);
});

for (const [campo, valor] of [
  ["cierresDia", { estado: "cerrado", snapshot: { versionSnapshot: 2 } }],
  ["cambiosDia", { "REA 1": "persona-E" }],
  ["extras", [{ id: "extra" }]],
  ["noDisponibles", [{ personaId: "persona-E" }]],
  ["asistenciaDia", { "persona-E": "presente" }]
]) {
  await probar(`${campo} desde la vigencia bloquea`, () => {
    const actividad = analizarActividadDesdeFechaPreparacion({ estado: agregarActividad(legacy(), campo, hoy, valor), mes, desde: hoy, fechaReferencia: hoy });
    assert.equal(actividad.codigo, CODIGOS_TRANSICION_PREPARACIONES.ACTIVIDAD_DESDE_FECHA);
  });
}
await probar("día de paro desde la vigencia bloquea", () => assert.equal(analizarActividadDesdeFechaPreparacion({ estado: agregarActividad(legacy(), "diasParo", hoy, true), mes, desde: hoy, fechaReferencia: hoy }).actividadDetectada, true));
await probar("procedencias y cambios por paro también se detectan", () => {
  const estado = agregarActividad(legacy(), "procedenciaCambiosDia", hoy);
  agregarActividad(estado, "procedenciaCoberturaAutomaticaDia", hoy);
  agregarActividad(estado, "cambiosParoDia", hoy);
  assert.deepEqual(analizarActividadDesdeFechaPreparacion({ estado, mes, desde: hoy, fechaReferencia: hoy }).hallazgos.map((item) => item.campo).sort(), ["cambiosParoDia", "procedenciaCambiosDia", "procedenciaCoberturaAutomaticaDia"]);
});
await probar("actividad anterior no bloquea", () => assert.equal(analizarActividadDesdeFechaPreparacion({ estado: agregarActividad(legacy(), "cambiosDia", "2026-09-12"), mes, desde: hoy, fechaReferencia: hoy }).actividadDetectada, false));
await probar("novedad futura programada no bloquea ni se copia", () => {
  const novedades = [{ id: "nov-futura", fecha: "2026-09-20" }];
  const preparado = prepararAplicacionTransicionPreparaciones({ estado: legacy(), mes, turno: "tarde", desde: "2026-09-15", fechaReferencia: hoy, novedadesExternas: novedades, perfil: perfilSupervision, revisionEsperada: "7", revisionActual: "7" });
  assert.equal(preparado.ok, true);
  assert.equal(Object.hasOwn(preparado.estado.preparaciones[1], "novedades"), false);
});
await probar("novedad anterior no bloquea", () => assert.equal(analizarActividadDesdeFechaPreparacion({ estado: legacy(), mes, desde: hoy, fechaReferencia: hoy, novedadesExternas: [{ fecha: "2026-09-10" }] }).actividadDetectada, false));
await probar("novedad activa hoy bloquea transición desde hoy", () => assert.equal(analizarActividadDesdeFechaPreparacion({ estado: legacy(), mes, desde: hoy, fechaReferencia: hoy, turno: "tarde", novedadesExternas: [{ estado: "activa", turno: "tarde", desde: "2026-09-12", hasta: "2026-09-14" }] }).actividadDetectada, true));
await probar("Licencias y Certificaciones futuras no bloquean ni se copian", () => {
  const resultado = prepararAplicacionTransicionPreparaciones({ estado: legacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, perfil: perfilSupervision, revisionEsperada: "7", revisionActual: "7" });
  assert.equal(resultado.ok, true);
  assert.ok(resultado.estado.licencias.length && resultado.estado.certificaciones.length);
  assert.equal(Object.hasOwn(resultado.preparacionNueva, "licencias"), false);
});
await probar("hoy limpio permite", () => assert.equal(transicionar().ok, true));
await probar("ayer se rechaza", () => assert.equal(crearEstadoVersionadoDesdeLegacy({ estado: legacy(), mes, desde: "2026-09-12", fechaReferencia: hoy }).codigo, CODIGOS_PREPARACIONES_MES.NO_EDITABLE));
await probar("estado vacío no versiona", () => assert.equal(transicionar(crearEstadoMensualVacio()).codigo, CODIGOS_PREPARACIONES_MES.SIN_PREPARACION));
await probar("Personal solo no versiona", () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "p1" }];
  assert.equal(transicionar(estado).codigo, CODIGOS_PREPARACIONES_MES.LEGACY_NO_MATERIALIZABLE);
});
await probar("legacy parcial sin organización no versiona", () => {
  const estado = crearEstadoMensualVacio();
  estado.calendario.enfermeros.cambiosDia["2026-09-10"] = { dato: true };
  assert.equal(transicionar(estado).codigo, CODIGOS_PREPARACIONES_MES.LEGACY_NO_MATERIALIZABLE);
});
await probar("estado ya versionado no se rematerializa", () => {
  const estado = transicionar().estado;
  assert.equal(transicionar(estado).codigo, CODIGOS_TRANSICION_PREPARACIONES.ESTADO_YA_VERSIONADO);
});
await probar("top-level legacy permanece físicamente igual", () => {
  const estado = legacy();
  const resultado = transicionar(estado).estado;
  assert.deepEqual(resultado.planillas, estado.planillas);
  assert.deepEqual(resultado.configuracionPlanilla, estado.configuracionPlanilla);
});
await probar("normalizador preserva preparaciones", () => {
  const resultado = transicionar().estado;
  assert.deepEqual(normalizarEstadoMensual(resultado).preparaciones, resultado.preparaciones);
});
await probar("JSON round-trip preserva A/B", () => {
  const estado = transicionar().estado;
  assert.deepEqual(normalizarEstadoMensual(JSON.parse(JSON.stringify(estado))).preparaciones, estado.preparaciones);
});
await probar("Calendario resuelve A y B", () => {
  const estado = transicionar().estado;
  assert.deepEqual(["2026-09-10", hoy].map((fecha) => resolverOrganizacionMesPorFecha({ estado, mes, fecha }).preparacionId), ["preparacion-2026-09-01", "preparacion-2026-09-13"]);
});
await probar("Planilla resuelve tramos A/B", () => assert.deepEqual([...new Set(resolverTramosPlanillaMes({ estado: transicionar().estado, mes, turno: "tarde", categoria: "enfermero" }).tramos.map((tramo) => tramo.preparacionId))], ["preparacion-2026-09-01", "preparacion-2026-09-13"]));
await probar("PDF versionado genera", () => assert.equal(obtenerDocumentoPlanillaPDF({ estadoMensual: transicionar().estado, turnoId: "tarde", mesActivo: mes, personal: legacy().personal }).tipoDocumento, "planilla_mensual_versionada"));

await probar("Noche conserva fechaBase y ciclo", () => {
  const estado = legacy("noche");
  const bloques = obtenerBloquesQueIntersectanMes({ mesActivo: mes, fechaBase: "2026-07-02", duracionDias: 3 });
  estado.planillas.enfermeros = {
    rotacion3Dias: {
      fechaBase: "2026-07-02",
      duracionDias: 3,
      asignacionBase: { "REA 1": { personaId: "persona-E" } },
      bloques: Object.fromEntries(bloques.map(({ clave }, indice) => [clave, { "REA 1": { personaId: `noche-${indice}` } }])),
      coberturaLibreSM: {}
    }
  };
  const [a, b] = transicionar(estado).preparaciones;
  assert.equal(a.categorias.enfermero.planilla.rotacion3Dias.fechaBase, "2026-07-02");
  assert.deepEqual(b.categorias.enfermero.planilla.rotacion3Dias, a.categorias.enfermero.planilla.rotacion3Dias);
});

await probar("conflicto CAS bloquea antes de aplicar", () => assert.equal(prepararAplicacionTransicionPreparaciones({ estado: legacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, perfil: perfilSupervision, revisionEsperada: "7", revisionActual: "8" }).codigo, CODIGOS_TRANSICION_PREPARACIONES.CONFLICTO_REVISION));
await probar("Supervisión puede preparar cualquier turno", () => assert.equal(prepararAplicacionTransicionPreparaciones({ estado: legacy(), mes, turno: "noche", desde: hoy, fechaReferencia: hoy, perfil: perfilSupervision, revisionEsperada: "7", revisionActual: "7" }).ok, true));
await probar("Licenciado puede preparar su turno", () => assert.equal(prepararAplicacionTransicionPreparaciones({ estado: legacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, perfil: perfilLicenciado, revisionEsperada: "7", revisionActual: "7" }).ok, true));
await probar("Licenciado ajeno y Enfermería no pueden preparar", () => {
  const base = { estado: legacy(), mes, turno: "noche", desde: hoy, fechaReferencia: hoy, revisionEsperada: "7", revisionActual: "7" };
  assert.equal(prepararAplicacionTransicionPreparaciones({ ...base, perfil: perfilLicenciado }).codigo, CODIGOS_TRANSICION_PREPARACIONES.SIN_PERMISO);
  assert.equal(prepararAplicacionTransicionPreparaciones({ ...base, perfil: perfilEnfermeria }).codigo, CODIGOS_TRANSICION_PREPARACIONES.SIN_PERMISO);
});
await probar("sólo R actual entra en la operación", () => assert.equal(prepararAplicacionTransicionPreparaciones({ estado: legacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: "2026-10-01", perfil: perfilSupervision, revisionEsperada: "7", revisionActual: "7" }).codigo, CODIGOS_TRANSICION_PREPARACIONES.MES_NO_ACTUAL));
await probar("persistencia recibe A+B en una única escritura CAS", async () => {
  const llamadas = [];
  const resultado = await ejecutarTransicionPreparacionMes({ estado: legacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, perfil: perfilSupervision, revisionEsperada: "7", revisionActual: "7", guardar: async (argumentos) => { llamadas.push(argumentos); return { tipo: "guardado", revision: "8" }; } });
  assert.equal(resultado.aplicado, true);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].estado.preparaciones.length, 2);
  assert.equal(llamadas[0].revisionEsperada, "7");
});
await probar("persistencia conserva conflicto del servidor", async () => {
  const resultado = await ejecutarTransicionPreparacionMes({ estado: legacy(), mes, turno: "tarde", desde: hoy, fechaReferencia: hoy, perfil: perfilSupervision, revisionEsperada: "7", revisionActual: "7", guardar: async () => ({ tipo: "conflicto", revision: "8", estadoRemoto: legacy() }) });
  assert.equal(resultado.aplicado, false);
  assert.equal(resultado.persistencia.tipo, "conflicto");
});

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/mes/PanelPrepararMes.jsx", import.meta.url), "utf8");
await probar("PanelPrepararMes legacy no incorpora la UI versionada", () => {
  assert.doesNotMatch(panel, /Nueva preparación desde/);
});
await probar("el motor mantiene una única entrada de ejecución", () => {
  assert.match(app, /ejecutarTransicionPreparacionMes\(\{/);
  assert.equal((app.match(/ejecutarTransicionPreparacionMes\(\{/g) || []).length, 1);
});

console.log(`\n${total} comprobaciones de Etapa 40E.1 superadas.`);
