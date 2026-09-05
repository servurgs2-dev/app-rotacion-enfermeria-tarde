import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  CODIGOS_PREPARACIONES_MES,
  resolverOrganizacionMesPorFecha,
  resolverTramosPlanillaMes
} from "../src/utils/preparacionesMes.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";
import { obtenerSemanasDelMes } from "../src/utils/fechas.js";
import { resolverDatosPresentacionCierreTurno } from "../src/utils/cierreTurno.js";
import {
  obtenerDocumentoPlanillaPDF,
  prepararTablaPlanillaTramosPDF
} from "../src/utils/exportPDF.js";
import { analizarRecuperacionMesActual } from "../src/utils/recuperacionMesActual.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const mes = "2026-09";
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const planillaSemanal = (marca) => Object.fromEntries([
  ...Array.from({ length: 6 }, (_, indice) => [
    `semana${indice + 1}`,
    { "REA 1": { personaId: `persona-${marca}` } }
  ]),
  ["coberturaLibreSM", {}],
  ["posicionesMensualesAdicionales", [`T-${marca}`]]
]);
const configuracion = (turno, categoria, marca) => ({
  ...crearSnapshotConfiguracionPlanilla({ turno, categoria, mes }),
  marca,
  prioridadCoberturaSectorIds: [`prioridad-${marca}`],
  asignacionesFijas: [{ sectorId: `fija-${marca}`, personaId: `persona-${marca}` }],
  ...(categoria === "licenciado" ? { estructuraLicenciadosVersion: marca.endsWith("B") ? 2 : 1 } : {})
});
const preparacion = (id, desde, hasta, marca, turno = "tarde") => ({
  id,
  desde,
  hasta,
  origen: "prueba",
  creadaEn: null,
  creadaPor: null,
  categorias: {
    enfermero: {
      planilla: planillaSemanal(marca),
      configuracion: configuracion(turno, "enfermero", marca)
    },
    licenciado: {
      planilla: planillaSemanal(`L${marca}`),
      configuracion: configuracion(turno, "licenciado", `L${marca}`)
    }
  }
});
const estadoAB = () => ({
  ...crearEstadoMensualVacio(),
  planillas: { enfermeros: planillaSemanal("TOP"), licenciados: planillaSemanal("LTOP") },
  configuracionPlanilla: {
    enfermero: configuracion("tarde", "enfermero", "TOP"),
    licenciado: configuracion("tarde", "licenciado", "LTOP")
  },
  preparaciones: [
    preparacion("A", "2026-09-01", "2026-09-12", "A"),
    preparacion("B", "2026-09-13", "2026-09-30", "B")
  ]
});
const estadoLegacy = (turno = "tarde") => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros = planillaSemanal("LEGACY");
  estado.planillas.licenciados = planillaSemanal("LLEGACY");
  estado.configuracionPlanilla = {
    enfermero: configuracion(turno, "enfermero", "LEGACY"),
    licenciado: configuracion(turno, "licenciado", "LLEGACY")
  };
  return estado;
};

await probar("legacy semanal conserva exactamente sus períodos", () => {
  const resultado = resolverTramosPlanillaMes({ estado: estadoLegacy(), mes, turno: "tarde", categoria: "enfermero" });
  assert.equal(resultado.origen, "legacy");
  assert.deepEqual(resultado.tramos.map((tramo) => tramo.clavePeriodo), obtenerSemanasDelMes(mes).map((periodo) => periodo.clave));
});

const crearNoche = (versionado = false) => {
  const bloques = obtenerBloquesQueIntersectanMes({ mesActivo: mes, fechaBase: "2026-07-02", duracionDias: 3 });
  const crearPlanilla = (marca) => ({
    rotacion3Dias: {
      fechaBase: "2026-07-02",
      duracionDias: 3,
      asignacionBase: { "REA 1": { personaId: `base-${marca}` } },
      bloques: Object.fromEntries(bloques.map(({ clave }) => [clave, { "REA 1": { personaId: `noche-${marca}` } }])),
      coberturaLibreSM: {}
    }
  });
  if (!versionado) {
    const estado = estadoLegacy("noche");
    estado.planillas.enfermeros = crearPlanilla("LEGACY");
    return estado;
  }
  const estado = estadoAB();
  estado.preparaciones = estado.preparaciones.map((item) => ({
    ...item,
    categorias: {
      ...item.categorias,
      enfermero: {
        planilla: crearPlanilla(item.id),
        configuracion: configuracion("noche", "enfermero", item.id)
      }
    }
  }));
  return estado;
};

await probar("legacy Noche conserva los bloques actuales", () => {
  const resultado = resolverTramosPlanillaMes({ estado: crearNoche(), mes, turno: "noche", categoria: "enfermero" });
  assert.deepEqual(resultado.tramos.map((tramo) => tramo.clavePeriodo), obtenerBloquesQueIntersectanMes({ mesActivo: mes, fechaBase: "2026-07-02", duracionDias: 3 }).map((periodo) => periodo.clave));
});

await probar("vacío no inventa tramos", () => {
  const resultado = resolverTramosPlanillaMes({ estado: crearEstadoMensualVacio(), mes, turno: "tarde", categoria: "enfermero" });
  assert.equal(resultado.codigo, CODIGOS_PREPARACIONES_MES.SIN_PREPARACION);
  assert.deepEqual(resultado.tramos, []);
});

await probar("Personal solo no inventa tramos", () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "p1" }];
  assert.equal(resolverTramosPlanillaMes({ estado, mes, turno: "tarde", categoria: "enfermero" }).codigo, CODIGOS_PREPARACIONES_MES.LEGACY_NO_MATERIALIZABLE);
});

const tramosAB = () => resolverTramosPlanillaMes({ estado: estadoAB(), mes, turno: "tarde", categoria: "enfermero" }).tramos;
await probar("A/B genera tramos para ambas preparaciones", () => assert.deepEqual([...new Set(tramosAB().map((tramo) => tramo.preparacionId))], ["A", "B"]));
await probar("semana 07–13 se divide A/B", () => {
  const semana2 = tramosAB().filter((tramo) => tramo.clavePeriodo === "semana2");
  assert.deepEqual(semana2.map(({ preparacionId, desde, hasta }) => ({ preparacionId, desde, hasta })), [
    { preparacionId: "A", desde: "2026-09-07", hasta: "2026-09-12" },
    { preparacionId: "B", desde: "2026-09-13", hasta: "2026-09-13" }
  ]);
});
await probar("12 usa A", () => assert.equal(tramosAB().find((tramo) => tramo.desde <= "2026-09-12" && tramo.hasta >= "2026-09-12").preparacionId, "A"));
await probar("13 usa B", () => assert.equal(tramosAB().find((tramo) => tramo.desde <= "2026-09-13" && tramo.hasta >= "2026-09-13").preparacionId, "B"));
await probar("IDs de tramo son únicos", () => assert.equal(new Set(tramosAB().map((tramo) => tramo.id)).size, tramosAB().length));
await probar("orden de tramos es cronológico", () => assert.deepEqual(tramosAB().map((tramo) => tramo.desde), [...tramosAB().map((tramo) => tramo.desde)].sort()));

await probar("A/B/C soporta tres preparaciones", () => {
  const estado = estadoAB();
  estado.preparaciones = [
    preparacion("A", "2026-09-01", "2026-09-10", "A"),
    preparacion("B", "2026-09-11", "2026-09-20", "B"),
    preparacion("C", "2026-09-21", "2026-09-30", "C")
  ];
  assert.deepEqual([...new Set(resolverTramosPlanillaMes({ estado, mes, turno: "tarde", categoria: "enfermero" }).tramos.map((tramo) => tramo.preparacionId))], ["A", "B", "C"]);
});

await probar("bloque Noche atravesado se divide", () => {
  const tramos = resolverTramosPlanillaMes({ estado: crearNoche(true), mes, turno: "noche", categoria: "enfermero" }).tramos;
  const clave = tramos.find((tramo) => tramo.desde <= "2026-09-12" && tramo.hasta >= "2026-09-12").clavePeriodo;
  assert.deepEqual(tramos.filter((tramo) => tramo.clavePeriodo === clave).map(({ preparacionId, desde, hasta }) => ({ preparacionId, desde, hasta })), [
    { preparacionId: "A", desde: "2026-09-12", hasta: "2026-09-12" },
    { preparacionId: "B", desde: "2026-09-13", hasta: "2026-09-14" }
  ]);
});
await probar("fechaBase Noche no cambia", () => assert.ok(resolverTramosPlanillaMes({ estado: crearNoche(true), mes, turno: "noche", categoria: "enfermero" }).tramos.every((tramo) => tramo.planilla.rotacion3Dias.fechaBase === "2026-07-02")));
await probar("Turnantes A/B no se mezclan", () => assert.deepEqual(tramosAB().filter((tramo) => ["A", "B"].includes(tramo.preparacionId)).map((tramo) => tramo.planilla.posicionesMensualesAdicionales[0]).filter((valor, indice, todos) => todos.indexOf(valor) === indice), ["T-A", "T-B"]));
await probar("prioridades A/B no se mezclan", () => assert.deepEqual([...new Set(tramosAB().map((tramo) => tramo.configuracionPlanilla.prioridadCoberturaSectorIds[0]))], ["prioridad-A", "prioridad-B"]));
await probar("asignaciones fijas A/B no se mezclan", () => assert.deepEqual([...new Set(tramosAB().map((tramo) => tramo.configuracionPlanilla.asignacionesFijas[0].personaId))], ["persona-A", "persona-B"]));
await probar("Licenciados v2 pertenece a B", () => {
  const tramos = resolverTramosPlanillaMes({ estado: estadoAB(), mes, turno: "tarde", categoria: "licenciado" }).tramos;
  assert.equal(tramos.find((tramo) => tramo.preparacionId === "B").configuracionPlanilla.estructuraLicenciadosVersion, 2);
});
await probar("configuración y Planilla comparten preparacionId", () => assert.ok(tramosAB().every((tramo) => tramo.configuracionPlanilla.marca === tramo.preparacionId && tramo.distribucion["REA 1"].personaId === `persona-${tramo.preparacionId}`)));
await probar("operaciones diarias no entran a los tramos", () => {
  const estado = estadoAB();
  estado.calendario.enfermeros.cambiosDia = { "2026-09-13": { "REA 1": "manual" } };
  assert.ok(resolverTramosPlanillaMes({ estado, mes, turno: "tarde", categoria: "enfermero" }).tramos.every((tramo) => !Object.hasOwn(tramo, "calendario") && !Object.hasOwn(tramo, "cambiosDia")));
});
await probar("Calendario 40D sigue resolviendo A/B", () => assert.equal(resolverOrganizacionMesPorFecha({ estado: estadoAB(), mes, fecha: "2026-09-13" }).preparacionId, "B"));
await probar("cierres siguen usando snapshot", () => assert.equal(resolverDatosPresentacionCierreTurno({ snapshot: { versionSnapshot: 2, asignaciones: [] }, reconstruccion: { asignaciones: ["B"] } }).fuente, "snapshot_cierre"));

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const vista = await readFile(new URL("../src/components/planilla/PlanillaMensualPorTramos.jsx", import.meta.url), "utf8");
const legacy = await readFile(new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url), "utf8");
const pdfFuente = await readFile(new URL("../src/utils/exportPDF.js", import.meta.url), "utf8");
await probar("legacy mantiene su componente editable", () => assert.match(app, /tienePreparacionesVersionadasMes \? \([\s\S]*PlanillaMensualPorTramos[\s\S]*\) : \([\s\S]*<PlanillaMensual/));
await probar("versionado no escribe top-level desde acciones estructurales", () => assert.doesNotMatch(vista, /setPlanilla|setEstadoPorTurnoMes|onChange/));
await probar("versionado queda explícitamente en lectura", () => assert.match(vista, /permanece en modo lectura/));
await probar("PDF legacy conserva la ruta actual", () => assert.match(pdfFuente, /if \(Object\.hasOwn\(estadoMensual \|\| \{\}, "preparaciones"\)\)[\s\S]*const estrategiaEnfermeros/));
await probar("PDF versionado usa los mismos tramos", () => assert.match(pdfFuente, /crearPlanillaVersionadaPDF[\s\S]*resolverTramosPlanillaMes/));
await probar("tabla PDF versionada conserva cortes", () => assert.deepEqual(prepararTablaPlanillaTramosPDF({ tramos: tramosAB(), personal: [{ id: "persona-A", nombre: "A" }, { id: "persona-B", nombre: "B" }], categoria: "enfermero" }).encabezados.slice(1), tramosAB().map((tramo) => tramo.etiqueta)));
await probar("documento PDF versionado se genera", () => assert.equal(obtenerDocumentoPlanillaPDF({ estadoMensual: estadoAB(), turnoId: "tarde", mesActivo: mes, personal: [] }).tipoDocumento, "planilla_mensual_versionada"));
await probar("correo conserva el generador de PDF de Planilla", () => assert.match(app, /generarPDF=\{async \(\) => \{[\s\S]*obtenerAdjuntoPlanillaPDF\(\{/));
await probar("colección corrupta no hace fallback ni PDF", () => {
  const estado = estadoAB();
  estado.preparaciones = [{ id: "rota", desde: "2026-09-20", hasta: "2026-09-10" }];
  const resultado = resolverTramosPlanillaMes({ estado, mes, turno: "tarde", categoria: "enfermero" });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.origen, "versionado");
  assert.throws(() => obtenerDocumentoPlanillaPDF({ estadoMensual: estado, turnoId: "tarde", mesActivo: mes }));
});
await probar("40B vacío continúa recuperable", () => assert.equal(analizarRecuperacionMesActual({ mes, mesReferencia: mes, fechaReferencia: new Date(2026, 8, 2, 12), turno: "noche", estado: crearEstadoMensualVacio(), novedadesExternas: [], padronVigencias: { personas: [] }, auditoriaExternaDisponible: true }).permitida, true));
await probar("resolver tramos no muta estado", () => {
  const estado = estadoAB();
  const antes = clonar(estado);
  resolverTramosPlanillaMes({ estado, mes, turno: "tarde", categoria: "enfermero" });
  assert.deepEqual(estado, antes);
});
await probar("App todavía no crea preparaciones", () => assert.doesNotMatch(app, /preparaciones\s*:/));
await probar("Planilla no ofrece crear preparaciones", () => assert.doesNotMatch(vista, /Nueva preparación desde/));
await probar("mobile conserva tabla horizontal navegable", () => assert.match(vista, /overflow-x-auto[\s\S]*min-w-\[900px\]/));
await probar("componente legacy no incorpora autoridad versionada", () => assert.doesNotMatch(legacy, /resolverTramosPlanillaMes|preparaciones/));

console.log(`\n${total} comprobaciones de Etapa 40D.1 superadas.`);
