import { validarMes } from "./periodosMensuales.js";

const mesesLocalesDelTurno = ({ estadosPorTurnoMes, turno }) =>
  Object.keys(estadosPorTurnoMes && typeof estadosPorTurnoMes === "object"
    ? estadosPorTurnoMes
    : {})
    .flatMap((clave) => {
      const separador = clave.indexOf("|");
      if (separador < 0 || clave.slice(0, separador) !== turno) return [];
      const mes = clave.slice(separador + 1);
      try {
        return [validarMes(mes)];
      } catch {
        return [];
      }
    });

export const obtenerMesesOrigenPreparacion = ({
  turno,
  mesDestino,
  mesesExistentes = [],
  estadosPorTurnoMes = {}
} = {}) => {
  const turnoNormalizado = String(turno || "").trim();
  validarMes(mesDestino, "mesDestino");
  if (!turnoNormalizado) return [];

  const candidatos = new Set(
    mesesLocalesDelTurno({ estadosPorTurnoMes, turno: turnoNormalizado })
  );
  (Array.isArray(mesesExistentes) ? mesesExistentes : []).forEach((entrada) => {
    if (entrada?.mes < mesDestino && entrada?.turnos?.includes(turnoNormalizado)) {
      candidatos.add(entrada.mes);
    }
  });

  return [...candidatos]
    .filter((mes) => mes < mesDestino)
    .sort((a, b) => b.localeCompare(a));
};

export const obtenerMesOrigenPreparacion = (argumentos = {}) =>
  obtenerMesesOrigenPreparacion(argumentos)[0] || null;
