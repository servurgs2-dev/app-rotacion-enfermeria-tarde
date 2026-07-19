import { cargarEstadoMensual } from "./estadoMensual.js";
import {
  cargarEstadoPorTurnoMes,
  guardarEstadoPorTurnoMes
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
