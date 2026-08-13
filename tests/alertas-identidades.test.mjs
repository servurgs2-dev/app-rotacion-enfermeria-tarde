import assert from "node:assert/strict";
import fs from "node:fs";
import { generarAlertasHorarios, gruposOperativos } from "../src/utils/alertasHorarios.js";
import {
  obtenerClaveIdentidadOperativa,
  resolverIdentidadOperativaAsignacion
} from "../src/utils/identidadOperativaAsignaciones.js";
import { MODOS_REDISTRIBUCION } from "../src/utils/gruposRedistribucion.js";
import {
  SECTOR_ID_REANIMACION_SILLONES,
  SYNTHETIC_IDS_REANIMACION_SILLONES
} from "../src/utils/reanimacionSillones.js";
import { obtenerConfiguracionTurno } from "../src/config/turnos.js";
import { TIPOS_MATERNAL } from "../src/utils/maternal.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { construirAsignacionesDiariasCalendario } from "../src/utils/pipelineCalendarioDiario.js";
import { crearEstadoMensualVacio, normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import { crearReferenciaPersona } from "../src/utils/referenciasPersonas.js";

const configTurno = obtenerConfiguracionTurno("tarde");
const temprano = (id) => ({ id, nombre: id, horario: "entraAntes" });
const asignacion = ({ nombre, persona = temprano(nombre), ...identidad }) => ({
  nombre,
  enfermero: persona,
  tipo: "sector",
  ...identidad
});
const alertas = ({ enfermeros = [], licenciados = [], personal = [] } = {}) =>
  generarAlertasHorarios({ enfermeros, licenciados, personal, configTurno });
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

probar("salida histórica conserva texto y orden", () => {
  assert.deepEqual(
    alertas({ enfermeros: [asignacion({ nombre: "EXPLORA 1" })] }),
    ["⚠️ Explora: a las 17:30 se retira EXPLORA 1. El sector queda sin cobertura hasta las 18:00."]
  );
});

probar("catálogo operativo usa descriptores y no etiquetas", () => {
  for (const grupo of gruposOperativos) {
    for (const identidad of [...grupo.licenciados, ...grupo.enfermeros]) {
      assert.ok(["sector", "grupo", "sintetico"].includes(identidad.tipoIdentidad));
      assert.ok(obtenerClaveIdentidadOperativa(identidad));
    }
  }
});

probar("sector real explícito se resuelve por sectorId aunque cambie el nombre", () => {
  const persona = temprano("Persona REA");
  const historica = alertas({ enfermeros: [asignacion({ nombre: "REA 1", sectorId: "rea_1", persona })] });
  const renombrada = alertas({ enfermeros: [asignacion({ nombre: "Crítico A", sectorId: "rea_1", persona })] });
  assert.deepEqual(renombrada, historica);
});

probar("renombrados de Explora, Pre Int y SM conservan alertas", () => {
  const casos = [
    ["EXPLORA 1", "Exploración principal", "explora_1"],
    ["PRE INT 1", "Preinternación principal", "pre_int_1"],
    ["SM", "Salud Mental turno", "salud_mental"]
  ];
  for (const [anterior, actual, sectorId] of casos) {
    const persona = temprano(`Persona ${sectorId}`);
    assert.deepEqual(
      alertas({ enfermeros: [asignacion({ nombre: actual, sectorId, persona })] }),
      alertas({ enfermeros: [asignacion({ nombre: anterior, sectorId, persona })] })
    );
  }
});

probar("Drag & Drop no modifica pertenencia ni salida", () => {
  const filas = [
    asignacion({ nombre: "REA 1", sectorId: "rea_1" }),
    asignacion({ nombre: "EXPLORA 1", sectorId: "explora_1" })
  ];
  assert.deepEqual(alertas({ enfermeros: filas }), alertas({ enfermeros: [...filas].reverse() }));
});

probar("fila inactiva recibida accidentalmente no reaparece por alias", () => {
  assert.deepEqual(alertas({ enfermeros: [{ ...asignacion({ nombre: "REA 1" }), activo: false }] }), []);
});

for (const modo of MODOS_REDISTRIBUCION) {
  probar(`${modo.modeId} reconoce todos sus grupos por groupId sin depender del texto`, () => {
    for (const grupo of modo.groups) {
      const explicita = resolverIdentidadOperativaAsignacion({
        nombre: "Etiqueta visible cambiada",
        groupId: grupo.groupId
      });
      assert.deepEqual(explicita, { tipoIdentidad: "grupo", groupId: grupo.groupId });
      assert.deepEqual(
        resolverIdentidadOperativaAsignacion({ nombre: grupo.etiqueta }),
        explicita
      );
      assert.deepEqual(alertas({ enfermeros: [asignacion({
        nombre: "Etiqueta visible cambiada",
        groupId: grupo.groupId
      })] }), []);
    }
  });
}

probar("fila Reanimación + Sillones usa sectorId y admite renombrado", () => {
  const persona = temprano("Persona combinada");
  const base = alertas({ licenciados: [asignacion({
    nombre: "Reanimación + Sillones",
    sectorId: SECTOR_ID_REANIMACION_SILLONES,
    persona
  })] });
  const renombrada = alertas({ licenciados: [asignacion({
    nombre: "Área crítica combinada",
    sectorId: SECTOR_ID_REANIMACION_SILLONES,
    persona
  })] });
  assert.deepEqual(renombrada, base);
  assert.equal(base.length, 1);
});

probar("Reanimación y Sillones sintéticos usan syntheticId", () => {
  for (const [nombre, syntheticId] of [
    ["Reanimación", SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION],
    ["Sillones", SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES]
  ]) {
    const persona = temprano(`Persona ${syntheticId}`);
    const base = alertas({ licenciados: [asignacion({ nombre, syntheticId, persona })] });
    const renombrada = alertas({ licenciados: [asignacion({
      nombre: `${nombre} visible`,
      syntheticId,
      persona
    })] });
    assert.deepEqual(renombrada, base);
    assert.equal(base.length, 1);
  }
});

probar("asignación manual y automática cuentan igual", () => {
  const persona = temprano("manual");
  const manual = asignacion({ nombre: "REA manual", sectorId: "rea_1", persona });
  assert.deepEqual(
    alertas({ enfermeros: [{ ...manual, cambioManualProtegido: true }] }),
    alertas({ enfermeros: [{ ...manual, cambioManualProtegido: false }] })
  );
});

probar("ausencia posterior se refleja en el resultado final recibido", () => {
  const cubierta = [asignacion({ nombre: "REA 1", sectorId: "rea_1" })];
  assert.equal(alertas({ enfermeros: cubierta }).length, 1);
  assert.deepEqual(alertas({ enfermeros: [{ ...cubierta[0], enfermero: null }] }), []);
});

probar("una persona repetida se cuenta una sola vez", () => {
  const persona = temprano("duplicada");
  const resultado = alertas({ enfermeros: [
    asignacion({ nombre: "REA 1", sectorId: "rea_1", persona }),
    asignacion({ nombre: "SILLÓN 1", sectorId: "sillon_1", persona })
  ] });
  assert.match(resultado[0], /se retira duplicada/);
});

const personaMaternal = ({ id, nombre, horario = "normal", maternal = TIPOS_MATERNAL.SALE_UNA_HORA_ANTES }) => ({
  id,
  nombre,
  horario,
  maternal
});

probar("dos maternales a la misma hora alertan con ambos nombres y cobertura restante", () => {
  const ana = personaMaternal({ id: "maternal-ana", nombre: "Ana Pérez" });
  const maria = personaMaternal({ id: "maternal-maria", nombre: "María López" });
  const cobertura = { id: "normal-cobertura", nombre: "Cobertura normal", horario: "normal" };
  assert.deepEqual(alertas({
    licenciados: [asignacion({
      nombre: "Área crítica combinada",
      sectorId: "reanimacion_sillones",
      persona: ana
    })],
    enfermeros: [
      asignacion({ nombre: "Crítico A", sectorId: "rea_1", persona: maria }),
      asignacion({ nombre: "Sillones principal", sectorId: "sillon_1", persona: cobertura })
    ]
  }), [
    "⚠️ Reanimación y Sillones: a las 17:00 se retiran Ana Pérez y María López. Queda 1 persona hasta las 18:00."
  ]);
});

probar("dos únicas personas maternales alertan sin cobertura y conservan nombres", () => {
  const ana = personaMaternal({ id: "maternal-solas-ana", nombre: "Ana Pérez" });
  const maria = personaMaternal({ id: "maternal-solas-maria", nombre: "María López" });
  assert.deepEqual(alertas({ enfermeros: [
    asignacion({ nombre: "REA renombrada", sectorId: "rea_1", persona: ana }),
    asignacion({ nombre: "Sillón renombrado", sectorId: "sillon_1", persona: maria })
  ] }), [
    "⚠️ Reanimación y Sillones: a las 17:00 se retiran Ana Pérez y María López. El sector queda sin cobertura hasta las 18:00."
  ]);
});

probar("una maternal con cobertura restante no alerta", () => {
  assert.deepEqual(alertas({ enfermeros: [
    asignacion({
      nombre: "REA 1",
      sectorId: "rea_1",
      persona: personaMaternal({ id: "maternal-con-cobertura", nombre: "Ana Pérez" })
    }),
    asignacion({
      nombre: "SILLÓN 1",
      sectorId: "sillon_1",
      persona: { id: "normal-restante", nombre: "Cobertura normal", horario: "normal" }
    })
  ] }), []);
});

probar("una maternal que deja cobertura cero alerta con su nombre", () => {
  assert.deepEqual(alertas({ enfermeros: [asignacion({
    nombre: "SM renombrada",
    sectorId: "salud_mental",
    persona: personaMaternal({ id: "maternal-sm", nombre: "Ana Pérez" })
  })] }), [
    "⚠️ Salud Mental: a las 17:00 se retira Ana Pérez. El sector queda sin cobertura hasta las 18:00."
  ]);
});

probar("normal, entraAntes y entraDespues aplican una hora maternal sobre su salida base", () => {
  const casos = [
    ["normal", "17:00"],
    ["entraAntes", "16:30"],
    ["entraDespues", "17:30"]
  ];
  for (const [horario, salida] of casos) {
    const nombre = `Maternal ${horario}`;
    const resultado = alertas({ enfermeros: [asignacion({
      nombre: "SM",
      sectorId: "salud_mental",
      persona: personaMaternal({ id: `maternal-${horario}`, nombre, horario })
    })] });
    assert.equal(resultado.length, 1);
    assert.match(resultado[0], new RegExp(`a las ${salida} se retira ${nombre}`));
  }
});

probar("entra una hora después no genera por sí sola una alerta de salida", () => {
  assert.deepEqual(alertas({ enfermeros: [asignacion({
    nombre: "SM",
    sectorId: "salud_mental",
    persona: personaMaternal({
      id: "maternal-entrada",
      nombre: "Entrada maternal",
      maternal: TIPOS_MATERNAL.ENTRA_UNA_HORA_DESPUES
    })
  })] }), []);
});

probar("dos maternales en filas distintas del mismo grupo se agregan por identidad sectorial", () => {
  const resultado = alertas({ enfermeros: [
    asignacion({
      nombre: "REA personalizada",
      sectorId: "rea_1",
      persona: personaMaternal({ id: "maternal-rea", nombre: "Ana Pérez" })
    }),
    asignacion({
      nombre: "Sillón personalizado",
      sectorId: "sillon_1",
      persona: personaMaternal({ id: "maternal-sillon", nombre: "María López" })
    }),
    asignacion({
      nombre: "REA respaldo",
      sectorId: "rea_2",
      persona: { id: "normal-grupo", nombre: "Cobertura normal", horario: "normal" }
    })
  ] });
  assert.equal(resultado.length, 1);
  assert.match(resultado[0], /Ana Pérez y María López/);
});

probar("Licenciado y Enfermero maternales se combinan en una sola alerta", () => {
  const resultado = alertas({
    licenciados: [asignacion({
      nombre: "Área crítica combinada",
      sectorId: "reanimacion_sillones",
      persona: personaMaternal({ id: "maternal-lic", nombre: "Licenciada Ana" })
    })],
    enfermeros: [
      asignacion({
        nombre: "REA principal",
        sectorId: "rea_1",
        persona: personaMaternal({ id: "maternal-enf", nombre: "Enfermero Luis" })
      }),
      asignacion({
        nombre: "Sillón principal",
        sectorId: "sillon_1",
        persona: { id: "normal-mixto", nombre: "Cobertura normal", horario: "normal" }
      })
    ]
  });
  assert.equal(resultado.length, 1);
  assert.match(resultado[0], /Licenciada Ana y Enfermero Luis/);
  assert.match(resultado[0], /Queda 1 persona/);
});

probar("deduplicación maternal evita doble conteo entre categorías", () => {
  const persona = personaMaternal({ id: "maternal-duplicada", nombre: "Ana Única" });
  const resultado = alertas({
    licenciados: [asignacion({
      nombre: "Reanimación + Sillones",
      sectorId: "reanimacion_sillones",
      persona
    })],
    enfermeros: [asignacion({ nombre: "REA 1", sectorId: "rea_1", persona })]
  });
  assert.equal(resultado.length, 1);
  assert.match(resultado[0], /se retira Ana Única/);
  assert.doesNotMatch(resultado[0], /Ana Única y Ana Única/);
});

const crearFlujoProductivoTriage = ({ maternal = TIPOS_MATERNAL.NINGUNO } = {}) => {
  const estado = crearEstadoMensualVacio();
  const licenciadaA = {
    id: "licenciada-a",
    nombre: "Licenciada A",
    categoria: "licenciado",
    horario: "normal",
    maternal
  };
  const licenciadaB = {
    id: "licenciada-b",
    nombre: "Licenciada B",
    categoria: "licenciado",
    horario: "normal",
    maternal
  };
  estado.personal = [licenciadaA, licenciadaB];
  estado.configuracionPlanilla = {
    licenciado: crearSnapshotConfiguracionPlanilla({
      turno: "tarde",
      categoria: "licenciado",
      mes: "2026-08"
    })
  };
  const filasConfiguracion = estado.configuracionPlanilla.licenciado.filas;
  const filasCalendario = filasConfiguracion
    .filter((fila) => fila.activo !== false)
    .sort((a, b) => a.orden - b.orden)
    .map((fila) => fila.etiqueta);
  const planillaPeriodoEfectiva = {
    "Triage 1": crearReferenciaPersona(licenciadaA),
    "Triage 2": crearReferenciaPersona(licenciadaB)
  };
  const asignaciones = construirAsignacionesDiariasCalendario({
    filasCalendario,
    filasConfiguracion,
    planillaPeriodoEfectiva,
    cambiosDia: {},
    personal: estado.personal,
    turnantes: ["T1", "T2"]
  });
  return { estado, asignaciones, licenciadaA, licenciadaB };
};

probar("pipeline productivo publica Triage 1 y Triage 2 con identidades estables", () => {
  const flujo = crearFlujoProductivoTriage({ maternal: TIPOS_MATERNAL.SALE_UNA_HORA_ANTES });
  for (const [indice, sectorId] of ["triage_1", "triage_2"].entries()) {
    const fila = flujo.asignaciones.find((actual) => actual.sectorId === sectorId);
    assert.equal(fila.nombre, `Triage ${indice + 1}`);
    assert.equal(fila.filaId, `licenciado.sector.${sectorId}`);
    assert.equal(fila.tipo, "sector");
    assert.equal(fila.enfermero.id, `licenciada-${indice === 0 ? "a" : "b"}`);
    assert.equal(fila.enfermero.maternal, TIPOS_MATERNAL.SALE_UNA_HORA_ANTES);
    assert.equal(fila.enfermero.horario, "normal");
  }
});

probar("flujo productivo Triage maternal genera alerta aun con foto parcial y marca Turnante", () => {
  const flujo = crearFlujoProductivoTriage({ maternal: TIPOS_MATERNAL.SALE_UNA_HORA_ANTES });
  const publicadas = flujo.asignaciones.map((fila) => fila.enfermero
    ? {
        ...fila,
        enfermero: {
          id: fila.enfermero.id,
          nombre: fila.enfermero.nombre,
          ...(fila.sectorId === "triage_1" ? { esTurnante: true } : {})
        }
      }
    : fila);
  assert.deepEqual(alertas({ licenciados: publicadas, personal: flujo.estado.personal }), [
    "⚠️ Triaje: a las 17:00 se retiran Licenciada A y Licenciada B. El sector queda sin cobertura hasta las 18:00."
  ]);
});

probar("actualización en vivo de maternal cambia la alerta sin cambiar día ni turno", () => {
  const inicial = crearFlujoProductivoTriage();
  assert.deepEqual(alertas({ licenciados: inicial.asignaciones, personal: inicial.estado.personal }), []);
  const personalActualizado = inicial.estado.personal.map((persona) => ({
    ...persona,
    maternal: TIPOS_MATERNAL.SALE_UNA_HORA_ANTES
  }));
  assert.deepEqual(alertas({ licenciados: inicial.asignaciones, personal: personalActualizado }), [
    "⚠️ Triaje: a las 17:00 se retiran Licenciada A y Licenciada B. El sector queda sin cobertura hasta las 18:00."
  ]);
});

probar("Triage maternal permanece después de serializar, hidratar y reconstruir", () => {
  const flujo = crearFlujoProductivoTriage({ maternal: TIPOS_MATERNAL.SALE_UNA_HORA_ANTES });
  const recargado = normalizarEstadoMensual(JSON.parse(JSON.stringify(flujo.estado)));
  const filasConfiguracion = recargado.configuracionPlanilla.licenciado.filas;
  const asignaciones = construirAsignacionesDiariasCalendario({
    filasCalendario: filasConfiguracion.map((fila) => fila.etiqueta),
    filasConfiguracion,
    planillaPeriodoEfectiva: {
      "Triage 1": crearReferenciaPersona(recargado.personal[0]),
      "Triage 2": crearReferenciaPersona(recargado.personal[1])
    },
    cambiosDia: {},
    personal: recargado.personal,
    turnantes: []
  });
  assert.equal(alertas({ licenciados: asignaciones, personal: recargado.personal })[0].includes("17:00"), true);
});

probar("Triage 17:00 y Observación 17:30 producen alertas independientes y ordenadas", () => {
  const flujo = crearFlujoProductivoTriage({ maternal: TIPOS_MATERNAL.SALE_UNA_HORA_ANTES });
  const observacionA = { id: "obs-a", nombre: "Observación A", horario: "entraAntes" };
  const observacionB = { id: "obs-b", nombre: "Observación B", horario: "entraAntes" };
  const resultado = alertas({
    licenciados: [
      ...flujo.asignaciones,
      asignacion({ nombre: "Observación 1", sectorId: "observacion_1", persona: observacionA }),
      asignacion({ nombre: "Observación 2", sectorId: "observacion_2", persona: observacionB })
    ],
    personal: [...flujo.estado.personal, observacionA, observacionB]
  });
  assert.equal(resultado.length, 2);
  assert.match(resultado[0], /Triaje:.*17:00/);
  assert.match(resultado[1], /Observación:.*17:30/);
});

probar("SIN ASIGNAR, VACANTE_OPERATIVA y __EMPTY__ no cuentan", () => {
  assert.deepEqual(alertas({ enfermeros: [
    asignacion({ nombre: "SIN ASIGNAR" }),
    { nombre: "REA 1", sectorId: "rea_1", enfermero: null, vacioOperativo: true },
    { nombre: "REA 2", sectorId: "rea_2", enfermero: null, vacioManual: true }
  ] }), []);
});

probar("fallback legacy es exacto y no admite coincidencia parcial", () => {
  assert.deepEqual(resolverIdentidadOperativaAsignacion({ nombre: "REA 1" }), {
    tipoIdentidad: "sector",
    sectorId: "rea_1"
  });
  assert.equal(resolverIdentidadOperativaAsignacion({ nombre: "REA 1 parcial" }), null);
  assert.equal(resolverIdentidadOperativaAsignacion({ nombre: "8–14 parcial" }), null);
});

probar("grupos y destinos sintéticos no requieren persistir sus IDs", () => {
  assert.deepEqual(
    resolverIdentidadOperativaAsignacion({ nombre: "8–14" }),
    { tipoIdentidad: "grupo", groupId: "opcion_2_boxes_8_14" }
  );
  assert.deepEqual(
    resolverIdentidadOperativaAsignacion({ nombre: "Reanimación" }),
    { tipoIdentidad: "sintetico", syntheticId: SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION }
  );
});

probar("legacy paro conserva supresión y Adhesión a PARO no activa esa rama", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(app, /esDiaParoActual[\s\S]*return \[\];[\s\S]*generarAlertasHorarios/);
  assert.doesNotMatch(app, /ADHESION_PARO[\s\S]*esDiaParoActual|esDiaParoActual[\s\S]*ADHESION_PARO/);
});

console.log(`\n${total} pruebas de alertas por identidades estables pasaron.`);
