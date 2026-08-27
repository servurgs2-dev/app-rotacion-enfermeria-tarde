import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  resolverPadronVigenciasEfectivasMes,
  resolverPersonalEfectivoPorTurnoFecha
} from "../src/utils/padronVigenciasTurnoPersonal.js";

const persona = (id, nombre, categoria = "enfermero") => ({ id, nombre, categoria });
const estado = (personal = [], otros = {}) => ({ personal, ...otros });
const romina = persona("P", "Romina");
const estados = {
  manana: estado([romina]),
  tarde: estado([]),
  vespertino: estado([]),
  noche: estado([])
};
const configRomina = {
  personaId: "P",
  mes: "2026-09",
  revision: "2",
  vigencias: [
    { personaId: "P", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-19" },
    { personaId: "P", mes: "2026-09", turno: "tarde", desde: "2026-09-20", hasta: "2026-09-30" }
  ]
};
const construir = (configuracionesExplicitas = []) => resolverPadronVigenciasEfectivasMes({
  mes: "2026-09",
  estadosPorTurno: estados,
  configuracionesExplicitas
});
const resolver = ({ padron, turno, fecha, personalFisico = [] }) =>
  resolverPersonalEfectivoPorTurnoFecha({ padron, turno, fecha, personalFisico });
const ids = (resultado) => resultado.personas.map(({ id }) => id);

test("legacy sin explícita pertenece al turno base todo el mes", () => {
  const padron = construir();
  assert.deepEqual(ids(resolver({ padron, turno: "manana", fecha: "2026-09-01", personalFisico: [romina] })), ["P"]);
  assert.deepEqual(ids(resolver({ padron, turno: "manana", fecha: "2026-09-30", personalFisico: [romina] })), ["P"]);
  assert.deepEqual(ids(resolver({ padron, turno: "tarde", fecha: "2026-09-30" })), []);
});

test("Romina 15/09 sólo Mañana y 25/09 sólo Tarde con el mismo ID", () => {
  const padron = construir([configRomina]);
  assert.deepEqual(ids(resolver({ padron, turno: "manana", fecha: "2026-09-15", personalFisico: [romina] })), ["P"]);
  assert.deepEqual(ids(resolver({ padron, turno: "tarde", fecha: "2026-09-15" })), []);
  assert.deepEqual(ids(resolver({ padron, turno: "manana", fecha: "2026-09-25", personalFisico: [romina] })), []);
  assert.deepEqual(ids(resolver({ padron, turno: "tarde", fecha: "2026-09-25" })), ["P"]);
});

test("gap explícito no cae al padrón Mañana", () => {
  const padron = construir([{
    ...configRomina,
    vigencias: [
      { personaId: "P", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-10" },
      { personaId: "P", mes: "2026-09", turno: "tarde", desde: "2026-09-20", hasta: "2026-09-30" }
    ]
  }]);
  for (const turno of ["manana", "tarde", "vespertino", "noche"]) {
    assert.deepEqual(ids(resolver({ padron, turno, fecha: "2026-09-15", personalFisico: turno === "manana" ? [romina] : [] })), []);
  }
});

test("persona física Mañana aparece como personal normal en Tarde sin duplicarse", () => {
  const resultado = resolver({ padron: construir([configRomina]), turno: "tarde", fecha: "2026-09-25" });
  assert.equal(resultado.personas.length, 1);
  assert.deepEqual(resultado.personas[0], romina);
  assert.equal(resultado.personas[0].temporal, undefined);
  assert.equal(resultado.personas[0].origenExtra, undefined);
});

test("varias personas, categorías y homónimos se mantienen separados", () => {
  const juanEnf = persona("E1", "Juan", "enfermero");
  const juanLic = persona("L1", "Juan", "licenciado");
  const padron = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: {
      manana: estado([juanEnf, juanLic]), tarde: estado([]), noche: estado([]), vespertino: estado([])
    },
    configuracionesExplicitas: []
  });
  const resultado = resolver({ padron, turno: "manana", fecha: "2026-09-12", personalFisico: [juanEnf, juanLic] });
  assert.deepEqual(new Set(ids(resultado)), new Set(["E1", "L1"]));
});

test("fecha fuera del mes se rechaza sin inventar fallback", () => {
  const resultado = resolver({ padron: construir([configRomina]), turno: "manana", fecha: "2026-10-01", personalFisico: [romina] });
  assert.equal(resultado.ok, false);
  assert.deepEqual(resultado.personas, []);
});

test("vigencia corrupta conserva conservadoramente la identidad física", () => {
  const padron = construir([{ ...configRomina, vigencias: [{ ...configRomina.vigencias[0], hasta: "2026-09-31" }] }]);
  const resultado = resolver({ padron, turno: "manana", fecha: "2026-09-15", personalFisico: [romina] });
  assert.equal(resultado.ok, false);
  assert.deepEqual(ids(resultado), ["P"]);
});

test("loading/error sin padrón preserva Personal físico", () => {
  const resultado = resolver({ padron: null, turno: "manana", fecha: "2026-09-15", personalFisico: [romina] });
  assert.equal(resultado.origen, "legacy_sin_padron");
  assert.deepEqual(ids(resultado), ["P"]);
});

test("resolución no muta padrón ni Personal", () => {
  const padron = construir([configRomina]);
  const fisico = [romina];
  const copiaPadron = structuredClone(padron);
  const copiaFisico = structuredClone(fisico);
  resolver({ padron, turno: "tarde", fecha: "2026-09-25", personalFisico: fisico });
  assert.deepEqual(padron, copiaPadron);
  assert.deepEqual(fisico, copiaFisico);
});

test("Calendario integra cohorte efectiva sin modificar Planilla ni Extras", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(app, /resolverPersonalEfectivoPorTurnoFecha/);
  assert.match(app, /personal=\{personalCalendario\}/);
  assert.match(app, /vistaActiva === "calendario"/);
  assert.match(app, /estadoCargaVigencias=/);
  assert.match(calendario, /sin asumir que no existen vigencias/);
  assert.match(calendario, /personalDisponibleParaOverrides: \[\.\.\.personalFiltrado, \.\.\.extrasDia\]/);
  assert.doesNotMatch(app, /planillaEnfermeros\s*=\s*resolverPersonalEfectivo/);
  assert.doesNotMatch(app, /setPlanilla.*personalCalendario/);
  assert.doesNotMatch(app, /temporal.*personalCalendario/);
});

test("lectura transversal de ausencias está separada de escrituras locales", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(app, /licenciasLectura=\{licenciasCalendarioLectura\}/);
  assert.match(app, /certificacionesLectura=\{certificacionesCalendarioLectura\}/);
  assert.match(calendario, /estaDeLicencia\(licenciasLectura/);
  assert.match(calendario, /estaCertificado\(certificacionesLectura/);
  assert.match(calendario, /setCertificaciones\(\(actuales\)/);
});
