import { normalizar } from "./texto.js";

export const PAREJAS_COBERTURA_ENFERMEROS = Object.freeze([
  Object.freeze({ principal: "REA 1", secundario: "REA 2" }),
  Object.freeze({ principal: "EXPLORA 1", secundario: "EXPLORA 2" }),
  Object.freeze({ principal: "SILLÓN 1", secundario: "SILLON 2" }),
  Object.freeze({ principal: "PRE INT 1", secundario: "PRE INT 2" })
]);

const tieneCambioManual = (cambiosDia, sector) => {
  const sectorNormalizado = normalizar(sector);

  return Object.keys(cambiosDia || {}).some(
    (clave) => normalizar(clave) === sectorNormalizado
  );
};

export const aplicarPrioridadCoberturaParejas = ({
  asignaciones,
  cambiosDia = {},
  esPersonaDisponible = () => true
}) => {
  if (!Array.isArray(asignaciones)) return [];

  const resultado = asignaciones.map((asignacion) => ({ ...asignacion }));

  PAREJAS_COBERTURA_ENFERMEROS.forEach(({ principal, secundario }) => {
    if (
      tieneCambioManual(cambiosDia, principal) ||
      tieneCambioManual(cambiosDia, secundario)
    ) {
      return;
    }

    const destino = resultado.find(
      (asignacion) => normalizar(asignacion.nombre) === normalizar(principal)
    );
    const origen = resultado.find(
      (asignacion) => normalizar(asignacion.nombre) === normalizar(secundario)
    );

    if (
      !destino ||
      !origen ||
      destino.enfermero ||
      destino.vacioManual ||
      !origen.enfermero ||
      !esPersonaDisponible(origen.enfermero)
    ) {
      return;
    }

    destino.enfermero = origen.enfermero;
    destino.coberturaDesdePareja = origen.nombre;
    origen.enfermero = null;
    origen.cedidoAPareja = destino.nombre;
  });

  return resultado;
};
