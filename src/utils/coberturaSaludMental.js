import {
  obtenerClaveIdentidadPersona,
  personasCompartenIdentidad
} from "./identidadPersonas.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";

export const obtenerSectorSaludMental = (tipo) =>
  tipo === "enfermero" ? "SM" : "Salud Mental";

export const obtenerTitularSaludMental = ({ planillaSemana, personal, tipo }) =>
  resolverPersonaDesdeReferencia(
    planillaSemana?.[obtenerSectorSaludMental(tipo)],
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
  sector,
  titular,
  cobertura,
  titularLibre,
  coberturaDisponible,
  existeCambioManual
}) => {
  const base = Array.isArray(asignaciones) ? asignaciones : [];
  if (
    !sector ||
    !titular ||
    !cobertura ||
    !titularLibre ||
    !coberturaDisponible ||
    existeCambioManual ||
    !base.some((asignacion) => asignacion?.nombre === sector)
  ) return base;

  return base.map((asignacion) => {
    if (asignacion?.nombre === sector) {
      return { ...asignacion, enfermero: cobertura, coberturaLibreSM: true };
    }
    if (personasCompartenIdentidad(asignacion?.enfermero, cobertura)) {
      return { ...asignacion, enfermero: null };
    }
    return asignacion;
  });
};
