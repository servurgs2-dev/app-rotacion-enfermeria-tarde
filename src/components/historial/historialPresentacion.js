import { TURNOS } from "../../config/turnos.js";

export const ACCIONES_HISTORIAL = Object.freeze({
  linea_base: "Línea base",
  creacion: "Creación",
  actualizacion_cas: "Actualización",
  restauracion: "Restauración"
});

export const SECCIONES_HISTORIAL = Object.freeze({
  personal: "Personal",
  planillas: "Planillas",
  calendario: "Calendario",
  licencias: "Licencias",
  certificaciones: "Certificaciones"
});

export const formatearAccionHistorial = (accion) =>
  ACCIONES_HISTORIAL[accion] ?? "Acción no identificada";

export const formatearSeccionHistorial = (seccion) =>
  SECCIONES_HISTORIAL[seccion] ?? String(seccion || "Otra sección");

export const formatearTurnoHistorial = (turnoId) =>
  TURNOS[turnoId]?.nombre ?? String(turnoId || "");

export const formatearAutorHistorial = (registro) => {
  const usuario = String(registro?.usuarioSnapshot ?? "").trim();
  if (usuario) return usuario;
  return registro?.accion === "linea_base"
    ? "Sistema"
    : "Cuenta no identificada";
};

export const formatearFechaHistorial = (valor) => {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-UY", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(fecha);
};

export const convertirFechaLocalAIso = (fechaCivil, { finDelDia = false } = {}) => {
  if (!fechaCivil) return null;
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaCivil);
  if (!coincidencia) throw new TypeError("La fecha debe tener formato YYYY-MM-DD.");
  const [, anio, mes, dia] = coincidencia.map(Number);
  const fecha = new Date(
    anio,
    mes - 1,
    dia,
    finDelDia ? 23 : 0,
    finDelDia ? 59 : 0,
    finDelDia ? 59 : 0,
    finDelDia ? 999 : 0
  );
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    throw new RangeError("La fecha seleccionada no es válida.");
  }
  return fecha.toISOString();
};

export const crearFiltrosConsultaHistorial = (filtros) => {
  const fechaDesde = convertirFechaLocalAIso(filtros.fechaDesde) || undefined;
  const fechaHasta =
    convertirFechaLocalAIso(filtros.fechaHasta, { finDelDia: true }) || undefined;
  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
    throw new RangeError("La fecha Desde no puede ser posterior a la fecha Hasta.");
  }
  return {
    turno: filtros.turno || undefined,
    mes: filtros.mes || undefined,
    accion: filtros.accion || undefined,
    usuarioId: filtros.usuarioId || undefined,
    fechaDesde,
    fechaHasta
  };
};

export const unirRegistrosHistorial = (existentes, nuevos) => {
  const porId = new Map(
    [...(existentes ?? []), ...(nuevos ?? [])].map((item) => [item.id, item])
  );
  return [...porId.values()];
};

const sanitizarNombre = (valor) =>
  String(valor ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "historial";

export const crearNombreSnapshotHistorial = (revision) =>
  `app-urgencias-historial-${sanitizarNombre(revision.turno)}-${
    sanitizarNombre(revision.mes)
  }-revision-${sanitizarNombre(revision.revision)}.json`;

export const crearSnapshotDescargable = (revision) => ({
  tipo: "snapshot_historial_app_urgencias",
  turno: revision.turno,
  mes: revision.mes,
  revision: revision.revision,
  revisionAnterior: revision.revisionAnterior,
  accion: revision.accion,
  createdAt: revision.createdAt,
  data: revision.data
});
