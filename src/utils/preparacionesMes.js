import { tieneContenidoSignificativo } from "./limpiezaSegura.js";
import { obtenerEstrategiaRotacionPlanilla } from "../config/turnos.js";
import { keyDiaFromDate, obtenerSemanasDelMes } from "./fechas.js";
import { resolverPeriodoPlanillaDia } from "./periodoPlanillaDia.js";
import { obtenerBloquesQueIntersectanMes } from "./periodosRotacionPlanilla.js";

const PATRON_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const PATRON_FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const CODIGOS_PREPARACIONES_MES = Object.freeze({
  INVALIDAS: "PREPARACIONES_INVALIDAS",
  SOLAPADAS: "PREPARACIONES_SOLAPADAS",
  HUECOS: "PREPARACIONES_CON_HUECOS",
  FECHA_FUERA_MES: "PREPARACION_FECHA_FUERA_MES",
  RANGO_INVALIDO: "PREPARACION_RANGO_INVALIDO",
  ID_REQUERIDO: "PREPARACION_ID_REQUERIDO",
  ID_DUPLICADO: "PREPARACION_ID_DUPLICADO",
  NO_ENCONTRADA: "PREPARACION_NO_ENCONTRADA",
  NO_EDITABLE: "PREPARACION_NO_EDITABLE",
  ACTIVIDAD_DETECTADA: "PREPARACION_ACTIVIDAD_DETECTADA",
  CATEGORIAS_INVALIDAS: "PREPARACION_CATEGORIAS_INVALIDAS",
  ELIMINACION_SIN_ANTERIOR: "PREPARACION_ELIMINACION_SIN_ANTERIOR",
  SIN_PREPARACION: "SIN_PREPARACION",
  LEGACY_NO_MATERIALIZABLE: "LEGACY_NO_MATERIALIZABLE"
});

export const ESTADO_TEMPORAL_PREPARACION = Object.freeze({
  PASADA: "pasada",
  VIGENTE: "vigente",
  FUTURA: "futura"
});

const esObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const clonarPreparacion = (valor) => {
  if (Array.isArray(valor)) return valor.map(clonarPreparacion);
  if (esObjeto(valor)) {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([, contenido]) => contenido !== undefined && typeof contenido !== "function")
        .map(([clave, contenido]) => [clave, clonarPreparacion(contenido)])
    );
  }
  return valor;
};

const fechaValida = (fecha) => {
  if (!PATRON_FECHA.test(String(fecha || ""))) return false;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const valor = new Date(Date.UTC(anio, mes - 1, dia));
  return valor.getUTCFullYear() === anio && valor.getUTCMonth() === mes - 1 && valor.getUTCDate() === dia;
};

const ultimoDiaMes = (mes) => {
  if (!PATRON_MES.test(String(mes || ""))) return "";
  const [anio, numeroMes] = mes.split("-").map(Number);
  const dia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, "0")}`;
};

const desplazarDia = (fecha, dias) => {
  if (!fechaValida(fecha)) return "";
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const valor = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return valor.toISOString().slice(0, 10);
};

const crearError = (codigo, detalle = {}) => ({ codigo, ...detalle });
const categoriasValidas = (categorias) =>
  esObjeto(categorias) &&
  esObjeto(categorias.enfermero) &&
  esObjeto(categorias.licenciado) &&
  esObjeto(categorias.enfermero.planilla) &&
  esObjeto(categorias.licenciado.planilla) &&
  esObjeto(categorias.enfermero.configuracion) &&
  esObjeto(categorias.licenciado.configuracion);

const CLAVES_OPERATIVAS_PROHIBIDAS = new Set([
  "personal", "calendario", "licencias", "certificaciones", "novedades",
  "cambiosDia", "cambiosParoDia", "asistenciaDia", "noDisponibles", "extras",
  "diasParo", "cierresDia", "snapshots", "responsables", "historial"
]);

const contieneClaveOperativa = (valor) => {
  if (Array.isArray(valor)) return valor.some(contieneClaveOperativa);
  if (!esObjeto(valor)) return false;
  return Object.entries(valor).some(([clave, contenido]) =>
    CLAVES_OPERATIVAS_PROHIBIDAS.has(clave) || contieneClaveOperativa(contenido)
  );
};

export const validarCategoriasPreparacionBorrador = (categorias) => {
  if (!categoriasValidas(categorias)) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.CATEGORIAS_INVALIDAS };
  }
  const categoriasExactas = Object.keys(categorias).every((categoria) =>
    ["enfermero", "licenciado"].includes(categoria)
  );
  const payloadsExactos = ["enfermero", "licenciado"].every((categoria) =>
    Object.keys(categorias[categoria]).every((clave) =>
      ["planilla", "configuracion"].includes(clave)
    )
  );
  if (!categoriasExactas || !payloadsExactos || contieneClaveOperativa(categorias)) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.CATEGORIAS_INVALIDAS };
  }
  try {
    JSON.stringify(categorias);
  } catch {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.CATEGORIAS_INVALIDAS };
  }
  return { ok: true, codigo: "CATEGORIAS_PREPARACION_VALIDAS" };
};

export const extraerSnapshotOrganizativo = (estado = {}) => ({
  categorias: {
    enfermero: {
      planilla: clonarPreparacion(estado?.planillas?.enfermeros || {}),
      configuracion: clonarPreparacion(estado?.configuracionPlanilla?.enfermero || {})
    },
    licenciado: {
      planilla: clonarPreparacion(estado?.planillas?.licenciados || {}),
      configuracion: clonarPreparacion(estado?.configuracionPlanilla?.licenciado || {})
    }
  }
});

const SEMANAS = Object.freeze(["semana1", "semana2", "semana3", "semana4", "semana5", "semana6"]);

export const analizarOrganizacionLegacy = (estado = {}) => {
  const senales = [];
  const registrar = (senal, valor) => {
    if (tieneContenidoSignificativo(valor)) senales.push(senal);
  };
  for (const [categoria, clavePlanilla, claveConfiguracion] of [
    ["enfermero", "enfermeros", "enfermero"],
    ["licenciado", "licenciados", "licenciado"]
  ]) {
    const planilla = estado?.planillas?.[clavePlanilla] || {};
    SEMANAS.forEach((semana) => registrar(`${categoria}.${semana}`, planilla?.[semana]));
    registrar(`${categoria}.coberturaLibreSM`, planilla?.coberturaLibreSM);
    registrar(`${categoria}.generacionFlexible`, planilla?.generacionFlexible);
    registrar(`${categoria}.posicionesMensualesAdicionales`, planilla?.posicionesMensualesAdicionales);
    registrar(`${categoria}.asignacionesParciales`, planilla?.asignacionesParciales);
    if (categoria === "enfermero") {
      registrar("enfermero.rotacion3Dias.asignacionBase", planilla?.rotacion3Dias?.asignacionBase);
      registrar("enfermero.rotacion3Dias.bloques", planilla?.rotacion3Dias?.bloques);
      registrar("enfermero.rotacion3Dias.coberturaLibreSM", planilla?.rotacion3Dias?.coberturaLibreSM);
    }
    registrar(`${categoria}.configuracionPlanilla`, estado?.configuracionPlanilla?.[claveConfiguracion]);
  }
  const clavesConocidas = new Set([
    "planillas", "configuracionPlanilla", "personal", "licencias", "certificaciones",
    "calendario", "novedades", "responsables", "historial", "revision"
  ]);
  const contenidoNoOrganizativo = [
    estado?.personal,
    estado?.licencias,
    estado?.certificaciones,
    estado?.calendario,
    estado?.novedades,
    estado?.responsables,
    estado?.historial,
    Object.fromEntries(Object.entries(estado || {}).filter(([clave]) => !clavesConocidas.has(clave)))
  ].some(tieneContenidoSignificativo);
  if (senales.length > 0) {
    return { materializable: true, codigo: "LEGACY_PREPARACION_MATERIALIZABLE", senales };
  }
  return {
    materializable: false,
    codigo: contenidoNoOrganizativo
      ? CODIGOS_PREPARACIONES_MES.LEGACY_NO_MATERIALIZABLE
      : CODIGOS_PREPARACIONES_MES.SIN_PREPARACION,
    senales: []
  };
};

export const normalizarPreparacionesMes = ({ preparaciones, mes, exigirCoberturaCompleta = false } = {}) => {
  const errores = [];
  if (!PATRON_MES.test(String(mes || "")) || !Array.isArray(preparaciones) || preparaciones.length === 0) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.INVALIDAS, preparaciones: [], errores: [crearError(CODIGOS_PREPARACIONES_MES.INVALIDAS)], huecos: [] };
  }
  const normalizadas = preparaciones.map((preparacion) => clonarPreparacion(preparacion));
  const ids = new Set();
  normalizadas.forEach((preparacion, indice) => {
    const id = String(preparacion?.id || "").trim();
    if (!id) errores.push(crearError(CODIGOS_PREPARACIONES_MES.ID_REQUERIDO, { indice }));
    else if (ids.has(id)) errores.push(crearError(CODIGOS_PREPARACIONES_MES.ID_DUPLICADO, { id, indice }));
    else ids.add(id);
    if (!fechaValida(preparacion?.desde) || !fechaValida(preparacion?.hasta) ||
        !String(preparacion.desde).startsWith(`${mes}-`) || !String(preparacion.hasta).startsWith(`${mes}-`)) {
      errores.push(crearError(CODIGOS_PREPARACIONES_MES.FECHA_FUERA_MES, { id, indice }));
    } else if (preparacion.desde > preparacion.hasta) {
      errores.push(crearError(CODIGOS_PREPARACIONES_MES.RANGO_INVALIDO, { id, indice }));
    }
    if (!categoriasValidas(preparacion?.categorias)) {
      errores.push(crearError(CODIGOS_PREPARACIONES_MES.CATEGORIAS_INVALIDAS, { id, indice }));
    }
  });
  normalizadas.sort((a, b) => String(a?.desde || "").localeCompare(String(b?.desde || "")));
  const huecos = [];
  if (errores.length === 0) {
    for (let indice = 1; indice < normalizadas.length; indice += 1) {
      const anterior = normalizadas[indice - 1];
      const actual = normalizadas[indice];
      if (actual.desde <= anterior.hasta) {
        errores.push(crearError(CODIGOS_PREPARACIONES_MES.SOLAPADAS, { ids: [anterior.id, actual.id] }));
      } else if (actual.desde !== desplazarDia(anterior.hasta, 1)) {
        huecos.push({ desde: desplazarDia(anterior.hasta, 1), hasta: desplazarDia(actual.desde, -1) });
      }
    }
    const inicioMes = `${mes}-01`;
    const finMes = ultimoDiaMes(mes);
    if (normalizadas[0].desde !== inicioMes) {
      huecos.unshift({ desde: inicioMes, hasta: desplazarDia(normalizadas[0].desde, -1) });
    }
    if (normalizadas.at(-1).hasta !== finMes) {
      huecos.push({ desde: desplazarDia(normalizadas.at(-1).hasta, 1), hasta: finMes });
    }
    if (exigirCoberturaCompleta && huecos.length > 0) {
      errores.push(crearError(CODIGOS_PREPARACIONES_MES.HUECOS, { huecos: clonarPreparacion(huecos) }));
    }
  }
  return {
    ok: errores.length === 0,
    codigo: errores[0]?.codigo || "PREPARACIONES_VALIDAS",
    preparaciones: normalizadas,
    errores,
    huecos
  };
};

export const materializarPreparacionLegacy = ({
  estado,
  mes,
  id = `preparacion-legacy-${mes}`,
  creadaEn = null,
  creadaPor = null
} = {}) => {
  if (!PATRON_MES.test(String(mes || ""))) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.INVALIDAS, preparaciones: [] };
  }
  const diagnostico = analizarOrganizacionLegacy(estado);
  if (!diagnostico.materializable) {
    return { ok: false, ...diagnostico, preparaciones: [] };
  }
  const preparacion = {
    id,
    desde: `${mes}-01`,
    hasta: ultimoDiaMes(mes),
    creadaEn,
    creadaPor,
    origen: "legacy_virtual",
    ...extraerSnapshotOrganizativo(estado)
  };
  return { ok: true, codigo: "PREPARACION_LEGACY_MATERIALIZADA", preparaciones: [preparacion], senales: diagnostico.senales };
};

export const obtenerPreparacionesMes = ({ estado, mes, exigirCoberturaCompleta = true } = {}) => {
  if (Object.hasOwn(estado || {}, "preparaciones")) {
    const resultado = normalizarPreparacionesMes({
      preparaciones: estado.preparaciones,
      mes,
      exigirCoberturaCompleta
    });
    return { ...resultado, origen: "versionado", virtual: false };
  }
  const legacy = materializarPreparacionLegacy({ estado, mes });
  return { ...legacy, errores: [], huecos: [], origen: "legacy", virtual: legacy.ok === true };
};

export const resolverPreparacionMesPorFecha = ({ estado, preparaciones, mes, fecha } = {}) => {
  if (!fechaValida(fecha) || !String(fecha).startsWith(`${mes}-`)) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.FECHA_FUERA_MES, preparacion: null };
  }
  const coleccion = preparaciones === undefined
    ? obtenerPreparacionesMes({ estado, mes })
    : normalizarPreparacionesMes({ preparaciones, mes, exigirCoberturaCompleta: false });
  if (!coleccion.ok) return { ...coleccion, preparacion: null };
  const preparacion = coleccion.preparaciones.find((item) => item.desde <= fecha && fecha <= item.hasta) || null;
  return preparacion
    ? { ok: true, codigo: "PREPARACION_RESUELTA", preparacion: clonarPreparacion(preparacion), origen: coleccion.origen }
    : { ok: false, codigo: CODIGOS_PREPARACIONES_MES.NO_ENCONTRADA, preparacion: null, huecos: coleccion.huecos };
};

export const resolverOrganizacionMesPorFecha = ({ estado, mes, fecha } = {}) => {
  const resultado = resolverPreparacionMesPorFecha({ estado, mes, fecha });
  if (!resultado.ok || !resultado.preparacion) {
    return {
      ok: false,
      codigo: resultado.codigo,
      origen: resultado.origen || (Object.hasOwn(estado || {}, "preparaciones") ? "versionado" : "legacy"),
      preparacionId: null,
      planillas: null,
      configuracionPlanilla: null,
      errores: resultado.errores || [],
      huecos: resultado.huecos || []
    };
  }
  const preparacion = resultado.preparacion;
  const esLegacy = resultado.origen === "legacy";
  return {
    ok: true,
    codigo: "ORGANIZACION_MES_RESUELTA",
    origen: resultado.origen || "versionado",
    preparacionId: preparacion.id,
    planillas: esLegacy
      ? clonarPreparacion(estado?.planillas || {})
      : {
          enfermeros: clonarPreparacion(preparacion.categorias.enfermero.planilla),
          licenciados: clonarPreparacion(preparacion.categorias.licenciado.planilla)
        },
    configuracionPlanilla: esLegacy
      ? clonarPreparacion(estado?.configuracionPlanilla || {})
      : {
          enfermero: clonarPreparacion(preparacion.categorias.enfermero.configuracion),
          licenciado: clonarPreparacion(preparacion.categorias.licenciado.configuracion)
        },
    errores: [],
    huecos: []
  };
};

const clavePlanillaCategoria = (categoria) =>
  categoria === "enfermero" ? "enfermeros" : "licenciados";

const formatearRangoTramo = (desde, hasta) => {
  const corta = (fecha) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
  return desde === hasta ? corta(desde) : `${corta(desde)}–${corta(hasta)}`;
};

const crearTramoPlanilla = ({
  preparacionId,
  desde,
  hasta,
  periodo,
  organizacion,
  categoria,
  resultadoPeriodo
}) => ({
  id: `${preparacionId}|${resultadoPeriodo.clavePeriodo}|${desde}|${hasta}`,
  preparacionId,
  desde,
  hasta,
  clavePeriodo: resultadoPeriodo.clavePeriodo,
  tipoPeriodo: resultadoPeriodo.tipoPeriodo,
  etiqueta: formatearRangoTramo(desde, hasta),
  periodo: clonarPreparacion(periodo || resultadoPeriodo.periodo),
  planilla: clonarPreparacion(
    organizacion.planillas[clavePlanillaCategoria(categoria)] || {}
  ),
  configuracionPlanilla: clonarPreparacion(
    organizacion.configuracionPlanilla[categoria] || {}
  ),
  distribucion: clonarPreparacion(resultadoPeriodo.distribucion || {}),
  coberturasSaludMental: clonarPreparacion(
    resultadoPeriodo.coberturasSaludMental || {}
  )
});

const obtenerRangoPeriodoLegacy = (periodo, tipoPeriodo) =>
  tipoPeriodo === "cada_3_dias"
    ? { desde: periodo.fechaInicio, hasta: periodo.fechaFin }
    : { desde: keyDiaFromDate(periodo.desde), hasta: keyDiaFromDate(periodo.hasta) };

export const resolverTramosPlanillaMes = ({
  estado,
  mes,
  turno,
  categoria,
  permitirPeriodosNoPreparados = false
} = {}) => {
  const coleccion = obtenerPreparacionesMes({ estado, mes });
  if (!coleccion.ok) {
    return {
      ok: false,
      codigo: coleccion.codigo,
      origen: coleccion.origen,
      tramos: [],
      errores: coleccion.errores || []
    };
  }

  const estrategia = obtenerEstrategiaRotacionPlanilla({
    turnoId: turno,
    tipo: categoria,
    mesActivo: mes
  });

  if (coleccion.origen === "legacy") {
    const organizacion = resolverOrganizacionMesPorFecha({
      estado,
      mes,
      fecha: `${mes}-01`
    });
    const periodos = estrategia.tipo === "cada_3_dias"
      ? obtenerBloquesQueIntersectanMes({
          mesActivo: mes,
          fechaBase: estrategia.fechaBase,
          duracionDias: estrategia.duracionDias
        })
      : obtenerSemanasDelMes(mes);
    const tramos = periodos.flatMap((periodo) => {
      const rango = obtenerRangoPeriodoLegacy(periodo, estrategia.tipo);
      const fechaResolucion = rango.desde < `${mes}-01` ? `${mes}-01` : rango.desde;
      const resultadoPeriodo = resolverPeriodoPlanillaDia({
        estadoMensual: {
          ...estado,
          planillas: organizacion.planillas,
          configuracionPlanilla: organizacion.configuracionPlanilla
        },
        planilla: organizacion.planillas[clavePlanillaCategoria(categoria)],
        fecha: fechaResolucion,
        turno,
        categoria,
        mes
      });
      return resultadoPeriodo.ok
        ? [crearTramoPlanilla({
            preparacionId: organizacion.preparacionId,
            ...rango,
            periodo,
            organizacion,
            categoria,
            resultadoPeriodo
          })]
        : [];
    });
    return {
      ok: true,
      codigo: "TRAMOS_PLANILLA_RESUELTOS",
      origen: "legacy",
      tramos,
      errores: []
    };
  }

  const finMes = ultimoDiaMes(mes);
  const tramos = [];
  for (let fecha = `${mes}-01`; fecha <= finMes; fecha = desplazarDia(fecha, 1)) {
    const organizacion = resolverOrganizacionMesPorFecha({ estado, mes, fecha });
    if (!organizacion.ok) {
      return {
        ok: false,
        codigo: organizacion.codigo,
        origen: "versionado",
        tramos: [],
        errores: organizacion.errores || []
      };
    }
    const planilla = organizacion.planillas[clavePlanillaCategoria(categoria)];
    let resultadoPeriodo = resolverPeriodoPlanillaDia({
      estadoMensual: {
        ...estado,
        planillas: organizacion.planillas,
        configuracionPlanilla: organizacion.configuracionPlanilla
      },
      planilla,
      fecha,
      turno,
      categoria,
      mes
    });
    if (!resultadoPeriodo.ok && permitirPeriodosNoPreparados &&
      resultadoPeriodo.errores?.[0]?.codigo === "PERIODO_NO_PREPARADO") {
      resultadoPeriodo = {
        ...resultadoPeriodo,
        ok: true,
        disponible: false,
        distribucion: {}
      };
    }
    if (!resultadoPeriodo.ok) {
      return {
        ok: false,
        codigo: resultadoPeriodo.errores?.[0]?.codigo || "PERIODO_NO_PREPARADO",
        origen: "versionado",
        tramos: [],
        errores: resultadoPeriodo.errores || []
      };
    }
    const anterior = tramos.at(-1);
    if (
      anterior &&
      anterior.preparacionId === organizacion.preparacionId &&
      anterior.clavePeriodo === resultadoPeriodo.clavePeriodo &&
      desplazarDia(anterior.hasta, 1) === fecha
    ) {
      anterior.hasta = fecha;
      anterior.id = `${anterior.preparacionId}|${anterior.clavePeriodo}|${anterior.desde}|${fecha}`;
      anterior.etiqueta = formatearRangoTramo(anterior.desde, fecha);
      continue;
    }
    tramos.push(crearTramoPlanilla({
      preparacionId: organizacion.preparacionId,
      desde: fecha,
      hasta: fecha,
      organizacion,
      categoria,
      resultadoPeriodo
    }));
  }
  return {
    ok: true,
    codigo: "TRAMOS_PLANILLA_RESUELTOS",
    origen: "versionado",
    tramos,
    errores: []
  };
};

export const clasificarPreparacion = (preparacion, fechaReferencia) => {
  if (!fechaValida(fechaReferencia) || !fechaValida(preparacion?.desde) || !fechaValida(preparacion?.hasta)) return null;
  if (preparacion.hasta < fechaReferencia) return ESTADO_TEMPORAL_PREPARACION.PASADA;
  if (preparacion.desde > fechaReferencia) return ESTADO_TEMPORAL_PREPARACION.FUTURA;
  return ESTADO_TEMPORAL_PREPARACION.VIGENTE;
};

export const puedeEditarPreparacion = ({ preparacion, fechaReferencia, actividadDetectada = false } = {}) => ({
  permitida: clasificarPreparacion(preparacion, fechaReferencia) === ESTADO_TEMPORAL_PREPARACION.FUTURA && !actividadDetectada,
  codigo: actividadDetectada
    ? CODIGOS_PREPARACIONES_MES.ACTIVIDAD_DETECTADA
    : clasificarPreparacion(preparacion, fechaReferencia) === ESTADO_TEMPORAL_PREPARACION.FUTURA
      ? "PREPARACION_EDITABLE"
      : CODIGOS_PREPARACIONES_MES.NO_EDITABLE
});

export const crearNuevaPreparacionDesdeFecha = ({
  preparaciones,
  mes,
  desde,
  fechaReferencia,
  actividadDetectada = false,
  id = `preparacion-${desde}`,
  creadaEn = null,
  creadaPor = null,
  origen = "clon_preparacion_anterior"
} = {}) => {
  if (!fechaValida(desde) || !String(desde).startsWith(`${mes}-`)) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.FECHA_FUERA_MES };
  }
  if (actividadDetectada) return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.ACTIVIDAD_DETECTADA };
  if (fechaValida(fechaReferencia) && desde < fechaReferencia) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.NO_EDITABLE };
  }
  const coleccion = normalizarPreparacionesMes({ preparaciones, mes, exigirCoberturaCompleta: true });
  if (!coleccion.ok) return coleccion;
  if (coleccion.preparaciones.some((item) => item.id === id)) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.ID_DUPLICADO };
  }
  const indice = coleccion.preparaciones.findIndex((item) => item.desde < desde && desde <= item.hasta);
  if (indice < 0) return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.NO_ENCONTRADA };
  const fuente = coleccion.preparaciones[indice];
  const anterior = { ...clonarPreparacion(fuente), hasta: desplazarDia(desde, -1) };
  const nueva = {
    ...clonarPreparacion(fuente),
    id,
    desde,
    creadaEn,
    creadaPor,
    origen
  };
  const resultado = coleccion.preparaciones.map((item, posicion) =>
    posicion === indice ? anterior : clonarPreparacion(item)
  );
  resultado.splice(indice + 1, 0, nueva);
  return { ok: true, codigo: "PREPARACION_CREADA", preparaciones: resultado, preparacion: clonarPreparacion(nueva) };
};

export const reemplazarPreparacionFutura = ({
  preparaciones,
  mes,
  id,
  categorias,
  fechaReferencia,
  actividadDetectada = false
} = {}) => {
  const coleccion = normalizarPreparacionesMes({ preparaciones, mes, exigirCoberturaCompleta: true });
  if (!coleccion.ok) return coleccion;
  const indice = coleccion.preparaciones.findIndex((item) => item.id === id);
  if (indice < 0) return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.NO_ENCONTRADA };
  const editable = puedeEditarPreparacion({ preparacion: coleccion.preparaciones[indice], fechaReferencia, actividadDetectada });
  if (!editable.permitida) return { ok: false, codigo: editable.codigo };
  if (!categoriasValidas(categorias)) return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.CATEGORIAS_INVALIDAS };
  const resultado = coleccion.preparaciones.map((item, posicion) => posicion === indice
    ? { ...clonarPreparacion(item), categorias: clonarPreparacion(categorias) }
    : clonarPreparacion(item));
  return { ok: true, codigo: "PREPARACION_REEMPLAZADA", preparaciones: resultado };
};

export const eliminarPreparacionFutura = ({
  preparaciones,
  mes,
  id,
  fechaReferencia,
  actividadDetectada = false
} = {}) => {
  const coleccion = normalizarPreparacionesMes({ preparaciones, mes, exigirCoberturaCompleta: true });
  if (!coleccion.ok) return coleccion;
  const indice = coleccion.preparaciones.findIndex((item) => item.id === id);
  if (indice < 0) return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.NO_ENCONTRADA };
  const editable = puedeEditarPreparacion({ preparacion: coleccion.preparaciones[indice], fechaReferencia, actividadDetectada });
  if (!editable.permitida) return { ok: false, codigo: editable.codigo };
  if (indice === 0) return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.ELIMINACION_SIN_ANTERIOR };
  const eliminada = coleccion.preparaciones[indice];
  const resultado = coleccion.preparaciones
    .filter((_, posicion) => posicion !== indice)
    .map(clonarPreparacion);
  resultado[indice - 1] = { ...resultado[indice - 1], hasta: eliminada.hasta };
  return { ok: true, codigo: "PREPARACION_ELIMINADA", preparaciones: resultado };
};
