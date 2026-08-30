import {
  obtenerAliasesSector,
  obtenerConfiguracionPlanillaEfectiva,
  obtenerFilasActivas
} from "./configuracionPlanilla.js";
import { normalizar } from "./texto.js";

const tieneTexto = (valor) => typeof valor === "string" && valor.trim().length > 0;
const esDistribucion = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const copiarFila = (fila) => fila ? {
  filaId: fila.filaId,
  tipo: fila.tipo,
  etiqueta: fila.etiqueta,
  sectorId: fila.sectorId,
  turnanteId: fila.turnanteId,
  ordinalTurnante: fila.ordinalTurnante,
  orden: fila.orden,
  activo: fila.activo
} : null;

const obtenerFilasActivasContexto = (contexto) => {
  const configuracion = obtenerConfiguracionPlanillaEfectiva(contexto);
  return obtenerFilasActivas(configuracion?.filas);
};

export const obtenerFilaActivaPorSectorId = ({ sectorId, ...contexto } = {}) => {
  if (!tieneTexto(sectorId)) return null;
  return copiarFila(obtenerFilasActivasContexto(contexto).find(
    (fila) => fila.tipo === "sector" && fila.sectorId === sectorId.trim()
  ));
};

export const obtenerFilaActivaPorTurnanteId = ({ turnanteId, ...contexto } = {}) => {
  if (!tieneTexto(turnanteId)) return null;
  return copiarFila(obtenerFilasActivasContexto(contexto).find(
    (fila) => fila.tipo === "turnante" && fila.turnanteId === turnanteId.trim()
  ));
};

const clavesHistoricasFila = (fila) => {
  if (fila?.tipo === "sector" && tieneTexto(fila.sectorId)) {
    return obtenerAliasesSector(fila.sectorId);
  }
  if (fila?.tipo === "turnante" && Number.isInteger(fila.ordinalTurnante)) {
    return [`T${fila.ordinalTurnante}`];
  }
  return [];
};

const clavesEstablesFila = (fila) => [
  fila?.filaId,
  fila?.tipo === "sector" ? fila?.sectorId : fila?.turnanteId
].filter(tieneTexto);

export const resolverClaveDistribucionParaFila = ({ distribucion, fila } = {}) => {
  if (!esDistribucion(distribucion) || !fila) return null;
  for (const claveEstable of clavesEstablesFila(fila)) {
    if (Object.hasOwn(distribucion, claveEstable)) return claveEstable;
  }
  if (tieneTexto(fila.etiqueta) && Object.hasOwn(distribucion, fila.etiqueta)) {
    return fila.etiqueta;
  }
  for (const alias of clavesHistoricasFila(fila)) {
    if (alias !== fila.etiqueta && Object.hasOwn(distribucion, alias)) return alias;
  }
  const candidatasNormalizadas = new Set(
    [fila.etiqueta, ...clavesHistoricasFila(fila)]
      .filter(tieneTexto)
      .map(normalizar)
  );
  for (const clave of Object.keys(distribucion)) {
    if (candidatasNormalizadas.has(normalizar(clave))) return clave;
  }
  return null;
};

export const resolverClaveNormalizadaParaFila = ({ distribucion, fila } = {}) => {
  if (!esDistribucion(distribucion) || !fila) return null;
  const candidatas = [...clavesEstablesFila(fila), fila.etiqueta, ...clavesHistoricasFila(fila)]
    .filter(tieneTexto)
    .map(normalizar);
  for (const candidata of [...new Set(candidatas)]) {
    if (Object.hasOwn(distribucion, candidata)) return candidata;
  }
  return null;
};

const resolverAsignacion = ({ fila, distribucion }) => {
  const claveDistribucion = resolverClaveDistribucionParaFila({ distribucion, fila });
  if (!fila || claveDistribucion === null) return null;
  return {
    ...copiarFila(fila),
    claveDistribucion,
    referencia: distribucion[claveDistribucion]
  };
};

export const resolverAsignacionPorSectorId = ({ distribucion, sectorId, ...contexto } = {}) =>
  resolverAsignacion({
    fila: obtenerFilaActivaPorSectorId({ ...contexto, sectorId }),
    distribucion
  });

export const resolverAsignacionPorTurnanteId = ({ distribucion, turnanteId, ...contexto } = {}) =>
  resolverAsignacion({
    fila: obtenerFilaActivaPorTurnanteId({ ...contexto, turnanteId }),
    distribucion
  });

export const enriquecerDistribucionConIdentidades = ({ distribucion, ...contexto } = {}) => {
  if (!esDistribucion(distribucion)) return { asignaciones: [], noResueltas: [] };
  const asignaciones = [];
  const clavesResueltas = new Set();
  for (const fila of obtenerFilasActivasContexto(contexto).sort((a, b) => a.orden - b.orden)) {
    const asignacion = resolverAsignacion({ fila, distribucion });
    if (!asignacion) continue;
    asignaciones.push(asignacion);
    clavesResueltas.add(asignacion.claveDistribucion);
  }
  return {
    asignaciones,
    noResueltas: Object.keys(distribucion).filter((clave) => !clavesResueltas.has(clave))
  };
};
