import {
  CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2,
  validarPrioridadCoberturaLicenciadosV2
} from "./prioridadCoberturaLicenciadosDinamica.js";
import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";

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
  const usaLicenciadosV2 = categoriaNormalizada === "licenciado" &&
    resolverVersionEstructuraLicenciados(snapshot) === VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  if (usaLicenciadosV2) {
    const candidatos = obtenerCandidatosPrioridadCoberturaMes({
      categoria: categoriaNormalizada,
      filas: snapshot.filas,
      versionEstructura: snapshot
    });
    const validacion = validarPrioridadCoberturaLicenciadosV2({
      prioridad: prioridadCoberturaSectorIds,
      candidatos
    });
    if (!validacion.ok) {
      return {
        ok: false,
        codigo: "PRIORIDAD_COBERTURA_LICENCIADOS_V2_INVALIDA",
        errores: validacion.errores,
        estado: estadoMensual
      };
    }
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
  prioridadFallback,
  categoria = "",
  versionEstructura
} = {}) => {
  const usaLicenciadosV2 = categoria === "licenciado" &&
    resolverVersionEstructuraLicenciados(versionEstructura) ===
      VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  if (usaLicenciadosV2) {
    const candidatos = obtenerCandidatosPrioridadCoberturaMes({
      categoria,
      filas,
      versionEstructura
    });
    const validacion = validarPrioridadCoberturaLicenciadosV2({
      prioridad: prioridadConfigurada,
      candidatos
    });
    const idsCandidatos = new Set(candidatos.map(({ id }) => id));
    return {
      prioridadSectorIds: validacion.prioridadNormalizada.filter((id) => idsCandidatos.has(id)),
      advertencias: validacion.errores,
      valido: validacion.ok,
      requiereConfiguracionV2: !validacion.ok
    };
  }
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

export const obtenerCandidatosPrioridadCoberturaMes = ({
  categoria,
  filas = [],
  versionEstructura
} = {}) => {
  const usaLicenciadosV2 = categoria === "licenciado" &&
    resolverVersionEstructuraLicenciados(versionEstructura) ===
      VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  if (usaLicenciadosV2) {
    const candidatosPorId = new Map(
      CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2.map((candidato) => [candidato.id, candidato])
    );
    const sectoresBaseActivos = lista(filas).flatMap((fila) => {
      const sectorId = normalizarSectorId(fila?.sectorId);
      const candidato = candidatosPorId.get(sectorId);
      return fila?.tipo === "sector" && fila.activo !== false && candidato?.origen === "fila_base"
        ? [{ ...candidato }]
        : [];
    });
    return [
      ...sectoresBaseActivos,
      { ...candidatosPorId.get("sillones") },
      { ...candidatosPorId.get("explora") }
    ];
  }
  return lista(filas)
    .filter((fila) => fila?.tipo === "sector" && fila.activo !== false && fila.sectorId)
    .map((fila) => ({
      id: fila.sectorId,
      sectorId: fila.sectorId,
      nombre: fila.etiqueta,
      origen: "fila_base",
      configurablePrioridad: true
    }));
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
