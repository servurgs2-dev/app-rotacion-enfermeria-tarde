import assert from "node:assert/strict";
import fs from "node:fs";
import { TURNOS } from "../src/config/turnos.js";
import {
  CODIGOS_ERROR_DOTACION_SUPERVISION,
  copiarConfiguracionDotacion,
  crearMetricasDotacionSupervision,
  DEFAULTS_DOTACION_SUPERVISION,
  normalizarConfiguracionDotacion,
  resolverEstadoDotacion,
  resolverUmbralDotacion,
  validarConfiguracionDotacion
} from "../src/utils/dotacionSupervision.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const overrideNoche = {
  overridesTurno: {
    noche: {
      licenciado: { minimo: 8, optimo: 10 },
      enfermero: { minimo: 12, optimo: 15 }
    }
  }
};
const umbral = (configuracion, turno, categoria) =>
  resolverUmbralDotacion({ configuracion, turno, categoria });

probar("1 defaults LE son 9/11", () => assert.deepEqual(DEFAULTS_DOTACION_SUPERVISION.licenciado, { minimo: 9, optimo: 11 }));
probar("2 defaults AE son 13/16", () => assert.deepEqual(DEFAULTS_DOTACION_SUPERVISION.enfermero, { minimo: 13, optimo: 16 }));
for (const [indice, turno] of ["manana", "tarde", "vespertino", "noche"].entries()) {
  probar(`${indice + 3} ${turno} sin override usa default`, () => {
    assert.deepEqual(umbral(undefined, turno, "licenciado"), {
      ok: true, minimo: 9, optimo: 11, fuente: "default", errores: []
    });
  });
}
probar("7 Noche admite override LE", () => assert.deepEqual(umbral(overrideNoche, "noche", "licenciado"), {
  ok: true, minimo: 8, optimo: 10, fuente: "override", errores: []
}));
probar("8 Noche admite override AE", () => assert.equal(umbral(overrideNoche, "noche", "enfermero").minimo, 12));
probar("9 override Noche no modifica Mañana", () => assert.equal(umbral(overrideNoche, "manana", "licenciado").minimo, 9));
probar("10 override LE no modifica AE", () => assert.deepEqual(
  umbral({ overridesTurno: { noche: { licenciado: { minimo: 8, optimo: 10 } } } }, "noche", "enfermero"),
  { ok: true, minimo: 13, optimo: 16, fuente: "default", errores: [] }
));
probar("11 configuración undefined usa default", () => assert.equal(umbral(undefined, "tarde", "enfermero").optimo, 16));
probar("12 configuración null usa default", () => assert.equal(umbral(null, "tarde", "licenciado").minimo, 9));
probar("13 override ausente usa default", () => assert.equal(umbral({ overridesTurno: {} }, "noche", "licenciado").fuente, "default"));
probar("14 override incompleto no mezcla valores", () => {
  const resultado = umbral({ overridesTurno: { noche: { licenciado: { minimo: 8 } } } }, "noche", "licenciado");
  assert.deepEqual([resultado.minimo, resultado.optimo, resultado.fuente], [9, 11, "default"]);
  assert.ok(resultado.errores.some(({ codigo }) => codigo === CODIGOS_ERROR_DOTACION_SUPERVISION.UMBRAL_INCOMPLETO));
});
probar("15 mínimo negativo es inválido", () => assert.equal(validarConfiguracionDotacion({ defaults: { licenciado: { minimo: -1, optimo: 11 } } }).ok, false));
probar("16 óptimo negativo es inválido", () => assert.equal(validarConfiguracionDotacion({ defaults: { licenciado: { minimo: 0, optimo: -1 } } }).ok, false));
probar("17 óptimo menor al mínimo es inválido", () => assert.equal(validarConfiguracionDotacion({ defaults: { licenciado: { minimo: 10, optimo: 9 } } }).ok, false));
probar("18 decimal es inválido", () => assert.equal(validarConfiguracionDotacion({ defaults: { licenciado: { minimo: 9.5, optimo: 11 } } }).ok, false));
probar("19 string numérico es inválido", () => assert.equal(validarConfiguracionDotacion({ defaults: { licenciado: { minimo: "9", optimo: 11 } } }).ok, false));
probar("20 turno inexistente es inválido", () => assert.equal(umbral(null, "madrugada", "licenciado").ok, false));
probar("21 categoría inexistente es inválida", () => assert.equal(umbral(null, "noche", "LE").ok, false));
probar("22 debajo del mínimo es crítico", () => assert.equal(resolverEstadoDotacion({ cantidad: 8, minimo: 9, optimo: 11 }).estado, "critico"));
probar("23 igual al mínimo es bajo óptimo", () => assert.equal(resolverEstadoDotacion({ cantidad: 9, minimo: 9, optimo: 11 }).estado, "bajo_optimo"));
probar("24 entre mínimo y óptimo es bajo óptimo", () => assert.equal(resolverEstadoDotacion({ cantidad: 10, minimo: 9, optimo: 11 }).estado, "bajo_optimo"));
probar("25 igual al óptimo es óptimo", () => assert.equal(resolverEstadoDotacion({ cantidad: 11, minimo: 9, optimo: 11 }).estado, "optimo"));
probar("26 por encima del óptimo es óptimo", () => assert.equal(resolverEstadoDotacion({ cantidad: 12, minimo: 9, optimo: 11 }).estado, "optimo"));
probar("27 faltanParaMinimo es correcto", () => assert.equal(resolverEstadoDotacion({ cantidad: 8, minimo: 9, optimo: 11 }).faltanParaMinimo, 1));
probar("28 faltanParaOptimo es correcto", () => assert.equal(resolverEstadoDotacion({ cantidad: 10, minimo: 9, optimo: 11 }).faltanParaOptimo, 1));
probar("29 excedenteSobreOptimo es correcto", () => assert.equal(resolverEstadoDotacion({ cantidad: 12, minimo: 9, optimo: 11 }).excedenteSobreOptimo, 1));
probar("30 cantidad inválida se informa explícitamente", () => {
  for (const cantidad of [-1, 1.5, null, undefined, "9"]) {
    const resultado = resolverEstadoDotacion({ cantidad, minimo: 9, optimo: 11 });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.estado, "invalido");
  }
});
probar("31 normalización no muta entrada", () => {
  const entrada = structuredClone(overrideNoche);
  const original = structuredClone(entrada);
  const resultado = normalizarConfiguracionDotacion(entrada);
  resultado.configuracion.overridesTurno.noche.licenciado.minimo = 1;
  assert.deepEqual(entrada, original);
});
probar("32 copia no comparte referencias", () => {
  const original = copiarConfiguracionDotacion(overrideNoche);
  const copia = copiarConfiguracionDotacion(original);
  copia.overridesTurno.noche.licenciado.minimo = 1;
  assert.equal(original.overridesTurno.noche.licenciado.minimo, 8);
});
probar("33 IDs y no etiquetas LE/AE gobiernan la lógica", () => {
  assert.equal(umbral(null, "noche", "LE").ok, false);
  assert.equal(umbral(null, "noche", "licenciado").ok, true);
});
probar("34 admite overrides distintos para los cuatro turnos", () => {
  const configuracion = { overridesTurno: Object.fromEntries(Object.keys(TURNOS).map((turno, indice) => [turno, { licenciado: { minimo: indice, optimo: indice + 1 } }])) };
  assert.deepEqual(Object.keys(TURNOS).map((turno) => umbral(configuracion, turno, "licenciado").minimo), [0, 1, 2, 3]);
});
probar("35 el modelo no contiene presenciaReal", () => {
  const metricas = crearMetricasDotacionSupervision({ previstosBase: 12, bajasConocidas: 1, extras: 2, asistenciaRegistrada: { presentes: 10, ausentes: 1, pendientes: 1 } });
  assert.deepEqual(metricas, { previstosBase: 12, dotacionPrevistaOperativa: 13, bajasConocidas: 1, extras: 2, asistenciaRegistrada: { presentes: 10, ausentes: 1, pendientes: 1 } });
  assert.equal(Object.hasOwn(metricas, "presenciaReal"), false);
});
probar("36 no hay excepción hardcodeada para Noche", () => {
  const fuente = fs.readFileSync(new URL("../src/utils/dotacionSupervision.js", import.meta.url), "utf8");
  assert.doesNotMatch(fuente, /turno\s*===\s*["']noche["']/);
  assert.doesNotMatch(fuente, /if\s*\([^)]*noche/);
});

console.log(`\nDotación Supervisión: ${total}/${total} pruebas OK`);
