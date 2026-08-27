import { resolverPadronVigenciasEfectivasMes } from "../utils/padronVigenciasTurnoPersonal.js";

export const crearCargadorPadronPersonalEfectivoMes = ({ cargarVigenciasMes }) => {
  if (typeof cargarVigenciasMes !== "function") {
    throw new TypeError("La carga mensual de vigencias es requerida.");
  }
  return async ({ mes, estadosPorTurno } = {}) => {
    const configuracionesExplicitas = await cargarVigenciasMes(mes);
    return resolverPadronVigenciasEfectivasMes({
      mes,
      estadosPorTurno,
      configuracionesExplicitas
    });
  };
};
