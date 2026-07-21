import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";

export const ESTADOS_ASISTENCIA = Object.freeze({
  PENDIENTE: "pendiente",
  PRESENTE: "presente",
  AUSENTE: "ausente"
});

const esObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const obtenerPersonasPrevistas = (asignaciones) => [
  ...new Map(
    (Array.isArray(asignaciones) ? asignaciones : [])
      .map((asignacion) => asignacion?.enfermero)
      .filter((persona) => esObjeto(persona))
      .map((persona) => [obtenerClaveIdentidadPersona(persona), persona])
      .filter(([clave]) => Boolean(clave))
  ).values()
];

export const obtenerEstadoAsistencia = (registros, persona) => {
  const clave = obtenerClaveIdentidadPersona(persona);
  const estado = clave && esObjeto(registros) ? registros[clave] : undefined;
  return estado === ESTADOS_ASISTENCIA.PRESENTE || estado === ESTADOS_ASISTENCIA.AUSENTE
    ? estado
    : ESTADOS_ASISTENCIA.PENDIENTE;
};

export const actualizarAsistenciaPersona = (asistenciaDia, fecha, persona, estado) => {
  const base = esObjeto(asistenciaDia) ? asistenciaDia : {};
  const clave = obtenerClaveIdentidadPersona(persona);
  if (!fecha || !clave || !Object.values(ESTADOS_ASISTENCIA).includes(estado)) return base;

  const registros = esObjeto(base[fecha]) ? base[fecha] : {};
  const nuevos = { ...registros };
  if (estado === ESTADOS_ASISTENCIA.PENDIENTE) delete nuevos[clave];
  else nuevos[clave] = estado;

  const resultado = { ...base };
  if (Object.keys(nuevos).length > 0) resultado[fecha] = nuevos;
  else delete resultado[fecha];
  return resultado;
};

export const marcarPersonasPresentes = (asistenciaDia, fecha, personas) => {
  const base = esObjeto(asistenciaDia) ? asistenciaDia : {};
  if (!fecha) return base;
  const registros = { ...(esObjeto(base[fecha]) ? base[fecha] : {}) };
  obtenerPersonasPrevistas(
    (Array.isArray(personas) ? personas : []).map((persona) => ({ enfermero: persona }))
  ).forEach((persona) => {
    registros[obtenerClaveIdentidadPersona(persona)] = ESTADOS_ASISTENCIA.PRESENTE;
  });
  return { ...base, [fecha]: registros };
};

export const limpiarAsistenciaFecha = (asistenciaDia, fecha) => {
  const base = esObjeto(asistenciaDia) ? asistenciaDia : {};
  if (!fecha || !Object.hasOwn(base, fecha)) return base;
  const resultado = { ...base };
  delete resultado[fecha];
  return resultado;
};

export const resumirAsistencia = (personas, registros) => {
  const unicas = obtenerPersonasPrevistas(
    (Array.isArray(personas) ? personas : []).map((persona) => ({ enfermero: persona }))
  );
  return unicas.reduce((resumen, persona) => {
    const estado = obtenerEstadoAsistencia(registros, persona);
    resumen[estado] += 1;
    return resumen;
  }, { previstos: unicas.length, presente: 0, ausente: 0, pendiente: 0 });
};
