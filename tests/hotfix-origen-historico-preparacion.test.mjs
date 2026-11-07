import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  obtenerMesOrigenPreparacion,
  obtenerMesesOrigenPreparacion
} from "../src/utils/origenPreparacionMes.js";
import { analizarRecuperacionMesActual } from "../src/utils/recuperacionMesActual.js";
import { analizarPreparacionMesNuevo } from "../src/utils/preparacionMesNuevo.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const meses = [
  { mes: "2026-09", turnos: ["noche", "tarde"] },
  { mes: "2026-10", turnos: ["tarde"] }
];
const contexto = {
  turno: "noche",
  mesesExistentes: meses,
  estadosPorTurnoMes: {}
};
const padron = { porPersonaId: {} };
const recuperar = (cambios = {}) => analizarRecuperacionMesActual({
  mes: "2026-10",
  mesReferencia: "2026-11",
  fechaReferencia: new Date(2026, 10, 7, 12),
  turno: "noche",
  existeRemoto: false,
  estado: crearEstadoMensualVacio(),
  novedadesExternas: [],
  padronVigencias: padron,
  auditoriaExternaDisponible: true,
  ...cambios
});

await probar("mes anterior inmediato existente conserva preparación normal", () => {
  assert.equal(obtenerMesOrigenPreparacion({
    ...contexto,
    mesDestino: "2026-10"
  }), "2026-09");
});

await probar("hueco inmediato recupera el último mes anterior del mismo turno", () => {
  assert.equal(obtenerMesOrigenPreparacion({
    ...contexto,
    mesDestino: "2026-11"
  }), "2026-09");
});

await probar("Septiembre Noche y Octubre ausente producen origen Septiembre", () => {
  assert.deepEqual(obtenerMesesOrigenPreparacion({
    ...contexto,
    mesDestino: "2026-11"
  }), ["2026-09"]);
});

await probar("Octubre faltante se puede preparar explícitamente desde Septiembre", () => {
  const resultado = recuperar();
  assert.equal(resultado.permitida, true);
  assert.equal(resultado.codigo, "MES_ANTERIOR_INEXISTENTE");
  assert.equal(resultado.mesOrigen, "2026-09");
});

await probar("Octubre preparado localmente pasa a ser el origen de Noviembre", () => {
  assert.equal(obtenerMesOrigenPreparacion({
    ...contexto,
    mesDestino: "2026-11",
    estadosPorTurnoMes: { "noche|2026-10": { preparado: true } }
  }), "2026-10");
});

await probar("un registro mensual real no se confunde con ausencia de origen", () => {
  assert.deepEqual(obtenerMesesOrigenPreparacion({
    turno: "noche",
    mesDestino: "2026-10",
    mesesExistentes: [{ mes: "2026-09", turnos: ["noche"] }]
  }), ["2026-09"]);
});

await probar("estado parcial no se acepta silenciosamente como origen preparado", () => {
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "noche",
    mesOrigen: "2026-09",
    mesDestino: "2026-10",
    estadoOrigen: crearEstadoMensualVacio(),
    estadoDestino: crearEstadoMensualVacio()
  });
  assert.equal(analisis.ok, false);
  assert.match(analisis.codigo, /^BASE_/);
});

await probar("turno sin historia sigue distinguido del caso recuperable", () => {
  assert.equal(obtenerMesOrigenPreparacion({
    turno: "vespertino",
    mesDestino: "2026-11",
    mesesExistentes: meses
  }), null);
});

await probar("la búsqueda queda aislada por turno", () => {
  assert.equal(obtenerMesOrigenPreparacion({
    turno: "tarde",
    mesDestino: "2026-11",
    mesesExistentes: meses
  }), "2026-10");
  assert.equal(obtenerMesOrigenPreparacion({
    turno: "noche",
    mesDestino: "2026-11",
    mesesExistentes: meses
  }), "2026-09");
});

await probar("selección de origen es determinista e idempotente", () => {
  const entrada = { ...contexto, mesDestino: "2026-11" };
  assert.deepEqual(
    obtenerMesesOrigenPreparacion(entrada),
    obtenerMesesOrigenPreparacion(entrada)
  );
  assert.deepEqual(meses, [
    { mes: "2026-09", turnos: ["noche", "tarde"] },
    { mes: "2026-10", turnos: ["tarde"] }
  ]);
});

await probar("actividad real de Octubre impide crear un origen artificial", () => {
  const resultado = recuperar({
    novedadesExternas: [{
      id: "n1",
      personaId: "p1",
      tipo: "suspension",
      estado: "activa",
      fechaDesde: "2026-10-20",
      fechaHasta: "2026-10-20",
      turno: "noche"
    }],
    padronVigencias: {
      porPersonaId: {
        p1: { vigencias: [{ desde: "2026-10-01", hasta: "2026-10-31", turno: "noche" }] }
      }
    }
  });
  assert.equal(resultado.permitida, false);
  assert.equal(resultado.codigo, "ACTIVIDAD_EXTERNA_DETECTADA");
});

await probar("App usa el origen recuperado en inicio, confirmación y panel", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok((app.match(/obtenerMesOrigenPreparacion\(\{/g) || []).length >= 4);
  assert.match(app, /Preparar mes faltante/);
  assert.match(app, /No existe un mes anterior registrado y utilizable/);
});

console.log(`\n${total} comprobaciones del hotfix de continuidad mensual superadas.`);
