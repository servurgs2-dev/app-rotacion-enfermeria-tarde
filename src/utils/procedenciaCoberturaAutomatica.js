import {
  esPersonaTurnante,
  obtenerNombreConMarcaTurnante
} from "./etiquetaTurnante.js";

export const MARCAS_COBERTURA_AUTOMATICA_POR_SECTOR_ID = Object.freeze({
  rea_2: "RT",
  explora_2: "ET",
  sillon_2: "ST"
});

export const obtenerMarcaOrigenCoberturaAutomatica = (asignacion) =>
  MARCAS_COBERTURA_AUTOMATICA_POR_SECTOR_ID[
    asignacion?.origenCoberturaAutomaticaSectorId
  ] || null;

export const obtenerNombreAsignacionCalendario = (
  asignacion,
  nombreAlternativo = "",
  identidadesTurnantes
) => {
  const persona = asignacion?.enfermero;
  const nombre = obtenerNombreConMarcaTurnante(
    persona,
    nombreAlternativo,
    identidadesTurnantes
  );
  const marca = obtenerMarcaOrigenCoberturaAutomatica(asignacion);
  if (
    !nombre ||
    !marca ||
    persona?.esExtra === true ||
    esPersonaTurnante(persona, identidadesTurnantes)
  ) return nombre;
  return `${nombre} (${marca})`;
};

export const aplicarProcedenciaCoberturaAutomaticaPersistida = ({
  asignaciones = [],
  procedenciasPorPersonaId = {},
  cambiosDia = {}
} = {}) => (Array.isArray(asignaciones) ? asignaciones : []).map((asignacion) => {
  const personaId = String(asignacion?.enfermero?.id || "").trim();
  const origenPersistido = personaId ? procedenciasPorPersonaId?.[personaId] : null;
  const tieneMovimientoPersistido = personaId && Object.values(cambiosDia || {}).some(
    (referencia) => String(referencia?.personaId || "").trim() === personaId
  );
  const origenActual = asignacion?.origenCoberturaAutomaticaSectorId;
  const origen = origenActual || (
    origenPersistido &&
    tieneMovimientoPersistido &&
    asignacion?.sectorId !== origenPersistido
      ? origenPersistido
      : null
  );
  return origen && MARCAS_COBERTURA_AUTOMATICA_POR_SECTOR_ID[origen]
    ? { ...asignacion, origenCoberturaAutomaticaSectorId: origen }
    : asignacion;
});

export const obtenerProcedenciasCoberturaAutomaticaActivas = (asignaciones = []) =>
  Object.fromEntries((Array.isArray(asignaciones) ? asignaciones : []).flatMap((asignacion) => {
    const personaId = String(asignacion?.enfermero?.id || "").trim();
    const origen = asignacion?.origenCoberturaAutomaticaSectorId;
    return personaId && MARCAS_COBERTURA_AUTOMATICA_POR_SECTOR_ID[origen]
      ? [[personaId, origen]]
      : [];
  }));
