import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  esPersonaEfectivaEnTurnoPeriodo,
  resolverPadronVigenciasEfectivasMes,
  resolverPersonalEfectivoPorTurnoPeriodo
} from "../src/utils/padronVigenciasTurnoPersonal.js";

const persona = (id, nombre, categoria = "enfermero", otros = {}) => ({ id, nombre, categoria, ...otros });
const romina = persona("P", "Romina");
const estadosBase = {
  manana: { personal: [romina] }, tarde: { personal: [] },
  vespertino: { personal: [] }, noche: { personal: [] }
};
const configuracion = (vigencias) => ({ personaId: "P", mes: "2026-09", revision: "2", vigencias });
const vigencia = (turno, desde, hasta) => ({ personaId: "P", mes: "2026-09", turno, desde, hasta });
const padron = (configuracionesExplicitas = []) => resolverPadronVigenciasEfectivasMes({
  mes: "2026-09", estadosPorTurno: estadosBase, configuracionesExplicitas
});
const resolver = (actual, turno, desde, hasta, personalFisico = []) =>
  resolverPersonalEfectivoPorTurnoPeriodo({ padron: actual, turno, desde, hasta, personalFisico });
const ids = (resultado) => resultado.personas.map(({ id }) => id);
const rominaExplicita = configuracion([
  vigencia("manana", "2026-09-01", "2026-09-19"),
  vigencia("tarde", "2026-09-20", "2026-09-30")
]);

test("legacy pertenece a su turno base en todos los períodos del mes", () => {
  const actual = padron();
  assert.deepEqual(ids(resolver(actual, "manana", "2026-09-01", "2026-09-07", [romina])), ["P"]);
  assert.deepEqual(ids(resolver(actual, "manana", "2026-09-29", "2026-10-05", [romina])), ["P"]);
  assert.deepEqual(ids(resolver(actual, "tarde", "2026-09-01", "2026-09-30")), []);
});

test("caso Romina aplica intersección semanal y permite ambos turnos 15–21", () => {
  const actual = padron([rominaExplicita]);
  const casos = [
    ["2026-09-01", "2026-09-07", true, false],
    ["2026-09-08", "2026-09-14", true, false],
    ["2026-09-15", "2026-09-21", true, true],
    ["2026-09-22", "2026-09-28", false, true],
    ["2026-09-29", "2026-09-30", false, true]
  ];
  casos.forEach(([desde, hasta, manana, tarde]) => {
    assert.equal(ids(resolver(actual, "manana", desde, hasta, [romina])).includes("P"), manana);
    assert.equal(ids(resolver(actual, "tarde", desde, hasta)).includes("P"), tarde);
  });
  assert.equal(ids(resolver(actual, "manana", "2026-09-15", "2026-09-21", [romina]))[0], "P");
  assert.equal(ids(resolver(actual, "tarde", "2026-09-15", "2026-09-21"))[0], "P");
});

test("gap completo no cae a legacy e intersecciones parciales sí cuentan", () => {
  const actual = padron([configuracion([
    vigencia("manana", "2026-09-01", "2026-09-10"),
    vigencia("tarde", "2026-09-20", "2026-09-30")
  ])]);
  assert.deepEqual(ids(resolver(actual, "manana", "2026-09-11", "2026-09-17", [romina])), []);
  assert.deepEqual(ids(resolver(actual, "tarde", "2026-09-11", "2026-09-17")), []);
  assert.deepEqual(ids(resolver(actual, "manana", "2026-09-08", "2026-09-14", [romina])), ["P"]);
  assert.deepEqual(ids(resolver(actual, "tarde", "2026-09-15", "2026-09-21")), ["P"]);
});

test("período de un día usa intersección inclusiva", () => {
  const actual = padron([rominaExplicita]);
  assert.deepEqual(ids(resolver(actual, "manana", "2026-09-19", "2026-09-19", [romina])), ["P"]);
  assert.deepEqual(ids(resolver(actual, "tarde", "2026-09-20", "2026-09-20")), ["P"]);
});

test("rechaza período invertido, fechas irreales y período ajeno al mes", () => {
  const actual = padron([rominaExplicita]);
  assert.equal(resolver(actual, "manana", "2026-09-20", "2026-09-19").diagnosticos[0].codigo, "PERIODO_PLANILLA_INVERTIDO");
  assert.equal(resolver(actual, "manana", "2026-09-31", "2026-10-02").diagnosticos[0].codigo, "PERIODO_PLANILLA_INVALIDO");
  assert.equal(resolver(actual, "manana", "2026-08-20", "2026-08-22").diagnosticos[0].codigo, "PERIODO_PLANILLA_FUERA_DE_MES");
});

test("varias personas, homónimos y categorías conservan identidades separadas", () => {
  const e1 = persona("E1", "Juan", "enfermero");
  const e2 = persona("E2", "Juan", "enfermero");
  const l1 = persona("L1", "Juan", "licenciado");
  const actual = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: { manana: { personal: [e1, e2, l1] }, tarde: { personal: [] }, noche: { personal: [] }, vespertino: { personal: [] } },
    configuracionesExplicitas: []
  });
  assert.deepEqual(new Set(ids(resolver(actual, "manana", "2026-09-01", "2026-09-07", [e1, e2, l1]))), new Set(["E1", "E2", "L1"]));
});

test("persona física Mañana puede ser efectiva Tarde sin tener asignación", () => {
  const resultado = resolver(padron([rominaExplicita]), "tarde", "2026-09-22", "2026-09-28");
  assert.deepEqual(resultado.personas, [romina]);
  assert.equal(resultado.personas[0].sector, undefined);
});

test("helper individual responde false para referencia fuera del período", () => {
  const resultado = esPersonaEfectivaEnTurnoPeriodo({
    padron: padron([rominaExplicita]), personaId: "P", turno: "manana",
    desde: "2026-09-22", hasta: "2026-09-28", personalFisico: [romina]
  });
  assert.equal(resultado.pertenece, false);
});

test("asignación fija y marca Turnante no alteran membresía", () => {
  const marcada = persona("P", "Romina", "enfermero", { turnante: true });
  const actual = padron([configuracion([vigencia("tarde", "2026-09-01", "2026-09-30")])]);
  assert.deepEqual(ids(resolver(actual, "manana", "2026-09-01", "2026-09-07", [marcada])), []);
  assert.deepEqual(ids(resolver(actual, "tarde", "2026-09-01", "2026-09-07")), ["P"]);
});

test("corrupción conserva cohorte física y padrón ausente usa fallback", () => {
  const corrupto = padron([configuracion([vigencia("tarde", "2026-09-31", "2026-09-31")])]);
  assert.deepEqual(ids(resolver(corrupto, "manana", "2026-09-01", "2026-09-07", [romina])), ["P"]);
  assert.deepEqual(ids(resolver(null, "manana", "dato", "inválido", [romina])), ["P"]);
});

test("bloques nocturnos intersectan con un solo día y pueden cruzar mes", () => {
  const actual = padron([configuracion([vigencia("noche", "2026-09-01", "2026-09-01")])]);
  assert.deepEqual(ids(resolver(actual, "noche", "2026-08-31", "2026-09-02")), ["P"]);
  assert.deepEqual(ids(resolver(actual, "noche", "2026-09-01", "2026-09-03")), ["P"]);
  assert.deepEqual(ids(resolver(actual, "noche", "2026-08-30", "2026-08-31")), []);
});

test("bloque de tres días acepta vigencia sólo al primer o último día", () => {
  const primero = padron([configuracion([vigencia("noche", "2026-09-18", "2026-09-18")])]);
  const ultimo = padron([configuracion([vigencia("noche", "2026-09-20", "2026-09-20")])]);
  assert.deepEqual(ids(resolver(primero, "noche", "2026-09-18", "2026-09-20")), ["P"]);
  assert.deepEqual(ids(resolver(ultimo, "noche", "2026-09-18", "2026-09-20")), ["P"]);
});

test("no duplica ni muta entradas", () => {
  const actual = padron([configuracion([
    vigencia("manana", "2026-09-01", "2026-09-05"),
    vigencia("manana", "2026-09-10", "2026-09-15")
  ])]);
  const fisico = [romina];
  const copiaPadron = structuredClone(actual);
  const copiaFisico = structuredClone(fisico);
  assert.deepEqual(ids(resolver(actual, "manana", "2026-09-01", "2026-09-15", fisico)), ["P"]);
  assert.deepEqual(actual, copiaPadron);
  assert.deepEqual(fisico, copiaFisico);
});

test("PlanillaMensual no integra todavía el helper ni cambia asignaciones", () => {
  const codigo = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  assert.doesNotMatch(codigo, /resolverPersonalEfectivoPorTurnoPeriodo/);
  assert.doesNotMatch(codigo, /esPersonaEfectivaEnTurnoPeriodo/);
});
