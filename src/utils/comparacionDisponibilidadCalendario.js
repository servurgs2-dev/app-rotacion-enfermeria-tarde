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
