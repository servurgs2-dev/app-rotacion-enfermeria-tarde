import assert from "node:assert/strict";
import fs from "node:fs";
import {
  contarOlvidosTarjetaPendientes,
  crearNovedadPersonal,
  crearOlvidoTarjetaPersonal,
  ESTADOS_NOVEDAD_PERSONAL,
  evaluarDisponibilidadPorNovedades,
  excluirNoDisponiblesPorNovedadesDeAsignaciones,
  TIPOS_NOVEDAD_PERSONAL,
  validarTransicionEstadoNovedad
} from "../src/utils/novedadesPersonal.js";
import {
  crearActualizadorEstadoNovedad,
  crearRegistradorOlvidoTarjeta
} from "../src/services/seguimientoNovedadesPersonal.js";
import { crearRepositorioNovedadesPersonal } from "../src/services/repositorioNovedadesPersonal.js";
import { obtenerNoDisponiblesDelDia } from "../src/utils/noDisponiblesMotivos.js";

let total = 0;
const probar = async (nombre, fn) => {
  await fn();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const fecha = "2026-08-21";
const turno = "tarde";
const juan = { id: "persona-juan", nombre: "Juan", categoria: "enfermero" };
const pedro = { id: "persona-pedro", nombre: "Pedro", categoria: "licenciado" };
const crearOlvido = (persona = juan, cambios = {}) => ({
  id: `olvido-${persona.id}`,
  ...crearOlvidoTarjetaPersonal({ persona, fecha, turno, observacion: "Olvidó marcar entrada" }).novedad,
  ...cambios
});

await probar("el alta específica crea fecha única, turno y categoría correctos", () => {
  const novedad = crearOlvido();
  assert.equal(novedad.tipo, "olvido_tarjeta");
  assert.equal(novedad.fechaDesde, fecha);
  assert.equal(novedad.fechaHasta, fecha);
  assert.equal(novedad.turno, turno);
  assert.equal(novedad.categoria, "enfermero");
  assert.equal(novedad.observacion, "Olvidó marcar entrada");
});

await probar("el modelo fuerza administrativo, seguimiento y pendiente", () => {
  const novedad = crearNovedadPersonal({
    persona: juan,
    tipo: TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA,
    fechaDesde: fecha,
    turno,
    afectaDisponibilidad: true,
    requiereSeguimiento: false,
    estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA
  }).novedad;
  assert.equal(novedad.afectaDisponibilidad, false);
  assert.equal(novedad.requiereSeguimiento, true);
  assert.equal(novedad.estado, "pendiente");
});

await probar("pendiente, revisada y resuelta nunca afectan disponibilidad", () => {
  for (const estado of ["pendiente", "revisada", "resuelta"]) {
    assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [crearOlvido(juan, { estado })], persona: juan, fecha, turno }).disponible, true);
  }
});

await probar("el Olvido conserva el sector y no muta la asignación", () => {
  const base = [{ sectorId: "rea_1", nombre: "REA 1", enfermero: juan }];
  const copia = JSON.stringify(base);
  const resultado = excluirNoDisponiblesPorNovedadesDeAsignaciones({ asignaciones: base, novedades: [crearOlvido()], fecha, turno });
  assert.equal(resultado[0].enfermero, juan);
  assert.equal(JSON.stringify(base), copia);
});

await probar("Olvido de tarjeta no aparece en No disponibles", () => {
  const resultado = obtenerNoDisponiblesDelDia({ registros: [], certificaciones: [], novedades: [crearOlvido()], personal: [juan], fecha, turno, categoria: "enfermero" });
  assert.deepEqual(resultado, []);
});

await probar("valida Pendiente a Revisada o Resuelta y Revisada a Resuelta", () => {
  const pendiente = crearOlvido();
  assert.equal(validarTransicionEstadoNovedad(pendiente, "revisada"), "");
  assert.equal(validarTransicionEstadoNovedad(pendiente, "resuelta"), "");
  assert.equal(validarTransicionEstadoNovedad({ ...pendiente, estado: "revisada" }, "resuelta"), "");
  assert.equal(validarTransicionEstadoNovedad(pendiente, "cancelada"), "");
  assert.equal(validarTransicionEstadoNovedad({ ...pendiente, estado: "revisada" }, "cancelada"), "");
});

await probar("rechaza reapertura de Resuelta o Cancelada", () => {
  assert.match(validarTransicionEstadoNovedad(crearOlvido(juan, { estado: "resuelta" }), "pendiente"), /No se puede/);
  assert.match(validarTransicionEstadoNovedad(crearOlvido(juan, { estado: "cancelada" }), "pendiente"), /No se puede/);
  assert.match(validarTransicionEstadoNovedad(crearOlvido(juan, { estado: "revisada" }), "pendiente"), /No se puede/);
});

await probar("el actualizador consulta estado real y persiste sólo el estado", async () => {
  const llamadas = [];
  const actual = crearOlvido();
  const repo = {
    async obtener(id) { llamadas.push(["obtener", id]); return actual; },
    async actualizarEstado(id, estado) { llamadas.push(["actualizarEstado", id, estado]); return { ...actual, estado }; }
  };
  const resultado = await crearActualizadorEstadoNovedad(repo)(actual.id, "revisada");
  assert.equal(resultado.estado, "revisada");
  assert.deepEqual(llamadas, [["obtener", actual.id], ["actualizarEstado", actual.id, "revisada"]]);
});

await probar("el repositorio actualiza únicamente la columna estado", async () => {
  const llamadas = [];
  const fila = { id: "olvido-1", persona_id: juan.id, persona_nombre: juan.nombre, tipo: "olvido_tarjeta", fecha_desde: fecha, fecha_hasta: fecha, turno, categoria: "enfermero", observacion: "", afecta_disponibilidad: false, requiere_seguimiento: true, estado: "revisada", datos: {} };
  const cadena = { update(valor) { llamadas.push(["update", valor]); return this; }, eq(campo, valor) { llamadas.push(["eq", campo, valor]); return this; }, select() { return this; }, async single() { return { data: fila, error: null }; } };
  const repo = crearRepositorioNovedadesPersonal({ from(tabla) { llamadas.push(["from", tabla]); return cadena; } });
  await repo.actualizarEstado("olvido-1", "revisada");
  assert.deepEqual(llamadas.slice(0, 3), [["from", "novedades_personal"], ["update", { estado: "revisada" }], ["eq", "id", "olvido-1"]]);
});

await probar("el contador usa sólo pendientes del turno activo", () => {
  const novedades = [
    crearOlvido(juan),
    crearOlvido(pedro),
    crearOlvido(juan, { id: "revisada", estado: "revisada" }),
    crearOlvido(juan, { id: "otro-turno", turno: "manana" })
  ];
  assert.equal(contarOlvidosTarjetaPendientes(novedades, turno), 2);
  assert.equal(contarOlvidosTarjetaPendientes(novedades, "manana"), 1);
});

await probar("el alta consulta y rechaza duplicado no cancelado", async () => {
  const existente = crearOlvido();
  let creado = false;
  const registrar = crearRegistradorOlvidoTarjeta({
    async listar(filtros) { assert.deepEqual(filtros, { fechaDesde: fecha, fechaHasta: fecha }); return [existente]; },
    async crear() { creado = true; }
  });
  await assert.rejects(() => registrar({ persona: juan, fecha, turno }), /Ya existe/);
  assert.equal(creado, false);
});

await probar("un registro cancelado permite corregir con una nueva alta", async () => {
  const repo = {
    async listar() { return [crearOlvido(juan, { estado: "cancelada" })]; },
    async crear(novedad) { return { ...novedad, id: "nuevo" }; }
  };
  const resultado = await crearRegistradorOlvidoTarjeta(repo)({ persona: juan, fecha, turno });
  assert.equal(resultado.id, "nuevo");
});

await probar("Olvido y Suspensión conviven con un único bloqueo operativo", () => {
  const suspension = crearNovedadPersonal({ persona: juan, tipo: "suspension", fechaDesde: fecha, turno }).novedad;
  const novedades = [crearOlvido(), suspension];
  const evaluacion = evaluarDisponibilidadPorNovedades({ novedades, persona: juan, fecha, turno });
  assert.equal(evaluacion.novedades.length, 2);
  assert.deepEqual(evaluacion.bloqueantes, [suspension]);
  const noDisponibles = obtenerNoDisponiblesDelDia({ registros: [], certificaciones: [], novedades, personal: [juan], fecha, turno, categoria: "enfermero" });
  assert.equal(noDisponibles.length, 1);
  assert.equal(noDisponibles[0].motivoEtiqueta, "Suspensión");
});

await probar("la vía genérica excluye Olvido y la UI protege históricos", () => {
  const novedadesFuente = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  const formularioFuente = fs.readFileSync("src/components/novedades/FormularioOlvidoTarjeta.jsx", "utf8");
  assert.match(novedadesFuente, /"olvido_tarjeta"/);
  assert.match(novedadesFuente, /Olvidos de tarjeta pendientes/);
  assert.match(novedadesFuente, /Marcar revisada/);
  assert.match(novedadesFuente, /Marcar resuelta/);
  assert.match(formularioFuente, /soloLectura/);
  assert.doesNotMatch(formularioFuente, /Afecta disponibilidad|Requiere seguimiento|Todos los turnos/);
});

await probar("la base impide duplicados no cancelados y conserva trazabilidad", () => {
  const sql = fs.readFileSync("supabase/migrations/20260818_olvido_tarjeta_no_cancelado_unico.sql", "utf8");
  assert.match(sql, /create unique index/i);
  assert.match(sql, /where tipo = 'olvido_tarjeta' and estado <> 'cancelada'/i);
  assert.doesNotMatch(sql, /delete|drop table|alter table/i);
});

console.log(`\n${total} pruebas de Olvido de tarjeta pasaron.`);
