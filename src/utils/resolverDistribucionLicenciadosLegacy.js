import { resolverTurnantesYCoberturasOperativas } from "./distribucionTurnantesCoberturas.js";
import { esExtraCobertura } from "./extrasPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { aplicarPrioridadGeneralPorSectorId } from "./prioridadesSectores.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

export const resolverDistribucionLicenciadosLegacy = ({
  asignaciones = [],
  personal = [],
  personasSinAsignar = personal,
  extras = [],
  prioridadSectorIds = [],
  esPersonaDisponible = () => true,
  esPersonaDisponibleParaCobertura = esPersonaDisponible,
  identidadesExcluidasSinAsignar = []
} = {}) => {
  const primeraFase = resolverTurnantesYCoberturasOperativas({
    asignaciones: lista(asignaciones),
    extras: lista(extras),
    personal: lista(personal),
    esPersonaDisponible,
    esPersonaDisponibleParaCobertura,
    prioridadSectorIds: [],
    sectorIdsDonantes: [],
    ajustarSectores: (sectores) => sectores
  });
  const asignacionesFinales = aplicarPrioridadGeneralPorSectorId({
    asignaciones: primeraFase.asignaciones,
    prioridadSectorIds: lista(prioridadSectorIds),
    esPersonaDisponible
  });
  const usados = new Set(
    asignacionesFinales
      .map((fila) => obtenerClaveIdentidadPersona(fila?.enfermero))
      .filter(Boolean)
  );
  const identidadesVistas = new Set([
    ...usados,
    ...lista(identidadesExcluidasSinAsignar).filter(Boolean)
  ]);
  const sobrantes = [...lista(personasSinAsignar), ...lista(extras)].filter((persona) => {
    const identidad = obtenerClaveIdentidadPersona(persona);
    if (
      !persona ||
      !identidad ||
      !esPersonaDisponible(persona) ||
      esExtraCobertura(persona) ||
      identidadesVistas.has(identidad)
    ) return false;
    identidadesVistas.add(identidad);
    return true;
  });

  return { asignaciones: asignacionesFinales, usados, sobrantes };
};
