import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ErrorGeneracionAsignacionesFijas } from "../src/utils/asignacionesFijasMensuales.js";
import { construirAsignacionesDiariasCalendario } from "../src/utils/pipelineCalendarioDiario.js";
import { generarRotacionMensual } from "../src/utils/rotacionPlanilla.js";

const persona = (id, nombre = id, categoria = "enfermero") => ({ id, nombre, categoria });
const P = persona("P", "Romina");
const Q = persona("Q", "Ana");
const R = persona("R", "Beatriz");
const L = persona("L", "Lucía", "licenciado");
const ref = (p) => ({ personaId: p.id, nombre: p.nombre });
const semanas = Array.from({ length: 5 }, (_, indice) => ({ clave: `semana${indice + 1}` }));
const filas = ["A", "B", "T1"];
const filasConfiguracion = [
  { filaId: "a", sectorId: "a", etiqueta: "A", tipo: "sector", activo: true },
  { filaId: "b", sectorId: "b", etiqueta: "B", tipo: "sector", activo: true },
  { filaId: "t1", turnanteId: "t1", etiqueta: "T1", tipo: "turnante", activo: true },
  { filaId: "x", sectorId: "x", etiqueta: "X", tipo: "sector", activo: false }
];
const planilla = { semana1: { A: ref(P), B: ref(Q), T1: ref(R) }, asignacionesParciales: { semana3: [{ id: "parcial", personaId: "P" }] } };
const idsDistribucion = (distribucion) => Object.values(distribucion || {})
  .map((referencia) => referencia?.personaId)
  .filter(Boolean);
const generar = (otros = {}) => generarRotacionMensual({
  planilla, filas, semanas, filasConfiguracion, categoria: "enfermero",
  personal: [P, Q, R], personalCanonico: [P, Q, R], ...otros
});

test("cohorte estable conserva exactamente el generador legacy", () => {
  const legacy = generar();
  const variable = generar({
    personalPorPeriodo: Object.fromEntries(semanas.map(({ clave }) => [clave, [P, Q, R]]))
  });
  assert.deepEqual(variable, legacy);
});

test("baja filtra referencias futuras y conserva continuidad de quienes permanecen", () => {
  const personalPorPeriodo = {
    semana1: [P, Q, R], semana2: [P, Q, R], semana3: [P, Q, R],
    semana4: [Q, R], semana5: [Q, R]
  };
  const resultado = generar({ personalPorPeriodo });
  const legacy = generar();
  assert.ok(idsDistribucion(resultado.semana3).includes("P"));
  assert.ok(!idsDistribucion(resultado.semana4).includes("P"));
  assert.ok(!idsDistribucion(resultado.semana5).includes("P"));
  for (const clave of ["semana4", "semana5"]) {
    for (const id of ["Q", "R"]) {
      const filaEsperada = Object.entries(legacy[clave]).find(([, referencia]) => referencia?.personaId === id)?.[0];
      assert.equal(resultado[clave][filaEsperada]?.personaId, id);
    }
  }
  assert.deepEqual(resultado.asignacionesParciales, planilla.asignacionesParciales);
});

test("alta sin fija no recibe un sector arbitrario", () => {
  const S = persona("S", "Nueva");
  const resultado = generar({
    personalCanonico: [P, Q, R, S],
    personalPorPeriodo: {
      semana1: [P, Q, R], semana2: [P, Q, R],
      semana3: [P, Q, R, S], semana4: [P, Q, R, S], semana5: [P, Q, R, S]
    }
  });
  assert.ok(!idsDistribucion(resultado.semana2).includes("S"));
  assert.ok(!idsDistribucion(resultado.semana3).includes("S"));
  assert.deepEqual(S, persona("S", "Nueva"));
});

test("cambio Mañana a Tarde y gap respetan cohortes por semana", () => {
  const manana = generar({ personalPorPeriodo: {
    semana1: [P, Q, R], semana2: [P, Q, R], semana3: [P, Q, R],
    semana4: [Q, R], semana5: [Q, R]
  } });
  const tarde = generar({
    planilla: { semana1: { A: ref(Q), B: ref(R), T1: "" } },
    personal: [Q, R], personalCanonico: [P, Q, R],
    personalPorPeriodo: {
      semana1: [Q, R], semana2: [Q, R], semana3: [P, Q, R],
      semana4: [P, Q, R], semana5: [P, Q, R]
    }
  });
  assert.ok(idsDistribucion(manana.semana3).includes("P"));
  assert.ok(!idsDistribucion(manana.semana4).includes("P"));
  assert.ok(!idsDistribucion(tarde.semana2).includes("P"));
  assert.ok(!idsDistribucion(tarde.semana3).includes("P"), "una alta sin destino queda sin asignar");
  Object.values(manana).filter((valor) => valor && typeof valor === "object").forEach((distribucion) => {
    const ids = idsDistribucion(distribucion);
    assert.equal(new Set(ids).size, ids.length);
  });
});

test("gap explícito no cae al padrón físico y permite retorno posterior", () => {
  const resultado = generar({ personalPorPeriodo: {
    semana1: [P, Q, R], semana2: [Q, R], semana3: [Q, R],
    semana4: [P, Q, R], semana5: [P, Q, R]
  } });
  assert.ok(idsDistribucion(resultado.semana1).includes("P"));
  assert.ok(!idsDistribucion(resultado.semana2).includes("P"));
  assert.ok(!idsDistribucion(resultado.semana3).includes("P"));
  assert.ok(idsDistribucion(resultado.semana4).includes("P"));
});

test("fija se aplica sólo en semanas donde la persona pertenece", () => {
  const resultado = generar({
    asignacionesFijas: [{ sectorId: "a", personaId: "P" }],
    personalPorPeriodo: {
      semana1: [P, Q, R], semana2: [P, Q, R], semana3: [P, Q, R],
      semana4: [Q, R], semana5: [P, Q, R]
    }
  });
  assert.equal(resultado.semana1.A.personaId, "P");
  assert.equal(resultado.semana3.A.personaId, "P");
  assert.notEqual(resultado.semana4.A?.personaId, "P");
  assert.equal(resultado.semana5.A.personaId, "P");
});

test("fija de persona que entra tiene destino explícito y desplaza sin reasignación arbitraria", () => {
  const S = persona("S", "Nueva");
  const resultado = generar({
    personalCanonico: [P, Q, R, S],
    asignacionesFijas: [{ sectorId: "b", personaId: "S" }],
    personalPorPeriodo: {
      semana1: [P, Q, R], semana2: [P, Q, R],
      semana3: [P, Q, R, S], semana4: [P, Q, R, S], semana5: [P, Q, R, S]
    }
  });
  assert.notEqual(resultado.semana2.B?.personaId, "S");
  assert.equal(resultado.semana3.B.personaId, "S");
  assert.equal(idsDistribucion(resultado.semana3).filter((id) => id === "S").length, 1);
});

test("fija realmente inexistente conserva error de configuración", () => {
  assert.throws(() => generar({
    asignacionesFijas: [{ sectorId: "a", personaId: "Z" }],
    personalPorPeriodo: {
      semana1: [P, Q, R], semana2: [P, Q], semana3: [P, Q], semana4: [P, Q], semana5: [P, Q]
    }
  }), (error) => error instanceof ErrorGeneracionAsignacionesFijas &&
    error.errores.some(({ codigo }) => codigo === "PERSONA_INEXISTENTE"));
});

test("Turnante, filas activas y Salud Mental conservan contratos existentes", () => {
  const resultado = generar({
    filaFija: "B",
    filasFijas: ["B"],
    personalPorPeriodo: {
      semana1: [P, Q, R], semana2: [P, Q, R], semana3: [P, Q, R],
      semana4: [P, Q], semana5: [P, Q]
    }
  });
  assert.ok(Object.hasOwn(resultado.semana2, "T1"));
  assert.ok(!Object.hasOwn(resultado.semana2, "X"));
  assert.equal(resultado.semana2.B?.personaId, "Q");
});

test("funciona también para Licenciados y homónimos por ID", () => {
  const L2 = persona("L2", "Lucía", "licenciado");
  const resultado = generarRotacionMensual({
    planilla: { semana1: { A: ref(L), B: ref(L2) } },
    filas: ["A", "B"], semanas,
    filasConfiguracion: filasConfiguracion.slice(0, 2), categoria: "licenciado",
    personal: [L], personalCanonico: [L, L2],
    personalPorPeriodo: {
      semana1: [L], semana2: [L], semana3: [L, L2], semana4: [L, L2], semana5: [L, L2]
    }
  });
  assert.equal(idsDistribucion(resultado.semana1)[0], "L");
  assert.ok(!idsDistribucion(resultado.semana1).includes("L2"));
  assert.equal(new Set(idsDistribucion(resultado.semana3)).size, idsDistribucion(resultado.semana3).length);
});

test("generación explícita reemplaza referencia fuera de cohorte sin mutar entradas", () => {
  const entrada = structuredClone(planilla);
  const personalEntrada = structuredClone([P, Q, R]);
  const resultado = generar({
    planilla: { ...planilla, semana4: { A: ref(P) } },
    personalPorPeriodo: {
      semana1: [P, Q, R], semana2: [P, Q, R], semana3: [P, Q, R],
      semana4: [Q, R], semana5: [Q, R]
    }
  });
  assert.ok(!idsDistribucion(resultado.semana4).includes("P"));
  assert.deepEqual(planilla, entrada);
  assert.deepEqual([P, Q, R], personalEntrada);
});

test("Calendario B5A resuelve una referencia generada en fecha efectiva", () => {
  const resultado = generar({ personalPorPeriodo: {
    semana1: [P, Q, R], semana2: [P, Q, R], semana3: [P, Q, R],
    semana4: [Q, R], semana5: [Q, R]
  } });
  const filaP = Object.entries(resultado.semana3).find(([, referencia]) => referencia?.personaId === "P");
  const diario = construirAsignacionesDiariasCalendario({
    filasCalendario: [filaP[0]], filasConfiguracion: [],
    planillaPeriodoEfectiva: resultado.semana3, personal: [P, Q, R]
  });
  assert.equal(diario[0].enfermero.id, "P");
});

test("integración elimina el bloqueo temporal sin tocar Noche ni preparación", () => {
  const componente = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  const rotacion = fs.readFileSync("src/utils/rotacionPlanilla.js", "utf8");
  const preparacion = fs.readFileSync("src/utils/preparacionMesNuevo.js", "utf8");
  assert.match(componente, /personalPorPeriodo/);
  assert.doesNotMatch(componente, /cohortesSemanalesDifieren/);
  assert.match(rotacion, /export const resolverAsignacionBaseRotacion3DiasEfectiva/);
  assert.match(preparacion, /export const analizarPreparacionMesNuevo/);
});
