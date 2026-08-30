import {
  aplicarCoberturasDirectasExtras,
  esExtraCobertura
} from "./extrasPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { aplicarPrioridadGeneralPorSectorId } from "./prioridadesSectores.js";
import { PAREJAS_COBERTURA_ENFERMEROS } from "./coberturaParejasEnfermeros.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

export const resolverTurnantesYCoberturasOperativas = ({
  asignaciones,
  extras,
  personal,
  esPersonaDisponible,
  esPersonaDisponibleParaCobertura = esPersonaDisponible,
  ajustarSectores = (sectores) => sectores,
  prioridadSectorIds = [],
  sectorIdsDonantes = []
} = {}) => {
  const disponibles = typeof esPersonaDisponible === "function"
    ? esPersonaDisponible
    : () => true;
  const disponiblesParaCobertura = typeof esPersonaDisponibleParaCobertura === "function"
    ? esPersonaDisponibleParaCobertura
    : disponibles;
  const usados = new Set();
  const usar = (persona) => {
    const identidad = obtenerClaveIdentidadPersona(persona);
    if (!persona || !identidad || usados.has(identidad)) return null;
    usados.add(identidad);
    return persona;
  };

  const turnantes = lista(asignaciones)
    .filter((fila) => fila?.tipo === "turnante")
    .map((fila) => fila.enfermero)
    .filter((persona) => persona && disponiblesParaCobertura(persona));
  let indiceTurnante = 0;
  const tomarTurnante = () => {
    while (indiceTurnante < turnantes.length) {
      const persona = usar(turnantes[indiceTurnante++]);
      if (persona) return persona;
    }
    return null;
  };

  let sectores = lista(asignaciones)
    .filter((fila) => fila?.tipo === "sector")
    .map((fila) => {
      if (!fila.enfermero) return { ...fila, enfermero: null };
      if (!disponiblesParaCobertura(fila.enfermero)) {
        return { ...fila, enfermero: null, reemplazo: true };
      }
      return { ...fila, enfermero: usar(fila.enfermero), reemplazo: false };
  });

  sectores = ajustarSectores(sectores);
  const refuerzos = lista(extras).filter(
    (extra) => extra && !esExtraCobertura(extra) && disponibles(extra)
  );
  let indiceExtra = 0;
  const tomarExtra = () => {
    while (indiceExtra < refuerzos.length) {
      const persona = usar(refuerzos[indiceExtra++]);
      if (persona) return persona;
    }
    return null;
  };

  const idsDonantes = new Set(lista(sectorIdsDonantes));
  const idsOrigenPareja = new Set(
    PAREJAS_COBERTURA_ENFERMEROS.map(({ origenSectorId }) => origenSectorId)
  );
  const ordenarPorPrioridad = (filas) => {
    const porId = new Map(filas.flatMap((fila) => fila?.sectorId ? [[fila.sectorId, fila]] : []));
    const ordenadas = lista(prioridadSectorIds).flatMap((sectorId) =>
      porId.has(sectorId) ? [porId.get(sectorId)] : []
    );
    const incluidas = new Set(ordenadas);
    return [...ordenadas, ...filas.filter((fila) => !incluidas.has(fila))];
  };
  const sectoresPrioritariosDirectos = ordenarPorPrioridad(sectores)
    .filter((fila) => !idsDonantes.has(fila.sectorId) && !idsOrigenPareja.has(fila.sectorId));
  sectoresPrioritariosDirectos.forEach((fila) => {
    if (!fila.enfermero && fila.reemplazo && !fila.vacioManual) {
      fila.enfermero = tomarTurnante();
    }
  });
  sectoresPrioritariosDirectos.forEach((fila) => {
    if (!fila.enfermero && !fila.vacioManual) fila.enfermero = tomarExtra();
  });
  sectoresPrioritariosDirectos.forEach((fila) => {
    if (!fila.enfermero && !fila.vacioManual) fila.enfermero = tomarTurnante();
  });

  const reposicionesPareja = ordenarPorPrioridad(sectores)
    .filter((fila) => fila.cedidoAPareja && !fila.enfermero && !fila.vacioManual);
  reposicionesPareja.forEach((fila) => {
    if (!fila.enfermero) fila.enfermero = tomarTurnante();
  });
  reposicionesPareja.forEach((fila) => {
    if (!fila.enfermero) fila.enfermero = tomarExtra();
  });

  sectores = aplicarPrioridadGeneralPorSectorId({
    asignaciones: sectores,
    prioridadSectorIds,
    donanteSectorIds: sectorIdsDonantes,
    esPersonaDisponible: disponiblesParaCobertura
  });

  const sectoresRestantes = ordenarPorPrioridad(sectores);
  sectoresRestantes.forEach((fila) => {
    if (!fila.enfermero && !fila.vacioManual) fila.enfermero = tomarExtra();
  });
  sectoresRestantes.forEach((fila) => {
    if (!fila.enfermero && !fila.vacioManual) fila.enfermero = tomarTurnante();
  });

  const conCoberturas = aplicarCoberturasDirectasExtras({
    asignaciones: sectores,
    extras,
    personal,
    esPersonaDisponible: disponiblesParaCobertura
  }).asignaciones;
  const usadosFinales = new Set(
    conCoberturas.map((fila) => obtenerClaveIdentidadPersona(fila.enfermero)).filter(Boolean)
  );
  return { asignaciones: conCoberturas, usados: usadosFinales };
};
