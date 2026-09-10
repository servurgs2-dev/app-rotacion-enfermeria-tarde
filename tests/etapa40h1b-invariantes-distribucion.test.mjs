import assert from "node:assert/strict";
import {
  aplicarPrioridadCoberturaParejas,
  PAREJAS_COBERTURA_ENFERMEROS
} from "../src/utils/coberturaParejasEnfermeros.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { incorporarPersonasSinAsignar } from "../src/utils/pipelineCalendarioDiario.js";
import {
  TIPOS_EXTRA,
  configurarTipoExtra,
  crearExtraTemporal
} from "../src/utils/extrasPersonas.js";

const persona = (id, extras = {}) => ({ id, nombre: id, ...extras });
const identidad = (actual) => actual?.id || actual?.personaId || actual?.nombre || null;
const porSector = (resultado, sectorId) =>
  resultado.find((fila) => fila.sectorId === sectorId)?.enfermero || null;
const afirmarInvariantes = (resultado) => {
  const personas = resultado.map((fila) => identidad(fila.enfermero)).filter(Boolean);
  assert.equal(new Set(personas).size, personas.length, "una identidad no puede ocupar dos destinos");
  const sectores = resultado.map((fila) => fila.sectorId).filter(Boolean);
  assert.equal(new Set(sectores).size, sectores.length, "un destino canónico no puede repetirse");
  assert.equal(resultado.every((fila) => !Array.isArray(fila.enfermero)), true);
};
const resolver = ({
  sectores,
  turnantes = [],
  extras = [],
  prioridad = sectores.map((fila) => fila.sectorId),
  disponible = () => true,
  parejas = true
}) => resolverTurnantesYCoberturasOperativas({
  asignaciones: [
    ...turnantes.map((actual, indice) => ({
      tipo: "turnante", turnanteId: `turnante_${indice + 1}`,
      nombre: `T${indice + 1}`, enfermero: actual
    })),
    ...sectores.map((fila) => ({ tipo: "sector", nombre: fila.sectorId, ...fila }))
  ],
  extras,
  personal: [...sectores.map((fila) => fila.enfermero), ...turnantes, ...extras].filter(Boolean),
  esPersonaDisponible: disponible,
  esPersonaDisponibleParaCobertura: disponible,
  prioridadSectorIds: prioridad,
  ajustarSectores: parejas
    ? (asignaciones) => aplicarPrioridadCoberturaParejas({
        asignaciones, esPersonaDisponible: disponible
      })
    : undefined
}).asignaciones;

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`${pareja.origenSectorId}: 2→1 y reposición con Turnante`, () => {
    const titular = persona(`titular-${pareja.origenSectorId}`);
    const turnante = persona(`turnante-${pareja.origenSectorId}`);
    const resultado = resolver({
      sectores: [
        { sectorId: pareja.destinoSectorId, enfermero: null },
        { sectorId: pareja.origenSectorId, enfermero: titular }
      ],
      turnantes: [turnante]
    });
    assert.equal(porSector(resultado, pareja.destinoSectorId), titular);
    assert.equal(porSector(resultado, pareja.origenSectorId), turnante);
    afirmarInvariantes(resultado);
  });

  probar(`${pareja.origenSectorId}: Turnante directo cuando 1 está cubierto`, () => {
    const turnante = persona(`turnante-directo-${pareja.origenSectorId}`);
    const resultado = resolver({
      sectores: [
        { sectorId: pareja.destinoSectorId, enfermero: persona(`titular-${pareja.destinoSectorId}`) },
        { sectorId: pareja.origenSectorId, enfermero: null }
      ],
      turnantes: [turnante]
    });
    assert.equal(porSector(resultado, pareja.origenSectorId), turnante);
    afirmarInvariantes(resultado);
  });

  probar(`${pareja.origenSectorId}: 2→1 sin Turnante deja 2 vacante`, () => {
    const titular = persona(`titular-solo-${pareja.origenSectorId}`);
    const resultado = resolver({
      sectores: [
        { sectorId: pareja.destinoSectorId, enfermero: null },
        { sectorId: pareja.origenSectorId, enfermero: titular }
      ]
    });
    assert.equal(porSector(resultado, pareja.destinoSectorId), titular);
    assert.equal(porSector(resultado, pareja.origenSectorId), null);
    afirmarInvariantes(resultado);
  });

  probar(`${pareja.origenSectorId}: manual protegido impide 2→1`, () => {
    const titular = persona(`titular-manual-${pareja.origenSectorId}`);
    const resultado = resolver({
      sectores: [
        { sectorId: pareja.destinoSectorId, enfermero: null, vacioManual: true },
        { sectorId: pareja.origenSectorId, enfermero: titular, cambioManualProtegido: true }
      ],
      turnantes: [persona(`turnante-manual-${pareja.origenSectorId}`)]
    });
    assert.equal(porSector(resultado, pareja.destinoSectorId), null);
    assert.equal(porSector(resultado, pareja.origenSectorId), titular);
    afirmarInvariantes(resultado);
  });
}

probar("caso Diego conserva titular y usa Valentina directamente", () => {
  const diego = persona("diego");
  const valentina = persona("valentina");
  const resultado = resolver({
    sectores: [
      { sectorId: "rea_1", enfermero: persona("titular-rea1_1") },
      { sectorId: "rea_2", enfermero: diego },
      { sectorId: "pre_int_1", enfermero: persona("titular-preint1") },
      { sectorId: "pre_int_2", enfermero: null }
    ],
    turnantes: [valentina],
    prioridad: ["pre_int_2", "rea_2", "rea_1", "pre_int_1"]
  });
  assert.equal(porSector(resultado, "rea_2"), diego);
  assert.equal(porSector(resultado, "pre_int_2"), valentina);
  assert.equal(resultado.find((fila) => fila.sectorId === "rea_2")?.origenCoberturaAutomaticaSectorId, undefined);
  afirmarInvariantes(resultado);
});

probar("caso REA 2→REA 1 conserva RT y Turnante repone REA 2", () => {
  const diego = persona("diego");
  const valentina = persona("valentina");
  const resultado = resolver({
    sectores: [
      { sectorId: "rea_1", enfermero: null },
      { sectorId: "rea_2", enfermero: diego }
    ],
    turnantes: [valentina]
  });
  const rea1 = resultado.find((fila) => fila.sectorId === "rea_1");
  assert.equal(rea1.enfermero, diego);
  assert.equal(rea1.origenCoberturaAutomaticaSectorId, "rea_2");
  assert.equal(porSector(resultado, "rea_2"), valentina);
});

probar("orden T1/T2 determina identidades, no estructura cubierta", () => {
  const sectores = [
    { sectorId: "alta", enfermero: null },
    { sectorId: "baja", enfermero: null }
  ];
  const t1 = persona("t1");
  const t2 = persona("t2");
  const directo = resolver({ sectores, turnantes: [t1, t2], parejas: false });
  const inverso = resolver({ sectores, turnantes: [t2, t1], parejas: false });
  assert.deepEqual(directo.map((fila) => Boolean(fila.enfermero)), [true, true]);
  assert.deepEqual(inverso.map((fila) => Boolean(fila.enfermero)), [true, true]);
  assert.equal(porSector(directo, "alta"), t1);
  assert.equal(porSector(inverso, "alta"), t2);
});

probar("más Turnantes que vacantes deja recursos sin duplicar", () => {
  const resultado = resolver({
    sectores: [{ sectorId: "unico", enfermero: null }],
    turnantes: [persona("t1"), persona("t2"), persona("t3")],
    parejas: false
  });
  assert.equal(resultado.filter((fila) => fila.enfermero).length, 1);
  afirmarInvariantes(resultado);
});

probar("T6, T3 y T4 usan el mismo contrato de Turnante", () => {
  for (const id of ["t6-enfermero", "t3-licenciado", "t4-licenciado"]) {
    const turnante = persona(id);
    const resultado = resolver({
      sectores: [{ sectorId: `destino-${id}`, enfermero: null }],
      turnantes: [turnante],
      parejas: false
    });
    assert.equal(resultado[0].enfermero, turnante);
  }
});

probar("fuentes de ausencia distintas producen la misma disponibilidad normalizada", () => {
  for (const origen of ["licencia", "certificacion", "no_disponible", "suspension", "paro", "novedad_activa"]) {
    const ausente = persona(`ausente-${origen}`);
    const turnante = persona(`turnante-${origen}`);
    const resultado = resolver({
      sectores: [{ sectorId: "rea_1", enfermero: ausente }],
      turnantes: [turnante],
      disponible: (actual) => actual !== ausente,
      parejas: false
    });
    assert.equal(resultado[0].enfermero, turnante);
    assert.equal(resultado.some((fila) => fila.enfermero === ausente), false);
  }
});

probar("quitar la indisponibilidad reconstruye desde la asignación base", () => {
  const titular = persona("titular");
  const base = [{ sectorId: "rea_1", enfermero: titular }];
  assert.equal(resolver({ sectores: base, disponible: () => false, parejas: false })[0].enfermero, null);
  assert.equal(resolver({ sectores: base, disponible: () => true, parejas: false })[0].enfermero, titular);
});

probar("vacío manual resiste Turnante, Extra y prioridad", () => {
  const resultado = resolver({
    sectores: [
      { sectorId: "alta", enfermero: null, vacioManual: true },
      { sectorId: "baja", enfermero: persona("titular-baja") }
    ],
    turnantes: [persona("turnante")],
    extras: [persona("extra", { tipoExtra: TIPOS_EXTRA.REFUERZO })],
    prioridad: ["alta", "baja"],
    parejas: false
  });
  assert.equal(porSector(resultado, "alta"), null);
  assert.equal(porSector(resultado, "baja")?.id, "titular-baja");
});

probar("prioridad mueve donante inferior pero no sacrifica titular superior", () => {
  const titularInferior = persona("inferior");
  const haciaArriba = resolver({
    sectores: [
      { sectorId: "alta", enfermero: null },
      { sectorId: "baja", enfermero: titularInferior }
    ],
    prioridad: ["alta", "baja"],
    parejas: false
  });
  assert.equal(porSector(haciaArriba, "alta"), titularInferior);
  const titularSuperior = persona("superior");
  const noHaciaAbajo = resolver({
    sectores: [
      { sectorId: "alta", enfermero: titularSuperior },
      { sectorId: "baja", enfermero: null }
    ],
    prioridad: ["alta", "baja"],
    parejas: false
  });
  assert.equal(porSector(noHaciaAbajo, "alta"), titularSuperior);
  assert.equal(porSector(noHaciaAbajo, "baja"), null);
});

probar("Extra de refuerzo precede al Turnante en vacante ordinaria", () => {
  const extra = persona("extra-refuerzo", { tipoExtra: TIPOS_EXTRA.REFUERZO });
  const turnante = persona("turnante");
  const resultado = resolver({
    sectores: [{ sectorId: "vacante", enfermero: null }],
    extras: [extra], turnantes: [turnante], parejas: false
  });
  assert.equal(resultado[0].enfermero, extra);
});

probar("Extra de cobertura vinculada reemplaza una sola vez a su persona", () => {
  const titular = persona("titular-cubierto", { categoria: "enfermero" });
  const baseExtra = crearExtraTemporal({
    nombre: "extra-cobertura", categoria: "enfermero", crearId: () => "extra-cobertura"
  }).extra;
  const cobertura = configurarTipoExtra({
    extra: baseExtra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: titular,
    sectorCubierto: "REA 1",
    personal: [titular]
  }).extra;
  const resultado = resolver({
    sectores: [{ sectorId: "rea_1", enfermero: titular }],
    extras: [cobertura], parejas: false
  });
  assert.equal(resultado[0].enfermero.id, "extra-cobertura");
  assert.equal(resultado.filter((fila) => fila.enfermero?.id === "extra-cobertura").length, 1);
  assert.equal(resultado.some((fila) => fila.enfermero === titular), false);
});

probar("misma entrada canónica produce el mismo resultado", () => {
  const entrada = {
    sectores: [
      { sectorId: "alta", enfermero: null },
      { sectorId: "baja", enfermero: persona("titular") }
    ],
    turnantes: [persona("turnante")],
    prioridad: ["alta", "baja"],
    parejas: false
  };
  assert.deepEqual(resolver(entrada), resolver(entrada));
});

probar("Sin asignar incorpora sobrantes y reintegros una sola vez", () => {
  const titular = persona("titular");
  const sobrante = persona("sobrante");
  const reintegro = persona("reintegro");
  const resultado = incorporarPersonasSinAsignar({
    asignaciones: [{ nombre: "REA 1", enfermero: titular, tipo: "sector" }],
    personas: [titular, sobrante, reintegro, sobrante]
  });
  assert.equal(resultado.filter((fila) => fila.nombre === "SIN ASIGNAR").length, 2);
  afirmarInvariantes(resultado);
});

console.log(`\n${total} pruebas conductuales de invariantes de distribución aprobadas.`);
