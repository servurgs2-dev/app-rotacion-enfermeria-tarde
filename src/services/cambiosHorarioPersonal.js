import {
  crearCambioHorarioPersonal,
  ESTADOS_NOVEDAD_PERSONAL,
  TIPOS_NOVEDAD_PERSONAL
} from "../utils/novedadesPersonal.js";

const esMismoCambioActivo = (novedad, cambio) =>
  novedad.tipo === TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO &&
  novedad.estado === ESTADOS_NOVEDAD_PERSONAL.ACTIVA &&
  novedad.personaId === cambio.personaId &&
  novedad.fechaDesde === cambio.fechaDesde &&
  novedad.fechaHasta === cambio.fechaHasta &&
  novedad.turno === cambio.turno;

export const crearGuardadorCambioHorario = (repositorio) => async (entrada = {}) => {
  const resultado = crearCambioHorarioPersonal(entrada);
  if (resultado.error) throw new Error(resultado.error);
  const cambio = resultado.novedad;
  const existentes = await repositorio.listar({
    fechaDesde: cambio.fechaDesde,
    fechaHasta: cambio.fechaHasta,
    turno: cambio.turno
  });
  const existente = existentes.find((novedad) => esMismoCambioActivo(novedad, cambio));
  return existente
    ? repositorio.actualizarContenido(existente.id, {
        observacion: cambio.observacion,
        datos: cambio.datos
      })
    : repositorio.crear(cambio);
};
