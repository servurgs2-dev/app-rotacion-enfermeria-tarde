import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearNovedadPersonal,
  crearNovedadesLegacy,
  ESTADOS_NOVEDAD_PERSONAL,
  evaluarDisponibilidadPorNovedades,
  filtrarNovedadesPorTurnoActivo,
  novedadAfectaDisponibilidadEnFecha,
  obtenerNovedadesPersonaEnFecha,
  OPCIONES_TIPO_NOVEDAD,
  TIPOS_NOVEDAD_PERSONAL,
  validarNovedadPersonal
} from "../src/utils/novedadesPersonal.js";

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const persona = { id: "persona-1", nombre: "Ana Pérez", categoria: "enfermero" };
const base = {
  persona,
  tipo: TIPOS_NOVEDAD_PERSONAL.SUSPENSION,
  fechaDesde: "2026-08-10",
  fechaHasta: "2026-08-12",
  turno: "tarde",
  observacion: "Registro administrativo"
};

probar("el catálogo contempla los ocho tipos previstos", () => {
  assert.deepEqual(OPCIONES_TIPO_NOVEDAD.map((opcion) => opcion.valor), [
    "licencia", "certificacion", "suspension", "adhesion_paro",
    "olvido_tarjeta", "cambio_horario", "excedente", "otra"
  ]);
});

probar("crea una novedad con identidad estable y rango", () => {
  const { novedad, error } = crearNovedadPersonal(base);
  assert.equal(error, "");
  assert.equal(novedad.personaId, persona.id);
  assert.equal(novedad.fechaDesde, "2026-08-10");
  assert.equal(novedad.fechaHasta, "2026-08-12");
  assert.equal(novedad.afectaDisponibilidad, true);
});

probar("funcionario, tipo y fecha desde son obligatorios", () => {
  assert.match(crearNovedadPersonal({ ...base, persona: null }).error, /funcionario/i);
  assert.match(crearNovedadPersonal({ ...base, tipo: "" }).error, /tipo/i);
  assert.match(crearNovedadPersonal({ ...base, fechaDesde: "" }).error, /fecha desde/i);
});

probar("rechaza fecha hasta anterior y fechas inexistentes", () => {
  assert.match(crearNovedadPersonal({ ...base, fechaHasta: "2026-08-09" }).error, /anterior/i);
  assert.match(crearNovedadPersonal({ ...base, fechaDesde: "2026-02-30" }).error, /fecha desde/i);
});

probar("una novedad administrativa no afecta disponibilidad", () => {
  const { novedad } = crearNovedadPersonal({
    ...base,
    tipo: TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA
  });
  assert.equal(novedad.afectaDisponibilidad, false);
  assert.equal(novedad.estado, ESTADOS_NOVEDAD_PERSONAL.PENDIENTE);
  assert.equal(novedadAfectaDisponibilidadEnFecha(novedad, persona, "2026-08-11"), false);
});

probar("excedente y cambio de horario no son ausencias por defecto", () => {
  for (const tipo of [TIPOS_NOVEDAD_PERSONAL.EXCEDENTE, TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO]) {
    assert.equal(crearNovedadPersonal({ ...base, tipo }).novedad.afectaDisponibilidad, false);
  }
});

probar("afecta disponibilidad sólo dentro del rango y en estado activa", () => {
  const { novedad } = crearNovedadPersonal(base);
  assert.equal(novedadAfectaDisponibilidadEnFecha(novedad, persona, "2026-08-09"), false);
  assert.equal(novedadAfectaDisponibilidadEnFecha(novedad, persona, "2026-08-10"), true);
  assert.equal(novedadAfectaDisponibilidadEnFecha(novedad, persona, "2026-08-12"), true);
  assert.equal(novedadAfectaDisponibilidadEnFecha(novedad, persona, "2026-08-13"), false);
  assert.equal(novedadAfectaDisponibilidadEnFecha({ ...novedad, estado: "cancelada" }, persona, "2026-08-11"), false);
});

probar("la evaluación central devuelve novedades y bloqueantes por separado", () => {
  const ausencia = crearNovedadPersonal(base).novedad;
  const administrativa = crearNovedadPersonal({ ...base, tipo: "otra" }).novedad;
  const resultado = evaluarDisponibilidadPorNovedades({
    novedades: [ausencia, administrativa], persona, fecha: "2026-08-11", turno: "tarde"
  });
  assert.equal(resultado.disponible, false);
  assert.equal(resultado.novedades.length, 2);
  assert.deepEqual(resultado.bloqueantes, [ausencia]);
});

probar("Licencias y Certificaciones legacy se presentan sin mutar fuentes", () => {
  const licencias = [{ personaId: persona.id, nombre: persona.nombre, desde: "2026-08-01", hasta: "2026-08-03" }];
  const certificaciones = [{ personaId: persona.id, nombre: persona.nombre, desde: "2026-08-05", hasta: "2026-08-06" }];
  const copia = JSON.stringify({ licencias, certificaciones });
  const resultado = crearNovedadesLegacy({ licencias, certificaciones, personal: [persona] });
  assert.deepEqual(resultado.map((novedad) => novedad.tipo), ["licencia", "certificacion"]);
  assert.equal(resultado.every((novedad) => novedad.soloLectura && novedad.afectaDisponibilidad), true);
  assert.equal(JSON.stringify({ licencias, certificaciones }), copia);
});

probar("la consulta por persona y fecha integra fuentes sin migrarlas", () => {
  const licencia = { personaId: persona.id, nombre: persona.nombre, desde: "2026-08-10", hasta: "2026-08-12" };
  const resultado = obtenerNovedadesPersonaEnFecha({
    novedades: [], licencias: [licencia], certificaciones: [], personal: [persona],
    persona, fecha: "2026-08-11", turno: "tarde"
  });
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].origen, "licencias_legacy");
});

probar("el listado operativo queda limitado al turno activo y conserva legacy del estado", () => {
  const registros = [
    { id: "tarde", turno: "tarde", soloLectura: false },
    { id: "manana", turno: "manana", soloLectura: false },
    { id: "legacy", turno: null, soloLectura: true }
  ];
  assert.deepEqual(
    filtrarNovedadesPorTurnoActivo(registros, "tarde").map((registro) => registro.id),
    ["tarde", "legacy"]
  );
});

probar("valida turno, categoría, estado y JSON adicional", () => {
  const valida = crearNovedadPersonal(base).novedad;
  assert.equal(validarNovedadPersonal(valida), "");
  assert.match(validarNovedadPersonal({ ...valida, turno: "otro" }), /turno/i);
  assert.match(validarNovedadPersonal({ ...valida, categoria: "otra" }), /categoría/i);
  assert.match(validarNovedadPersonal({ ...valida, estado: "otro" }), /estado/i);
  assert.match(validarNovedadPersonal({ ...valida, datos: [] }), /adicionales/i);
});

probar("la migración crea constraints, índices y RLS sin tocar tablas legacy", () => {
  const sql = fs.readFileSync("supabase/migrations/20260816_crear_novedades_personal.sql", "utf8");
  assert.match(sql, /create table if not exists public\.novedades_personal/i);
  assert.match(sql, /afecta_disponibilidad boolean not null/i);
  assert.match(sql, /datos jsonb not null/i);
  assert.match(sql, /fecha_hasta >= fecha_desde/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /novedades_personal_persona_fechas_idx/i);
  assert.doesNotMatch(sql, /alter table public\.(estado_por_turno_mes|estado_por_mes)/i);
});

probar("Calendario consume la fuente mediante el evaluador central", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(calendario, /evaluarDisponibilidadPorNovedades/);
  assert.match(calendario, /excluirNoDisponiblesPorNovedadesDeAsignaciones/);
  assert.doesNotMatch(calendario, /tipo\s*===\s*["']suspension["']/);
});

console.log(`\n${total} pruebas del modelo base de Novedades pasaron.`);
