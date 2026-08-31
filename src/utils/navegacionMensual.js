import {
  CLASIFICACION_PERIODO_MES,
  clasificarPeriodoMes,
  obtenerMesAnterior,
  obtenerMesSiguiente,
  validarMes
} from "./periodosMensuales.js";

export const crearListaMesesNavegables = ({
  mesesExistentes = [],
  mesReferencia
} = {}) => {
  validarMes(mesReferencia, "mesReferencia");
  const anterior = obtenerMesAnterior(mesReferencia);
  const siguiente = obtenerMesSiguiente(mesReferencia);
  const porMes = new Map();

  mesesExistentes.forEach((entrada) => {
    if (!entrada?.mes || entrada.mes > siguiente) return;
    porMes.set(entrada.mes, {
      mes: entrada.mes,
      turnos: [...new Set(Array.isArray(entrada.turnos) ? entrada.turnos : [])],
      existeGlobalmente: true
    });
  });

  [anterior, mesReferencia, siguiente].forEach((mes) => {
    if (!porMes.has(mes)) {
      porMes.set(mes, { mes, turnos: [], existeGlobalmente: false });
    }
  });

  return [...porMes.values()]
    .map((entrada) => ({
      ...entrada,
      clasificacion: clasificarPeriodoMes({ mes: entrada.mes, mesReferencia })
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
};

export const obtenerMesAdyacenteNavegable = ({ lista = [], mesActivo, direccion } = {}) => {
  const indice = lista.findIndex(({ mes }) => mes === mesActivo);
  if (indice < 0 || ![-1, 1].includes(direccion)) return null;
  return lista[indice + direccion]?.mes || null;
};

export const existeMesParaTurno = ({ lista = [], mes, turno } = {}) =>
  Boolean(lista.find((entrada) => entrada.mes === mes)?.turnos.includes(turno));

export const obtenerIndicadorPeriodo = (clasificacion) => ({
  [CLASIFICACION_PERIODO_MES.HISTORICO_CERRADO]: "Sólo lectura",
  [CLASIFICACION_PERIODO_MES.ACTUAL]: "Actual",
  [CLASIFICACION_PERIODO_MES.SIGUIENTE]: "Siguiente"
}[clasificacion] || "");

export const formatearMesHumano = (mes) => {
  validarMes(mes);
  const [anio, numeroMes] = mes.split("-").map(Number);
  const texto = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(anio, numeroMes - 1, 1)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
