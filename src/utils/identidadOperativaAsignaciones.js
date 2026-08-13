import {
  obtenerSectorIdPorNombreHistorico,
  SECTORES_PLANILLA
} from "./configuracionPlanilla.js";
import {
  obtenerGrupoRedistribucionPorId,
  obtenerGrupoRedistribucionPorEtiquetaHistorica
} from "./gruposRedistribucion.js";
import {
  obtenerDestinoSinteticoReanimacionSillonesPorClave,
  obtenerDestinoSinteticoReanimacionSillonesPorId
} from "./reanimacionSillones.js";

const sectorIds = new Set(SECTORES_PLANILLA.map((sector) => sector.sectorId));

export const crearIdentidadSector = (sectorId) =>
  sectorIds.has(sectorId) ? { tipoIdentidad: "sector", sectorId } : null;

export const crearIdentidadGrupo = (groupId) =>
  obtenerGrupoRedistribucionPorId(groupId)
    ? { tipoIdentidad: "grupo", groupId }
    : null;

export const crearIdentidadSintetica = (syntheticId) =>
  obtenerDestinoSinteticoReanimacionSillonesPorId(syntheticId)
    ? { tipoIdentidad: "sintetico", syntheticId }
    : null;

export const crearIdentidadTurnante = (turnanteId) =>
  typeof turnanteId === "string" && /^turnante_[1-9]\d*$/.test(turnanteId)
    ? { tipoIdentidad: "turnante", turnanteId }
    : null;

export const obtenerClaveIdentidadOperativa = (identidad) => {
  if (identidad?.tipoIdentidad === "sector" && identidad.sectorId) {
    return `sector:${identidad.sectorId}`;
  }
  if (identidad?.tipoIdentidad === "grupo" && identidad.groupId) {
    return `grupo:${identidad.groupId}`;
  }
  if (identidad?.tipoIdentidad === "sintetico" && identidad.syntheticId) {
    return `sintetico:${identidad.syntheticId}`;
  }
  if (identidad?.tipoIdentidad === "turnante" && identidad.turnanteId) {
    return `turnante:${identidad.turnanteId}`;
  }
  return null;
};

export const resolverIdentidadOperativaAsignacion = (asignacion) => {
  if (!asignacion || typeof asignacion !== "object") return null;

  const explicita = crearIdentidadSector(asignacion.sectorId) ||
    crearIdentidadGrupo(asignacion.groupId) ||
    crearIdentidadSintetica(asignacion.syntheticId) ||
    crearIdentidadTurnante(asignacion.turnanteId);
  if (explicita) return explicita;

  const etiqueta = asignacion.nombre ?? asignacion.etiqueta;
  if (typeof etiqueta !== "string" || !etiqueta.trim()) return null;

  const grupo = obtenerGrupoRedistribucionPorEtiquetaHistorica(etiqueta);
  if (grupo) return crearIdentidadGrupo(grupo.groupId);

  const sintetico = obtenerDestinoSinteticoReanimacionSillonesPorClave(etiqueta);
  if (sintetico) return crearIdentidadSintetica(sintetico.syntheticId);

  const coincidenciaTurnante = /^T([1-9]\d*)$/i.exec(etiqueta.trim());
  if (coincidenciaTurnante) {
    return crearIdentidadTurnante(`turnante_${Number(coincidenciaTurnante[1])}`);
  }

  return crearIdentidadSector(obtenerSectorIdPorNombreHistorico(etiqueta));
};
