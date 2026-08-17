import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearCambioHorarioPersonal,
  crearNovedadPersonal,
  evaluarDisponibilidadPorNovedades,
  ESTADOS_NOVEDAD_PERSONAL,
  obtenerCambioHorarioActivo,
  TIPOS_NOVEDAD_PERSONAL
} from "../src/utils/novedadesPersonal.js";
import { obtenerHorarioBaseEfectivoPersonaEnFecha } from "../src/utils/horarioEfectivoPersonal.js";
import { generarAlertasHorarios } from "../src/utils/alertasHorarios.js";
import { obtenerConfiguracionTurno } from "../src/config/turnos.js";
import { crearGuardadorCambioHorario } from "../src/services/cambiosHorarioPersonal.js";

let aprobadas = 0;
const probar = async (nombre, fn) => {
  try { await fn(); aprobadas += 1; console.log(`✓ ${nombre}`); }
  catch (error) { console.error(`✗ ${nombre}`); throw error; }
};

const persona = { id: "persona-1", nombre: "Persona Uno", categoria: "enfermero", horario: "normal" };
const crearCambio = (extra = {}) => crearCambioHorarioPersonal({
  persona, fecha: "2026-08-20", turno: "tarde",
  horaEntrada: "12:30", horaSalida: "18:30", ...extra
});

await probar("alta fuerza el contrato operativo y guarda datos", () => {
  const { novedad, error } = crearNovedadPersonal({
    persona, tipo: TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO,
    fechaDesde: "2026-08-20", fechaHasta: "2026-08-20", turno: "tarde",
    afectaDisponibilidad: true, requiereSeguimiento: true,
    estado: ESTADOS_NOVEDAD_PERSONAL.PENDIENTE,
    datos: { horaEntrada: "12:30", horaSalida: "18:30" }
  });
  assert.equal(error, "");
  assert.equal(novedad.afectaDisponibilidad, false);
  assert.equal(novedad.requiereSeguimiento, false);
  assert.equal(novedad.estado, "activa");
  assert.deepEqual(novedad.datos, { horaEntrada: "12:30", horaSalida: "18:30" });
});

await probar("valida horas y admite intervalos que cruzan medianoche", () => {
  assert.match(crearCambio({ horaEntrada: "12:00", horaSalida: "12:00" }).error, /no pueden ser iguales/i);
  assert.equal(crearCambio({ horaEntrada: "18:30", horaSalida: "00:30" }).error, "");
});

await probar("horario efectivo aplica sólo a persona, fecha y turno", () => {
  const cambio = { id: "c1", ...crearCambio().novedad };
  const contexto = { persona, novedades: [cambio], configTurno: obtenerConfiguracionTurno("tarde") };
  assert.equal(obtenerHorarioBaseEfectivoPersonaEnFecha({ ...contexto, fecha: "2026-08-20", turno: "tarde" }).textoVisible, "12:30 a 18:30");
  assert.equal(obtenerHorarioBaseEfectivoPersonaEnFecha({ ...contexto, fecha: "2026-08-19", turno: "tarde" }).textoVisible, "12:00 a 18:00");
  assert.equal(obtenerHorarioBaseEfectivoPersonaEnFecha({ ...contexto, fecha: "2026-08-21", turno: "tarde" }).textoVisible, "12:00 a 18:00");
  assert.equal(obtenerHorarioBaseEfectivoPersonaEnFecha({ ...contexto, fecha: "2026-08-20", turno: "manana", configTurno: obtenerConfiguracionTurno("manana") }).textoVisible, "06:00 a 12:00");
  assert.equal(obtenerHorarioBaseEfectivoPersonaEnFecha({ ...contexto, persona: { ...persona, id: "otra" }, fecha: "2026-08-20", turno: "tarde" }).textoVisible, "12:00 a 18:00");
});

await probar("cancelación vuelve al horario habitual", () => {
  const cancelado = { id: "c1", ...crearCambio().novedad, estado: "cancelada" };
  assert.equal(obtenerCambioHorarioActivo({ novedades: [cancelado], persona, fecha: "2026-08-20", turno: "tarde" }), null);
});

await probar("no afecta disponibilidad ni genera No disponible", () => {
  const cambio = { id: "c1", ...crearCambio().novedad };
  const evaluacion = evaluarDisponibilidadPorNovedades({ novedades: [cambio], persona, fecha: "2026-08-20", turno: "tarde" });
  assert.equal(evaluacion.disponible, true);
  assert.equal(evaluacion.bloqueantes.length, 0);
});

await probar("convive con suspensión, paro y olvido sin revivir ausencias", () => {
  const cambio = { id: "c1", ...crearCambio().novedad };
  const olvido = { id: "o1", ...crearNovedadPersonal({ persona, tipo: "olvido_tarjeta", fechaDesde: "2026-08-20", turno: "tarde" }).novedad };
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [cambio, olvido], persona, fecha: "2026-08-20", turno: "tarde" }).disponible, true);
  for (const tipo of ["suspension", "adhesion_paro"]) {
    const bloqueante = { id: tipo, ...crearNovedadPersonal({ persona, tipo, fechaDesde: "2026-08-20", turno: "tarde" }).novedad };
    assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [cambio, bloqueante], persona, fecha: "2026-08-20", turno: "tarde" }).disponible, false);
  }
});

await probar("edita el único cambio activo en vez de duplicarlo", async () => {
  const existente = { id: "existente", ...crearCambio().novedad };
  const llamadas = [];
  const guardar = crearGuardadorCambioHorario({
    listar: async () => [existente],
    crear: async (novedad) => { llamadas.push(["crear", novedad]); return novedad; },
    actualizarContenido: async (id, contenido) => { llamadas.push(["actualizar", id, contenido]); return { ...existente, ...contenido }; }
  });
  const resultado = await guardar({ persona, fecha: "2026-08-20", turno: "tarde", horaEntrada: "11:30", horaSalida: "17:30" });
  assert.deepEqual(llamadas.map(([tipo]) => tipo), ["actualizar"]);
  assert.deepEqual(resultado.datos, { horaEntrada: "11:30", horaSalida: "17:30" });
});

await probar("alertas consumen la salida excepcional sin cambiar su regla", () => {
  const p1 = { ...persona, id: "p1", nombre: "Uno" };
  const p2 = { ...persona, id: "p2", nombre: "Dos" };
  const novedades = [p1, p2].map((actual, indice) => ({ id: `c${indice}`, ...crearCambio({ persona: actual }).novedad, personaId: actual.id, personaNombre: actual.nombre, datos: { horaEntrada: "11:30", horaSalida: "17:30" } }));
  const alertas = generarAlertasHorarios({
    enfermeros: [{ sectorId: "salud_mental", enfermero: p1 }, { sectorId: "salud_mental", enfermero: p2 }],
    personal: [p1, p2], novedades, fecha: "2026-08-20", turno: "tarde",
    configTurno: obtenerConfiguracionTurno("tarde")
  });
  assert.equal(alertas.length, 1);
  assert.match(alertas[0], /17:30/);
  assert.match(alertas[0], /Uno/);
  assert.match(alertas[0], /Dos/);
});

await probar("UI específica, histórico y alta genérica quedan acotados", () => {
  const novedades = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  const formulario = fs.readFileSync("src/components/novedades/FormularioCambioHorario.jsx", "utf8");
  assert.match(novedades, /Cambio de horario/);
  assert.match(novedades, /cambio_horario/);
  assert.match(formulario, /soloLectura/);
  assert.match(formulario, /Horario habitual/);
  assert.match(novedades, /TIPOS_NO_DISPONIBLES_PARA_ALTA[\s\S]*cambio_horario/);
});

console.log(`\n${aprobadas} pruebas de Cambio excepcional de horario aprobadas.`);
