import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { resolverPadronVigenciasEfectivasMes } from "../src/utils/padronVigenciasTurnoPersonal.js";
import {
  obtenerPersonasSinAsignarPlanillaSemanal,
  resolverCohortePlanillaSemanal,
  resolverPersonalPlanificablePeriodo,
  resolverReferenciaPlanillaSemanal
} from "../src/utils/planillaVigenciasSemanales.js";
import { crearReferenciaPersona } from "../src/utils/referenciasPersonas.js";
import { construirAsignacionesDiariasCalendario } from "../src/utils/pipelineCalendarioDiario.js";

const romina = { id: "P", nombre: "Romina", categoria: "enfermero" };
const lucia = { id: "L", nombre: "Lucía", categoria: "licenciado" };
const estados = {
  manana: { personal: [romina, lucia] }, tarde: { personal: [] },
  noche: { personal: [] }, vespertino: { personal: [] }
};
const config = (personaId, vigencias) => ({
  personaId, mes: "2026-09", revision: "2", vigencias
});
const v = (personaId, turno, desde, hasta) => ({ personaId, mes: "2026-09", turno, desde, hasta });
const padron = resolverPadronVigenciasEfectivasMes({
  mes: "2026-09", estadosPorTurno: estados,
  configuracionesExplicitas: [
    config("P", [v("P", "manana", "2026-09-01", "2026-09-19"), v("P", "tarde", "2026-09-20", "2026-09-30")]),
    config("L", [v("L", "tarde", "2026-09-15", "2026-09-21")])
  ]
});
const semana = (desde, hasta, clave = "semana1") => ({
  clave, desde: new Date(`${desde}T12:00:00`), hasta: new Date(`${hasta}T12:00:00`)
});
const cohorte = (turno, periodo, categoria = "enfermero", otros = {}) =>
  resolverCohortePlanillaSemanal({
    padron, turno, periodo, personalFisico: turno === "manana" ? [romina, lucia] : [],
    categoria, ...otros
  }).personas;
const ids = (personas) => personas.map(({ id }) => id);
const planificables = ({
  padronActual = padron,
  turno = "manana",
  periodo,
  personalFisico = estados[turno]?.personal || [],
  categoria = "enfermero",
  licencias = []
}) => resolverPersonalPlanificablePeriodo({
  padron: padronActual,
  turno,
  periodo,
  mes: "2026-09",
  personalFisico,
  categoria,
  licencias
}).personas;

test("Romina integra las cohortes semanales de Mañana y Tarde por intersección", () => {
  const casos = [
    ["2026-09-01", "2026-09-07", true, false],
    ["2026-09-08", "2026-09-14", true, false],
    ["2026-09-15", "2026-09-21", true, true],
    ["2026-09-22", "2026-09-28", false, true],
    ["2026-09-29", "2026-09-30", false, true]
  ];
  casos.forEach(([desde, hasta, enManana, enTarde]) => {
    assert.equal(ids(cohorte("manana", semana(desde, hasta))).includes("P"), enManana);
    assert.equal(ids(cohorte("tarde", semana(desde, hasta))).includes("P"), enTarde);
  });
  assert.equal(ids(cohorte("manana", semana("2026-09-15", "2026-09-21")))[0], "P");
  assert.equal(ids(cohorte("tarde", semana("2026-09-15", "2026-09-21")))[0], "P");
});

test("legacy, loading y error conservan el padrón físico", () => {
  const periodo = semana("2026-09-22", "2026-09-28");
  for (const estadoCargaVigencias of [{ cargando: true }, { error: new Error("red") }]) {
    assert.deepEqual(ids(resolverCohortePlanillaSemanal({
      padron, estadoCargaVigencias, turno: "manana", periodo,
      personalFisico: [romina], categoria: "enfermero"
    }).personas), ["P"]);
  }
  assert.deepEqual(ids(resolverCohortePlanillaSemanal({
    padron: null, turno: "manana", periodo, personalFisico: [romina], categoria: "enfermero"
  }).personas), ["P"]);
});

test("Enfermeros Noche cada_3_dias usa la cohorte efectiva del bloque", () => {
  assert.deepEqual(ids(resolverCohortePlanillaSemanal({
    padron, turno: "tarde", periodo: semana("2026-09-22", "2026-09-24"),
    personalFisico: [], categoria: "enfermero", usaRotacionTresDias: true
  }).personas), ["P"]);
});

test("referencia transversal se resuelve sólo en su cohorte y conserva el mismo ID", () => {
  const referencia = crearReferenciaPersona(romina);
  const vigente = cohorte("tarde", semana("2026-09-22", "2026-09-28"));
  const fuera = cohorte("tarde", semana("2026-09-08", "2026-09-14"));
  assert.equal(resolverReferenciaPlanillaSemanal({ referencia, personalPeriodo: vigente }).persona.id, "P");
  const conflicto = resolverReferenciaPlanillaSemanal({ referencia, personalPeriodo: fuera });
  assert.equal(conflicto.persona, null);
  assert.equal(conflicto.nombre, "Romina");
  assert.equal(conflicto.fueraDeVigencia, true);
  assert.deepEqual(referencia, { personaId: "P", nombre: "Romina" });
});

test("sin asignar se calcula por período y no duplica una identidad asignada", () => {
  const personalPeriodo = [romina, { id: "Q", nombre: "Ana", categoria: "enfermero" }];
  const distribucion = { REA1: crearReferenciaPersona(romina), REA2: "" };
  assert.deepEqual(ids(obtenerPersonasSinAsignarPlanillaSemanal({ personalPeriodo, distribucion })), ["Q"]);
  assert.deepEqual(ids(obtenerPersonasSinAsignarPlanillaSemanal({ personalPeriodo: [], distribucion })), []);
});

test("21 mensuales no arrastran una identidad fuera de la cohorte semanal 20/20", () => {
  const efectivos = Array.from({ length: 20 }, (_, indice) => ({
    id: `E${indice + 1}`,
    nombre: `Enfermero ${indice + 1}`,
    categoria: "enfermero"
  }));
  const fueraDeSemana = { id: "P", nombre: "Cambio de turno", categoria: "enfermero" };
  const personalMensual = [...efectivos, fueraDeSemana];
  const distribucionCompleta = Object.fromEntries(
    efectivos.map((persona, indice) => [`F${indice + 1}`, crearReferenciaPersona(persona)])
  );

  assert.equal(personalMensual.length, 21);
  assert.equal(obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo: efectivos,
    distribucion: distribucionCompleta
  }).length, 0);
  assert.deepEqual(ids(obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo: personalMensual,
    distribucion: distribucionCompleta
  })), ["P"]);
});

test("Sin asignar usa identidades del período, cuenta T6 y no confunde duplicados", () => {
  const personas = Array.from({ length: 21 }, (_, indice) => ({
    id: `E${indice + 1}`,
    nombre: `Persona ${indice + 1}`,
    categoria: "enfermero"
  }));
  const veinte = personas.slice(0, 20);
  const veinteAsignadas = Object.fromEntries(
    veinte.map((persona, indice) => [`F${indice + 1}`, crearReferenciaPersona(persona)])
  );

  assert.equal(obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo: veinte,
    distribucion: { ...veinteAsignadas, T6: "" }
  }).length, 0);
  assert.deepEqual(ids(obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo: personas,
    distribucion: { ...veinteAsignadas, T6: "" }
  })), ["E21"]);
  assert.equal(obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo: personas,
    distribucion: { ...veinteAsignadas, T6: crearReferenciaPersona(personas[20]) }
  }).length, 0);

  const conDuplicado = { ...veinteAsignadas, F20: crearReferenciaPersona(personas[0]) };
  assert.deepEqual(ids(obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo: veinte,
    distribucion: conDuplicado
  })), ["E20"]);
});

test("ID moderno explícito prevalece sobre nombre al contar asignadas", () => {
  const ana = { id: "A", nombre: "Ana", categoria: "enfermero" };
  const bea = { id: "B", nombre: "Bea", categoria: "enfermero" };
  for (const referencia of [
    { id: "A", nombre: "Bea" },
    { personaId: "A", nombre: "Bea" }
  ]) {
    assert.deepEqual(ids(obtenerPersonasSinAsignarPlanillaSemanal({
      personalPeriodo: [ana, bea],
      distribucion: { REA1: referencia }
    })), ["B"]);
  }
});

test("licencia completa excluye y licencia parcial conserva la persona planificable", () => {
  const periodo = semana("2026-09-08", "2026-09-14");
  assert.deepEqual(ids(planificables({
    periodo,
    licencias: [{ personaId: "P", desde: "2026-09-08", hasta: "2026-09-14" }]
  })), []);
  assert.deepEqual(ids(planificables({
    periodo,
    licencias: [{ personaId: "P", desde: "2026-09-10", hasta: "2026-09-30" }]
  })), ["P"]);
  assert.deepEqual(ids(planificables({
    periodo,
    licencias: [{ personaId: "P", desde: "2026-09-01", hasta: "2026-09-11" }]
  })), ["P"]);
});

test("vigencia parcial y licencia requieren un mismo día efectivo y disponible", () => {
  const frontera = semana("2026-09-15", "2026-09-21");
  assert.deepEqual(ids(planificables({
    periodo: frontera,
    licencias: [{ personaId: "P", desde: "2026-09-15", hasta: "2026-09-19" }]
  })), []);
  assert.deepEqual(ids(planificables({
    periodo: frontera,
    licencias: [{ personaId: "P", desde: "2026-09-15", hasta: "2026-09-18" }]
  })), ["P"]);
});

test("21 mensuales con una licencia completa producen 20 planificables y cero faltantes", () => {
  const personas = Array.from({ length: 21 }, (_, indice) => ({
    id: `L${indice + 1}`,
    nombre: `Persona ${indice + 1}`,
    categoria: "enfermero"
  }));
  const estadosGrandes = {
    manana: { personal: personas }, tarde: { personal: [] },
    noche: { personal: [] }, vespertino: { personal: [] }
  };
  const padronGrande = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: estadosGrandes,
    configuracionesExplicitas: []
  });
  const periodo = semana("2026-09-07", "2026-09-13");
  const personalPeriodo = planificables({
    padronActual: padronGrande,
    periodo,
    personalFisico: personas,
    licencias: [{ personaId: "L21", desde: "2026-09-07", hasta: "2026-09-30" }]
  });
  const distribucion = Object.fromEntries(
    personalPeriodo.map((persona, indice) => [`F${indice + 1}`, crearReferenciaPersona(persona)])
  );
  assert.equal(personas.length, 21);
  assert.equal(personalPeriodo.length, 20);
  assert.equal(obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo,
    distribucion
  }).length, 0);
  assert.equal(obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo,
    distribucion: { ...distribucion, F20: crearReferenciaPersona(personalPeriodo[0]) }
  }).length, 1);
});

test("pico planificable se calcula por período y no por las 23 identidades mensuales", () => {
  const personas = Array.from({ length: 23 }, (_, indice) => ({
    id: `M${indice + 1}`,
    nombre: `Mensual ${indice + 1}`,
    categoria: "enfermero"
  }));
  const padronGrande = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: {
      manana: { personal: personas }, tarde: { personal: [] },
      noche: { personal: [] }, vespertino: { personal: [] }
    },
    configuracionesExplicitas: []
  });
  const periodos = [
    semana("2026-09-01", "2026-09-06", "semana1"),
    semana("2026-09-07", "2026-09-13", "semana2")
  ];
  const licencias = [
    { personaId: "M21", desde: "2026-09-01", hasta: "2026-09-30" },
    { personaId: "M22", desde: "2026-09-01", hasta: "2026-09-30" },
    { personaId: "M23", desde: "2026-09-01", hasta: "2026-09-30" }
  ];
  const cantidades = periodos.map((periodo) => planificables({
    padronActual: padronGrande,
    periodo,
    personalFisico: personas,
    licencias
  }).length);
  assert.deepEqual(cantidades, [20, 20]);
  assert.equal(Math.max(...cantidades), 20);
});

test("Noche y Licenciados usan la misma disponibilidad ANY DAY del período", () => {
  const padronNoche = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: estados,
    configuracionesExplicitas: [
      config("P", [v("P", "noche", "2026-09-20", "2026-09-30")]),
      config("L", [v("L", "tarde", "2026-09-15", "2026-09-21")])
    ]
  });
  const bloque = {
    clave: "bloque-20",
    fechaInicio: "2026-09-20",
    fechaFin: "2026-09-22"
  };
  assert.deepEqual(ids(planificables({
    padronActual: padronNoche,
    turno: "noche",
    periodo: bloque,
    personalFisico: [],
    licencias: [{ personaId: "P", desde: "2026-09-20", hasta: "2026-09-22" }]
  })), []);
  assert.deepEqual(ids(planificables({
    padronActual: padronNoche,
    turno: "noche",
    periodo: bloque,
    personalFisico: [],
    licencias: [{ personaId: "P", desde: "2026-09-20", hasta: "2026-09-21" }]
  })), ["P"]);
  assert.deepEqual(ids(planificables({
    padronActual: padronNoche,
    turno: "tarde",
    periodo: semana("2026-09-15", "2026-09-21"),
    personalFisico: [],
    categoria: "licenciado",
    licencias: [{ personaId: "L", desde: "2026-09-15", hasta: "2026-09-21" }]
  })), []);
});

test("categorías y homónimos permanecen separados por ID", () => {
  assert.deepEqual(ids(cohorte("tarde", semana("2026-09-15", "2026-09-21"), "enfermero")), ["P"]);
  assert.deepEqual(ids(cohorte("tarde", semana("2026-09-15", "2026-09-21"), "licenciado")), ["L"]);
  const a = { id: "A", nombre: "Romina", categoria: "enfermero" };
  assert.equal(resolverReferenciaPlanillaSemanal({ referencia: { personaId: "A", nombre: "Romina" }, personalPeriodo: [romina, a] }).persona.id, "A");
});

test("render y resolución no mutan padrón, período, Personal ni Planilla", () => {
  const periodo = semana("2026-09-22", "2026-09-28");
  const planilla = { semana4: { REA1: crearReferenciaPersona(romina) } };
  const copia = structuredClone({ padron, periodo, personal: [romina], planilla });
  const personalPeriodo = cohorte("tarde", periodo);
  resolverReferenciaPlanillaSemanal({ referencia: planilla.semana4.REA1, personalPeriodo });
  obtenerPersonasSinAsignarPlanillaSemanal({ personalPeriodo, distribucion: planilla.semana4 });
  assert.deepEqual({ padron, periodo, personal: [romina], planilla }, copia);
});

test("Calendario B5A consume la misma referencia en una fecha efectiva", () => {
  const referencia = crearReferenciaPersona(romina);
  const asignaciones = construirAsignacionesDiariasCalendario({
    filasCalendario: ["REA1"], filasConfiguracion: [],
    planillaPeriodoEfectiva: { REA1: referencia }, personal: [romina]
  });
  assert.equal(asignaciones[0].enfermero.id, "P");
  assert.deepEqual(referencia, { personaId: "P", nombre: "Romina" });
});

test("integración semanal usa cohorte por columna y preserva referencias conflictivas", () => {
  const codigo = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(codigo, /resolverPersonalPlanificablePeriodo/);
  assert.match(codigo, /obtenerCohortePeriodo\(periodo\)/);
  assert.match(codigo, /fuera de vigencia/);
  assert.match(codigo, /crearReferenciaPersona\(persona\)/);
  assert.doesNotMatch(codigo, /limpiarReferenciasDePersona|limpiarPersonaDePlanilla/);
  assert.match(app, /vistaActiva === "planilla"/);
  assert.match(app, /padronVigencias=\{vigenciasPersonal\.padron\}/);
});

test("generación semanal divergente usa cohortes y la ruta nocturna permanece", () => {
  const codigo = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  assert.match(codigo, /personalPorPeriodo/);
  assert.doesNotMatch(codigo, /cohortesSemanalesDifieren/);
  assert.match(codigo, /resolverAsignacionBaseRotacion3DiasEfectiva|prepararRotacion3DiasParaGenerar/);
});
