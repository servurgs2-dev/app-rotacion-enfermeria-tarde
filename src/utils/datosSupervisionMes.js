import { TURNOS } from "../config/turnos.js";
import { obtenerRangoMesNovedades } from "./novedadesPersonal.js";

export const TURNOS_SUPERVISION_IDS = Object.freeze(Object.keys(TURNOS));

export const crearEstadosPorTurnoSupervision = (estados = {}) =>
  Object.fromEntries(
    TURNOS_SUPERVISION_IDS.map((turnoId) => [
      turnoId,
      estados?.[turnoId] ?? null
    ])
  );

export const combinarEstadoLocalSupervision = ({
  estadosPorTurno,
  turnoActivo,
  mesConsultado,
  mesEstadoActivo,
  estadoActivo
} = {}) => {
  const mesConsulta = typeof mesConsultado === "string" ? mesConsultado.trim() : "";
  const mesLocal = typeof mesEstadoActivo === "string" ? mesEstadoActivo.trim() : "";
  return {
    ...crearEstadosPorTurnoSupervision(estadosPorTurno),
    ...(Object.hasOwn(TURNOS, turnoActivo) && estadoActivo && mesConsulta && mesLocal === mesConsulta
      ? { [turnoActivo]: estadoActivo }
      : {})
  };
};

const copiarNovedadModerna = (novedad) => ({
  ...novedad,
  datos: novedad?.datos && typeof novedad.datos === "object" && !Array.isArray(novedad.datos)
    ? structuredClone(novedad.datos)
    : {}
});

const mensajeError = (fuente) =>
  fuente === "estados"
    ? "No fue posible cargar los estados mensuales de los turnos."
    : "No fue posible cargar las novedades del mes.";

export const crearResultadoSupervisionVacio = (mes = "") => ({
  mes,
  estadosPorTurno: crearEstadosPorTurnoSupervision(),
  novedadesModernas: [],
  errores: { estados: "", novedades: "" },
  error: ""
});

export const cargarDatosSupervisionMes = async ({
  mes,
  cargarEstados,
  listarNovedades
} = {}) => {
  const rango = obtenerRangoMesNovedades(mes);
  const resultadoBase = crearResultadoSupervisionVacio(mes);
  if (!rango.fechaDesde || !rango.fechaHasta) {
    const error = "El mes debe tener formato YYYY-MM.";
    return {
      ...resultadoBase,
      errores: { estados: error, novedades: error },
      error
    };
  }

  const [resultadoEstados, resultadoNovedades] = await Promise.allSettled([
    cargarEstados(mes, [...TURNOS_SUPERVISION_IDS]),
    listarNovedades({
      fechaDesde: rango.fechaDesde,
      fechaHasta: rango.fechaHasta
    })
  ]);
  const errores = {
    estados: resultadoEstados.status === "rejected" ? mensajeError("estados") : "",
    novedades: resultadoNovedades.status === "rejected" ? mensajeError("novedades") : ""
  };
  return {
    mes,
    estadosPorTurno: resultadoEstados.status === "fulfilled"
      ? crearEstadosPorTurnoSupervision(resultadoEstados.value)
      : resultadoBase.estadosPorTurno,
    novedadesModernas: resultadoNovedades.status === "fulfilled"
      ? (Array.isArray(resultadoNovedades.value)
        ? resultadoNovedades.value.map(copiarNovedadModerna)
        : [])
      : [],
    errores,
    error: [errores.estados, errores.novedades].filter(Boolean).join(" ")
  };
};
