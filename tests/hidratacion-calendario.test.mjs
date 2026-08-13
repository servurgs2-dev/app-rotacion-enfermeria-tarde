import assert from "node:assert/strict";
import fs from "node:fs";
import {
  estaCertificado,
  keyDiaFromDate,
  parsearFechaLocal
} from "../src/utils/fechas.js";
import {
  crearEstadoMensualVacio,
  normalizarEstadoMensual
} from "../src/utils/estadoMensual.js";
import { construirAsignacionesDiariasCalendario } from "../src/utils/pipelineCalendarioDiario.js";
import {
  crearRegistroNoDisponible,
  excluirAusenciasOperativasNoDisponiblesDeAsignaciones,
  MOTIVOS_NO_DISPONIBLE
} from "../src/utils/noDisponiblesMotivos.js";
import {
  obtenerSectoresVisiblesBoxes,
  obtenerSectoresVisiblesOpcion1,
  recalcularRedistribucionOpcion1Automatica,
  recalcularRedistribucionOpcion2Automatica,
  redistribuirCritica,
  redistribuirPorBoxes
} from "../src/utils/redistribucionEnfermeros.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { normalizar } from "../src/utils/texto.js";

let ejecutadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  ejecutadas += 1;
  console.log(`✓ ${nombre}`);
};

const fecha = parsearFechaLocal("2026-08-01");
const persona = {
  id: "persona-milton",
  nombre: "Milton",
  categoria: "enfermero",
  libre: 5
};
const rosa = {
  id: "extra-rosa",
  nombre: "Rosa",
  categoria: "enfermero",
  temporal: true,
  esExtra: true
};
const certificada = {
  id: "persona-certificada",
  nombre: "Persona certificada",
  categoria: "enfermero",
  libre: 4
};

const inicial = crearEstadoMensualVacio();
const hidratado = normalizarEstadoMensual({
  ...inicial,
  personal: [persona, certificada],
  planillas: {
    ...inicial.planillas,
    enfermeros: {
      ...inicial.planillas.enfermeros,
      semana1: {
        "EXPLORA 1": { personaId: persona.id, nombre: persona.nombre },
        "REA 1": { personaId: certificada.id, nombre: certificada.nombre }
      }
    }
  },
  certificaciones: [{
    id: "certificacion-dia",
    personaId: certificada.id,
    nombre: certificada.nombre,
    categoria: "enfermero",
    desde: "2026-08-01",
    hasta: "2026-08-01",
    origen: "no_disponibles_dia"
  }],
  calendario: {
    ...inicial.calendario,
    enfermeros: {
      cambiosDia: {
        "2026-08-01": {
          "EXPLORA 1": { personaId: rosa.id, nombre: rosa.nombre }
        }
      },
      cambiosParoDia: {},
      noDisponibles: {
        "2026-08-01": [{
          personaId: "persona-no-disponible",
          nombre: "No disponible",
          motivo: "falta_con_aviso"
        }]
      },
      extras: {
        "2026-08-01": [{
          ...rosa,
          tipoExtra: "cobertura",
          personaCubiertaId: persona.id,
          personaCubiertaNombre: persona.nombre,
          sectorCubiertoNombre: "EXPLORA 1"
        }]
      },
      asistenciaDia: {
        "2026-08-01": {
          [persona.id]: {
            estado: "presente",
            persona: { personaId: persona.id, nombre: persona.nombre }
          }
        }
      },
      cierresDia: {}
    }
  }
});

const idaYVuelta = (estado) => normalizarEstadoMensual(
  JSON.parse(JSON.stringify(normalizarEstadoMensual(estado)))
);

probar("el estado inicial está vacío para la misma fecha", () => {
  assert.deepEqual(inicial.calendario.enfermeros.cambiosDia, {});
  assert.deepEqual(inicial.calendario.enfermeros.procedenciaCambiosDia, {});
  assert.deepEqual(inicial.calendario.licenciados.procedenciaCambiosDia, {});
  assert.equal(keyDiaFromDate(fecha), "2026-08-01");
});

probar("estado legacy sin procedencia queda protegido y no infiere automatización", () => {
  const legacy = crearEstadoMensualVacio();
  delete legacy.calendario.enfermeros.procedenciaCambiosDia;
  legacy.calendario.enfermeros.cambiosDia = {
    "2026-08-02": { "11-18": "__EMPTY__" }
  };
  const resultado = normalizarEstadoMensual(legacy);
  assert.deepEqual(resultado.calendario.enfermeros.procedenciaCambiosDia, {});
  const asignaciones = [{ nombre: "11–18", enfermero: null, vacioManual: true }];
  assert.deepEqual(
    recalcularRedistribucionOpcion1Automatica({
      asignaciones,
      cambiosDia: resultado.calendario.enfermeros.cambiosDia["2026-08-02"],
      procedenciaCambiosDia: resultado.calendario.enfermeros.procedenciaCambiosDia["2026-08-02"]
    }),
    asignaciones
  );
});

probar("procedencia valida claves y conserva valores desconocidos sin reinterpretarlos", () => {
  const estado = crearEstadoMensualVacio();
  estado.calendario.enfermeros.procedenciaCambiosDia = {
    "2026-08-03": {
      " 11–18 ": "redistribucion_automatica",
      " rea 1 ": "valor_legacy_desconocido",
      "   ": "ignorar"
    },
    invalida: [],
    nula: null
  };
  assert.deepEqual(
    normalizarEstadoMensual(estado).calendario.enfermeros.procedenciaCambiosDia,
    {
      "2026-08-03": {
        [normalizar("11–18")]: "redistribucion_automatica",
        [normalizar("REA 1")]: "valor_legacy_desconocido"
      }
    }
  );
});

probar("ida y vuelta JSON conserva cambios y procedencias por fecha y categoría", () => {
  const estado = crearEstadoMensualVacio();
  estado.calendario.enfermeros.cambiosDia = {
    "2026-08-04": { [normalizar("11–18")]: "__EMPTY__", [normalizar("REA 1")]: "__EMPTY__" },
    "2026-08-05": { [normalizar("8–14")]: "__EMPTY__" },
    "2026-08-06": { [normalizar("REA 2")]: "__EMPTY__" }
  };
  estado.calendario.enfermeros.procedenciaCambiosDia = {
    "2026-08-04": {
      [normalizar("11–18")]: "redistribucion_automatica",
      [normalizar("REA 1")]: "redistribucion_automatica"
    },
    "2026-08-05": { [normalizar("8–14")]: "redistribucion_automatica" }
  };
  estado.calendario.licenciados.cambiosDia = {
    "2026-08-04": { REANIMACION: "__EMPTY__" }
  };
  estado.calendario.licenciados.procedenciaCambiosDia = {
    "2026-08-04": { REANIMACION: "valor_legacy_desconocido" }
  };
  const resultado = idaYVuelta(estado);
  assert.deepEqual(resultado.calendario.enfermeros.cambiosDia, estado.calendario.enfermeros.cambiosDia);
  assert.deepEqual(resultado.calendario.enfermeros.procedenciaCambiosDia, estado.calendario.enfermeros.procedenciaCambiosDia);
  assert.deepEqual(resultado.calendario.licenciados.cambiosDia, estado.calendario.licenciados.cambiosDia);
  assert.deepEqual(resultado.calendario.licenciados.procedenciaCambiosDia, estado.calendario.licenciados.procedenciaCambiosDia);
  assert.equal(Object.hasOwn(resultado.calendario.enfermeros.procedenciaCambiosDia, "2026-08-06"), false);
  const persistido = JSON.stringify(resultado.calendario);
  assert.equal(persistido.includes("opcion_1_boxes_"), false);
  assert.equal(persistido.includes("opcion_2_boxes_"), false);
  assert.equal(persistido.includes("reanimacion_sillones."), false);
});

probar("la hidratación incorpora cambiosDia sin cambiar la fecha", () => {
  assert.equal(keyDiaFromDate(fecha), "2026-08-01");
  assert.equal(
    hidratado.calendario.enfermeros.cambiosDia["2026-08-01"]["EXPLORA 1"].personaId,
    rosa.id
  );
});

probar("la hidratación incorpora No disponibles", () => {
  assert.equal(
    hidratado.calendario.enfermeros.noDisponibles["2026-08-01"][0].motivo,
    "falta_con_aviso"
  );
});

probar("la hidratación incorpora Extras y coberturas", () => {
  const extra = hidratado.calendario.enfermeros.extras["2026-08-01"][0];
  assert.equal(extra.nombre, "Rosa");
  assert.equal(extra.personaCubiertaId, persona.id);
});

probar("la hidratación incorpora asistencia", () => {
  assert.equal(
    hidratado.calendario.enfermeros.asistenciaDia["2026-08-01"][persona.id].estado,
    "presente"
  );
});

probar("la certificación del día se evalúa con fecha local normalizada", () => {
  assert.equal(estaCertificado(hidratado.certificaciones, certificada, fecha, hidratado.personal), true);
});

probar("el inicio de la aplicación normaliza la hora de la fecha activa", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(
    app,
    /useState\(\(\) => parsearFechaLocal\(keyDiaFromDate\(new Date\(\)\)\)\)/
  );
});

probar("la carga autoritativa sincroniza estado y ref en la misma actualización", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(
    app,
    /\[claveCarga\]: clasificacion\.estado[\s\S]*estadoPorTurnoMesRef\.current = siguiente;[\s\S]*return siguiente;/
  );
});

probar("Calendario Diario deriva la distribución de las props actuales", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(calendario, /const \{[\s\S]*cambiosDia = \{\}[\s\S]*\} = calendario \|\| \{\};/);
  assert.match(calendario, /const asignacionOrdenada = \(\(\) => \{/);
  assert.doesNotMatch(calendario, /useState\([^\n]*(asignacionOrdenada|calendario|planilla)/);
});

probar("onDataReady depende de la distribución recalculada", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(
    calendario,
    /useEffect\(\(\) => \{[\s\S]*onDataReady\(datosParaPDF\)[\s\S]*\}, \[[\s\S]*asignacionOrdenada,[\s\S]*noDisponibles,[\s\S]*\]\);/
  );
});

const probarRecalculoTrasRecarga = ({ opcion }) => {
  const estado = crearEstadoMensualVacio();
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({
      turno: "tarde",
      categoria: "enfermero",
      mes: "2026-08"
    })
  };
  const filasConfiguracion = estado.configuracionPlanilla.enfermero.filas;
  const ordenVisual = filasConfiguracion
    .filter((fila) => fila.activo !== false)
    .sort((a, b) => a.orden - b.orden)
    .map((fila) => fila.etiqueta);
  const personas = Array.from({ length: 12 }, (_, indice) => ({
    id: `${opcion}-persona-${indice + 1}`,
    nombre: `${opcion} Persona ${indice + 1}`,
    categoria: "enfermero"
  }));
  estado.personal = personas;
  const crear = opcion === "opcion1" ? redistribuirCritica : redistribuirPorBoxes;
  const redistribucion = crear({
    asignaciones: personas.map((enfermero) => ({ enfermero })),
    ordenVisual,
    filasConfiguracion
  });
  const fechaPrueba = "2026-08-07";
  estado.calendario.enfermeros.cambiosDia[fechaPrueba] = redistribucion.cambios;
  estado.calendario.enfermeros.procedenciaCambiosDia[fechaPrueba] = Object.fromEntries(
    Object.keys(redistribucion.cambios).map((clave) => [clave, "redistribucion_automatica"])
  );

  const recargado = idaYVuelta(estado);
  const calendario = recargado.calendario.enfermeros;
  const filasCalendario = opcion === "opcion1"
    ? obtenerSectoresVisiblesOpcion1(ordenVisual, filasConfiguracion)
    : obtenerSectoresVisiblesBoxes(ordenVisual, filasConfiguracion);
  let asignaciones = construirAsignacionesDiariasCalendario({
    filasCalendario,
    filasConfiguracion,
    planillaPeriodoEfectiva: {},
    cambiosDia: calendario.cambiosDia[fechaPrueba],
    procedenciaCambiosDia: calendario.procedenciaCambiosDia[fechaPrueba],
    personal: recargado.personal,
    turnantes: []
  });
  const indiceGrupo = opcion === "opcion1" ? 3 : 4;
  const destinoConAusencia = asignaciones[indiceGrupo];
  const { registro, error } = crearRegistroNoDisponible({
    persona: destinoConAusencia.enfermero,
    motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO
  });
  assert.equal(error, "");
  asignaciones = excluirAusenciasOperativasNoDisponiblesDeAsignaciones({
    asignaciones,
    registros: [registro],
    personal: recargado.personal
  });
  const recalcular = opcion === "opcion1"
    ? recalcularRedistribucionOpcion1Automatica
    : recalcularRedistribucionOpcion2Automatica;
  const resultado = recalcular({
    asignaciones,
    cambiosDia: calendario.cambiosDia[fechaPrueba],
    procedenciaCambiosDia: calendario.procedenciaCambiosDia[fechaPrueba],
    ordenVisual,
    filasConfiguracion
  });
  return { resultado, destinoConAusencia };
};

probar("Opción 1 recalcula después de recarga JSON y ausencia posterior", () => {
  const { resultado, destinoConAusencia } = probarRecalculoTrasRecarga({ opcion: "opcion1" });
  assert.ok(resultado.find((fila) => fila.nombre === destinoConAusencia.nombre).enfermero);
  assert.equal(resultado.some((fila) => fila.enfermero?.id === destinoConAusencia.enfermero.id), false);
});

probar("Opción 2 recalcula después de recarga JSON y ausencia posterior", () => {
  const { resultado, destinoConAusencia } = probarRecalculoTrasRecarga({ opcion: "opcion2" });
  assert.ok(resultado.find((fila) => fila.nombre === destinoConAusencia.nombre).enfermero);
  assert.equal(resultado.some((fila) => fila.enfermero?.id === destinoConAusencia.enfermero.id), false);
});

console.log(`\n${ejecutadas} pruebas de hidratación completadas.`);
