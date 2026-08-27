import assert from "node:assert/strict";
import test from "node:test";
import { analizarDependenciasMovimientoPadronBase } from "../src/utils/dependenciasMovimientoPadronBase.js";
import { asegurarIdPersona } from "../src/utils/identidadPersonas.js";

const persona = (id, nombre, categoria = "enfermero") => ({ id, nombre, categoria });
const ref = (personaId, nombre = "") => ({ personaId, nombre });
const estadoBase = (personal = [persona("p-1", "Ana")]) => ({
  personal,
  planillas: {
    enfermeros: { semana1: {}, coberturaLibreSM: {}, rotacion3Dias: { asignacionBase: {}, bloques: {}, coberturaLibreSM: {} } },
    licenciados: { semana1: {}, coberturaLibreSM: {} }
  },
  calendario: {
    enfermeros: { cambiosDia: {}, cambiosParoDia: {}, extras: {}, noDisponibles: {}, asistenciaDia: {} },
    licenciados: { cambiosDia: {}, cambiosParoDia: {}, extras: {}, noDisponibles: {}, asistenciaDia: {} }
  },
  configuracionPlanilla: {},
  licencias: [],
  certificaciones: []
});
const analizar = (estado, opciones = {}) => analizarDependenciasMovimientoPadronBase({
  estadoOrigen: estado,
  personaId: "p-1",
  categoria: "enfermero",
  turnoOrigen: "manana",
  turnoDestino: "tarde",
  mes: "2026-09",
  ...opciones
});
const codigos = (resultado) => resultado.bloqueos.map(({ codigo }) => codigo);

test("persona sin referencias no tiene bloqueos", () => {
  const resultado = analizar(estadoBase());
  assert.equal(resultado.ok, true);
  assert.equal(resultado.tieneBloqueos, false);
});

test("semanas y asignaciones parciales modernas son informativas sólo por ID", () => {
  const estado = estadoBase([persona("p-1", "Ana"), persona("p-2", "Ana")]);
  estado.planillas.enfermeros.semana1 = { REA1: ref("p-2", "Ana") };
  estado.planillas.enfermeros.semana3 = { REA1: ref("p-1", "Otro nombre") };
  estado.planillas.enfermeros.asignacionesParciales = {
    semana3: [{ personaId: "p-1", desde: "2026-09-10", hasta: "2026-09-12" }]
  };
  const resultado = analizar(estado);
  assert.equal(resultado.tieneBloqueos, false);
  assert.deepEqual(resultado.informativas.map(({ codigo }) => codigo), [
    "PLANILLA_REFERENCIA_PERSONA"
  ]);
  assert.equal(resultado.informativas[0].rutas.length, 2);
  assert.ok(resultado.informativas[0].rutas.some((ruta) => ruta.includes("semana3")));
});

test("rotación nocturna moderna y cobertura/fijas son informativas", () => {
  const estado = estadoBase();
  estado.planillas.enfermeros.rotacion3Dias = {
    asignacionBase: { T1: ref("p-1") },
    bloques: { "2026-09-10": { T2: ref("p-1") } },
    coberturaLibreSM: { "2026-09-10": ref("p-1") }
  };
  estado.planillas.enfermeros.coberturaLibreSM = { semana2: ref("p-1") };
  estado.configuracionPlanilla.enfermero = {
    asignacionesFijas: [{ sectorId: "rea-1", personaId: "p-1" }]
  };
  const resultado = analizar(estado);
  assert.equal(resultado.tieneBloqueos, false);
  assert.equal(codigos(resultado).length, 0);
  assert.equal(resultado.informativas[0].codigo, "PLANILLA_REFERENCIA_PERSONA");
  assert.equal(resultado.informativas[0].rutas.length, 5);
});

test("calendario operativo bloquea cambios, no disponibles y asistencia", () => {
  const estado = estadoBase();
  estado.calendario.enfermeros.cambiosDia = { "2026-09-10": { REA1: ref("p-1") } };
  estado.calendario.enfermeros.cambiosParoDia = { "2026-09-11": { T1: ref("p-1") } };
  estado.calendario.enfermeros.noDisponibles = {
    "2026-09-12": [ref("p-1")],
    "2026-09-13": [{ personaId: "p-2", personaCoberturaId: "p-1" }]
  };
  estado.calendario.enfermeros.asistenciaDia = { "2026-09-14": { "id:p-1": "presente" } };
  const resultado = analizar(estado);
  assert.deepEqual(codigos(resultado), ["REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES"]);
  assert.equal(resultado.bloqueos[0].rutas.length, 5);
});

test("licencias y certificaciones son informativas por lectura transversal", () => {
  const estado = estadoBase();
  estado.licencias = [{ personaId: "p-1", desde: "2026-09-01", hasta: "2026-09-05" }];
  estado.certificaciones = [{ personaId: "p-1", desde: "2026-09-10", hasta: "2026-09-11" }];
  const resultado = analizar(estado);
  assert.equal(resultado.tieneBloqueos, false);
  assert.deepEqual(resultado.informativas.map(({ codigo }) => codigo), [
    "LICENCIA_REFERENCIA_PERSONA",
    "CERTIFICACION_REFERENCIA_PERSONA"
  ]);
});

test("Extras son informativos y no bloquean", () => {
  const estado = estadoBase();
  estado.calendario.enfermeros.extras = {
    "2026-09-20": [{ id: "p-1", personaId: "p-1", origenExtra: "personal_otro_turno" }]
  };
  const resultado = analizar(estado);
  assert.equal(resultado.tieneBloqueos, false);
  assert.equal(resultado.informativas[0].codigo, "EXTRA_RELACIONADO_PERSONA");
});

test("licenciado y turnos diurnos usan sus estructuras de categoría", () => {
  const lic = persona("l-1", "Luis", "licenciado");
  const estado = estadoBase([lic]);
  estado.planillas.licenciados.semana2 = { ADM: ref("l-1") };
  const resultado = analizar(estado, {
    personaId: "l-1",
    categoria: "licenciado",
    turnoOrigen: "tarde"
  });
  assert.equal(resultado.tieneBloqueos, false);
  assert.equal(resultado.informativas[0].categoria, "licenciado");
});

test("persona legacy con funcionario recibe la misma identidad canónica sin mutar", () => {
  const legacy = { nombre: "Sin id", funcionario: " 123 ", categoria: "enfermero" };
  const estado = estadoBase([legacy]);
  const antes = structuredClone(estado);
  const id = asegurarIdPersona(legacy).id;
  const resuelto = analizarDependenciasMovimientoPadronBase({
    estadoOrigen: estado,
    personaId: id,
    categoria: "enfermero",
    turnoOrigen: "manana",
    mes: "2026-09"
  });
  assert.equal(resuelto.ok, true);
  assert.deepEqual(estado, antes);
});

test("identidad inválida, ausente y duplicada fallan de forma estable", () => {
  assert.equal(analizar(estadoBase(), { personaId: "" }).codigo, "PERSONA_NO_IDENTIFICABLE");
  assert.equal(analizar(estadoBase(), { personaId: "p-x" }).codigo, "PERSONA_NO_ENCONTRADA_EN_PADRON_ORIGEN");
  const duplicado = estadoBase([persona("p-1", "A"), persona("p-1", "B")]);
  assert.equal(analizar(duplicado).codigo, "PERSONA_DUPLICADA_EN_PADRON_ORIGEN");
});

test("agrupa rutas sin duplicados absurdos y no muta profundamente", () => {
  const estado = estadoBase();
  estado.planillas.enfermeros.semana1 = { A: ref("p-1"), B: ref("p-1") };
  const copia = structuredClone(estado);
  const resultado = analizar(estado);
  assert.equal(resultado.bloqueos.length, 0);
  assert.deepEqual(resultado.informativas[0].rutas, [
    "Enfermeros / semana1 / A",
    "Enfermeros / semana1 / B"
  ]);
  assert.deepEqual(estado, copia);
});

test("campos de configuración sin persona, nombres homónimos y estado legacy no bloquean", () => {
  const estado = estadoBase([persona("p-1", "Ana"), persona("p-2", "Ana")]);
  estado.planillas.enfermeros.semana1 = { A: ref("p-2", "Ana") };
  estado.configuracionPlanilla.enfermero = {
    filas: [{ filaId: "A", tipo: "sector", activo: true }],
    posicionesMensualesAdicionales: ["T6"]
  };
  estado.calendario.enfermeros.cierresDia = { "2026-09-01": { total: 3 } };
  const resultado = analizar(estado);
  assert.equal(resultado.tieneBloqueos, false);
});

test("Planilla semanal resuelve string legacy y objeto legacy con funcionario", () => {
  const maria = { id: "p-1", nombre: "Maria Noel", funcionario: "123", categoria: "enfermero" };
  const otra = { id: "p-2", nombre: "Otra", funcionario: "456", categoria: "enfermero" };
  const estado = estadoBase([maria, otra]);
  estado.planillas.enfermeros.semana1 = {
    REA1: "Maria Noel",
    REA2: { nombre: "Nombre viejo", funcionario: "123" },
    REA3: { personaId: "p-2", nombre: "Maria Noel" }
  };
  const resultado = analizar(estado);
  assert.equal(resultado.bloqueos.length, 1);
  assert.equal(resultado.bloqueos[0].codigo, "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE");
  assert.equal(resultado.bloqueos[0].rutas.length, 2);
});

test("homónimo legacy ambiguo bloquea conservadoramente sin adjudicarlo", () => {
  const estado = estadoBase([
    persona("p-1", "Maria Noel"),
    persona("p-2", "Maria Noel")
  ]);
  estado.planillas.enfermeros.semana1 = { REA1: "Maria Noel" };
  const p1 = analizar(estado);
  const p2 = analizar(estado, { personaId: "p-2" });
  assert.equal(p1.bloqueos[0].codigo, "REFERENCIA_LEGACY_AMBIGUA");
  assert.equal(p2.bloqueos[0].codigo, "REFERENCIA_LEGACY_AMBIGUA");
});

test("rotación nocturna detecta referencias legacy en base y bloques", () => {
  const estado = estadoBase([{ id: "p-1", nombre: "Maria", funcionario: "123", categoria: "enfermero" }]);
  estado.planillas.enfermeros.rotacion3Dias = {
    asignacionBase: { T1: "Maria" },
    bloques: { "2026-09-10": { T2: { funcionario: "123", nombre: "Anterior" } } },
    coberturaLibreSM: {}
  };
  const resultado = analizar(estado);
  assert.equal(resultado.bloqueos[0].codigo, "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE");
  assert.equal(resultado.bloqueos[0].rutas.length, 2);
});

test("licencias y certificaciones legacy usan la resolución productiva", () => {
  const estado = estadoBase([{ id: "p-1", nombre: "Maria", funcionario: "123", categoria: "enfermero" }]);
  estado.licencias = [{ id: "lic-1", nombre: "Maria", desde: "2026-09-01", hasta: "2026-09-02" }];
  estado.certificaciones = [{ id: "cert-1", funcionario: "123", nombre: "Viejo", desde: "2026-09-03", hasta: "2026-09-04" }];
  const resultado = analizar(estado);
  assert.equal(resultado.tieneBloqueos, false);
  assert.deepEqual(resultado.informativas.map(({ codigo }) => codigo), [
    "LICENCIA_REFERENCIA_PERSONA",
    "CERTIFICACION_REFERENCIA_PERSONA"
  ]);
});

test("No disponible legacy se resuelve y Extra legacy sigue informativo", () => {
  const estado = estadoBase([{ id: "p-1", nombre: "Maria", funcionario: "123", categoria: "enfermero" }]);
  estado.calendario.enfermeros.noDisponibles = {
    "2026-09-05": ["Maria"]
  };
  estado.calendario.enfermeros.extras = {
    "2026-09-06": [{ nombre: "Anterior", funcionario: "123", temporal: false }]
  };
  const resultado = analizar(estado);
  assert.ok(codigos(resultado).includes("REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES"));
  assert.equal(resultado.informativas[0].codigo, "EXTRA_RELACIONADO_PERSONA");
});

test("IDs modernos distintos prevalecen aunque nombre y funcionario coincidan", () => {
  const estado = estadoBase([
    { id: "p-1", nombre: "Ana", funcionario: "123", categoria: "enfermero" },
    { id: "p-2", nombre: "Ana", funcionario: "123", categoria: "enfermero" }
  ]);
  estado.planillas.enfermeros.semana1 = {
    REA1: { personaId: "p-2", nombre: "Ana", funcionario: "123" }
  };
  assert.equal(analizar(estado).tieneBloqueos, false);
  assert.equal(analizar(estado, { personaId: "p-2" }).tieneBloqueos, false);
  assert.equal(analizar(estado, { personaId: "p-2" }).informativas.length, 1);
});

test("Enfermero puede involucrar Noche cuando no tiene dependencias reales", () => {
  for (const [turnoOrigen, turnoDestino] of [
    ["manana", "noche"], ["tarde", "noche"],
    ["noche", "tarde"], ["noche", "vespertino"]
  ]) {
    const resultado = analizar(estadoBase(), { turnoOrigen, turnoDestino });
    assert.equal(resultado.tieneBloqueos, false);
  }
});

test("legacy nocturno inequívoco y ambiguo siguen bloqueando", () => {
  const simple = estadoBase();
  simple.planillas.enfermeros.rotacion3Dias.asignacionBase = { T1: "Ana" };
  assert.deepEqual(codigos(analizar(simple, { turnoDestino: "noche" })), [
    "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE"
  ]);

  const ambiguo = estadoBase([persona("p-1", "Ana"), persona("p-2", "Ana")]);
  ambiguo.planillas.enfermeros.rotacion3Dias.bloques = {
    "2026-09-10": { T1: "Ana" }
  };
  assert.deepEqual(codigos(analizar(ambiguo, { turnoDestino: "noche" })), [
    "REFERENCIA_LEGACY_AMBIGUA"
  ]);
});

test("Licenciado puede involucrar Noche porque su estrategia sigue siendo semanal", () => {
  const lic = persona("l-1", "Luis", "licenciado");
  const estado = estadoBase([lic]);
  for (const [turnoOrigen, turnoDestino] of [["noche", "tarde"], ["tarde", "noche"]]) {
    const resultado = analizar(estado, {
      personaId: "l-1", categoria: "licenciado", turnoOrigen, turnoDestino
    });
    assert.equal(resultado.tieneBloqueos, false);
  }
});

test("sólo informativas mantiene tieneBloqueos false y salida determinista", () => {
  const estado = estadoBase();
  estado.planillas.enfermeros.semana1 = { T1: ref("p-1") };
  estado.planillas.enfermeros.coberturaLibreSM = { semana1: ref("p-1") };
  estado.configuracionPlanilla.enfermero = {
    asignacionesFijas: [{ sectorId: "rea-1", personaId: "p-1" }]
  };
  estado.licencias = [{ personaId: "p-1", desde: "2026-09-01", hasta: "2026-09-02" }];
  const copia = structuredClone(estado);
  const primero = analizar(estado);
  const segundo = analizar(estado);
  assert.equal(primero.tieneBloqueos, false);
  assert.deepEqual(primero, segundo);
  assert.deepEqual(estado, copia);
});
