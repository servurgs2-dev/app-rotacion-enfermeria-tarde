import assert from "node:assert/strict";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  debeUsarCalendarioLicenciadosDinamicoVisible,
  resolverCalendarioLicenciadosDinamico
} from "../src/utils/calendarioLicenciadosDinamico.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { aplicarPrioridadGeneralPorSectorId } from "../src/utils/prioridadesSectores.js";
import { incorporarPersonasSinAsignar } from "../src/utils/pipelineCalendarioDiario.js";
import { obtenerClaveIdentidadPersona } from "../src/utils/identidadPersonas.js";
import { esExtraCobertura } from "../src/utils/extrasPersonas.js";
import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_LEGACY
} from "../src/utils/estructuraLicenciadosDinamica.js";

const persona = (id, atributos = {}) => ({ id, nombre: id, categoria: "licenciado", ...atributos });
const sector = (sectorId, enfermero = null, atributos = {}) => ({
  nombre: sectorId, sectorId, enfermero, tipo: "sector", ...atributos
});
const turnante = (turnanteId, enfermero) => ({
  nombre: turnanteId, turnanteId, enfermero, tipo: "turnante"
});
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const ids = (filas) => filas.map((fila) => fila.enfermero?.id).filter(Boolean);
const en = (filas, sectorId) => filas.find((fila) => fila.sectorId === sectorId)?.enfermero || null;

// Reproduce la composición productiva legacy de Calendario sin copiar algoritmos:
// motor compartido sin prioridad, prioridad externa y agregado final de sobrantes.
const resolverLegacy = ({
  asignaciones = [], personal = [], extras = [], prioridadSectorIds = [],
  esPersonaDisponible = () => true
} = {}) => {
  const primeraFase = resolverTurnantesYCoberturasOperativas({
    asignaciones,
    extras,
    personal,
    esPersonaDisponible,
    esPersonaDisponibleParaCobertura: esPersonaDisponible,
    prioridadSectorIds: [],
    sectorIdsDonantes: [],
    ajustarSectores: (sectores) => sectores
  }).asignaciones;
  const priorizadas = aplicarPrioridadGeneralPorSectorId({
    asignaciones: primeraFase,
    prioridadSectorIds,
    esPersonaDisponible
  });
  const asignadas = new Set(priorizadas
    .map((fila) => obtenerClaveIdentidadPersona(fila.enfermero)).filter(Boolean));
  const vistas = new Set(asignadas);
  const sobrantes = [...personal, ...extras].filter((actual) => {
    const identidad = obtenerClaveIdentidadPersona(actual);
    if (!actual || !identidad || !esPersonaDisponible(actual) ||
        esExtraCobertura(actual) || vistas.has(identidad)) return false;
    vistas.add(identidad);
    return true;
  });
  return incorporarPersonasSinAsignar({ asignaciones: priorizadas, personas: sobrantes });
};

const validarUnicidad = (resultado) => {
  const asignadas = resultado.filter((fila) => fila.nombre !== "SIN ASIGNAR");
  const libres = resultado.filter((fila) => fila.nombre === "SIN ASIGNAR");
  const assignedIds = ids(asignadas);
  const unassignedIds = ids(libres);
  assert.equal(new Set(assignedIds).size, assignedIds.length);
  assert.equal(new Set(unassignedIds).size, unassignedIds.length);
  assert.equal(unassignedIds.some((id) => assignedIds.includes(id)), false);
};

let total = 0;
const probar = (nombre, prueba) => {
  prueba(); total += 1; console.log(`✓ ${total} ${nombre}`);
};

probar("la configuración sin versión selecciona inequívocamente Licenciados legacy", () => {
  const configuracionLegacy = { filas: [] };
  assert.equal(resolverVersionEstructuraLicenciados(configuracionLegacy),
    VERSION_ESTRUCTURA_LICENCIADOS_LEGACY);
  const resultadoV2 = resolverCalendarioLicenciadosDinamico({
    versionEstructura: configuracionLegacy
  });
  assert.equal(resultadoV2.aplicar, false);
  assert.equal(resultadoV2.motivo, "ESTRUCTURA_LICENCIADOS_LEGACY");
  assert.equal(debeUsarCalendarioLicenciadosDinamicoVisible({ resultado: resultadoV2 }), false);
});

probar("la distribución base conserva titulares y vacantes sin recursos", () => {
  const a = persona("a");
  const resultado = resolverLegacy({
    asignaciones: [sector("triage_1", a), sector("observacion_1")],
    personal: [a], prioridadSectorIds: ["triage_1", "observacion_1"]
  });
  assert.equal(en(resultado, "triage_1"), a);
  assert.equal(en(resultado, "observacion_1"), null);
});

probar("un Turnante cubre primero una vacante de reemplazo", () => {
  const t1 = persona("t1", { esTurnante: true });
  const resultado = resolverLegacy({
    asignaciones: [sector("triage_1", null, { reemplazo: true }), turnante("turnante_1", t1)],
    personal: [t1], prioridadSectorIds: ["triage_1"]
  });
  assert.equal(en(resultado, "triage_1"), t1);
  assert.equal(resultado.some((fila) => fila.nombre === "SIN ASIGNAR" && fila.enfermero === t1), false);
});

probar("un Extra de refuerzo cubre una vacante ordinaria antes que el Turnante", () => {
  const t1 = persona("t1", { esTurnante: true });
  const extra = persona("extra", { esExtra: true });
  const resultado = resolverLegacy({
    asignaciones: [sector("triage_1"), turnante("turnante_1", t1)],
    personal: [t1], extras: [extra], prioridadSectorIds: ["triage_1"]
  });
  assert.equal(en(resultado, "triage_1"), extra);
  assert.equal(resultado.filter((fila) => fila.nombre === "SIN ASIGNAR")[0].enfermero, t1);
});

probar("un Extra sobrante aparece una sola vez en Sin asignar", () => {
  const titular = persona("titular");
  const extra = persona("extra", { esExtra: true });
  const resultado = resolverLegacy({
    asignaciones: [sector("triage_1", titular)],
    personal: [titular], extras: [extra, extra], prioridadSectorIds: ["triage_1"]
  });
  assert.deepEqual(resultado.filter((fila) => fila.nombre === "SIN ASIGNAR")
    .map((fila) => fila.enfermero.id), ["extra"]);
});

probar("la prioridad legacy por defecto mueve sólo desde menor hacia mayor prioridad", () => {
  const baja = persona("baja");
  const prioridad = configuracionSectores.licenciado.prioridadSectoresIds;
  const resultado = resolverLegacy({
    asignaciones: [sector("triage_1"), sector("salud_mental", baja)],
    personal: [baja], prioridadSectorIds: prioridad
  });
  assert.equal(en(resultado, "triage_1"), baja);
  assert.equal(en(resultado, "salud_mental"), null);
});

probar("una prioridad personalizada distinta cambia el destino de forma determinista", () => {
  const titular = persona("titular");
  const asignaciones = [sector("alta"), sector("media"), sector("baja", titular)];
  const alta = resolverLegacy({
    asignaciones, personal: [titular], prioridadSectorIds: ["alta", "media", "baja"]
  });
  const media = resolverLegacy({
    asignaciones, personal: [titular], prioridadSectorIds: ["media", "baja", "alta"]
  });
  assert.equal(en(alta, "alta"), titular);
  assert.equal(en(media, "media"), titular);
});

probar("el doble paso Turnante luego prioridad conserva el resultado actual", () => {
  const t1 = persona("t1", { esTurnante: true });
  const baja = persona("baja");
  const resultado = resolverLegacy({
    asignaciones: [
      sector("alta", null, { reemplazo: true }),
      sector("media"),
      sector("baja", baja),
      turnante("turnante_1", t1)
    ],
    personal: [t1, baja], prioridadSectorIds: ["alta", "media", "baja"]
  });
  assert.equal(en(resultado, "alta"), t1);
  assert.equal(en(resultado, "media"), baja);
  assert.equal(en(resultado, "baja"), null);
});

probar("el doble paso Extra luego prioridad no reubica al Extra ya consumido", () => {
  const extra = persona("extra", { esExtra: true });
  const baja = persona("baja");
  const resultado = resolverLegacy({
    asignaciones: [sector("alta"), sector("media"), sector("baja", baja)],
    personal: [baja], extras: [extra], prioridadSectorIds: ["alta", "media", "baja"]
  });
  assert.equal(en(resultado, "alta"), extra);
  assert.equal(en(resultado, "media"), baja);
  assert.equal(en(resultado, "baja"), null);
});

probar("un movimiento manual protegido no se usa como donante", () => {
  const manual = persona("manual");
  const resultado = resolverLegacy({
    asignaciones: [sector("alta"), sector("baja", manual, { cambioManualProtegido: true })],
    personal: [manual], prioridadSectorIds: ["alta", "baja"]
  });
  assert.equal(en(resultado, "alta"), null);
  assert.equal(en(resultado, "baja"), manual);
});

probar("un vacío manual permanece vacío frente a Turnantes y Extras", () => {
  const t1 = persona("t1", { esTurnante: true });
  const extra = persona("extra", { esExtra: true });
  const resultado = resolverLegacy({
    asignaciones: [sector("alta", null, { vacioManual: true }), turnante("turnante_1", t1)],
    personal: [t1], extras: [extra], prioridadSectorIds: ["alta"]
  });
  assert.equal(en(resultado, "alta"), null);
  assert.deepEqual(resultado.filter((fila) => fila.nombre === "SIN ASIGNAR")
    .map((fila) => fila.enfermero.id), ["t1", "extra"]);
});

probar("el fixture completo conserva identidad global y sobrante real", () => {
  const titular = persona("titular");
  const t1 = persona("t1", { esTurnante: true });
  const extra = persona("extra", { esExtra: true });
  const sobrante = persona("sobrante");
  const resultado = resolverLegacy({
    asignaciones: [
      sector("alta", null, { reemplazo: true }), sector("media"),
      sector("baja", titular), sector("manual", persona("manual"), { cambioManualProtegido: true }),
      turnante("turnante_1", t1)
    ],
    personal: [titular, t1, sobrante, persona("manual")],
    extras: [extra], prioridadSectorIds: ["alta", "media", "baja", "manual"]
  });
  assert.equal(en(resultado, "alta"), t1);
  assert.equal(en(resultado, "media"), extra);
  assert.equal(en(resultado, "baja"), titular);
  assert.deepEqual(resultado.filter((fila) => fila.nombre === "SIN ASIGNAR")
    .map((fila) => fila.enfermero.id), ["sobrante"]);
  validarUnicidad(resultado);
});

probar("una persona indisponible no participa ni reaparece", () => {
  const ausente = persona("ausente");
  const disponible = persona("disponible");
  const resultado = resolverLegacy({
    asignaciones: [sector("alta", ausente), sector("baja", disponible)],
    personal: [ausente, disponible], prioridadSectorIds: ["alta", "baja"],
    esPersonaDisponible: (actual) => actual.id !== "ausente"
  });
  assert.equal(ids(resultado).includes("ausente"), false);
  assert.equal(en(resultado, "alta"), disponible);
});

probar("mismos inputs canónicos producen siempre el mismo resultado", () => {
  const titular = persona("titular");
  const t1 = persona("t1", { esTurnante: true });
  const entrada = {
    asignaciones: [sector("alta", null, { reemplazo: true }), sector("baja", titular),
      turnante("turnante_1", t1)],
    personal: [titular, t1], prioridadSectorIds: ["alta", "baja"]
  };
  assert.deepEqual(resolverLegacy(entrada), resolverLegacy(entrada));
});

probar("el pipeline compuesto no muta asignaciones, personal, Extras ni prioridad", () => {
  const entrada = {
    asignaciones: [sector("alta"), turnante("turnante_1", persona("t1"))],
    personal: [persona("t1")],
    extras: [persona("extra", { esExtra: true })],
    prioridadSectorIds: ["alta"]
  };
  const antes = copiar(entrada);
  resolverLegacy(entrada);
  assert.deepEqual(entrada, antes);
});

console.log(`\n${total} comprobaciones conductuales de Licenciados legacy aprobadas.`);
