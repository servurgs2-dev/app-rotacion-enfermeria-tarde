import {
  CATALOGO_DESTINOS_OPERATIVOS_LICENCIADOS_V2,
  FILAS_PLANILLA_LICENCIADOS_V2,
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";

const IDS_TURNANTES = new Set(["turnante_1", "turnante_2", "turnante_3", "turnante_4"]);
const IDS_COMBINADOS = new Set(["reanimacion_sillones", "diagnostico_explora"]);
const IDS_DINAMICOS_CONFIGURABLES = Object.freeze(["sillones", "explora"]);

const crearCandidatoSector = (fila) => Object.freeze({
  id: fila.sectorId,
  sectorId: fila.sectorId,
  nombre: fila.etiqueta,
  origen: "fila_base",
  configurablePrioridad: true
});

const crearCandidatoOperativo = (id) => {
  const destino = CATALOGO_DESTINOS_OPERATIVOS_LICENCIADOS_V2[id];
  return Object.freeze({
    id: destino.id,
    sectorId: destino.id,
    nombre: destino.nombre,
    origen: "destino_operativo",
    configurablePrioridad: true
  });
};

export const CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 = Object.freeze([
  ...FILAS_PLANILLA_LICENCIADOS_V2
    .filter((fila) => fila.tipo === "sector" && fila.activo !== false)
    .map(crearCandidatoSector),
  ...IDS_DINAMICOS_CONFIGURABLES.map(crearCandidatoOperativo)
]);

export const CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2 = Object.freeze({
  ID_AUSENTE: "ID_PRIORIDAD_LICENCIADOS_AUSENTE",
  ID_DESCONOCIDO: "ID_PRIORIDAD_LICENCIADOS_DESCONOCIDO",
  ID_DUPLICADO: "ID_PRIORIDAD_LICENCIADOS_DUPLICADO",
  SILLONES_AUSENTE: "SILLONES_AUSENTE_EN_PRIORIDAD_LICENCIADOS",
  EXPLORA_AUSENTE: "EXPLORA_AUSENTE_EN_PRIORIDAD_LICENCIADOS",
  TURNANTE_NO_PERMITIDO: "TURNANTE_NO_PERMITIDO_EN_PRIORIDAD_LICENCIADOS",
  DESTINO_COMBINADO_NO_PERMITIDO: "DESTINO_COMBINADO_NO_PERMITIDO_EN_PRIORIDAD_LICENCIADOS"
});

const normalizarId = (valor) => typeof valor === "string" ? valor.trim() : "";

export const validarPrioridadCoberturaLicenciadosV2 = ({
  prioridad = [],
  candidatos = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2
} = {}) => {
  const prioridadNormalizada = Array.isArray(prioridad) ? prioridad.map(normalizarId) : [];
  const idsCandidatos = new Set(
    (Array.isArray(candidatos) ? candidatos : []).map((candidato) =>
      normalizarId(candidato?.id || candidato?.sectorId)
    ).filter(Boolean)
  );
  const vistos = new Set();
  const errores = [];

  prioridadNormalizada.forEach((id, indice) => {
    if (!id) {
      errores.push({ codigo: CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.ID_DESCONOCIDO, id, indice });
      return;
    }
    if (vistos.has(id)) {
      errores.push({ codigo: CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.ID_DUPLICADO, id, indice });
    }
    vistos.add(id);
    if (IDS_TURNANTES.has(id)) {
      errores.push({ codigo: CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.TURNANTE_NO_PERMITIDO, id, indice });
    } else if (IDS_COMBINADOS.has(id)) {
      errores.push({ codigo: CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.DESTINO_COMBINADO_NO_PERMITIDO, id, indice });
    } else if (!idsCandidatos.has(id)) {
      errores.push({ codigo: CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.ID_DESCONOCIDO, id, indice });
    }
  });

  idsCandidatos.forEach((id) => {
    if (!vistos.has(id)) {
      errores.push({ codigo: CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.ID_AUSENTE, id });
    }
  });
  if (!vistos.has("sillones")) {
    errores.push({ codigo: CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.SILLONES_AUSENTE, id: "sillones" });
  }
  if (!vistos.has("explora")) {
    errores.push({ codigo: CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.EXPLORA_AUSENTE, id: "explora" });
  }

  return {
    ok: errores.length === 0,
    errores,
    prioridadNormalizada
  };
};

export const resolverDestinoPrioritarioEstructuraDiez = (prioridad) => {
  if (!Array.isArray(prioridad)) return null;
  const normalizada = prioridad.map(normalizarId);
  const posicionesSillones = normalizada.flatMap((id, indice) => id === "sillones" ? [indice] : []);
  const posicionesExplora = normalizada.flatMap((id, indice) => id === "explora" ? [indice] : []);
  if (posicionesSillones.length !== 1 || posicionesExplora.length !== 1) return null;
  return posicionesSillones[0] < posicionesExplora[0] ? "sillones" : "explora";
};

export const diagnosticarPrioridadCoberturaLicenciados = ({
  versionEstructura,
  prioridad = [],
  candidatos = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2
} = {}) => {
  const esV2 = resolverVersionEstructuraLicenciados(versionEstructura) ===
    VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  if (!esV2) {
    return {
      ok: true,
      usaPrioridadLegacy: true,
      requiereConfiguracionV2: false,
      prioridad: Array.isArray(prioridad) ? [...prioridad] : []
    };
  }
  const validacion = validarPrioridadCoberturaLicenciadosV2({ prioridad, candidatos });
  return {
    ...validacion,
    usaPrioridadLegacy: false,
    requiereConfiguracionV2: !validacion.ok
  };
};
