import assert from "node:assert/strict";
import {
  recalcularRedistribucionOpcion1Automatica,
  recalcularRedistribucionOpcion2Automatica,
  redistribuirCritica,
  redistribuirPorBoxes
} from "../src/utils/redistribucionEnfermeros.js";

const filasConfiguracion = [
  { tipo: "sector", sectorId: "rea_1", etiqueta: "REA 1" },
  { tipo: "sector", sectorId: "boxes_1_3_21", etiqueta: "1–3 + 21" },
  { tipo: "sector", sectorId: "boxes_4_7", etiqueta: "4–7" },
  { tipo: "sector", sectorId: "boxes_8_13", etiqueta: "8–13" },
  { tipo: "sector", sectorId: "boxes_14_19", etiqueta: "14–19" },
  { tipo: "sector", sectorId: "boxes_20_22_24", etiqueta: "20+22–24" },
  { tipo: "sector", sectorId: "dx_25_30", etiqueta: "DX 25–30" },
  { tipo: "sector", sectorId: "sillon_1", etiqueta: "SILLÓN 1" },
  { tipo: "sector", sectorId: "explora_1", etiqueta: "EXPLORA 1" },
  { tipo: "sector", sectorId: "pre_int_1", etiqueta: "PRE INT 1" },
  { tipo: "sector", sectorId: "salud_mental", etiqueta: "SM" },
  { tipo: "sector", sectorId: "pre_int_2", etiqueta: "PRE INT 2" },
  { tipo: "sector", sectorId: "sillon_2", etiqueta: "SILLON 2" },
  { tipo: "sector", sectorId: "explora_2", etiqueta: "EXPLORA 2" },
  { tipo: "sector", sectorId: "rea_2", etiqueta: "REA 2" },
  { tipo: "sector", sectorId: "sillones_3", etiqueta: "SILLONES 3" }
];
const ordenVisual = filasConfiguracion.map((fila) => fila.etiqueta);
const asignaciones = Array.from({ length: 13 }, (_, indice) => ({
  nombre: `Origen ${indice + 1}`,
  enfermero: { id: `persona-${indice + 1}`, nombre: `Persona ${indice + 1}` },
  tipo: "sector"
}));
const prioridadExtrema = [
  "sillones_3",
  "pre_int_2",
  ...filasConfiguracion.map((fila) => fila.sectorId)
];
const firma = (filas) => filas.map((fila) => ({
  nombre: fila.nombre,
  personaId: fila.enfermero?.id || null
}));

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

for (const [nombre, generar, recalcular] of [
  ["opción 1", redistribuirCritica, recalcularRedistribucionOpcion1Automatica],
  ["opción 2", redistribuirPorBoxes, recalcularRedistribucionOpcion2Automatica]
]) {
  probar(`${nombre} filtra la prioridad por su universo operativo`, () => {
    const inicial = generar({
      asignaciones,
      ordenVisual,
      filasConfiguracion,
      prioridadSectorIds: prioridadExtrema
    });
    assert.equal(inicial.asignaciones[0].nombre, "PRE INT 2");
    assert.equal(
      inicial.asignaciones.find((fila) => fila.nombre === "SILLONES 3")?.enfermero || null,
      null
    );
  });

  probar(`${nombre} conserva destinos y alcanza punto fijo con prioridad extrema`, () => {
    const inicial = generar({
      asignaciones,
      ordenVisual,
      filasConfiguracion,
      prioridadSectorIds: prioridadExtrema
    });
    const procedenciaCambiosDia = Object.fromEntries(
      Object.keys(inicial.cambios).map((clave) => [clave, "redistribucion_automatica"])
    );
    const parametros = {
      cambiosDia: inicial.cambios,
      procedenciaCambiosDia,
      ordenVisual,
      filasConfiguracion,
      prioridadSectorIds: prioridadExtrema
    };
    const r1 = recalcular({ ...parametros, asignaciones: inicial.asignaciones });
    const r2 = recalcular({ ...parametros, asignaciones: r1 });
    assert.deepEqual(firma(r1), firma(inicial.asignaciones));
    assert.deepEqual(r2, r1);
    assert.equal(new Set(r2.map((fila) => fila.enfermero?.id).filter(Boolean)).size, 13);
  });
}

console.log(`\n${total} pruebas conductuales de destinos de redistribución aprobadas.`);
