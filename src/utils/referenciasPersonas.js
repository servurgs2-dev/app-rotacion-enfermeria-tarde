import { normalizar } from "./texto.js";

const normalizarNombreReferencia = (nombre) =>
  (normalizar(nombre) || "").replace(/\s+/g, " ");

const obtenerId = (valor) => String(valor ?? "").trim();
const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const buscarUnicoPorNombre = (nombre, personal) => {
  const nombreNormalizado = normalizarNombreReferencia(nombre);
  if (!nombreNormalizado) return null;

  const coincidencias = (Array.isArray(personal) ? personal : []).filter(
    (persona) => normalizarNombreReferencia(persona?.nombre) === nombreNormalizado
  );
  return coincidencias.length === 1 ? coincidencias[0] : null;
};

export const esReferenciaPersona = (valor) =>
  esObjeto(valor) && Boolean(obtenerId(valor.personaId));

export const crearReferenciaPersona = (persona) => {
  const personaId = obtenerId(persona?.id);
  if (!personaId) return null;
  return { personaId, nombre: String(persona?.nombre ?? "").trim() };
};

export const resolverPersonaDesdeReferencia = (referencia, personal) => {
  const lista = Array.isArray(personal) ? personal : [];
  const personaId = esObjeto(referencia)
    ? obtenerId(referencia.personaId)
    : typeof referencia === "string"
      ? referencia.trim()
      : "";

  if (personaId) {
    const porId = lista.find((persona) => obtenerId(persona?.id) === personaId);
    if (porId) return porId;
    if (esObjeto(referencia)) return null;
  }

  const nombreHistorico = esObjeto(referencia)
    ? referencia.nombre
    : typeof referencia === "string"
      ? referencia
      : "";
  return buscarUnicoPorNombre(nombreHistorico, lista);
};

export const obtenerNombreDesdeReferencia = (referencia, personal) => {
  const persona = resolverPersonaDesdeReferencia(referencia, personal);
  if (persona) return String(persona.nombre ?? "").trim();
  if (esObjeto(referencia) && typeof referencia.nombre === "string") {
    return referencia.nombre.trim();
  }
  return typeof referencia === "string" ? referencia : "";
};

export const normalizarReferenciaPlanilla = (referencia, personal) => {
  if (referencia === "" || referencia === null || referencia === undefined) {
    return referencia;
  }

  const persona = resolverPersonaDesdeReferencia(referencia, personal);
  if (persona) {
    const canonica = crearReferenciaPersona(persona);
    return esObjeto(referencia) ? { ...referencia, ...canonica } : canonica;
  }

  if (esReferenciaPersona(referencia)) {
    return {
      ...referencia,
      personaId: obtenerId(referencia.personaId),
      ...(typeof referencia.nombre === "string"
        ? { nombre: referencia.nombre.trim() }
        : {})
    };
  }
  return esObjeto(referencia) ? { ...referencia } : referencia;
};

export const referenciaCorrespondeAPersona = (referencia, persona) => {
  const personaId = obtenerId(persona?.id);
  if (esObjeto(referencia) && obtenerId(referencia.personaId)) {
    return Boolean(personaId) && obtenerId(referencia.personaId) === personaId;
  }
  if (typeof referencia === "string" && personaId && referencia.trim() === personaId) {
    return true;
  }

  const nombreReferencia = esObjeto(referencia) ? referencia.nombre : referencia;
  const nombreNormalizado = normalizarNombreReferencia(nombreReferencia);
  return Boolean(nombreNormalizado) &&
    nombreNormalizado === normalizarNombreReferencia(persona?.nombre);
};
