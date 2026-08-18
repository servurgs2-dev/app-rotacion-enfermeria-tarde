import assert from "node:assert/strict";
import { obtenerSemanasDelMes, estaDeLicencia, parsearFechaLocal } from "../src/utils/fechas.js";
import {
  obtenerOpcionesSelectorPlanilla,
  personaTieneAlMenosUnDiaDisponibleEnPeriodo
} from "../src/utils/opcionesSelectorPlanilla.js";
import {
  dividirReanimacionSillones,
  esDestinoSinteticoReanimacionSillones,
  SYNTHETIC_IDS_REANIMACION_SILLONES
} from "../src/utils/reanimacionSillones.js";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

const persona = {
  id: "lic-reintegro",
  personaId: "lic-reintegro",
  nombre: "Licenciado Reintegrado",
  categoria: "licenciado"
};
const semana = obtenerSemanasDelMes("2026-08").find(
  ({ desde }) => desde.getDate() === 17
);
const licencia = (desde, hasta) => ({
  personaId: persona.id,
  nombre: persona.nombre,
  desde,
  hasta
});
const esAsignable = (licencias) => personaTieneAlMenosUnDiaDisponibleEnPeriodo({
  persona,
  personal: [persona],
  licencias,
  periodo: semana
});

probar("ausencia 17-19 permite asignación semanal por reintegro el 20", () => {
  assert.equal(esAsignable([licencia("2026-08-17", "2026-08-19")]), true);
});

probar("ausencia 20-23 permite asignación por los días previos", () => {
  assert.equal(esAsignable([licencia("2026-08-20", "2026-08-23")]), true);
});

probar("ausencia durante toda la semana mantiene a la persona fuera del selector", () => {
  const licencias = [licencia("2026-08-17", "2026-08-23")];
  assert.equal(esAsignable(licencias), false);
  assert.deepEqual(obtenerOpcionesSelectorPlanilla({
    personalCategoria: [persona],
    personal: [persona],
    distribucion: {},
    sector: "EXPLORA",
    referenciaActual: "",
    licencias,
    periodo: semana
  }).opciones, []);
});

probar("sin ausencia conserva el comportamiento normal", () => {
  assert.equal(esAsignable([]), true);
});

probar("licencia iniciada el mes anterior y terminada a mitad de semana permite asignar", () => {
  assert.equal(esAsignable([licencia("2026-07-25", "2026-08-19")]), true);
});

probar("la identidad estable permite seleccionar al Licenciado en Explora", () => {
  const opciones = obtenerOpcionesSelectorPlanilla({
    personalCategoria: [persona],
    personal: [persona],
    distribucion: {},
    sector: "EXPLORA",
    referenciaActual: "",
    licencias: [licencia("2026-08-17", "2026-08-19")],
    periodo: semana
  }).opciones;
  assert.equal(opciones.length, 1);
  assert.equal(opciones[0].persona.id, persona.id);
});

probar("Calendario lo excluye 17-19 y recupera su sector base desde el 20", () => {
  const licencias = [licencia("2026-08-17", "2026-08-19")];
  const sectorBase = { sectorId: "explora", nombre: "EXPLORA", enfermero: persona };
  for (const fecha of ["2026-08-17", "2026-08-18", "2026-08-19"]) {
    assert.equal(estaDeLicencia(licencias, persona, parsearFechaLocal(fecha), [persona]), true);
  }
  for (const fecha of ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"]) {
    assert.equal(estaDeLicencia(licencias, persona, parsearFechaLocal(fecha), [persona]), false);
    assert.equal(sectorBase.enfermero.id, persona.id);
  }
});

probar("el reintegrado en Explora no consume el sobrante usado para dividir Reanimación y Sillones", () => {
  const titularCombinado = { id: "lic-rea", nombre: "Licenciado REA", categoria: "licenciado" };
  const sobrante = { id: "lic-sobrante", nombre: "Licenciado Sobrante", categoria: "licenciado" };
  const resultado = dividirReanimacionSillones({
    asignaciones: [
      { sectorId: "explora", nombre: "EXPLORA", enfermero: persona },
      { sectorId: "reanimacion_sillones", nombre: "REANIMACIÓN + SILLONES", enfermero: titularCombinado }
    ],
    sobrantes: [sobrante],
    categoria: "licenciado",
    esDiaParo: false,
    personalDisponible: [persona, titularCombinado, sobrante],
    ordenVisual: ["EXPLORA", "REANIMACIÓN + SILLONES"]
  });
  assert.equal(resultado.asignaciones.find(({ sectorId }) => sectorId === "explora")?.enfermero.id, persona.id);
  assert.equal(resultado.seDivide, true);
  assert.equal(resultado.asignaciones.filter(esDestinoSinteticoReanimacionSillones).length, 2);
  assert.equal(resultado.asignaciones.find(
    ({ syntheticId }) => syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES
  )?.enfermero.id, sobrante.id);
  assert.equal(resultado.asignaciones.some(
    ({ nombre, enfermero }) => nombre === "SIN ASIGNAR" && enfermero?.id === sobrante.id
  ), false);
});

console.log(`\n${aprobadas} pruebas de reintegro en semana parcial pasaron.`);
