import assert from "node:assert/strict";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import {
  recalcularRedistribucionOpcion1Automatica,
  redistribuirCritica
} from "../src/utils/redistribucionEnfermeros.js";
import { normalizar } from "../src/utils/texto.js";

const configuracion = crearSnapshotConfiguracionPlanilla({
  turno: "manana",
  categoria: "enfermero",
  mes: "2026-09"
});
const filasConfiguracion = configuracion.filas;
const ordenVisual = [
  "REA 1", "REA 2", "1-3 + 21", "4-7", "8-13", "14-18",
  "19-20+22-24", "DX 25-30", "EXPLORA 1", "EXPLORA 2",
  "SILLÓN 1", "SILLON 2", "SILLONES 3", "PRE INT 1", "PRE INT 2", "SM"
];
const persona = (id, nombre, turnante = false) => ({ id, nombre, ...(turnante ? { esTurnante: true } : {}) });
const comunes = [
  ["rea_1", persona("alexandra", "Alexandra Zerpa")],
  ["rea_2", persona("diego", "Diego Correa")],
  ["boxes_1_3_21", persona("carolina", "Carolina Llanes")],
  ["boxes_4_7", persona("sergio", "Sergio Da Rosa", true)],
  ["boxes_8_13", persona("laura", "Laura Cardozo")],
  ["boxes_14_19", persona("estefani", "Estefani Balbis")],
  ["boxes_20_22_24", persona("jhoana", "Jhoana Diaz")],
  ["dx_25_30", persona("romina", "Romina Gonzalez", true)],
  ["explora_1", persona("jesica", "Jesica Benini")],
  ["explora_2", persona("maikol", "Maikol Rogelio")],
  ["sillon_1", persona("patricia", "Patricia Pintos")],
  ["sillon_2", persona("jessica", "Jessica Lopez")],
  ["sillones_3", persona("valentina", "Valentina De Leon", true)],
  ["pre_int_1", persona("milton", "Milton Menza")],
  ["pre_int_2", persona("gabriela", "Gabriela Aguero")],
  ["salud_mental", persona("silvina", "Silvina Noble")]
];
const filasPorId = new Map(filasConfiguracion.map((fila) => [fila.sectorId, fila]));
const etiquetasDinamicas = { sillones_3: "SILLONES 3" };
const asignaciones = comunes.map(([sectorId, enfermero]) => ({
  nombre: filasPorId.get(sectorId)?.etiqueta || etiquetasDinamicas[sectorId],
  sectorId,
  enfermero,
  tipo: "sector"
}));
const prioridadSectorIds = [
  "pre_int_2", "sillones_3", "rea_1", "boxes_1_3_21", "boxes_4_7",
  "boxes_8_13", "boxes_14_19", "boxes_20_22_24", "dx_25_30",
  "sillon_1", "explora_1", "pre_int_1", "salud_mental", "sillon_2",
  "explora_2", "rea_2"
];
const destino = (resultado, nombre) =>
  resultado.asignaciones.find((fila) => normalizar(fila.nombre) === normalizar(nombre));

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const resultado = redistribuirCritica({
  asignaciones,
  ordenVisual,
  filasConfiguracion,
  prioridadSectorIds
});

const paralelismo = [
  ["REA 1", "alexandra"], ["REA 2", "diego"],
  ["1–3 + 19–22", "carolina"], ["4–10", "sergio"],
  ["11–18", "laura"], ["23–30", "romina"],
  ["EXPLORA 1", "jesica"], ["EXPLORA 2", "maikol"],
  ["SILLÓN 1", "patricia"], ["SILLON 2", "jessica"],
  ["SILLONES 3", "valentina"], ["PRE INT 1", "milton"],
  ["PRE INT 2", "gabriela"], ["SM", "silvina"]
];

probar("Día 9 conserva identidad por sector y transforma sólo cuatro boxes", () => {
  for (const [nombre, personaId] of paralelismo) {
    assert.equal(destino(resultado, nombre)?.enfermero?.id, personaId, nombre);
  }
});

probar("14–18 y 19-20+22-24 se anulan y liberan sus personas al pool Turnante", () => {
  assert.equal(resultado.asignaciones.some((fila) => normalizar(fila.nombre) === normalizar("14-18")), false);
  assert.equal(resultado.asignaciones.some((fila) => normalizar(fila.nombre) === normalizar("19-20+22-24")), false);
  const recursos = resultado.asignaciones
    .filter((fila) => fila.tipo === "turnante")
    .map((fila) => fila.enfermero?.id)
    .filter(Boolean);
  assert.deepEqual(recursos, ["estefani", "jhoana"]);
});

probar("Turnantes que ya cubren un sector respetan el paralelismo y no se duplican", () => {
  for (const personaId of ["sergio", "romina", "valentina"]) {
    assert.equal(resultado.asignaciones.filter((fila) => fila.enfermero?.id === personaId).length, 1);
  }
});

probar("la prioridad extrema no altera la fase estructural", () => {
  assert.equal(destino(resultado, "REA 2").enfermero.id, "diego");
  assert.equal(destino(resultado, "PRE INT 2").enfermero.id, "gabriela");
});

probar("reconstrucciones sucesivas mantienen el resultado semántico", () => {
  const procedenciaCambiosDia = Object.fromEntries(
    Object.keys(resultado.cambios).map((clave) => [clave, "redistribucion_automatica"])
  );
  const parametros = {
    cambiosDia: resultado.cambios,
    procedenciaCambiosDia,
    ordenVisual,
    filasConfiguracion,
    prioridadSectorIds
  };
  const r1 = recalcularRedistribucionOpcion1Automatica({
    ...parametros,
    asignaciones: resultado.asignaciones
  });
  const r2 = recalcularRedistribucionOpcion1Automatica({ ...parametros, asignaciones: r1 });
  const firma = (filas) => filas.map((fila) => [fila.nombre, fila.enfermero?.id || null]);
  assert.deepEqual(firma(r1), firma(resultado.asignaciones));
  assert.deepEqual(r2, r1);
});

probar("ninguna identidad del Día 9 se pierde ni se duplica", () => {
  const ids = resultado.asignaciones.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(ids.length, comunes.length);
  assert.equal(new Set(ids).size, comunes.length);
});

probar("un movimiento manual conserva identidad, destino y procedencia protegida", () => {
  const conManual = asignaciones.map((fila) => fila.sectorId === "rea_2"
    ? { ...fila, cambioManualProtegido: true }
    : fila);
  const manual = redistribuirCritica({
    asignaciones: conManual,
    ordenVisual,
    filasConfiguracion,
    prioridadSectorIds
  });
  assert.equal(destino(manual, "REA 2").enfermero.id, "diego");
  assert.equal(manual.procedencias[normalizar("REA 2")], "manual");
});

console.log(`\n${total} pruebas conductuales del paralelismo de opción 1 aprobadas.`);
