import { configuracionSectores } from "../data/sectores.js";
import { normalizar } from "./texto.js";

export const TIPOS_FILA_PLANILLA = Object.freeze({
  SECTOR: "sector",
  TURNANTE: "turnante"
});

// [sectorId, etiqueta canónica, ...aliases históricos]
const DEFINICIONES_SECTORES = [
  ["rea_1", "REA 1"], ["rea_2", "REA 2"],
  ["explora_1", "EXPLORA 1"], ["explora_2", "EXPLORA 2"],
  ["boxes_1_3_21", "1-3 + 21"], ["pre_int_1", "PRE INT 1"],
  ["pre_int_2", "PRE INT 2"], ["dx_25_30", "DX 25-30"],
  ["boxes_8_13", "8-13"], ["boxes_4_7", "4-7"],
  ["sillon_1", "SILLÓN 1", "SILLON 1"],
  ["sillon_2", "SILLON 2", "SILLÓN 2"],
  ["sillones_3", "SILLONES 3", "SILLÓN 3", "SILLON 3"],
  ["boxes_14_19", "14-19"], ["boxes_20_22_24", "20-22-24"],
  ["salud_mental", "Salud Mental", "SM"],
  ["triage_1", "Triage 1"], ["triage_2", "Triage 2"],
  ["estabiliza", "Estabiliza"],
  ["reanimacion_sillones", "Reanimación + Sillones", "Reanimacion + Sillones"],
  ["observacion_1", "Observación 1", "Observacion 1"],
  ["observacion_2", "Observación 2", "Observacion 2"],
  ["explora", "Explora"], ["diagnostico", "Diagnostico", "Diagnóstico"],
  ["preinternacion", "Preinternación", "Preinternacion"]
];

export const SECTORES_PLANILLA = Object.freeze(DEFINICIONES_SECTORES.map(
  ([sectorId, etiqueta, ...aliases]) => Object.freeze({
    sectorId,
    etiqueta,
    aliases: Object.freeze([etiqueta, ...aliases])
  })
));

const indiceSectorPorAlias = new Map(SECTORES_PLANILLA.flatMap((sector) =>
  sector.aliases.map((alias) => [normalizar(alias), sector])
));
const indiceSectorPorId = new Map(SECTORES_PLANILLA.map((sector) => [sector.sectorId, sector]));

const inferirTipo = (configuracion) => configuracion === configuracionSectores.enfermero
  ? "enfermero"
  : configuracion === configuracionSectores.licenciado ? "licenciado" : "";

export const obtenerSectorIdPorNombreHistorico = (nombre) =>
  indiceSectorPorAlias.get(normalizar(nombre))?.sectorId || "";

export const obtenerEtiquetaSector = (sectorId, { tipo } = {}) => {
  if (sectorId === "salud_mental" && tipo === "enfermero") return "SM";
  return indiceSectorPorId.get(sectorId)?.etiqueta || "";
};

const crearFilaSector = ({ tipo, etiqueta, orden }) => {
  const sectorId = obtenerSectorIdPorNombreHistorico(etiqueta);
  if (!sectorId) throw new Error(`No existe un sectorId para la fila legacy: ${etiqueta}`);
  return Object.freeze({ filaId: `${tipo}.sector.${sectorId}`, tipo: TIPOS_FILA_PLANILLA.SECTOR,
    etiqueta, sectorId, turnanteId: null, ordinalTurnante: null, orden, activo: true });
};

const crearFilaTurnante = ({ tipo, etiqueta, orden }) => {
  const ordinal = Number(String(etiqueta).replace(/^T/i, ""));
  return Object.freeze({ filaId: `${tipo}.turnante.${ordinal}`, tipo: TIPOS_FILA_PLANILLA.TURNANTE,
    etiqueta, sectorId: null, turnanteId: `turnante_${ordinal}`,
    ordinalTurnante: ordinal, orden, activo: true });
};

const TURNANTE_ADICIONAL = Object.freeze({ enfermero: "T6", licenciado: "T3" });

export const adaptarConfiguracionLegacyPlanilla = (configuracion = {}, tipoSolicitado = "") => {
  const tipo = tipoSolicitado || inferirTipo(configuracion);
  if (!tipo) throw new Error("La categoría de la configuración de Planilla es obligatoria.");
  const filas = [];
  let indiceTurnante = 0;
  const posiciones = new Set(configuracion.posicionesTurnantes || []);
  (configuracion.sectoresFijos || []).forEach((etiqueta, indiceSector) => {
    filas.push(crearFilaSector({ tipo, etiqueta, orden: filas.length }));
    if (!posiciones.has(indiceSector)) return;
    const etiquetaTurnante = configuracion.turnantes?.[indiceTurnante];
    indiceTurnante += 1;
    if (etiquetaTurnante) filas.push(crearFilaTurnante({ tipo, etiqueta: etiquetaTurnante, orden: filas.length }));
  });
  return filas;
};

export const obtenerConfiguracionLegacyPlanilla = (tipo) => {
  const configuracion = configuracionSectores[tipo];
  if (!configuracion) throw new Error(`Categoría de Planilla desconocida: ${tipo}`);
  return Object.freeze({ tipo, filas: Object.freeze(adaptarConfiguracionLegacyPlanilla(configuracion, tipo)) });
};

export const obtenerFilasConfiguracionEfectivas = (tipo, planilla = {}) => {
  const filas = [...obtenerConfiguracionLegacyPlanilla(tipo).filas];
  const etiqueta = TURNANTE_ADICIONAL[tipo];
  if (etiqueta && planilla?.posicionesMensualesAdicionales?.includes(etiqueta)) {
    filas.push(crearFilaTurnante({ tipo, etiqueta, orden: filas.length }));
  }
  return filas;
};

export const obtenerFilasActivas = (filas = []) => filas.filter((fila) => fila?.activo !== false);

export const obtenerTurnantesBase = (tipo) =>
  obtenerFilasActivas(obtenerConfiguracionLegacyPlanilla(tipo).filas)
    .filter((fila) => fila.tipo === TIPOS_FILA_PLANILLA.TURNANTE);

export const obtenerEtiquetasFilasPlanilla = (filas = []) =>
  obtenerFilasActivas(filas).map((fila) => fila.etiqueta);
