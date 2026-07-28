import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";

export const obtenerIdentidadesTurnantes = ({
  distribucion,
  posicionesTurnantes,
  personal
}) => new Set(
  (Array.isArray(posicionesTurnantes) ? posicionesTurnantes : [])
    .map((posicion) =>
      resolverPersonaDesdeReferencia(distribucion?.[posicion], personal)
    )
    .map(obtenerClaveIdentidadPersona)
    .filter(Boolean)
);

export const esPersonaTurnante = (persona, identidadesTurnantes) => {
  if (persona?.esTurnante === true) return true;
  const identidad = obtenerClaveIdentidadPersona(persona);
  return Boolean(identidad && identidadesTurnantes?.has(identidad));
};

export const crearPersonaPresentacionTurnante = (
  persona,
  identidadesTurnantes
) => {
  if (!persona || !esPersonaTurnante(persona, identidadesTurnantes)) {
    return persona;
  }
  return persona.esTurnante === true
    ? persona
    : { ...persona, esTurnante: true };
};

export const obtenerNombreConMarcaTurnante = (
  persona,
  nombreAlternativo = "",
  identidadesTurnantes
) => {
  const nombre = String(persona?.nombre || nombreAlternativo || "").trim();
  if (!nombre || !esPersonaTurnante(persona, identidadesTurnantes)) return nombre;
  return `${nombre} (T)`;
};
