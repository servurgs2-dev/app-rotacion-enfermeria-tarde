import assert from "node:assert/strict";
import fs from "node:fs";
import {
  formatearAlertaSectoresCriticos,
  obtenerSectoresCriticosSinCobertura
} from "../src/utils/alertaSectoresCriticos.js";
import { configuracionSectores } from "../src/data/sectores.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const criticos = configuracionSectores.enfermero.sectoresCriticosIds;
const ids = { "REA 1": "rea_1", SM: "salud_mental", "REA 2": "rea_2", "EXPLORA 2": "explora_2", "SILLON 2": "sillon_2", "PRE INT 2": "pre_int_2" };
const conIdentidad = (asignaciones) => asignaciones.map((fila) => ({
  tipo: "sector", sectorId: ids[fila.nombre] || fila.sectorId, etiqueta: fila.nombre, ...fila
}));
const persona = { id: "p1", nombre: "Persona A" };
const detectar = (asignaciones, lista = criticos) =>
  obtenerSectoresCriticosSinCobertura({
    asignaciones: conIdentidad(asignaciones),
    sectoresCriticosIds: lista
  });
const calendario = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
const resumen = fs.readFileSync(
  new URL("../src/utils/resumenTurno.js", import.meta.url),
  "utf8"
);

probar("1 REA 1 vacío genera alerta usando la configuración real", () => {
  assert.ok(criticos.includes("rea_1"));
  assert.deepEqual(detectar([{ nombre: "REA 1", enfermero: null }]), ["REA 1"]);
});
probar("2 un sector crítico cubierto no genera alerta", () => {
  assert.deepEqual(detectar([{ nombre: "REA 1", enfermero: persona }]), []);
});
probar("3 dos críticos vacíos aparecen en la misma alerta", () => {
  const sectores = detectar([
    { nombre: "REA 1", enfermero: null },
    { nombre: "SM", enfermero: null }
  ]);
  assert.equal(
    formatearAlertaSectoresCriticos(sectores),
    "Sectores críticos sin cobertura: REA 1 y SM"
  );
});
["REA 2", "EXPLORA 2", "SILLON 2", "PRE INT 2"].forEach((sector, indice) => {
  probar(`${4 + indice} ${sector} vacío no genera alerta`, () => {
    assert.equal(criticos.includes(ids[sector]), false);
    assert.deepEqual(detectar([{ nombre: sector, enfermero: null }]), []);
  });
});
probar("8 una posición T vacía no genera alerta", () => {
  assert.deepEqual(detectar([{ nombre: "T1", tipo: "turnante", enfermero: null }]), []);
});
probar("9 SIN ASIGNAR no genera alerta", () => {
  assert.deepEqual(detectar([{ nombre: "SIN ASIGNAR", enfermero: null }], ["sin_asignar"]), []);
});
probar("10 la alerta se evalúa después de asignacionesMostradas", () => {
  const final = calendario.indexOf("const asignacionesMostradas");
  const detector = calendario.indexOf("obtenerSectoresCriticosSinCobertura", final);
  const render = calendario.indexOf("{alertaSectoresCriticos &&", detector);
  assert.ok(final > 0 && detector > final && render > detector);
});
probar("11 un Turnante que cubre el crítico elimina la alerta", () => {
  assert.deepEqual(
    detectar([{ nombre: "REA 1", enfermero: { ...persona, esTurnante: true } }]),
    []
  );
});
probar("12 un Extra que cubre el crítico elimina la alerta", () => {
  assert.deepEqual(
    detectar([{ nombre: "REA 1", enfermero: { ...persona, origenExtra: "manual" } }]),
    []
  );
});
probar("13 la prioridad por parejas que cubre el principal evita la alerta", () => {
  assert.deepEqual(
    detectar([
      { nombre: "REA 1", enfermero: persona, coberturaDesdePareja: "REA 2" },
      { nombre: "REA 2", enfermero: null }
    ]),
    []
  );
});
probar("14 un cambio manual que vacía un crítico activa la alerta", () => {
  assert.deepEqual(
    detectar([{ nombre: "REA 1", enfermero: null, vacioManual: true }]),
    ["REA 1"]
  );
});
probar("15 un cambio manual que cubre el crítico elimina la alerta", () => {
  assert.deepEqual(
    detectar([{ nombre: "REA 1", enfermero: persona, cambioManual: true }]),
    []
  );
});
for (const [indice, etiqueta] of [
  [16, "ausencia"],
  [17, "No disponible"],
  [18, "certificación"]
]) {
  probar(`${indice} un crítico vacío por ${etiqueta} mantiene la alerta`, () => {
    assert.deepEqual(
      detectar([{ nombre: "REA 1", enfermero: null, etiquetaVacio: etiqueta }]),
      ["REA 1"]
    );
  });
}
probar("19 el detector no modifica ninguna asignación", () => {
  const asignaciones = [{ nombre: "REA 1", enfermero: null, futura: { valor: 1 } }];
  const copia = structuredClone(asignaciones);
  detectar(asignaciones);
  assert.deepEqual(asignaciones, copia);
});
probar("20 las alertas anteriores permanecen intactas", () => {
  assert.match(calendario, /resumenMostrado\.alertas/);
  assert.match(resumen, /sector_critico_sin_cobertura/);
  assert.doesNotMatch(resumen, /formatearAlertaSectoresCriticos/);
});
probar("21 la nueva alerta no se agrega al PDF", () => {
  const pdf = fs.readFileSync(new URL("../src/utils/exportPDF.js", import.meta.url), "utf8");
  assert.doesNotMatch(pdf, /alertaSectoresCriticos|Sectores críticos sin cobertura/);
});
probar("22 no existe SQL nuevo", () => {
  const helper = fs.readFileSync(
    new URL("../src/utils/alertaSectoresCriticos.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(helper, /\b(?:select|insert|update|delete)\s+(?:from|into|public\.)/i);
});

console.log(`\n${total} pruebas de alerta de sectores críticos pasaron.`);
