import {
  calcularEstadisticasCierres,
  filtrarCierresPorFecha,
  obtenerCierresEstadisticos
} from "./estadisticasCierres.js";

const CAMPOS_MAXIMOS = ["cierres", "previstos", "presentes", "ausentes", "pendientes", "extras", "sectoresSinCobertura", "alertasCriticas"];

export const combinarEstadoActivoComparacion = ({ estadosRecuperados, turnoActivo, estadoActivo }) => ({
  ...(estadosRecuperados || {}),
  ...(turnoActivo && estadoActivo ? { [turnoActivo]: estadoActivo } : {})
});

export const esSolicitudComparacionVigente = (solicitudActual, solicitudRecibida) =>
  solicitudActual === solicitudRecibida;

export const debeConsultarComparacion = ({ habilitado, cache, claveSolicitud }) =>
  Boolean(habilitado && cache instanceof Map && !cache.has(claveSolicitud));

export const crearComparacionTurnos = ({
  estadosPorTurno,
  turnos,
  turnoActivo,
  categoria,
  fechaDesde = "",
  fechaHasta = ""
}) => {
  const filas = (Array.isArray(turnos) ? turnos : []).map((turno) => {
    const estado = estadosPorTurno?.[turno.id] || null;
    const cierres = estado
      ? filtrarCierresPorFecha(
        obtenerCierresEstadisticos({ calendario: estado.calendario, categoria }),
        { fechaDesde, fechaHasta }
      )
      : [];
    const { totales } = calcularEstadisticasCierres(cierres);
    return {
      turnoId: turno.id,
      turnoNombre: turno.nombre,
      esTurnoActivo: turno.id === turnoActivo,
      tieneEstado: Boolean(estado),
      tieneCierres: totales.cierres > 0,
      ...totales
    };
  });
  const maximos = Object.fromEntries(
    CAMPOS_MAXIMOS.map((campo) => [campo, Math.max(0, ...filas.map((fila) => Number(fila[campo]) || 0))])
  );
  return { filas, maximos };
};
