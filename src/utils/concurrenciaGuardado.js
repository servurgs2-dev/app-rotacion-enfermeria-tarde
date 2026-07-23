const clonarSerializable = (valor) =>
  valor === null || valor === undefined
    ? valor ?? null
    : JSON.parse(JSON.stringify(valor));

export const crearMetadatosConcurrenciaDesdeCarga = (resultado) => ({
  revisionConfirmada: String(resultado?.revision ?? "0"),
  updatedAtConfirmado: resultado?.updatedAt ?? null,
  existeRemoto: resultado?.existeRemoto === true,
  origen: resultado?.origen ?? null,
  estado: "cargado",
  error: null,
  conflicto: null
});

export const marcarConcurrenciaPendiente = (metadatos) => ({
  ...metadatos,
  estado: "pendiente",
  error: null
});

export const marcarConcurrenciaGuardando = (metadatos) => ({
  ...metadatos,
  estado: "guardando",
  error: null
});

export const aplicarExitoConcurrencia = (
  metadatos,
  resultado,
  { hayCambiosPosteriores = false } = {}
) => ({
  ...metadatos,
  revisionConfirmada: String(resultado.revision),
  updatedAtConfirmado: resultado.updatedAt ?? null,
  existeRemoto: true,
  estado: hayCambiosPosteriores ? "pendiente" : "guardado",
  error: null,
  conflicto: null
});

export const aplicarConflictoConcurrencia = (
  metadatos,
  resultado,
  estadoLocal
) => ({
  ...metadatos,
  estado: "conflicto",
  error: null,
  conflicto: {
    revisionRemota: String(resultado.revision),
    updatedAtRemoto: resultado.updatedAt ?? null,
    existeRemoto: resultado.existeRemoto === true,
    estadoRemoto: clonarSerializable(resultado.estadoRemoto),
    estadoLocal: clonarSerializable(estadoLocal)
  }
});

export const aplicarErrorConcurrencia = (metadatos, error) => ({
  ...metadatos,
  estado: "error",
  error: error instanceof Error ? error.message : String(error),
  conflicto: null
});

export const aplicarErrorResolucionConflicto = (metadatos, error) => ({
  ...metadatos,
  estado: "conflicto",
  error: error instanceof Error ? error.message : String(error),
  conflicto: clonarSerializable(metadatos?.conflicto)
});

export const actualizarEstadoLocalConflicto = (metadatos, estadoLocal) =>
  metadatos?.conflicto
    ? {
        ...metadatos,
        conflicto: {
          ...metadatos.conflicto,
          estadoLocal: clonarSerializable(estadoLocal)
        }
      }
    : metadatos;

export const obtenerRevisionEsperada = (metadatos) => {
  const revision = String(metadatos?.revisionConfirmada ?? "");
  if (!/^\d+$/.test(revision)) {
    throw new Error("No hay una revisión confirmada para guardar este turno y mes.");
  }
  return revision;
};

export const claveBloqueadaPorConflicto = (metadatos) =>
  Boolean(metadatos?.conflicto);

export const hayPendienteMasNuevo = (pendienteEnviado, pendienteActual) =>
  Boolean(
    pendienteActual &&
    pendienteEnviado &&
    pendienteActual.secuenciaLocal > pendienteEnviado.secuenciaLocal
  );

export const esRespuestaDeClave = (claveEsperada, claveRespuesta) =>
  Boolean(claveEsperada && claveEsperada === claveRespuesta);

const TRADUCCION_ESTADO_GUARDADO = Object.freeze({
  cargado: "saved",
  pendiente: "pending",
  guardando: "saving",
  guardado: "saved",
  error: "error",
  conflicto: "conflict",
  loading: "loading",
  pending: "pending",
  saving: "saving",
  saved: "saved",
  conflict: "conflict"
});

export const normalizarEstadoGuardadoVisible = (
  estadoMetadatos,
  estadoGlobal = "saved"
) =>
  TRADUCCION_ESTADO_GUARDADO[estadoMetadatos] ||
  TRADUCCION_ESTADO_GUARDADO[estadoGlobal] ||
  "saved";
