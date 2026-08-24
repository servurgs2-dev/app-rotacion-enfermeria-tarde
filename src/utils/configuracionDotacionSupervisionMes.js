import {
  CATEGORIAS_DOTACION_SUPERVISION,
  DEFAULTS_DOTACION_SUPERVISION,
  normalizarConfiguracionDotacion,
  validarConfiguracionDotacion
} from "./dotacionSupervision.js";

export const ORIGEN_CONFIGURACION_DOTACION_MES = Object.freeze({
  PERSISTIDA: "persistida",
  HEREDADA: "heredada",
  FALLBACK_CODIGO: "fallback_codigo"
});

export const CODIGOS_ADVERTENCIA_CONFIGURACION_DOTACION_MES = Object.freeze({
  CONFIGURACION_PERSISTIDA_INVALIDA: "CONFIGURACION_PERSISTIDA_INVALIDA",
  CONFIGURACION_HEREDADA_INVALIDA: "CONFIGURACION_HEREDADA_INVALIDA"
});

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const tieneSoloClaves = (objeto, permitidas) =>
  esObjeto(objeto) && Object.keys(objeto).every((clave) => permitidas.includes(clave));

export const esMesConfiguracionDotacionValido = (mes) =>
  typeof mes === "string" &&
  /^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(mes);

export const validarConfiguracionDotacionMaterializada = (configuracion) => {
  const estructuraValida =
    esObjeto(configuracion) &&
    tieneSoloClaves(configuracion, ["defaults", "overridesTurno"]) &&
    esObjeto(configuracion.defaults) &&
    tieneSoloClaves(configuracion.defaults, CATEGORIAS_DOTACION_SUPERVISION) &&
    CATEGORIAS_DOTACION_SUPERVISION.every((categoria) =>
      Object.hasOwn(configuracion.defaults, categoria) &&
      tieneSoloClaves(configuracion.defaults[categoria], ["minimo", "optimo"])
    ) &&
    (!Object.hasOwn(configuracion, "overridesTurno") ||
      (esObjeto(configuracion.overridesTurno) &&
        Object.values(configuracion.overridesTurno).every((categorias) =>
          esObjeto(categorias) &&
          Object.values(categorias).every((umbral) =>
            tieneSoloClaves(umbral, ["minimo", "optimo"])
          )
        )));

  const validacionCentral = validarConfiguracionDotacion(configuracion);
  return {
    ok: estructuraValida && validacionCentral.ok,
    errores: validacionCentral.errores
  };
};

export const crearConfiguracionDotacionFallback = () =>
  normalizarConfiguracionDotacion({
    defaults: DEFAULTS_DOTACION_SUPERVISION,
    overridesTurno: {}
  }).configuracion;

const copiarConfiguracionValida = (configuracion) =>
  normalizarConfiguracionDotacion(configuracion).configuracion;

const metadataFila = (fila) => ({
  updatedAt: typeof fila?.updatedAt === "string" ? fila.updatedAt : null,
  updatedBy: typeof fila?.updatedBy === "string" ? fila.updatedBy : null
});

export const resolverConfiguracionDotacionSupervisionMes = ({
  mes,
  filaExacta = null,
  filaAnterior = null
} = {}) => {
  if (!esMesConfiguracionDotacionValido(mes)) {
    return {
      ok: false,
      mes: typeof mes === "string" ? mes : null,
      configuracion: crearConfiguracionDotacionFallback(),
      origen: ORIGEN_CONFIGURACION_DOTACION_MES.FALLBACK_CODIGO,
      revision: "0",
      updatedAt: null,
      updatedBy: null,
      advertencias: [{ codigo: "MES_INVALIDO" }]
    };
  }

  if (filaExacta) {
    const validacion = validarConfiguracionDotacionMaterializada(filaExacta.configuracion);
    if (validacion.ok) {
      return {
        ok: true,
        mes,
        configuracion: copiarConfiguracionValida(filaExacta.configuracion),
        origen: ORIGEN_CONFIGURACION_DOTACION_MES.PERSISTIDA,
        revision: filaExacta.revision,
        ...metadataFila(filaExacta),
        advertencias: []
      };
    }
    return {
      ok: true,
      mes,
      configuracion: crearConfiguracionDotacionFallback(),
      origen: ORIGEN_CONFIGURACION_DOTACION_MES.FALLBACK_CODIGO,
      revision: "0",
      updatedAt: null,
      updatedBy: null,
      advertencias: [{
        codigo: CODIGOS_ADVERTENCIA_CONFIGURACION_DOTACION_MES.CONFIGURACION_PERSISTIDA_INVALIDA,
        mesPersistido: filaExacta.mes || mes,
        errores: validacion.errores
      }]
    };
  }

  if (filaAnterior) {
    const validacion = validarConfiguracionDotacionMaterializada(filaAnterior.configuracion);
    if (validacion.ok) {
      return {
        ok: true,
        mes,
        configuracion: copiarConfiguracionValida(filaAnterior.configuracion),
        origen: ORIGEN_CONFIGURACION_DOTACION_MES.HEREDADA,
        revision: "0",
        updatedAt: null,
        updatedBy: null,
        heredadaDesdeMes: filaAnterior.mes,
        heredadaDesdeRevision: filaAnterior.revision,
        advertencias: []
      };
    }
    return {
      ok: true,
      mes,
      configuracion: crearConfiguracionDotacionFallback(),
      origen: ORIGEN_CONFIGURACION_DOTACION_MES.FALLBACK_CODIGO,
      revision: "0",
      updatedAt: null,
      updatedBy: null,
      advertencias: [{
        codigo: CODIGOS_ADVERTENCIA_CONFIGURACION_DOTACION_MES.CONFIGURACION_HEREDADA_INVALIDA,
        heredadaDesdeMes: filaAnterior.mes || null,
        errores: validacion.errores
      }]
    };
  }

  return {
    ok: true,
    mes,
    configuracion: crearConfiguracionDotacionFallback(),
    origen: ORIGEN_CONFIGURACION_DOTACION_MES.FALLBACK_CODIGO,
    revision: "0",
    updatedAt: null,
    updatedBy: null,
    advertencias: []
  };
};
