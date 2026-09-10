import assert from "node:assert/strict";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import {
  redistribuirCritica,
  redistribuirPorBoxes
} from "../src/utils/redistribucionEnfermeros.js";
import {
  MODOS_REDISTRIBUCION_DIARIA,
  resolverDistribucionDiaria
} from "../src/utils/resolverDistribucionDiaria.js";
import { normalizar } from "../src/utils/texto.js";
import { incorporarPersonasSinAsignar } from "../src/utils/pipelineCalendarioDiario.js";
import {
  DESTINOS_DINAMICOS_ENFERMEROS,
  resolverDestinosDinamicosCalendario
} from "../src/utils/destinosDinamicosCalendario.js";
import { dividirReanimacionSillones } from "../src/utils/reanimacionSillones.js";

const persona = (id, atributos = {}) => ({ id, nombre: id, ...atributos });
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const configuracion = crearSnapshotConfiguracionPlanilla({
  turno: "manana", categoria: "enfermero", mes: "2026-09"
});
const filasConfiguracion = configuracion.filas;
const filasPorId = new Map(filasConfiguracion.map((fila) => [fila.sectorId, fila]));
const ordenVisual = filasConfiguracion.map((fila) => fila.etiqueta);
const prioridadSectorIds = filasConfiguracion
  .filter((fila) => fila.tipo === "sector")
  .map((fila) => fila.sectorId);
const base = [
  ["rea_1", persona("rea-1")],
  ["rea_2", persona("rea-2")],
  ["boxes_1_3_21", persona("boxes-1")],
  ["boxes_4_7", persona("boxes-4")],
  ["boxes_8_13", persona("boxes-8")],
  ["boxes_14_19", persona("boxes-14")],
  ["boxes_20_22_24", persona("boxes-20")],
  ["dx_25_30", persona("dx")],
  ["explora_1", persona("explora-1")],
  ["explora_2", persona("explora-2")],
  ["sillon_1", persona("sillon-1")],
  ["sillon_2", persona("sillon-2")],
  ["pre_int_1", persona("pre-1")],
  ["pre_int_2", persona("pre-2")],
  ["salud_mental", persona("sm")]
].map(([sectorId, enfermero]) => ({
  nombre: filasPorId.get(sectorId)?.etiqueta || sectorId,
  sectorId,
  enfermero,
  tipo: "sector"
}));

const generar = (modo) => resolverDistribucionDiaria({
  asignacionBase: base,
  prioridadSectorIds,
  modoRedistribucion: modo,
  contextoRedistribucion: {
    accion: "generar", ordenVisual, filasConfiguracion, prioridadSectorIds
  }
});
const firma = (filas) => filas.map((fila) => [fila.nombre, fila.enfermero?.id || null]);
const trazaPersona = (resultado, personaId, causa) => resultado.trazas.find(
  (traza) => traza.personaId === personaId && (!causa || traza.causa === causa)
);
const validarIdentidadGlobal = ({ asignaciones, sinAsignar = [] }) => {
  const asignadas = asignaciones.map((fila) => fila.enfermero?.id).filter(Boolean);
  const libres = sinAsignar.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(new Set(asignadas).size, asignadas.length);
  assert.equal(new Set(libres).size, libres.length);
  assert.equal(libres.some((id) => asignadas.includes(id)), false);
};
const componerResultadoVisible = ({ asignaciones, sobrantes = [], retornos = [], reintegros = [] }) => {
  const dinamicos = resolverDestinosDinamicosCalendario({
    destinos: DESTINOS_DINAMICOS_ENFERMEROS,
    sobrantes,
    habilitarAutomaticos: !asignaciones.some((fila) => !fila.enfermero)
  });
  return incorporarPersonasSinAsignar({
    asignaciones: incorporarPersonasSinAsignar({
      asignaciones: incorporarPersonasSinAsignar({
        asignaciones: [...asignaciones, ...dinamicos.asignaciones],
        personas: dinamicos.sobrantes
      }),
      personas: retornos
    }),
    personas: reintegros
  });
};

let total = 0;
const probar = (nombre, prueba) => {
  prueba(); total += 1; console.log(`✓ ${total} ${nombre}`);
};

probar("opción 1 deriva origen y destino del paralelismo aprobado", () => {
  const resultado = generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_1);
  assert.deepEqual(trazaPersona(resultado, "id:boxes-1", "opcion_1"), {
    personaId: "id:boxes-1",
    origenSectorId: "boxes_1_3_21",
    destinoSectorId: "opcion_1_boxes_1_3_19_22",
    causa: "opcion_1"
  });
  assert.equal(trazaPersona(resultado, "id:rea-2", "opcion_1").destinoSectorId, "rea_2");
});

probar("opción 2 deriva origen y destino del paralelismo aprobado", () => {
  const resultado = generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_2);
  assert.deepEqual(trazaPersona(resultado, "id:boxes-14", "opcion_2"), {
    personaId: "id:boxes-14",
    origenSectorId: "boxes_14_19",
    destinoSectorId: "opcion_2_boxes_15_20",
    causa: "opcion_2"
  });
  assert.equal(trazaPersona(resultado, "id:rea-2", "opcion_2").destinoSectorId, "rea_2");
});

probar("opción 1 informa ambos recursos liberados sin decidir su uso", () => {
  const resultado = generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_1);
  const liberados = resultado.trazas.filter((traza) => traza.causa === "recurso_liberado");
  assert.deepEqual(liberados.map((traza) => traza.personaId), ["id:boxes-14", "id:boxes-20"]);
  assert.equal(liberados.every((traza) => traza.destinoSectorId === null), true);
});

probar("opción 2 informa sólo el recurso de su sector anulado", () => {
  const resultado = generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_2);
  const liberados = resultado.trazas.filter((traza) => traza.causa === "recurso_liberado");
  assert.deepEqual(liberados.map((traza) => traza.origenSectorId), ["boxes_20_22_24"]);
});

probar("las asignaciones siguen siendo idénticas a los helpers aprobados", () => {
  const parametros = { asignaciones: base, ordenVisual, filasConfiguracion, prioridadSectorIds };
  assert.deepEqual(firma(generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_1).asignaciones),
    firma(redistribuirCritica(parametros).asignaciones));
  assert.deepEqual(firma(generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_2).asignaciones),
    firma(redistribuirPorBoxes(parametros).asignaciones));
});

probar("Sin asignar excluye identidades ya asignadas y elimina repetidos", () => {
  const titular = persona("titular");
  const sobrante = persona("sobrante");
  const resultado = resolverDistribucionDiaria({
    asignacionBase: [{ nombre: "A", sectorId: "a", tipo: "sector", enfermero: titular }],
    personalEfectivo: [titular, sobrante],
    personasSinAsignar: [titular, sobrante, sobrante]
  });
  assert.deepEqual(resultado.sinAsignar.map((fila) => fila.enfermero.id), ["sobrante"]);
  validarIdentidadGlobal(resultado);
});

probar("Turnante usado no queda simultáneamente Sin asignar", () => {
  const turnante = persona("turnante", { esTurnante: true });
  const resultado = resolverDistribucionDiaria({
    asignacionBase: [
      { nombre: "A", sectorId: "a", tipo: "sector", enfermero: null },
      { nombre: "T1", turnanteId: "turnante_1", tipo: "turnante", enfermero: turnante }
    ],
    personalEfectivo: [turnante], personasSinAsignar: [turnante]
  });
  assert.equal(resultado.asignaciones[0].enfermero, turnante);
  assert.equal(resultado.sinAsignar.length, 0);
  validarIdentidadGlobal(resultado);
});

probar("Extra usado no queda simultáneamente Sin asignar", () => {
  const extra = persona("extra", { esExtra: true });
  const resultado = resolverDistribucionDiaria({
    asignacionBase: [{ nombre: "A", sectorId: "a", tipo: "sector", enfermero: null }],
    extras: [extra], personalEfectivo: [extra], personasSinAsignar: [extra]
  });
  assert.equal(resultado.asignaciones[0].enfermero, extra);
  assert.equal(resultado.sinAsignar.length, 0);
  validarIdentidadGlobal(resultado);
});

probar("manual y pareja conservan causas derivadas sin sustituir procedencias", () => {
  const titular = persona("titular");
  const manual = resolverDistribucionDiaria({
    asignacionBase: [{ nombre: "Manual", sectorId: "manual", tipo: "sector",
      enfermero: titular, cambioManualProtegido: true }]
  });
  assert.equal(manual.trazas[0].causa, "manual");
  const baseManual = base.map((fila) => fila.sectorId === "rea_2"
    ? { ...fila, cambioManualProtegido: true }
    : fila);
  const redistribucionManual = resolverDistribucionDiaria({
    asignacionBase: baseManual,
    prioridadSectorIds,
    modoRedistribucion: MODOS_REDISTRIBUCION_DIARIA.OPCION_1,
    contextoRedistribucion: {
      accion: "generar", ordenVisual, filasConfiguracion, prioridadSectorIds
    }
  });
  assert.equal(trazaPersona(redistribucionManual, "id:rea-2", "manual").destinoSectorId, "rea_2");
  assert.equal(redistribucionManual.procedencias[normalizar("REA 2")], "manual");
  const pareja = resolverDistribucionDiaria({
    asignacionBase: [
      { nombre: "REA 1", sectorId: "rea_1", tipo: "sector", enfermero: null },
      { nombre: "REA 2", sectorId: "rea_2", tipo: "sector", enfermero: titular }
    ],
    personalEfectivo: [titular], prioridadSectorIds: ["rea_1", "rea_2"],
    reglasParejas: { categoria: "enfermero", distribucionBase: {}, cambiosDia: {} }
  });
  assert.equal(pareja.trazas.find((traza) => traza.destinoSectorId === "rea_1").causa,
    "pareja_2_a_1");
});

probar("mismo input conserva asignaciones, Sin asignar y trazas", () => {
  const primero = generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_1);
  const segundo = generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_1);
  assert.deepEqual(segundo.asignaciones, primero.asignaciones);
  assert.deepEqual(segundo.trazas, primero.trazas);
});

probar("fallback legacy sin pool es determinista y no afecta la ruta moderna", () => {
  const entradaLegacy = base.slice(0, 3);
  const parametros = {
    asignaciones: entradaLegacy,
    ordenVisual,
    filasConfiguracion: filasConfiguracion.filter((fila) => fila.tipo !== "turnante"),
    prioridadSectorIds
  };
  const primero = redistribuirCritica(parametros);
  const segundo = redistribuirCritica(parametros);
  assert.deepEqual(segundo, primero);
  assert.equal(Object.hasOwn(primero, "trazasDerivadas"), false);
  assert.equal(generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_1).trazas.some(
    (traza) => traza.origenSectorId === "boxes_1_3_21"
  ), true);
});

probar("metadata de orden irrelevante no altera el resultado", () => {
  const contextoA = { accion: "generar", ordenVisual, filasConfiguracion, prioridadSectorIds,
    metadata: { a: 1, b: 2 } };
  const contextoB = { accion: "generar", ordenVisual, filasConfiguracion, prioridadSectorIds,
    metadata: { b: 2, a: 1 } };
  const resolver = (contextoRedistribucion) => resolverDistribucionDiaria({
    asignacionBase: base, prioridadSectorIds,
    modoRedistribucion: MODOS_REDISTRIBUCION_DIARIA.OPCION_2, contextoRedistribucion
  });
  assert.deepEqual(resolver(contextoB), resolver(contextoA));
});

probar("la trazabilidad adicional no muta ninguna entrada", () => {
  const asignaciones = copiar(base);
  const filas = copiar(filasConfiguracion);
  const prioridad = [...prioridadSectorIds];
  const antes = copiar({ asignaciones, filas, prioridad });
  resolverDistribucionDiaria({
    asignacionBase: asignaciones, prioridadSectorIds: prioridad,
    modoRedistribucion: MODOS_REDISTRIBUCION_DIARIA.OPCION_1,
    contextoRedistribucion: { accion: "generar", ordenVisual, filasConfiguracion: filas,
      prioridadSectorIds: prioridad }
  });
  assert.deepEqual({ asignaciones, filas, prioridad }, antes);
});

probar("la composición visible final mantiene separados asignados y Sin asignar", () => {
  const asignado = persona("asignado");
  const dinamico = persona("dinamico");
  const libre = persona("libre");
  const retorno = persona("retorno");
  const reintegro = persona("reintegro");
  const resultado = componerResultadoVisible({
    asignaciones: [{ nombre: "A", sectorId: "a", tipo: "sector", enfermero: asignado }],
    sobrantes: [dinamico, libre],
    retornos: [asignado, retorno, retorno],
    reintegros: [dinamico, reintegro, reintegro]
  });
  const asignacionesActivas = resultado.filter((fila) => fila.nombre !== "SIN ASIGNAR");
  const sinAsignar = resultado.filter((fila) => fila.nombre === "SIN ASIGNAR");
  validarIdentidadGlobal({ asignaciones: asignacionesActivas, sinAsignar });
  assert.equal(asignacionesActivas.some((fila) => fila.enfermero.id === "dinamico"), true);
  assert.deepEqual(sinAsignar.map((fila) => fila.enfermero.id), ["libre", "retorno", "reintegro"]);
});

probar("recurso liberado usado por opción 1 no reaparece como sobrante", () => {
  const resultado = generar(MODOS_REDISTRIBUCION_DIARIA.OPCION_1);
  const visibles = componerResultadoVisible({
    asignaciones: resultado.asignaciones,
    sobrantes: base.map((fila) => fila.enfermero)
  });
  const ids = visibles.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id === "boxes-14").length, 1);
  assert.equal(ids.filter((id) => id === "boxes-20").length, 1);
});

probar("recurso liberado sin lugar en el pool aparece una sola vez como sobrante", () => {
  const filasConUnTurnante = filasConfiguracion.filter((fila) =>
    fila.tipo !== "turnante" || fila.turnanteId === "turnante_1"
  );
  const generado = resolverDistribucionDiaria({
    asignacionBase: base,
    prioridadSectorIds,
    modoRedistribucion: MODOS_REDISTRIBUCION_DIARIA.OPCION_1,
    contextoRedistribucion: {
      accion: "generar", ordenVisual, filasConfiguracion: filasConUnTurnante,
      prioridadSectorIds
    }
  });
  const asignadas = new Set(generado.asignaciones.map((fila) => fila.enfermero?.id).filter(Boolean));
  const sobrantes = base.map((fila) => fila.enfermero).filter((actual) => !asignadas.has(actual.id));
  const visibles = incorporarPersonasSinAsignar({ asignaciones: generado.asignaciones, personas: sobrantes });
  const libres = visibles.filter((fila) => fila.nombre === "SIN ASIGNAR");
  assert.deepEqual(libres.map((fila) => fila.enfermero.id), ["boxes-20"]);
  validarIdentidadGlobal({
    asignaciones: visibles.filter((fila) => fila.nombre !== "SIN ASIGNAR"),
    sinAsignar: libres
  });
});

probar("retorno de ausencia y reintegro sólo aparecen si no terminaron asignados", () => {
  const titular = persona("titular");
  const retorno = persona("retorno");
  const reintegro = persona("reintegro");
  const visibles = componerResultadoVisible({
    asignaciones: [
      { nombre: "A", sectorId: "a", tipo: "sector", enfermero: titular },
      { nombre: "B", sectorId: "b", tipo: "sector", enfermero: retorno }
    ],
    retornos: [retorno, reintegro],
    reintegros: [titular, reintegro]
  });
  assert.deepEqual(visibles.filter((fila) => fila.nombre === "SIN ASIGNAR")
    .map((fila) => fila.enfermero.id), ["reintegro"]);
});

probar("destino dinámico de Licenciados no conserva la misma identidad como sobrante", () => {
  const baseLicenciado = persona("lic-base");
  const adicional = persona("lic-adicional");
  const division = dividirReanimacionSillones({
    asignaciones: [{
      nombre: "Reanimación + Sillones", sectorId: "reanimacion_sillones",
      tipo: "sector", enfermero: baseLicenciado
    }],
    sobrantes: [adicional],
    categoria: "licenciado",
    personalDisponible: [baseLicenciado, adicional],
    ordenVisual: ["Reanimación + Sillones", "SIN ASIGNAR"]
  });
  const asignadas = division.asignaciones.filter((fila) => fila.nombre !== "SIN ASIGNAR");
  const libres = division.asignaciones.filter((fila) => fila.nombre === "SIN ASIGNAR");
  validarIdentidadGlobal({ asignaciones: asignadas, sinAsignar: libres });
  assert.equal(asignadas.filter((fila) => fila.enfermero?.id === "lic-adicional").length, 1);
  assert.equal(libres.length, 0);
});

console.log(`\n${total} comprobaciones conductuales de trazas e invariantes aprobadas.`);
