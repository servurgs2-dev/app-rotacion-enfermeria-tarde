import {
  crearOlvidoTarjetaPersonal,
  ESTADOS_NOVEDAD_PERSONAL,
  TIPOS_NOVEDAD_PERSONAL,
  validarTransicionEstadoNovedad
} from "../utils/novedadesPersonal.js";

export const crearRegistradorOlvidoTarjeta = (repositorio) => async ({
  persona,
  fecha,
  turno,
  observacion = ""
} = {}) => {
  const resultado = crearOlvidoTarjetaPersonal({ persona, fecha, turno, observacion });
  if (resultado.error) throw new Error(resultado.error);
  const existentes = await repositorio.listar({
    fechaDesde: fecha,
    fechaHasta: fecha,
    turno
  });
  const duplicado = existentes.find((novedad) =>
    novedad.tipo === TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA &&
    novedad.personaId === resultado.novedad.personaId &&
    novedad.fechaDesde === fecha &&
    novedad.fechaHasta === fecha &&
    novedad.turno === turno &&
    novedad.estado !== ESTADOS_NOVEDAD_PERSONAL.CANCELADA
  );
  if (duplicado) {
    throw new Error("Ya existe un Olvido de tarjeta para este funcionario, fecha y turno.");
  }
  return repositorio.crear(resultado.novedad);
};

export const crearActualizadorEstadoNovedad = (repositorio) => async (id, estado) => {
  const actual = await repositorio.obtener(id);
  const error = validarTransicionEstadoNovedad(actual, estado);
  if (error) throw new Error(error);
  return repositorio.actualizarEstado(id, estado);
};
