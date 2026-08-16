import assert from "node:assert/strict";
import {
  aplicarMovimientosCalendario,
  crearMovimientosEntreFilasCalendario
} from "../src/utils/cambiosCalendario.js";
import {
  DESTINOS_DINAMICOS_ENFERMEROS,
  incorporarDestinosDinamicosAlOrden,
  resolverDestinosDinamicosCalendario
} from "../src/utils/destinosDinamicosCalendario.js";
import { construirAsignacionesDiariasCalendario } from "../src/utils/pipelineCalendarioDiario.js";

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const persona = (id, nombre) => ({ id, nombre, categoria: "enfermero" });
const ana = persona("ana", "Ana");
const brenda = persona("brenda", "Brenda");
const beatriz = persona("beatriz", "Beatriz");
const carla = persona("carla", "Carla");
const personal = [ana, brenda, beatriz, carla];
const filasConfiguracion = [
  { filaId: "sector.1", tipo: "sector", sectorId: "sillon_1", etiqueta: "SILLÓN 1" },
  { filaId: "sector.2", tipo: "sector", sectorId: "sillon_2", etiqueta: "SILLON 2" },
  { filaId: "sector.x", tipo: "sector", sectorId: "otro", etiqueta: "OTRO" }
];
const filasCalendario = filasConfiguracion.map((fila) => fila.etiqueta);
const planilla = {
  "SILLÓN 1": { personaId: ana.id, nombre: ana.nombre },
  "SILLON 2": { personaId: brenda.id, nombre: brenda.nombre },
  OTRO: { personaId: carla.id, nombre: carla.nombre }
};

const reconstruir = (cambios = {}) => {
  const base = construirAsignacionesDiariasCalendario({
    filasCalendario,
    filasConfiguracion,
    planillaPeriodoEfectiva: planilla,
    cambiosDia: cambios,
    personal,
    personalDisponibleParaOverrides: personal,
    turnantes: []
  });
  const asignadas = new Set(base.map((fila) => fila.enfermero?.id).filter(Boolean));
  const sobrantes = personal.filter((actual) => !asignadas.has(actual.id));
  const dinamicos = resolverDestinosDinamicosCalendario({
    destinos: DESTINOS_DINAMICOS_ENFERMEROS,
    cambiosDia: cambios,
    sobrantes,
    habilitarAutomaticos: !base.some((fila) => !fila.enfermero)
  });
  return [...base, ...dinamicos.asignaciones, ...dinamicos.sobrantes.map((enfermero) => ({
    nombre: "SIN ASIGNAR",
    enfermero
  }))];
};

probar("SILLONES 3 tiene identidad distinta de SILLÓN 1 y SILLON 2", () => {
  const [destino] = DESTINOS_DINAMICOS_ENFERMEROS;
  assert.equal(destino.sectorId, "sillones_3");
  assert.notEqual(destino.sectorId, "sillon_1");
  assert.notEqual(destino.sectorId, "sillon_2");
});

probar("sin cambios el primer sobrante ocupa SILLONES 3", () => {
  const resultado = reconstruir();
  assert.equal(resultado.find((fila) => fila.sectorId === "sillones_3").enfermero, beatriz);
});

probar("mover una persona a SILLONES 3 preserva al ocupante no afectado de SILLON 2", () => {
  const antes = reconstruir();
  const cambios = aplicarMovimientosCalendario({
    cambios: {},
    movimientos: crearMovimientosEntreFilasCalendario({
      seleccionado: antes.find((fila) => fila.sectorId === "otro"),
      destino: antes.find((fila) => fila.sectorId === "sillones_3")
    })
  });
  const despues = reconstruir(cambios);
  assert.equal(despues.find((fila) => fila.sectorId === "sillones_3").enfermero, carla);
  assert.equal(despues.find((fila) => fila.sectorId === "sillon_2").enfermero, brenda);
  assert.equal(despues.find((fila) => fila.sectorId === "otro").enfermero, beatriz);
});

probar("varios movimientos consecutivos no pierden ni duplican personas", () => {
  let cambios = {};
  let estado = reconstruir(cambios);
  const mover = (origenId, destinoId) => {
    cambios = aplicarMovimientosCalendario({
      cambios,
      movimientos: crearMovimientosEntreFilasCalendario({
        seleccionado: estado.find((fila) => fila.sectorId === origenId),
        destino: estado.find((fila) => fila.sectorId === destinoId)
      })
    });
    estado = reconstruir(cambios);
  };
  mover("otro", "sillones_3");
  mover("sillon_1", "sillones_3");
  mover("sillon_2", "sillones_3");
  const ids = estado.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.deepEqual(new Set(ids), new Set(personal.map((actual) => actual.id)));
  assert.equal(ids.length, new Set(ids).size);
});

probar("un destino dinámico manual permanece aunque exista otro hueco", () => {
  const cambios = aplicarMovimientosCalendario({
    cambios: {},
    movimientos: [
      { sector: "SILLONES 3", persona: beatriz },
      { sector: "OTRO", vacio: true }
    ]
  });
  const resultado = reconstruir(cambios);
  assert.equal(resultado.find((fila) => fila.sectorId === "sillones_3").enfermero, beatriz);
});

probar("aliases exactos de Sillón 3 resuelven sin colisionar", () => {
  for (const alias of ["SILLONES 3", "SILLÓN 3", "SILLON 3"]) {
    const cambios = aplicarMovimientosCalendario({
      cambios: {},
      movimientos: [{ sector: alias, persona: beatriz }]
    });
    const resultado = reconstruir(cambios);
    assert.equal(resultado.find((fila) => fila.sectorId === "sillones_3").enfermero, beatriz);
  }
});

probar("el destino dinámico se incorpora al orden configurado después de SILLON 2", () => {
  const orden = incorporarDestinosDinamicosAlOrden({
    ordenVisual: ["SILLÓN 1", "SILLON 2", "OTRO", "DIVIDER", "SIN ASIGNAR"],
    destinosPresentes: [{ sectorId: "sillones_3", etiqueta: "SILLONES 3" }],
    filasConfiguracion
  });
  assert.deepEqual(orden.slice(0, 3), ["SILLÓN 1", "SILLON 2", "SILLONES 3"]);
});

console.log(`\n${total} pruebas de destinos dinámicos del Calendario pasaron.`);
