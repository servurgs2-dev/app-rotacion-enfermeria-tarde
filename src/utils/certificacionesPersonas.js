import {
  crearReferenciaPersona,
  normalizarReferenciaPersona,
  obtenerNombreDesdeReferencia,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { crearHashDeterministaIdentidad } from "./identidadPersonas.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const ORIGEN_CERTIFICACION_DIA = "no_disponibles_dia";

const esFechaValida = (fecha) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return false;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const local = new Date(anio, mes - 1, dia, 12);
  return local.getFullYear() === anio &&
    local.getMonth() === mes - 1 &&
    local.getDate() === dia;
};

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

export const esCertificacionPorElDia = (certificacion) =>
  certificacion?.origen === ORIGEN_CERTIFICACION_DIA &&
  Boolean(String(certificacion?.id || "").trim());

export const crearCertificacionPorElDia = ({
  persona,
  fecha,
  categoria,
  creadoEn = new Date().toISOString()
} = {}) => {
  if (!persona) {
    return { certificacion: null, error: "Seleccioná una persona." };
  }
  if (!esFechaValida(fecha)) {
    return { certificacion: null, error: "La fecha seleccionada no es válida." };
  }
  if (!persona.id || persona.categoria !== categoria) {
    return {
      certificacion: null,
      error: persona.categoria !== categoria
        ? "La persona seleccionada no corresponde a esta categoría."
        : "No se pudo identificar a la persona seleccionada."
    };
  }
  const referencia = crearReferenciaPersona(persona);
  if (!referencia) {
    return { certificacion: null, error: "No se pudo identificar a la persona seleccionada." };
  }
  const fuenteId = `${ORIGEN_CERTIFICACION_DIA}|${referencia.personaId}|${fecha}`;
  return {
    certificacion: {
      id: `cert-dia-${crearHashDeterministaIdentidad(fuenteId)}`,
      origen: ORIGEN_CERTIFICACION_DIA,
      categoria,
      desde: fecha,
      hasta: fecha,
      creadoEn,
      ...referencia
    },
    error: ""
  };
};

export const agregarCertificacionPorElDia = ({
  certificaciones,
  persona,
  fecha,
  categoria,
  personal,
  creadoEn
} = {}) => {
  const lista = Array.isArray(certificaciones) ? certificaciones : [];
  const referencia = crearReferenciaPersona(persona);
  const personaActual = referencia
    ? resolverPersonaDesdeReferencia(referencia, personal)
    : null;
  if (!personaActual) {
    return {
      certificaciones: lista,
      certificacion: null,
      error: persona ? "No se pudo identificar a la persona seleccionada." : "Seleccioná una persona."
    };
  }
  const existente = lista.some((certificacion) =>
    certificacionCorrespondeAPersona(certificacion, personaActual, personal) &&
    esFechaValida(certificacion?.desde) &&
    esFechaValida(certificacion?.hasta) &&
    certificacion.desde <= fecha &&
    fecha <= certificacion.hasta
  );
  if (existente) {
    return {
      certificaciones: lista,
      certificacion: null,
      error: `${personaActual.nombre || "La persona"} ya está certificado para esta fecha.`
    };
  }
  const creada = crearCertificacionPorElDia({
    persona: personaActual,
    fecha,
    categoria,
    creadoEn
  });
  return creada.certificacion
    ? {
        certificaciones: [...lista, creada.certificacion],
        certificacion: creada.certificacion,
        error: ""
      }
    : { certificaciones: lista, certificacion: null, error: creada.error };
};

export const eliminarCertificacionPorElDia = ({ certificaciones, certificacionId } = {}) => {
  const lista = Array.isArray(certificaciones) ? certificaciones : [];
  const id = String(certificacionId || "").trim();
  if (!id) return lista;
  return lista.filter(
    (certificacion) =>
      !(esCertificacionPorElDia(certificacion) && String(certificacion.id) === id)
  );
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
