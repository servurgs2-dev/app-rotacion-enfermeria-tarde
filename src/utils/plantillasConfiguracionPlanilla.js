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

export const moverFilaBorradorAIndice = (borrador, filaId, indiceDestino) => {
  if (!borrador || !Array.isArray(borrador.filas)) return borrador;
  const filasOrdenadas = [...borrador.filas].sort((a, b) => a.orden - b.orden);
  const indiceOrigen = filasOrdenadas.findIndex((fila) => fila.filaId === filaId);
  if (indiceOrigen < 0 || !Number.isInteger(indiceDestino)) return borrador;
  const destino = Math.max(0, Math.min(indiceDestino, filasOrdenadas.length - 1));
  if (indiceOrigen === destino) return borrador;
  const filasMovidas = [...filasOrdenadas];
  const [filaMovida] = filasMovidas.splice(indiceOrigen, 1);
  filasMovidas.splice(destino, 0, filaMovida);
  return { ...borrador, filas: normalizarOrdenFilasBorrador(filasMovidas) };
};

export const moverFilaBorrador = (borrador, filaId, direccion) => {
  if (!borrador || !Array.isArray(borrador.filas)) return borrador;
  const filasOrdenadas = [...borrador.filas].sort((a, b) => a.orden - b.orden);
  const indice = filasOrdenadas.findIndex((fila) => fila.filaId === filaId);
  const desplazamiento = direccion === "arriba" ? -1 : direccion === "abajo" ? 1 : 0;
  const destino = indice + desplazamiento;
  if (indice < 0 || desplazamiento === 0 || destino < 0 || destino >= filasOrdenadas.length) {
    return borrador;
  }
  return moverFilaBorradorAIndice(borrador, filaId, destino);
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

const errorValidacion = (categoria, detalle) => ({
  ok: false,
  mensaje: `La estructura de ${categoria === "enfermero" ? "Enfermeros" : "Licenciados"} no es válida: ${detalle}`
});

export const validarBorradorConfiguracionPlanilla = ({
  borrador,
  turno,
  categoria,
  mesOrigen
} = {}) => {
  if (!borrador || typeof borrador !== "object" || Array.isArray(borrador)) {
    return errorValidacion(categoria, "falta el borrador.");
  }
  if (borrador.turnoId !== turno || borrador.categoria !== categoria ||
      borrador.mesOrigen !== mesOrigen) {
    return errorValidacion(categoria, "el contexto de turno o mes no coincide.");
  }
  if (!Array.isArray(borrador.filas) || borrador.filas.length === 0) {
    return errorValidacion(categoria, "las filas son obligatorias.");
  }
  const filaIds = new Set();
  const sectorIds = new Set();
  const turnanteIds = new Set();
  const ordenes = new Set();
  for (const fila of borrador.filas) {
    if (!fila || typeof fila !== "object" || Array.isArray(fila)) {
      return errorValidacion(categoria, "existe una fila inválida.");
    }
    if (typeof fila.filaId !== "string" || !fila.filaId.trim()) {
      return errorValidacion(categoria, "todas las filas deben conservar filaId.");
    }
    if (filaIds.has(fila.filaId)) return errorValidacion(categoria, `filaId duplicado: ${fila.filaId}.`);
    filaIds.add(fila.filaId);
    if (!Number.isInteger(fila.orden) || fila.orden < 0 || ordenes.has(fila.orden)) {
      return errorValidacion(categoria, "el orden debe contener enteros únicos no negativos.");
    }
    ordenes.add(fila.orden);
    if (!['sector', 'turnante'].includes(fila.tipo)) {
      return errorValidacion(categoria, `tipo inválido en ${fila.filaId}.`);
    }
    if (typeof fila.etiqueta !== "string" || !fila.etiqueta.trim()) {
      return errorValidacion(categoria, `falta la etiqueta en ${fila.filaId}.`);
    }
    if (typeof fila.activo !== "boolean") {
      return errorValidacion(categoria, `el estado activo es inválido en ${fila.filaId}.`);
    }
    if (fila.tipo === "sector") {
      if (typeof fila.sectorId !== "string" || !fila.sectorId.trim()) {
        return errorValidacion(categoria, `falta sectorId en ${fila.filaId}.`);
      }
      if (sectorIds.has(fila.sectorId)) return errorValidacion(categoria, `sectorId duplicado: ${fila.sectorId}.`);
      sectorIds.add(fila.sectorId);
    } else {
      if (typeof fila.turnanteId !== "string" || !fila.turnanteId.trim()) {
        return errorValidacion(categoria, `falta turnanteId en ${fila.filaId}.`);
      }
      if (!Number.isInteger(fila.ordinalTurnante) || fila.ordinalTurnante <= 0) {
        return errorValidacion(categoria, `ordinalTurnante inválido en ${fila.filaId}.`);
      }
      if (turnanteIds.has(fila.turnanteId)) return errorValidacion(categoria, `turnanteId duplicado: ${fila.turnanteId}.`);
      turnanteIds.add(fila.turnanteId);
    }
  }
  return {
    ok: true,
    borrador: {
      turnoId: borrador.turnoId,
      categoria: borrador.categoria,
      mesOrigen: borrador.mesOrigen,
      filas: normalizarOrdenFilasBorrador(
        [...borrador.filas].sort((a, b) => a.orden - b.orden)
      )
    }
  };
};

export const validarBorradoresConfiguracionPlanilla = ({
  borradores,
  turno,
  mesOrigen
} = {}) => {
  if (!turno || !mesOrigen) return { ok: false, mensaje: "Falta el contexto de la estructura a confirmar." };
  const validados = {};
  for (const categoria of CATEGORIAS_PLANTILLA_PLANILLA) {
    const resultado = validarBorradorConfiguracionPlanilla({
      borrador: borradores?.[categoria], turno, categoria, mesOrigen
    });
    if (!resultado.ok) return resultado;
    validados[categoria] = resultado.borrador;
  }
  return { ok: true, borradores: validados };
};
