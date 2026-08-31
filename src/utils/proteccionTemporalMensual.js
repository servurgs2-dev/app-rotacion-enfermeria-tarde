import {
  clasificarPeriodoMes,
  estaEnVentanaEditableTemporal
} from "./periodosMensuales.js";

export const puedeMutarPeriodoMensual = ({ mes, mesReferencia } = {}) =>
  estaEnVentanaEditableTemporal({ mes, mesReferencia });

export const evaluarMutacionEstadoMensual = ({
  mes,
  mesReferencia,
  existeRemoto = false,
  creacionExplicita = false
} = {}) => {
  let clasificacion;
  try {
    clasificacion = clasificarPeriodoMes({ mes, mesReferencia });
  } catch {
    return { permitida: false, codigo: "PERIODO_INVALIDO", clasificacion: null };
  }
  if (!puedeMutarPeriodoMensual({ mes, mesReferencia })) {
    return { permitida: false, codigo: "FUERA_DE_VENTANA_TEMPORAL", clasificacion };
  }
  if (!existeRemoto && !creacionExplicita) {
    return { permitida: false, codigo: "MES_INEXISTENTE", clasificacion };
  }
  return {
    permitida: true,
    codigo: creacionExplicita && !existeRemoto ? "CREACION_EXPLICITA" : "ESTADO_EXISTENTE",
    clasificacion
  };
};

export const puedeMutarEstadoMensual = (argumentos) =>
  evaluarMutacionEstadoMensual(argumentos).permitida;

export const aplicarMutacionMensualProtegida = ({
  estados,
  clave,
  autorizacion,
  actualizar
}) => {
  if (!autorizacion?.permitida || !Object.hasOwn(estados || {}, clave)) return estados;
  const estadoActual = estados[clave];
  const estadoSiguiente = actualizar(estadoActual);
  return estadoSiguiente === estadoActual
    ? estados
    : { ...estados, [clave]: estadoSiguiente };
};
