import {
  filtrarNovedadesPorTurnoActivo,
  filtrarNovedadesVisibles,
  obtenerEtiquetaEstadoNovedad,
  obtenerEtiquetaTipoNovedad
} from "./novedadesPersonal.js";

export const TIPOS_REPORTE_NOVEDADES = Object.freeze([
  "licencia",
  "certificacion",
  "suspension",
  "adhesion_paro",
  "olvido_tarjeta",
  "cambio_horario"
]);

export const TIPOS_AUSENCIA_REPORTE = Object.freeze([
  "licencia",
  "certificacion",
  "suspension",
  "adhesion_paro"
]);

const TIPOS_AUSENCIA = new Set(TIPOS_AUSENCIA_REPORTE);
const TIPOS_PERMITIDOS = new Set(TIPOS_REPORTE_NOVEDADES);

export const clasificarImpactoNovedad = (novedad) =>
  TIPOS_AUSENCIA.has(novedad?.tipo) ? "ausencia" : "administrativa";

const fechaValida = (fecha) => /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""));

const fechaUtc = (fecha) => {
  const [anio, mes, dia] = String(fecha).split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
};

export const contarJornadasEnInterseccion = (novedad, desde, hasta) => {
  if (clasificarImpactoNovedad(novedad) !== "ausencia" ||
      !fechaValida(desde) || !fechaValida(hasta)) return 0;
  const inicio = [novedad?.fechaDesde, desde].filter(fechaValida).sort().at(-1);
  const fin = [novedad?.fechaHasta || novedad?.fechaDesde, hasta].filter(fechaValida).sort().at(0);
  if (!inicio || !fin || inicio > fin) return 0;
  return Math.floor((fechaUtc(fin) - fechaUtc(inicio)) / 86400000) + 1;
};

export const obtenerDetalleReporteNovedad = (novedad) => {
  if (novedad?.tipo === "cambio_horario") {
    return `Horario: ${novedad.datos?.horaEntrada || "--:--"} – ${novedad.datos?.horaSalida || "--:--"}`;
  }
  if (novedad?.tipo === "certificacion" && novedad.datos?.creadaDesdeNoDisponibles) {
    return "Creada desde No disponibles";
  }
  return novedad?.observacion || "";
};

export const construirReporteNovedades = ({
  novedades = [],
  turnoActivo = "",
  padronVigencias = null,
  desde = "",
  hasta = "",
  categoria = "",
  personaId = "",
  tipo = "",
  impacto = ""
} = {}) => {
  const rangoValido = fechaValida(desde) && fechaValida(hasta) && desde <= hasta;
  const registros = (rangoValido
    ? filtrarNovedadesVisibles(filtrarNovedadesPorTurnoActivo(
        novedades,
        turnoActivo,
        padronVigencias
      ))
      .filter((novedad) => TIPOS_PERMITIDOS.has(novedad?.tipo))
      .filter((novedad) => novedad.fechaDesde <= hasta && (novedad.fechaHasta || novedad.fechaDesde) >= desde)
      .filter((novedad) => !categoria || novedad.categoria === categoria)
      .filter((novedad) => !personaId || String(novedad.personaId) === String(personaId))
      .filter((novedad) => !tipo || novedad.tipo === tipo)
      .filter((novedad) => !impacto || clasificarImpactoNovedad(novedad) === impacto)
    : [])
    .map((novedad, indice) => ({ novedad, indice }))
    .sort((a, b) =>
      a.novedad.fechaDesde.localeCompare(b.novedad.fechaDesde) ||
      a.novedad.personaNombre.localeCompare(b.novedad.personaNombre, "es") ||
      obtenerEtiquetaTipoNovedad(a.novedad.tipo).localeCompare(obtenerEtiquetaTipoNovedad(b.novedad.tipo), "es") ||
      a.indice - b.indice
    )
    .map(({ novedad }) => novedad);

  const desglose = Object.fromEntries(TIPOS_REPORTE_NOVEDADES.map((valor) => [valor, 0]));
  let ausencias = 0;
  let administrativas = 0;
  let jornadasAfectadas = 0;
  registros.forEach((novedad) => {
    desglose[novedad.tipo] += 1;
    if (clasificarImpactoNovedad(novedad) === "ausencia") {
      ausencias += 1;
      jornadasAfectadas += contarJornadasEnInterseccion(novedad, desde, hasta);
    } else {
      administrativas += 1;
    }
  });

  return {
    registros,
    resumen: {
      total: registros.length,
      ausencias,
      administrativas,
      jornadasAfectadas,
      desglose
    },
    rangoValido
  };
};

export const presentarEstadoReporteNovedad = (novedad) =>
  novedad?.tipo === "olvido_tarjeta" ? obtenerEtiquetaEstadoNovedad(novedad.estado) : "";
