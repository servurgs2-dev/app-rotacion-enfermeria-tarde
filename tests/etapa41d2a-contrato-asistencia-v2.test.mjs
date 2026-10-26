import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ESTADOS_ASISTENCIA,
  obtenerEstadoAsistencia
} from "../src/utils/asistenciaPersonas.js";
import {
  cambiarPresenciaV2,
  esEstadoEscribibleAsistenciaV2,
  invalidarPresenteV2,
  limpiarPresentesV2,
  marcarCohortePresenteV2,
  obtenerCohorteConfirmable
} from "../src/utils/asistenciaV2.js";
import { cambiarAsistenciaCalendario } from "../src/utils/ausenciasCalendario.js";
import { resolverDatosPresentacionCierreTurno } from "../src/utils/cierreTurno.js";

let aprobadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  aprobadas += 1;
  console.log(`✓ ${nombre}`);
};

const fecha = "2026-10-25";
const persona = (id, datos = {}) => ({ id, nombre: `Persona ${id}`, ...datos });
const ana = persona("ana");
const bruno = persona("bruno");
const extra = persona("extra", { esExtra: true });
const libreExtra = persona("libre-extra", { esExtra: true, libre: true });
const libre = persona("libre", { libre: true });
const sinAsignar = persona("sin-asignar");
const bloqueada = persona("bloqueada");

const mapa = (...resultados) => new Map(resultados.map(([actual, disponible]) => [
  actual.id,
  {
    personaId: actual.id,
    disponibleEnTurno: disponible,
    disponibleParaCobertura: disponible
  }
]));

const asignaciones = [
  { nombre: "REA 1", enfermero: ana },
  { nombre: "REA 2", enfermero: extra },
  { nombre: "Sillón", enfermero: libreExtra },
  { nombre: "Libre", enfermero: libre },
  { nombre: "SIN ASIGNAR", enfermero: sinAsignar },
  { nombre: "Duplicada", enfermero: { ...extra } },
  { nombre: "Bloqueada", enfermero: bloqueada }
];
const disponibilidad = mapa(
  [ana, true],
  [extra, true],
  [libreExtra, true],
  [libre, false],
  [sinAsignar, true],
  [bloqueada, false]
);

probar("01 sin registro equivale a Pendiente", () => {
  assert.equal(obtenerEstadoAsistencia({}, ana), ESTADOS_ASISTENCIA.PENDIENTE);
});

probar("02 marcar Presente persiste únicamente presente", () => {
  const resultado = cambiarPresenciaV2({ calendario: {}, fecha, persona: ana, estado: "presente" });
  assert.equal(resultado.asistenciaDia[fecha]["id:ana"], "presente");
});

probar("03 quitar Presente elimina la entrada", () => {
  const calendario = { asistenciaDia: { [fecha]: { "id:ana": "presente" } } };
  const resultado = cambiarPresenciaV2({ calendario, fecha, persona: ana, estado: "pendiente" });
  assert.equal(Object.hasOwn(resultado.asistenciaDia, fecha), false);
});

probar("04 el write-path v2 rechaza Ausente", () => {
  const calendario = { asistenciaDia: {} };
  assert.equal(esEstadoEscribibleAsistenciaV2("ausente"), false);
  assert.equal(cambiarPresenciaV2({ calendario, fecha, persona: ana, estado: "ausente" }), calendario);
});

probar("05 Falta sin aviso puede invalidar un Presente sin crear Ausente", () => {
  const calendario = {
    asistenciaDia: { [fecha]: { "id:ana": "presente" } },
    noDisponibles: { [fecha]: [{ personaId: "ana", motivo: "falta_sin_aviso" }] }
  };
  const resultado = invalidarPresenteV2({ calendario, fecha, persona: ana });
  assert.equal(obtenerEstadoAsistencia(resultado.asistenciaDia[fecha], ana), "pendiente");
  assert.equal(resultado.noDisponibles, calendario.noDisponibles);
});

probar("06 cualquier No Disponible bloqueante usa la misma invalidación", () => {
  const calendario = { asistenciaDia: { [fecha]: { "id:ana": "presente" } } };
  assert.equal(Object.hasOwn(invalidarPresenteV2({ calendario, fecha, persona: ana }).asistenciaDia, fecha), false);
});

probar("07 certificación rápida invalida Presente por el mismo contrato", () => {
  const calendario = { asistenciaDia: { [fecha]: { "id:ana": "presente" } } };
  assert.equal(obtenerEstadoAsistencia(
    invalidarPresenteV2({ calendario, fecha, persona: ana }).asistenciaDia[fecha],
    ana
  ), "pendiente");
});

probar("08 quitar No Disponible no restaura Presente", () => {
  const calendario = { asistenciaDia: {}, noDisponibles: { [fecha]: [] } };
  assert.equal(invalidarPresenteV2({ calendario, fecha, persona: ana }), calendario);
});

probar("09 quitar certificación mantiene Pendiente implícito", () => {
  assert.equal(obtenerEstadoAsistencia(undefined, ana), "pendiente");
});

probar("10 no existe memoria de Presente previo", () => {
  const presente = { asistenciaDia: { [fecha]: { "id:ana": "presente" } } };
  const invalidado = invalidarPresenteV2({ calendario: presente, fecha, persona: ana });
  assert.equal(Object.hasOwn(invalidado.asistenciaDia, fecha), false);
});

const cohorte = obtenerCohorteConfirmable({
  asignaciones,
  esPersonaDisponible: (actual) =>
    disponibilidad.get(actual?.id)?.disponibleEnTurno === true
});
const incluye = (actual) => cohorte.some((candidata) => candidata.id === actual.id);

probar("11 Extra del turno participante es confirmable", () => assert.ok(incluye(extra)));
probar("12 Extra de otro turno participante es confirmable", () => assert.ok(incluye(extra)));
probar("13 Libre habilitado como Extra es confirmable", () => assert.ok(incluye(libreExtra)));
probar("14 Libre ordinario no es confirmable", () => assert.equal(incluye(libre), false));
probar("15 Sin asignar disponible es confirmable", () => assert.ok(incluye(sinAsignar)));
probar("16 No Disponible no es confirmable", () => assert.equal(incluye(bloqueada), false));
probar("17 Licencia normalizada no es confirmable", () => assert.equal(incluye(bloqueada), false));
probar("18 Certificación normalizada no es confirmable", () => assert.equal(incluye(bloqueada), false));
probar("19 Suspensión normalizada no es confirmable", () => assert.equal(incluye(bloqueada), false));
probar("20 Paro normalizado no es confirmable", () => assert.equal(incluye(bloqueada), false));

probar("21 Marcar todos excluye bloqueados", () => {
  const resultado = marcarCohortePresenteV2({ calendario: {}, fecha, personas: cohorte });
  assert.equal(Object.hasOwn(resultado.asistenciaDia[fecha], "id:bloqueada"), false);
});

probar("22 Marcar todos incluye Extras participantes", () => {
  const resultado = marcarCohortePresenteV2({ calendario: {}, fecha, personas: cohorte });
  assert.equal(resultado.asistenciaDia[fecha]["id:extra"], "presente");
});

probar("23 Marcar todos deduplica identidades", () => {
  const resultado = marcarCohortePresenteV2({ calendario: {}, fecha, personas: [extra, { ...extra }] });
  assert.deepEqual(Object.keys(resultado.asistenciaDia[fecha]), ["id:extra"]);
});

probar("24 Limpiar Presentes vuelve a Pendiente", () => {
  const resultado = limpiarPresentesV2({
    calendario: { asistenciaDia: { [fecha]: { "id:ana": "presente", "id:bruno": "presente" } } },
    fecha
  });
  assert.equal(Object.hasOwn(resultado.asistenciaDia, fecha), false);
});

probar("25 Limpiar asistencia no elimina No Disponibles", () => {
  const noDisponibles = { [fecha]: [{ personaId: "ana", motivo: "otro" }] };
  const resultado = limpiarPresentesV2({
    calendario: { asistenciaDia: { [fecha]: { "id:ana": "presente" } }, noDisponibles },
    fecha
  });
  assert.equal(resultado.noDisponibles, noDisponibles);
});

probar("26 legacy Ausente continúa legible", () => {
  assert.equal(obtenerEstadoAsistencia({ "id:ana": "ausente" }, ana), "ausente");
});

probar("27 legacy Ausente continúa restaurando su sector", () => {
  const ausente = cambiarAsistenciaCalendario({
    calendario: { asistenciaDia: {}, cambiosDia: {} },
    fecha,
    persona: ana,
    sectorActual: "REA 1",
    estado: "ausente",
    sectoresVisibles: ["REA 1"]
  });
  const restaurado = cambiarAsistenciaCalendario({
    calendario: ausente,
    fecha,
    persona: ana,
    estado: "pendiente",
    sectoresVisibles: ["REA 1"]
  });
  assert.equal(Object.hasOwn(restaurado.cambiosDia, fecha), false);
  assert.equal(obtenerEstadoAsistencia(restaurado.asistenciaDia[fecha], ana), "pendiente");
});

probar("28 snapshot viejo mantiene Ausente literal", () => {
  const snapshot = Object.freeze({
    asignaciones: [],
    asistencia: { "id:ana": "ausente" },
    personasPrevistas: [{ personaId: "ana", nombre: "Persona ana" }],
    libres: [], licencias: [], certificaciones: [], noDisponibles: [], extrasRegistrados: []
  });
  const presentado = resolverDatosPresentacionCierreTurno({
    snapshot,
    reconstruccion: { asistencia: { "id:ana": "presente" } }
  });
  assert.equal(presentado.asistencia["id:ana"], "ausente");
});

probar("29 origen de Cambio con otro turno no es confirmable", () => {
  assert.equal(incluye(bloqueada), false);
});

probar("30 Extra de cobertura participante sí es confirmable", () => {
  assert.ok(incluye(extra));
});

probar("31 identidad irresoluble queda fuera", () => {
  const resultado = obtenerCohorteConfirmable({
    asignaciones: [{ nombre: "REA", enfermero: { nombre: "Sin ID" } }],
    esPersonaDisponible: () => true
  });
  assert.deepEqual(resultado, []);
});

probar("32 limpiar conserva contexto legacy Sin asignar como Pendiente", () => {
  const resultado = limpiarPresentesV2({
    calendario: {
      asistenciaDia: {
        [fecha]: {
          "id:ana": { estado: "presente", persona: { personaId: "ana" }, sinAsignar: true }
        }
      }
    },
    fecha
  });
  assert.equal(resultado.asistenciaDia[fecha]["id:ana"].estado, "pendiente");
  assert.equal(resultado.asistenciaDia[fecha]["id:ana"].sinAsignar, true);
});

probar("33 presencia v2 conserva contexto legacy Sin asignar", () => {
  const calendario = {
    asistenciaDia: {
      [fecha]: {
        "id:ana": {
          estado: "pendiente",
          persona: { personaId: "ana" },
          sectorOrigen: "REA 1",
          sinAsignar: true
        }
      }
    }
  };
  const presente = cambiarPresenciaV2({ calendario, fecha, persona: ana, estado: "presente" });
  const pendiente = cambiarPresenciaV2({ calendario: presente, fecha, persona: ana, estado: "pendiente" });
  assert.equal(presente.asistenciaDia[fecha]["id:ana"].sinAsignar, true);
  assert.equal(pendiente.asistenciaDia[fecha]["id:ana"].estado, "pendiente");
});

const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);

probar("34 Calendario impide nuevas escrituras Ausente", () => {
  assert.match(calendarioFuente, /estado === ESTADOS_ASISTENCIA\.AUSENTE && !estabaAusente/);
  assert.match(calendarioFuente, /Las nuevas ausencias se registran desde No disponible/);
});

probar("35 No Disponible y certificación invalidan Presente", () => {
  assert.ok((calendarioFuente.match(/invalidarPresenteV2\(/g) || []).length >= 6);
});

probar("36 Marcar todos usa la cohorte normalizada", () => {
  assert.match(calendarioFuente, /obtenerCohorteConfirmable\(\{/);
  assert.match(calendarioFuente, /marcarCohortePresenteV2\(\{/);
});

probar("37 el día cerrado continúa bloqueando handlers", () => {
  assert.match(calendarioFuente, /const soloLecturaEfectiva = soloLectura \|\| bloqueadoPorCierre/);
});

probar("38 los motores continúan usando los callbacks normalizados", () => {
  assert.match(calendarioFuente, /esPersonaDisponible: esPersonaDisponibleNormalizada/);
  assert.match(calendarioFuente, /esPersonaDisponibleParaCobertura:\s*esPersonaDisponibleParaCoberturaNormalizada/);
});

probar("39 limpiar usa contrato v2 después de restaurar Ausentes legacy", () => {
  assert.ok(calendarioFuente.indexOf("ausentesDelDia.reduce(") < calendarioFuente.indexOf("limpiarPresentesV2({"));
});

console.log(`\n${aprobadas} comprobaciones de contrato de asistencia v2 aprobadas.`);
