import assert from "node:assert/strict";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import {
  recalcularRedistribucionOpcion1Automatica,
  recalcularRedistribucionOpcion2Automatica,
  redistribuirCritica,
  redistribuirPorBoxes
} from "../src/utils/redistribucionEnfermeros.js";
import {
  MODOS_REDISTRIBUCION_DIARIA,
  resolverDistribucionDiaria
} from "../src/utils/resolverDistribucionDiaria.js";
import { normalizar } from "../src/utils/texto.js";

const configuracion = crearSnapshotConfiguracionPlanilla({
  turno: "manana", categoria: "enfermero", mes: "2026-09"
});
const filasConfiguracion = configuracion.filas;
const ordenVisual = [
  "REA 1", "REA 2", "1-3 + 21", "4-7", "8-13", "14-18",
  "19-20+22-24", "DX 25-30", "EXPLORA 1", "EXPLORA 2",
  "SILLÓN 1", "SILLON 2", "SILLONES 3", "PRE INT 1", "PRE INT 2", "SM"
];
const datos = [
  ["rea_1", "alexandra"], ["rea_2", "diego"],
  ["boxes_1_3_21", "carolina"], ["boxes_4_7", "sergio"],
  ["boxes_8_13", "laura"], ["boxes_14_19", "estefani"],
  ["boxes_20_22_24", "jhoana"], ["dx_25_30", "romina"],
  ["explora_1", "jesica"], ["explora_2", "maikol"],
  ["sillon_1", "patricia"], ["sillon_2", "jessica"],
  ["sillones_3", "valentina"], ["pre_int_1", "milton"],
  ["pre_int_2", "gabriela"], ["salud_mental", "silvina"]
];
const filasPorId = new Map(filasConfiguracion.map((fila) => [fila.sectorId, fila]));
const asignacionBase = datos.map(([sectorId, id]) => ({
  nombre: filasPorId.get(sectorId)?.etiqueta || "SILLONES 3",
  sectorId,
  enfermero: { id, nombre: id },
  tipo: "sector"
}));
const prioridadSectorIds = [
  "pre_int_2", "sillones_3", "rea_1", "boxes_1_3_21", "boxes_4_7",
  "boxes_8_13", "boxes_14_19", "boxes_20_22_24", "dx_25_30",
  "sillon_1", "explora_1", "pre_int_1", "salud_mental", "sillon_2",
  "explora_2", "rea_2"
];
const firma = (filas) => filas.map((fila) => [fila.nombre, fila.enfermero?.id || null]);
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const contextoGenerar = {
  accion: "generar", ordenVisual, filasConfiguracion, prioridadSectorIds
};
const modos = [
  {
    nombre: "opción 1",
    modo: MODOS_REDISTRIBUCION_DIARIA.OPCION_1,
    generar: redistribuirCritica,
    recalcular: recalcularRedistribucionOpcion1Automatica
  },
  {
    nombre: "opción 2",
    modo: MODOS_REDISTRIBUCION_DIARIA.OPCION_2,
    generar: redistribuirPorBoxes,
    recalcular: recalcularRedistribucionOpcion2Automatica
  }
];
let total = 0;
const probar = (nombre, prueba) => {
  prueba(); total += 1; console.log(`✓ ${total} ${nombre}`);
};

for (const caso of modos) {
  probar(`${caso.nombre}: generar por orquestador equivale al helper aprobado`, () => {
    const directo = caso.generar({
      asignaciones: asignacionBase, ordenVisual, filasConfiguracion, prioridadSectorIds
    });
    const orquestado = resolverDistribucionDiaria({
      asignacionBase, prioridadSectorIds,
      modoRedistribucion: caso.modo,
      contextoRedistribucion: contextoGenerar
    });
    assert.deepEqual(firma(orquestado.asignaciones), firma(directo.asignaciones));
    assert.deepEqual(orquestado.cambios, directo.cambios);
    assert.deepEqual(orquestado.procedencias, directo.procedencias);
  });

  probar(`${caso.nombre}: recalcular por orquestador equivale a helper más operación común`, () => {
    const generado = caso.generar({
      asignaciones: asignacionBase, ordenVisual, filasConfiguracion, prioridadSectorIds
    });
    const procedenciaCambiosDia = Object.fromEntries(
      Object.keys(generado.cambios).map((clave) => [clave, "redistribucion_automatica"])
    );
    const contexto = {
      accion: "recalcular", ordenVisual, filasConfiguracion, prioridadSectorIds,
      cambiosDia: generado.cambios, procedenciaCambiosDia,
      procedenciaAutomatica: "redistribucion_automatica"
    };
    const recalculoDirecto = caso.recalcular({
      asignaciones: generado.asignaciones, ...contexto
    });
    const esperado = resolverDistribucionDiaria({
      asignacionBase: recalculoDirecto, prioridadSectorIds
    });
    const obtenido = resolverDistribucionDiaria({
      asignacionBase: generado.asignaciones, prioridadSectorIds,
      modoRedistribucion: caso.modo, contextoRedistribucion: contexto
    });
    assert.deepEqual(firma(obtenido.asignaciones), firma(esperado.asignaciones));
  });

  probar(`${caso.nombre}: dos reconstrucciones orquestadas permanecen estables`, () => {
    const generado = resolverDistribucionDiaria({
      asignacionBase, prioridadSectorIds,
      modoRedistribucion: caso.modo, contextoRedistribucion: contextoGenerar
    });
    const procedenciaCambiosDia = Object.fromEntries(
      Object.keys(generado.cambios).map((clave) => [clave, "redistribucion_automatica"])
    );
    const contexto = {
      accion: "recalcular", ordenVisual, filasConfiguracion, prioridadSectorIds,
      cambiosDia: generado.cambios, procedenciaCambiosDia,
      procedenciaAutomatica: "redistribucion_automatica"
    };
    const r1 = resolverDistribucionDiaria({
      asignacionBase: generado.asignaciones, prioridadSectorIds,
      modoRedistribucion: caso.modo, contextoRedistribucion: contexto
    });
    const r2 = resolverDistribucionDiaria({
      asignacionBase: generado.asignaciones, prioridadSectorIds,
      modoRedistribucion: caso.modo, contextoRedistribucion: contexto
    });
    assert.deepEqual(firma(r2.asignaciones), firma(r1.asignaciones));
  });

  probar(`${caso.nombre}: manual y No Disponible llegan como inputs canónicos`, () => {
    const entrada = asignacionBase.map((fila) => fila.sectorId === "rea_2"
      ? { ...fila, cambioManualProtegido: true }
      : fila.enfermero?.id === "laura" ? { ...fila, enfermero: null } : fila);
    const resultado = resolverDistribucionDiaria({
      asignacionBase: entrada, prioridadSectorIds,
      modoRedistribucion: caso.modo, contextoRedistribucion: contextoGenerar
    });
    assert.equal(resultado.asignaciones.some((fila) => fila.enfermero?.id === "laura"), false);
    assert.equal(resultado.procedencias[normalizar("REA 2")], "manual");
    assert.equal(resultado.asignaciones.find((fila) => fila.nombre === "REA 2").enfermero.id, "diego");
  });
}

probar("modo normal conserva su contrato sin campos persistibles de redistribución", () => {
  const resultado = resolverDistribucionDiaria({ asignacionBase, prioridadSectorIds });
  assert.equal(Object.hasOwn(resultado, "cambios"), false);
  assert.equal(resultado.asignaciones.find((fila) => fila.sectorId === "rea_2").enfermero.id, "diego");
});

probar("el orquestador no muta entradas de generación ni contexto", () => {
  const base = copiar(asignacionBase);
  const prioridad = [...prioridadSectorIds];
  const filas = copiar(filasConfiguracion);
  const personalEfectivo = datos.map(([, id]) => ({ id, nombre: id }));
  const extras = [{ id: "extra-1", nombre: "Extra" }];
  const contexto = { ...contextoGenerar, filasConfiguracion: filas, prioridadSectorIds: prioridad };
  resolverDistribucionDiaria({
    asignacionBase: base, personalEfectivo, extras, prioridadSectorIds: prioridad,
    modoRedistribucion: MODOS_REDISTRIBUCION_DIARIA.OPCION_1,
    contextoRedistribucion: contexto
  });
  assert.deepEqual(base, copiar(asignacionBase));
  assert.deepEqual(prioridad, prioridadSectorIds);
  assert.deepEqual(filas, filasConfiguracion);
  assert.deepEqual(personalEfectivo, datos.map(([, id]) => ({ id, nombre: id })));
  assert.deepEqual(extras, [{ id: "extra-1", nombre: "Extra" }]);
  const generado = redistribuirCritica({
    asignaciones: asignacionBase, ordenVisual, filasConfiguracion, prioridadSectorIds
  });
  const cambiosDia = copiar(generado.cambios);
  const procedenciaCambiosDia = Object.fromEntries(
    Object.keys(cambiosDia).map((clave) => [clave, "redistribucion_automatica"])
  );
  const antesCambios = copiar(cambiosDia);
  const antesProcedencias = copiar(procedenciaCambiosDia);
  resolverDistribucionDiaria({
    asignacionBase: generado.asignaciones,
    modoRedistribucion: MODOS_REDISTRIBUCION_DIARIA.OPCION_1,
    contextoRedistribucion: {
      accion: "recalcular", ordenVisual, filasConfiguracion,
      prioridadSectorIds, cambiosDia, procedenciaCambiosDia,
      procedenciaAutomatica: "redistribucion_automatica"
    }
  });
  assert.deepEqual(cambiosDia, antesCambios);
  assert.deepEqual(procedenciaCambiosDia, antesProcedencias);
});

console.log(`\n${total} pruebas conductuales del orquestador con redistribución aprobadas.`);
