import {
  obtenerConfiguracionPlanillaEfectiva,
  SECTORES_PLANILLA
} from "./configuracionPlanilla.js";
import { normalizar } from "./texto.js";

export const MODE_IDS_REDISTRIBUCION = Object.freeze({
  OPCION_1: "redistribucion_opcion_1",
  OPCION_2: "redistribucion_opcion_2"
});

export const SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION = Object.freeze([
  "boxes_1_3_21",
  "boxes_4_7",
  "boxes_8_13",
  "boxes_14_19",
  "boxes_20_22_24",
  "dx_25_30"
]);

const crearGrupo = (groupId, etiqueta, aliases = []) => Object.freeze({
  groupId,
  etiqueta,
  aliases: Object.freeze([...aliases])
});

const crearModo = (modeId, grupos) => Object.freeze({
  modeId,
  replacedSectorIds: SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION,
  groups: Object.freeze(grupos)
});

export const MODOS_REDISTRIBUCION = Object.freeze([
  crearModo(MODE_IDS_REDISTRIBUCION.OPCION_1, [
    crearGrupo("opcion_1_boxes_1_3_19_22", "1–3 + 19–22"),
    crearGrupo("opcion_1_boxes_4_10", "4–10"),
    crearGrupo("opcion_1_boxes_11_18", "11–18"),
    crearGrupo("opcion_1_boxes_23_30", "23–30")
  ]),
  crearModo(MODE_IDS_REDISTRIBUCION.OPCION_2, [
    crearGrupo("opcion_2_boxes_1_3_21_22", "1–3 + 21 y 22"),
    crearGrupo("opcion_2_boxes_4_7_30", "4–7 + 30"),
    crearGrupo("opcion_2_boxes_8_14", "8–14"),
    crearGrupo("opcion_2_boxes_15_20", "15–20"),
    crearGrupo("opcion_2_dx_23_29", "DX 23–29")
  ])
]);

const modosPorId = new Map(MODOS_REDISTRIBUCION.map((modo) => [modo.modeId, modo]));
const grupos = MODOS_REDISTRIBUCION.flatMap((modo) =>
  modo.groups.map((grupo) => Object.freeze({ ...grupo, modeId: modo.modeId }))
);
const gruposPorId = new Map(grupos.map((grupo) => [grupo.groupId, grupo]));
const gruposPorClaveHistorica = new Map(grupos.flatMap((grupo) =>
  [grupo.etiqueta, ...grupo.aliases].map((clave) => [normalizar(clave), grupo])
));

const copiarGrupo = (grupo) => grupo ? {
  groupId: grupo.groupId,
  modeId: grupo.modeId,
  etiqueta: grupo.etiqueta,
  aliases: [...grupo.aliases]
} : null;

const copiarModo = (modo) => modo ? {
  modeId: modo.modeId,
  replacedSectorIds: [...modo.replacedSectorIds],
  groups: modo.groups.map((grupo) => ({
    groupId: grupo.groupId,
    etiqueta: grupo.etiqueta,
    aliases: [...grupo.aliases]
  }))
} : null;

export const obtenerModoRedistribucionPorId = (modeId) =>
  copiarModo(modosPorId.get(modeId));

export const obtenerGrupoRedistribucionPorId = (groupId) =>
  copiarGrupo(gruposPorId.get(groupId));

export const obtenerGrupoRedistribucionPorEtiquetaHistorica = (etiqueta) => {
  if (typeof etiqueta !== "string" || !etiqueta) return null;
  return copiarGrupo(gruposPorClaveHistorica.get(normalizar(etiqueta)));
};

export const resolverGrupoRedistribucion = (identidad) =>
  obtenerGrupoRedistribucionPorId(identidad) ||
  obtenerGrupoRedistribucionPorEtiquetaHistorica(identidad);

export const obtenerEtiquetaGrupoRedistribucion = (groupId) =>
  gruposPorId.get(groupId)?.etiqueta || null;

export const obtenerClaveHistoricaGrupoRedistribucion = (groupId) => {
  const etiqueta = obtenerEtiquetaGrupoRedistribucion(groupId);
  return etiqueta ? normalizar(etiqueta) : null;
};

export const esClavePersistidaGrupoRedistribucion = (clave) =>
  obtenerGrupoRedistribucionPorEtiquetaHistorica(clave) !== null;

export const resolverSectoresReemplazadosRedistribucion = ({
  modeId,
  estadoMensual,
  turno,
  mes
} = {}) => {
  const modo = modosPorId.get(modeId);
  if (!modo) return null;
  const configuracion = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual,
    turno,
    categoria: "enfermero",
    mes
  });
  const filasPorSectorId = new Map((configuracion?.filas || [])
    .filter((fila) => fila?.tipo === "sector" && fila.sectorId)
    .map((fila) => [fila.sectorId, fila]));
  const copiarFila = (fila) => ({
    filaId: fila.filaId,
    tipo: fila.tipo,
    etiqueta: fila.etiqueta,
    sectorId: fila.sectorId,
    turnanteId: fila.turnanteId,
    ordinalTurnante: fila.ordinalTurnante,
    orden: fila.orden,
    activo: fila.activo
  });
  const sectoresConfigurados = modo.replacedSectorIds.flatMap((sectorId) =>
    filasPorSectorId.has(sectorId) ? [copiarFila(filasPorSectorId.get(sectorId))] : []
  );
  return {
    modeId: modo.modeId,
    replacedSectorIds: [...modo.replacedSectorIds],
    sectoresConfigurados,
    sectoresActivos: sectoresConfigurados.filter((fila) => fila.activo !== false),
    sectoresInactivos: sectoresConfigurados.filter((fila) => fila.activo === false),
    sectorIdsFaltantes: modo.replacedSectorIds.filter((sectorId) => !filasPorSectorId.has(sectorId))
  };
};

export const gruposRedistribucionEstanFueraDeSectoresPlanilla = () => {
  const sectorIds = new Set(SECTORES_PLANILLA.map((sector) => sector.sectorId));
  return grupos.every((grupo) => !sectorIds.has(grupo.groupId));
};
