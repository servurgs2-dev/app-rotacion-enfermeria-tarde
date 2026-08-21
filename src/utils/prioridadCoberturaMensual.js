const lista = (valor) => Array.isArray(valor) ? valor : [];

const normalizarSectorId = (valor) =>
  typeof valor === "string" ? valor.trim() : "";

export const CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA = Object.freeze({
  SECTOR_INEXISTENTE: "SECTOR_INEXISTENTE",
  SECTOR_DESACTIVADO: "SECTOR_DESACTIVADO",
  SECTOR_DUPLICADO: "SECTOR_DUPLICADO",
  SECTOR_AGREGADO_DESDE_FALLBACK: "SECTOR_AGREGADO_DESDE_FALLBACK",
  SECTOR_NUEVO_AGREGADO_AL_FINAL: "SECTOR_NUEVO_AGREGADO_AL_FINAL"
});

export const normalizarPrioridadCoberturaConfigurada = (prioridad) => {
  const vistos = new Set();
  return lista(prioridad).flatMap((valor) => {
    const sectorId = normalizarSectorId(valor);
    if (!sectorId || vistos.has(sectorId)) return [];
    vistos.add(sectorId);
    return [sectorId];
  });
};

export const copiarPrioridadCoberturaMensual = (prioridad) =>
  [...normalizarPrioridadCoberturaConfigurada(prioridad)];

export const actualizarPrioridadCoberturaEnEstadoMensual = ({
  estadoMensual,
  categoria,
  prioridadCoberturaSectorIds
} = {}) => {
  const categoriaNormalizada = typeof categoria === "string" ? categoria.trim() : "";
  const snapshot = estadoMensual?.configuracionPlanilla?.[categoriaNormalizada];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, codigo: "SNAPSHOT_CONFIGURACION_INEXISTENTE", estado: estadoMensual };
  }
  const prioridadNormalizada = copiarPrioridadCoberturaMensual(
    prioridadCoberturaSectorIds
  );
  const prioridadActual = copiarPrioridadCoberturaMensual(
    snapshot.prioridadCoberturaSectorIds
  );
  if (
    prioridadActual.length === prioridadNormalizada.length &&
    prioridadActual.every((sectorId, indice) => sectorId === prioridadNormalizada[indice])
  ) {
    return { ok: true, estado: estadoMensual };
  }
  return {
    ok: true,
    estado: {
      ...estadoMensual,
      configuracionPlanilla: {
        ...estadoMensual.configuracionPlanilla,
        [categoriaNormalizada]: {
          ...snapshot,
          prioridadCoberturaSectorIds: prioridadNormalizada
        }
      }
    }
  };
};

export const moverSectorEnPrioridadCobertura = ({
  prioridad,
  sectorId,
  direccion
} = {}) => {
  const normalizada = normalizarPrioridadCoberturaConfigurada(prioridad);
  const id = normalizarSectorId(sectorId);
  const indice = normalizada.indexOf(id);
  const desplazamiento = direccion === "arriba" ? -1 : direccion === "abajo" ? 1 : 0;
  const destino = indice + desplazamiento;
  if (indice < 0 || desplazamiento === 0 || destino < 0 || destino >= normalizada.length) {
    return normalizada;
  }
  const resultado = [...normalizada];
  [resultado[indice], resultado[destino]] = [resultado[destino], resultado[indice]];
  return resultado;
};

export const obtenerPrioridadCoberturaEfectiva = ({
  prioridadConfigurada,
  filas,
  prioridadFallback
} = {}) => {
  const advertencias = [];
  const filasPorId = new Map();
  lista(filas).forEach((fila) => {
    const sectorId = normalizarSectorId(fila?.sectorId);
    if (fila?.tipo === "sector" && sectorId && !filasPorId.has(sectorId)) {
      filasPorId.set(sectorId, fila);
    }
  });
  const activos = new Set(
    [...filasPorId.entries()]
      .filter(([, fila]) => fila.activo !== false)
      .map(([sectorId]) => sectorId)
  );
  const configuradaOriginal = lista(prioridadConfigurada);
  const usarFallback = configuradaOriginal.length === 0;
  const fuente = usarFallback ? lista(prioridadFallback) : configuradaOriginal;
  const prioridadSectorIds = [];
  const incluidos = new Set();

  fuente.forEach((valor) => {
    const sectorId = normalizarSectorId(valor);
    if (!sectorId) return;
    if (incluidos.has(sectorId)) {
      advertencias.push({
        codigo: CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_DUPLICADO,
        sectorId
      });
      return;
    }
    const fila = filasPorId.get(sectorId);
    if (!fila) {
      advertencias.push({
        codigo: CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_INEXISTENTE,
        sectorId
      });
      return;
    }
    if (fila.activo === false) {
      advertencias.push({
        codigo: CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_DESACTIVADO,
        sectorId
      });
      return;
    }
    incluidos.add(sectorId);
    prioridadSectorIds.push(sectorId);
  });

  const fallbackNormalizado = lista(prioridadFallback)
    .map(normalizarSectorId)
    .filter(Boolean);
  fallbackNormalizado.forEach((sectorId, indiceFallback) => {
    if (!sectorId || incluidos.has(sectorId) || !activos.has(sectorId)) return;
    incluidos.add(sectorId);
    const siguienteIncluido = fallbackNormalizado
      .slice(indiceFallback + 1)
      .find((id) => incluidos.has(id));
    const indiceInsercion = siguienteIncluido
      ? prioridadSectorIds.indexOf(siguienteIncluido)
      : prioridadSectorIds.length;
    prioridadSectorIds.splice(indiceInsercion, 0, sectorId);
    if (!usarFallback) {
      advertencias.push({
        codigo: CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_AGREGADO_DESDE_FALLBACK,
        sectorId
      });
    }
  });

  [...activos]
    .filter((sectorId) => !incluidos.has(sectorId))
    .sort((a, b) => a.localeCompare(b))
    .forEach((sectorId) => {
      prioridadSectorIds.push(sectorId);
      advertencias.push({
        codigo: CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_NUEVO_AGREGADO_AL_FINAL,
        sectorId
      });
    });

  return { prioridadSectorIds, advertencias };
};

export const validarPrioridadCoberturaMensual = (argumentos = {}) => {
  const resultado = obtenerPrioridadCoberturaEfectiva(argumentos);
  return {
    valido: resultado.advertencias.every(({ codigo }) =>
      codigo === CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_AGREGADO_DESDE_FALLBACK ||
      codigo === CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_NUEVO_AGREGADO_AL_FINAL
    ),
    ...resultado
  };
};
