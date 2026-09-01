import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearNovedadesLegacy,
  evaluarDisponibilidadPorNovedades,
  filtrarNovedadesPorTurnoActivo,
  obtenerTurnosEfectivosNovedad,
  TIPOS_NOVEDAD_PERSONAL
} from "../src/utils/novedadesPersonal.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const persona = { id: "persona-a", nombre: "Persona A", categoria: "enfermero" };
const padron = (mes, vigencias) => ({
  mes,
  porPersonaId: {
    "persona-a": { persona, personaId: "persona-a", vigencias }
  },
  personas: [{ persona, personaId: "persona-a", vigencias }]
});
const novedad = (tipo, fechaDesde, fechaHasta = fechaDesde, turno = "tarde") => ({
  id: `${tipo}:${fechaDesde}:${fechaHasta}`,
  personaId: "persona-a",
  personaNombre: "Persona A",
  tipo,
  fechaDesde,
  fechaHasta,
  turno,
  categoria: "enfermero",
  afectaDisponibilidad: [
    TIPOS_NOVEDAD_PERSONAL.SUSPENSION,
    TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO
  ].includes(tipo),
  estado: "activa"
});
const padronSeptiembre = padron("2026-09", [
  { personaId: "persona-a", mes: "2026-09", turno: "tarde", desde: "2026-09-01", hasta: "2026-09-14" },
  { personaId: "persona-a", mes: "2026-09", turno: "manana", desde: "2026-09-15", hasta: "2026-09-30" }
]);

probar("licencia anterior al cambio corresponde sólo al turno anterior", () => {
  const [licencia] = crearNovedadesLegacy({
    licencias: [{ id: "lic-1", personaId: "persona-a", nombre: "Persona A", desde: "2026-09-01", hasta: "2026-09-10", turnoOrigenEstado: "tarde" }],
    personal: [persona]
  });
  assert.deepEqual([...obtenerTurnosEfectivosNovedad({ novedad: licencia, padronVigencias: padronSeptiembre })], ["tarde"]);
});

probar("licencia posterior al cambio corresponde sólo al turno nuevo", () => {
  const [licencia] = crearNovedadesLegacy({
    licencias: [{ id: "lic-2", personaId: "persona-a", nombre: "Persona A", desde: "2026-09-16", hasta: "2026-09-20", turnoOrigenEstado: "tarde" }],
    personal: [persona]
  });
  assert.deepEqual([...obtenerTurnosEfectivosNovedad({ novedad: licencia, padronVigencias: padronSeptiembre })], ["manana"]);
  assert.equal(filtrarNovedadesPorTurnoActivo([licencia], "tarde", padronSeptiembre).length, 0);
  assert.equal(filtrarNovedadesPorTurnoActivo([licencia], "manana", padronSeptiembre).length, 1);
});

probar("licencia que atraviesa cambio aparece en ambos contextos sin duplicarse", () => {
  const [licencia] = crearNovedadesLegacy({
    licencias: [{ id: "lic-3", personaId: "persona-a", nombre: "Persona A", desde: "2026-09-10", hasta: "2026-09-20", turnoOrigenEstado: "tarde" }],
    personal: [persona]
  });
  assert.equal(filtrarNovedadesPorTurnoActivo([licencia], "tarde", padronSeptiembre)[0].id, licencia.id);
  assert.equal(filtrarNovedadesPorTurnoActivo([licencia], "manana", padronSeptiembre)[0].id, licencia.id);
});

probar("cambio entre meses conserva agosto en Tarde y septiembre en Mañana", () => {
  const registro = { ...novedad(TIPOS_NOVEDAD_PERSONAL.SUSPENSION, "2026-08-28", "2026-09-05") };
  const agosto = padron("2026-08", [{ personaId: "persona-a", mes: "2026-08", turno: "tarde", desde: "2026-08-01", hasta: "2026-08-31" }]);
  const septiembre = padron("2026-09", [{ personaId: "persona-a", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-30" }]);
  assert.deepEqual([...obtenerTurnosEfectivosNovedad({ novedad: registro, padronVigencias: agosto,
    fechaDesde: "2026-08-01", fechaHasta: "2026-08-31" })], ["tarde"]);
  assert.deepEqual([...obtenerTurnosEfectivosNovedad({ novedad: registro, padronVigencias: septiembre,
    fechaDesde: "2026-09-01", fechaHasta: "2026-09-30" })], ["manana"]);
});

for (const tipo of [
  TIPOS_NOVEDAD_PERSONAL.CERTIFICACION,
  TIPOS_NOVEDAD_PERSONAL.SUSPENSION,
  TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO,
  TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO,
  TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA
]) {
  probar(`${tipo} puntual usa el turno efectivo de su fecha`, () => {
    const registro = novedad(tipo, "2026-09-16", "2026-09-16", "tarde");
    assert.equal(filtrarNovedadesPorTurnoActivo([registro], "tarde", padronSeptiembre).length, 0);
    assert.equal(filtrarNovedadesPorTurnoActivo([registro], "manana", padronSeptiembre).length, 1);
  });
}

probar("Calendario nuevo excluye suspensión y turno anterior no la aplica", () => {
  const suspension = {
    ...novedad(TIPOS_NOVEDAD_PERSONAL.SUSPENSION, "2026-09-10", "2026-09-20"),
    afectaDisponibilidad: true
  };
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [suspension], persona,
    fecha: "2026-09-16", turno: "manana", padronVigencias: padronSeptiembre }).disponible, false);
  assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [suspension], persona,
    fecha: "2026-09-16", turno: "tarde", padronVigencias: padronSeptiembre }).disponible, true);
});

probar("Calendario aplica Licencia y Certificación legacy sólo en el turno efectivo", () => {
  const registros = crearNovedadesLegacy({
    licencias: [{ id: "lic-cal", personaId: "persona-a", nombre: "Persona A", desde: "2026-09-10", hasta: "2026-09-20", turnoOrigenEstado: "tarde" }],
    certificaciones: [{ id: "cert-cal", personaId: "persona-a", nombre: "Persona A", desde: "2026-09-10", hasta: "2026-09-20", turnoOrigenEstado: "tarde" }],
    personal: [persona]
  });
  for (const registro of registros) {
    assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [registro], persona,
      fecha: "2026-09-16", turno: "manana", padronVigencias: padronSeptiembre }).disponible, false);
    assert.equal(evaluarDisponibilidadPorNovedades({ novedades: [registro], persona,
      fecha: "2026-09-16", turno: "tarde", padronVigencias: padronSeptiembre }).disponible, true);
  }
});

probar("identidad y edición siguen apuntando al único registro original", () => {
  const [licencia] = crearNovedadesLegacy({
    licencias: [{ id: "lic-unica", personaId: "persona-a", nombre: "Nombre anterior", desde: "2026-09-10", hasta: "2026-09-20", turnoOrigenEstado: "tarde" }],
    personal: [persona]
  });
  assert.equal(licencia.personaId, "persona-a");
  assert.equal(licencia.registroOrigenId, "lic-unica");
  assert.equal(licencia.turnoOrigenEstado, "tarde");
});

probar("App consulta novedades modernas sin anclarlas al turno creado", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(app, /listarNovedadesPersonal\(\{[\s\S]*obtenerRangoMesNovedades\(mesActivo\)[\s\S]*\}\)/);
  assert.doesNotMatch(app, /listarNovedadesPersonal\(\{[\s\S]{0,160}turno:\s*turnoActivo/);
});

probar("la UI legacy refleja permisos del turno de origen sin debilitar la guarda real", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const novedades = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  assert.match(app, /puedeEditarRegistroLegacy=\{\(novedad\) => \{[\s\S]*turnoOrigenEstado[\s\S]*puedeMutarClaveMensual/);
  assert.match(novedades, /!soloLectura && puedeEditarRegistroLegacy\(novedad\)/);
  assert.match(app, /editarRegistroLegacyMes[\s\S]*puedeMutarClaveMensual\(\{ clave: claveOrigen, turnoId: turnoOrigen, mes: mesActivo \}\)/);
});

probar("cierres y snapshots no participan en la corrección", () => {
  const estado = fs.readFileSync("src/utils/cierreTurno.js", "utf8");
  assert.doesNotMatch(estado, /vigencia.*novedad|novedad.*vigencia/i);
});

console.log(`\n${total} pruebas de novedades por turno efectivo pasaron.`);
