import {
  obtenerConfiguracionLegacyPlanilla,
  obtenerConfiguracionPlanillaEfectiva
} from "./configuracionPlanilla.js";

export const CATEGORIAS_PLANTILLA_PLANILLA = Object.freeze([
  "enfermero",
  "licenciado"
]);

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

const crearBorradorCategoria = ({ estadoMensual, turno, categoria, mes }) => {
  const efectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual, turno, categoria, mes
  });
  const filasFuente = efectiva?.filas ?? obtenerConfiguracionLegacyPlanilla(categoria).filas;
  return {
    turnoId: turno,
    categoria,
    mesOrigen: mes,
    filas: filasFuente.map(copiarFila).sort((a, b) => a.orden - b.orden)
  };
};

export const crearBorradoresConfiguracionPlanilla = ({
  estadoMensual,
  turno,
  mes
} = {}) => Object.fromEntries(CATEGORIAS_PLANTILLA_PLANILLA.map((categoria) => [
  categoria,
  crearBorradorCategoria({ estadoMensual, turno, categoria, mes })
]));

export const obtenerBorradorConfiguracionPlanilla = (borradores, categoria) =>
  borradores?.[categoria] ?? null;
