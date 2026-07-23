const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const CLAVES_SENSIBLES = new Set([
  "password",
  "contraseña",
  "token",
  "access_token",
  "refresh_token",
  "session",
  "sesion"
]);
const quitarDatosAutenticacion = (valor) => {
  if (Array.isArray(valor)) return valor.map(quitarDatosAutenticacion);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([clave]) => !CLAVES_SENSIBLES.has(clave.toLowerCase()))
      .map(([clave, contenido]) => [clave, quitarDatosAutenticacion(contenido)])
  );
};

export const interpretarClaveConflicto = (clave) => {
  if (typeof clave !== "string") return null;
  const coincidencia = /^(noche|manana|tarde|vespertino)\|(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(
    clave
  );
  return coincidencia
    ? { turnoId: coincidencia[1], mes: coincidencia[2] }
    : null;
};

export const existeCopiaLocalConflicto = (conflicto) =>
  Boolean(
    conflicto?.estadoLocal &&
    typeof conflicto.estadoLocal === "object" &&
    !Array.isArray(conflicto.estadoLocal)
  );

export const crearRespaldoConflicto = ({
  turnoId,
  mes,
  conflicto,
  creadoEn = new Date().toISOString()
}) => {
  if (!existeCopiaLocalConflicto(conflicto)) {
    throw new Error("No hay una copia local válida para respaldar.");
  }
  return {
    tipo: "respaldo_conflicto_app_urgencias",
    creadoEn,
    turno: turnoId,
    mes,
    revisionRemotaDetectada: String(conflicto.revisionRemota ?? "0"),
    updatedAtRemoto: conflicto.updatedAtRemoto ?? null,
    estadoLocal: quitarDatosAutenticacion(clonar(conflicto.estadoLocal))
  };
};

export const crearNombreRespaldoConflicto = ({
  turnoId,
  mes,
  creadoEn = new Date().toISOString()
}) => {
  const contexto = `${turnoId}-${mes}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const marca = creadoEn.replace(/\D/g, "").slice(0, 14);
  return `app-urgencias-conflicto-${contexto}-${marca}.json`;
};

export const prepararMetadatosUsarServidor = (resultado) => ({
  revisionConfirmada: String(resultado?.revision ?? "0"),
  updatedAtConfirmado: resultado?.updatedAt ?? null,
  existeRemoto: resultado?.existeRemoto === true,
  origen: resultado?.origen ?? null,
  estado: "guardado",
  error: null,
  conflicto: null
});

export const prepararResolucionConservarLocal = (metadatos) => {
  if (!existeCopiaLocalConflicto(metadatos?.conflicto)) {
    throw new Error("No hay una copia local válida para guardar.");
  }
  const revisionEsperada = metadatos.conflicto.existeRemoto
    ? String(metadatos.conflicto.revisionRemota)
    : "0";
  return {
    revisionEsperada,
    estadoLocal: clonar(metadatos.conflicto.estadoLocal),
    metadatos: {
      ...metadatos,
      estado: "resolviendo_conflicto",
      error: null,
      conflicto: clonar(metadatos.conflicto)
    }
  };
};

export const formatearFechaRemota = (fechaIso) => {
  if (typeof fechaIso !== "string" || !fechaIso.trim()) return "No registrada";
  const fecha = new Date(fechaIso);
  return Number.isNaN(fecha.getTime())
    ? "No registrada"
    : fecha.toLocaleString("es-UY");
};

export const listarConflictosPendientes = (metadatosPorClave, turnos) =>
  Object.entries(metadatosPorClave || {})
    .filter(([, metadatos]) => Boolean(metadatos?.conflicto))
    .map(([clave]) => {
      const contexto = interpretarClaveConflicto(clave);
      return contexto
        ? {
            clave,
            ...contexto,
            turnoNombre: turnos?.[contexto.turnoId]?.nombre || contexto.turnoId
          }
        : null;
    })
    .filter(Boolean);
