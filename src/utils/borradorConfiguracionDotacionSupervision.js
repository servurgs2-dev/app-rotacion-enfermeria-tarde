import {
  copiarConfiguracionDotacion,
  validarConfiguracionDotacion
} from "./dotacionSupervision.js";

export const TURNOS_EDITOR_DOTACION_SUPERVISION = Object.freeze([
  "noche",
  "manana",
  "tarde",
  "vespertino"
]);

export const CATEGORIAS_EDITOR_DOTACION_SUPERVISION = Object.freeze([
  "licenciado",
  "enfermero"
]);

const MENSAJE_ENTERO = Object.freeze({
  minimo: "El mínimo debe ser un entero mayor o igual a 0.",
  optimo: "El óptimo debe ser un entero mayor o igual a 0."
});

const copiarBorrador = (configuracion) => copiarConfiguracionDotacion(configuracion);

const leerEnteroNoNegativo = (valor) => {
  if (typeof valor === "number") {
    return Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
  }
  if (typeof valor !== "string" || !/^(0|[1-9][0-9]*)$/.test(valor)) {
    return null;
  }
  const numero = Number(valor);
  return Number.isSafeInteger(numero) ? numero : null;
};

const claveCampo = ({ fuente, turno, categoria, campo }) =>
  fuente === "default"
    ? `defaults.${categoria}.${campo}`
    : `overridesTurno.${turno}.${categoria}.${campo}`;

const validarUmbralBorrador = ({ umbral, fuente, turno = null, categoria }) => {
  const erroresCampos = {};
  const minimo = leerEnteroNoNegativo(umbral?.minimo);
  const optimo = leerEnteroNoNegativo(umbral?.optimo);
  if (minimo === null) {
    erroresCampos[claveCampo({ fuente, turno, categoria, campo: "minimo" })] =
      MENSAJE_ENTERO.minimo;
  }
  if (optimo === null) {
    erroresCampos[claveCampo({ fuente, turno, categoria, campo: "optimo" })] =
      MENSAJE_ENTERO.optimo;
  } else if (minimo !== null && optimo < minimo) {
    erroresCampos[claveCampo({ fuente, turno, categoria, campo: "optimo" })] =
      "El óptimo no puede ser menor que el mínimo.";
  }
  return {
    erroresCampos,
    umbral: minimo === null || optimo === null ? null : { minimo, optimo }
  };
};

export const crearBorradorConfiguracionDotacion = (configuracion) =>
  copiarBorrador(configuracion);

export const validarBorradorConfiguracionDotacion = (borrador) => {
  const erroresCampos = {};
  const configuracion = { defaults: {}, overridesTurno: {} };

  CATEGORIAS_EDITOR_DOTACION_SUPERVISION.forEach((categoria) => {
    const validacion = validarUmbralBorrador({
      umbral: borrador?.defaults?.[categoria],
      fuente: "default",
      categoria
    });
    Object.assign(erroresCampos, validacion.erroresCampos);
    if (validacion.umbral) configuracion.defaults[categoria] = validacion.umbral;
  });

  TURNOS_EDITOR_DOTACION_SUPERVISION.forEach((turno) => {
    CATEGORIAS_EDITOR_DOTACION_SUPERVISION.forEach((categoria) => {
      const umbral = borrador?.overridesTurno?.[turno]?.[categoria];
      if (umbral === undefined) return;
      const validacion = validarUmbralBorrador({
        umbral,
        fuente: "override",
        turno,
        categoria
      });
      Object.assign(erroresCampos, validacion.erroresCampos);
      if (validacion.umbral) {
        configuracion.overridesTurno[turno] ||= {};
        configuracion.overridesTurno[turno][categoria] = validacion.umbral;
      }
    });
  });

  if (Object.keys(erroresCampos).length > 0) {
    return { ok: false, configuracion: null, erroresCampos, errores: [] };
  }

  const validacionCentral = validarConfiguracionDotacion(configuracion);
  return {
    ok: validacionCentral.ok,
    configuracion: validacionCentral.ok ? configuracion : null,
    erroresCampos,
    errores: validacionCentral.errores
  };
};

export const configuracionesDotacionIguales = (borrador, configuracionInicial) => {
  const validacion = validarBorradorConfiguracionDotacion(borrador);
  if (!validacion.ok) return false;
  return JSON.stringify(validacion.configuracion) ===
    JSON.stringify(copiarBorrador(configuracionInicial));
};

export const actualizarCampoBorradorDotacion = (
  borrador,
  { fuente, turno = null, categoria, campo, valor }
) => {
  const siguiente = structuredClone(borrador);
  if (fuente === "default") {
    siguiente.defaults[categoria][campo] = valor;
  } else {
    siguiente.overridesTurno[turno][categoria][campo] = valor;
  }
  return siguiente;
};

export const alternarValoresGeneralesTurno = (
  borrador,
  { turno, categoria, usarGenerales }
) => {
  const siguiente = structuredClone(borrador);
  siguiente.overridesTurno ||= {};
  if (usarGenerales) {
    if (siguiente.overridesTurno[turno]) {
      delete siguiente.overridesTurno[turno][categoria];
      if (Object.keys(siguiente.overridesTurno[turno]).length === 0) {
        delete siguiente.overridesTurno[turno];
      }
    }
    return siguiente;
  }
  siguiente.overridesTurno[turno] ||= {};
  siguiente.overridesTurno[turno][categoria] = {
    ...siguiente.defaults[categoria]
  };
  return siguiente;
};

export const esMesHistoricoSupervision = (mes, ahora = new Date()) => {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(ahora);
  const ano = partes.find(({ type }) => type === "year")?.value;
  const mesActual = partes.find(({ type }) => type === "month")?.value;
  return typeof mes === "string" && mes < `${ano}-${mesActual}`;
};

export const resolverRevisionEsperadaConfiguracionDotacion = ({
  origen,
  revision
} = {}) => origen === "persistida" ? String(revision) : "0";

export const prepararGuardadoBorradorConfiguracionDotacion = ({
  mes,
  origen,
  revision,
  borrador,
  configuracionInicial,
  ahora = new Date()
} = {}) => {
  if (esMesHistoricoSupervision(mes, ahora)) {
    return { ok: false, codigo: "MES_HISTORICO_PROTEGIDO" };
  }
  const validacion = validarBorradorConfiguracionDotacion(borrador);
  if (!validacion.ok) {
    return { ok: false, codigo: "CONFIGURACION_INVALIDA", validacion };
  }
  if (configuracionesDotacionIguales(borrador, configuracionInicial)) {
    return { ok: false, codigo: "SIN_CAMBIOS" };
  }
  return {
    ok: true,
    mes,
    configuracion: structuredClone(validacion.configuracion),
    revisionEsperada: resolverRevisionEsperadaConfiguracionDotacion({ origen, revision })
  };
};

export const obtenerCodigoErrorGuardadoConfiguracionDotacion = (error) => {
  const texto = `${error?.codigo || ""} ${error?.code || ""} ${error?.message || ""}`;
  return [
    "MES_HISTORICO_PROTEGIDO",
    "PERMISO_SUPERVISION_REQUERIDO",
    "CONFIGURACION_INVALIDA",
    "REVISION_ESPERADA_INVALIDA"
  ].find((codigo) => texto.includes(codigo)) || null;
};

export const mensajeHumanoErrorGuardadoConfiguracionDotacion = (error) => {
  const codigo = obtenerCodigoErrorGuardadoConfiguracionDotacion(error);
  const mensajes = {
    MES_HISTORICO_PROTEGIDO: "Los meses históricos son de solo lectura.",
    PERMISO_SUPERVISION_REQUERIDO: "No tenés permisos de Supervisión para realizar este cambio.",
    CONFIGURACION_INVALIDA: "La configuración contiene valores inválidos.",
    REVISION_ESPERADA_INVALIDA: "No se pudo validar la versión de la configuración."
  };
  return mensajes[codigo] || "No se pudo guardar la configuración. Intentá nuevamente.";
};

export const crearFuenteEdicionConfiguracionDotacion = (
  configuracionMes,
  configuracion = configuracionMes.configuracion
) => ({
  configuracion: crearBorradorConfiguracionDotacion(configuracion),
  origen: configuracionMes.origen,
  revision: configuracionMes.revision,
  firma: `${configuracionMes.origen}:${configuracionMes.revision}:${JSON.stringify(configuracion)}`
});

export const resolverSincronizacionEditorConfiguracionDotacion = ({
  fuenteBase,
  borrador,
  fuenteEntrante,
  protegerFuente = false,
  guardando = false,
  conflicto = false
}) => {
  const cambiosLocales = !configuracionesDotacionIguales(
    borrador,
    fuenteBase.configuracion
  );
  const fuenteCambio = fuenteEntrante.firma !== fuenteBase.firma;
  const adoptarEntrante = fuenteCambio && !cambiosLocales &&
    !protegerFuente && !guardando && !conflicto;
  return {
    fuenteActiva: adoptarEntrante ? fuenteEntrante : fuenteBase,
    borradorActivo: adoptarEntrante ? fuenteEntrante.configuracion : borrador,
    cambiosLocales,
    fuenteCambio,
    actualizacionRemotaPendiente: fuenteCambio && cambiosLocales
  };
};
