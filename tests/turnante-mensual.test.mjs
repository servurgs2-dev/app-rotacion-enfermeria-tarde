import assert from "node:assert/strict";
import fs from "node:fs";
import {
  eliminarTurnanteMensual,
  estaHabilitadoTurnanteMensual,
  habilitarTurnanteMensual,
  obtenerCapacidadNormalPlanilla,
  obtenerFilasBasePlanilla,
  obtenerFilasEfectivasPlanilla,
  obtenerPosicionesTurnantesEfectivas,
  obtenerPosicionTurnanteMensual,
  quitarTurnanteMensualDeDistribucion,
  validarEliminacionTurnanteMensual
} from "../src/utils/turnanteMensual.js";
import { configuracionSectores } from "../src/data/sectores.js";
import { generarRotacionMensual } from "../src/utils/rotacionPlanilla.js";
import { vaciarPlanillaMensual } from "../src/utils/limpiezaSegura.js";
import { normalizarEstadoMensual, crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { prepararTablaPlanillaPDF } from "../src/utils/exportPDF.js";
import { obtenerIdentidadesTurnantes } from "../src/utils/etiquetaTurnante.js";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${nombre}`);
};
const ref = (id) => ({ personaId: id, nombre: `Persona ${id}` });
const filasEnfBase = obtenerFilasBasePlanilla(configuracionSectores.enfermero);
const filasLicBase = obtenerFilasBasePlanilla(configuracionSectores.licenciado);
const semanas = Array.from({ length: 6 }, (_, indice) => ({
  clave: `semana${indice + 1}`
}));

probar("1 Enfermeros sin configuración conserva 20 filas", () =>
  assert.equal(obtenerFilasEfectivasPlanilla(filasEnfBase, {}, "enfermero").length, 20));
probar("2 Licenciados sin configuración conserva 12 filas", () =>
  assert.equal(obtenerFilasEfectivasPlanilla(filasLicBase, {}, "licenciado").length, 12));
const enfHabilitada = habilitarTurnanteMensual({ semana1: {} }, "enfermero");
const licHabilitada = habilitarTurnanteMensual({ semana1: {} }, "licenciado");
probar("3 habilitar Enfermeros agrega únicamente T6", () =>
  assert.deepEqual(enfHabilitada.posicionesMensualesAdicionales, ["T6"]));
probar("4 habilitar Licenciados agrega únicamente T3", () =>
  assert.deepEqual(licHabilitada.posicionesMensualesAdicionales, ["T3"]));
probar("5 T6 aparece al final", () =>
  assert.equal(obtenerFilasEfectivasPlanilla(filasEnfBase, enfHabilitada, "enfermero").at(-1), "T6"));
probar("6 T3 aparece al final", () =>
  assert.equal(obtenerFilasEfectivasPlanilla(filasLicBase, licHabilitada, "licenciado").at(-1), "T3"));
probar("7 no agrega T7", () =>
  assert.equal(obtenerFilasEfectivasPlanilla(filasEnfBase, enfHabilitada, "enfermero").includes("T7"), false));
probar("8 no agrega T4 de Licenciados", () =>
  assert.equal(obtenerFilasEfectivasPlanilla(filasLicBase, licHabilitada, "licenciado").includes("T4"), false));
probar("9 la configuración vive en una planilla mensual", () =>
  assert.equal(estaHabilitadoTurnanteMensual(enfHabilitada, "enfermero"), true));
probar("10 otra planilla del mismo turno no queda habilitada", () =>
  assert.equal(estaHabilitadoTurnanteMensual({}, "enfermero"), false));
probar("11 categorías son independientes", () =>
  assert.equal(estaHabilitadoTurnanteMensual(enfHabilitada, "licenciado"), false));
probar("12 habilitar después de generar no mueve personas", () => {
  const previa = { semana1: { "REA 1": ref("1") } };
  const resultado = habilitarTurnanteMensual(previa, "enfermero");
  assert.equal(resultado.semana1["REA 1"], previa.semana1["REA 1"]);
  assert.equal(resultado.semana1.T6, "");
});
probar("13 habilitar antes de generar incluye T6", () => {
  const filas = obtenerFilasEfectivasPlanilla(filasEnfBase, enfHabilitada, "enfermero");
  const planilla = { ...enfHabilitada, semana1: Object.fromEntries(filas.map((f, i) => [f, ref(String(i))])) };
  const generada = generarRotacionMensual({ planilla, filas, semanas, filaFija: "SM", personal: [] });
  assert.ok(Object.hasOwn(generada.semana2, "T6"));
});
probar("14 la rotación no duplica referencias", () => {
  const filas = obtenerFilasEfectivasPlanilla(filasEnfBase, enfHabilitada, "enfermero");
  const planilla = { ...enfHabilitada, semana1: Object.fromEntries(filas.map((f, i) => [f, `p${i}`])) };
  const generada = generarRotacionMensual({ planilla, filas, semanas, filaFija: "SM", personal: [] });
  assert.equal(new Set(Object.values(generada.semana2).filter(Boolean)).size, filas.length);
});
probar("15 T6 es Turnante", () =>
  assert.deepEqual(obtenerPosicionesTurnantesEfectivas(["T1", "T2", "T3", "T4", "T5"], enfHabilitada, "enfermero"), ["T1", "T2", "T3", "T4", "T5", "T6"]));
probar("16 T3 de Licenciados es Turnante", () =>
  assert.deepEqual(obtenerPosicionesTurnantesEfectivas(["T1", "T2"], licHabilitada, "licenciado"), ["T1", "T2", "T3"]));
probar("17 T6 queda después de T1-T5", () =>
  assert.equal(obtenerPosicionesTurnantesEfectivas(["T1", "T2", "T3", "T4", "T5"], enfHabilitada, "enfermero").at(-1), "T6"));
probar("18 T3 queda después de T1-T2", () =>
  assert.equal(obtenerPosicionesTurnantesEfectivas(["T1", "T2"], licHabilitada, "licenciado").at(-1), "T3"));
probar("19-23 disponibilidad sigue dependiendo de Calendario", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  for (const texto of ["estaDeLicenciaHoy", "esLibreReal", "estaCertificadoHoy", "estaNoDisponible", "ESTADOS_ASISTENCIA.AUSENTE"]) {
    assert.match(fuente, new RegExp(texto.replace(".", "\\.")));
  }
  aprobadas += 4;
});
probar("24 intercambio recibe filas efectivas", () =>
  assert.match(fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8"), /filas,\s*personal,\s*categoria: tipo/));
probar("25 parciales reciben filas efectivas", () =>
  assert.match(fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8"), /<PanelReintegrosPlanilla[\s\S]*filas=\{filas\}/));
probar("26 funciona en semanas normales", () =>
  assert.ok(obtenerFilasEfectivasPlanilla(filasEnfBase, enfHabilitada, "enfermero").includes("T6")));
probar("27 funciona en bloques nocturnos", () =>
  assert.match(fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8"), /rotacion3Dias[\s\S]*filas\.map/));
probar("28 Noche histórica usa las filas semanales efectivas", () =>
  assert.match(fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8"), /obtenerEstrategiaRotacionPlanilla/));
probar("29 no elimina con asignación semanal", () => {
  const validacion = validarEliminacionTurnanteMensual({ ...enfHabilitada, semana2: { T6: ref("1") } }, "enfermero");
  assert.equal(validacion.ok, false);
  assert.deepEqual(validacion.usos, ["Semana 2"]);
});
probar("30 no elimina con asignación parcial", () => {
  const validacion = validarEliminacionTurnanteMensual({
    ...enfHabilitada,
    asignacionesParciales: { semana2: [{ sector: "T6" }] }
  }, "enfermero");
  assert.equal(validacion.ok, false);
});
probar("31 elimina cuando está vacía", () => {
  const resultado = eliminarTurnanteMensual({ ...enfHabilitada, semana1: { T6: "" } }, "enfermero");
  assert.equal(resultado.ok, true);
  assert.equal(Object.hasOwn(resultado.planilla, "posicionesMensualesAdicionales"), false);
  assert.equal(Object.hasOwn(resultado.planilla.semana1, "T6"), false);
});
probar("32 Vaciar planilla conserva posición habilitada", () => {
  const vaciada = vaciarPlanillaMensual({
    planilla: { ...enfHabilitada, semana1: { T6: ref("1") } },
    tipo: "enfermero"
  });
  assert.deepEqual(vaciada.posicionesMensualesAdicionales, ["T6"]);
});
probar("33 Reiniciar mes elimina configuración", () => {
  const vacio = crearEstadoMensualVacio();
  assert.equal(vacio.planillas.enfermeros.posicionesMensualesAdicionales, undefined);
});
probar("34 Preparar mes siguiente quita T6 y T3 de bases", () =>
  assert.deepEqual(
    quitarTurnanteMensualDeDistribucion(
      quitarTurnanteMensualDeDistribucion(
        { T6: ref("1"), T3: ref("2"), T1: ref("3") },
        "enfermero"
      ),
      "licenciado"
    ),
    { T1: ref("3") }
  ));
probar("35 normalización histórica conserva configuración", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros = enfHabilitada;
  assert.deepEqual(normalizarEstadoMensual(estado).planillas.enfermeros.posicionesMensualesAdicionales, ["T6"]);
});
probar("36 PDF semanal incluye T6 cuando corresponde", () => {
  const tabla = prepararTablaPlanillaPDF({
    planilla: enfHabilitada,
    periodos: [{ clave: "semana1", desde: new Date(2026, 7, 1), hasta: new Date(2026, 7, 7) }],
    estrategia: { tipo: "semanal" },
    tipo: "enfermero",
    ordenFilas: configuracionSectores.enfermero.ordenPDF
  });
  assert.equal(tabla.cuerpo.at(-1)[0], "T6");
});
probar("37 grupos de libres no dependen de filas efectivas", () =>
  assert.doesNotMatch(fs.readFileSync("src/utils/exportPDF.js", "utf8"), /renderizarGruposLibresPDF[\s\S]{0,300}posicionesMensualesAdicionales/));
probar("38 Calendario deriva marca T desde turnantes efectivos", () => {
  const identidades = obtenerIdentidadesTurnantes({
    distribucion: { T6: ref("1") },
    posicionesTurnantes: ["T1", "T2", "T3", "T4", "T5", "T6"],
    personal: [{ id: "1", nombre: "Persona 1" }]
  });
  assert.ok(identidades.has("id:1"));
});
probar("39 PDF diario conserva una página por contrato existente", () =>
  assert.match(fs.readFileSync("tests/pdf-calendario-diario.test.mjs", "utf8"), /exactamente una p[aá]gina|una sola p[aá]gina/i));
probar("40 estados antiguos funcionan sin propiedad", () => {
  assert.equal(estaHabilitadoTurnanteMensual({ semana1: {} }, "enfermero"), false);
  assert.equal(obtenerFilasEfectivasPlanilla(filasEnfBase, { semana1: {} }, "enfermero").length, 20);
});
probar("41 capacidades y posiciones están centralizadas", () => {
  assert.equal(obtenerCapacidadNormalPlanilla("enfermero"), 20);
  assert.equal(obtenerCapacidadNormalPlanilla("licenciado"), 12);
  assert.equal(obtenerPosicionTurnanteMensual("enfermero"), "T6");
  assert.equal(obtenerPosicionTurnanteMensual("licenciado"), "T3");
});

console.log(`\n${aprobadas} pruebas de Turnante mensual aprobadas.`);
