import { crearReferenciaPersona } from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";

export const crearValorCambioCalendario = (persona) =>
  crearReferenciaPersona(persona);

export const aplicarMovimientosCalendario = ({
  cambios,
  movimientos
}) => {
  const resultado = { ...(cambios || {}) };

  movimientos.forEach(({ sector, persona, vacio = false }) => {
    resultado[normalizar(sector)] = vacio
      ? "__EMPTY__"
      : crearValorCambioCalendario(persona);
  });

  return resultado;
};
