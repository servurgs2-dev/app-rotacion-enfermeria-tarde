import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { configuracionSectores } from "../data/sectores";
import { normalizar } from "./texto";
import {
  obtenerNombreDesdeReferencia,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";


// 🔹 PLANILLA
export const exportarPlanillaPDF = (planillaEnf, planillaLic, semanas, personal = []) => {
  const semanasActivas = Array.isArray(semanas) ? semanas : [];
  const pdf = new jsPDF("l"); // 🔥 horizontal (clave)

  pdf.setFontSize(14);
  pdf.text("Planilla mensual", 14, 15);

  pdf.setDrawColor(200);
pdf.line(14, 17, 280, 17);

  // 🔹 HEADERS (fechas de semanas)
  const headers = [
    "Sector",
    ...semanasActivas.map(s =>
      `${s.desde.getDate()}/${s.desde.getMonth() + 1} - ${s.hasta.getDate()}/${s.hasta.getMonth() + 1}`
    )
  ];

  const nombreParaPDF = (referencia) => {
    const nombre = obtenerNombreDesdeReferencia(referencia, personal);
    const esIdIntermedioNoResuelto = typeof referencia === "string" &&
      referencia.trim().startsWith("persona-") &&
      !resolverPersonaDesdeReferencia(referencia, personal);
    return esIdIntermedioNoResuelto ? "" : nombre;
  };

  const planillaEnfNorm = {};

Object.keys(planillaEnf || {}).forEach(semana => {
  planillaEnfNorm[semana] = {};

  Object.keys(planillaEnf[semana] || {}).forEach(sector => {
    planillaEnfNorm[semana][normalizar(sector)] =
      nombreParaPDF(planillaEnf[semana][sector]);
  });
});

const planillaLicNorm = {};

Object.keys(planillaLic || {}).forEach(semana => {
  planillaLicNorm[semana] = {};

  Object.keys(planillaLic[semana] || {}).forEach(sector => {
    planillaLicNorm[semana][normalizar(sector)] =
      nombreParaPDF(planillaLic[semana][sector]);
  });
});
  // 🔹 obtener todos los sectores únicos
 const sectores = configuracionSectores.enfermero.ordenPDF;

  // 🔹 armar filas
  const body = sectores.map(sector => {
    const fila = [sector];

    semanasActivas.forEach(({ clave }, indice) => {
      const semanaKey = clave || `semana${indice + 1}`;
      const valor = planillaEnfNorm[semanaKey]?.[normalizar(sector)] || "-";
      fila.push(valor);
    });
    return fila;
  });
pdf.setFontSize(12);
pdf.text("Enfermeros", 14, 20);
  // 🔹 tabla
  autoTable(pdf, {
    startY: 23,
    head: [headers],
    body,
    styles: {
      halign: "center",
      ...(semanasActivas.length === 6 ? { fontSize: 7 } : {})
    },
    headStyles: {
      fillColor: [41, 128, 185]
    }
  });

let finalY = pdf.lastAutoTable.finalY + 10;

// 🔥 si no entra, nueva hoja
if (finalY > 180) {
  pdf.addPage();
  finalY = 20;
}

pdf.setFontSize(12);
pdf.text("Licenciados", 14, finalY);

const sectoresLic = configuracionSectores.licenciado.ordenPDF;

const bodyLic = sectoresLic.map(sector => {
  const fila = [sector];

  semanasActivas.forEach(({ clave }, indice) => {
    const semanaKey = clave || `semana${indice + 1}`;
    const valor = planillaLicNorm[semanaKey]?.[normalizar(sector)] || "-";
    fila.push(valor);
  });

  return fila;
});

autoTable(pdf, {
  startY: finalY + 3,
  head: [headers],
  body: bodyLic,
  styles: {
    halign: "center",
    ...(semanasActivas.length === 6 ? { fontSize: 7 } : {})
  },
  headStyles: {
    fillColor: [22, 160, 133] // verde
  }
});
  pdf.save("planilla_mensual.pdf");
};




// 🔹 CALENDARIO
export const exportarCalendarioPDF = ({
  fecha,
  enfermeros = {},
  licenciados = {}
}) => {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const asignacionesEnfermeros = enfermeros.asignaciones || [];
  const asignacionesLicenciados = licenciados.asignaciones || [];
  const libresEnfermeros = enfermeros.libres || [];
  const libresLicenciados = licenciados.libres || [];
  const anchoColumna = 133;
  const columnaIzquierda = 10;
  const columnaDerecha = 154;

  pdf.setFontSize(16);
  pdf.text("Distribución diaria", 10, 14);
  pdf.setFontSize(10);
  pdf.setTextColor(90);
  pdf.text(
    fecha.toLocaleDateString("es-UY", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }),
    10,
    21
  );
  pdf.setTextColor(0);
  pdf.setDrawColor(210);
  pdf.line(10, 24, 287, 24);

  const filasAsignacion = (asignaciones) =>
    asignaciones
      .filter((item) => item?.nombre && item.tipo !== "divider")
      .map((item) => [
        item.nombre,
        item.enfermero?.nombre ?? "Sin cobertura"
      ]);

  const renderColumna = (titulo, asignaciones, x, color) => {
    pdf.setFontSize(11);
    pdf.text(titulo, x, 31);

    autoTable(pdf, {
      startY: 34,
      margin: { left: x },
      tableWidth: anchoColumna,
      head: [["Sector", "Asignado"]],
      body: filasAsignacion(asignaciones),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: color, halign: "center" },
      columnStyles: {
        0: { cellWidth: 66 },
        1: { cellWidth: 67 }
      }
    });

    return pdf.lastAutoTable.finalY;
  };

  renderColumna(
    "Enfermeros",
    asignacionesEnfermeros,
    columnaIzquierda,
    [41, 128, 185]
  );
  const finalLicenciados = renderColumna(
    "Licenciados",
    asignacionesLicenciados,
    columnaDerecha,
    [22, 160, 133]
  );

  const inicioLibres = finalLicenciados + 10;
  pdf.setFontSize(11);
  pdf.text("LIBRES", columnaDerecha, inicioLibres);

  const renderLibres = (titulo, libres, startY, color) => {
    const filas = libres
      .filter((persona) => persona?.nombre)
      .map((persona) => [persona.nombre]);

    autoTable(pdf, {
      startY,
      margin: { left: columnaDerecha },
      tableWidth: anchoColumna,
      head: [[titulo]],
      body: filas.length ? filas : [["Ninguno"]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: color, halign: "left" }
    });

    return pdf.lastAutoTable.finalY;
  };

  const finalLibresEnfermeros = renderLibres(
    "Libres de enfermeros",
    libresEnfermeros,
    inicioLibres + 3,
    [41, 128, 185]
  );
  renderLibres(
    "Libres de licenciados",
    libresLicenciados,
    finalLibresEnfermeros + 3,
    [22, 160, 133]
  );

  pdf.save("calendario.pdf");
};
