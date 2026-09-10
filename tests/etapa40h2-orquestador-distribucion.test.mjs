import assert from "node:assert/strict";
import { aplicarPrioridadCoberturaParejas } from "../src/utils/coberturaParejasEnfermeros.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { resolverDistribucionDiaria } from "../src/utils/resolverDistribucionDiaria.js";
import {
  TIPOS_EXTRA,
  configurarTipoExtra,
  crearExtraTemporal
} from "../src/utils/extrasPersonas.js";

const persona = (id, extras = {}) => ({ id, nombre: id, ...extras });
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const en = (asignaciones, sectorId) =>
  asignaciones.find((fila) => fila.sectorId === sectorId)?.enfermero || null;
const traza = (resultado, sectorId) =>
  resultado.trazas.find((item) => item.destinoSectorId === sectorId);
const contextoParejas = {
  distribucionBase: {},
  cambiosDia: {},
  procedenciaCambiosDia: {},
  estadoMensual: {},
  turno: "tarde",
  categoria: "enfermero",
  mes: "2026-09"
};

const resolverAnterior = ({
  asignacionBase,
  personalEfectivo = [],
  extras = [],
  prioridadSectorIds = [],
  sectorIdsDonantes,
  disponible = () => true,
  reglasParejas = null
}) => resolverTurnantesYCoberturasOperativas({
  asignaciones: asignacionBase,
  extras,
  personal: personalEfectivo,
  esPersonaDisponible: disponible,
  esPersonaDisponibleParaCobertura: disponible,
  prioridadSectorIds,
  sectorIdsDonantes,
  ajustarSectores: reglasParejas
    ? (sectores) => aplicarPrioridadCoberturaParejas({
        ...reglasParejas,
        asignaciones: sectores,
        personal: personalEfectivo,
        esPersonaDisponible: disponible
      })
    : (sectores) => sectores
}).asignaciones;

const resolverNuevo = (entrada) => resolverDistribucionDiaria({
  ...entrada,
  esPersonaDisponible: entrada.disponible,
  esPersonaDisponibleParaCobertura: entrada.disponible
});

const afirmarEquivalencia = (entrada) => {
  const anterior = resolverAnterior(entrada);
  const nuevo = resolverNuevo(entrada);
  assert.deepEqual(nuevo.asignaciones, anterior);
  return nuevo;
};

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

probar("distribución completa conserva equivalencia con la ruta anterior", () => {
  const titular = persona("titular");
  afirmarEquivalencia({
    asignacionBase: [{ tipo: "sector", sectorId: "rea_1", nombre: "REA 1", enfermero: titular }],
    personalEfectivo: [titular],
    disponible: () => true
  });
});

probar("caso Diego conserva REA 2 y asigna Turnante directo a PRE INT 2", () => {
  const diego = persona("diego");
  const valentina = persona("valentina");
  const entrada = {
    asignacionBase: [
      { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: valentina },
      { tipo: "sector", sectorId: "rea_1", nombre: "REA 1", enfermero: persona("rea1") },
      { tipo: "sector", sectorId: "rea_2", nombre: "REA 2", enfermero: diego },
      { tipo: "sector", sectorId: "pre_int_1", nombre: "PRE INT 1", enfermero: persona("preint1") },
      { tipo: "sector", sectorId: "pre_int_2", nombre: "PRE INT 2", enfermero: null }
    ],
    personalEfectivo: [diego, valentina],
    prioridadSectorIds: ["pre_int_2", "rea_2", "rea_1", "pre_int_1"],
    disponible: () => true,
    reglasParejas: contextoParejas
  };
  const resultado = afirmarEquivalencia(entrada);
  assert.equal(en(resultado.asignaciones, "rea_2"), diego);
  assert.equal(en(resultado.asignaciones, "pre_int_2"), valentina);
  assert.equal(traza(resultado, "pre_int_2").causa, "turnante_directo");
});

probar("pareja 2→1 y reposición preservan equivalencia y procedencia", () => {
  const diego = persona("diego");
  const valentina = persona("valentina");
  const resultado = afirmarEquivalencia({
    asignacionBase: [
      { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: valentina },
      { tipo: "sector", sectorId: "rea_1", nombre: "REA 1", enfermero: null },
      { tipo: "sector", sectorId: "rea_2", nombre: "REA 2", enfermero: diego }
    ],
    personalEfectivo: [diego, valentina],
    prioridadSectorIds: ["rea_1", "rea_2"],
    disponible: () => true,
    reglasParejas: contextoParejas
  });
  assert.equal(en(resultado.asignaciones, "rea_1"), diego);
  assert.equal(en(resultado.asignaciones, "rea_2"), valentina);
  assert.equal(traza(resultado, "rea_1").causa, "pareja_2_a_1");
  assert.equal(traza(resultado, "rea_2").causa, "reposicion_turnante");
});

probar("Extra de refuerzo conserva precedencia y traza derivada", () => {
  const extra = persona("extra", { tipoExtra: TIPOS_EXTRA.REFUERZO });
  const turnante = persona("turnante");
  const resultado = afirmarEquivalencia({
    asignacionBase: [
      { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: turnante },
      { tipo: "sector", sectorId: "rea_1", nombre: "REA 1", enfermero: null }
    ],
    personalEfectivo: [turnante], extras: [extra], disponible: () => true
  });
  assert.equal(en(resultado.asignaciones, "rea_1"), extra);
  assert.equal(traza(resultado, "rea_1").causa, "extra_refuerzo");
});

probar("Extra vinculado reemplaza al titular sin duplicarlo", () => {
  const titular = persona("titular", { categoria: "enfermero" });
  const extraBase = crearExtraTemporal({
    nombre: "cobertura", categoria: "enfermero", crearId: () => "cobertura"
  }).extra;
  const cobertura = configurarTipoExtra({
    extra: extraBase,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: titular,
    sectorCubierto: "REA 1",
    personal: [titular]
  }).extra;
  const resultado = afirmarEquivalencia({
    asignacionBase: [
      { tipo: "sector", sectorId: "rea_1", nombre: "REA 1", enfermero: titular }
    ],
    personalEfectivo: [titular], extras: [cobertura], disponible: () => true
  });
  assert.equal(en(resultado.asignaciones, "rea_1")?.id, "cobertura");
  assert.equal(traza(resultado, "rea_1").causa, "extra_cobertura");
});

probar("indisponibilidad normalizada excluye persona sin conocer su causa", () => {
  for (const causa of ["licencia", "certificacion", "suspension", "paro", "no_disponible", "novedad"]) {
    const ausente = persona(`ausente-${causa}`);
    const turnante = persona(`turnante-${causa}`);
    const resultado = afirmarEquivalencia({
      asignacionBase: [
        { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: turnante },
        { tipo: "sector", sectorId: "rea_1", nombre: "REA 1", enfermero: ausente }
      ],
      personalEfectivo: [ausente, turnante],
      disponible: (actual) => actual !== ausente
    });
    assert.equal(en(resultado.asignaciones, "rea_1"), turnante);
    assert.equal(resultado.asignaciones.some((fila) => fila.enfermero === ausente), false);
  }
});

probar("prioridad general y manual protegido conservan equivalencia", () => {
  const donante = persona("donante");
  const resultado = afirmarEquivalencia({
    asignacionBase: [
      { tipo: "sector", sectorId: "alta", nombre: "Alta", enfermero: null },
      { tipo: "sector", sectorId: "manual", nombre: "Manual", enfermero: null, vacioManual: true },
      { tipo: "sector", sectorId: "baja", nombre: "Baja", enfermero: donante }
    ],
    personalEfectivo: [donante],
    prioridadSectorIds: ["alta", "manual", "baja"],
    disponible: () => true
  });
  assert.equal(en(resultado.asignaciones, "alta"), donante);
  assert.equal(en(resultado.asignaciones, "manual"), null);
  assert.equal(traza(resultado, "alta").causa, "prioridad_general");
});

probar("Sin asignar es determinista y no duplica identidades", () => {
  const titular = persona("titular");
  const sobrante = persona("sobrante");
  const resultado = resolverNuevo({
    asignacionBase: [{ tipo: "sector", sectorId: "rea_1", nombre: "REA 1", enfermero: titular }],
    personalEfectivo: [titular, sobrante],
    personasSinAsignar: [titular, sobrante, sobrante],
    disponible: () => true
  });
  assert.equal(resultado.sinAsignar.length, 1);
  assert.equal(resultado.sinAsignar[0].enfermero, sobrante);
});

probar("múltiples Turnantes se consumen una sola vez y en orden", () => {
  const t1 = persona("t1");
  const t2 = persona("t2");
  const resultado = afirmarEquivalencia({
    asignacionBase: [
      { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: t1 },
      { tipo: "turnante", turnanteId: "turnante_2", nombre: "T2", enfermero: t2 },
      { tipo: "sector", sectorId: "alta", nombre: "Alta", enfermero: null },
      { tipo: "sector", sectorId: "baja", nombre: "Baja", enfermero: null }
    ],
    personalEfectivo: [t1, t2],
    prioridadSectorIds: ["alta", "baja"],
    disponible: () => true
  });
  assert.equal(en(resultado.asignaciones, "alta"), t1);
  assert.equal(en(resultado.asignaciones, "baja"), t2);
  assert.equal(new Set(resultado.asignaciones.map((fila) => fila.enfermero?.id)).size, 2);
});

probar("el orquestador no muta ninguna entrada", () => {
  const entradas = {
    asignacionBase: [{ tipo: "sector", sectorId: "rea_1", nombre: "REA 1", enfermero: persona("p1") }],
    personalEfectivo: [persona("p1")],
    extras: [persona("extra", { tipoExtra: TIPOS_EXTRA.REFUERZO })],
    prioridadSectorIds: ["rea_1"],
    reglasParejas: contextoParejas,
    personasSinAsignar: [persona("sobrante")],
    disponible: () => true
  };
  const serializables = ({ disponible: _disponible, ...resto }) => resto;
  const antes = clonar(serializables(entradas));
  resolverNuevo(entradas);
  assert.deepEqual(serializables(entradas), antes);
});

probar("mismo input produce asignaciones y trazas idénticas", () => {
  const entrada = {
    asignacionBase: [
      { tipo: "sector", sectorId: "alta", nombre: "Alta", enfermero: null },
      { tipo: "sector", sectorId: "baja", nombre: "Baja", enfermero: persona("p1") }
    ],
    personalEfectivo: [persona("p1")], prioridadSectorIds: ["alta", "baja"],
    disponible: () => true
  };
  const primero = resolverNuevo(entrada);
  const segundo = resolverNuevo(entrada);
  assert.deepEqual(primero.asignaciones, segundo.asignaciones);
  assert.deepEqual(primero.trazas, segundo.trazas);
});

console.log(`\n${total} pruebas de equivalencia del orquestador diario aprobadas.`);
