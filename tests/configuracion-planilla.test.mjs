import assert from "node:assert/strict";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  obtenerConfiguracionLegacyPlanilla,
  obtenerEtiquetaSector,
  obtenerFilasActivas,
  obtenerFilasConfiguracionEfectivas,
  obtenerSectorIdPorNombreHistorico,
  obtenerTurnantesBase,
  TIPOS_FILA_PLANILLA
} from "../src/utils/configuracionPlanilla.js";
import {
  obtenerFilasBasePlanilla,
  obtenerFilasEfectivasPlanilla
} from "../src/utils/turnanteMensual.js";
import { obtenerFilasPlanilla } from "../src/utils/preparacionMesNuevo.js";
import { generarRotacionMensual } from "../src/utils/rotacionPlanilla.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const ordenEnfermeros = [
  "REA 1", "EXPLORA 1", "1-3 + 21", "T1", "PRE INT 1", "DX 25-30",
  "8-13", "T2", "4-7", "SILLÓN 1", "T3", "14-19", "REA 2",
  "SILLON 2", "20-22-24", "T4", "PRE INT 2", "EXPLORA 2", "SM", "T5"
];
const ordenLicenciados = [
  "Triage 1", "Estabiliza", "T1", "Reanimación + Sillones", "Observación 1",
  "Explora", "Triage 2", "Diagnostico", "Observación 2", "T2",
  "Preinternación", "Salud Mental"
];
const etiquetas = (filas) => filas.map((fila) => fila.etiqueta);
const sectores = (filas) => filas.filter((fila) => fila.tipo === TIPOS_FILA_PLANILLA.SECTOR);

const enfermeros = obtenerConfiguracionLegacyPlanilla("enfermero").filas;
const licenciados = obtenerConfiguracionLegacyPlanilla("licenciado").filas;

probar("Enfermeros conserva 15 sectores", () => assert.equal(sectores(enfermeros).length, 15));
probar("Enfermeros conserva T1-T5 base", () =>
  assert.deepEqual(obtenerTurnantesBase("enfermero").map((fila) => fila.etiqueta), ["T1", "T2", "T3", "T4", "T5"]));
probar("Enfermeros conserva el orden exacto", () => assert.deepEqual(etiquetas(enfermeros), ordenEnfermeros));
probar("T6 está ausente por defecto", () => assert.equal(etiquetas(enfermeros).includes("T6"), false));
probar("T6 aparece solo habilitado y al final", () => {
  const filas = obtenerFilasConfiguracionEfectivas("enfermero", { posicionesMensualesAdicionales: ["T6"] });
  assert.equal(filas.at(-1).etiqueta, "T6");
  assert.equal(filas.at(-1).turnanteId, "turnante_6");
});

probar("Licenciados conserva 10 sectores", () => assert.equal(sectores(licenciados).length, 10));
probar("Licenciados tiene únicamente T1 y T2 base", () =>
  assert.deepEqual(obtenerTurnantesBase("licenciado").map((fila) => fila.etiqueta), ["T1", "T2"]));
probar("Licenciados conserva el orden exacto", () => assert.deepEqual(etiquetas(licenciados), ordenLicenciados));
probar("T3 está ausente por defecto", () => assert.equal(etiquetas(licenciados).includes("T3"), false));
probar("T3 aparece una sola vez al habilitarlo", () => {
  const filas = obtenerFilasConfiguracionEfectivas("licenciado", { posicionesMensualesAdicionales: ["T3"] });
  assert.equal(filas.filter((fila) => fila.etiqueta === "T3").length, 1);
  assert.equal(filas.at(-1).filaId, "licenciado.turnante.3");
});

probar("Diagnostico y Diagnóstico comparten sectorId", () =>
  assert.equal(obtenerSectorIdPorNombreHistorico("Diagnostico"), obtenerSectorIdPorNombreHistorico("Diagnóstico")));
probar("SILLON 1 y SILLÓN 1 comparten sectorId", () =>
  assert.equal(obtenerSectorIdPorNombreHistorico("SILLON 1"), obtenerSectorIdPorNombreHistorico("SILLÓN 1")));
probar("SILLON 2 y SILLÓN 2 comparten sectorId", () =>
  assert.equal(obtenerSectorIdPorNombreHistorico("SILLON 2"), obtenerSectorIdPorNombreHistorico("SILLÓN 2")));
probar("aliases sin tilde conservan identidad", () => {
  assert.equal(obtenerSectorIdPorNombreHistorico("Observacion 1"), "observacion_1");
  assert.equal(obtenerSectorIdPorNombreHistorico("Preinternacion"), "preinternacion");
});
probar("etiqueta visible permanece separada del sectorId", () => {
  assert.equal(obtenerEtiquetaSector("diagnostico"), "Diagnostico");
  assert.equal(obtenerEtiquetaSector("salud_mental", { tipo: "enfermero" }), "SM");
});

probar("todas las filas tienen filaId único y estado activo", () => {
  const filas = [...enfermeros, ...licenciados];
  assert.equal(new Set(filas.map((fila) => fila.filaId)).size, filas.length);
  assert.equal(filas.every((fila) => fila.activo === true), true);
});
probar("obtenerFilasActivas prepara desactivación futura", () =>
  assert.deepEqual(obtenerFilasActivas([{ filaId: "a", activo: true }, { filaId: "b", activo: false }]).map((fila) => fila.filaId), ["a"]));
probar("helper legacy público conserva etiquetas de Enfermeros", () =>
  assert.deepEqual(obtenerFilasBasePlanilla(configuracionSectores.enfermero), ordenEnfermeros));
probar("helper legacy público conserva etiquetas de Licenciados", () =>
  assert.deepEqual(obtenerFilasBasePlanilla(configuracionSectores.licenciado), ordenLicenciados));
probar("preparación de mes usa el mismo adaptador", () => {
  assert.deepEqual(obtenerFilasPlanilla(configuracionSectores.enfermero), ordenEnfermeros);
  assert.deepEqual(obtenerFilasPlanilla(configuracionSectores.licenciado), ordenLicenciados);
});
probar("filas efectivas legacy agregan T3 sin duplicarlo", () => {
  const filas = obtenerFilasEfectivasPlanilla(ordenLicenciados, { posicionesMensualesAdicionales: ["T3"] }, "licenciado");
  assert.equal(filas.filter((fila) => fila === "T3").length, 1);
  assert.equal(filas.at(-1), "T3");
});
probar("generación mantiene el orden y las claves actuales", () => {
  const semana1 = Object.fromEntries(ordenLicenciados.map((fila, indice) => [fila, `p${indice}`]));
  const resultado = generarRotacionMensual({
    planilla: { semana1 }, filas: ordenLicenciados,
    semanas: [{ clave: "semana1" }, { clave: "semana2" }],
    filaFija: "Salud Mental", personal: []
  });
  assert.deepEqual(Object.keys(resultado.semana2), ordenLicenciados);
  assert.equal(resultado.semana2["Salud Mental"], semana1["Salud Mental"]);
});

console.log(`\nEtapa 34A: ${total} pruebas de configuración aprobadas.`);
