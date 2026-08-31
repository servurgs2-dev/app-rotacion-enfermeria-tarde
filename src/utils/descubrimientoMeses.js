import { TURNOS } from "../config/turnos.js";

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
    const [mesesPorTurno, mesesLegacyTarde] = await Promise.all([
      listarNuevos(),
      listarLegacyTarde()
    ]);
    return combinarMesesExistentes({ mesesPorTurno, mesesLegacyTarde });
  };
