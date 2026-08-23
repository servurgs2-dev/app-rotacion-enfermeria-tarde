import { proyectarSupervisionDia } from "./agregadoSupervisionDia.js";
import { obtenerLimitesFechaMes } from "./navegacionFechaResumen.js";

export const proyectarSupervisionMes = ({
  estadosPorTurno = {},
  novedadesModernas = [],
  mes,
  configuracionDotacion
} = {}) => {
  const mesNormalizado = typeof mes === "string" ? mes.trim() : "";
  const { minima, maxima } = obtenerLimitesFechaMes(mesNormalizado);

  if (!minima || !maxima) {
    return {
      ok: false,
      mes: mesNormalizado,
      fechas: [],
      dias: [],
      cantidadDias: 0,
      errores: [{ codigo: "MES_INVALIDO", mes: mesNormalizado }]
    };
  }

  const ultimoDia = Number(maxima.slice(-2));
  const fechas = Array.from(
    { length: ultimoDia },
    (_, indice) => `${mesNormalizado}-${String(indice + 1).padStart(2, "0")}`
  );
  const dias = fechas.map((fecha) => proyectarSupervisionDia({
    estadosPorTurno,
    novedadesModernas,
    fecha,
    mes: mesNormalizado,
    configuracionDotacion
  }));

  return {
    ok: true,
    mes: mesNormalizado,
    fechas,
    dias,
    cantidadDias: fechas.length,
    errores: []
  };
};
