import assert from "node:assert/strict";
import fs from "node:fs";
import {
  cambiarAsistenciaCalendario,
  filtrarAsignacionesAusentes,
  obtenerAusentesDelDia,
  obtenerPersonasParaSinAsignar,
  prepararCambioAsistencia,
  quitarPersonasDeSinAsignar
} from "../src/utils/ausenciasCalendario.js";
import {
  ESTADOS_ASISTENCIA,
  obtenerEstadoAsistencia
} from "../src/utils/asistenciaPersonas.js";
import {
  redistribuirCritica,
  redistribuirPorBoxes
} from "../src/utils/redistribucionEnfermeros.js";
import { configuracionSectores } from "../src/data/sectores.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const personaA = {
  id: "p1",
  nombre: "Persona A",
  categoria: "enfermero",
  horario: "normal"
};
const personaB = {
  id: "p2",
  nombre: "Persona B",
  categoria: "enfermero",
  horario: "entraAntes"
};
const fecha = "2026-08-04";
const calendarioBase = {
  cambiosDia: {
    "2026-08-05": { rea1: { personaId: "p2", nombre: "Persona B" } }
  },
  asistenciaDia: {},
  extras: { [fecha]: [{ id: "extra-1", nombre: "Extra A" }] },
  noDisponibles: { [fecha]: [{ personaId: "p9", nombre: "Persona 9" }] }
};

const ausente = cambiarAsistenciaCalendario({
  calendario: calendarioBase,
  fecha,
  persona: personaA,
  sectorActual: "REA 1",
  estado: ESTADOS_ASISTENCIA.AUSENTE,
  sectoresVisibles: ["REA 1", "REA 2"]
});

probar("1 marcar Ausente libera únicamente su sector", () => {
  assert.equal(ausente.cambiosDia[fecha]["REA 1"], "__EMPTY__");
  assert.deepEqual(ausente.cambiosDia["2026-08-05"], calendarioBase.cambiosDia["2026-08-05"]);
});
probar("2 el registro conserva estado y sector anterior", () => {
  assert.equal(obtenerEstadoAsistencia(ausente.asistenciaDia[fecha], personaA), "ausente");
  assert.equal(ausente.asistenciaDia[fecha]["id:p1"].sectorOrigen, "REA 1");
});
probar("3 no modifica otro sector ni redistribuye", () => {
  assert.deepEqual(Object.keys(ausente.cambiosDia[fecha]), ["REA 1"]);
});
probar("4 la tarjeta obtiene persona, categoría y horario", () => {
  const lista = obtenerAusentesDelDia({
    registros: ausente.asistenciaDia[fecha],
    personal: [personaA, personaB]
  });
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nombre, "Persona A");
  assert.equal(lista[0].sectorOrigen, "REA 1");
  assert.equal(lista[0].categoria, "enfermero");
  assert.equal(lista[0].horario, "normal");
});
probar("5 formato histórico string sigue siendo legible", () => {
  assert.equal(
    obtenerEstadoAsistencia({ "id:p1": "ausente" }, personaA),
    ESTADOS_ASISTENCIA.AUSENTE
  );
  assert.equal(
    obtenerAusentesDelDia({
      registros: { "id:p1": "ausente" },
      personal: [personaA]
    })[0].nombre,
    "Persona A"
  );
});

const restaurado = cambiarAsistenciaCalendario({
  calendario: ausente,
  fecha,
  persona: personaA,
  sectorActual: "",
  estado: ESTADOS_ASISTENCIA.PRESENTE,
  sectoresVisibles: ["REA 1", "REA 2"]
});
probar("6 volver Presente restaura el sector libre", () => {
  assert.equal(Object.hasOwn(restaurado.cambiosDia, fecha), false);
  assert.equal(obtenerEstadoAsistencia(restaurado.asistenciaDia[fecha], personaA), "presente");
});
probar("7 volver Pendiente restaura con el mismo criterio", () => {
  const pendiente = cambiarAsistenciaCalendario({
    calendario: ausente,
    fecha,
    persona: personaA,
    estado: ESTADOS_ASISTENCIA.PENDIENTE,
    sectoresVisibles: ["REA 1", "REA 2"]
  });
  assert.equal(Object.hasOwn(pendiente.cambiosDia, fecha), false);
  assert.equal(obtenerEstadoAsistencia(pendiente.asistenciaDia[fecha], personaA), "pendiente");
});

const cubierto = {
  ...ausente,
  cambiosDia: {
    ...ausente.cambiosDia,
    [fecha]: { "REA 1": { personaId: "p2", nombre: "Persona B" } }
  }
};
const regresoSinAsignar = cambiarAsistenciaCalendario({
  calendario: cubierto,
  fecha,
  persona: personaA,
  estado: ESTADOS_ASISTENCIA.PRESENTE,
  sectoresVisibles: ["REA 1", "REA 2"]
});
probar("8 sector cubierto no desplaza a quien lo ocupa", () => {
  assert.deepEqual(regresoSinAsignar.cambiosDia[fecha]["REA 1"], {
    personaId: "p2",
    nombre: "Persona B"
  });
});
probar("9 persona que vuelve queda disponible en Sin asignar", () => {
  assert.deepEqual(
    obtenerPersonasParaSinAsignar({
      registros: regresoSinAsignar.asistenciaDia[fecha],
      personal: [personaA, personaB]
    }).map((persona) => persona.id),
    ["p1"]
  );
});
probar("10 sector inexistente también envía a Sin asignar", () => {
  const resultado = cambiarAsistenciaCalendario({
    calendario: ausente,
    fecha,
    persona: personaA,
    estado: ESTADOS_ASISTENCIA.PRESENTE,
    sectoresVisibles: ["REA 2"]
  });
  assert.equal(resultado.asistenciaDia[fecha]["id:p1"].sinAsignar, true);
});

const pendienteSinAsignar = cambiarAsistenciaCalendario({
  calendario: regresoSinAsignar,
  fecha,
  persona: personaA,
  sectorActual: "SIN ASIGNAR",
  estado: ESTADOS_ASISTENCIA.PENDIENTE,
  sectoresVisibles: ["REA 1", "REA 2", "SIN ASIGNAR"]
});
probar("11 Presente a Pendiente conserva el contexto Sin asignar", () => {
  const registro = pendienteSinAsignar.asistenciaDia[fecha]["id:p1"];
  assert.equal(registro.estado, ESTADOS_ASISTENCIA.PENDIENTE);
  assert.equal(registro.sinAsignar, true);
  assert.equal(registro.sectorOrigen, "REA 1");
  assert.deepEqual(registro.persona, { personaId: "p1", nombre: "Persona A" });
  assert.deepEqual(
    obtenerPersonasParaSinAsignar({
      registros: pendienteSinAsignar.asistenciaDia[fecha],
      personal: [personaA, personaB]
    }).map((persona) => persona.id),
    ["p1"]
  );
});

const presenteOtraVez = cambiarAsistenciaCalendario({
  calendario: pendienteSinAsignar,
  fecha,
  persona: personaA,
  sectorActual: "SIN ASIGNAR",
  estado: ESTADOS_ASISTENCIA.PRESENTE,
  sectoresVisibles: ["REA 1", "REA 2", "SIN ASIGNAR"]
});
probar("12 Pendiente a Presente permanece Sin asignar sin desplazar cobertura", () => {
  assert.equal(
    presenteOtraVez.asistenciaDia[fecha]["id:p1"].estado,
    ESTADOS_ASISTENCIA.PRESENTE
  );
  assert.equal(presenteOtraVez.asistenciaDia[fecha]["id:p1"].sinAsignar, true);
  assert.deepEqual(presenteOtraVez.cambiosDia[fecha]["REA 1"], {
    personaId: "p2",
    nombre: "Persona B"
  });
  assert.deepEqual(
    presenteOtraVez.cambiosDia["2026-08-05"],
    calendarioBase.cambiosDia["2026-08-05"]
  );
});

const ausenteDesdeSinAsignar = cambiarAsistenciaCalendario({
  calendario: presenteOtraVez,
  fecha,
  persona: personaA,
  sectorActual: "SIN ASIGNAR",
  estado: ESTADOS_ASISTENCIA.AUSENTE,
  sectoresVisibles: ["REA 1", "REA 2", "SIN ASIGNAR"]
});
probar("13 Ausente desde Sin asignar conserva el sector real y no vacía la fila virtual", () => {
  const registro = ausenteDesdeSinAsignar.asistenciaDia[fecha]["id:p1"];
  assert.equal(registro.estado, ESTADOS_ASISTENCIA.AUSENTE);
  assert.equal(registro.sectorOrigen, "REA 1");
  assert.equal(registro.sinAsignar, undefined);
  assert.equal(
    Object.hasOwn(ausenteDesdeSinAsignar.cambiosDia[fecha], "SIN ASIGNAR"),
    false
  );
  assert.equal(
    obtenerPersonasParaSinAsignar({
      registros: ausenteDesdeSinAsignar.asistenciaDia[fecha],
      personal: [personaA, personaB]
    }).length,
    0
  );
  assert.equal(
    obtenerAusentesDelDia({
      registros: ausenteDesdeSinAsignar.asistenciaDia[fecha],
      personal: [personaA, personaB]
    })[0].nombre,
    "Persona A"
  );
});

probar("14 mover manualmente quita Sin asignar sin duplicar ni perder estado", () => {
  const asistenciaDia = quitarPersonasDeSinAsignar({
    asistenciaDia: pendienteSinAsignar.asistenciaDia,
    fecha,
    personas: [personaA]
  });
  const registro = asistenciaDia[fecha]["id:p1"];
  assert.equal(registro.sinAsignar, undefined);
  assert.equal(registro.estado, ESTADOS_ASISTENCIA.PENDIENTE);
  assert.equal(
    obtenerPersonasParaSinAsignar({
      registros: asistenciaDia[fecha],
      personal: [personaA, personaB]
    }).length,
    0
  );
  assert.equal(Object.keys(asistenciaDia[fecha]).length, 1);
});

probar("15 el ciclo Sin asignar conserva contexto también en Licenciados", () => {
  const licenciado = { ...personaA, id: "l1", categoria: "licenciado" };
  const ausenciaLicenciado = cambiarAsistenciaCalendario({
    calendario: calendarioBase,
    fecha,
    persona: licenciado,
    sectorActual: "Salud Mental",
    estado: ESTADOS_ASISTENCIA.AUSENTE,
    sectoresVisibles: ["Salud Mental"]
  });
  const cubiertoLicenciado = {
    ...ausenciaLicenciado,
    cambiosDia: {
      ...ausenciaLicenciado.cambiosDia,
      [fecha]: {
        ...ausenciaLicenciado.cambiosDia[fecha],
        "SALUD MENTAL": { personaId: "l2", nombre: "Persona B" }
      }
    }
  };
  const presenteLicenciado = cambiarAsistenciaCalendario({
    calendario: cubiertoLicenciado,
    fecha,
    persona: licenciado,
    estado: ESTADOS_ASISTENCIA.PRESENTE,
    sectoresVisibles: ["Salud Mental"]
  });
  const pendienteLicenciado = cambiarAsistenciaCalendario({
    calendario: presenteLicenciado,
    fecha,
    persona: licenciado,
    sectorActual: "SIN ASIGNAR",
    estado: ESTADOS_ASISTENCIA.PENDIENTE,
    sectoresVisibles: ["Salud Mental", "SIN ASIGNAR"]
  });
  assert.equal(pendienteLicenciado.asistenciaDia[fecha]["id:l1"].sinAsignar, true);
  assert.equal(
    pendienteLicenciado.asistenciaDia[fecha]["id:l1"].sectorOrigen,
    "Salud Mental"
  );
});
probar("11 extras y no disponibles permanecen intactos", () => {
  assert.equal(ausente.extras, calendarioBase.extras);
  assert.equal(ausente.noDisponibles, calendarioBase.noDisponibles);
});
probar("12 las entradas no se mutan", () => {
  assert.equal(Object.hasOwn(calendarioBase.cambiosDia, fecha), false);
  assert.deepEqual(calendarioBase.asistenciaDia, {});
});

const asignacionesAntesDeAusencia = [
  { nombre: "REA 1", enfermero: personaA },
  { nombre: "SILLÓN 1", enfermero: personaB },
  { nombre: "REA 2", enfermero: null }
];
probar("13 el flujo diario excluye al ausente antes de ambas redistribuciones", () => {
  const config = configuracionSectores.enfermero;
  const calendarioConAusencia = cambiarAsistenciaCalendario({
    calendario: calendarioBase,
    fecha,
    persona: personaA,
    sectorActual: "REA 1",
    estado: ESTADOS_ASISTENCIA.AUSENTE,
    sectoresVisibles: asignacionesAntesDeAusencia.map((fila) => fila.nombre)
  });
  const asignacionesDisponibles = filtrarAsignacionesAusentes({
    asignaciones: asignacionesAntesDeAusencia,
    registros: calendarioConAusencia.asistenciaDia[fecha]
  });
  assert.equal(
    asignacionesDisponibles.some((fila) => fila.enfermero?.id === personaA.id),
    false
  );
  for (const resultado of [
    redistribuirCritica({
      asignaciones: asignacionesDisponibles,
      ordenVisual: config.ordenVisual
    }),
    redistribuirPorBoxes({
      asignaciones: asignacionesDisponibles,
      ordenVisual: config.ordenVisual
    })
  ]) {
    assert.equal(
      resultado.asignaciones.some((fila) => fila.enfermero?.id === personaA.id),
      false
    );
  }
});

const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
probar("14 Calendario excluye ausentes de disponibilidad y movimientos", () => {
  assert.match(
    calendarioFuente,
    /obtenerEstadoAsistencia\(asistenciaFecha, e\) === ESTADOS_ASISTENCIA\.AUSENTE/
  );
  assert.match(calendarioFuente, /if \(estaAusente\(item\.enfermero\)\) return/);
});
probar("15 el sector permanece visible con señal de ausencia", () => {
  assert.match(calendarioFuente, /Sin asignar — ausencia/);
  assert.match(calendarioFuente, /sectorLiberadoPorAusencia/);
});
probar("16 existe la tarjeta responsive Ausentes del día", () => {
  assert.match(calendarioFuente, />\s*Ausentes del día\s*</);
  assert.match(calendarioFuente, /sm:grid-cols-2/);
});
probar("17 funciona para Enfermeros y Licenciados sin condicionar categoría", () => {
  const licenciado = { ...personaA, id: "l1", categoria: "licenciado" };
  const resultado = cambiarAsistenciaCalendario({
    calendario: calendarioBase,
    fecha,
    persona: licenciado,
    sectorActual: "Triage 1",
    estado: ESTADOS_ASISTENCIA.AUSENTE,
    sectoresVisibles: ["Triage 1"]
  });
  assert.equal(resultado.cambiosDia[fecha]["TRIAGE 1"], "__EMPTY__");
});
probar("18 solo lectura bloquea selector y transición", () => {
  assert.match(calendarioFuente, /disabled=\{soloLecturaEfectiva/);
  assert.match(calendarioFuente, /if \(soloLecturaEfectiva\) return/);
});
probar("19 utiliza una sola actualización funcional", () => {
  const inicio = calendarioFuente.indexOf("const cambiarAsistencia =");
  const fin = calendarioFuente.indexOf("const marcarTodosPresentes", inicio);
  const bloque = calendarioFuente.slice(inicio, fin);
  assert.equal((bloque.match(/setCalendario\(/g) || []).length, 1);
  assert.match(bloque, /setCalendario\(\(prev\) =>/);
});
probar("20 no modifica Planilla, Personal ni otras categorías", () => {
  const helper = fs.readFileSync(
    new URL("../src/utils/ausenciasCalendario.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(helper, /setPlanilla|setPersonal|Supabase|\.rpc\(/);
});
probar("21 contexto cambiado no sobrescribe ni informa una modificación", () => {
  const calendarioNuevo = { asistenciaDia: { otra: {} }, cambiosDia: {} };
  const resultado = prepararCambioAsistencia({
    calendarioActual: calendarioNuevo,
    calendarioEsperado: calendarioBase,
    fecha,
    persona: personaA,
    sectorActual: "REA 1",
    estado: ESTADOS_ASISTENCIA.AUSENTE
  });
  assert.equal(resultado.tipo, "contexto_cambiado");
  assert.equal(resultado.calendario, calendarioNuevo);
  assert.equal(
    resultado.mensaje,
    "El calendario cambió. Revisá nuevamente la asistencia."
  );
  assert.equal(Object.hasOwn(resultado, "estadoModificado"), false);
  assert.match(calendarioFuente, /setErrorAsistencia\(resultado\.mensaje\)/);
});
probar("22 datos históricos de paro permanecen separados", () => {
  assert.match(calendarioFuente, /cambiosParoDia/);
  assert.doesNotMatch(
    fs.readFileSync(new URL("../src/utils/ausenciasCalendario.js", import.meta.url), "utf8"),
    /cambiosParoDia|diasParo/
  );
});

console.log(`\n${total} pruebas de ausencias pasaron.`);
