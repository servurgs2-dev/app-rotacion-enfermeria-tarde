import { normalizar } from "./texto.js";
import { normalizarFuncionarioIdentidad } from "./identidadPersonas.js";

const normalizarNombreParaExclusividad = (nombre) =>
  (normalizar(nombre) || "").replace(/\s+/g, " ");

export const normalizarFuncionarioParaExclusividad = normalizarFuncionarioIdentidad;

const representanLaMismaPersona = (candidata, existente) => {
  const funcionarioCandidato = normalizarFuncionarioParaExclusividad(
    candidata?.funcionario
  );
  const funcionarioExistente = normalizarFuncionarioParaExclusividad(
    existente?.funcionario
  );

  if (funcionarioCandidato && funcionarioExistente) {
    return funcionarioCandidato === funcionarioExistente;
  }

  const nombreCandidato = normalizarNombreParaExclusividad(candidata?.nombre);
  const nombreExistente = normalizarNombreParaExclusividad(existente?.nombre);
  return Boolean(nombreCandidato) && nombreCandidato === nombreExistente;
};

export const buscarPersonaEnEstadosDeTurnos = ({
  personaCandidata,
  turnoActual,
  estadosPorTurno
}) => {
  for (const [turnoId, estado] of Object.entries(estadosPorTurno || {})) {
    if (turnoId === turnoActual) continue;

    const persona = Array.isArray(estado?.personal)
      ? estado.personal.find((item) =>
          representanLaMismaPersona(personaCandidata, item)
        )
      : null;

    if (persona) {
      return { existeEnOtroTurno: true, turnoId, persona };
    }
  }

  return { existeEnOtroTurno: false, turnoId: null, persona: null };
};

export const obtenerEstadosDeOtrosTurnos = async ({
  turnoActual,
  mes,
  turnosIds,
  estadosPorTurnoMes,
  crearClave,
  cargarEstado
}) => {
  const otrosTurnos = turnosIds.filter((turnoId) => turnoId !== turnoActual);
  const estadosLeidos = await Promise.all(
    otrosTurnos.map(async (turnoId) => {
      const clave = crearClave(turnoId, mes);

      if (Object.prototype.hasOwnProperty.call(estadosPorTurnoMes, clave)) {
        return [turnoId, estadosPorTurnoMes[clave]];
      }

      const resultado = await cargarEstado(turnoId, mes);
      return [turnoId, resultado.existe ? resultado.estado : null];
    })
  );

  return Object.fromEntries(estadosLeidos);
};
