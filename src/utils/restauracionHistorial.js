import { puedeMutarEstadoMensual } from "./proteccionTemporalMensual.js";

const REVISION_POSITIVA = /^[1-9]\d*$/;

export const normalizarCargaVersionada = (resultado) => {
  if (!resultado || typeof resultado !== "object") {
    throw new Error("La carga versionada no devolvió un resultado válido.");
  }
  const existeRemoto = resultado.existeRemoto === true;
  const tieneEstado = existeRemoto || resultado.existe === true;
  if (tieneEstado && (!resultado.estado || typeof resultado.estado !== "object")) {
    throw new Error("La carga versionada indicó un estado existente sin datos válidos.");
  }
  return {
    ...resultado,
    existe: tieneEstado,
    existeRemoto,
    tieneEstado,
    estado: tieneEstado ? resultado.estado : null
  };
};

export const seleccionarEstadoCargaVersionada = (resultado, crearEstadoVacio) => {
  const normalizado = normalizarCargaVersionada(resultado);
  return {
    carga: normalizado,
    estado: normalizado.tieneEstado
      ? normalizado.estado
      : crearEstadoVacio()
  };
};

export const evaluarDisponibilidadRestauracion = ({
  mes,
  mesReferencia,
  esSupervision,
  coincideContexto,
  metadatos,
  estadoCargado,
  hayCambiosLocales,
  restauracionEnCurso,
  bloqueadaTrasRestauracion = false
}) => {
  if (!esSupervision) {
    return { permitida: false, codigo: "sin_permiso", mensaje: "No tenés permiso para restaurar revisiones." };
  }
  if (!coincideContexto) {
    return {
      permitida: false,
      codigo: "otro_contexto",
      mensaje: "Para restaurar esta revisión, primero abrí ese turno y mes en la aplicación."
    };
  }
  const autorizacionTemporal = puedeMutarEstadoMensual({
    mes,
    mesReferencia,
    existeRemoto: metadatos?.existeRemoto === true
  });
  if (!autorizacionTemporal) {
    return {
      permitida: false,
      codigo: metadatos?.existeRemoto === true
        ? "periodo_protegido"
        : "mes_inexistente",
      mensaje: metadatos?.existeRemoto === true
        ? "Este período está fuera de la ventana habilitada para restauraciones."
        : "No existe un estado mensual remoto que pueda restaurarse."
    };
  }
  if (bloqueadaTrasRestauracion) {
    return {
      permitida: false,
      codigo: "recarga_obligatoria",
      mensaje: "La restauración se completó en el servidor, pero esta pantalla debe recargarse antes de continuar."
    };
  }
  if (restauracionEnCurso) {
    return { permitida: false, codigo: "restaurando", mensaje: "Ya hay una restauración en curso." };
  }
  if (!estadoCargado || !metadatos) {
    return {
      permitida: false,
      codigo: "no_cargado",
      mensaje: "El estado local todavía no terminó de cargar."
    };
  }
  if (metadatos.conflicto) {
    return {
      permitida: false,
      codigo: "conflicto",
      mensaje: "Resolvé el conflicto de edición pendiente antes de restaurar."
    };
  }
  if (metadatos.estado === "pendiente" || metadatos.estado === "guardando" || hayCambiosLocales) {
    return {
      permitida: false,
      codigo: "guardado_pendiente",
      mensaje: "Esperá a que finalice el guardado antes de restaurar una revisión."
    };
  }
  if (metadatos.estado === "error") {
    return {
      permitida: false,
      codigo: "error_guardado",
      mensaje: "Resolvé el error de guardado antes de restaurar una revisión."
    };
  }
  const revision = String(metadatos.revisionConfirmada ?? "");
  if (!REVISION_POSITIVA.test(revision)) {
    return {
      permitida: false,
      codigo: "revision_desconocida",
      mensaje: "No se conoce la revisión actual del servidor. Recargá el estado e intentá nuevamente."
    };
  }
  return { permitida: true, codigo: "disponible", mensaje: "", revisionConfirmada: revision };
};

export const crearPreflightRestauracion = ({
  revisionHistorica,
  estadoOperativo,
  comparar
}) => {
  if (!revisionHistorica?.data || !estadoOperativo?.estado || typeof comparar !== "function") {
    throw new Error("No se pudo preparar el impacto de la restauración.");
  }
  const cargaNormalizada = normalizarCargaVersionada(estadoOperativo);
  const revisionEsperada = String(cargaNormalizada.revision ?? "");
  if (!cargaNormalizada.existeRemoto || !REVISION_POSITIVA.test(revisionEsperada)) {
    throw new Error("El estado operativo actual no existe o no tiene una revisión válida.");
  }
  const impacto = comparar(cargaNormalizada.estado, revisionHistorica.data);
  const sinCambios =
    impacto?.analisisIncompleto !== true &&
    Array.isArray(impacto?.seccionesCambiadas) &&
    impacto.seccionesCambiadas.length === 0 &&
    impacto?.totales?.agregados === 0 &&
    impacto?.totales?.eliminados === 0 &&
    impacto?.totales?.modificados === 0;
  return {
    revisionEsperada,
    updatedAt: cargaNormalizada.updatedAt ?? null,
    impacto,
    sinCambios
  };
};

export const validarConfirmacionRestauracion = ({
  aceptaReemplazo,
  texto,
  analisisIncompleto,
  aceptaAnalisisParcial
}) =>
  aceptaReemplazo === true &&
  String(texto ?? "").trim() === "RESTAURAR" &&
  (!analisisIncompleto || aceptaAnalisisParcial === true);

export const validarContextoAdopcionRestauracion = ({
  inicio,
  clave,
  sesionActual,
  turnoActual,
  mesActual,
  turnoEsperado,
  mesEsperado
}) =>
  Boolean(
    inicio?.clave === clave &&
    inicio.sesionId === sesionActual &&
    turnoActual === turnoEsperado &&
    mesActual === mesEsperado
  );

export const debeMantenerBloqueoRestauracion = ({
  rpcConfirmada,
  adopcionVerificada
}) => rpcConfirmada === true && adopcionVerificada !== true;

export const validarRespuestaRestaurada = ({
  resultadoRestauracion,
  cargaServidor,
  turnoEsperado,
  mesEsperado
}) => {
  const cargaNormalizada = normalizarCargaVersionada(cargaServidor);
  if (
    resultadoRestauracion?.tipo !== "restaurado" ||
    cargaNormalizada.existeRemoto !== true ||
    cargaNormalizada.estado === null
  ) {
    throw new Error("No se pudo verificar el estado restaurado.");
  }
  const revision = String(cargaNormalizada.revision ?? "");
  if (
    resultadoRestauracion.turno !== turnoEsperado ||
    resultadoRestauracion.mes !== mesEsperado ||
    revision !== String(resultadoRestauracion.revision)
  ) {
    throw new Error("La recarga no coincide con la restauración confirmada.");
  }
  return { ...cargaNormalizada, revision };
};
