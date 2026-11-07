import { TURNOS } from "../config/turnos.js";
import { esMesValido } from "./periodosMensuales.js";

const valorMesSeguro = (valor) => {
  if (valor === null || valor === undefined) return valor ?? null;
  if (["string", "number", "boolean"].includes(typeof valor)) {
    return String(valor).slice(0, 32);
  }
  return `[${Array.isArray(valor) ? "array" : typeof valor}]`;
};

export const proyectarMesesEstadoMensualLegacy = (filas = []) => {
  const meses = new Set();
  const omitidos = [];
  (Array.isArray(filas) ? filas : []).forEach((fila) => {
    const mes = fila?.mes;
    if (!esMesValido(mes)) {
      omitidos.push({ motivo: "mes_invalido", valorMesSeguro: valorMesSeguro(mes) });
      return;
    }
    meses.add(mes);
  });
  return {
    meses: [...meses].sort((mesA, mesB) => mesB.localeCompare(mesA)),
    omitidos
  };
};

export const combinarMesesExistentes = ({ mesesPorTurno = [], mesesLegacyTarde = [] } = {}) => {
  const turnosPorMes = new Map(
    mesesPorTurno.map(({ mes, turnos }) => [mes, new Set(turnos)])
  );
  mesesLegacyTarde.forEach((mes) => {
    if (!turnosPorMes.has(mes)) turnosPorMes.set(mes, new Set());
    turnosPorMes.get(mes).add("tarde");
  });
  const ordenTurnos = Object.keys(TURNOS);
  return [...turnosPorMes.entries()]
    .sort(([mesA], [mesB]) => mesB.localeCompare(mesA))
    .map(([mes, turnos]) => ({
      mes,
      turnos: ordenTurnos.filter((turno) => turnos.has(turno))
    }));
};

export const crearServicioDescubrimientoMeses = ({ listarNuevos, listarLegacyTarde }) =>
  async () => {
    const [mesesPorTurno, resultadoLegacy] = await Promise.all([
      listarNuevos(),
      listarLegacyTarde()
    ]);
    const mesesLegacyTarde = Array.isArray(resultadoLegacy)
      ? resultadoLegacy
      : resultadoLegacy?.meses || [];
    return combinarMesesExistentes({ mesesPorTurno, mesesLegacyTarde });
  };
