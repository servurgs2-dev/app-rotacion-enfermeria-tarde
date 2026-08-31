import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluarDisponibilidadRestauracion } from "../src/utils/restauracionHistorial.js";
import {
  esMesHistoricoSupervision,
  puedeEditarMesSupervision,
  prepararGuardadoBorradorConfiguracionDotacion
} from "../src/utils/borradorConfiguracionDotacionSupervision.js";
import { crearServicioMovimientoPadronBase } from "../src/services/servicioMovimientoPadronBase.js";
import { crearServicioVigenciasTurnoPersonal } from "../src/services/servicioVigenciasTurnoPersonal.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(raiz, "src/App.jsx"), "utf8");
const servicioHistorial = fs.readFileSync(
  path.join(raiz, "src/services/historialEstadoTurnos.js"),
  "utf8"
);
const servicioDotacion = fs.readFileSync(
  path.join(raiz, "src/services/configuracionDotacionSupervisionMes.js"),
  "utf8"
);
let cantidad = 0;
const probar = async (nombre, ejecutar) => {
  await ejecutar();
  cantidad += 1;
  console.log(`✓ ${nombre}`);
};

const fechaReferencia = new Date("2026-09-15T12:00:00-03:00");
const metadatos = {
  existeRemoto: true,
  revisionConfirmada: "4",
  estado: "guardado",
  conflicto: null
};
const disponibilidad = (mes, cambios = {}) => evaluarDisponibilidadRestauracion({
  mes,
  mesReferencia: "2026-09",
  esSupervision: true,
  coincideContexto: true,
  metadatos,
  estadoCargado: true,
  hayCambiosLocales: false,
  restauracionEnCurso: false,
  ...cambios
});

await probar("restauración bloquea R-2", () =>
  assert.equal(disponibilidad("2026-07").codigo, "periodo_protegido"));
await probar("restauración admite temporalmente R-1", () =>
  assert.equal(disponibilidad("2026-08").permitida, true));
await probar("restauración conserva el mes actual", () =>
  assert.equal(disponibilidad("2026-09").permitida, true));
await probar("restauración bloquea R+2", () =>
  assert.equal(disponibilidad("2026-11").codigo, "periodo_protegido"));
await probar("restauración no crea un mes inexistente", () =>
  assert.equal(disponibilidad("2026-08", {
    metadatos: { ...metadatos, existeRemoto: false }
  }).codigo, "mes_inexistente"));
await probar("Licenciado continúa sin permiso para restaurar", () =>
  assert.equal(disponibilidad("2026-08", { esSupervision: false }).codigo, "sin_permiso"));

await probar("servicio de restauración frena el período antes del repositorio", () => {
  assert.match(servicioHistorial, /if \(!puedeMutarPeriodoMensual/);
  assert.match(servicioHistorial, /return Promise\.resolve\(\{ tipo: "periodo_protegido" \}\)/);
  assert.match(servicioHistorial, /return repositorio\.restaurarRevision\(argumentos\)/);
});

await probar("Supervisión clasifica R-2 como histórico cerrado", () =>
  assert.equal(esMesHistoricoSupervision("2026-07", fechaReferencia), true));
await probar("Supervisión no clasifica R-1 como histórico cerrado", () =>
  assert.equal(esMesHistoricoSupervision("2026-08", fechaReferencia), false));
await probar("dotación permite temporalmente R-1", () =>
  assert.equal(puedeEditarMesSupervision("2026-08", fechaReferencia), true));
await probar("dotación bloquea R+2", () =>
  assert.equal(puedeEditarMesSupervision("2026-11", fechaReferencia), false));
await probar("servicio de dotación también aplica la ventana", () =>
  assert.match(servicioDotacion, /if \(!puedeMutarPeriodoMensual/));
await probar("preparación de dotación bloquea fuera de ventana", () => {
  const resultado = prepararGuardadoBorradorConfiguracionDotacion({
    mes: "2026-11",
    ahora: fechaReferencia,
    origen: "fallback",
    revision: "0",
    borrador: {},
    configuracionInicial: {}
  });
  assert.equal(resultado.codigo, "MES_HISTORICO_PROTEGIDO");
});

await probar("vigencias bloquean R-2 antes del repositorio", async () => {
  let llamadas = 0;
  const servicio = crearServicioVigenciasTurnoPersonal({
    guardarFilaVigenciasTurnoPersonaMes: async () => { llamadas += 1; }
  });
  await assert.rejects(() => servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-07",
    mesReferencia: "2026-09",
    personaId: "persona-1",
    vigencias: [],
    revisionEsperada: "0"
  }), (error) => error.codigo === "MES_FUERA_DE_VENTANA");
  assert.equal(llamadas, 0);
});

await probar("cambio de padrón bloquea R+2 antes del repositorio", async () => {
  let llamadas = 0;
  const servicio = crearServicioMovimientoPadronBase({
    moverPersonaPadronBaseTurnoMes: async () => { llamadas += 1; }
  });
  await assert.rejects(() => servicio.moverPersonaPadronBaseTurnoMes({
    mes: "2026-11",
    mesReferencia: "2026-09",
    personaId: "persona-1",
    turnoOrigen: "manana",
    turnoDestino: "tarde",
    revisionOrigenEsperada: "1",
    revisionDestinoEsperada: "1"
  }), (error) => error.codigo === "MES_HISTORICO_PROTEGIDO");
  assert.equal(llamadas, 0);
});

await probar("Gestión revalida reinicio con la clave temporal", () =>
  assert.match(app, /confirmarReinicioMes[\s\S]*puedeMutarClaveMensual\(\{/));
await probar("prioridad mensual revalida la clave temporal", () =>
  assert.match(app, /guardarPrioridadCoberturaMesPreparado[\s\S]*puedeMutarClaveMensual\(\{/));
await probar("Novedades reutiliza el guard mensual central", () => {
  for (const nombre of [
    "registrarNovedad", "cancelarNovedad", "guardarListaParo",
    "guardarOlvidoTarjeta", "guardarCambioHorario", "actualizarEstadoNovedad"
  ]) {
    const inicio = app.indexOf(`const ${nombre}`);
    assert.ok(inicio >= 0, nombre);
    assert.match(app.slice(inicio, inicio + 900), /puedeMutarMesActivo\(\)/);
  }
});
await probar("restauración evalúa y revalida antes de ejecutar", () => {
  assert.match(app, /obtenerDisponibilidadRestauracion[\s\S]*evaluarDisponibilidadRestauracion/);
  assert.match(app, /iniciarRestauracionHistorial[\s\S]*obtenerDisponibilidadRestauracion/);
});
await probar("la navegación visual usa únicamente la lista temporal autorizada", () => {
  assert.match(app, /crearListaMesesNavegables/);
  assert.match(app, /<NavegadorMeses/);
});

console.log(`\n${cantidad} pruebas de protección de acciones secundarias aprobadas.`);
