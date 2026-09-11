import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearAdhesionParoPersonal,
  excluirNoDisponiblesPorNovedadesDeAsignaciones
} from "../src/utils/novedadesPersonal.js";
import { resolverDistribucionDiaria } from "../src/utils/resolverDistribucionDiaria.js";
import { resolverDatosPresentacionCierreTurno } from "../src/utils/cierreTurno.js";

const calendario = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
const sectores = fs.readFileSync(
  new URL("../src/data/sectores.js", import.meta.url),
  "utf8"
);

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const titular = { id: "titular", nombre: "Titular", categoria: "enfermero" };
const disponible = { id: "disponible", nombre: "Disponible", categoria: "enfermero" };
const fecha = "2026-09-10";
const turno = "manana";
const base = [
  { nombre: "REA 1", sectorId: "rea_1", tipo: "sector", enfermero: titular },
  { nombre: "REA 2", sectorId: "rea_2", tipo: "sector", enfermero: disponible }
];
const adhesion = crearAdhesionParoPersonal({
  persona: titular,
  fecha,
  turno
}).novedad;

probar("la adhesión sólo excluye a la persona de la asignación efectiva", () => {
  const efectivas = excluirNoDisponiblesPorNovedadesDeAsignaciones({
    asignaciones: base,
    novedades: [adhesion],
    fecha,
    turno
  });
  assert.equal(efectivas[0].enfermero, null);
  assert.equal(efectivas[1].enfermero.id, "disponible");
  assert.equal(base[0].enfermero.id, "titular");
});

probar("un día con adhesión continúa por el motor común", () => {
  const efectivas = excluirNoDisponiblesPorNovedadesDeAsignaciones({
    asignaciones: base,
    novedades: [adhesion],
    fecha,
    turno
  });
  const resultado = resolverDistribucionDiaria({
    asignacionBase: efectivas,
    personalEfectivo: [titular, disponible],
    extras: [],
    esPersonaDisponible: (persona) => persona.id !== titular.id,
    esPersonaDisponibleParaCobertura: (persona) => persona.id !== titular.id,
    prioridadSectorIds: ["rea_1", "rea_2"]
  });
  assert.equal(resultado.asignaciones.some((fila) => fila.enfermero?.id === titular.id), false);
  assert.equal(resultado.asignaciones.some((fila) => fila.nombre === "1 al 3 + 19 al 22"), false);
});

probar("Calendario no selecciona algoritmos mediante esDiaParo", () => {
  assert.doesNotMatch(calendario, /\besDiaParo\b/);
  assert.doesNotMatch(calendario, /\b(asignacionParo|reservasParo|usadosParo)\b/);
  assert.doesNotMatch(calendario, /candidatosSet/);
});

probar("Calendario no consume sectores ni prioridades especiales de Paro", () => {
  assert.doesNotMatch(calendario, /\bsectoresParo\b/);
  assert.doesNotMatch(calendario, /\bprioridadesParo\b/);
  assert.match(sectores, /sectoresParo:/);
  assert.match(sectores, /prioridadesParo:/);
});

probar("cambiosParoDia queda como dato legacy pasivo y no gobierna días actuales", () => {
  assert.doesNotMatch(calendario, /\bcambiosParoDia\b/);
  assert.match(calendario, /const cambiosActivos = cambiosDia/);
  assert.match(calendario, /const claveCambiosActivos = "cambiosDia"/);
});

probar("sin selección explícita el modo de redistribución es común", () => {
  assert.match(calendario, /modoRedistribucion: distribucionOpcion1Activa[\s\S]*: null/);
  assert.match(calendario, /const cambiosFechaActual = cambiosDia\[keyDia\] \|\| \{\}/);
});

probar("opción 1 sólo se activa desde el estado explícito de cambiosDia", () => {
  assert.match(calendario, /esDistribucionOpcion1\(cambiosFechaActual\)/);
  assert.match(calendario, /onClick=\{\(\) => abrirRedistribucion\("critica"\)\}/);
});

probar("opción 2 sólo se activa desde el estado explícito de cambiosDia", () => {
  assert.match(calendario, /esDistribucionPorBoxes\(cambiosFechaActual\)/);
  assert.match(calendario, /onClick=\{\(\) => abrirRedistribucion\("boxes"\)\}/);
});

probar("los destinos visibles y SIN ASIGNAR usan la composición común", () => {
  assert.match(calendario, /obtenerFilasRedistribucion\(ordenVisualEfectivo\)/);
  assert.match(calendario, /incorporarPersonasSinAsignar\(\{/);
  assert.doesNotMatch(calendario, /nombre: "SIN ASIGNAR"[\s\S]*usadosParo/);
});

probar("los snapshots cerrados siguen dominando la reconstrucción viva", () => {
  const snapshot = {
    versionSnapshot: 2,
    asignaciones: [{ sector: "Histórico", persona: { personaId: titular.id, nombre: titular.nombre } }]
  };
  const reconstruccion = { asignaciones: [{ nombre: "Actual", enfermero: disponible }] };
  const resultado = resolverDatosPresentacionCierreTurno({ snapshot, reconstruccion });
  assert.equal(resultado.asignaciones[0].nombre, "Histórico");
  assert.equal(resultado.asignaciones.some((fila) => fila.nombre === "Actual"), false);
});

probar("los botones de ambas redistribuciones siguen disponibles para Enfermeros", () => {
  assert.match(calendario, /tipo === "enfermero" && !tipoRedistribucionActiva/);
  assert.match(calendario, /Redistribución opción 1/);
  assert.match(calendario, /Redistribución opción 2/);
});

probar("la ruta común conserva prioridad, parejas, Turnantes y Extras", () => {
  assert.match(calendario, /resolverDistribucionDiaria\(\{/);
  assert.match(calendario, /prioridadSectorIds: prioridadCoberturaEfectivaIds/);
  assert.match(calendario, /reglasParejas:/);
  assert.match(calendario, /extras: extrasDia/);
});

console.log(`\n${total} comprobaciones del retiro de Distribución de Paro legacy aprobadas.`);
