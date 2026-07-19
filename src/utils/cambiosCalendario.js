import { crearReferenciaPersona } from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";

export const crearValorCambioCalendario = (persona, esDiaParo) =>
  esDiaParo ? persona?.nombre : crearReferenciaPersona(persona);

export const aplicarMovimientosCalendario = ({
  cambios,
  movimientos,
  esDiaParo
}) => {
  const resultado = { ...(cambios || {}) };

  movimientos.forEach(({ sector, persona, vacio = false }) => {
    resultado[normalizar(sector)] = vacio
      ? "__EMPTY__"
      : crearValorCambioCalendario(persona, esDiaParo);
  });

  return resultado;
};

