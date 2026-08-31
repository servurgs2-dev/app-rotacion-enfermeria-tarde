import assert from "node:assert/strict";
import {
  CLASIFICACION_PERIODO_MES as C,
  clasificarPeriodoMes,
  esMesHistoricoCerrado,
  esMesValido,
  estaEnVentanaEditableTemporal,
  obtenerMesAnterior,
  obtenerMesLocalActual,
  obtenerMesSiguiente,
  validarMes
} from "../src/utils/periodosMensuales.js";

let total = 0;
const probar = (nombre, prueba) => { prueba(); total += 1; console.log(`✓ ${nombre}`); };
const clasificar = (mes, mesReferencia = "2026-09") => clasificarPeriodoMes({ mes, mesReferencia });

for (const [nombre, mes, esperado] of [
  ["junio queda cerrado", "2026-06", C.HISTORICO_CERRADO],
  ["julio queda cerrado", "2026-07", C.HISTORICO_CERRADO],
  ["agosto es anterior editable", "2026-08", C.ANTERIOR_EDITABLE],
  ["septiembre es actual", "2026-09", C.ACTUAL],
  ["octubre es siguiente", "2026-10", C.SIGUIENTE],
  ["noviembre queda fuera", "2026-11", C.FUTURO_FUERA_DE_VENTANA]
]) probar(nombre, () => assert.equal(clasificar(mes), esperado));

for (const [nombre, mes, referencia, esperado] of [
  ["noviembre 2025 cerrado", "2025-11", "2026-01", C.HISTORICO_CERRADO],
  ["diciembre 2025 anterior", "2025-12", "2026-01", C.ANTERIOR_EDITABLE],
  ["enero actual", "2026-01", "2026-01", C.ACTUAL],
  ["febrero siguiente", "2026-02", "2026-01", C.SIGUIENTE],
  ["noviembre anterior", "2026-11", "2026-12", C.ANTERIOR_EDITABLE],
  ["diciembre actual", "2026-12", "2026-12", C.ACTUAL],
  ["enero 2027 siguiente", "2027-01", "2026-12", C.SIGUIENTE],
  ["febrero 2027 fuera", "2027-02", "2026-12", C.FUTURO_FUERA_DE_VENTANA]
]) probar(nombre, () => assert.equal(clasificar(mes, referencia), esperado));

probar("anterior cruza de enero a diciembre", () => assert.equal(obtenerMesAnterior("2026-01"), "2025-12"));
probar("siguiente cruza de diciembre a enero", () => assert.equal(obtenerMesSiguiente("2026-12"), "2027-01"));
for (const mes of ["2026-08", "2026-09", "2026-10"]) probar(`${mes} está en ventana`, () => assert.equal(estaEnVentanaEditableTemporal({ mes, mesReferencia: "2026-09" }), true));
for (const mes of ["2026-07", "2026-11"]) probar(`${mes} está fuera de ventana`, () => assert.equal(estaEnVentanaEditableTemporal({ mes, mesReferencia: "2026-09" }), false));
probar("ventana inválida devuelve false", () => assert.equal(estaEnVentanaEditableTemporal({ mes: "2026-13", mesReferencia: "2026-09" }), false));
probar("agosto no está cerrado", () => assert.equal(esMesHistoricoCerrado({ mes: "2026-08", mesReferencia: "2026-09" }), false));
probar("julio está cerrado", () => assert.equal(esMesHistoricoCerrado({ mes: "2026-07", mesReferencia: "2026-09" }), true));

for (const valor of ["", null, undefined, 2026, "2026-1", "2026-00", "2026-13", "texto", "2026-09-01"]) {
  probar(`rechaza ${String(valor)}`, () => {
    assert.equal(esMesValido(valor), false);
    assert.throws(() => validarMes(valor), /YYYY-MM/);
  });
}
probar("referencia inyectada evita depender del reloj", () => assert.equal(clasificar("1999-12", "2000-01"), C.ANTERIOR_EDITABLE));
probar("el día no cambia la ventana mensual", () => {
  assert.equal(obtenerMesLocalActual(new Date(2026, 8, 1, 12)), "2026-09");
  assert.equal(obtenerMesLocalActual(new Date(2026, 8, 30, 12)), "2026-09");
});
probar("contrato real del 1 de septiembre", () => {
  assert.deepEqual([clasificar("2026-08"), clasificar("2026-09"), clasificar("2026-10"), clasificar("2026-07")],
    [C.ANTERIOR_EDITABLE, C.ACTUAL, C.SIGUIENTE, C.HISTORICO_CERRADO]);
});
console.log(`\n${total} pruebas aprobadas`);
