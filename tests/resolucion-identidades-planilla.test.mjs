import assert from "node:assert/strict";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanillaDesdeFilas
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  enriquecerDistribucionConIdentidades,
  obtenerFilaActivaPorSectorId,
  obtenerFilaActivaPorTurnanteId,
  resolverAsignacionPorSectorId,
  resolverAsignacionPorTurnanteId,
  resolverClaveDistribucionParaFila
} from "../src/utils/resolucionIdentidadesPlanilla.js";

const firma = (valor) => JSON.stringify(valor);
const base = { turno: "tarde", categoria: "enfermero", mes: "2026-09" };
const persona = { personaId: "p1", nombre: "Persona Uno" };
let total = 0;
const probar = (nombre, prueba) => { prueba(); total += 1; console.log(`✓ ${total} ${nombre}`); };
const estadoSnapshot = ({ categoria = "enfermero", adicionales = [] } = {}) => {
  const estado = crearEstadoMensualVacio();
  estado.configuracionPlanilla = {
    [categoria]: crearSnapshotConfiguracionPlanilla({
      turno: "tarde", categoria, mes: "2026-09",
      posicionesMensualesAdicionales: adicionales
    })
  };
  return estado;
};

probar("sectorId resuelve fila snapshot", () => {
  const fila = obtenerFilaActivaPorSectorId({ estadoMensual: estadoSnapshot(), ...base, sectorId: "rea_1" });
  assert.equal(fila.filaId, "enfermero.sector.rea_1");
});
probar("boxes 20/22/24 asocia todos sus aliases con la fila efectiva vigente", () => {
  const estado = estadoSnapshot();
  estado.configuracionPlanilla.enfermero.filas.find(
    (fila) => fila.sectorId === "boxes_20_22_24"
  ).etiqueta = "20-22+24";
  for (const alias of ["20-22-24", "20-22+24", "19-22+24", "19-20+22-24", "20+22-24"]) {
    const resultado = resolverAsignacionPorSectorId({
      estadoMensual: estado,
      ...base,
      sectorId: "boxes_20_22_24",
      distribucion: { [alias]: persona }
    });
    assert.equal(resultado.filaId, "enfermero.sector.boxes_20_22_24");
    assert.equal(resultado.sectorId, "boxes_20_22_24");
    assert.equal(resultado.claveDistribucion, alias);
    assert.deepEqual(resultado.referencia, persona);
  }
});
probar("filaId y sectorId tienen prioridad sobre labels de boxes 20/22/24", () => {
  const estado = estadoSnapshot();
  const contexto = { estadoMensual: estado, ...base, sectorId: "boxes_20_22_24" };
  const porFilaId = resolverAsignacionPorSectorId({
    ...contexto,
    distribucion: {
      "enfermero.sector.boxes_20_22_24": { personaId: "fila-id" },
      "20+22-24": { personaId: "label" }
    }
  });
  assert.equal(porFilaId.claveDistribucion, "enfermero.sector.boxes_20_22_24");
  const porSectorId = resolverAsignacionPorSectorId({
    ...contexto,
    distribucion: {
      boxes_20_22_24: { personaId: "sector-id" },
      "20+22-24": { personaId: "label" }
    }
  });
  assert.equal(porSectorId.claveDistribucion, "boxes_20_22_24");
});
probar("sectorId resuelve agosto legacy sin crear snapshot", () => {
  const estado = crearEstadoMensualVacio(); const antes = firma(estado);
  const fila = obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, mes: "2026-08", sectorId: "rea_1" });
  assert.equal(fila.sectorId, "rea_1"); assert.equal(firma(estado), antes); assert.equal(estado.configuracionPlanilla, undefined);
});
probar("sector inactivo e inexistente retornan null", () => {
  const estado = estadoSnapshot(); estado.configuracionPlanilla.enfermero.filas.find((f) => f.sectorId === "rea_2").activo = false;
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, sectorId: "rea_2" }), null);
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, sectorId: "inventado" }), null);
});
probar("turnantes base T1 y T5 se resuelven por turnanteId", () => {
  const estado = estadoSnapshot();
  assert.equal(obtenerFilaActivaPorTurnanteId({ estadoMensual: estado, ...base, turnanteId: "turnante_1" }).etiqueta, "T1");
  assert.equal(obtenerFilaActivaPorTurnanteId({ estadoMensual: estado, ...base, turnanteId: "turnante_5" }).ordinalTurnante, 5);
});
probar("T6 activo resuelve y T6 inactivo no resuelve", () => {
  const estado = estadoSnapshot({ adicionales: ["T6"] });
  assert.equal(obtenerFilaActivaPorTurnanteId({ estadoMensual: estado, ...base, turnanteId: "turnante_6" }).etiqueta, "T6");
  estado.configuracionPlanilla.enfermero.filas.find((f) => f.turnanteId === "turnante_6").activo = false;
  assert.equal(obtenerFilaActivaPorTurnanteId({ estadoMensual: estado, ...base, turnanteId: "turnante_6" }), null);
});
probar("Licenciados T1 y T3 mensual se resuelven y respetan inactivo", () => {
  const contexto = { ...base, categoria: "licenciado" };
  const estado = estadoSnapshot({ categoria: "licenciado", adicionales: ["T3"] });
  assert.equal(obtenerFilaActivaPorTurnanteId({ estadoMensual: estado, ...contexto, turnanteId: "turnante_1" }).tipo, "turnante");
  assert.equal(obtenerFilaActivaPorTurnanteId({ estadoMensual: estado, ...contexto, turnanteId: "turnante_3" }).ordinalTurnante, 3);
  estado.configuracionPlanilla.licenciado.filas.find((f) => f.turnanteId === "turnante_3").activo = false;
  assert.equal(obtenerFilaActivaPorTurnanteId({ estadoMensual: estado, ...contexto, turnanteId: "turnante_3" }), null);
});
probar("clave exacta gana frente a aliases", () => {
  const fila = { tipo: "sector", etiqueta: "SILLÓN 1", sectorId: "sillon_1" };
  assert.equal(resolverClaveDistribucionParaFila({ distribucion: { "SILLON 1": 1, "SILLÓN 1": 2 }, fila }), "SILLÓN 1");
});
probar("aliases SILLÓN/SILLON se resuelven determinísticamente", () => {
  const fila = { tipo: "sector", etiqueta: "Nombre nuevo", sectorId: "sillon_1" };
  assert.equal(resolverClaveDistribucionParaFila({ distribucion: { "SILLON 1": 1 }, fila }), "SILLON 1");
  assert.equal(resolverClaveDistribucionParaFila({ distribucion: { "SILLON 1": 1, "SILLÓN 1": 2 }, fila }), "SILLÓN 1");
});
probar("Salud Mental y SM resuelven según la clave disponible", () => {
  for (const clave of ["Salud Mental", "SM"]) {
    const fila = { tipo: "sector", etiqueta: "Etiqueta futura", sectorId: "salud_mental" };
    assert.equal(resolverClaveDistribucionParaFila({ distribucion: { [clave]: persona }, fila }), clave);
  }
});
probar("Diagnóstico resuelve su variante histórica", () => {
  const fila = { tipo: "sector", etiqueta: "Diagnóstico futuro", sectorId: "diagnostico" };
  assert.equal(resolverClaveDistribucionParaFila({ distribucion: { Diagnostico: persona }, fila }), "Diagnostico");
});
probar("etiqueta renombrada conserva la clave histórica por sectorId", () => {
  const estado = estadoSnapshot();
  estado.configuracionPlanilla.enfermero.filas.find((f) => f.sectorId === "rea_1").etiqueta = "Reanimación Principal";
  const resultado = resolverAsignacionPorSectorId({ estadoMensual: estado, ...base, distribucion: { "REA 1": persona }, sectorId: "rea_1" });
  assert.equal(resultado.etiqueta, "Reanimación Principal"); assert.equal(resultado.claveDistribucion, "REA 1");
});
probar("no hay fuzzy matching ni IDs inventados", () => {
  const fila = { tipo: "sector", etiqueta: "REA Principal", sectorId: "rea_1" };
  assert.equal(resolverClaveDistribucionParaFila({ distribucion: { "REA numero uno": persona }, fila }), null);
  assert.equal(resolverClaveDistribucionParaFila({ distribucion: { "DESCONOCIDO": persona }, fila: { ...fila, sectorId: "desconocido" } }), null);
});
probar("asignación sector conserva todos los campos y la referencia", () => {
  const resultado = resolverAsignacionPorSectorId({ estadoMensual: estadoSnapshot(), ...base, distribucion: { "REA 1": persona }, sectorId: "rea_1" });
  assert.deepEqual({ filaId: resultado.filaId, tipo: resultado.tipo, sectorId: resultado.sectorId,
    turnanteId: resultado.turnanteId, ordinalTurnante: resultado.ordinalTurnante,
    clave: resultado.claveDistribucion, referencia: resultado.referencia },
  { filaId: "enfermero.sector.rea_1", tipo: "sector", sectorId: "rea_1", turnanteId: null,
    ordinalTurnante: null, clave: "REA 1", referencia: persona });
});
probar("asignación turnante usa turnanteId y ordinal", () => {
  const resultado = resolverAsignacionPorTurnanteId({ estadoMensual: estadoSnapshot(), ...base, distribucion: { T1: persona }, turnanteId: "turnante_1" });
  assert.equal(resultado.filaId, "enfermero.turnante.1"); assert.equal(resultado.ordinalTurnante, 1); assert.equal(resultado.referencia, persona);
});
probar("fila inactiva no resuelve aunque persista la clave", () => {
  const estado = estadoSnapshot(); estado.configuracionPlanilla.enfermero.filas.find((f) => f.sectorId === "rea_2").activo = false;
  assert.equal(resolverAsignacionPorSectorId({ estadoMensual: estado, ...base, distribucion: { "REA 2": persona }, sectorId: "rea_2" }), null);
});
probar("reordenar no altera identidad", () => {
  const estado = estadoSnapshot(); const filas = estado.configuracionPlanilla.enfermero.filas;
  filas.reverse().forEach((fila, orden) => { fila.orden = orden; });
  for (const sectorId of ["rea_1", "rea_2", "explora_1"]) assert.equal(
    obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, sectorId }).sectorId, sectorId
  );
});
probar("enriquecimiento es puro y reporta claves desconocidas", () => {
  const estado = estadoSnapshot(); const distribucion = { "REA 1": persona, EXTRAÑA: "x" };
  const firmas = [firma(estado), firma(distribucion), firma(configuracionSectores), firma(estado.configuracionPlanilla)];
  const resultado = enriquecerDistribucionConIdentidades({ estadoMensual: estado, ...base, distribucion });
  assert.equal(resultado.asignaciones[0].sectorId, "rea_1"); assert.deepEqual(resultado.noResueltas, ["EXTRAÑA"]);
  assert.deepEqual([firma(estado), firma(distribucion), firma(configuracionSectores), firma(estado.configuracionPlanilla)], firmas);
});
probar("categorías son independientes", () => {
  const estado = crearEstadoMensualVacio();
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, sectorId: "rea_1" }).sectorId, "rea_1");
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, categoria: "licenciado", sectorId: "rea_1" }), null);
});
probar("snapshot de turno o mes incorrecto no se usa", () => {
  const estado = estadoSnapshot(); estado.configuracionPlanilla.enfermero.filas.find((f) => f.sectorId === "rea_1").etiqueta = "Renombrada";
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, turno: "mañana", sectorId: "rea_1" }).etiqueta, "REA 1");
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, mes: "2026-10", sectorId: "rea_1" }).etiqueta, "REA 1");
});
probar("contexto incompleto retorna null de forma controlada", () => {
  assert.equal(obtenerFilaActivaPorSectorId({ sectorId: "rea_1" }), null);
  assert.equal(resolverAsignacionPorTurnanteId({ distribucion: { T1: persona }, turnanteId: "turnante_1" }), null);
});
probar("snapshot de entrada no comparte la fila devuelta", () => {
  const estado = estadoSnapshot(); const snapshotAntes = firma(estado.configuracionPlanilla);
  const fila = obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...base, sectorId: "rea_1" }); fila.etiqueta = "Cambio local";
  assert.equal(firma(estado.configuracionPlanilla), snapshotAntes);
});
probar("snapshot desde filas renombradas conserva aliases centrales", () => {
  const original = estadoSnapshot().configuracionPlanilla.enfermero;
  const filas = original.filas.map((fila) => fila.sectorId === "rea_1" ? { ...fila, etiqueta: "Reanimación Principal" } : fila);
  const snapshot = crearSnapshotConfiguracionPlanillaDesdeFilas({ turno: "tarde", categoria: "enfermero", mes: "2026-09", filas });
  const estado = { ...crearEstadoMensualVacio(), configuracionPlanilla: { enfermero: snapshot } };
  assert.equal(resolverAsignacionPorSectorId({ estadoMensual: estado, ...base, distribucion: { "REA 1": persona }, sectorId: "rea_1" }).claveDistribucion, "REA 1");
});

console.log(`\n${total} pruebas de resolución de identidades de Planilla superadas.`);
