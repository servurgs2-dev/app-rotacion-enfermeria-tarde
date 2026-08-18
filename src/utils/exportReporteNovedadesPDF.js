import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  obtenerDetalleReporteNovedad,
  presentarEstadoReporteNovedad,
  TIPOS_REPORTE_NOVEDADES
} from "./reporteNovedades.js";
import { obtenerEtiquetaTipoNovedad } from "./novedadesPersonal.js";

const fechaCorta = (fecha) => {
  const [anio, mes, dia] = String(fecha || "").split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : "";
};

const rango = (novedad) => novedad.fechaHasta && novedad.fechaHasta !== novedad.fechaDesde
  ? `${fechaCorta(novedad.fechaDesde)} – ${fechaCorta(novedad.fechaHasta)}`
  : fechaCorta(novedad.fechaDesde);

export const exportarReporteNovedadesPDF = ({
  reporte,
  mesActivo,
  turnoEtiqueta,
  filtros = {},
  personaEtiqueta = "Todos",
  categoriaEtiqueta = "Todas",
  tipoEtiqueta = "Todos",
  impactoEtiqueta = "Todas"
} = {}) => {
  if (!reporte?.registros?.length) return false;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.setFontSize(16);
  pdf.text("Reporte de Novedades / Ausencias", 14, 15);
  pdf.setFontSize(9);
  pdf.text(`Mes: ${mesActivo} · Turno: ${turnoEtiqueta}`, 14, 22);
  pdf.text(`Rango: ${fechaCorta(filtros.desde)} – ${fechaCorta(filtros.hasta)}`, 14, 27);
  pdf.text(`Categoría: ${categoriaEtiqueta} · Funcionario: ${personaEtiqueta}`, 14, 32);
  pdf.text(`Tipo: ${tipoEtiqueta} · Impacto: ${impactoEtiqueta}`, 14, 37);
  pdf.text(`Generado: ${new Date().toLocaleString("es-UY")}`, 14, 42);

  const { resumen } = reporte;
  pdf.setFontSize(10);
  pdf.text(
    `Total: ${resumen.total} · Ausencias: ${resumen.ausencias} · Administrativas: ${resumen.administrativas} · Jornadas/persona afectadas: ${resumen.jornadasAfectadas}`,
    14,
    49
  );
  const desglose = TIPOS_REPORTE_NOVEDADES
    .filter((tipo) => resumen.desglose[tipo] > 0)
    .map((tipo) => `${obtenerEtiquetaTipoNovedad(tipo)}: ${resumen.desglose[tipo]}`)
    .join(" · ");
  if (desglose) pdf.text(desglose, 14, 55);

  autoTable(pdf, {
    startY: desglose ? 60 : 55,
    head: [["Fecha / rango", "Funcionario", "Categoría", "Tipo", "Detalle", "Estado"]],
    body: reporte.registros.map((novedad) => [
      rango(novedad),
      novedad.personaNombre,
      novedad.categoria === "enfermero" ? "Enfermero" : novedad.categoria === "licenciado" ? "Licenciado" : "",
      obtenerEtiquetaTipoNovedad(novedad.tipo),
      obtenerDetalleReporteNovedad(novedad),
      presentarEstadoReporteNovedad(novedad)
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 64, 175] },
    columnStyles: {
      0: { cellWidth: 31 },
      1: { cellWidth: 45 },
      2: { cellWidth: 25 },
      3: { cellWidth: 36 },
      4: { cellWidth: 90 },
      5: { cellWidth: 25 }
    },
    margin: { left: 14, right: 14 }
  });
  pdf.save(`reporte-novedades-${mesActivo}-${turnoEtiqueta.toLocaleLowerCase("es")}.pdf`);
  return true;
};
