import assert from "node:assert/strict";
import {
  aplicarPrioridadCoberturaParejas,
  PAREJAS_COBERTURA_ENFERMEROS
} from "../src/utils/coberturaParejasEnfermeros.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { TIPOS_EXTRA } from "../src/utils/extrasPersonas.js";

const persona = (id, extras = {}) => ({ id, nombre: id, ...extras });
const resolver = ({ sectores, turnantes = [], extras = [], prioridad }) =>
  resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      ...turnantes.map((actual, indice) => ({
        tipo: "turnante",
        turnanteId: `turnante_${indice + 1}`,
        nombre: `T${indice + 1}`,
        enfermero: actual
      })),
      ...sectores.map((fila) => ({ tipo: "sector", nombre: fila.sectorId, ...fila }))
    ],
    extras,
    personal: [...turnantes, ...sectores.map((fila) => fila.enfermero), ...extras].filter(Boolean),
    esPersonaDisponible: (actual) => actual?.disponible !== false,
    esPersonaDisponibleParaCobertura: (actual) => actual?.disponible !== false,
    prioridadSectorIds: prioridad,
    ajustarSectores: (asignaciones) => aplicarPrioridadCoberturaParejas({
      asignaciones,
      esPersonaDisponible: (actual) => actual?.disponible !== false
    })
  }).asignaciones;

const en = (resultado, sectorId) =>
  resultado.find((fila) => fila.sectorId === sectorId)?.enfermero || null;

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

probar("Diego permanece en REA 2 y Valentina cubre directamente PRE INT 2", () => {
  const diego = persona("Diego Correa");
  const valentina = persona("Valentina De León");
  const resultado = resolver({
    sectores: [
      { sectorId: "rea_1", enfermero: persona("Titular REA 1") },
      { sectorId: "rea_2", enfermero: diego },
      { sectorId: "pre_int_1", enfermero: persona("Titular PRE INT 1") },
      { sectorId: "pre_int_2", enfermero: null }
    ],
    turnantes: [valentina],
    prioridad: ["pre_int_2", "rea_2", "rea_1", "pre_int_1"]
  });
  assert.equal(en(resultado, "rea_2"), diego);
  assert.equal(en(resultado, "pre_int_2"), valentina);
  assert.equal(resultado.find((fila) => fila.sectorId === "rea_2")?.origenCoberturaAutomaticaSectorId, undefined);
});

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`${pareja.origenSectorId} recibe Turnante directo si ${pareja.destinoSectorId} está cubierto`, () => {
    const turnante = persona(`T-${pareja.origenSectorId}`);
    const resultado = resolver({
      sectores: [
        { sectorId: pareja.destinoSectorId, enfermero: persona(`titular-${pareja.destinoSectorId}`) },
        { sectorId: pareja.origenSectorId, enfermero: null },
        { sectorId: "donante_inferior", enfermero: persona("donante") }
      ],
      turnantes: [turnante],
      prioridad: [pareja.origenSectorId, "donante_inferior", pareja.destinoSectorId]
    });
    assert.equal(en(resultado, pareja.origenSectorId), turnante);
    assert.equal(en(resultado, "donante_inferior")?.id, "donante");
  });

  probar(`${pareja.origenSectorId} cede a ${pareja.destinoSectorId} y luego recibe Turnante`, () => {
    const titular = persona(`titular-${pareja.origenSectorId}`);
    const turnante = persona(`T-${pareja.origenSectorId}`);
    const resultado = resolver({
      sectores: [
        { sectorId: pareja.destinoSectorId, enfermero: null },
        { sectorId: pareja.origenSectorId, enfermero: titular }
      ],
      turnantes: [turnante],
      prioridad: [pareja.destinoSectorId, pareja.origenSectorId]
    });
    assert.equal(en(resultado, pareja.destinoSectorId), titular);
    assert.equal(en(resultado, pareja.origenSectorId), turnante);
    assert.equal(resultado.find((fila) => fila.sectorId === pareja.destinoSectorId)?.origenCoberturaAutomaticaSectorId, pareja.origenSectorId);
  });
}

probar("sin Turnante la prioridad general conserva su capacidad de mover un titular", () => {
  const titular = persona("titular-inferior");
  const resultado = resolver({
    sectores: [
      { sectorId: "pre_int_1", enfermero: persona("titular-pre-int-1"), cambioManualProtegido: true },
      { sectorId: "pre_int_2", enfermero: null },
      { sectorId: "rea_2", enfermero: titular }
    ],
    prioridad: ["pre_int_2", "rea_2", "pre_int_1"]
  });
  assert.equal(en(resultado, "pre_int_2"), titular);
  assert.equal(en(resultado, "rea_2"), null);
});

probar("dos Turnantes cubren dos sectores 2 sin mover REA 2 ni duplicarse", () => {
  const diego = persona("Diego");
  const t1 = persona("T1");
  const t2 = persona("T2");
  const resultado = resolver({
    sectores: [
      { sectorId: "rea_1", enfermero: persona("Titular REA 1") },
      { sectorId: "rea_2", enfermero: diego },
      { sectorId: "pre_int_1", enfermero: persona("Titular PRE INT 1") },
      { sectorId: "pre_int_2", enfermero: null },
      { sectorId: "sillon_1", enfermero: persona("Titular Sillón 1") },
      { sectorId: "sillon_2", enfermero: null }
    ],
    turnantes: [t1, t2],
    prioridad: ["pre_int_2", "sillon_2", "rea_2", "rea_1", "pre_int_1", "sillon_1"]
  });
  assert.equal(en(resultado, "rea_2"), diego);
  assert.equal(en(resultado, "pre_int_2"), t1);
  assert.equal(en(resultado, "sillon_2"), t2);
  assert.equal(resultado.filter((fila) => [t1, t2].includes(fila.enfermero)).length, 2);
});

probar("con un Turnante la prioridad general resuelve la vacante restante", () => {
  const donante = persona("donante");
  const turnante = persona("T1");
  const resultado = resolver({
    sectores: [
      { sectorId: "pre_int_1", enfermero: persona("Titular PRE INT 1"), cambioManualProtegido: true },
      { sectorId: "pre_int_2", enfermero: null },
      { sectorId: "sillon_1", enfermero: persona("Titular Sillón 1"), cambioManualProtegido: true },
      { sectorId: "sillon_2", enfermero: null },
      { sectorId: "rea_2", enfermero: donante }
    ],
    turnantes: [turnante],
    prioridad: ["pre_int_2", "sillon_2", "rea_2", "pre_int_1", "sillon_1"]
  });
  assert.equal(en(resultado, "pre_int_2"), turnante);
  assert.equal(en(resultado, "sillon_2"), donante);
});

probar("una vacante manual protegida no consume Turnante", () => {
  const turnante = persona("T1");
  const resultado = resolver({
    sectores: [
      { sectorId: "pre_int_1", enfermero: persona("Titular PRE INT 1") },
      { sectorId: "pre_int_2", enfermero: null, vacioManual: true }
    ],
    turnantes: [turnante],
    prioridad: ["pre_int_2", "pre_int_1"]
  });
  assert.equal(en(resultado, "pre_int_2"), null);
});

probar("una persona No Disponible no participa y el Turnante cubre su sector 2", () => {
  const ausente = persona("ausente", { disponible: false });
  const turnante = persona("T1");
  const resultado = resolver({
    sectores: [
      { sectorId: "pre_int_1", enfermero: persona("Titular PRE INT 1") },
      { sectorId: "pre_int_2", enfermero: ausente }
    ],
    turnantes: [turnante],
    prioridad: ["pre_int_2", "pre_int_1"]
  });
  assert.equal(en(resultado, "pre_int_2"), turnante);
  assert.equal(resultado.some((fila) => fila.enfermero === ausente), false);
});

probar("la prioridad invertida tampoco desplaza a Diego si hay Turnante directo", () => {
  const diego = persona("Diego");
  const turnante = persona("Valentina");
  const resultado = resolver({
    sectores: [
      { sectorId: "rea_2", enfermero: diego },
      { sectorId: "pre_int_1", enfermero: persona("Titular PRE INT 1") },
      { sectorId: "pre_int_2", enfermero: null }
    ],
    turnantes: [turnante],
    prioridad: ["rea_2", "pre_int_2", "pre_int_1"]
  });
  assert.equal(en(resultado, "rea_2"), diego);
  assert.equal(en(resultado, "pre_int_2"), turnante);
});

probar("un Extra mantiene precedencia sobre Turnante en una vacante ordinaria de sector 2", () => {
  const extra = persona("Extra", { tipoExtra: TIPOS_EXTRA.REFUERZO, origenExtra: "externo" });
  const turnante = persona("T1");
  const resultado = resolver({
    sectores: [
      { sectorId: "pre_int_1", enfermero: persona("Titular PRE INT 1") },
      { sectorId: "pre_int_2", enfermero: null }
    ],
    turnantes: [turnante],
    extras: [extra],
    prioridad: ["pre_int_2", "pre_int_1"]
  });
  assert.equal(en(resultado, "pre_int_2"), extra);
});

console.log(`\n${total} pruebas conductuales de Turnante directo aprobadas.`);
