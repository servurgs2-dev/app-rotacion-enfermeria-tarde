import assert from "node:assert/strict";
import fs from "node:fs";
import { resolverDistribucionLicenciadosLegacy } from "../src/utils/resolverDistribucionLicenciadosLegacy.js";
import { resolverDistribucionDiaria } from "../src/utils/resolverDistribucionDiaria.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { aplicarPrioridadGeneralPorSectorId } from "../src/utils/prioridadesSectores.js";
import { esExtraCobertura } from "../src/utils/extrasPersonas.js";
import { obtenerClaveIdentidadPersona } from "../src/utils/identidadPersonas.js";

const persona = (id, atributos = {}) => ({ id, nombre: id, categoria: "licenciado", ...atributos });
const sector = (sectorId, enfermero = null, atributos = {}) => ({
  nombre: sectorId, sectorId, enfermero, tipo: "sector", ...atributos
});
const turnante = (turnanteId, enfermero) => ({
  nombre: turnanteId, turnanteId, enfermero, tipo: "turnante"
});
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const firma = ({ asignaciones, sobrantes }) => ({
  destinos: asignaciones.map((fila) => [fila.sectorId, fila.enfermero?.id || null]),
  sobrantes: sobrantes.map((actual) => actual.id)
});

const resolverAprobado = ({
  asignaciones = [], personal = [], personasSinAsignar = personal, extras = [],
  prioridadSectorIds = [], esPersonaDisponible = () => true,
  esPersonaDisponibleParaCobertura = esPersonaDisponible,
  identidadesExcluidasSinAsignar = []
} = {}) => {
  const primeraFase = resolverTurnantesYCoberturasOperativas({
    asignaciones, extras, personal, esPersonaDisponible,
    esPersonaDisponibleParaCobertura, prioridadSectorIds: [],
    sectorIdsDonantes: [], ajustarSectores: (sectores) => sectores
  }).asignaciones;
  const finales = aplicarPrioridadGeneralPorSectorId({
    asignaciones: primeraFase, prioridadSectorIds,
    esPersonaDisponible
  });
  const vistas = new Set([
    ...finales.map((fila) => obtenerClaveIdentidadPersona(fila.enfermero)).filter(Boolean),
    ...identidadesExcluidasSinAsignar
  ]);
  const sobrantes = [...personasSinAsignar, ...extras].filter((actual) => {
    const identidad = obtenerClaveIdentidadPersona(actual);
    if (!actual || !identidad || !esPersonaDisponible(actual) ||
        esExtraCobertura(actual) || vistas.has(identidad)) return false;
    vistas.add(identidad);
    return true;
  });
  return { asignaciones: finales, sobrantes };
};

let total = 0;
const probar = (nombre, fn) => {
  fn(); total += 1; console.log(`✓ ${total} ${nombre}`);
};
const comparar = (entrada) => assert.deepEqual(
  firma(resolverDistribucionLicenciadosLegacy(entrada)),
  firma(resolverAprobado(entrada))
);

probar("el orquestador común no cubre por sí solo los sobrantes del contrato legacy", () => {
  const t1 = persona("t1", { esTurnante: true });
  const extra = persona("extra", { esExtra: true });
  const entradaLegacy = {
    asignaciones: [sector("baja"), sector("alta"), turnante("t1", t1)],
    personal: [t1], personasSinAsignar: [t1], extras: [extra],
    prioridadSectorIds: ["alta", "baja"]
  };
  const aprobado = resolverAprobado(entradaLegacy);
  const comun = resolverDistribucionDiaria({
    asignacionBase: entradaLegacy.asignaciones,
    personalEfectivo: entradaLegacy.personal,
    personasSinAsignar: entradaLegacy.personasSinAsignar,
    extras: entradaLegacy.extras,
    prioridadSectorIds: entradaLegacy.prioridadSectorIds
  });
  assert.deepEqual(firma(aprobado).destinos, [
    ["baja", "extra"], ["alta", "t1"]
  ]);
  assert.deepEqual(comun.asignaciones.map((fila) => [fila.sectorId, fila.enfermero?.id || null]), [
    ["baja", "t1"], ["alta", "extra"]
  ]);
});

probar("prioridad legacy usa disponibilidad general y no disponibilidad de cobertura", () => {
  const extra = persona("extra", { esExtra: true });
  const entrada = {
    asignaciones: [sector("baja"), sector("alta")],
    personal: [], extras: [extra], prioridadSectorIds: ["alta", "baja"],
    esPersonaDisponible: () => true,
    esPersonaDisponibleParaCobertura: (actual) => actual.id !== "extra"
  };
  const aprobado = resolverAprobado(entrada);
  const integrado = resolverDistribucionLicenciadosLegacy(entrada);
  assert.deepEqual(firma(aprobado).destinos, [["baja", null], ["alta", "extra"]]);
  assert.deepEqual(firma(integrado), firma(aprobado));
});

probar("distribución base equivale al pipeline aprobado", () => {
  const a = persona("a");
  comparar({ asignaciones: [sector("triage_1", a), sector("observacion_1")], personal: [a], prioridadSectorIds: ["triage_1", "observacion_1"] });
});

probar("Turnante en vacante de reemplazo conserva equivalencia", () => {
  const t1 = persona("t1", { esTurnante: true });
  comparar({ asignaciones: [sector("triage_1", null, { reemplazo: true }), turnante("t1", t1)], personal: [t1], prioridadSectorIds: ["triage_1"] });
});

probar("Extra en vacante ordinaria conserva equivalencia", () => {
  const t1 = persona("t1", { esTurnante: true });
  const extra = persona("extra", { esExtra: true });
  comparar({ asignaciones: [sector("triage_1"), turnante("t1", t1)], personal: [t1], extras: [extra], prioridadSectorIds: ["triage_1"] });
});

probar("prioridad personalizada conserva persona y destino", () => {
  const baja = persona("baja");
  comparar({ asignaciones: [sector("alta"), sector("media"), sector("baja", baja)], personal: [baja], prioridadSectorIds: ["media", "baja", "alta"] });
});

probar("prioridad posterior a Turnante conserva equivalencia", () => {
  const t1 = persona("t1", { esTurnante: true });
  const baja = persona("baja");
  comparar({ asignaciones: [sector("alta", null, { reemplazo: true }), sector("media"), sector("baja", baja), turnante("t1", t1)], personal: [t1, baja], prioridadSectorIds: ["alta", "media", "baja"] });
});

probar("prioridad posterior a Extra conserva equivalencia", () => {
  const extra = persona("extra", { esExtra: true });
  const baja = persona("baja");
  comparar({ asignaciones: [sector("alta"), sector("media"), sector("baja", baja)], personal: [baja], extras: [extra], prioridadSectorIds: ["alta", "media", "baja"] });
});

probar("movimiento manual protegido conserva equivalencia", () => {
  const manual = persona("manual");
  comparar({ asignaciones: [sector("alta"), sector("baja", manual, { cambioManualProtegido: true })], personal: [manual], prioridadSectorIds: ["alta", "baja"] });
});

probar("vacío manual conserva equivalencia", () => {
  const t1 = persona("t1", { esTurnante: true });
  const extra = persona("extra", { esExtra: true });
  comparar({ asignaciones: [sector("alta", null, { vacioManual: true }), turnante("t1", t1)], personal: [t1], extras: [extra], prioridadSectorIds: ["alta"] });
});

probar("sobrantes y Sin asignar conservan identidad única", () => {
  const titular = persona("titular");
  const sobrante = persona("sobrante");
  const resultado = resolverDistribucionLicenciadosLegacy({
    asignaciones: [sector("alta", titular)], personal: [titular, sobrante, sobrante]
  });
  comparar({ asignaciones: [sector("alta", titular)], personal: [titular, sobrante, sobrante] });
  assert.deepEqual(resultado.sobrantes.map(({ id }) => id), ["sobrante"]);
});

probar("personasSinAsignar reproduce los filtros finales de Calendario", () => {
  const titular = persona("titular");
  const fueraDePersonalFiltrado = persona("fuera");
  const reintegroRepresentado = persona("reintegro");
  const extraUsado = persona("extra-usado", { esExtra: true });
  const extraSobrante = persona("extra-sobrante", { esExtra: true });
  const extraCobertura = persona("extra-cobertura", {
    esExtra: true, tipoExtra: "cobertura"
  });
  const resultado = resolverDistribucionLicenciadosLegacy({
    asignaciones: [sector("ocupado", titular), sector("vacante")],
    personal: [titular, fueraDePersonalFiltrado, reintegroRepresentado],
    personasSinAsignar: [titular, reintegroRepresentado],
    extras: [extraUsado, extraSobrante, extraCobertura],
    identidadesExcluidasSinAsignar: [obtenerClaveIdentidadPersona(reintegroRepresentado)]
  });
  assert.equal(
    resultado.asignaciones.find((fila) => fila.sectorId === "vacante")?.enfermero?.id,
    "extra-usado"
  );
  assert.deepEqual(resultado.sobrantes.map(({ id }) => id), ["extra-sobrante"]);
  assert.equal(
    resultado.sobrantes.some(({ id }) => id === fueraDePersonalFiltrado.id),
    false
  );
});

probar("indisponibilidad canónica conserva equivalencia", () => {
  const ausente = persona("ausente");
  const disponible = persona("disponible");
  const entrada = {
    asignaciones: [sector("alta", ausente), sector("baja", disponible)],
    personal: [ausente, disponible], prioridadSectorIds: ["alta", "baja"],
    esPersonaDisponible: (actual) => actual.id !== "ausente"
  };
  comparar(entrada);
  assert.equal(resolverDistribucionLicenciadosLegacy(entrada).asignaciones.some((fila) => fila.enfermero?.id === "ausente"), false);
});

probar("mismos inputs producen el mismo resultado", () => {
  const titular = persona("titular");
  const entrada = { asignaciones: [sector("alta"), sector("baja", titular)], personal: [titular], prioridadSectorIds: ["alta", "baja"] };
  assert.deepEqual(firma(resolverDistribucionLicenciadosLegacy(entrada)), firma(resolverDistribucionLicenciadosLegacy(entrada)));
});

probar("la nueva frontera no muta entradas", () => {
  const titular = persona("titular");
  const entrada = { asignaciones: [sector("alta"), sector("baja", titular)], personal: [titular], extras: [], prioridadSectorIds: ["alta", "baja"], identidadesExcluidasSinAsignar: ["id:otro"] };
  const antes = copiar(entrada);
  resolverDistribucionLicenciadosLegacy(entrada);
  assert.deepEqual(entrada, antes);
});

probar("Calendario usa una sola frontera para Licenciados legacy", () => {
  const fuente = fs.readFileSync(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8");
  assert.match(fuente, /resolverDistribucionLicenciadosLegacy\(\{/);
  assert.doesNotMatch(fuente, /resolverTurnantesYCoberturasOperativas\(\{/);
  assert.doesNotMatch(fuente, /aplicarPrioridadGeneralPorSectorId\(\{/);
});

console.log(`\n${total} comprobaciones de integración de Licenciados legacy aprobadas.`);
