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

export const normalizarOrdenFilasBorrador = (filas = []) =>
  filas.map((fila, orden) => ({ ...fila, orden }));

export const moverFilaBorrador = (borrador, filaId, direccion) => {
  if (!borrador || !Array.isArray(borrador.filas)) return borrador;
  const filasOrdenadas = [...borrador.filas].sort((a, b) => a.orden - b.orden);
  const indice = filasOrdenadas.findIndex((fila) => fila.filaId === filaId);
  const desplazamiento = direccion === "arriba" ? -1 : direccion === "abajo" ? 1 : 0;
  const destino = indice + desplazamiento;
  if (indice < 0 || desplazamiento === 0 || destino < 0 || destino >= filasOrdenadas.length) {
    return borrador;
  }
  const filasMovidas = [...filasOrdenadas];
  [filasMovidas[indice], filasMovidas[destino]] = [
    filasMovidas[destino], filasMovidas[indice]
  ];
  return { ...borrador, filas: normalizarOrdenFilasBorrador(filasMovidas) };
};

export const cambiarActivoFilaBorrador = (borrador, filaId, activo) => {
  if (!borrador || !Array.isArray(borrador.filas)) return borrador;
  const indice = borrador.filas.findIndex((fila) => fila.filaId === filaId);
  if (indice < 0 || borrador.filas[indice].activo === activo) return borrador;
  return {
    ...borrador,
    filas: borrador.filas.map((fila) =>
      fila.filaId === filaId ? { ...fila, activo } : fila
    )
  };
};
