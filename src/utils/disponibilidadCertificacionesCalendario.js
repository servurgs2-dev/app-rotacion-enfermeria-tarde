import { estaCertificado } from "./fechas.js";

export const crearDetectorCertificacionDia = ({
  certificaciones = [],
  fecha,
  personal = []
} = {}) => (persona) =>
  Boolean(persona) && estaCertificado(certificaciones, persona, fecha, personal);

export const excluirCertificadosDeAsignaciones = ({
  asignaciones = [],
  estaCertificada = () => false
} = {}) =>
  (Array.isArray(asignaciones) ? asignaciones : []).map((asignacion) =>
    asignacion?.enfermero && estaCertificada(asignacion.enfermero)
      ? { ...asignacion, enfermero: null, excluidoPorCertificacion: true }
      : asignacion
  );

export const filtrarPersonasNoCertificadas = ({
  personas = [],
  estaCertificada = () => false
} = {}) =>
  (Array.isArray(personas) ? personas : []).filter(
    (persona) => persona && !estaCertificada(persona)
  );
