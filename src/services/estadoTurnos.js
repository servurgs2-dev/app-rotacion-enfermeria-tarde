import { cargarEstadoMensual } from "./estadoMensual.js";
import {
  cargarEstadoPorTurnoMes,
  cargarEstadoPorTurnoMesConRevision,
  guardarEstadoPorTurnoMes,
  guardarEstadoTurnoMesConRevision as guardarEstadoPorTurnoMesVersionado
} from "./estadoPorTurnoMes.js";

const TURNO_CON_RESPALDO_HISTORICO = "tarde";

export const crearServicioEstadoTurnos = ({
  cargarNuevo,
  guardarNuevo,
  cargarHistorico
}) => {
  const cargarEstadoTurnoMes = async (turnoId, mes) => {
    const resultadoNuevo = await cargarNuevo(turnoId, mes);

    if (resultadoNuevo.existe) {
      return {
        existe: true,
        estado: resultadoNuevo.estado,
        origen: "turno_mes"
      };
    }

    if (turnoId !== TURNO_CON_RESPALDO_HISTORICO) {
      return { existe: false, estado: null, origen: null };
    }

    const resultadoHistorico = await cargarHistorico(mes);

    if (resultadoHistorico.existe) {
      return {
        existe: true,
        estado: resultadoHistorico.estado,
        origen: "historico"
      };
    }

    return { existe: false, estado: null, origen: null };
  };

  const guardarEstadoTurnoMes = (turnoId, mes, estado) =>
    guardarNuevo(turnoId, mes, estado);

  return { cargarEstadoTurnoMes, guardarEstadoTurnoMes };
};

export const {
  cargarEstadoTurnoMes,
  guardarEstadoTurnoMes
} = crearServicioEstadoTurnos({
  cargarNuevo: cargarEstadoPorTurnoMes,
  guardarNuevo: guardarEstadoPorTurnoMes,
  cargarHistorico: cargarEstadoMensual
});

export const crearServicioEstadoTurnosConRevision = ({
  cargarNuevo,
  guardarNuevo,
  cargarHistorico
}) => {
  const cargarEstadoTurnoMesConRevision = async (turnoId, mes) => {
    const resultadoNuevo = await cargarNuevo(turnoId, mes);

    if (resultadoNuevo.existe) {
      return {
        existe: true,
        existeRemoto: true,
        estado: resultadoNuevo.estado,
        revision: resultadoNuevo.revision,
        updatedAt: resultadoNuevo.updatedAt,
        origen: "turno_mes"
      };
    }

    if (turnoId !== TURNO_CON_RESPALDO_HISTORICO) {
      return {
        existe: false,
        existeRemoto: false,
        estado: null,
        revision: "0",
        updatedAt: null,
        origen: null
      };
    }

    const resultadoHistorico = await cargarHistorico(mes);
    if (resultadoHistorico.existe) {
      return {
        existe: true,
        existeRemoto: false,
        estado: resultadoHistorico.estado,
        revision: "0",
        updatedAt: null,
        origen: "historico"
      };
    }

    return {
      existe: false,
      existeRemoto: false,
      estado: null,
      revision: "0",
      updatedAt: null,
      origen: null
    };
  };

  const guardarEstadoTurnoMesConRevision = (argumentos) =>
    guardarNuevo(argumentos);

  return {
    cargarEstadoTurnoMesConRevision,
    guardarEstadoTurnoMesConRevision
  };
};

export const {
  cargarEstadoTurnoMesConRevision,
  guardarEstadoTurnoMesConRevision
} = crearServicioEstadoTurnosConRevision({
  cargarNuevo: cargarEstadoPorTurnoMesConRevision,
  guardarNuevo: guardarEstadoPorTurnoMesVersionado,
  cargarHistorico: cargarEstadoMensual
});
