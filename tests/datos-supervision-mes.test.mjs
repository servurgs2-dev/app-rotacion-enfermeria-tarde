import assert from "node:assert/strict";
import fs from "node:fs";
import { TURNOS } from "../src/config/turnos.js";
import { esSolicitudComparacionVigente } from "../src/utils/comparacionTurnos.js";
import {
  cargarDatosSupervisionMes,
  combinarEstadoLocalSupervision,
  crearEstadosPorTurnoSupervision,
  TURNOS_SUPERVISION_IDS
} from "../src/utils/datosSupervisionMes.js";
import { obtenerRangoMesNovedades } from "../src/utils/novedadesPersonal.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const fuenteHook = fs.readFileSync(new URL("../src/hooks/useDatosSupervisionMes.js", import.meta.url), "utf8");
const fuenteUtil = fs.readFileSync(new URL("../src/utils/datosSupervisionMes.js", import.meta.url), "utf8");
const estadoTarde = { personal: [{ id: "local" }] };
const novedad = {
  id: "nov-1", personaId: "p-1", turno: "tarde", categoria: "enfermero",
  tipo: "suspension", fechaDesde: "2026-09-10", fechaHasta: "2026-09-11",
  datos: { motivo: "prueba" }, estado: "activa"
};
const crearDependencias = ({ estados = { tarde: { personal: [] } }, novedades = [novedad] } = {}) => {
  const llamadas = { estados: [], novedades: [] };
  return {
    llamadas,
    cargarEstados: async (...args) => { llamadas.estados.push(args); return estados; },
    listarNovedades: async (...args) => { llamadas.novedades.push(args); return novedades; }
  };
};

await probar("1 usa los cuatro IDs reales de TURNOS", () => assert.deepEqual(TURNOS_SUPERVISION_IDS, Object.keys(TURNOS)));
await probar("2 no inventa turno supervision", () => assert.equal(TURNOS_SUPERVISION_IDS.includes("supervision"), false));
await probar("3 consulta estados en forma masiva", async () => {
  const deps = crearDependencias();
  await cargarDatosSupervisionMes({ mes: "2026-09", ...deps });
  assert.equal(deps.llamadas.estados.length, 1);
  assert.deepEqual(deps.llamadas.estados[0], ["2026-09", Object.keys(TURNOS)]);
});
await probar("4 no hace cuatro lecturas individuales", () => assert.doesNotMatch(fuenteHook, /cargarEstadoPorTurnoMes(?:ConRevision)?/));
await probar("5 devuelve estado por turno", async () => {
  const deps = crearDependencias();
  const resultado = await cargarDatosSupervisionMes({ mes: "2026-09", ...deps });
  assert.deepEqual(resultado.estadosPorTurno.tarde, { personal: [] });
});
await probar("6 turno sin estado queda explícitamente null", () => assert.equal(crearEstadosPorTurnoSupervision({}).noche, null));
await probar("7 no crea estado mensual vacío ficticio", () => assert.ok(Object.values(crearEstadosPorTurnoSupervision({})).every((estado) => estado === null)));
await probar("8 consulta novedades sin filtro de turno", async () => {
  const deps = crearDependencias();
  await cargarDatosSupervisionMes({ mes: "2026-09", ...deps });
  assert.equal(Object.hasOwn(deps.llamadas.novedades[0][0], "turno"), false);
});
await probar("9 consulta el rango mensual completo", async () => {
  const deps = crearDependencias();
  await cargarDatosSupervisionMes({ mes: "2026-09", ...deps });
  assert.deepEqual(deps.llamadas.novedades[0][0], { fechaDesde: "2026-09-01", fechaHasta: "2026-09-30" });
});
for (const [numero, mes, esperado] of [
  [10, "2026-09", { fechaDesde: "2026-09-01", fechaHasta: "2026-09-30" }],
  [11, "2026-10", { fechaDesde: "2026-10-01", fechaHasta: "2026-10-31" }],
  [12, "2025-02", { fechaDesde: "2025-02-01", fechaHasta: "2025-02-28" }],
  [13, "2028-02", { fechaDesde: "2028-02-01", fechaHasta: "2028-02-29" }]
]) await probar(`${numero} ${mes} resuelve su último día`, () => assert.deepEqual(obtenerRangoMesNovedades(mes), esperado));
await probar("14 conserva ID de novedad", async () => assert.equal((await cargarDatosSupervisionMes({ mes: "2026-09", ...crearDependencias() })).novedadesModernas[0].id, "nov-1"));
await probar("15 conserva turno explícito", async () => assert.equal((await cargarDatosSupervisionMes({ mes: "2026-09", ...crearDependencias() })).novedadesModernas[0].turno, "tarde"));
await probar("16 conserva categoría", async () => assert.equal((await cargarDatosSupervisionMes({ mes: "2026-09", ...crearDependencias() })).novedadesModernas[0].categoria, "enfermero"));
await probar("17 no proyecta licencias legacy", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /crearNovedadesLegacy/));
await probar("18 no proyecta certificaciones legacy", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /certificaciones_legacy/));
await probar("19 no integra No disponibles", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /noDisponibles/));
await probar("20 no integra Extras", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /extras(?:Registrados|PorDia)/i));
await probar("21 no calcula dotación", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /resolverEstadoDotacion|dotacionPrevista/));
await probar("22 no calcula semáforo", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /critico|bajo_optimo|optimo/));
await probar("23 no llama setTurnoActivo", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /setTurnoActivo/));
await probar("24 no llama seleccionarTurno", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /seleccionarTurno/));
await probar("25 no realiza escrituras", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/));
await probar("26 no llama guardado mensual", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /guardarEstado/));
await probar("27 combina estado local más reciente sin mutarlo", () => {
  const remotos = crearEstadosPorTurnoSupervision({ tarde: { personal: [{ id: "remoto" }] } });
  const copia = structuredClone(remotos);
  const combinado = combinarEstadoLocalSupervision({
    estadosPorTurno: remotos,
    turnoActivo: "tarde",
    mesConsultado: "2026-09",
    mesEstadoActivo: "2026-09",
    estadoActivo: estadoTarde
  });
  assert.equal(combinado.tarde, estadoTarde);
  assert.deepEqual(remotos, copia);
});
await probar("28 solicitud anterior no reemplaza una posterior", () => {
  assert.equal(esSolicitudComparacionVigente(2, 1), false);
  assert.match(fuenteHook, /esSolicitudComparacionVigente\(solicitudRef\.current, solicitud\)/);
});
await probar("29 recargar vuelve a consultar ambas fuentes", () => {
  assert.match(fuenteHook, /setIntento\(\(actual\) => actual \+ 1\)/);
  assert.match(fuenteHook, /\[claveSolicitud, habilitado, mes\]/);
});
await probar("30 error de estados queda explícito", async () => {
  const resultado = await cargarDatosSupervisionMes({ mes: "2026-09", cargarEstados: async () => { throw new Error("x"); }, listarNovedades: async () => [novedad] });
  assert.ok(resultado.errores.estados);
  assert.equal(resultado.estadosPorTurno.tarde, null);
});
await probar("31 error de novedades queda explícito", async () => {
  const resultado = await cargarDatosSupervisionMes({ mes: "2026-09", cargarEstados: async () => ({ tarde: estadoTarde }), listarNovedades: async () => { throw new Error("x"); } });
  assert.ok(resultado.errores.novedades);
  assert.deepEqual(resultado.novedadesModernas, []);
});
await probar("32 conserva la fuente que sí pudo cargarse", async () => {
  const resultado = await cargarDatosSupervisionMes({ mes: "2026-09", cargarEstados: async () => ({ tarde: estadoTarde }), listarNovedades: async () => { throw new Error("x"); } });
  assert.equal(resultado.estadosPorTurno.tarde, estadoTarde);
});
await probar("33 no muta entradas", async () => {
  const estados = { tarde: estadoTarde };
  const novedades = [novedad];
  const copiaEstados = structuredClone(estados);
  const copiaNovedades = structuredClone(novedades);
  const resultado = await cargarDatosSupervisionMes({ mes: "2026-09", ...crearDependencias({ estados, novedades }) });
  resultado.novedadesModernas[0].datos.motivo = "cambiado";
  assert.deepEqual(estados, copiaEstados);
  assert.deepEqual(novedades, copiaNovedades);
});
await probar("34 gobiernan IDs y no nombres visibles", () => assert.deepEqual(Object.keys(crearEstadosPorTurnoSupervision()), Object.keys(TURNOS)));
await probar("35 no tiene dependencias de UI", () => assert.doesNotMatch(fuenteUtil + fuenteHook, /components\/|\.jsx|className|React\.createElement|<main|<section|<div/));
await probar("36 mismo turno y distinto mes conserva el remoto", () => {
  const remoto = { personal: [{ id: "septiembre" }] };
  const combinado = combinarEstadoLocalSupervision({
    estadosPorTurno: { tarde: remoto },
    turnoActivo: "tarde",
    mesConsultado: "2026-09",
    mesEstadoActivo: "2026-08",
    estadoActivo: estadoTarde
  });
  assert.equal(combinado.tarde, remoto);
});
await probar("37 el estado local no reemplaza otro turno", () => {
  const remotoNoche = { personal: [{ id: "noche" }] };
  const combinado = combinarEstadoLocalSupervision({
    estadosPorTurno: { noche: remotoNoche, tarde: { personal: [] } },
    turnoActivo: "tarde",
    mesConsultado: "2026-09",
    mesEstadoActivo: "2026-09",
    estadoActivo: estadoTarde
  });
  assert.equal(combinado.noche, remotoNoche);
  assert.equal(combinado.tarde, estadoTarde);
});
await probar("38 sin mes local no reemplaza el remoto", () => {
  const remoto = { personal: [{ id: "remoto" }] };
  const combinado = combinarEstadoLocalSupervision({
    estadosPorTurno: { tarde: remoto },
    turnoActivo: "tarde",
    mesConsultado: "2026-09",
    estadoActivo: estadoTarde
  });
  assert.equal(combinado.tarde, remoto);
});
await probar("39 agosto local no contamina septiembre de Supervisión", () => {
  const septiembre = { mes: "septiembre" };
  assert.equal(combinarEstadoLocalSupervision({
    estadosPorTurno: { tarde: septiembre }, turnoActivo: "tarde",
    mesConsultado: "2026-09", mesEstadoActivo: "2026-08", estadoActivo: { mes: "agosto" }
  }).tarde, septiembre);
});
await probar("40 septiembre local no contamina agosto de Supervisión", () => {
  const agosto = { mes: "agosto" };
  assert.equal(combinarEstadoLocalSupervision({
    estadosPorTurno: { tarde: agosto }, turnoActivo: "tarde",
    mesConsultado: "2026-08", mesEstadoActivo: "2026-09", estadoActivo: { mes: "septiembre" }
  }).tarde, agosto);
});
await probar("41 combinación conserva intactos remoto y estado activo", () => {
  const remoto = { personal: [{ id: "remoto" }] };
  const local = { personal: [{ id: "local" }] };
  const copiaRemoto = structuredClone(remoto);
  const copiaLocal = structuredClone(local);
  combinarEstadoLocalSupervision({
    estadosPorTurno: { tarde: remoto }, turnoActivo: "tarde",
    mesConsultado: "2026-09", mesEstadoActivo: "2026-09", estadoActivo: local
  });
  assert.deepEqual(remoto, copiaRemoto);
  assert.deepEqual(local, copiaLocal);
});

console.log(`\nDatos Supervisión mes: ${total}/${total} pruebas OK`);
