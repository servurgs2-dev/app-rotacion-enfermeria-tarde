import { ESTADOS_NOVEDAD_PERSONAL, novedadCorrespondeTurnoEfectivo } from "./novedadesPersonal.js";
import { clasificarEstadoMesDestino } from "./preparacionMesNuevo.js";
import {
  CLASIFICACION_PERIODO_MES,
  clasificarPeriodoMes,
  obtenerMesAnterior
} from "./periodosMensuales.js";

export const MODO_PREPARACION_MES = Object.freeze({
  SIGUIENTE: "siguiente",
  RECUPERACION_ACTUAL: "recuperacion_actual"
});

const fechaIsoLocal = (fecha) => {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return "";
  return [fecha.getFullYear(), String(fecha.getMonth() + 1).padStart(2, "0"), String(fecha.getDate()).padStart(2, "0")].join("-");
};

const detectarActividadExterna = ({ novedades, turno, mes, fechaReferencia, padronVigencias }) => {
  const desde = `${mes}-01`;
  const hoy = fechaIsoLocal(fechaReferencia);
  const hasta = hoy.startsWith(`${mes}-`) ? hoy : desde;
  return (Array.isArray(novedades) ? novedades : []).filter((novedad) =>
    novedad?.estado !== ESTADOS_NOVEDAD_PERSONAL.CANCELADA &&
    String(novedad?.fechaDesde || "") <= hasta &&
    String(novedad?.fechaHasta || novedad?.fechaDesde || "") >= desde &&
    novedadCorrespondeTurnoEfectivo({
      novedad,
      turno,
      padronVigencias,
      fechaDesde: desde,
      fechaHasta: hasta
    })
  );
};

export const analizarRecuperacionMesActual = ({
  mes,
  mesReferencia,
  fechaReferencia = new Date(),
  turno,
  existeRemoto = false,
  estado,
  novedadesExternas = [],
  padronVigencias = null,
  auditoriaExternaDisponible = true
} = {}) => {
  const estadoDestino = clasificarEstadoMesDestino({ existeRemoto, estado });
  const base = {
    permitida: false,
    codigo: "PERIODO_NO_ACTUAL",
    motivos: [],
    estadoDestino,
    actividadDetectada: [],
    mesOrigen: obtenerMesAnterior(mes)
  };
  if (clasificarPeriodoMes({ mes, mesReferencia }) !== CLASIFICACION_PERIODO_MES.ACTUAL) return base;
  if (!estadoDestino.permitido) {
    return { ...base, codigo: "ESTADO_MENSUAL_CON_CONTENIDO", motivos: estadoDestino.contenido };
  }
  if (!auditoriaExternaDisponible || !padronVigencias) {
    return {
      ...base,
      codigo: "AUDITORIA_EXTERNA_NO_DISPONIBLE",
      motivos: ["No fue posible verificar las novedades del mes."]
    };
  }
  const actividadDetectada = detectarActividadExterna({
    novedades: novedadesExternas,
    turno,
    mes,
    fechaReferencia,
    padronVigencias
  });
  if (actividadDetectada.length > 0) {
    return {
      ...base,
      codigo: "ACTIVIDAD_EXTERNA_DETECTADA",
      motivos: ["Novedades o ausencias vigentes en días ya alcanzados por el mes."],
      actividadDetectada
    };
  }
  return {
    ...base,
    permitida: true,
    codigo: estadoDestino.clasificacion === "inexistente" ? "MES_ACTUAL_INEXISTENTE" : "MES_ACTUAL_VACIO"
  };
};
