import {
  ESTADOS_ASISTENCIA,
  obtenerEstadoAsistencia,
  obtenerPersonasPrevistas
} from "./asistenciaPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const obtenerRegistrosFecha = (asistenciaDia, fecha) =>
  esObjeto(asistenciaDia?.[fecha]) ? asistenciaDia[fecha] : {};

const reemplazarRegistrosFecha = (asistenciaDia, fecha, registros) => {
  const resultado = { ...(esObjeto(asistenciaDia) ? asistenciaDia : {}) };
  if (Object.keys(registros).length > 0) resultado[fecha] = registros;
  else delete resultado[fecha];
  return resultado;
};

export const esEstadoEscribibleAsistenciaV2 = (estado) =>
  estado === ESTADOS_ASISTENCIA.PRESENTE ||
  estado === ESTADOS_ASISTENCIA.PENDIENTE;

export const cambiarPresenciaV2 = ({ calendario, fecha, persona, estado }) => {
  const base = esObjeto(calendario) ? calendario : {};
  const clave = obtenerClaveIdentidadPersona(persona);
  if (!fecha || !clave || !esEstadoEscribibleAsistenciaV2(estado)) return base;

  const asistenciaDia = esObjeto(base.asistenciaDia) ? base.asistenciaDia : {};
  const registros = { ...obtenerRegistrosFecha(asistenciaDia, fecha) };
  const registroAnterior = registros[clave];
  if (esObjeto(registroAnterior) && registroAnterior.sinAsignar === true) {
    registros[clave] = { ...registroAnterior, estado };
  } else if (estado === ESTADOS_ASISTENCIA.PRESENTE) {
    registros[clave] = estado;
  } else {
    delete registros[clave];
  }

  return {
    ...base,
    asistenciaDia: reemplazarRegistrosFecha(asistenciaDia, fecha, registros)
  };
};

export const invalidarPresenteV2 = ({ calendario, fecha, persona }) => {
  const base = esObjeto(calendario) ? calendario : {};
  const registros = obtenerRegistrosFecha(base.asistenciaDia, fecha);
  if (obtenerEstadoAsistencia(registros, persona) !== ESTADOS_ASISTENCIA.PRESENTE) {
    return base;
  }
  return cambiarPresenciaV2({
    calendario: base,
    fecha,
    persona,
    estado: ESTADOS_ASISTENCIA.PENDIENTE
  });
};

export const obtenerCohorteConfirmable = ({
  asignaciones = [],
  esPersonaDisponible
} = {}) => obtenerPersonasPrevistas(asignaciones).filter((persona) => {
  const personaId = String(persona?.id || "").trim();
  return personaId &&
    typeof esPersonaDisponible === "function" &&
    esPersonaDisponible(persona) === true;
});

export const obtenerCohortePresentacionAsistenciaV2 = ({
  cohorteConfirmable = [],
  ausentesLegacy = []
} = {}) => obtenerPersonasPrevistas([
  ...cohorteConfirmable.map((persona) => ({ enfermero: persona })),
  ...ausentesLegacy.flatMap((registro) => {
    const persona = registro?.persona || registro;
    return persona ? [{ enfermero: persona }] : [];
  })
]);

export const marcarCohortePresenteV2 = ({ calendario, fecha, personas = [] }) =>
  obtenerPersonasPrevistas(
    personas.map((persona) => ({ enfermero: persona }))
  ).reduce(
    (actual, persona) => cambiarPresenciaV2({
      calendario: actual,
      fecha,
      persona,
      estado: ESTADOS_ASISTENCIA.PRESENTE
    }),
    esObjeto(calendario) ? calendario : {}
  );

export const limpiarPresentesV2 = ({ calendario, fecha }) => {
  const base = esObjeto(calendario) ? calendario : {};
  if (!fecha || !esObjeto(base.asistenciaDia?.[fecha])) return base;

  const registros = Object.fromEntries(
    Object.entries(base.asistenciaDia[fecha]).flatMap(([clave, registro]) => {
      const estado = esObjeto(registro) ? registro.estado : registro;
      if (estado !== ESTADOS_ASISTENCIA.PRESENTE) return [[clave, registro]];
      if (esObjeto(registro) && registro.sinAsignar === true) {
        return [[clave, { ...registro, estado: ESTADOS_ASISTENCIA.PENDIENTE }]];
      }
      return [];
    })
  );

  return {
    ...base,
    asistenciaDia: reemplazarRegistrosFecha(base.asistenciaDia, fecha, registros)
  };
};
