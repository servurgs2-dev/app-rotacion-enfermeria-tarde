import { aplicarPrioridadCoberturaParejas } from "./coberturaParejasEnfermeros.js";
import { resolverTurnantesYCoberturasOperativas } from "./distribucionTurnantesCoberturas.js";
import { esExtraCobertura } from "./extrasPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { incorporarPersonasSinAsignar } from "./pipelineCalendarioDiario.js";
import {
  recalcularRedistribucionOpcion1Automatica,
  recalcularRedistribucionOpcion2Automatica,
  redistribuirCritica,
  redistribuirPorBoxes
} from "./redistribucionEnfermeros.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

export const MODOS_REDISTRIBUCION_DIARIA = Object.freeze({
  OPCION_1: "opcion_1",
  OPCION_2: "opcion_2"
});

const resolverRedistribucion = ({ modoRedistribucion, accion, asignaciones, contexto }) => {
  const opcion1 = modoRedistribucion === MODOS_REDISTRIBUCION_DIARIA.OPCION_1;
  const opcion2 = modoRedistribucion === MODOS_REDISTRIBUCION_DIARIA.OPCION_2;
  if (!opcion1 && !opcion2) return null;
  const parametros = {
    asignaciones,
    ordenVisual: contexto?.ordenVisual,
    filasConfiguracion: contexto?.filasConfiguracion,
    prioridadSectorIds: contexto?.prioridadSectorIds
  };
  if (accion === "generar") {
    return (opcion1 ? redistribuirCritica : redistribuirPorBoxes)(parametros);
  }
  if (accion === "recalcular") {
    return {
      asignaciones: (opcion1
        ? recalcularRedistribucionOpcion1Automatica
        : recalcularRedistribucionOpcion2Automatica)({
        ...parametros,
        cambiosDia: contexto?.cambiosDia,
        procedenciaCambiosDia: contexto?.procedenciaCambiosDia,
        procedenciaAutomatica: contexto?.procedenciaAutomatica
      })
    };
  }
  return null;
};

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
  personasSinAsignar = [],
  modoRedistribucion = null,
  contextoRedistribucion = null
} = {}) => {
  const asignacionesOriginales = lista(asignacionBase).map((fila) => ({ ...fila }));
  const redistribucion = resolverRedistribucion({
    modoRedistribucion,
    accion: contextoRedistribucion?.accion,
    asignaciones: asignacionesOriginales,
    contexto: contextoRedistribucion
  });
  if (contextoRedistribucion?.accion === "generar" && redistribucion) {
    const trazasDerivadas = lista(redistribucion.trazasDerivadas).map((traza) => ({ ...traza }));
    const trazasDestino = trazasDerivadas.length > 0
      ? []
      : redistribucion.asignaciones.map((fila) => ({
          personaId: obtenerClaveIdentidadPersona(fila?.enfermero),
          origenSectorId: null,
          destinoSectorId: fila?.sectorId || null,
          causa: modoRedistribucion
        }));
    return {
      ...redistribucion,
      usados: new Set(redistribucion.asignaciones
        .map((fila) => obtenerClaveIdentidadPersona(fila?.enfermero)).filter(Boolean)),
      trazas: [...trazasDerivadas, ...trazasDestino]
    };
  }
  const asignacionesEntrada = lista(redistribucion?.asignaciones || asignacionesOriginales)
    .map((fila) => ({ ...fila }));
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
