export const CLASIFICACION_PERIODO_MES = Object.freeze({
  HISTORICO_CERRADO: "historico_cerrado",
  ANTERIOR_EDITABLE: "anterior_editable",
  ACTUAL: "actual",
  SIGUIENTE: "siguiente",
  FUTURO_FUERA_DE_VENTANA: "futuro_fuera_de_ventana"
});

const PATRON_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export const esMesValido = (mes) =>
  typeof mes === "string" && PATRON_MES.test(mes);

export const validarMes = (mes, nombre = "mes") => {
  if (!esMesValido(mes)) {
    throw new TypeError(`${nombre} debe tener formato YYYY-MM.`);
  }
  return mes;
};

export const obtenerMesLocalActual = (fecha = new Date()) => {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
    throw new TypeError("La fecha de referencia no es válida.");
  }
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
};

export const desplazarMes = (mes, desplazamiento) => {
  validarMes(mes);
  if (!Number.isInteger(desplazamiento)) {
    throw new TypeError("El desplazamiento mensual debe ser un entero.");
  }
  const [anio, numeroMes] = mes.split("-").map(Number);
  const indiceAbsoluto = anio * 12 + numeroMes - 1 + desplazamiento;
  const anioResultado = Math.floor(indiceAbsoluto / 12);
  const mesResultado = ((indiceAbsoluto % 12) + 12) % 12 + 1;
  return `${String(anioResultado).padStart(4, "0")}-${String(mesResultado).padStart(2, "0")}`;
};

export const obtenerMesAnterior = (mes) => desplazarMes(mes, -1);
export const obtenerMesSiguiente = (mes) => desplazarMes(mes, 1);

export const clasificarPeriodoMes = ({
  mes,
  mesReferencia = obtenerMesLocalActual()
} = {}) => {
  validarMes(mes);
  validarMes(mesReferencia, "mesReferencia");
  const anterior = obtenerMesAnterior(mesReferencia);
  const siguiente = obtenerMesSiguiente(mesReferencia);

  if (mes < anterior) return CLASIFICACION_PERIODO_MES.HISTORICO_CERRADO;
  if (mes === anterior) return CLASIFICACION_PERIODO_MES.ANTERIOR_EDITABLE;
  if (mes === mesReferencia) return CLASIFICACION_PERIODO_MES.ACTUAL;
  if (mes === siguiente) return CLASIFICACION_PERIODO_MES.SIGUIENTE;
  return CLASIFICACION_PERIODO_MES.FUTURO_FUERA_DE_VENTANA;
};

export const estaEnVentanaEditableTemporal = (argumentos = {}) => {
  if (!esMesValido(argumentos?.mes)) return false;
  if (argumentos.mesReferencia !== undefined && !esMesValido(argumentos.mesReferencia)) {
    return false;
  }
  const clasificacion = clasificarPeriodoMes(argumentos);
  return [
    CLASIFICACION_PERIODO_MES.ANTERIOR_EDITABLE,
    CLASIFICACION_PERIODO_MES.ACTUAL,
    CLASIFICACION_PERIODO_MES.SIGUIENTE
  ].includes(clasificacion);
};

export const esMesHistoricoCerrado = (argumentos = {}) => {
  if (!esMesValido(argumentos?.mes)) return false;
  if (argumentos.mesReferencia !== undefined && !esMesValido(argumentos.mesReferencia)) {
    return false;
  }
  return clasificarPeriodoMes(argumentos) ===
    CLASIFICACION_PERIODO_MES.HISTORICO_CERRADO;
};
