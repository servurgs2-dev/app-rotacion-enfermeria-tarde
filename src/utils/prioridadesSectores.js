const lista = (valor) => Array.isArray(valor) ? valor : [];

export const obtenerFilasActivasPorSectorIds = (filas, sectorIds) => {
  const porId = new Map(lista(filas)
    .filter((fila) => fila?.tipo === "sector" && fila.activo !== false)
    .map((fila) => [fila.sectorId, fila]));
  return lista(sectorIds).flatMap((sectorId) => porId.has(sectorId) ? [{ ...porId.get(sectorId) }] : []);
};

export const aplicarPrioridadGeneralPorSectorId = ({
  asignaciones,
  prioridadSectorIds,
  donanteSectorIds,
  esPersonaDisponible = () => true
} = {}) => {
  const resultado = lista(asignaciones).map((fila) => ({ ...fila }));
  const porId = new Map(resultado.flatMap((fila) => fila?.sectorId ? [[fila.sectorId, fila]] : []));
  const prioridad = lista(prioridadSectorIds).filter((id) => porId.has(id));
  const donantes = Array.isArray(donanteSectorIds)
    ? new Set(donanteSectorIds)
    : null;
  prioridad.forEach((sectorId, indice) => {
    const destino = porId.get(sectorId);
    if (destino.enfermero || destino.vacioManual) return;
    for (let donante = prioridad.length - 1; donante > indice; donante--) {
      const origen = porId.get(prioridad[donante]);
      if (
        (!donantes || donantes.has(origen?.sectorId)) &&
        origen?.enfermero &&
        !origen.origenLogicoPareja &&
        !origen.cambioManualProtegido &&
        esPersonaDisponible(origen.enfermero)
      ) {
        destino.enfermero = origen.enfermero;
        destino.origenCoberturaAutomaticaSectorId =
          origen.origenCoberturaAutomaticaSectorId || origen.sectorId;
        origen.enfermero = null;
        delete origen.origenCoberturaAutomaticaSectorId;
        origen.sacrificado = true;
        break;
      }
    }
  });
  return resultado;
};
