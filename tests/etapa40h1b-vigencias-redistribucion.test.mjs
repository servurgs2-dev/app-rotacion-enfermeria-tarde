import assert from "node:assert/strict";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { resolverOrganizacionMesPorFecha } from "../src/utils/preparacionesMes.js";
import {
  PRIORIDAD_REDISTRIBUCION_OPCION_1,
  PRIORIDAD_REDISTRIBUCION_OPCION_2,
  recalcularRedistribucionOpcion1Automatica,
  recalcularRedistribucionOpcion2Automatica,
  redistribuirCritica,
  redistribuirPorBoxes
} from "../src/utils/redistribucionEnfermeros.js";

const persona = (id) => ({ id, nombre: id });
const mes = "2026-09";
const planilla = (marca) => ({
  semana1: { REA1: { personaId: `titular-${marca}` }, T1: { personaId: `turnante-${marca}` } },
  semana2: {}, semana3: {}, semana4: {}, semana5: {}, semana6: {},
  posicionesMensualesAdicionales: [`T6-${marca}`], coberturaLibreSM: {}
});
const configuracion = (marca, prioridad) => ({
  ...crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "enfermero", mes }),
  marca,
  prioridadCoberturaSectorIds: prioridad
});
const categorias = (marca, prioridad) => ({
  enfermero: { planilla: planilla(marca), configuracion: configuracion(marca, prioridad) },
  licenciado: {
    planilla: planilla(`L-${marca}`),
    configuracion: crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "licenciado", mes })
  }
});
const preparacion = (id, desde, hasta, prioridad) => ({
  id, desde, hasta, creadaEn: null, creadaPor: null, origen: "prueba",
  categorias: categorias(id, prioridad)
});

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const estadoABC = {
  ...crearEstadoMensualVacio(),
  planillas: { enfermeros: planilla("TOP"), licenciados: planilla("L-TOP") },
  configuracionPlanilla: { enfermero: configuracion("TOP", ["rea_2"]), licenciado: {} },
  preparaciones: [
    preparacion("A", "2026-09-01", "2026-09-10", ["rea_1", "rea_2"]),
    preparacion("B", "2026-09-11", "2026-09-20", ["sillon_2", "rea_2"]),
    preparacion("C", "2026-09-21", "2026-09-30", ["pre_int_2", "rea_2"])
  ]
};

probar("A/B/C resuelven Planilla, prioridad y Turnantes de la fecha", () => {
  for (const [fecha, id, prioridad] of [
    ["2026-09-05", "A", "rea_1"],
    ["2026-09-15", "B", "sillon_2"],
    ["2026-09-25", "C", "pre_int_2"]
  ]) {
    const resultado = resolverOrganizacionMesPorFecha({ estado: estadoABC, mes, fecha });
    assert.equal(resultado.preparacionId, id);
    assert.equal(resultado.planillas.enfermeros.semana1.REA1.personaId, `titular-${id}`);
    assert.equal(resultado.planillas.enfermeros.semana1.T1.personaId, `turnante-${id}`);
    assert.equal(resultado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds[0], prioridad);
  }
});

probar("cambiar de vigencia no muta ni contamina las demás", () => {
  const antes = JSON.stringify(estadoABC);
  const c = resolverOrganizacionMesPorFecha({ estado: estadoABC, mes, fecha: "2026-09-25" });
  c.planillas.enfermeros.semana1.REA1.personaId = "edicion-local";
  assert.equal(JSON.stringify(estadoABC), antes);
  assert.equal(
    resolverOrganizacionMesPorFecha({ estado: estadoABC, mes, fecha: "2026-09-15" })
      .planillas.enfermeros.semana1.REA1.personaId,
    "titular-B"
  );
});

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
  { tipo: "sector", sectorId: "rea_2", etiqueta: "REA 2" }
];
const ordenVisual = filasConfiguracion.map((fila) => fila.etiqueta);
const asignaciones = ordenVisual.map((nombre, indice) => ({
  nombre, enfermero: persona(`p-${indice}`), tipo: "sector"
}));
const identidades = (resultado) => resultado.map((fila) => fila.enfermero?.id).filter(Boolean);

for (const [nombre, ejecutar] of [
  ["opción 1", () => redistribuirCritica({
    asignaciones, ordenVisual, filasConfiguracion,
    prioridadSectorIds: [...filasConfiguracion].reverse().map((fila) => fila.sectorId)
  })],
  ["opción 2", () => redistribuirPorBoxes({
    asignaciones, ordenVisual, filasConfiguracion,
    prioridadSectorIds: [...filasConfiguracion].reverse().map((fila) => fila.sectorId)
  })]
]) {
  probar(`${nombre} conserva identidades únicas y salida determinista`, () => {
    const primero = ejecutar();
    const segundo = ejecutar();
    assert.deepEqual(primero, segundo);
    assert.equal(new Set(identidades(primero.asignaciones)).size, identidades(primero.asignaciones).length);
    assert.equal(Object.keys(primero.cambios).length, primero.asignaciones.length);
  });
}

probar("recalculadores conservan las constantes únicamente como fallback", () => {
  assert.ok(PRIORIDAD_REDISTRIBUCION_OPCION_1.length > 0);
  assert.ok(PRIORIDAD_REDISTRIBUCION_OPCION_2.length > 0);
  const prioridadEfectiva = [...filasConfiguracion].reverse().map((fila) => fila.sectorId);
  assert.notDeepEqual(
    prioridadEfectiva.slice(0, 3),
    PRIORIDAD_REDISTRIBUCION_OPCION_1.slice(0, 3).map((item) => item.sectorId)
  );
  assert.equal(typeof recalcularRedistribucionOpcion1Automatica, "function");
  assert.equal(typeof recalcularRedistribucionOpcion2Automatica, "function");
});

for (const [nombre, crear, recalcular] of [
  [
    "opción 1",
    () => redistribuirCritica({
      asignaciones, ordenVisual, filasConfiguracion,
      prioridadSectorIds: [...filasConfiguracion].reverse().map((fila) => fila.sectorId)
    }),
    recalcularRedistribucionOpcion1Automatica
  ],
  [
    "opción 2",
    () => redistribuirPorBoxes({
      asignaciones, ordenVisual, filasConfiguracion,
      prioridadSectorIds: [...filasConfiguracion].reverse().map((fila) => fila.sectorId)
    }),
    recalcularRedistribucionOpcion2Automatica
  ]
]) {
  probar(`${nombre}: reconstrucciones sucesivas con prioridad personalizada alcanzan punto fijo`, () => {
    const inicial = crear();
    const procedenciaCambiosDia = Object.fromEntries(
      Object.keys(inicial.cambios).map((clave) => [clave, "redistribucion_automatica"])
    );
    const parametros = {
      cambiosDia: inicial.cambios,
      procedenciaCambiosDia,
      ordenVisual,
      filasConfiguracion,
      prioridadSectorIds: [...filasConfiguracion].reverse().map((fila) => fila.sectorId)
    };
    const primeraReconstruccion = recalcular({
      ...parametros,
      asignaciones: inicial.asignaciones
    });
    const distribucionVisible = (filas) => filas.map((fila) => ({
      nombre: fila.nombre,
      personaId: fila.enfermero?.id || null
    }));
    assert.deepEqual(
      distribucionVisible(primeraReconstruccion),
      distribucionVisible(inicial.asignaciones)
    );
    const segundaReconstruccion = recalcular({
      ...parametros,
      asignaciones: primeraReconstruccion
    });
    assert.deepEqual(segundaReconstruccion, primeraReconstruccion);
    const terceraReconstruccion = recalcular({
      ...parametros,
      asignaciones: segundaReconstruccion
    });
    assert.deepEqual(terceraReconstruccion, primeraReconstruccion);
    assert.deepEqual(terceraReconstruccion, segundaReconstruccion);
  });
}

for (const [nombre, crear, recalcular] of [
  [
    "opción 1",
    () => redistribuirCritica({ asignaciones, ordenVisual, filasConfiguracion }),
    recalcularRedistribucionOpcion1Automatica
  ],
  [
    "opción 2",
    () => redistribuirPorBoxes({ asignaciones, ordenVisual, filasConfiguracion }),
    recalcularRedistribucionOpcion2Automatica
  ]
]) {
  probar(`${nombre}: sin prioridad efectiva usa fallback y permanece estable`, () => {
    const inicial = crear();
    const procedenciaCambiosDia = Object.fromEntries(
      Object.keys(inicial.cambios).map((clave) => [clave, "redistribucion_automatica"])
    );
    const r1 = recalcular({
      asignaciones: inicial.asignaciones,
      cambiosDia: inicial.cambios,
      procedenciaCambiosDia,
      ordenVisual,
      filasConfiguracion,
      prioridadSectorIds: []
    });
    const r2 = recalcular({
      asignaciones: r1,
      cambiosDia: inicial.cambios,
      procedenciaCambiosDia,
      ordenVisual,
      filasConfiguracion,
      prioridadSectorIds: []
    });
    assert.deepEqual(r2, r1);
  });
}

probar("opción 1 conserva un movimiento manual fuera del conjunto automático", () => {
  const inicial = redistribuirCritica({ asignaciones, ordenVisual, filasConfiguracion });
  const [claveManual, ...clavesAutomaticas] = Object.keys(inicial.cambios);
  const personaManual = persona("manual-protegida");
  const asignacionesConManual = inicial.asignaciones.map((fila, indice) =>
    indice === 0 ? { ...fila, enfermero: personaManual, cambioManualProtegido: true } : fila
  );
  const procedenciaCambiosDia = Object.fromEntries([
    [claveManual, "manual"],
    ...clavesAutomaticas.map((clave) => [clave, "redistribucion_automatica"])
  ]);
  const resultado = recalcularRedistribucionOpcion1Automatica({
    asignaciones: asignacionesConManual,
    cambiosDia: inicial.cambios,
    procedenciaCambiosDia,
    ordenVisual,
    filasConfiguracion,
    prioridadSectorIds: [...filasConfiguracion].reverse().map((fila) => fila.sectorId)
  });
  assert.equal(resultado[0].enfermero, personaManual);
  assert.equal(resultado[0].cambioManualProtegido, true);
});

probar("la prioridad resuelta desde B gobierna su generación sin usar top-level", () => {
  const organizacionB = resolverOrganizacionMesPorFecha({
    estado: estadoABC,
    mes,
    fecha: "2026-09-15"
  });
  const prioridadB = organizacionB.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds;
  const resultado = redistribuirCritica({
    asignaciones,
    ordenVisual,
    filasConfiguracion,
    prioridadSectorIds: prioridadB
  });
  assert.equal(resultado.asignaciones[0].nombre, "SILLON 2");
  assert.notEqual(resultado.asignaciones[0].nombre, "REA 2");
});

for (const [nombre, crear] of [
  ["opción 1", redistribuirCritica],
  ["opción 2", redistribuirPorBoxes]
]) {
  probar(`${nombre}: la prioridad no convierte un destino ajeno a la modalidad en prioritario`, () => {
    const personasCompatibles = asignaciones.slice(0, 13);
    const resultado = crear({
      asignaciones: personasCompatibles,
      ordenVisual,
      filasConfiguracion,
      prioridadSectorIds: [
        "sillones_3",
        "pre_int_2",
        ...filasConfiguracion.map((fila) => fila.sectorId)
      ]
    });
    const sillon3 = resultado.asignaciones.find((fila) => fila.nombre === "SILLONES 3");
    assert.equal(resultado.asignaciones[0].nombre, "PRE INT 2");
    assert.equal(sillon3?.enfermero || null, null);
    assert.equal(
      new Set(resultado.asignaciones.map((fila) => fila.enfermero?.id).filter(Boolean)).size,
      personasCompatibles.length
    );
  });
}

console.log(`\n${total} pruebas conductuales de vigencias y redistribución aprobadas.`);
