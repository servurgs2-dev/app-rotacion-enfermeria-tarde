import assert from "node:assert/strict";
import {
  excluirCoberturasExtrasYaRepresentadas,
  obtenerCoberturasExtrasPresentacion
} from "../src/utils/extrasPersonas.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import {
  redistribuirCritica,
  redistribuirPorBoxes
} from "../src/utils/redistribucionEnfermeros.js";
import { resolverOrganizacionMesPorFecha } from "../src/utils/preparacionesMes.js";

const persona = (id, nombre = id) => ({ id, nombre, categoria: "enfermero" });
const jhoana = persona("jhoana", "Jhoana Diaz");
const otra = persona("otra", "Otra persona");
const extra = {
  id: "extra-daniela",
  nombre: "Daniela Rey",
  categoria: "enfermero",
  tipoExtra: "cobertura",
  personaCubiertaId: jhoana.id,
  personaCubiertaNombre: jhoana.nombre,
  sectorCubiertoNombre: "8–13"
};

const coberturas = obtenerCoberturasExtrasPresentacion([extra], [jhoana, otra]);
const cambioVinculado = {
  persona: jhoana,
  registro: { personaId: jhoana.id, personaCoberturaId: extra.id }
};
assert.equal(coberturas.length, 1);
assert.deepEqual(excluirCoberturasExtrasYaRepresentadas(coberturas, [cambioVinculado]), []);
assert.equal(
  excluirCoberturasExtrasYaRepresentadas(coberturas, [{
    persona: otra,
    registro: { personaId: otra.id, personaCoberturaId: extra.id }
  }]).length,
  1,
  "no deduplica por nombre, persona ni Extra aislados: exige la relación completa"
);

const a = persona("a");
const b = persona("b");
const c = persona("c");
const filas = [
  { tipo: "sector", sectorId: "rea_1", etiqueta: "REA 1" },
  { tipo: "sector", sectorId: "rea_2", etiqueta: "REA 2" },
  { tipo: "sector", sectorId: "sillon_1", etiqueta: "SILLÓN 1" },
  { tipo: "sector", sectorId: "sillon_2", etiqueta: "SILLÓN 2" }
];
const asignaciones = filas.map((fila, indice) => ({
  ...fila,
  enfermero: [a, b, c, null][indice]
}));
const prioridadSillon = ["rea_1", "sillon_1", "sillon_2", "rea_2"];
const prioridadRea = ["rea_1", "sillon_1", "rea_2", "sillon_2"];
const resolver = (prioridadSectorIds) => resolverTurnantesYCoberturasOperativas({
  asignaciones,
  extras: [],
  personal: [a, b, c],
  esPersonaDisponible: () => true,
  prioridadSectorIds
}).asignaciones;
assert.equal(resolver(prioridadSillon).find((fila) => fila.sectorId === "sillon_2").enfermero.id, b.id);
assert.equal(resolver(prioridadSillon).find((fila) => fila.sectorId === "rea_2").enfermero, null);
assert.equal(resolver(prioridadRea).find((fila) => fila.sectorId === "rea_2").enfermero.id, b.id);

for (const redistribuir of [redistribuirCritica, redistribuirPorBoxes]) {
  const resultado = redistribuir({
    asignaciones,
    ordenVisual: filas.map((fila) => fila.etiqueta),
    filasConfiguracion: filas,
    prioridadSectorIds: prioridadSillon
  }).asignaciones;
  assert.equal(resultado.find((fila) => fila.nombre === "SILLÓN 2")?.enfermero?.id, c.id);
  assert.equal(resultado.find((fila) => fila.nombre === "REA 2")?.enfermero, null);
}

const categorias = (prioridad) => ({
  enfermero: { planilla: {}, configuracion: { filas, prioridadCoberturaSectorIds: prioridad } },
  licenciado: { planilla: {}, configuracion: { filas: [] } }
});
const estadoVersionado = {
  configuracionPlanilla: { enfermero: { filas, prioridadCoberturaSectorIds: ["rea_2", "sillon_2"] } },
  preparaciones: [
    { id: "A", desde: "2026-09-01", hasta: "2026-09-09", categorias: categorias(prioridadRea) },
    { id: "B", desde: "2026-09-10", hasta: "2026-09-19", categorias: categorias(prioridadSillon) },
    { id: "C", desde: "2026-09-20", hasta: "2026-09-30", categorias: categorias(prioridadRea) }
  ]
};
const prioridadFecha = (fecha) => resolverOrganizacionMesPorFecha({
  estado: estadoVersionado, mes: "2026-09", fecha
}).configuracionPlanilla.enfermero.prioridadCoberturaSectorIds;
assert.deepEqual(prioridadFecha("2026-09-15"), prioridadSillon);
assert.deepEqual(prioridadFecha("2026-09-25"), prioridadRea);
assert.notDeepEqual(prioridadFecha("2026-09-15"), estadoVersionado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds);

console.log("\nHotfix Calendario: 13 comprobaciones de prioridad y presentación aprobadas.");
