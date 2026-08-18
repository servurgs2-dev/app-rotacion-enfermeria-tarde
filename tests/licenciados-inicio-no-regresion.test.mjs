import assert from "node:assert/strict";
import fs from "node:fs";
import { obtenerConfiguracionPlanillaEfectiva } from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  dividirReanimacionSillones,
  esDestinoSinteticoReanimacionSillones,
  SECTOR_ID_REANIMACION_SILLONES,
  SYNTHETIC_IDS_REANIMACION_SILLONES
} from "../src/utils/reanimacionSillones.js";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

const estado = crearEstadoMensualVacio();
const configuracion = obtenerConfiguracionPlanillaEfectiva({
  estadoMensual: estado,
  turno: "tarde",
  categoria: "licenciado",
  mes: "2026-08"
});
const filas = configuracion.filas
  .filter((fila) => fila.activo !== false && fila.tipo === "sector")
  .map((fila, indice) => ({
    ...fila,
    nombre: fila.etiqueta,
    enfermero: { id: `lic-${indice}`, nombre: `Licenciado ${indice}`, categoria: "licenciado" }
  }));
const refuerzo = { id: "lic-refuerzo", nombre: "Licenciado Refuerzo", categoria: "licenciado" };
const resultado = dividirReanimacionSillones({
  asignaciones: filas,
  sobrantes: [refuerzo],
  categoria: "licenciado",
  esDiaParo: false,
  personalDisponible: [...filas.map((fila) => fila.enfermero), refuerzo],
  ordenVisual: configuracion.filas.map((fila) => fila.etiqueta)
});

probar("Explora conserva su Licenciado original", () => {
  const explora = resultado.asignaciones.find((fila) => fila.sectorId === "explora");
  assert.ok(explora, "la configuración productiva debe contener Explora");
  assert.ok(explora.enfermero, "Explora debe continuar cubierto");
});

probar("Reanimación + Sillones se divide con el único sobrante", () => {
  assert.equal(resultado.seDivide, true);
  assert.equal(resultado.asignaciones.filter(esDestinoSinteticoReanimacionSillones).length, 2);
  assert.ok(resultado.asignaciones.find(
    (fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION
  )?.enfermero);
  assert.equal(resultado.asignaciones.find(
    (fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES
  )?.enfermero, refuerzo);
  assert.equal(resultado.asignaciones.some(
    (fila) => fila.sectorId === SECTOR_ID_REANIMACION_SILLONES
  ), false);
});

probar("el refuerzo consumido por Sillones no queda en SIN ASIGNAR", () => {
  assert.equal(resultado.asignaciones.some(
    (fila) => fila.nombre === "SIN ASIGNAR" && fila.enfermero?.id === refuerzo.id
  ), false);
});

probar("Inicio amplía únicamente la salida onDataReady existente", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.doesNotMatch(calendario, /onResumenReady|prevResumenInicioRef/);
  assert.doesNotMatch(app, /setResumenInicioEnfermeros|setResumenInicioLicenciados/);
  assert.match(calendario, /const datosParaPDF = \{[\s\S]*resumenInicio:/);
  assert.match(app, /dataPDFLic\.resumenInicio/);
});

console.log(`\n${aprobadas} pruebas de no regresión del Calendario de Licenciados pasaron.`);
