import {
  agregarExtraALista,
  configurarTipoExtra,
  eliminarExtraDelDia,
  ORIGENES_EXTRA,
  obtenerIdPersona,
  TIPOS_EXTRA
} from "./extrasPersonas.js";
import {
  crearRegistroNoDisponible,
  MOTIVOS_NO_DISPONIBLE,
  reemplazarRegistroNoDisponible
} from "./noDisponiblesMotivos.js";
import {
  quitarPersonaDeListaReferencias,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { personasCompartenIdentidad } from "./identidadPersonas.js";
import { normalizar } from "./texto.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];
const texto = (valor) => String(valor ?? "").trim();

export const obtenerSectorOperativoPersona = ({
  asignaciones,
  persona
} = {}) => {
  if (!persona) return "";
  const fila = lista(asignaciones).find((item) =>
    item?.tipo !== "divider" &&
    item?.tipo !== "turnante" &&
    !/^T\d+$/i.test(texto(item?.nombre)) &&
    normalizar(item?.nombre) !== "SIN ASIGNAR" &&
    personasCompartenIdentidad(item?.enfermero, persona)
  );
  return texto(fila?.nombre);
};

export const desvincularExtraComoRefuerzo = (extra) => {
  if (!extra) return extra;
  const {
    personaCubiertaId,
    personaCubiertaNombre,
    sectorCubiertoNombre,
    vinculacionCambioOtroTurno,
    ...resto
  } = extra;
  void personaCubiertaId;
  void personaCubiertaNombre;
  void sectorCubiertoNombre;
  void vinculacionCambioOtroTurno;
  return { ...resto, tipoExtra: TIPOS_EXTRA.REFUERZO };
};

export const obtenerExtrasCompatiblesCambioOtroTurno = ({
  extras,
  titular,
  personal = []
} = {}) => lista(extras).filter((extra) => {
  if (!obtenerIdPersona(extra) || personasCompartenIdentidad(extra, titular)) return false;
  if (extra.categoria && titular?.categoria && extra.categoria !== titular.categoria) return false;
  if (extra.tipoExtra !== TIPOS_EXTRA.COBERTURA) return true;
  const cubierta = resolverPersonaDesdeReferencia({
    personaId: extra.personaCubiertaId,
    nombre: extra.personaCubiertaNombre
  }, personal);
  return Boolean(cubierta && personasCompartenIdentidad(cubierta, titular));
});

export const vincularCambioOtroTurno = ({
  calendarioCategoria,
  fecha,
  titular,
  sector,
  extra,
  detalle = "",
  personal = []
} = {}) => {
  if (!calendarioCategoria || !fecha || !titular || !extra) {
    return { calendario: calendarioCategoria, error: "No se pudo vincular la cobertura." };
  }
  const extrasFecha = lista(calendarioCategoria.extras?.[fecha]);
  const noDisponiblesFecha = lista(calendarioCategoria.noDisponibles?.[fecha]);
  const extraId = obtenerIdPersona(extra);
  const registroAnterior = noDisponiblesFecha.find((registro) => {
    const persona = resolverPersonaDesdeReferencia(registro, personal);
    return persona && personasCompartenIdentidad(persona, titular);
  });

  // Al editar, el Extra anterior queda como refuerzo; nunca conserva una relación fantasma.
  const extrasDesvinculados = extrasFecha.map((actual) =>
    registroAnterior?.personaCoberturaId &&
    String(registroAnterior.personaCoberturaId) !== extraId &&
    obtenerIdPersona(actual) === String(registroAnterior.personaCoberturaId)
      ? desvincularExtraComoRefuerzo(actual)
      : actual
  );
  const extraExistente = extrasDesvinculados.find(
    (actual) => obtenerIdPersona(actual) === extraId
  );
  if (
    extraExistente?.tipoExtra === TIPOS_EXTRA.COBERTURA &&
    texto(extraExistente.personaCubiertaId) &&
    texto(extraExistente.personaCubiertaId) !== texto(titular.id)
  ) {
    return {
      calendario: calendarioCategoria,
      error: `${extraExistente.nombre} ya está vinculado a otro titular.`
    };
  }
  const baseExtra = extraExistente || extra;
  const configurado = configurarTipoExtra({
    extra: baseExtra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: titular,
    sectorCubierto: sector,
    extrasDia: extrasDesvinculados.filter((actual) => obtenerIdPersona(actual) !== extraId),
    personal
  });
  if (!configurado.extra) return { calendario: calendarioCategoria, error: configurado.error };

  const extraVinculado = {
    ...configurado.extra,
    origenExtra: ORIGENES_EXTRA.PERSONAL_OTRO_TURNO,
    vinculacionCambioOtroTurno: true
  };
  const registroResultado = crearRegistroNoDisponible({
    persona: titular,
    motivo: MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO,
    detalle,
    personaCobertura: extraVinculado,
    sectorOrigen: sector,
    creadoEn: registroAnterior?.creadoEn
  });
  if (!registroResultado.registro) {
    return { calendario: calendarioCategoria, error: registroResultado.error };
  }

  const sinExtraActual = extrasDesvinculados.filter(
    (actual) => obtenerIdPersona(actual) !== extraId
  );
  return {
    calendario: {
      ...calendarioCategoria,
      extras: {
        ...(calendarioCategoria.extras || {}),
        [fecha]: agregarExtraALista(sinExtraActual, extraVinculado)
      },
      noDisponibles: {
        ...(calendarioCategoria.noDisponibles || {}),
        [fecha]: reemplazarRegistroNoDisponible({
          lista: noDisponiblesFecha,
          persona: titular,
          registro: registroResultado.registro,
          personal
        })
      }
    },
    extra: extraVinculado,
    registro: registroResultado.registro,
    error: ""
  };
};

export const esCambioOtroTurnoVinculado = ({
  persona,
  registros,
  extras,
  personal = []
} = {}) => lista(registros).some((registro) => {
  if (
    registro?.motivo !== MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO ||
    !texto(registro?.personaCoberturaId)
  ) return false;
  const titular = resolverPersonaDesdeReferencia(registro, personal);
  if (!titular || !personasCompartenIdentidad(titular, persona)) return false;
  return lista(extras).some((extra) =>
    obtenerIdPersona(extra) === texto(registro.personaCoberturaId) &&
    extra?.tipoExtra === TIPOS_EXTRA.COBERTURA &&
    texto(extra?.personaCubiertaId) === texto(titular.id)
  );
});

export const eliminarExtraVinculadoCambioOtroTurno = ({
  calendarioCategoria,
  fecha,
  extra,
  personal = []
} = {}) => {
  const extraId = obtenerIdPersona(extra);
  const calendarioSinExtra = eliminarExtraDelDia({
    calendarioCategoria,
    fecha,
    extra,
    personal
  });
  const registros = lista(calendarioSinExtra?.noDisponibles?.[fecha]);
  const actualizados = registros.map((registro) => {
    if (String(registro?.personaCoberturaId || "") !== extraId) return registro;
    return { ...registro, personaCoberturaId: null, personaCoberturaNombre: "" };
  });
  return actualizados.some((registro, indice) => registro !== registros[indice])
    ? {
        ...calendarioSinExtra,
        noDisponibles: {
          ...(calendarioSinExtra.noDisponibles || {}),
          [fecha]: actualizados
        }
      }
    : calendarioSinExtra;
};

export const eliminarNoDisponibleVinculado = ({
  calendarioCategoria,
  fecha,
  titular,
  accionExtra,
  personal = []
} = {}) => {
  const registros = lista(calendarioCategoria?.noDisponibles?.[fecha]);
  const registro = registros.find((actual) => {
    const persona = resolverPersonaDesdeReferencia(actual, personal);
    return persona && personasCompartenIdentidad(persona, titular);
  });
  const extraId = texto(registro?.personaCoberturaId);
  const extra = lista(calendarioCategoria?.extras?.[fecha]).find(
    (actual) => obtenerIdPersona(actual) === extraId
  );
  let resultado = {
    ...calendarioCategoria,
    noDisponibles: {
      ...(calendarioCategoria.noDisponibles || {}),
      [fecha]: quitarPersonaDeListaReferencias(registros, titular, personal)
    }
  };
  if (!extra) return resultado;
  if (accionExtra === "eliminar") {
    return eliminarExtraDelDia({ calendarioCategoria: resultado, fecha, extra, personal });
  }
  const extrasActualizados = lista(resultado.extras?.[fecha]).map((actual) =>
    obtenerIdPersona(actual) === extraId ? desvincularExtraComoRefuerzo(actual) : actual
  );
  return {
    ...resultado,
    extras: { ...(resultado.extras || {}), [fecha]: extrasActualizados }
  };
};
