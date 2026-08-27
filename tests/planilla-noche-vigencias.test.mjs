import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  resolverPadronVigenciasEfectivasMes,
  resolverPersonalEfectivoPorTurnoFecha
} from "../src/utils/padronVigenciasTurnoPersonal.js";
import {
  obtenerPersonasSinAsignarPlanillaSemanal,
  resolverCohortePlanillaSemanal,
  resolverReferenciaPlanillaSemanal
} from "../src/utils/planillaVigenciasSemanales.js";
import {
  filtrarDistribucionPorCohorteEfectiva,
  generarDistribucionParaIndice,
  prepararRotacion3DiasParaGenerar,
  regenerarRotacion3DiasDesdePrimerBloque
} from "../src/utils/rotacionPlanilla.js";
import { continuarRotacion3DiasEntreMeses } from "../src/utils/continuidadRotacionPlanilla.js";
import { crearReferenciaPersona, resolverPersonaDesdeReferencia } from "../src/utils/referenciasPersonas.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";
import { aplicarIntercambioPlanilla, validarIntercambioPlanilla } from "../src/utils/intercambioPlanilla.js";

const p = { id: "P", nombre: "Romina", funcionario: "100", categoria: "enfermero" };
const q = { id: "Q", nombre: "Quela", funcionario: "200", categoria: "enfermero" };
const r = { id: "R", nombre: "Raquel", funcionario: "300", categoria: "enfermero" };
const ref = crearReferenciaPersona;
const periodo = (clave, desde, hasta, indice = 0) => ({
  clave,
  indice,
  fechaInicio: desde,
  fechaFin: hasta,
  desde: new Date(`${desde}T12:00:00`),
  hasta: new Date(`${hasta}T12:00:00`)
});
const vigencia = (personaId, turno, desde, hasta) => ({
  personaId, mes: "2026-09", turno, desde, hasta
});
const configuracion = (personaId, vigencias) => ({
  personaId, mes: "2026-09", revision: "1", vigencias
});
const crearPadron = (configuracionesExplicitas = [], estadosPorTurno = null) =>
  resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: estadosPorTurno || {
      manana: { personal: [] },
      tarde: { personal: [p] },
      vespertino: { personal: [] },
      noche: { personal: [q, r] }
    },
    configuracionesExplicitas
  });
const bloque = (desde, hasta, clave = desde, indice = 0) =>
  periodo(clave, desde, hasta, indice);
const ids = (personas) => personas.map((persona) => persona.id).sort();
const cohorte = (padron, actual, personalFisico = [q, r]) =>
  resolverCohortePlanillaSemanal({
    padron,
    turno: "noche",
    periodo: actual,
    personalFisico,
    categoria: "enfermero",
    usaRotacionTresDias: true
  }).personas;

test("legacy nocturno conserva la cohorte física", () => {
  assert.deepEqual(ids(cohorte(crearPadron(), bloque("2026-09-19", "2026-09-21"))), ["Q", "R"]);
});

test("bloque productivo fechaInicio/fechaFin conserva tres Enfermeros físicos", () => {
  const padron = crearPadron([], {
    manana: { personal: [] }, tarde: { personal: [] }, vespertino: { personal: [] },
    noche: { personal: [p, q, r] }
  });
  const bloqueReal = obtenerBloquesQueIntersectanMes({
    mesActivo: "2026-09", fechaBase: "2026-07-02", duracionDias: 3
  })[0];
  assert.equal(Object.hasOwn(bloqueReal, "desde"), false);
  assert.deepEqual(ids(cohorte(padron, bloqueReal, [p, q, r])), ["P", "Q", "R"]);
});

test("mezcla físicos legacy y entrada transversal sin excluir ninguna fuente", () => {
  const padron = crearPadron([configuracion("P", [
    vigencia("P", "tarde", "2026-09-01", "2026-09-19"),
    vigencia("P", "noche", "2026-09-20", "2026-09-30")
  ])]);
  assert.deepEqual(ids(cohorte(padron, { clave: "A", indice: 1, fechaInicio: "2026-09-16", fechaFin: "2026-09-18" })), ["Q", "R"]);
  assert.deepEqual(ids(cohorte(padron, { clave: "B", indice: 2, fechaInicio: "2026-09-19", fechaFin: "2026-09-21" })), ["P", "Q", "R"]);
  assert.deepEqual(ids(cohorte(padron, { clave: "C", indice: 3, fechaInicio: "2026-09-22", fechaFin: "2026-09-24" })), ["P", "Q", "R"]);
});

test("salida explícita excluye sólo a Q y conserva a R legacy", () => {
  const padron = crearPadron([configuracion("Q", [
    vigencia("Q", "noche", "2026-09-01", "2026-09-19"),
    vigencia("Q", "tarde", "2026-09-20", "2026-09-30")
  ])]);
  assert.deepEqual(ids(cohorte(padron, { clave: "C", indice: 3, fechaInicio: "2026-09-22", fechaFin: "2026-09-24" })), ["R"]);
});

test("loading y error con bloque productivo usan fallback físico Noche", () => {
  const bloqueReal = { clave: "B", indice: 2, fechaInicio: "2026-09-19", fechaFin: "2026-09-21" };
  for (const estadoCargaVigencias of [{ cargando: true }, { error: new Error("red") }]) {
    const personas = resolverCohortePlanillaSemanal({
      padron: crearPadron(), estadoCargaVigencias, turno: "noche", periodo: bloqueReal,
      personalFisico: [q, r], categoria: "enfermero", usaRotacionTresDias: true
    }).personas;
    assert.deepEqual(ids(personas), ["Q", "R"]);
  }
});

test("padrón disponible deduplica por personaId y conserva categoría Enfermero", () => {
  const padron = crearPadron();
  const personas = cohorte(padron, { clave: "B", indice: 2, fechaInicio: "2026-09-19", fechaFin: "2026-09-21" }, [q, r]);
  assert.deepEqual(ids(personas), ["Q", "R"]);
  assert.equal(new Set(personas.map((persona) => persona.id)).size, personas.length);
  assert.ok(personas.every((persona) => persona.categoria === "enfermero"));
});

test("entrada día 20 integra el bloque frontera 19–21 y los posteriores", () => {
  const padron = crearPadron([configuracion("P", [
    vigencia("P", "tarde", "2026-09-01", "2026-09-19"),
    vigencia("P", "noche", "2026-09-20", "2026-09-30")
  ])]);
  assert.equal(ids(cohorte(padron, bloque("2026-09-16", "2026-09-18"))).includes("P"), false);
  assert.equal(ids(cohorte(padron, bloque("2026-09-19", "2026-09-21"))).includes("P"), true);
  assert.equal(ids(cohorte(padron, bloque("2026-09-22", "2026-09-24"))).includes("P"), true);
});

test("salida día 20 conserva frontera y excluye el bloque posterior", () => {
  const padron = crearPadron([configuracion("Q", [
    vigencia("Q", "noche", "2026-09-01", "2026-09-19"),
    vigencia("Q", "tarde", "2026-09-20", "2026-09-30")
  ])]);
  assert.equal(ids(cohorte(padron, bloque("2026-09-19", "2026-09-21"))).includes("Q"), true);
  assert.equal(ids(cohorte(padron, bloque("2026-09-22", "2026-09-24"))).includes("Q"), false);
});

test("gap explícito no cae al padrón físico", () => {
  const padron = crearPadron([configuracion("Q", [
    vigencia("Q", "noche", "2026-09-01", "2026-09-10"),
    vigencia("Q", "noche", "2026-09-20", "2026-09-30")
  ])]);
  assert.equal(ids(cohorte(padron, bloque("2026-09-13", "2026-09-15"))).includes("Q"), false);
  assert.equal(ids(cohorte(padron, bloque("2026-09-19", "2026-09-21"))).includes("Q"), true);
});

test("Calendario sigue siendo exacto por fecha aunque Planilla use intersección", () => {
  const padron = crearPadron([configuracion("P", [
    vigencia("P", "tarde", "2026-09-01", "2026-09-19"),
    vigencia("P", "noche", "2026-09-20", "2026-09-30")
  ])]);
  assert.equal(ids(cohorte(padron, bloque("2026-09-19", "2026-09-21"))).includes("P"), true);
  assert.equal(resolverPersonalEfectivoPorTurnoFecha({ padron, turno: "noche", fecha: "2026-09-19" }).personas.some((x) => x.id === "P"), false);
  assert.equal(resolverPersonalEfectivoPorTurnoFecha({ padron, turno: "noche", fecha: "2026-09-20" }).personas.some((x) => x.id === "P"), true);
});

test("referencia moderna se conserva en render y se marca fuera de vigencia", () => {
  const referencia = ref(p);
  const estado = resolverReferenciaPlanillaSemanal({ referencia, personalPeriodo: [q, r] });
  assert.equal(estado.persona, null);
  assert.equal(estado.fueraDeVigencia, true);
  assert.deepEqual(referencia, ref(p));
});

test("generación explícita deja vacantes fuera de cohorte sin mutar la base", () => {
  const base = { A: ref(p), B: ref(q), T1: ref(r) };
  const copia = structuredClone(base);
  const filtrada = filtrarDistribucionPorCohorteEfectiva({
    distribucion: base, personalCanonico: [p, q, r], personalPeriodo: [q, r]
  });
  assert.equal(filtrada.A, "");
  assert.equal(filtrada.B.personaId, "Q");
  assert.deepEqual(base, copia);
});

test("nuevo entrante ausente de asignaciónBase queda Sin asignar", () => {
  const sinAsignar = obtenerPersonasSinAsignarPlanillaSemanal({
    personalPeriodo: [p, q], distribucion: { A: ref(q), B: "" }
  });
  assert.deepEqual(ids(sinAsignar), ["P"]);
});

test("candidatos y coberturaLibreSM usan la cohorte del bloque", () => {
  const referencia = ref(p);
  assert.equal(resolverReferenciaPlanillaSemanal({ referencia, personalPeriodo: [p, q] }).persona.id, "P");
  assert.equal(resolverReferenciaPlanillaSemanal({ referencia, personalPeriodo: [q] }).fueraDeVigencia, true);
});

test("swap nocturno admite efectivos y rechaza una referencia fuera de cohorte", () => {
  const planilla = { rotacion3Dias: { asignacionBase: {}, bloques: { X: { A: ref(p), B: ref(q) } } } };
  const valido = validarIntercambioPlanilla({ planilla, periodoClave: "X", filaOrigen: "A", filaDestino: "B", filas: ["A", "B"], personal: [p, q], categoria: "enfermero", usaRotacionTresDias: true });
  assert.equal(valido.ok, true);
  assert.equal(aplicarIntercambioPlanilla({ planilla, periodoClave: "X", filaOrigen: "A", filaDestino: "B", filas: ["A", "B"], personal: [p, q], categoria: "enfermero", usaRotacionTresDias: true }).planilla.rotacion3Dias.bloques.X.A.personaId, "Q");
  assert.equal(validarIntercambioPlanilla({ planilla, periodoClave: "X", filaOrigen: "A", filaDestino: "B", filas: ["A", "B"], personal: [q], categoria: "enfermero", usaRotacionTresDias: true }).ok, false);
});

test("asignación base permanece canónica y usa el índice absoluto", () => {
  const base = { A: ref(p), B: ref(q), T1: ref(r) };
  const rotada = generarDistribucionParaIndice({ distribucionBase: base, filas: ["A", "B", "T1"], indice: 7 });
  assert.deepEqual(base.A, ref(p));
  assert.equal(new Set(Object.values(rotada).map((x) => x.personaId)).size, 3);
});

test("motor filtra cada bloque pero conserva asignacionBase, fechaBase y sectores", () => {
  const periodos = [bloque("2026-09-19", "2026-09-21", "X", 1), bloque("2026-09-22", "2026-09-24", "Y", 2)];
  const base = { A: ref(p), B: ref(q), T1: ref(r) };
  const resultado = prepararRotacion3DiasParaGenerar({
    rotacion3Dias: { fechaBase: "2026-07-02", duracionDias: 3, asignacionBase: base, bloques: {} },
    periodos, filas: ["A", "B", "T1"], personal: [p, q, r], personalCanonico: [p, q, r],
    personalPorPeriodo: { X: [p, q, r], Y: [q, r] }, categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.rotacion3Dias.asignacionBase, base);
  assert.equal(resultado.rotacion3Dias.fechaBase, "2026-07-02");
  assert.equal(Object.values(resultado.rotacion3Dias.bloques.Y).some((x) => x?.personaId === "P"), false);
  assert.deepEqual(Object.keys(resultado.rotacion3Dias.bloques.Y), ["A", "B", "T1"]);
});

test("generación normal con bloques productivos y padrón físico no vacía sectores", () => {
  const padron = crearPadron();
  const periodos = obtenerBloquesQueIntersectanMes({
    mesActivo: "2026-09", fechaBase: "2026-07-02", duracionDias: 3
  }).slice(0, 2);
  const personalPorPeriodo = Object.fromEntries(
    periodos.map((actual) => [actual.clave, cohorte(padron, actual)])
  );
  const resultado = prepararRotacion3DiasParaGenerar({
    rotacion3Dias: { fechaBase: "2026-07-02", duracionDias: 3, asignacionBase: { A: ref(q), B: ref(r) }, bloques: {} },
    periodos, filas: ["A", "B"], personal: [q, r], personalCanonico: [q, r],
    personalPorPeriodo, categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  periodos.forEach((actual) => {
    assert.equal(Object.values(resultado.rotacion3Dias.bloques[actual.clave]).filter((referencia) => referencia?.personaId).length, 2);
  });
});

test("fija se materializa sólo en bloques efectivos y no se borra de configuración", () => {
  const periodos = [bloque("2026-09-19", "2026-09-21", "X", 1), bloque("2026-09-22", "2026-09-24", "Y", 2)];
  const fija = [{ sectorId: "a", personaId: "P" }];
  const filasConfiguracion = [{ tipo: "sector", sectorId: "a", etiqueta: "A", activo: true, orden: 1 }, { tipo: "sector", sectorId: "b", etiqueta: "B", activo: true, orden: 2 }];
  const resultado = prepararRotacion3DiasParaGenerar({
    rotacion3Dias: { asignacionBase: { A: ref(q), B: ref(p) }, bloques: {} }, periodos,
    filas: ["A", "B"], filasFijas: ["A"], filasConfiguracion, asignacionesFijas: fija,
    personal: [p, q, r], personalCanonico: [p, q, r], personalPorPeriodo: { X: [p, q, r], Y: [q, r] }, categoria: "enfermero"
  });
  assert.equal(resultado.rotacion3Dias.bloques.X.A.personaId, "P");
  assert.equal(resultado.rotacion3Dias.bloques.Y.A, "");
  assert.deepEqual(fija, [{ sectorId: "a", personaId: "P" }]);
});

test("regeneración selecciona el primer bloque resoluble y no el primer stale", () => {
  const periodos = [bloque("2026-09-01", "2026-09-03", "S", 20), bloque("2026-09-04", "2026-09-06", "V", 21)];
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: { asignacionBase: {}, bloques: { S: { A: { personaId: "stale", nombre: "Viejo" } }, V: { A: ref(q) } } },
    periodos, filas: ["A"], personal: [q], personalCanonico: [q], personalPorPeriodo: { S: [q], V: [q] }, categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.bloqueReferencia.periodo.clave, "V");
});

test("legacy inequívoco resuelve y homónimo ambiguo no se adjudica", () => {
  assert.equal(resolverPersonaDesdeReferencia("Quela", [q]).id, "Q");
  assert.equal(resolverPersonaDesdeReferencia("Quela", [q, { ...r, id: "Q2", nombre: "Quela" }]), null);
});

test("bloque que cruza mes recorta la pertenencia a septiembre", () => {
  const padron = crearPadron([configuracion("P", [vigencia("P", "noche", "2026-09-01", "2026-09-01")])]);
  assert.equal(ids(cohorte(padron, bloque("2026-08-31", "2026-09-02"))).includes("P"), true);
  assert.equal(obtenerBloquesQueIntersectanMes({ mesActivo: "2026-09", fechaBase: "2026-07-02", duracionDias: 3 })[0].fechaInicio <= "2026-09-01", true);
});

test("continuidad intermensual conserva base, índice y filtra sólo bloques nuevos", () => {
  const periodosDestino = [bloque("2026-09-01", "2026-09-03", "X", 20)];
  const base = { A: ref(p), B: ref(q) };
  const resultado = continuarRotacion3DiasEntreMeses({
    rotacionAnterior: { asignacionBase: base, bloques: {}, coberturaLibreSM: {} },
    rotacionActual: {}, periodosDestino, filas: ["A", "B"],
    personalCanonico: [p, q], personalPorPeriodo: { X: [q] },
    estrategia: { fechaBase: "2026-07-02", duracionDias: 3 }
  });
  assert.deepEqual(resultado.asignacionBase, base);
  assert.equal(Object.values(resultado.bloques.X).some((x) => x?.personaId === "P"), false);
  assert.equal(resultado.fechaBase, "2026-07-02");
});

test("integración no copia Personal, no toca Calendario y habilita movimiento en la app", () => {
  const planilla = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const detector = fs.readFileSync("src/utils/dependenciasMovimientoPadronBase.js", "utf8");
  const sql = fs.readFileSync("supabase/migrations/20260826183000_habilitar_movimiento_enfermeros_noche.sql", "utf8");
  assert.match(planilla, /obtenerCohortePeriodo\(periodo\)/);
  assert.doesNotMatch(planilla, /personal\s*:\s*\[\.\.\.personal/);
  assert.match(calendario, /function CalendarioDiario/);
  assert.doesNotMatch(detector, /MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO/);
  assert.doesNotMatch(sql, /MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO/);
});
