import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearNovedadPersonal,
  evaluarDisponibilidadPorNovedades,
  excluirNoDisponiblesPorNovedadesDeAsignaciones,
  obtenerRangoMesNovedades,
  TIPOS_NOVEDAD_PERSONAL
} from "../src/utils/novedadesPersonal.js";
import { crearRepositorioNovedadesPersonal } from "../src/services/repositorioNovedadesPersonal.js";
import { obtenerNoDisponiblesDelDia } from "../src/utils/noDisponiblesMotivos.js";

let total = 0;
const probar = async (nombre, fn) => {
  await fn();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const juan = { id: "persona-juan", nombre: "Juan", categoria: "enfermero" };
const pedro = { id: "persona-pedro", nombre: "Pedro", categoria: "enfermero" };
const crearSuspension = (cambios = {}) => crearNovedadPersonal({
  persona: juan,
  tipo: TIPOS_NOVEDAD_PERSONAL.SUSPENSION,
  fechaDesde: "2026-08-20",
  fechaHasta: "2026-08-22",
  turno: "tarde",
  ...cambios
}).novedad;

await probar("un día bloquea solamente la fecha configurada", () => {
  const suspension = crearSuspension({ fechaHasta: "2026-08-20" });
  for (const [fecha, disponible] of [["2026-08-19", true], ["2026-08-20", false], ["2026-08-21", true]]) {
    assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [suspension], persona: juan, fecha, turno: "tarde" }).disponible, disponible);
  }
});

await probar("el modelo fuerza los atributos operativos de Suspensión", () => {
  const suspension = crearSuspension({
    afectaDisponibilidad: false,
    requiereSeguimiento: true,
    estado: "pendiente"
  });
  assert.equal(suspension.afectaDisponibilidad, true);
  assert.equal(suspension.requiereSeguimiento, false);
  assert.equal(suspension.estado, "activa");
});

await probar("un rango bloquea ambos límites y los días intermedios", () => {
  const suspension = crearSuspension();
  for (const fecha of ["2026-08-20", "2026-08-21", "2026-08-22"]) {
    assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [suspension], persona: juan, fecha, turno: "tarde" }).disponible, false);
  }
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [suspension], persona: juan, fecha: "2026-08-23", turno: "tarde" }).disponible, true);
});

await probar("cancelada, revisada o resuelta no bloquean", () => {
  for (const estado of ["cancelada", "revisada", "resuelta"]) {
    assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [{ ...crearSuspension(), estado }], persona: juan, fecha: "2026-08-21", turno: "tarde" }).disponible, true);
  }
});

await probar("una novedad administrativa no bloquea", () => {
  const administrativa = crearNovedadPersonal({ persona: juan, tipo: "otra", fechaDesde: "2026-08-20", fechaHasta: "2026-08-22", turno: "tarde" }).novedad;
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [administrativa], persona: juan, fecha: "2026-08-21", turno: "tarde" }).disponible, true);
});

await probar("persona y turno distintos no quedan bloqueados", () => {
  const suspension = crearSuspension();
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [suspension], persona: pedro, fecha: "2026-08-21", turno: "tarde" }).disponible, true);
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [suspension], persona: juan, fecha: "2026-08-21", turno: "noche" }).disponible, true);
});

await probar("Licencia y Certificación legacy siguen bloqueando", () => {
  for (const fuente of ["licencias", "certificaciones"]) {
    const contexto = { novedades: [], licencias: [], certificaciones: [], personal: [juan], persona: juan, fecha: "2026-08-21", turno: "tarde" };
    contexto[fuente] = [{ personaId: juan.id, nombre: juan.nombre, desde: "2026-08-20", hasta: "2026-08-22" }];
    assert.equal(evaluarDisponibilidadPorNovedades(contexto).disponible, false);
  }
});

await probar("libera el sector sin mutar la base ni afectar otra persona", () => {
  const originales = [{ sectorId: "rea_1", nombre: "REA 1", enfermero: juan }, { sectorId: "rea_2", nombre: "REA 2", enfermero: pedro }];
  const copia = JSON.stringify(originales);
  const resultado = excluirNoDisponiblesPorNovedadesDeAsignaciones({ asignaciones: originales, novedades: [crearSuspension()], fecha: "2026-08-21", turno: "tarde" });
  assert.equal(resultado[0].enfermero, null);
  assert.equal(resultado[0].excluidoPorNovedad, true);
  assert.equal(resultado[1].enfermero, pedro);
  assert.equal(JSON.stringify(originales), copia);
});

await probar("al terminar el rango vuelve la asignación base", () => {
  const originales = [{ sectorId: "rea_1", nombre: "REA 1", enfermero: juan }];
  const resultado = excluirNoDisponiblesPorNovedadesDeAsignaciones({ asignaciones: originales, novedades: [crearSuspension()], fecha: "2026-08-23", turno: "tarde" });
  assert.equal(resultado[0].enfermero, juan);
});

await probar("la suspensión aparece una vez en No disponibles", () => {
  const suspension = crearSuspension();
  const resultado = obtenerNoDisponiblesDelDia({
    registros: [], certificaciones: [], novedades: [suspension], personal: [juan],
    fecha: "2026-08-21", turno: "tarde", categoria: "enfermero",
    obtenerSectorOrigen: () => "REA 1"
  });
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].persona, juan);
  assert.equal(resultado[0].motivoEtiqueta, "Suspensión");
  assert.equal(resultado[0].sectorOrigen, "REA 1");
});

await probar("una fuente legacy existente evita duplicar la misma persona", () => {
  const resultado = obtenerNoDisponiblesDelDia({
    registros: [],
    certificaciones: [{ personaId: juan.id, nombre: juan.nombre, desde: "2026-08-20", hasta: "2026-08-22" }],
    novedades: [crearSuspension()], personal: [juan], fecha: "2026-08-21",
    turno: "tarde", categoria: "enfermero"
  });
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].tipo, "certificacion");
});

await probar("la consulta contempla rangos que cruzan meses", () => {
  assert.deepEqual(obtenerRangoMesNovedades("2026-08"), { fechaDesde: "2026-08-01", fechaHasta: "2026-08-31" });
  const repositorio = fs.readFileSync("src/services/repositorioNovedadesPersonal.js", "utf8");
  assert.match(repositorio, /lte\("fecha_desde", fechaHasta\)/);
  assert.match(repositorio, /gte\("fecha_hasta", fechaDesde\)/);
  assert.match(repositorio, /eq\("turno", turno\)/);
});

await probar("cancelar actualiza estado y no borra", async () => {
  const llamadas = [];
  const respuesta = { id: "nov-1", persona_id: juan.id, persona_nombre: juan.nombre, tipo: "suspension", fecha_desde: "2026-08-20", fecha_hasta: "2026-08-22", turno: "tarde", categoria: "enfermero", observacion: "", afecta_disponibilidad: true, requiere_seguimiento: false, estado: "cancelada", datos: {} };
  const cadena = { update(valor) { llamadas.push(["update", valor]); return this; }, eq(campo, valor) { llamadas.push(["eq", campo, valor]); return this; }, select() { return this; }, async single() { return { data: respuesta, error: null }; } };
  const repo = crearRepositorioNovedadesPersonal({ from(tabla) { llamadas.push(["from", tabla]); return cadena; } });
  const cancelada = await repo.cancelar("nov-1");
  assert.equal(cancelada.estado, "cancelada");
  assert.deepEqual(llamadas.slice(0, 3), [["from", "novedades_personal"], ["update", { estado: "cancelada" }], ["eq", "id", "nov-1"]]);
});

await probar("el alta no ofrece Licencias ni Certificaciones", () => {
  const componente = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  assert.match(componente, /TIPOS_NO_DISPONIBLES_PARA_ALTA/);
  assert.match(componente, /OPCIONES_ALTA_NOVEDAD\.map/);
  assert.match(componente, /esSuspension \? true/);
  assert.match(componente, /esSuspension \? ESTADOS_NOVEDAD_PERSONAL\.ACTIVA/);
  assert.doesNotMatch(componente, /aria-label="Filtrar por turno"/);
  assert.doesNotMatch(componente, /Todos los turnos/);
  assert.match(componente, /turno: turnoActivo/);
});

await probar("App comparte la misma colección con Novedades y ambos Calendarios", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(app, /const \[novedadesPersonal, setNovedadesPersonal\]/);
  assert.equal((app.match(/novedades=\{novedadesPersonal\}/g) || []).length, 3);
  assert.match(app, /setNovedadesPersonal\(\(actuales\) => actuales\.map/);
  assert.match(app, /turno: turnoActivo/);
});

console.log(`\n${total} pruebas de Suspensiones y disponibilidad pasaron.`);
