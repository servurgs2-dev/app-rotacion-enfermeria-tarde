import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearAdhesionParoPersonal,
  crearNovedadPersonal,
  evaluarDisponibilidadPorNovedades,
  excluirNoDisponiblesPorNovedadesDeAsignaciones,
  planificarListaAdhesionParo,
  TIPOS_NOVEDAD_PERSONAL
} from "../src/utils/novedadesPersonal.js";
import { crearSincronizadorListaParo } from "../src/services/sincronizadorListaParo.js";
import { obtenerNoDisponiblesDelDia } from "../src/utils/noDisponiblesMotivos.js";

let total = 0;
const probar = async (nombre, fn) => {
  await fn();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const fecha = "2026-08-20";
const turno = "tarde";
const juan = { id: "persona-juan", nombre: "Juan", categoria: "enfermero" };
const pedro = { id: "persona-pedro", nombre: "Pedro", categoria: "licenciado" };
const maria = { id: "persona-maria", nombre: "María", categoria: "enfermero" };

const adhesion = (persona, cambios = {}) => ({
  id: `adhesion-${persona.id}`,
  ...crearAdhesionParoPersonal({ persona, fecha, turno }).novedad,
  ...cambios
});

await probar("la lista crea Adhesión a paro de un día con atributos operativos forzados", () => {
  const resultado = crearNovedadPersonal({
    persona: juan,
    tipo: TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO,
    fechaDesde: fecha,
    fechaHasta: fecha,
    turno,
    afectaDisponibilidad: false,
    requiereSeguimiento: true,
    estado: "pendiente"
  }).novedad;
  assert.equal(resultado.tipo, "adhesion_paro");
  assert.equal(resultado.fechaDesde, fecha);
  assert.equal(resultado.fechaHasta, fecha);
  assert.equal(resultado.turno, turno);
  assert.equal(resultado.categoria, "enfermero");
  assert.equal(resultado.afectaDisponibilidad, true);
  assert.equal(resultado.requiereSeguimiento, false);
  assert.equal(resultado.estado, "activa");
});

await probar("una adhesión bloquea sólo persona, fecha y turno correspondientes", () => {
  const novedad = adhesion(juan);
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [novedad], persona: juan, fecha, turno }).disponible, false);
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [novedad], persona: juan, fecha: "2026-08-21", turno }).disponible, true);
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [novedad], persona: juan, fecha, turno: "manana" }).disponible, true);
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [novedad], persona: pedro, fecha, turno }).disponible, true);
});

await probar("cancelar una adhesión restaura disponibilidad", () => {
  const cancelada = adhesion(juan, { estado: "cancelada" });
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [cancelada], persona: juan, fecha, turno }).disponible, true);
});

await probar("la adhesión libera el sector sin mutar la asignación base", () => {
  const base = [{ sectorId: "sillon_1", nombre: "SILLÓN 1", enfermero: juan }];
  const copia = JSON.stringify(base);
  const durante = excluirNoDisponiblesPorNovedadesDeAsignaciones({ asignaciones: base, novedades: [adhesion(juan)], fecha, turno });
  const despues = excluirNoDisponiblesPorNovedadesDeAsignaciones({ asignaciones: base, novedades: [adhesion(juan)], fecha: "2026-08-21", turno });
  assert.equal(durante[0].enfermero, null);
  assert.equal(durante[0].excluidoPorNovedad, true);
  assert.equal(despues[0].enfermero, juan);
  assert.equal(JSON.stringify(base), copia);
});

await probar("guardar la misma lista es idempotente", () => {
  const existente = adhesion(juan);
  const plan = planificarListaAdhesionParo({ novedades: [existente], personasSeleccionadas: [juan], fecha, turno });
  assert.deepEqual(plan, { crear: [], cancelar: [] });
});

await probar("editar la lista conserva Juan, cancela Pedro y crea María", () => {
  const juanActiva = adhesion(juan);
  const pedroActiva = adhesion(pedro);
  const plan = planificarListaAdhesionParo({
    novedades: [juanActiva, pedroActiva],
    personasSeleccionadas: [juan, maria],
    fecha,
    turno,
    observacion: "Paro general"
  });
  assert.deepEqual(plan.cancelar.map((novedad) => novedad.id), [pedroActiva.id]);
  assert.deepEqual(plan.crear.map((novedad) => novedad.personaId), [maria.id]);
  assert.equal(plan.crear[0].observacion, "Paro general");
});

await probar("el plan cancela duplicados activos conservando una sola adhesión", () => {
  const primera = adhesion(juan);
  const duplicada = { ...primera, id: "duplicada" };
  const plan = planificarListaAdhesionParo({ novedades: [primera, duplicada], personasSeleccionadas: [juan], fecha, turno });
  assert.deepEqual(plan.crear, []);
  assert.deepEqual(plan.cancelar.map((novedad) => novedad.id), ["duplicada"]);
});

await probar("la base impide duplicar una adhesión activa y conserva canceladas", () => {
  const sql = fs.readFileSync("supabase/migrations/20260817_adhesion_paro_activa_unica.sql", "utf8");
  assert.match(sql, /create unique index/i);
  assert.match(sql, /persona_id, fecha_desde, fecha_hasta, turno/i);
  assert.match(sql, /where tipo = 'adhesion_paro' and estado = 'activa'/i);
  assert.doesNotMatch(sql, /delete|drop table|alter table/i);
});

await probar("la sincronización consulta el turno activo antes de crear o cancelar", async () => {
  const llamadas = [];
  const existentes = [adhesion(juan), adhesion(pedro)];
  const repo = {
    async listar(filtros) { llamadas.push(["listar", filtros]); return existentes; },
    async crear(novedad) { llamadas.push(["crear", novedad.personaId]); return { ...novedad, id: "nueva" }; },
    async cancelar(id) { llamadas.push(["cancelar", id]); return { ...existentes.find((novedad) => novedad.id === id), estado: "cancelada" }; }
  };
  const resultado = await crearSincronizadorListaParo(repo)({ fecha, turno, personasSeleccionadas: [juan, maria] });
  assert.deepEqual(llamadas[0], ["listar", { fechaDesde: fecha, fechaHasta: fecha, turno }]);
  assert.deepEqual(llamadas.slice(1), [["cancelar", adhesion(pedro).id], ["crear", maria.id]]);
  assert.equal(resultado.creadas.length, 1);
  assert.equal(resultado.canceladas.length, 1);
});

await probar("No disponibles muestra Adhesión a paro una sola vez frente a otra causa", () => {
  const resultado = obtenerNoDisponiblesDelDia({
    registros: [],
    certificaciones: [{ personaId: juan.id, nombre: juan.nombre, desde: fecha, hasta: fecha }],
    novedades: [adhesion(juan)],
    personal: [juan],
    fecha,
    turno,
    categoria: "enfermero"
  });
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].tipo, "certificacion");
  const soloParo = obtenerNoDisponiblesDelDia({ registros: [], certificaciones: [], novedades: [adhesion(juan)], personal: [juan], fecha, turno, categoria: "enfermero" });
  assert.equal(soloParo[0].motivoEtiqueta, "Adhesión a paro");
});

await probar("Lista de paro tiene acción específica y respeta turno e histórico", () => {
  const novedadesFuente = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  const listaFuente = fs.readFileSync("src/components/novedades/ListaParo.jsx", "utf8");
  assert.match(novedadesFuente, /\["paro", "Lista de paro"/);
  assert.doesNotMatch(novedadesFuente, /OPCIONES_ALTA_NOVEDAD/);
  assert.match(listaFuente, /turnoActivo/);
  assert.match(listaFuente, /soloLectura/);
  assert.match(listaFuente, /Confirmar lista de paro/);
  assert.doesNotMatch(listaFuente, /Todos los turnos/);
});

await probar("App actualiza la colección compartida sin activar el paro histórico", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(app, /sincronizarListaParo/);
  assert.match(app, /onGuardarListaParo=\{guardarListaParo\}/);
  assert.doesNotMatch(calendario, /tipo\s*===\s*["']adhesion_paro["']/);
});

console.log(`\n${total} pruebas de Lista de paro pasaron.`);
