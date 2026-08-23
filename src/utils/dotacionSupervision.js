import { TURNOS } from "../config/turnos.js";

export const CATEGORIAS_DOTACION_SUPERVISION = Object.freeze([
  "licenciado",
  "enfermero"
]);

export const DEFAULTS_DOTACION_SUPERVISION = Object.freeze({
  licenciado: Object.freeze({ minimo: 9, optimo: 11 }),
  enfermero: Object.freeze({ minimo: 13, optimo: 16 })
});

export const CODIGOS_ERROR_DOTACION_SUPERVISION = Object.freeze({
  CONFIGURACION_INVALIDA: "CONFIGURACION_INVALIDA",
  TURNO_INVALIDO: "TURNO_INVALIDO",
  CATEGORIA_INVALIDA: "CATEGORIA_INVALIDA",
  UMBRAL_INCOMPLETO: "UMBRAL_INCOMPLETO",
  MINIMO_INVALIDO: "MINIMO_INVALIDO",
  OPTIMO_INVALIDO: "OPTIMO_INVALIDO",
  OPTIMO_MENOR_QUE_MINIMO: "OPTIMO_MENOR_QUE_MINIMO",
  CANTIDAD_INVALIDA: "CANTIDAD_INVALIDA"
});

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const esEnteroNoNegativo = (valor) => Number.isInteger(valor) && valor >= 0;
const esCategoriaValida = (categoria) =>
  CATEGORIAS_DOTACION_SUPERVISION.includes(categoria);
const esTurnoValido = (turno) => Object.hasOwn(TURNOS, turno);
const copiarUmbral = ({ minimo, optimo }) => ({ minimo, optimo });

const validarUmbral = (umbral, contexto = {}) => {
  if (!esObjeto(umbral) || !("minimo" in umbral) || !("optimo" in umbral)) {
    return [{
      codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.UMBRAL_INCOMPLETO,
      ...contexto
    }];
  }
  const errores = [];
  if (!esEnteroNoNegativo(umbral.minimo)) {
    errores.push({
      codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.MINIMO_INVALIDO,
      ...contexto,
      valor: umbral.minimo
    });
  }
  if (!esEnteroNoNegativo(umbral.optimo)) {
    errores.push({
      codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.OPTIMO_INVALIDO,
      ...contexto,
      valor: umbral.optimo
    });
  }
  if (
    esEnteroNoNegativo(umbral.minimo) &&
    esEnteroNoNegativo(umbral.optimo) &&
    umbral.optimo < umbral.minimo
  ) {
    errores.push({
      codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.OPTIMO_MENOR_QUE_MINIMO,
      ...contexto,
      minimo: umbral.minimo,
      optimo: umbral.optimo
    });
  }
  return errores;
};

export const validarConfiguracionDotacion = (configuracion) => {
  if (configuracion == null) return { ok: true, errores: [] };
  if (!esObjeto(configuracion)) {
    return {
      ok: false,
      errores: [{ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.CONFIGURACION_INVALIDA }]
    };
  }

  const errores = [];
  if (configuracion.defaults !== undefined && !esObjeto(configuracion.defaults)) {
    errores.push({ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.CONFIGURACION_INVALIDA, campo: "defaults" });
  } else {
    Object.entries(configuracion.defaults || {}).forEach(([categoria, umbral]) => {
      if (!esCategoriaValida(categoria)) {
        errores.push({ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.CATEGORIA_INVALIDA, categoria });
        return;
      }
      errores.push(...validarUmbral(umbral, { categoria, fuente: "default" }));
    });
  }

  if (configuracion.overridesTurno !== undefined && !esObjeto(configuracion.overridesTurno)) {
    errores.push({ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.CONFIGURACION_INVALIDA, campo: "overridesTurno" });
  } else {
    Object.entries(configuracion.overridesTurno || {}).forEach(([turno, categorias]) => {
      if (!esTurnoValido(turno)) {
        errores.push({ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.TURNO_INVALIDO, turno });
        return;
      }
      if (!esObjeto(categorias)) {
        errores.push({ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.CONFIGURACION_INVALIDA, turno });
        return;
      }
      Object.entries(categorias).forEach(([categoria, umbral]) => {
        if (!esCategoriaValida(categoria)) {
          errores.push({ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.CATEGORIA_INVALIDA, turno, categoria });
          return;
        }
        errores.push(...validarUmbral(umbral, { turno, categoria, fuente: "override" }));
      });
    });
  }
  return { ok: errores.length === 0, errores };
};

export const normalizarConfiguracionDotacion = (configuracion) => {
  const errores = validarConfiguracionDotacion(configuracion).errores;
  const defaults = Object.fromEntries(
    CATEGORIAS_DOTACION_SUPERVISION.map((categoria) => {
      const candidata = esObjeto(configuracion?.defaults)
        ? configuracion.defaults[categoria]
        : null;
      const valida = validarUmbral(candidata, { categoria }).length === 0;
      return [categoria, copiarUmbral(
        valida ? candidata : DEFAULTS_DOTACION_SUPERVISION[categoria]
      )];
    })
  );
  const overridesTurno = {};
  Object.entries(esObjeto(configuracion?.overridesTurno)
    ? configuracion.overridesTurno
    : {}).forEach(([turno, categorias]) => {
    if (!esTurnoValido(turno) || !esObjeto(categorias)) return;
    const overridesValidos = Object.fromEntries(
      Object.entries(categorias).flatMap(([categoria, umbral]) =>
        esCategoriaValida(categoria) && validarUmbral(umbral).length === 0
          ? [[categoria, copiarUmbral(umbral)]]
          : []
      )
    );
    if (Object.keys(overridesValidos).length > 0) {
      overridesTurno[turno] = overridesValidos;
    }
  });
  return {
    configuracion: { defaults, overridesTurno },
    errores
  };
};

export const copiarConfiguracionDotacion = (configuracion) =>
  normalizarConfiguracionDotacion(configuracion).configuracion;

export const resolverUmbralDotacion = ({ configuracion, turno, categoria } = {}) => {
  const errores = [];
  if (!esTurnoValido(turno)) {
    errores.push({ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.TURNO_INVALIDO, turno });
  }
  if (!esCategoriaValida(categoria)) {
    errores.push({ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.CATEGORIA_INVALIDA, categoria });
  }
  if (errores.length > 0) {
    return { ok: false, minimo: null, optimo: null, fuente: null, errores };
  }
  const normalizada = normalizarConfiguracionDotacion(configuracion);
  const override = normalizada.configuracion.overridesTurno[turno]?.[categoria];
  const umbral = override || normalizada.configuracion.defaults[categoria];
  return {
    ok: true,
    ...copiarUmbral(umbral),
    fuente: override ? "override" : "default",
    errores: normalizada.errores
  };
};

export const resolverEstadoDotacion = ({ cantidad, minimo, optimo } = {}) => {
  const erroresUmbral = validarUmbral({ minimo, optimo });
  const errores = [
    ...(!esEnteroNoNegativo(cantidad)
      ? [{ codigo: CODIGOS_ERROR_DOTACION_SUPERVISION.CANTIDAD_INVALIDA, valor: cantidad }]
      : []),
    ...erroresUmbral
  ];
  if (errores.length > 0) {
    return {
      ok: false,
      cantidad,
      minimo,
      optimo,
      estado: "invalido",
      faltanParaMinimo: null,
      faltanParaOptimo: null,
      excedenteSobreOptimo: null,
      errores
    };
  }
  return {
    ok: true,
    cantidad,
    minimo,
    optimo,
    estado: cantidad < minimo
      ? "critico"
      : cantidad < optimo ? "bajo_optimo" : "optimo",
    faltanParaMinimo: Math.max(0, minimo - cantidad),
    faltanParaOptimo: Math.max(0, optimo - cantidad),
    excedenteSobreOptimo: Math.max(0, cantidad - optimo),
    errores: []
  };
};

// Contrato numérico explicativo: la proyección por identidad debe decidir antes
// qué Extras aportan. Esta función no es un segundo motor de headcount.
export const crearMetricasDotacionSupervision = ({
  previstosBase,
  bajasConocidas,
  baseDisponible,
  extrasRegistrados,
  extrasQueAportan,
  asistenciaRegistrada
} = {}) => ({
  previstosBase,
  dotacionPrevistaOperativa:
    Number.isInteger(baseDisponible) && Number.isInteger(extrasQueAportan)
      ? baseDisponible + extrasQueAportan
      : null,
  bajasConocidas,
  baseDisponible,
  extrasRegistrados,
  extrasQueAportan,
  asistenciaRegistrada: {
    presentes: asistenciaRegistrada?.presentes,
    ausentes: asistenciaRegistrada?.ausentes,
    pendientes: asistenciaRegistrada?.pendientes
  }
});
