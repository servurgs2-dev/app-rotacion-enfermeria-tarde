import {
  ESTADOS_ASISTENCIA,
  obtenerEstadoAsistencia
} from "./asistenciaPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import {
  crearReferenciaPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const obtenerRegistroAsistencia = (registros, persona) => {
  const clave = obtenerClaveIdentidadPersona(persona);
  return clave && esObjeto(registros) ? registros[clave] : undefined;
};

const crearRegistroConContexto = ({
  estado,
  persona,
  sectorOrigen,
  sinAsignar = false,
  valorSectorAnterior
}) => ({
  estado,
  persona: crearReferenciaPersona(persona),
  sectorOrigen: String(sectorOrigen || "").trim(),
  ...(valorSectorAnterior !== undefined ? { valorSectorAnterior } : {}),
  ...(sinAsignar ? { sinAsignar: true } : {})
});

export const cambiarAsistenciaCalendario = ({
  calendario,
  fecha,
  persona,
  sectorActual,
  estado,
  sectoresVisibles = []
}) => {
  const base = esObjeto(calendario) ? calendario : {};
  const clave = obtenerClaveIdentidadPersona(persona);
  if (
    !fecha ||
    !clave ||
    !Object.values(ESTADOS_ASISTENCIA).includes(estado)
  ) return base;

  const asistenciaDia = { ...(base.asistenciaDia || {}) };
  const registros = { ...(asistenciaDia[fecha] || {}) };
  const cambiosDia = { ...(base.cambiosDia || {}) };
  const cambiosFecha = { ...(cambiosDia[fecha] || {}) };
  const registroAnterior = registros[clave];
  const estadoAnterior = obtenerEstadoAsistencia(registros, persona);

  if (estado === ESTADOS_ASISTENCIA.AUSENTE) {
    const estabaSinAsignar =
      esObjeto(registroAnterior) && registroAnterior.sinAsignar === true;
    const sectorOrigen = String(
      (estabaSinAsignar ? registroAnterior.sectorOrigen : sectorActual) ||
      registroAnterior?.sectorOrigen ||
      ""
    ).trim();
    registros[clave] = crearRegistroConContexto({
      estado,
      persona,
      sectorOrigen,
      valorSectorAnterior: cambiosFecha[normalizar(sectorOrigen)]
    });
    if (!estabaSinAsignar && sectorOrigen) {
      cambiosFecha[normalizar(sectorOrigen)] = "__EMPTY__";
    }
  } else if (estadoAnterior === ESTADOS_ASISTENCIA.AUSENTE) {
    const sectorOrigen = String(registroAnterior?.sectorOrigen || "").trim();
    const claveSector = normalizar(sectorOrigen);
    const sectorExiste = sectoresVisibles.some(
      (sector) => normalizar(sector) === claveSector
    );
    const sectorContinuaVacio =
      sectorExiste && cambiosFecha[claveSector] === "__EMPTY__";

    if (sectorContinuaVacio) {
      if (
        esObjeto(registroAnterior) &&
        Object.hasOwn(registroAnterior, "valorSectorAnterior")
      ) {
        cambiosFecha[claveSector] = registroAnterior.valorSectorAnterior;
      } else {
        delete cambiosFecha[claveSector];
      }
      if (estado === ESTADOS_ASISTENCIA.PENDIENTE) delete registros[clave];
      else registros[clave] = estado;
    } else {
      registros[clave] = crearRegistroConContexto({
        estado,
        persona,
        sectorOrigen,
        sinAsignar: true
      });
    }
  } else if (
    esObjeto(registroAnterior) &&
    registroAnterior.sinAsignar === true
  ) {
    registros[clave] = {
      ...registroAnterior,
      estado
    };
  } else if (estado === ESTADOS_ASISTENCIA.PENDIENTE) {
    delete registros[clave];
  } else {
    registros[clave] = estado;
  }

  if (Object.keys(registros).length > 0) asistenciaDia[fecha] = registros;
  else delete asistenciaDia[fecha];
  if (Object.keys(cambiosFecha).length > 0) cambiosDia[fecha] = cambiosFecha;
  else delete cambiosDia[fecha];

  return {
    ...base,
    asistenciaDia,
    cambiosDia
  };
};

export const prepararCambioAsistencia = ({
  calendarioActual,
  calendarioEsperado,
  ...cambio
}) => {
  if (calendarioActual !== calendarioEsperado) {
    return {
      tipo: "contexto_cambiado",
      calendario: calendarioActual,
      mensaje: "El calendario cambió. Revisá nuevamente la asistencia."
    };
  }

  return {
    tipo: "aplicado",
    calendario: cambiarAsistenciaCalendario({
      ...cambio,
      calendario: calendarioActual
    }),
    mensaje: ""
  };
};

export const filtrarAsignacionesAusentes = ({
  asignaciones,
  registros
}) => (Array.isArray(asignaciones) ? asignaciones : []).map((asignacion) => {
  if (
    !asignacion?.enfermero ||
    obtenerEstadoAsistencia(registros, asignacion.enfermero) !==
      ESTADOS_ASISTENCIA.AUSENTE
  ) return asignacion;

  return {
    ...asignacion,
    enfermero: null
  };
});

export const obtenerAusentesDelDia = ({ registros, personal }) =>
  Object.entries(esObjeto(registros) ? registros : {}).flatMap(
    ([clave, registro]) => {
      const estado = esObjeto(registro) ? registro.estado : registro;
      if (estado !== ESTADOS_ASISTENCIA.AUSENTE) return [];

      const persona = esObjeto(registro)
        ? resolverPersonaDesdeReferencia(registro.persona, personal)
        : (personal || []).find(
            (candidata) => obtenerClaveIdentidadPersona(candidata) === clave
          );

      return [{
        clave,
        persona,
        nombre: persona?.nombre || registro?.persona?.nombre || "Persona no identificada",
        sectorOrigen: esObjeto(registro) ? registro.sectorOrigen || "" : "",
        categoria: persona?.categoria || "",
        horario: persona?.horario || ""
      }];
    }
  );

export const obtenerPersonasParaSinAsignar = ({ registros, personal }) =>
  Object.values(esObjeto(registros) ? registros : {})
    .filter((registro) =>
      esObjeto(registro) &&
      registro.sinAsignar === true &&
      registro.estado !== ESTADOS_ASISTENCIA.AUSENTE
    )
    .map((registro) => resolverPersonaDesdeReferencia(registro.persona, personal))
    .filter(Boolean);

export const quitarPersonasDeSinAsignar = ({
  asistenciaDia,
  fecha,
  personas
}) => {
  const base = esObjeto(asistenciaDia) ? asistenciaDia : {};
  const registrosActuales = esObjeto(base[fecha]) ? base[fecha] : {};
  const claves = new Set(
    (Array.isArray(personas) ? personas : [])
      .map(obtenerClaveIdentidadPersona)
      .filter(Boolean)
  );
  if (claves.size === 0) return base;

  let cambio = false;
  const registros = Object.fromEntries(
    Object.entries(registrosActuales).map(([clave, registro]) => {
      if (
        !claves.has(clave) ||
        !esObjeto(registro) ||
        registro.sinAsignar !== true
      ) return [clave, registro];

      const registroAsignado = { ...registro };
      delete registroAsignado.sinAsignar;
      cambio = true;
      return [clave, registroAsignado];
    })
  );
  if (!cambio) return base;

  return {
    ...base,
    [fecha]: registros
  };
};
