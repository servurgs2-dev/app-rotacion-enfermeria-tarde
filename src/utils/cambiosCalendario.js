import { crearReferenciaPersona } from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";

export const VACANTE_OPERATIVA = "__OPERATIONAL_VACANCY__";

export const crearValorCambioCalendario = (persona) =>
  crearReferenciaPersona(persona);

export const crearMovimientosEntreFilasCalendario = ({ seleccionado, destino } = {}) => {
  if (!seleccionado?.enfermero || !destino) return [];
  const origenEsSinAsignar = normalizar(seleccionado.nombre) === "SIN ASIGNAR";
  const destinoEsSinAsignar = normalizar(destino.nombre) === "SIN ASIGNAR";

  if (destinoEsSinAsignar && !origenEsSinAsignar) {
    return [{ sector: seleccionado.nombre, vacioOperativo: true }];
  }

  return [
    { sector: destino.nombre, persona: seleccionado.enfermero },
    { sector: seleccionado.nombre, persona: destino.enfermero, vacio: !destino.enfermero }
  ];
};

export const aplicarMovimientosCalendario = ({
  cambios,
  movimientos
}) => {
  const resultado = { ...(cambios || {}) };

  movimientos.forEach(({ sector, persona, vacio = false, vacioOperativo = false }) => {
    resultado[normalizar(sector)] = vacioOperativo
      ? VACANTE_OPERATIVA
      : vacio
        ? "__EMPTY__"
        : crearValorCambioCalendario(persona);
  });

  return resultado;
};
