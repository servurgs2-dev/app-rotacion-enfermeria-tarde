import { aplicarPrioridadCoberturaParejas } from "./coberturaParejasEnfermeros.js";
import { resolverTurnantesYCoberturasOperativas } from "./distribucionTurnantesCoberturas.js";
import { esExtraCobertura } from "./extrasPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { incorporarPersonasSinAsignar } from "./pipelineCalendarioDiario.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

const obtenerCausaAsignacion = ({ fila, identidadesTurnantes, identidadesExtras }) => {
  const identidad = obtenerClaveIdentidadPersona(fila?.enfermero);
  if (fila?.cambioManualProtegido || fila?.vacioManual) return "manual";
  if (fila?.coberturaExtra) return "extra_cobertura";
  if (fila?.origenLogicoPareja || fila?.coberturaDesdePareja) return "pareja_2_a_1";
  if (identidad && identidadesTurnantes.has(identidad)) {
    return fila?.cedidoAPareja ? "reposicion_turnante" : "turnante_directo";
  }
  if (identidad && identidadesExtras.has(identidad)) return "extra_refuerzo";
  if (fila?.origenCoberturaAutomaticaSectorId || fila?.sacrificado) return "prioridad_general";
  return fila?.enfermero ? "base" : "vacante";
};

const crearTrazas = ({ asignacionBase, asignaciones, extras }) => {
  const identidadesTurnantes = new Set(lista(asignacionBase)
    .filter((fila) => fila?.tipo === "turnante")
    .map((fila) => obtenerClaveIdentidadPersona(fila?.enfermero))
    .filter(Boolean));
  const identidadesExtras = new Set(lista(extras)
    .filter((extra) => !esExtraCobertura(extra))
    .map(obtenerClaveIdentidadPersona)
    .filter(Boolean));
  return lista(asignaciones).map((fila) => ({
    personaId: obtenerClaveIdentidadPersona(fila?.enfermero),
    origenSectorId: fila?.origenCoberturaAutomaticaSectorId || fila?.origenLogicoPareja || null,
    destinoSectorId: fila?.sectorId || null,
    causa: obtenerCausaAsignacion({ fila, identidadesTurnantes, identidadesExtras })
  }));
};

export const resolverDistribucionDiaria = ({
  asignacionBase = [],
  personalEfectivo = [],
  extras = [],
  prioridadSectorIds = [],
  sectorIdsDonantes,
  esPersonaDisponible = () => true,
  esPersonaDisponibleParaCobertura = esPersonaDisponible,
  reglasParejas = null,
  personasSinAsignar = []
} = {}) => {
  const asignacionesEntrada = lista(asignacionBase).map((fila) => ({ ...fila }));
  const contextoParejas = reglasParejas && typeof reglasParejas === "object"
    ? { ...reglasParejas }
    : null;
  const resolucion = resolverTurnantesYCoberturasOperativas({
    asignaciones: asignacionesEntrada,
    extras: lista(extras),
    personal: lista(personalEfectivo),
    esPersonaDisponible,
    esPersonaDisponibleParaCobertura,
    prioridadSectorIds: lista(prioridadSectorIds),
    sectorIdsDonantes,
    ajustarSectores: contextoParejas
      ? (sectores) => aplicarPrioridadCoberturaParejas({
          ...contextoParejas,
          asignaciones: sectores,
          personal: lista(personalEfectivo),
          esPersonaDisponible: esPersonaDisponibleParaCobertura
        })
      : (sectores) => sectores
  });
  const asignaciones = lista(resolucion.asignaciones).map((fila) => ({ ...fila }));
  const conSinAsignar = incorporarPersonasSinAsignar({
    asignaciones,
    personas: lista(personasSinAsignar)
  });
  return {
    asignaciones,
    sinAsignar: conSinAsignar.slice(asignaciones.length),
    usados: resolucion.usados,
    trazas: crearTrazas({ asignacionBase: asignacionesEntrada, asignaciones, extras })
  };
};
