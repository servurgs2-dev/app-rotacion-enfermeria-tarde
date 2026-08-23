import { TURNOS } from "../config/turnos.js";
import {
  crearNovedadesLegacy,
  filtrarNovedadesVisibles,
  obtenerConfiguracionTipoNovedad,
  obtenerEtiquetaTipoNovedad,
  TIPOS_NOVEDAD_PERSONAL
} from "./novedadesPersonal.js";

export const TIPOS_NOVEDAD_SUPERVISION = Object.freeze([
  TIPOS_NOVEDAD_PERSONAL.LICENCIA,
  TIPOS_NOVEDAD_PERSONAL.CERTIFICACION,
  TIPOS_NOVEDAD_PERSONAL.SUSPENSION,
  TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO,
  TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO,
  TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA
]);

const ORDEN_TURNOS = Object.freeze(Object.keys(TURNOS));
const ORDEN_CATEGORIAS = Object.freeze(["licenciado", "enfermero"]);
const TIPOS_PERMITIDOS = new Set(TIPOS_NOVEDAD_SUPERVISION);
const texto = (valor) => String(valor ?? "").trim();

const fechaIncluida = (novedad, fecha) =>
  Boolean(fecha && novedad?.fechaDesde <= fecha && fecha <= (novedad?.fechaHasta || novedad?.fechaDesde));

const identidadEstable = (novedad, indice) => {
  const id = texto(novedad?.id);
  if (id) return `${novedad?.origen || "novedad"}:${novedad?.turno || "sin-turno"}:${id}`;
  return [
    novedad?.origen || "novedad",
    novedad?.turno || "sin-turno",
    novedad?.personaId || "sin-persona",
    novedad?.tipo || "sin-tipo",
    novedad?.fechaDesde || "sin-fecha",
    novedad?.fechaHasta || "sin-fecha-hasta",
    indice
  ].join(":");
};

const normalizarParaSupervision = (novedad, indice) => {
  const configuracion = obtenerConfiguracionTipoNovedad(novedad.tipo);
  return {
    ...novedad,
    idEstable: identidadEstable(novedad, indice),
    personaId: texto(novedad.personaId) || null,
    personaNombre: texto(novedad.personaNombre) || "Persona no disponible",
    turno: texto(novedad.turno) || null,
    turnoNombre: TURNOS[novedad.turno]?.nombre || "Sin turno",
    categoria: texto(novedad.categoria) || null,
    categoriaEtiqueta: novedad.categoria === "licenciado"
      ? "Licenciado/a"
      : novedad.categoria === "enfermero" ? "Enfermero/a" : "Sin categor\u00eda",
    tipoEtiqueta: obtenerEtiquetaTipoNovedad(novedad.tipo),
    clasificacion: configuracion?.afectaDisponibilidad ? "ausencia" : "informativa",
    observacion: texto(novedad.observacion),
    datos: novedad.datos && typeof novedad.datos === "object" ? { ...novedad.datos } : {}
  };
};

const comparar = (a, b) =>
  ORDEN_TURNOS.indexOf(a.turno) - ORDEN_TURNOS.indexOf(b.turno) ||
  ORDEN_CATEGORIAS.indexOf(a.categoria) - ORDEN_CATEGORIAS.indexOf(b.categoria) ||
  TIPOS_NOVEDAD_SUPERVISION.indexOf(a.tipo) - TIPOS_NOVEDAD_SUPERVISION.indexOf(b.tipo) ||
  a.personaNombre.localeCompare(b.personaNombre, "es", { sensitivity: "base" }) ||
  a.idEstable.localeCompare(b.idEstable);

export const construirNovedadesSupervisionDia = ({
  estadosPorTurno = {},
  novedadesModernas = [],
  fecha = ""
} = {}) => {
  const legacy = ORDEN_TURNOS.flatMap((turno) => {
    const estado = estadosPorTurno?.[turno];
    if (!estado) return [];
    return crearNovedadesLegacy({
      licencias: estado.licencias,
      certificaciones: estado.certificaciones,
      personal: estado.personal
    }).map((novedad) => ({ ...novedad, turno }));
  });
  const modernas = filtrarNovedadesVisibles(novedadesModernas);
  const normalizadas = [...legacy, ...modernas]
    .filter((novedad) => TIPOS_PERMITIDOS.has(novedad?.tipo))
    .filter((novedad) => fechaIncluida(novedad, fecha))
    .map(normalizarParaSupervision);
  const unicas = new Map();
  normalizadas.forEach((novedad) => {
    if (!unicas.has(novedad.idEstable)) unicas.set(novedad.idEstable, novedad);
  });
  return [...unicas.values()].sort(comparar);
};

export const resumirNovedadesSupervisionDia = (novedades = []) => ({
  total: novedades.length,
  ausencias: novedades.filter((novedad) => novedad.clasificacion === "ausencia").length,
  informativas: novedades.filter((novedad) => novedad.clasificacion === "informativa").length
});

export const formatearPeriodoNovedadSupervision = (novedad) => {
  const corta = (fecha) => /^\d{4}-\d{2}-\d{2}$/.test(fecha || "")
    ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
    : "Sin fecha";
  const desde = corta(novedad?.fechaDesde);
  const hasta = corta(novedad?.fechaHasta || novedad?.fechaDesde);
  return desde === hasta ? desde : `${desde} – ${hasta}`;
};
