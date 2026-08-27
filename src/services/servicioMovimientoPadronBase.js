const TURNOS = new Set(["manana", "tarde", "vespertino", "noche"]);
const CODIGOS_BACKEND = Object.freeze([
  "PERMISO_SUPERVISION_REQUERIDO",
  "MES_INVALIDO",
  "MES_HISTORICO_PROTEGIDO",
  "TURNO_ORIGEN_INVALIDO",
  "TURNO_DESTINO_INVALIDO",
  "TURNOS_IGUALES",
  "ESTADO_ORIGEN_INEXISTENTE",
  "ESTADO_DESTINO_INEXISTENTE",
  "PERSONA_NO_IDENTIFICABLE",
  "PERSONA_NO_ENCONTRADA_EN_ORIGEN",
  "PERSONA_DUPLICADA_EN_ORIGEN",
  "PERSONA_YA_EXISTE_EN_DESTINO",
  "PERSONA_DUPLICADA_ENTRE_TURNOS",
  "PERSONA_CATEGORIA_INVALIDA",
  "REVISION_ORIGEN_CONFLICTO",
  "REVISION_DESTINO_CONFLICTO",
  "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE",
  "REFERENCIA_LEGACY_AMBIGUA",
  "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES"
]);

const MENSAJES = Object.freeze({
  PERMISO_SUPERVISION_REQUERIDO: "Sólo Supervisión puede cambiar el turno base.",
  MES_INVALIDO: "El mes seleccionado no es válido.",
  MES_HISTORICO_PROTEGIDO: "No se puede cambiar el turno base en un mes histórico.",
  TURNO_ORIGEN_INVALIDO: "El turno de origen no es válido.",
  TURNO_DESTINO_INVALIDO: "El turno de destino no es válido.",
  TURNOS_IGUALES: "El turno de destino debe ser diferente del turno de origen.",
  ESTADO_ORIGEN_INEXISTENTE: "No existe el estado mensual del turno de origen.",
  ESTADO_DESTINO_INEXISTENTE: "No existe el estado mensual del turno de destino.",
  PERSONA_NO_IDENTIFICABLE: "La identidad de la persona no es válida.",
  PERSONA_NO_ENCONTRADA_EN_ORIGEN: "La persona ya no pertenece al turno de origen.",
  PERSONA_DUPLICADA_EN_ORIGEN: "La persona está duplicada en el turno de origen.",
  PERSONA_YA_EXISTE_EN_DESTINO: "La persona ya pertenece al turno de destino.",
  PERSONA_DUPLICADA_ENTRE_TURNOS: "La persona está duplicada entre varios turnos.",
  PERSONA_CATEGORIA_INVALIDA: "La categoría de la persona no es válida.",
  REVISION_ORIGEN_CONFLICTO: "Los datos cambiaron mientras realizabas la operación. Recargá e intentá nuevamente.",
  REVISION_DESTINO_CONFLICTO: "Los datos cambiaron mientras realizabas la operación. Recargá e intentá nuevamente.",
  REFERENCIA_LEGACY_OPERATIVA_PENDIENTE: "La persona tiene referencias antiguas que deben actualizarse antes de cambiar su turno base.",
  REFERENCIA_LEGACY_AMBIGUA: "Hay referencias antiguas ambiguas para esta persona.",
  REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES: "La persona tiene registros operativos del Calendario que deben resolverse antes de cambiar su turno base."
});

const crearError = (mensaje, codigo, original) => {
  const error = new Error(mensaje);
  error.codigo = codigo;
  error.mensajeTecnico = original?.message || mensaje;
  error.esErrorMovimientoPadronBase = true;
  if (original !== undefined) error.errorOriginal = original;
  return error;
};

const textoRequerido = (valor, codigo, mensaje) => {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) throw crearError(mensaje, codigo);
  return texto;
};

export const normalizarRevisionMovimientoPadronBase = (revision, codigo = "REVISION_INVALIDA") => {
  const valor = typeof revision === "bigint"
    ? revision.toString()
    : typeof revision === "number" && Number.isSafeInteger(revision)
      ? String(revision)
      : typeof revision === "string" ? revision.trim() : "";
  if (!/^\d+$/.test(valor)) {
    throw crearError("La revisión debe ser un entero decimal no negativo.", codigo);
  }
  return valor.replace(/^0+(?=\d)/, "");
};

export const obtenerMensajeMovimientoPadronBase = (codigo) =>
  MENSAJES[codigo] || "No se pudo cambiar el turno base de la persona.";

const obtenerCodigoBackend = (error) => {
  const textos = [error?.codigo, error?.message, error?.details, error?.hint]
    .filter((valor) => typeof valor === "string");
  return CODIGOS_BACKEND.find((codigo) => textos.some((texto) => texto.includes(codigo))) ||
    (typeof error?.code === "string" && CODIGOS_BACKEND.includes(error.code)
      ? error.code
      : "ERROR_MOVIMIENTO_PADRON_BASE");
};

const normalizarRespuesta = (respuesta, contexto) => {
  const contenido = Array.isArray(respuesta) ? respuesta[0] : respuesta;
  if (!contenido || typeof contenido !== "object" || contenido.ok !== true) {
    throw crearError(
      "La RPC de movimiento devolvió una respuesta inválida.",
      "RESPUESTA_MOVIMIENTO_INVALIDA"
    );
  }
  const resultado = {
    ok: true,
    mes: textoRequerido(contenido.mes, "RESPUESTA_MOVIMIENTO_INVALIDA", "La respuesta no incluye el mes."),
    personaId: textoRequerido(contenido.personaId, "RESPUESTA_MOVIMIENTO_INVALIDA", "La respuesta no incluye la persona."),
    turnoOrigen: textoRequerido(contenido.turnoOrigen, "RESPUESTA_MOVIMIENTO_INVALIDA", "La respuesta no incluye el turno de origen."),
    turnoDestino: textoRequerido(contenido.turnoDestino, "RESPUESTA_MOVIMIENTO_INVALIDA", "La respuesta no incluye el turno de destino."),
    revisionOrigen: normalizarRevisionMovimientoPadronBase(contenido.revisionOrigen),
    revisionDestino: normalizarRevisionMovimientoPadronBase(contenido.revisionDestino),
    estadoOrigen: contenido.estadoOrigen,
    estadoDestino: contenido.estadoDestino
  };
  if (resultado.mes !== contexto.mes || resultado.personaId !== contexto.personaId ||
    resultado.turnoOrigen !== contexto.turnoOrigen ||
    resultado.turnoDestino !== contexto.turnoDestino ||
    !resultado.estadoOrigen || typeof resultado.estadoOrigen !== "object" ||
    Array.isArray(resultado.estadoOrigen) || !resultado.estadoDestino ||
    typeof resultado.estadoDestino !== "object" || Array.isArray(resultado.estadoDestino)) {
    throw crearError(
      "La respuesta remota no coincide con la operación solicitada.",
      "RESPUESTA_MOVIMIENTO_INVALIDA"
    );
  }
  return resultado;
};

export const crearServicioMovimientoPadronBase = (repositorio) => {
  if (!repositorio || typeof repositorio.moverPersonaPadronBaseTurnoMes !== "function") {
    throw new Error("El repositorio de movimiento de padrón base es requerido.");
  }

  const moverPersonaPadronBaseTurnoMes = async ({
    mes,
    personaId,
    turnoOrigen,
    turnoDestino,
    revisionOrigenEsperada,
    revisionDestinoEsperada
  } = {}) => {
    const contexto = {
      mes: textoRequerido(mes, "MES_INVALIDO", "El mes es requerido."),
      personaId: textoRequerido(personaId, "PERSONA_NO_IDENTIFICABLE", "La persona es requerida."),
      turnoOrigen: textoRequerido(turnoOrigen, "TURNO_ORIGEN_INVALIDO", "El turno de origen es requerido."),
      turnoDestino: textoRequerido(turnoDestino, "TURNO_DESTINO_INVALIDO", "El turno de destino es requerido.")
    };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(contexto.mes)) {
      throw crearError("El mes no tiene formato YYYY-MM.", "MES_INVALIDO");
    }
    if (!TURNOS.has(contexto.turnoOrigen)) {
      throw crearError("El turno de origen no es válido.", "TURNO_ORIGEN_INVALIDO");
    }
    if (!TURNOS.has(contexto.turnoDestino)) {
      throw crearError("El turno de destino no es válido.", "TURNO_DESTINO_INVALIDO");
    }
    if (contexto.turnoOrigen === contexto.turnoDestino) {
      throw crearError("Los turnos deben ser diferentes.", "TURNOS_IGUALES");
    }
    const revisionOrigen = normalizarRevisionMovimientoPadronBase(
      revisionOrigenEsperada,
      "REVISION_ORIGEN_INVALIDA"
    );
    const revisionDestino = normalizarRevisionMovimientoPadronBase(
      revisionDestinoEsperada,
      "REVISION_DESTINO_INVALIDA"
    );
    try {
      const respuesta = await repositorio.moverPersonaPadronBaseTurnoMes({
        ...contexto,
        revisionOrigenEsperada: revisionOrigen,
        revisionDestinoEsperada: revisionDestino
      });
      return normalizarRespuesta(respuesta, contexto);
    } catch (error) {
      if (error?.esErrorMovimientoPadronBase) throw error;
      const codigo = obtenerCodigoBackend(error);
      throw crearError(obtenerMensajeMovimientoPadronBase(codigo), codigo, error);
    }
  };

  return { moverPersonaPadronBaseTurnoMes };
};
