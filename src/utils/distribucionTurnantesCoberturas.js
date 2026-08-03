import {
  aplicarCoberturasDirectasExtras,
  esExtraCobertura
} from "./extrasPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

export const resolverTurnantesYCoberturasOperativas = ({
  asignaciones,
  extras,
  personal,
  esPersonaDisponible,
  esPersonaDisponibleParaCobertura = esPersonaDisponible,
  ajustarSectores = (sectores) => sectores
} = {}) => {
  const disponibles = typeof esPersonaDisponible === "function"
    ? esPersonaDisponible
    : () => true;
  const disponiblesParaCobertura = typeof esPersonaDisponibleParaCobertura === "function"
    ? esPersonaDisponibleParaCobertura
    : disponibles;
  const usados = new Set();
  const usar = (persona) => {
    const identidad = obtenerClaveIdentidadPersona(persona);
    if (!persona || !identidad || usados.has(identidad)) return null;
    usados.add(identidad);
    return persona;
  };

  const turnantes = lista(asignaciones)
    .filter((fila) => fila?.tipo === "turnante")
    .map((fila) => fila.enfermero)
    .filter((persona) => persona && disponiblesParaCobertura(persona));
  let indiceTurnante = 0;
  const tomarTurnante = () => {
    while (indiceTurnante < turnantes.length) {
      const persona = usar(turnantes[indiceTurnante++]);
      if (persona) return persona;
    }
    return null;
  };

  let sectores = lista(asignaciones)
    .filter((fila) => fila?.tipo === "sector")
    .map((fila) => {
      if (!fila.enfermero) return { ...fila, enfermero: null };
      if (!disponiblesParaCobertura(fila.enfermero)) {
        return { ...fila, enfermero: null, reemplazo: true };
      }
      return { ...fila, enfermero: usar(fila.enfermero), reemplazo: false };
    });

  sectores = ajustarSectores(sectores);
  sectores.forEach((fila) => {
    if (!fila.enfermero && fila.reemplazo && !fila.vacioManual) {
      fila.enfermero = tomarTurnante();
    }
  });

  const refuerzos = lista(extras).filter(
    (extra) => extra && !esExtraCobertura(extra) && disponibles(extra)
  );
  let indiceExtra = 0;
  const tomarExtra = () => {
    while (indiceExtra < refuerzos.length) {
      const persona = usar(refuerzos[indiceExtra++]);
      if (persona) return persona;
    }
    return null;
  };
  sectores.forEach((fila) => {
    if (!fila.enfermero && !fila.vacioManual) fila.enfermero = tomarExtra();
  });
  sectores.forEach((fila) => {
    if (!fila.enfermero && !fila.vacioManual) fila.enfermero = tomarTurnante();
  });

  const conCoberturas = aplicarCoberturasDirectasExtras({
    asignaciones: sectores,
    extras,
    personal,
    esPersonaDisponible: disponiblesParaCobertura
  }).asignaciones;
  const usadosFinales = new Set(
    conCoberturas.map((fila) => obtenerClaveIdentidadPersona(fila.enfermero)).filter(Boolean)
  );
  return { asignaciones: conCoberturas, usados: usadosFinales };
};
