import {
  obtenerClaveIdentidadPersona,
  personasCompartenIdentidad
} from "./identidadPersonas.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { resolverClaveDistribucionParaFila } from "./resolucionIdentidadesPlanilla.js";

export const SECTOR_ID_SALUD_MENTAL = "salud_mental";

export const obtenerTitularSaludMental = ({ planillaSemana, personal, fila }) =>
  resolverPersonaDesdeReferencia(
    planillaSemana?.[resolverClaveDistribucionParaFila({ distribucion: planillaSemana, fila })],
    personal
  );

export const resolverCoberturaSemanalSaludMental = ({
  planilla,
  semana,
  personal
}) => resolverCoberturaSaludMental({
  coberturas: planilla?.coberturaLibreSM,
  clave: semana,
  personal
});

export const resolverCoberturaSaludMental = ({
  coberturas,
  clave,
  personal
}) => resolverPersonaDesdeReferencia(
  coberturas?.[clave],
  personal
);

export const puedeCubrirLibreSaludMental = ({
  persona,
  tipo,
  estaLibre = false,
  estaDeLicencia = false,
  estaCertificada = false,
  estaNoDisponible = false
}) => Boolean(
  persona &&
  persona.categoria === tipo &&
  String(persona.id ?? "").trim() &&
  obtenerClaveIdentidadPersona(persona) &&
  !estaLibre &&
  !estaDeLicencia &&
  !estaCertificada &&
  !estaNoDisponible
);

export const aplicarCoberturaLibreSaludMental = ({
  asignaciones,
  sectorId = SECTOR_ID_SALUD_MENTAL,
  titular,
  cobertura,
  titularLibre,
  coberturaDisponible,
  existeCambioManual
}) => {
  const base = Array.isArray(asignaciones) ? asignaciones : [];
  if (
    !titular ||
    !cobertura ||
    !titularLibre ||
    !coberturaDisponible ||
    existeCambioManual ||
    !base.some((asignacion) => asignacion?.sectorId === sectorId)
  ) return base;

  return base.map((asignacion) => {
    if (asignacion?.sectorId === sectorId) {
      return { ...asignacion, enfermero: cobertura, coberturaLibreSM: true };
    }
    if (personasCompartenIdentidad(asignacion?.enfermero, cobertura)) {
      return { ...asignacion, enfermero: null };
    }
    return asignacion;
  });
};
