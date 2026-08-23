import { TURNOS } from "../config/turnos.js";
import { estaCertificado, estaDeLicencia, parsearFechaLocal } from "./fechas.js";
import { normalizarFuncionarioIdentidad, obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { resolverPersonaDeLicencia } from "./licenciasPersonas.js";
import { resolverPersonaDeCertificacion } from "./certificacionesPersonas.js";
import {
  novedadAfectaDisponibilidadEnFecha,
  TIPOS_NOVEDAD_PERSONAL
} from "./novedadesPersonal.js";
import { MOTIVOS_NO_DISPONIBLE } from "./noDisponiblesMotivos.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";
import { esOrigenExtraOtroTurno } from "./extrasPersonas.js";

export const CAUSAS_INDISPONIBILIDAD_SUPERVISION = Object.freeze([
  "licencia",
  "certificacion",
  "suspension",
  "adhesion_paro",
  "no_disponible"
]);

export const ESTADOS_VALIDACION_EXTRA_ORIGEN = Object.freeze({
  NO_APLICA: "no_aplica",
  VERIFICADO_DISPONIBLE: "verificado_disponible",
  VERIFICADO_INDISPONIBLE: "verificado_indisponible",
  NO_VERIFICABLE: "no_verificable"
});

const claveCategoriaCalendario = (categoria) =>
  categoria === "enfermero" ? "enfermeros" : "licenciados";

const causaNovedad = (novedad) => {
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.LICENCIA) return "licencia";
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.CERTIFICACION) return "certificacion";
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.SUSPENSION) return "suspension";
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO) return "adhesion_paro";
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.OTRA) return "no_disponible";
  return null;
};

export const resolverIndisponibilidadesDia = ({
  estadoMensual,
  novedadesModernas = [],
  fecha,
  turno,
  categoria
} = {}) => {
  const personalCompleto = Array.isArray(estadoMensual?.personal)
    ? estadoMensual.personal
    : [];
  const personalCategoria = personalCompleto
    .filter((persona) => persona?.categoria === categoria);
  const fechaLocal = parsearFechaLocal(fecha);
  const porIdentidad = new Map();
  const advertencias = [];
  const agregar = (persona, causa) => {
    const identidad = obtenerClaveIdentidadPersona(persona);
    if (!identidad || !CAUSAS_INDISPONIBILIDAD_SUPERVISION.includes(causa)) return;
    if (!porIdentidad.has(identidad)) {
      porIdentidad.set(identidad, { persona, causas: new Set() });
    }
    porIdentidad.get(identidad).causas.add(causa);
  };

  personalCategoria.forEach((persona) => {
    if (estaDeLicencia(estadoMensual?.licencias, persona, fechaLocal, personalCompleto)) {
      agregar(persona, "licencia");
    }
    if (estaCertificado(estadoMensual?.certificaciones, persona, fechaLocal, personalCompleto)) {
      agregar(persona, "certificacion");
    }
  });
  (Array.isArray(estadoMensual?.licencias) ? estadoMensual.licencias : [])
    .filter((registro) => registro?.desde <= fecha && fecha <= registro?.hasta)
    .filter((registro) => !resolverPersonaDeLicencia(registro, personalCompleto))
    .forEach(() => advertencias.push({ codigo: "LICENCIA_PERSONA_NO_RESUELTA" }));
  (Array.isArray(estadoMensual?.certificaciones) ? estadoMensual.certificaciones : [])
    .filter((registro) => registro?.desde <= fecha && fecha <= registro?.hasta)
    .filter((registro) => !resolverPersonaDeCertificacion(registro, personalCompleto))
    .forEach(() => advertencias.push({ codigo: "CERTIFICACION_PERSONA_NO_RESUELTA" }));

  (Array.isArray(novedadesModernas) ? novedadesModernas : []).forEach((novedad) => {
    if (novedad?.turno && novedad.turno !== turno) return;
    if (novedad?.categoria && novedad.categoria !== categoria) return;
    const persona = resolverPersonaDesdeReferencia(
      { personaId: novedad?.personaId, nombre: novedad?.personaNombre },
      personalCompleto
    );
    if (!persona) {
      advertencias.push({ codigo: "NOVEDAD_PERSONA_NO_RESUELTA", novedadId: novedad?.id || null });
      return;
    }
    if (persona.categoria !== categoria) return;
    if (!novedadAfectaDisponibilidadEnFecha(novedad, persona, fecha)) return;
    const causa = causaNovedad(novedad);
    if (causa) agregar(persona, causa);
  });

  const calendario = estadoMensual?.calendario?.[claveCategoriaCalendario(categoria)] || {};
  const noDisponibles = Array.isArray(calendario?.noDisponibles?.[fecha])
    ? calendario.noDisponibles[fecha]
    : [];
  noDisponibles.forEach((registro) => {
    if (registro?.motivo === MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA) return;
    const persona = resolverPersonaDesdeReferencia(registro, personalCategoria);
    if (!persona) {
      advertencias.push({ codigo: "NO_DISPONIBLE_PERSONA_NO_RESUELTA" });
      return;
    }
    agregar(
      persona,
      registro?.motivo === MOTIVOS_NO_DISPONIBLE.ADHESION_PARO
        ? "adhesion_paro"
        : "no_disponible"
    );
  });

  return { personalCompleto, personalCategoria, porIdentidad, advertencias };
};

const resolverPersonaExtraEnOrigen = (
  extra,
  personalCompleto,
  personalCategoria,
  categoria
) => {
  const personaId = String(extra?.personaId ?? "").trim();
  if (personaId) {
    const persona = personalCompleto.find(
      (actual) => String(actual?.id ?? "").trim() === personaId
    );
    if (!persona) return { persona: null, motivo: "PERSONA_ID_NO_ENCONTRADA" };
    return persona.categoria === categoria
      ? { persona, motivo: null }
      : { persona: null, motivo: "CATEGORIA_NO_COINCIDE" };
  }
  const funcionario = normalizarFuncionarioIdentidad(extra?.funcionario);
  if (funcionario) {
    const coincidencias = personalCategoria.filter(
      (persona) => normalizarFuncionarioIdentidad(persona?.funcionario) === funcionario
    );
    return coincidencias.length === 1
      ? { persona: coincidencias[0], motivo: null }
      : { persona: null, motivo: coincidencias.length > 1 ? "FUNCIONARIO_AMBIGUO" : "FUNCIONARIO_NO_RESUELTO" };
  }
  const nombre = normalizar(extra?.nombre);
  if (!nombre) return { persona: null, motivo: "NOMBRE_NO_RESUELTO" };
  const coincidencias = personalCategoria.filter(
    (persona) => normalizar(persona?.nombre) === nombre
  );
  return coincidencias.length === 1
    ? { persona: coincidencias[0], motivo: null }
    : { persona: null, motivo: coincidencias.length > 1 ? "NOMBRE_AMBIGUO" : "NOMBRE_NO_RESUELTO" };
};

export const crearValidadorExtrasOrigenDia = ({
  estadosPorTurno = {},
  novedadesModernas = [],
  fecha
} = {}) => {
  const indices = new Map();
  Object.keys(TURNOS).forEach((turno) => {
    ["licenciado", "enfermero"].forEach((categoria) => {
      const estadoMensual = estadosPorTurno?.[turno] ?? null;
      if (!estadoMensual) return;
      indices.set(`${turno}|${categoria}`, resolverIndisponibilidadesDia({
        estadoMensual, novedadesModernas, fecha, turno, categoria
      }));
    });
  });

  return ({ extra, categoria } = {}) => {
    if (!esOrigenExtraOtroTurno(extra)) {
      return { estado: ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_APLICA, causas: [] };
    }
    const turnoOrigen = String(extra?.turnoOrigen ?? "").trim();
    if (!turnoOrigen) {
      return { estado: ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_VERIFICABLE, motivo: "TURNO_ORIGEN_FALTANTE", turnoOrigen: null, causas: [] };
    }
    if (!Object.hasOwn(TURNOS, turnoOrigen)) {
      return { estado: ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_VERIFICABLE, motivo: "TURNO_ORIGEN_INVALIDO", turnoOrigen, causas: [] };
    }
    const indice = indices.get(`${turnoOrigen}|${categoria}`);
    if (!indice) {
      return { estado: ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_VERIFICABLE, motivo: "ESTADO_ORIGEN_NO_DISPONIBLE", turnoOrigen, causas: [] };
    }
    const resolucion = resolverPersonaExtraEnOrigen(
      extra,
      indice.personalCompleto,
      indice.personalCategoria,
      categoria
    );
    if (!resolucion.persona) {
      return { estado: ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_VERIFICABLE, motivo: resolucion.motivo, turnoOrigen, causas: [] };
    }
    const identidad = obtenerClaveIdentidadPersona(resolucion.persona);
    const indisponibilidad = indice.porIdentidad.get(identidad);
    return indisponibilidad
      ? {
          estado: ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_INDISPONIBLE,
          turnoOrigen,
          personaId: String(resolucion.persona.id ?? "").trim() || null,
          causas: [...indisponibilidad.causas]
        }
      : {
          estado: ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE,
          turnoOrigen,
          personaId: String(resolucion.persona.id ?? "").trim() || null,
          causas: []
        };
  };
};
