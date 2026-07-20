import {
  crearReferenciaPersona,
  normalizarReferenciaPersona,
  obtenerNombreDesdeReferencia,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const referenciaDeLicencia = (licencia) => {
  if (!esObjeto(licencia)) return licencia;
  return licencia.personaId ? licencia : licencia.nombre;
};

export const crearLicenciaPersona = (persona, desde, hasta, datosAdicionales = {}) => {
  const referencia = crearReferenciaPersona(persona);
  if (!referencia) return null;

  return {
    ...(esObjeto(datosAdicionales) ? datosAdicionales : {}),
    ...referencia,
    desde,
    hasta
  };
};

export const resolverPersonaDeLicencia = (licencia, personal) =>
  resolverPersonaDesdeReferencia(referenciaDeLicencia(licencia), personal);

export const obtenerNombreDeLicencia = (licencia, personal) =>
  obtenerNombreDesdeReferencia(referenciaDeLicencia(licencia), personal);

export const normalizarLicenciaPersona = (licencia, personal) => {
  if (!esObjeto(licencia)) return licencia;

  const referencia = normalizarReferenciaPersona(
    referenciaDeLicencia(licencia),
    personal
  );

  if (esObjeto(referencia) && referencia.personaId) {
    return { ...licencia, ...referencia };
  }

  return { ...licencia };
};

export const normalizarLicenciasPersonas = (licencias, personal) =>
  Array.isArray(licencias)
    ? licencias.map((licencia) => normalizarLicenciaPersona(licencia, personal))
    : licencias;

export const licenciaCorrespondeAPersona = (licencia, persona, personal) => {
  if (!esObjeto(licencia) || !persona) return false;

  const resuelta = resolverPersonaDeLicencia(licencia, personal);
  if (resuelta) {
    return Boolean(persona.id) && String(resuelta.id).trim() === String(persona.id).trim();
  }

  return false;
};
