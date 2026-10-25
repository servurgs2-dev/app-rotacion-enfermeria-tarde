import { TURNOS } from "../config/turnos.js";
import { normalizarFuncionarioIdentidad, obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { resolverPersonaDeLicencia } from "./licenciasPersonas.js";
import { resolverPersonaDeCertificacion } from "./certificacionesPersonas.js";
import { normalizar } from "./texto.js";
import { esOrigenExtraOtroTurno } from "./extrasPersonas.js";
import { resolverDisponibilidadPersonalPorFecha } from "./resolverDisponibilidadPersonalPorFecha.js";

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

const normalizarCausaSupervision = (codigo) =>
  CAUSAS_INDISPONIBILIDAD_SUPERVISION.includes(codigo)
    ? codigo
    : "no_disponible";

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
  const calendario = estadoMensual?.calendario?.[claveCategoriaCalendario(categoria)] || {};
  const noDisponiblesDiaTurno = Array.isArray(calendario?.noDisponibles?.[fecha])
    ? calendario.noDisponibles[fecha]
    : [];
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
    const disponibilidad = resolverDisponibilidadPersonalPorFecha({
      persona,
      personal: personalCompleto,
      fecha,
      turnoConsultado: turno,
      padronVigencias: estadoMensual?.padronVigencias || [],
      novedadesModernas,
      licenciasLegacy: estadoMensual?.licencias,
      certificacionesLegacy: estadoMensual?.certificaciones,
      noDisponiblesDiaTurno,
      asistenciaDia: {},
      libresTurno: [],
      extrasDiaTurno: [],
      cambiosHorario: novedadesModernas
    });
    disponibilidad.causasBloqueantes.forEach((causa) =>
      agregar(persona, normalizarCausaSupervision(causa.codigo))
    );
    disponibilidad.advertencias.forEach((advertencia) => advertencias.push({
      ...advertencia,
      personaId: disponibilidad.personaId
    }));
  });
  (Array.isArray(estadoMensual?.licencias) ? estadoMensual.licencias : [])
    .filter((registro) => registro?.desde <= fecha && fecha <= registro?.hasta)
    .filter((registro) => !resolverPersonaDeLicencia(registro, personalCompleto))
    .forEach(() => advertencias.push({ codigo: "LICENCIA_PERSONA_NO_RESUELTA" }));
  (Array.isArray(estadoMensual?.certificaciones) ? estadoMensual.certificaciones : [])
    .filter((registro) => registro?.desde <= fecha && fecha <= registro?.hasta)
    .filter((registro) => !resolverPersonaDeCertificacion(registro, personalCompleto))
    .forEach(() => advertencias.push({ codigo: "CERTIFICACION_PERSONA_NO_RESUELTA" }));

  porIdentidad.forEach((entrada) => {
    entrada.causas = new Set(CAUSAS_INDISPONIBILIDAD_SUPERVISION.filter(
      (causa) => entrada.causas.has(causa)
    ));
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
