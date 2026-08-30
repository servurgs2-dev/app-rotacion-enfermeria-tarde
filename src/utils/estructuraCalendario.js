import {
  obtenerFilasActivas,
  obtenerSectorIdPorNombreHistorico
} from "./configuracionPlanilla.js";

const MARCADORES_ORDEN = new Set(["DIVIDER", "SIN ASIGNAR"]);
const SECTORES_BOXES_CON_ETIQUETA_POR_TURNO = new Set([
  "boxes_14_19",
  "boxes_20_22_24"
]);

const resolverOrdenOperativo = ({ sectores, ordenVisualLegacy }) => {
  const sectoresPorId = new Map(sectores.map((fila) => [fila.sectorId, fila]));
  const incluidos = new Set();
  const orden = [];

  ordenVisualLegacy.forEach((item) => {
    if (MARCADORES_ORDEN.has(item)) {
      orden.push(item);
      return;
    }
    const sectorId = obtenerSectorIdPorNombreHistorico(item);
    const fila = sectoresPorId.get(sectorId);
    if (!fila || incluidos.has(sectorId)) return;
    orden.push(fila.etiqueta);
    incluidos.add(sectorId);
  });

  const faltantes = sectores.filter((fila) => !incluidos.has(fila.sectorId));
  const indiceSinAsignar = orden.lastIndexOf("SIN ASIGNAR");
  orden.splice(indiceSinAsignar < 0 ? orden.length : indiceSinAsignar, 0,
    ...faltantes.map((fila) => fila.etiqueta));
  return orden;
};

const resolverEtiquetasBoxesEnOrdenLegacy = ({ sectores, ordenVisualLegacy }) => {
  const etiquetasPorSectorId = new Map(sectores
    .filter(({ sectorId }) => SECTORES_BOXES_CON_ETIQUETA_POR_TURNO.has(sectorId))
    .map(({ sectorId, etiqueta }) => [sectorId, etiqueta]));
  return ordenVisualLegacy.map((item) => {
    const sectorId = obtenerSectorIdPorNombreHistorico(item);
    return etiquetasPorSectorId.get(sectorId) || item;
  });
};

export const resolverEstructuraCalendario = ({
  configuracionEfectiva,
  ordenVisualLegacy = []
} = {}) => {
  const filasConfiguracion = obtenerFilasActivas(configuracionEfectiva?.filas)
    .sort((filaA, filaB) => filaA.orden - filaB.orden);
  const filas = filasConfiguracion.map((fila) => fila.etiqueta);
  const turnantes = filasConfiguracion
    .filter((fila) => fila.tipo === "turnante")
    .map((fila) => fila.etiqueta);
  const sectores = filasConfiguracion
    .filter((fila) => fila.tipo === "sector");
  return {
    filasConfiguracion,
    filas,
    turnantes,
    sectores: sectores.map((fila) => fila.etiqueta),
    ordenVisual: configuracionEfectiva?.schemaVersion === null
      ? resolverEtiquetasBoxesEnOrdenLegacy({ sectores, ordenVisualLegacy })
      : resolverOrdenOperativo({ sectores, ordenVisualLegacy })
  };
};
