import { configuracionSectores } from "../data/sectores.js";
import { normalizarAsignacionesFijasMensuales } from "./modeloAsignacionesFijasMensuales.js";
import {
  copiarPrioridadCoberturaMensual,
  obtenerCandidatosPrioridadCoberturaMes,
  obtenerPrioridadCoberturaEfectiva
} from "./prioridadCoberturaMensual.js";
import { validarPrioridadCoberturaLicenciadosV2 } from "./prioridadCoberturaLicenciadosDinamica.js";
import {
  FILAS_PLANILLA_LICENCIADOS_V2,
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";
import { normalizar } from "./texto.js";
import { esMesHistoricoCerrado } from "./periodosMensuales.js";

export const TIPOS_FILA_PLANILLA = Object.freeze({
  SECTOR: "sector",
  TURNANTE: "turnante"
});

// [sectorId, etiqueta canónica, ...aliases históricos]
const DEFINICIONES_SECTORES = [
  ["rea_1", "REA 1"], ["rea_2", "REA 2"],
  ["explora_1", "EXPLORA 1"], ["explora_2", "EXPLORA 2"],
  ["boxes_1_3_21", "1-3 + 21"], ["pre_int_1", "PRE INT 1"],
  ["pre_int_2", "PRE INT 2"], ["dx_25_30", "DX 25-30"],
  ["boxes_8_13", "8-13"], ["boxes_4_7", "4-7"],
  ["sillon_1", "SILLÓN 1", "SILLON 1"],
  ["sillon_2", "SILLON 2", "SILLÓN 2"],
  ["sillones_3", "SILLONES 3", "SILLÓN 3", "SILLON 3"],
  ["boxes_14_19", "14-19", "14-18"],
  ["boxes_20_22_24", "20+22-24", "20-22-24", "20-22+24", "19-22+24", "19-20+22-24"],
  ["salud_mental", "Salud Mental", "SM"],
  ["triage_1", "Triage 1"], ["triage_2", "Triage 2"],
  ["estabiliza", "Estabiliza"],
  ["reanimacion_sillones", "Reanimación + Sillones", "Reanimacion + Sillones"],
  ["observacion_1", "Observación 1", "Observacion 1"],
  ["observacion_2", "Observación 2", "Observacion 2"],
  ["explora", "Explora"], ["diagnostico", "Diagnostico", "Diagnóstico"],
  ["preinternacion", "Preinternación", "Preinternacion"]
];

export const SECTORES_PLANILLA = Object.freeze(DEFINICIONES_SECTORES.map(
  ([sectorId, etiqueta, ...aliases]) => Object.freeze({
    sectorId,
    etiqueta,
    aliases: Object.freeze([etiqueta, ...aliases])
  })
));

const indiceSectorPorAlias = new Map(SECTORES_PLANILLA.flatMap((sector) =>
  sector.aliases.map((alias) => [normalizar(alias), sector])
));
const indiceSectorPorId = new Map(SECTORES_PLANILLA.map((sector) => [sector.sectorId, sector]));

const inferirTipo = (configuracion) => configuracion === configuracionSectores.enfermero
  ? "enfermero"
  : configuracion === configuracionSectores.licenciado ? "licenciado" : "";

export const obtenerSectorIdPorNombreHistorico = (nombre) =>
  indiceSectorPorAlias.get(normalizar(nombre))?.sectorId || "";

export const obtenerAliasesSector = (sectorId) =>
  [...(indiceSectorPorId.get(sectorId)?.aliases || [])];

export const obtenerEtiquetaSector = (sectorId, { tipo } = {}) => {
  if (sectorId === "salud_mental" && tipo === "enfermero") return "SM";
  return indiceSectorPorId.get(sectorId)?.etiqueta || "";
};

const crearFilaSector = ({ tipo, etiqueta, orden }) => {
  const sectorId = obtenerSectorIdPorNombreHistorico(etiqueta);
  if (!sectorId) throw new Error(`No existe un sectorId para la fila legacy: ${etiqueta}`);
  return Object.freeze({ filaId: `${tipo}.sector.${sectorId}`, tipo: TIPOS_FILA_PLANILLA.SECTOR,
    etiqueta, sectorId, turnanteId: null, ordinalTurnante: null, orden, activo: true });
};

const crearFilaTurnante = ({ tipo, etiqueta, orden }) => {
  const ordinal = Number(String(etiqueta).replace(/^T/i, ""));
  return Object.freeze({ filaId: `${tipo}.turnante.${ordinal}`, tipo: TIPOS_FILA_PLANILLA.TURNANTE,
    etiqueta, sectorId: null, turnanteId: `turnante_${ordinal}`,
    ordinalTurnante: ordinal, orden, activo: true });
};

const obtenerEtiquetaTurnanteAdicional = (categoria, versionEstructura) => {
  if (categoria === "enfermero") return "T6";
  if (categoria !== "licenciado") return "";
  return resolverVersionEstructuraLicenciados(versionEstructura) ===
    VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA ? "T4" : "T3";
};

export const resolverEtiquetaSectorPorTurno = ({
  sectorId,
  turnoId,
  etiquetaBase
} = {}) => {
  if (sectorId === "boxes_14_19") {
    return turnoId === "manana" ? "14-18" : "14-19";
  }
  if (sectorId === "boxes_20_22_24") {
    return turnoId === "manana" ? "19-20+22-24" : "20+22-24";
  }
  return etiquetaBase || obtenerEtiquetaSector(sectorId);
};

const reconciliarTurnanteAdicionalMensual = ({ filas, categoria, planilla, versionEstructura }) => {
  const etiqueta = obtenerEtiquetaTurnanteAdicional(categoria, versionEstructura);
  if (!etiqueta) return filas;

  const habilitado = Array.isArray(planilla?.posicionesMensualesAdicionales) &&
    planilla.posicionesMensualesAdicionales.includes(etiqueta);
  const tieneDecisionMensualExplicita = planilla &&
    typeof planilla === "object" &&
    Object.hasOwn(planilla, "posicionesMensualesAdicionales");
  const ordinal = Number(etiqueta.slice(1));
  const esAdicional = (fila) =>
    fila?.tipo === TIPOS_FILA_PLANILLA.TURNANTE &&
    (fila.turnanteId === `turnante_${ordinal}` || fila.etiqueta === etiqueta);
  const sinAdicional = filas.filter((fila) => !esAdicional(fila));

  if (!habilitado && tieneDecisionMensualExplicita) {
    return sinAdicional;
  }

  if (!habilitado) return filas;

  const existente = filas.find(esAdicional);
  const ultimoOrden = sinAdicional.reduce(
    (maximo, fila) => Number.isInteger(fila.orden) ? Math.max(maximo, fila.orden) : maximo,
    -1
  );
  const adicional = existente
    ? { ...existente, etiqueta, activo: true }
    : copiarFilaSnapshot(crearFilaTurnante({
      tipo: categoria,
      etiqueta,
      orden: ultimoOrden + 1
    }));
  return [...sinAdicional, adicional];
};

export const SCHEMA_VERSION_CONFIGURACION_PLANILLA = 1;

const CAMPOS_FILA_SNAPSHOT = Object.freeze([
  "filaId", "tipo", "etiqueta", "sectorId", "turnanteId",
  "ordinalTurnante", "orden", "activo"
]);

const copiarFilaSnapshot = (fila) => Object.fromEntries(
  CAMPOS_FILA_SNAPSHOT.map((campo) => [campo, fila[campo]])
);

const tieneTexto = (valor) => typeof valor === "string" && valor.trim().length > 0;
const resolverEtiquetasVigentesMesEditable = ({
  filas,
  categoria,
  turnoId,
  mes,
  mesReferencia
}) => {
  if (categoria !== "enfermero" || esMesHistoricoCerrado({ mes, mesReferencia })) return filas;
  return filas.map((fila) => fila?.sectorId === "boxes_20_22_24"
    ? {
        ...fila,
        etiqueta: resolverEtiquetaSectorPorTurno({
          sectorId: fila.sectorId,
          turnoId,
          etiquetaBase: fila.etiqueta
        })
      }
    : fila);
};

export const esSnapshotConfiguracionPlanillaValido = (snapshot) =>
  Boolean(snapshot) &&
  typeof snapshot === "object" &&
  !Array.isArray(snapshot) &&
  Number.isInteger(snapshot.schemaVersion) &&
  snapshot.schemaVersion > 0 &&
  tieneTexto(snapshot.versionId) &&
  tieneTexto(snapshot.turnoId) &&
  tieneTexto(snapshot.categoria) &&
  tieneTexto(snapshot.mes) &&
  Array.isArray(snapshot.filas) &&
  snapshot.filas.every((fila) =>
    Boolean(fila) &&
    typeof fila === "object" &&
    CAMPOS_FILA_SNAPSHOT.every((campo) => Object.hasOwn(fila, campo))
  );

export const copiarSnapshotConfiguracionPlanilla = (snapshot) => ({
  schemaVersion: snapshot.schemaVersion,
  versionId: snapshot.versionId,
  turnoId: snapshot.turnoId,
  categoria: snapshot.categoria,
  mes: snapshot.mes,
  filas: snapshot.filas.map(copiarFilaSnapshot),
  asignacionesFijas: normalizarAsignacionesFijasMensuales(snapshot.asignacionesFijas),
  prioridadCoberturaSectorIds: copiarPrioridadCoberturaMensual(
    snapshot.prioridadCoberturaSectorIds
  ),
  ...(Object.hasOwn(snapshot, "estructuraLicenciadosVersion")
    ? { estructuraLicenciadosVersion: snapshot.estructuraLicenciadosVersion }
    : {})
});

const IDS_FILA_LICENCIADOS_V2 = FILAS_PLANILLA_LICENCIADOS_V2.map((fila) => fila.filaId);
const IDS_FIJA_INCOMPATIBLES_LICENCIADOS_V2 = new Set([
  "sillones", "explora", "diagnostico_explora", "reanimacion_sillones",
  "turnante_1", "turnante_2", "turnante_3", "turnante_4"
]);

export const validarConfiguracionPlanillaLicenciadosV2 = (configuracion = {}) => {
  const filas = Array.isArray(configuracion?.filas) ? configuracion.filas : [];
  const errores = [];
  if (configuracion?.estructuraLicenciadosVersion !== VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA) {
    errores.push({ codigo: "VERSION_ESTRUCTURA_LICENCIADOS_V2_INVALIDA" });
  }
  const idsFila = filas.map((fila) => fila?.filaId).filter(Boolean);
  if (filas.length !== FILAS_PLANILLA_LICENCIADOS_V2.length) {
    errores.push({ codigo: "FILAS_LICENCIADOS_V2_INCOMPLETAS" });
  }
  if (new Set(idsFila).size !== idsFila.length) {
    errores.push({ codigo: "FILAS_LICENCIADOS_V2_DUPLICADAS" });
  }
  FILAS_PLANILLA_LICENCIADOS_V2.forEach((esperada) => {
    const fila = filas.find(({ filaId }) => filaId === esperada.filaId);
    if (
      !fila || fila.tipo !== esperada.tipo || fila.sectorId !== esperada.sectorId ||
      fila.turnanteId !== esperada.turnanteId
    ) {
      errores.push({ codigo: "FILA_LICENCIADOS_V2_INVALIDA", filaId: esperada.filaId });
    }
  });
  idsFila.filter((filaId) => !IDS_FILA_LICENCIADOS_V2.includes(filaId)).forEach((filaId) => {
    errores.push({ codigo: "FILA_LICENCIADOS_V2_DESCONOCIDA", filaId });
  });
  const candidatos = obtenerCandidatosPrioridadCoberturaMes({
    categoria: "licenciado",
    filas,
    versionEstructura: configuracion
  });
  const validacionPrioridad = validarPrioridadCoberturaLicenciadosV2({
    prioridad: configuracion?.prioridadCoberturaSectorIds,
    candidatos
  });
  errores.push(...validacionPrioridad.errores);

  const sectoresBase = new Set(filas.flatMap((fila) =>
    fila?.tipo === TIPOS_FILA_PLANILLA.SECTOR && fila.sectorId ? [fila.sectorId] : []
  ));
  const asignacionesFijas = normalizarAsignacionesFijasMensuales(configuracion?.asignacionesFijas);
  const asignacionesFijasCompatibles = asignacionesFijas.filter(({ sectorId }) =>
    sectoresBase.has(sectorId) && !IDS_FIJA_INCOMPATIBLES_LICENCIADOS_V2.has(sectorId)
  );
  asignacionesFijas
    .filter((asignacion) => !asignacionesFijasCompatibles.includes(asignacion))
    .forEach((asignacion) => errores.push({
      codigo: "ASIGNACION_FIJA_LICENCIADOS_V2_REQUIERE_REVISION",
      sectorId: asignacion.sectorId,
      personaId: asignacion.personaId
    }));

  return {
    ok: errores.length === 0,
    errores,
    prioridadNormalizada: validacionPrioridad.prioridadNormalizada,
    asignacionesFijasCompatibles
  };
};

export const crearConfiguracionPlanillaLicenciadosV2 = ({
  prioridadCoberturaSectorIds,
  filas = FILAS_PLANILLA_LICENCIADOS_V2,
  asignacionesFijas = []
} = {}) => {
  const configuracion = {
    estructuraLicenciadosVersion: VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA,
    filas: filas.map(copiarFilaSnapshot),
    asignacionesFijas: normalizarAsignacionesFijasMensuales(asignacionesFijas),
    prioridadCoberturaSectorIds: copiarPrioridadCoberturaMensual(prioridadCoberturaSectorIds)
  };
  const validacion = validarConfiguracionPlanillaLicenciadosV2(configuracion);
  return {
    ok: validacion.ok,
    errores: validacion.errores,
    configuracion: {
      ...configuracion,
      asignacionesFijas: validacion.asignacionesFijasCompatibles
    }
  };
};

export const adaptarConfiguracionLegacyPlanilla = (
  configuracion = {},
  tipoSolicitado = "",
  turnoId = ""
) => {
  const tipo = tipoSolicitado || inferirTipo(configuracion);
  if (!tipo) throw new Error("La categoría de la configuración de Planilla es obligatoria.");
  const filas = [];
  let indiceTurnante = 0;
  const posiciones = new Set(configuracion.posicionesTurnantes || []);
  (configuracion.sectoresFijos || []).forEach((etiqueta, indiceSector) => {
    const sectorId = obtenerSectorIdPorNombreHistorico(etiqueta);
    filas.push(crearFilaSector({
      tipo,
      etiqueta: resolverEtiquetaSectorPorTurno({ sectorId, turnoId, etiquetaBase: etiqueta }),
      orden: filas.length
    }));
    if (!posiciones.has(indiceSector)) return;
    const etiquetaTurnante = configuracion.turnantes?.[indiceTurnante];
    indiceTurnante += 1;
    if (etiquetaTurnante) filas.push(crearFilaTurnante({ tipo, etiqueta: etiquetaTurnante, orden: filas.length }));
  });
  return filas;
};

export const obtenerConfiguracionLegacyPlanilla = (tipo, { turnoId = "" } = {}) => {
  const configuracion = configuracionSectores[tipo];
  if (!configuracion) throw new Error(`Categoría de Planilla desconocida: ${tipo}`);
  return Object.freeze({
    tipo,
    filas: Object.freeze(adaptarConfiguracionLegacyPlanilla(configuracion, tipo, turnoId))
  });
};

export const obtenerFilasConfiguracionEfectivas = (tipo, planilla = {}, turnoId = "") => {
  const filas = [...obtenerConfiguracionLegacyPlanilla(tipo, { turnoId }).filas];
  const etiqueta = obtenerEtiquetaTurnanteAdicional(tipo);
  if (etiqueta && planilla?.posicionesMensualesAdicionales?.includes(etiqueta)) {
    filas.push(crearFilaTurnante({ tipo, etiqueta, orden: filas.length }));
  }
  return filas;
};

export const crearSnapshotConfiguracionPlanilla = ({
  turno,
  categoria,
  mes,
  posicionesMensualesAdicionales = []
} = {}) => {
  if (!tieneTexto(turno)) {
    throw new Error("El turno es obligatorio para crear el snapshot de configuración de Planilla.");
  }
  if (!tieneTexto(categoria)) {
    throw new Error("La categoría es obligatoria para crear el snapshot de configuración de Planilla.");
  }
  if (!tieneTexto(mes)) {
    throw new Error("El mes es obligatorio para crear el snapshot de configuración de Planilla.");
  }

  const turnoId = turno.trim();
  const categoriaNormalizada = categoria.trim();
  const mesNormalizado = mes.trim();
  const filas = obtenerFilasConfiguracionEfectivas(categoriaNormalizada, {
    posicionesMensualesAdicionales: [...posicionesMensualesAdicionales]
  }, turnoId).map(copiarFilaSnapshot);

  return {
    schemaVersion: SCHEMA_VERSION_CONFIGURACION_PLANILLA,
    versionId: `${turnoId}:${categoriaNormalizada}:${mesNormalizado}:v${SCHEMA_VERSION_CONFIGURACION_PLANILLA}`,
    turnoId,
    categoria: categoriaNormalizada,
    mes: mesNormalizado,
    filas,
    asignacionesFijas: [],
    prioridadCoberturaSectorIds: obtenerPrioridadCoberturaEfectiva({
      filas,
      prioridadFallback: configuracionSectores[categoriaNormalizada]?.prioridadSectoresIds
    }).prioridadSectorIds
  };
};

export const crearSnapshotConfiguracionPlanillaDesdeFilas = ({
  turno,
  categoria,
  mes,
  filas,
  asignacionesFijas = [],
  prioridadCoberturaSectorIds,
  estructuraLicenciadosVersion
} = {}) => {
  if (!tieneTexto(turno) || !tieneTexto(categoria) || !tieneTexto(mes) || !Array.isArray(filas)) {
    throw new Error("El contexto y las filas son obligatorios para confirmar la configuración de Planilla.");
  }
  const turnoId = turno.trim();
  const categoriaNormalizada = categoria.trim();
  const mesNormalizado = mes.trim();
  const filasSnapshot = filas.map((fila) => copiarFilaSnapshot({
    ...fila,
    etiqueta: categoriaNormalizada === "enfermero"
      ? resolverEtiquetaSectorPorTurno({
          sectorId: fila?.sectorId,
          turnoId,
          etiquetaBase: fila?.etiqueta
        })
      : fila?.etiqueta
  }));
  const prioridadConfigurada = copiarPrioridadCoberturaMensual(
    prioridadCoberturaSectorIds
  );
  const usaLicenciadosV2 = categoriaNormalizada === "licenciado" &&
    estructuraLicenciadosVersion === VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  const prioridadSnapshot = usaLicenciadosV2
    ? obtenerPrioridadCoberturaEfectiva({
        prioridadConfigurada,
        filas: filasSnapshot,
        prioridadFallback: configuracionSectores[categoriaNormalizada]?.prioridadSectoresIds,
        categoria: categoriaNormalizada,
        versionEstructura: estructuraLicenciadosVersion
      }).prioridadSectorIds
    : prioridadConfigurada.length
      ? prioridadConfigurada
      : obtenerPrioridadCoberturaEfectiva({
          filas: filasSnapshot,
          prioridadFallback: configuracionSectores[categoriaNormalizada]?.prioridadSectoresIds
        }).prioridadSectorIds;
  return {
    schemaVersion: SCHEMA_VERSION_CONFIGURACION_PLANILLA,
    versionId: `${turnoId}:${categoriaNormalizada}:${mesNormalizado}:v${SCHEMA_VERSION_CONFIGURACION_PLANILLA}`,
    turnoId,
    categoria: categoriaNormalizada,
    mes: mesNormalizado,
    filas: filasSnapshot,
    asignacionesFijas: normalizarAsignacionesFijasMensuales(asignacionesFijas),
    prioridadCoberturaSectorIds: prioridadSnapshot,
    ...(estructuraLicenciadosVersion === VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
      ? { estructuraLicenciadosVersion: VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA }
      : {})
  };
};

export const crearSnapshotConfiguracionPlanillaLicenciadosV2 = ({
  turno,
  mes,
  prioridadCoberturaSectorIds,
  filas = FILAS_PLANILLA_LICENCIADOS_V2,
  asignacionesFijas = []
} = {}) => {
  const resultado = crearConfiguracionPlanillaLicenciadosV2({
    prioridadCoberturaSectorIds,
    filas,
    asignacionesFijas
  });
  if (!resultado.ok) return { ...resultado, snapshot: null };
  return {
    ok: true,
    errores: [],
    configuracion: resultado.configuracion,
    snapshot: crearSnapshotConfiguracionPlanillaDesdeFilas({
      turno,
      categoria: "licenciado",
      mes,
      ...resultado.configuracion
    })
  };
};

export const obtenerConfiguracionPlanillaEfectiva = ({
  estadoMensual,
  turno,
  categoria,
  mes,
  mesReferencia
} = {}) => {
  if (!tieneTexto(turno) || !tieneTexto(categoria) || !tieneTexto(mes)) return null;

  const snapshot = estadoMensual?.configuracionPlanilla?.[categoria.trim()];
  if (
    esSnapshotConfiguracionPlanillaValido(snapshot) &&
    snapshot.turnoId === turno.trim() &&
    snapshot.categoria === categoria.trim() &&
    snapshot.mes === mes.trim()
  ) {
    const copia = copiarSnapshotConfiguracionPlanilla(snapshot);
    const clavePlanilla = categoria.trim() === "enfermero" ? "enfermeros" : "licenciados";
    copia.filas = reconciliarTurnanteAdicionalMensual({
      filas: copia.filas,
      categoria: categoria.trim(),
      planilla: estadoMensual?.planillas?.[clavePlanilla],
      versionEstructura: copia
    });
    copia.filas = resolverEtiquetasVigentesMesEditable({
      filas: copia.filas,
      categoria: categoria.trim(),
      turnoId: turno.trim(),
      mes: mes.trim(),
      mesReferencia
    });
    if (copia.prioridadCoberturaSectorIds.length === 0) {
      copia.prioridadCoberturaSectorIds = obtenerPrioridadCoberturaEfectiva({
        filas: copia.filas,
        prioridadFallback: configuracionSectores[categoria.trim()]?.prioridadSectoresIds
      }).prioridadSectorIds;
    }
    return copia;
  }

  return {
    schemaVersion: null,
    versionId: null,
    turnoId: turno.trim(),
    categoria: categoria.trim(),
    mes: mes.trim(),
    filas: obtenerFilasConfiguracionEfectivas(
      categoria.trim(),
      estadoMensual?.planillas?.[
        categoria.trim() === "enfermero" ? "enfermeros" : "licenciados"
      ],
      turno.trim()
    ).map(copiarFilaSnapshot),
    asignacionesFijas: [],
    prioridadCoberturaSectorIds: obtenerPrioridadCoberturaEfectiva({
      filas: obtenerFilasConfiguracionEfectivas(
        categoria.trim(),
        estadoMensual?.planillas?.[
          categoria.trim() === "enfermero" ? "enfermeros" : "licenciados"
        ],
        turno.trim()
      ),
      prioridadFallback: configuracionSectores[categoria.trim()]?.prioridadSectoresIds
    }).prioridadSectorIds
  };
};

export const obtenerFilasActivas = (filas = []) => filas.filter((fila) => fila?.activo !== false);

export const obtenerTurnantesBase = (tipo) =>
  obtenerFilasActivas(obtenerConfiguracionLegacyPlanilla(tipo).filas)
    .filter((fila) => fila.tipo === TIPOS_FILA_PLANILLA.TURNANTE);

export const obtenerEtiquetasFilasPlanilla = (filas = []) =>
  obtenerFilasActivas(filas).map((fila) => fila.etiqueta);
