import { obtenerConfiguracionTurno } from "../config/turnos.js";
import { obtenerCambioHorarioActivo } from "./novedadesPersonal.js";

export const obtenerHorarioHabitualPersona = (
  persona,
  configTurno = obtenerConfiguracionTurno()
) => configTurno.horarios[persona?.horario] || configTurno.horarios.normal;

export const obtenerHorarioBaseEfectivoPersonaEnFecha = ({
  persona,
  fecha,
  turno = "",
  novedades = [],
  configTurno = obtenerConfiguracionTurno(turno)
} = {}) => {
  const habitual = obtenerHorarioHabitualPersona(persona, configTurno);
  const cambio = obtenerCambioHorarioActivo({ novedades, persona, fecha, turno });
  return cambio
    ? {
        ...habitual,
        entrada: cambio.datos.horaEntrada,
        salida: cambio.datos.horaSalida,
        textoVisible: `${cambio.datos.horaEntrada} a ${cambio.datos.horaSalida}`,
        esExcepcional: true,
        novedadId: cambio.id
      }
    : { ...habitual, esExcepcional: false, novedadId: null };
};
