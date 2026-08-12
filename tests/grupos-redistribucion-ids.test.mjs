import assert from "node:assert/strict";
import fs from "node:fs";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  SECTORES_PLANILLA
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  esClavePersistidaGrupoRedistribucion,
  gruposRedistribucionEstanFueraDeSectoresPlanilla,
  MODE_IDS_REDISTRIBUCION,
  MODOS_REDISTRIBUCION,
  obtenerClaveHistoricaGrupoRedistribucion,
  obtenerEtiquetaGrupoRedistribucion,
  obtenerGrupoRedistribucionPorEtiquetaHistorica,
  obtenerGrupoRedistribucionPorId,
  obtenerModoRedistribucionPorId,
  resolverGrupoRedistribucion,
  resolverSectoresReemplazadosRedistribucion,
  SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION
} from "../src/utils/gruposRedistribucion.js";
import {
  SECTORES_REDISTRIBUCION_BOXES,
  SECTORES_REDISTRIBUCION_OPCION_1
} from "../src/utils/redistribucionEnfermeros.js";
import { normalizar } from "../src/utils/texto.js";

const firma = (valor) => JSON.stringify(valor);
const contexto = { turno: "tarde", mes: "2026-09" };
let total = 0;
const probar = (nombre, prueba) => { prueba(); total += 1; console.log(`✓ ${total} ${nombre}`); };
const crearEstadoSnapshot = () => {
  const estado = crearEstadoMensualVacio();
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({
      turno: contexto.turno,
      categoria: "enfermero",
      mes: contexto.mes
    })
  };
  return estado;
};

probar("existen dos modeId estables y únicos", () => {
  assert.deepEqual(Object.values(MODE_IDS_REDISTRIBUCION), ["redistribucion_opcion_1", "redistribucion_opcion_2"]);
  assert.equal(new Set(MODOS_REDISTRIBUCION.map((modo) => modo.modeId)).size, 2);
});
probar("opción 1 tiene cuatro grupos y opción 2 cinco", () => {
  assert.equal(obtenerModoRedistribucionPorId(MODE_IDS_REDISTRIBUCION.OPCION_1).groups.length, 4);
  assert.equal(obtenerModoRedistribucionPorId(MODE_IDS_REDISTRIBUCION.OPCION_2).groups.length, 5);
});
probar("todos los groupId son únicos y no son sectorId", () => {
  const ids = MODOS_REDISTRIBUCION.flatMap((modo) => modo.groups.map((grupo) => grupo.groupId));
  const sectorIds = new Set(SECTORES_PLANILLA.map((sector) => sector.sectorId));
  assert.equal(new Set(ids).size, 9);
  assert.equal(ids.some((id) => sectorIds.has(id)), false);
  assert.equal(gruposRedistribucionEstanFueraDeSectoresPlanilla(), true);
});
probar("ningún grupo expone sectorId ni filaId ni membresía inventada", () => {
  for (const grupo of MODOS_REDISTRIBUCION.flatMap((modo) => modo.groups)) {
    assert.equal(Object.hasOwn(grupo, "sectorId"), false);
    assert.equal(Object.hasOwn(grupo, "filaId"), false);
    assert.equal(Object.hasOwn(grupo, "memberSectorIds"), false);
  }
});
probar("ambos modos comparten exactamente seis sectorId reemplazados", () => {
  const esperados = ["boxes_1_3_21", "boxes_4_7", "boxes_8_13", "boxes_14_19", "boxes_20_22_24", "dx_25_30"];
  assert.deepEqual(SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION, esperados);
  for (const modo of MODOS_REDISTRIBUCION) assert.deepEqual(modo.replacedSectorIds, esperados);
});
probar("los seis sectorId existen en Enfermeros", () => {
  const ids = new Set(SECTORES_PLANILLA.map((sector) => sector.sectorId));
  assert.equal(SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION.every((id) => ids.has(id)), true);
});
probar("etiquetas históricas de opción 1 resuelven sus groupId", () => {
  for (const grupo of MODOS_REDISTRIBUCION[0].groups) {
    assert.equal(obtenerGrupoRedistribucionPorEtiquetaHistorica(grupo.etiqueta).groupId, grupo.groupId);
    assert.equal(esClavePersistidaGrupoRedistribucion(normalizar(grupo.etiqueta)), true);
  }
});
probar("etiquetas históricas de opción 2 resuelven sus groupId", () => {
  for (const grupo of MODOS_REDISTRIBUCION[1].groups) {
    assert.equal(resolverGrupoRedistribucion(grupo.etiqueta).groupId, grupo.groupId);
    assert.equal(resolverGrupoRedistribucion(grupo.groupId).groupId, grupo.groupId);
  }
});
probar("groupId resuelve etiqueta y clave histórica normalizada", () => {
  const grupo = MODOS_REDISTRIBUCION[0].groups[0];
  assert.equal(obtenerEtiquetaGrupoRedistribucion(grupo.groupId), grupo.etiqueta);
  assert.equal(obtenerClaveHistoricaGrupoRedistribucion(grupo.groupId), normalizar(grupo.etiqueta));
});
probar("clave desconocida y coincidencia parcial devuelven null", () => {
  assert.equal(obtenerGrupoRedistribucionPorId("desconocido"), null);
  assert.equal(obtenerGrupoRedistribucionPorEtiquetaHistorica("4–10 extra"), null);
  assert.equal(obtenerGrupoRedistribucionPorEtiquetaHistorica("4–"), null);
});
probar("snapshot renombrado resuelve sectores por ID", () => {
  const estado = crearEstadoSnapshot();
  estado.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === "boxes_4_7").etiqueta = "Boxes centrales";
  const resultado = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_1, estadoMensual: estado, ...contexto });
  assert.equal(resultado.sectoresConfigurados.find((fila) => fila.sectorId === "boxes_4_7").etiqueta, "Boxes centrales");
});
probar("Drag & Drop no modifica identidad ni orden canónico reportado", () => {
  const estado = crearEstadoSnapshot();
  estado.configuracionPlanilla.enfermero.filas.reverse().forEach((fila, orden) => { fila.orden = orden; });
  const resultado = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_2, estadoMensual: estado, ...contexto });
  assert.deepEqual(resultado.sectoresConfigurados.map((fila) => fila.sectorId), SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION);
});
probar("fila inactiva se informa sin crear otro grupo", () => {
  const estado = crearEstadoSnapshot();
  estado.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === "boxes_8_13").activo = false;
  const resultado = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_1, estadoMensual: estado, ...contexto });
  assert.deepEqual(resultado.sectoresInactivos.map((fila) => fila.sectorId), ["boxes_8_13"]);
  assert.equal(resultado.sectoresActivos.length, 5);
  assert.equal(obtenerModoRedistribucionPorId(resultado.modeId).groups.length, 4);
});
probar("agosto legacy resuelve seis sectores sin crear snapshot ni mutar estado", () => {
  const estado = crearEstadoMensualVacio(); const antes = firma(estado);
  const resultado = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_1, estadoMensual: estado, turno: "tarde", mes: "2026-08" });
  assert.equal(resultado.sectoresConfigurados.length, 6);
  assert.deepEqual(resultado.sectorIdsFaltantes, []);
  assert.equal(firma(estado), antes);
  assert.equal(estado.configuracionPlanilla, undefined);
});
probar("helpers no mutan configuración, snapshot ni cambiosDia", () => {
  const estado = crearEstadoSnapshot(); const cambiosDia = { dia: { "4–10": "persona" } };
  const antes = [firma(configuracionSectores), firma(estado), firma(cambiosDia)];
  resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_2, estadoMensual: estado, ...contexto });
  resolverGrupoRedistribucion("4–10");
  assert.deepEqual([firma(configuracionSectores), firma(estado), firma(cambiosDia)], antes);
});
probar("grupos no se agregan a SECTORES_PLANILLA ni a snapshots", () => {
  const groupIds = new Set(MODOS_REDISTRIBUCION.flatMap((modo) => modo.groups.map((grupo) => grupo.groupId)));
  assert.equal(SECTORES_PLANILLA.some((sector) => groupIds.has(sector.sectorId)), false);
  assert.equal(crearEstadoSnapshot().configuracionPlanilla.enfermero.filas.some((fila) => groupIds.has(fila.sectorId)), false);
});
probar("catálogos legacy conservan exactamente etiquetas y orden", () => {
  assert.deepEqual(SECTORES_REDISTRIBUCION_OPCION_1, MODOS_REDISTRIBUCION[0].groups.map((grupo) => grupo.etiqueta));
  assert.deepEqual(SECTORES_REDISTRIBUCION_BOXES, MODOS_REDISTRIBUCION[1].groups.map((grupo) => grupo.etiqueta));
});
probar("modo desconocido no altera configuración", () => {
  assert.equal(obtenerModoRedistribucionPorId("otro"), null);
  assert.equal(resolverSectoresReemplazadosRedistribucion({ modeId: "otro" }), null);
});
probar("algoritmos, paro y Reanimación + Sillones permanecen fuera del catálogo", () => {
  const catalogo = fs.readFileSync(new URL("../src/utils/gruposRedistribucion.js", import.meta.url), "utf8");
  const redistribucion = fs.readFileSync(new URL("../src/utils/redistribucionEnfermeros.js", import.meta.url), "utf8");
  assert.doesNotMatch(catalogo, /crearRedistribucion|redistribuirCritica|redistribuirPorBoxes|sectoresParo|prioridadesParo|cambiosParoDia|Reanimaci[oó]n \+ Sillones/);
  assert.match(redistribucion, /const crearRedistribucion/);
  assert.match(redistribucion, /export const redistribuirCritica/);
  assert.match(redistribucion, /export const redistribuirPorBoxes/);
});

console.log(`\n${total} pruebas de grupos de redistribución por identidad pasaron.`);
