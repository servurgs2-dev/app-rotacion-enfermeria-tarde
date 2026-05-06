import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


const normalizar = (str) =>
  str
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

const ORDEN_SECTORES = [
  "REA 1",
  "REA 2",
  "1-3 + 21",
  "4-7",
  "8-13",
  "14-19",
  "20-22-24",
  "DX 25-30",
  "SILLÓN 1",
  "SILLON 2",
  "EXPLORA 1",
  "EXPLORA 2",
  "PRE INT 1",
  "PRE INT 2",
  "SM",
  "T1",
  "T2",
  "T3",
  "T4",
  "T5"
];



const ORDEN_SECTORES_LIC = [
  "Triage 1",
  "Triage 2",
  "Reanimación + Sillones",
  "Estabiliza",
  "Observación 1",
  "Observación 2",
  "Diagnostico",
  "Explora",
  "Preinternación",
  "Salud Mental",
  "T1",
  "T2",
];




// 🔹 PLANILLA
export const exportarPlanillaPDF = (planillaEnf, planillaLic, semanas) => {
  const pdf = new jsPDF("l"); // 🔥 horizontal (clave)

  pdf.setFontSize(14);
  pdf.text("Planilla mensual", 14, 15);

  pdf.setDrawColor(200);
pdf.line(14, 17, 280, 17);

  // 🔹 HEADERS (fechas de semanas)
  const headers = [
    "Sector",
    ...semanas.map(s =>
      `${s.desde.getDate()}/${s.desde.getMonth() + 1} - ${s.hasta.getDate()}/${s.hasta.getMonth() + 1}`
    )
  ];

  const planillaEnfNorm = {};

Object.keys(planillaEnf || {}).forEach(semana => {
  planillaEnfNorm[semana] = {};

  Object.keys(planillaEnf[semana] || {}).forEach(sector => {
    planillaEnfNorm[semana][normalizar(sector)] =
      planillaEnf[semana][sector];
  });
});

const planillaLicNorm = {};

Object.keys(planillaLic || {}).forEach(semana => {
  planillaLicNorm[semana] = {};

  Object.keys(planillaLic[semana] || {}).forEach(sector => {
    planillaLicNorm[semana][normalizar(sector)] =
      planillaLic[semana][sector];
  });
});
  // 🔹 obtener todos los sectores únicos
 const sectores = ORDEN_SECTORES;

  // 🔹 armar filas
  const body = sectores.map(sector => {
    const fila = [sector];

    for (let i = 1; i <= 5; i++) {
  const semanaKey = `semana${i}`;
  const valor =
    planillaEnfNorm[semanaKey]?.[normalizar(sector)] || "-";
  fila.push(valor);
}
console.log(planillaEnf);
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
      halign: "center"
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

const sectoresLic = ORDEN_SECTORES_LIC;

const bodyLic = sectoresLic.map(sector => {
  const fila = [sector];

  for (let i = 1; i <= 5; i++) {
    const semanaKey = `semana${i}`;
    const valor =
  planillaLic?.[semanaKey]?.[sector] || "-";
    fila.push(valor);
  }

  return fila;
});

autoTable(pdf, {
  startY: finalY + 3,
  head: [headers],
  body: bodyLic,
  styles: {
    halign: "center"
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
  enfermeros = [],
  licenciados = []
}) => {
  const pdf = new jsPDF();

  pdf.setFontSize(14);
  pdf.text(`Distribución ${fecha.toLocaleDateString()}`, 14, 15);

  const renderTabla = (titulo, data, startY) => {
    pdf.setFontSize(12);
    pdf.text(titulo, 14, startY);

    const body = data
      .filter(i => i?.nombre && i.tipo !== "divider")
      .map(i => [
        i.nombre,
        i.enfermero?.nombre ?? "Sin cobertura"
      ]);

    autoTable(pdf, {
      startY: startY + 3,
      head: [["Sector", "Asignado"]],
      body,
      styles: { halign: "center" },
      headStyles: { fillColor: [41, 128, 185] }
    });

    return pdf.lastAutoTable.finalY + 10;
  };

  let y = 20;

  if (enfermeros.length) {
    y = renderTabla("Enfermeros", enfermeros, y);
  }

  if (licenciados.length) {
    if (y > 250) {
      pdf.addPage();
      y = 20;
    }
    y = renderTabla("Licenciados", licenciados, y);
  }

  pdf.save("calendario.pdf");
};