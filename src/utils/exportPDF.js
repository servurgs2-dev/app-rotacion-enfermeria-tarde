import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { configuracionSectores } from "../data/sectores.js";
import { obtenerEstrategiaRotacionPlanilla } from "../config/turnos.js";
import { obtenerSemanasDelMes } from "./fechas.js";
import { obtenerBloquesQueIntersectanMes } from "./periodosRotacionPlanilla.js";
import { normalizar } from "./texto.js";
import {
  obtenerNombreDesdeReferencia,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";


// 🔹 PLANILLA
const crearNombreParaPDF = (personal) => (referencia) => {
  const nombre = obtenerNombreDesdeReferencia(referencia, personal);
  const esIdIntermedioNoResuelto = typeof referencia === "string" &&
    referencia.trim().startsWith("persona-") &&
    !resolverPersonaDesdeReferencia(referencia, personal);
  return esIdIntermedioNoResuelto ? "" : nombre;
};

export const ORDEN_PDF_ENFERMEROS_TRES_DIAS = [
  "REA 1",
  "REA 2",
  "1-3 + 21",
  "4-7",
  "8-13",
  "14-19",
  "20-22-24",
  "DX 25-30",
  "EXPLORA 1",
  "EXPLORA 2",
  "SILLÓN 1",
  "SILLON 2",
  "PRE INT 1",
  "PRE INT 2",
  "SM",
  "T1",
  "T2",
  "T3",
  "T4",
  "T5"
];

export const ORDEN_PDF_LICENCIADOS_NOCHE = [
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
  "T2"
];

const obtenerFilasPlanilla = (tipo, ordenPresentacion) => {
  if (Array.isArray(ordenPresentacion)) return [...ordenPresentacion];

  const configuracion = configuracionSectores[tipo];
  const filas = [];
  let indiceTurnante = 0;

  configuracion.sectoresFijos.forEach((sector, indice) => {
    filas.push(sector);
    if (configuracion.posicionesTurnantes.includes(indice)) {
      filas.push(configuracion.turnantes[indiceTurnante]);
      indiceTurnante += 1;
    }
  });
  return filas;
};

export const obtenerPeriodosPlanillaPDF = ({ turnoId, tipo, mesActivo } = {}) => {
  const estrategia = obtenerEstrategiaRotacionPlanilla({ turnoId, tipo, mesActivo });
  return estrategia.tipo === "cada_3_dias"
    ? {
        estrategia,
        periodos: obtenerBloquesQueIntersectanMes({
          mesActivo,
          fechaBase: estrategia.fechaBase,
          duracionDias: estrategia.duracionDias
        })
      }
    : { estrategia, periodos: obtenerSemanasDelMes(mesActivo) };
};

const obtenerEtiquetaPeriodoPDF = (periodo, estrategia) =>
  estrategia.tipo === "cada_3_dias"
    ? periodo.etiqueta
    : `${periodo.desde.getDate()}/${periodo.desde.getMonth() + 1} - ${periodo.hasta.getDate()}/${periodo.hasta.getMonth() + 1}`;

const obtenerValoresPeriodoPDF = ({ planilla, periodo, estrategia }) =>
  estrategia.tipo === "cada_3_dias"
    ? planilla?.rotacion3Dias?.bloques?.[periodo.clave] || {}
    : planilla?.[periodo.clave] || {};

export const prepararTablaPlanillaPDF = ({
  planilla,
  periodos,
  estrategia,
  tipo,
  personal = [],
  incluirCoberturaSM = false,
  ordenFilas
}) => {
  const periodosValidos = Array.isArray(periodos) ? periodos : [];
  const nombreParaPDF = crearNombreParaPDF(personal);
  const encabezados = [
    "Sector",
    ...periodosValidos.map((periodo) => obtenerEtiquetaPeriodoPDF(periodo, estrategia))
  ];
  const cuerpo = obtenerFilasPlanilla(tipo, ordenFilas).map((filaPlanilla) => [
    filaPlanilla,
    ...periodosValidos.map((periodo) => {
      const valores = obtenerValoresPeriodoPDF({ planilla, periodo, estrategia });
      return nombreParaPDF(valores[filaPlanilla]) || "-";
    })
  ]);

  if (incluirCoberturaSM) {
    const filaCobertura = [
      tipo === "enfermero" ? "Cubre libre de SM" : "Cubre libre de Salud Mental",
      ...periodosValidos.map((periodo) => {
        const coberturas = estrategia.tipo === "cada_3_dias"
          ? planilla?.rotacion3Dias?.coberturaLibreSM
          : planilla?.coberturaLibreSM;
        return nombreParaPDF(coberturas?.[periodo.clave]) || "-";
      })
    ];
    const indiceSaludMental = cuerpo.findIndex(
      ([fila]) => fila === (tipo === "enfermero" ? "SM" : "Salud Mental")
    );
    cuerpo.splice(indiceSaludMental >= 0 ? indiceSaludMental + 1 : cuerpo.length, 0, filaCobertura);
  }

  return { encabezados, cuerpo };
};

const obtenerNombreMes = (mesActivo) => {
  const [anio, mes] = String(mesActivo || "").split("-").map(Number);
  if (!anio || !mes) return mesActivo || "";
  const nombre = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(anio, mes - 1, 1)));
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
};

export const dividirPeriodosPlanillaPDF = (periodos, cantidad) => {
  const grupos = [];
  for (let indice = 0; indice < periodos.length; indice += cantidad) {
    grupos.push(periodos.slice(indice, indice + cantidad));
  }
  return grupos;
};

export const crearPlanillaTresDiasPDF = ({
  planillaEnfermeros,
  planillaLicenciados,
  turnoId,
  mesActivo,
  personal
}) => {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const { estrategia, periodos } = obtenerPeriodosPlanillaPDF({
    turnoId,
    tipo: "enfermero",
    mesActivo
  });
  const grupos = dividirPeriodosPlanillaPDF(periodos, 6);
  const tituloMes = obtenerNombreMes(mesActivo);

  grupos.forEach((grupo, indice) => {
    if (indice > 0) pdf.addPage("a3", "landscape");
    const tabla = prepararTablaPlanillaPDF({
      planilla: planillaEnfermeros,
      periodos: grupo,
      estrategia,
      tipo: "enfermero",
      personal,
      incluirCoberturaSM: true,
      ordenFilas: ORDEN_PDF_ENFERMEROS_TRES_DIAS
    });
    const parte = grupos.length > 1 ? ` - Parte ${indice + 1} de ${grupos.length}` : "";

    pdf.setFontSize(14);
    pdf.text(`Planilla mensual - Noche - Enfermeros - ${tituloMes}${parte}`, 14, 15);
    pdf.setDrawColor(200);
    pdf.line(14, 17, 406, 17);
    autoTable(pdf, {
      startY: 21,
      head: [tabla.encabezados],
      body: tabla.cuerpo,
      margin: { left: 10, right: 10 },
      styles: {
        halign: "center",
        valign: "middle",
        fontSize: 8,
        cellPadding: 1.5,
        overflow: "linebreak"
      },
      columnStyles: { 0: { cellWidth: 45, halign: "left" } },
      headStyles: { fillColor: [41, 128, 185] },
      showHead: "everyPage"
    });
  });

  const datosLicenciados = obtenerPeriodosPlanillaPDF({
    turnoId,
    tipo: "licenciado",
    mesActivo
  });
  const tablaLicenciados = prepararTablaPlanillaPDF({
    planilla: planillaLicenciados,
    periodos: datosLicenciados.periodos,
    estrategia: datosLicenciados.estrategia,
    tipo: "licenciado",
    personal,
    ordenFilas: ORDEN_PDF_LICENCIADOS_NOCHE
  });

  pdf.addPage("a3", "landscape");
  pdf.setFontSize(14);
  pdf.text(`Planilla mensual - Noche - Licenciados - ${tituloMes}`, 14, 15);
  pdf.setDrawColor(200);
  pdf.line(14, 17, 406, 17);
  autoTable(pdf, {
    startY: 21,
    head: [tablaLicenciados.encabezados],
    body: tablaLicenciados.cuerpo,
    margin: { left: 10, right: 10 },
    styles: { halign: "center", valign: "middle", fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 52, halign: "left" } },
    headStyles: { fillColor: [22, 160, 133] },
    showHead: "everyPage"
  });
  return pdf;
};

// Conserva la firma posicional para cualquier consumidor histórico.
export const exportarPlanillaPDF = (...argumentos) => {
  const usaOpciones = argumentos[0] &&
    typeof argumentos[0] === "object" &&
    Object.hasOwn(argumentos[0], "planillaEnfermeros");
  const opciones = usaOpciones
    ? argumentos[0]
    : {
        planillaEnfermeros: argumentos[0],
        planillaLicenciados: argumentos[1],
        semanas: argumentos[2],
        personal: argumentos[3]
      };
  const {
    planillaEnfermeros: planillaEnf,
    planillaLicenciados: planillaLic,
    turnoId,
    mesActivo,
    personal = []
  } = opciones;
  const estrategiaEnfermeros = obtenerEstrategiaRotacionPlanilla({
    turnoId,
    tipo: "enfermero",
    mesActivo
  });

  if (estrategiaEnfermeros.tipo === "cada_3_dias") {
    const pdf = crearPlanillaTresDiasPDF({
      planillaEnfermeros: planillaEnf,
      planillaLicenciados: planillaLic,
      turnoId,
      mesActivo,
      personal
    });
    pdf.save("planilla_mensual.pdf");
    return;
  }

  const semanas = opciones.semanas || obtenerSemanasDelMes(mesActivo);
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
