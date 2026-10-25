import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { resolverDisponibilidadPersonalPorFecha } from "./resolverDisponibilidadPersonalPorFecha.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

export const prepararContextoOperativoDisponibilidad = ({
  noDisponiblesDiaTurno = [],
  asistenciaDia = {},
  libresTurno = [],
  extrasDiaTurno = []
} = {}) => ({
  noDisponiblesDiaTurno,
  asistenciaDia,
  libresTurno,
  extrasDiaTurno
});

export const prepararPersonasDisponibilidadCalendario = (...colecciones) => {
  const porPersonaId = new Map();
  colecciones.flatMap(lista).forEach((persona) => {
    const personaId = String(persona?.id || "").trim();
    if (personaId && !porPersonaId.has(personaId)) porPersonaId.set(personaId, persona);
  });
  return [...porPersonaId.values()];
};

export const crearPredicadosDisponibilidadNormalizada = (
  disponibilidadNormalizadaPorPersonaId
) => {
  const obtener = (persona) => disponibilidadNormalizadaPorPersonaId.get(
    String(persona?.id || "").trim()
  );
  return {
    esPersonaDisponibleNormalizada: (persona) =>
      obtener(persona)?.disponibleEnTurno === true,
    esPersonaDisponibleParaCoberturaNormalizada: (persona) =>
      obtener(persona)?.disponibleParaCobertura === true
  };
};

export const compararDisponibilidadCalendario = ({
  personas = [],
  contextoOperativo,
  contextoAdministrativo = {},
  esPersonaDisponibleActual,
  esPersonaDisponibleParaCoberturaActual,
  comparar = true
} = {}) => {
  const disponibilidadNormalizadaPorPersonaId = new Map();
  const diferencias = [];

  lista(personas).forEach((persona) => {
    const personaId = String(persona?.id || "").trim();
    if (!personaId || disponibilidadNormalizadaPorPersonaId.has(personaId)) return;
    const normalizada = resolverDisponibilidadPersonalPorFecha({
      ...contextoAdministrativo,
      ...contextoOperativo,
      persona
    });
    disponibilidadNormalizadaPorPersonaId.set(personaId, normalizada);
    if (!comparar) return;

    const actualDisponible = Boolean(esPersonaDisponibleActual?.(persona));
    const actualCobertura = Boolean(esPersonaDisponibleParaCoberturaActual?.(persona));
    if (actualDisponible !== normalizada.disponibleEnTurno) {
      diferencias.push({
        personaId,
        campo: "disponibleEnTurno",
        actual: actualDisponible,
        normalizado: normalizada.disponibleEnTurno
      });
    }
    if (actualCobertura !== normalizada.disponibleParaCobertura) {
      diferencias.push({
        personaId,
        campo: "disponibleParaCobertura",
        actual: actualCobertura,
        normalizado: normalizada.disponibleParaCobertura
      });
    }
  });

  return {
    disponibilidadNormalizadaPorPersonaId,
    diferencias,
    comparacionOmitida: !comparar,
    identidadesEvaluadas: [...disponibilidadNormalizadaPorPersonaId.values()]
      .map((resultado) => resultado.personaId)
      .filter(Boolean),
    clavesIdentidadActuales: lista(personas)
      .map(obtenerClaveIdentidadPersona)
      .filter(Boolean)
  };
};
