import {
  crearReferenciaPersona,
  normalizarReferenciaPersona,
  obtenerNombreDesdeReferencia,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const referenciaDeCertificacion = (certificacion) => {
  if (!esObjeto(certificacion)) return certificacion;
  return certificacion.personaId ? certificacion : certificacion.nombre;
};

export const crearCertificacionPersona = (persona, datos = {}) => {
  const referencia = crearReferenciaPersona(persona);
  if (!referencia) return null;

  return {
    ...(esObjeto(datos) ? datos : {}),
    ...referencia
  };
};

export const resolverPersonaDeCertificacion = (certificacion, personal) =>
  resolverPersonaDesdeReferencia(referenciaDeCertificacion(certificacion), personal);

export const obtenerNombreDeCertificacion = (certificacion, personal) =>
  obtenerNombreDesdeReferencia(referenciaDeCertificacion(certificacion), personal);

export const normalizarCertificacionPersona = (certificacion, personal) => {
  if (!esObjeto(certificacion)) return certificacion;

  const referencia = normalizarReferenciaPersona(
    referenciaDeCertificacion(certificacion),
    personal
  );

  return esObjeto(referencia) && referencia.personaId
    ? { ...certificacion, ...referencia }
    : { ...certificacion };
};

export const normalizarCertificacionesPersonas = (certificaciones, personal) =>
  Array.isArray(certificaciones)
    ? certificaciones.map((certificacion) =>
        normalizarCertificacionPersona(certificacion, personal)
      )
    : certificaciones;

export const certificacionCorrespondeAPersona = (
  certificacion,
  persona,
  personal
) => {
  if (!esObjeto(certificacion) || !persona) return false;

  const resuelta = resolverPersonaDeCertificacion(certificacion, personal);
  return Boolean(resuelta && persona.id) &&
    String(resuelta.id).trim() === String(persona.id).trim();
};
