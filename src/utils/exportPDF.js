import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { configuracionSectores } from "../data/sectores.js";
import {
  obtenerConfiguracionTurno,
  obtenerEstrategiaRotacionPlanilla
} from "../config/turnos.js";
import { obtenerSemanasDelMes } from "./fechas.js";
import { obtenerBloquesQueIntersectanMes } from "./periodosRotacionPlanilla.js";
import {
  obtenerNombreDesdeReferencia,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { resolverPersonaDeCertificacion } from "./certificacionesPersonas.js";


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

export const renderizarCategoriaPlanillaSemanalPDF = ({
  pdf,
  categoria,
  planilla,
  periodos,
  estrategia,
  personal,
  turnoId,
  mesActivo
}) => {
  const esEnfermeros = categoria === "enfermero";
  const etiquetaCategoria = esEnfermeros ? "Enfermeros" : "Licenciados";
  const tabla = prepararTablaPlanillaPDF({
    planilla,
    periodos,
    estrategia,
    tipo: categoria,
    personal,
    ordenFilas: configuracionSectores[categoria].ordenPDF
  });
  const tituloMes = obtenerNombreMes(mesActivo);
  const turno = obtenerConfiguracionTurno(turnoId).nombre;
  const color = esEnfermeros ? [41, 128, 185] : [22, 160, 133];

  autoTable(pdf, {
    startY: 28,
    margin: { top: 28, left: 14, right: 14 },
    head: [tabla.encabezados],
    body: tabla.cuerpo,
    styles: {
      halign: "center",
      ...(periodos.length === 6 ? { fontSize: 7 } : {})
    },
    headStyles: { fillColor: color },
    showHead: "everyPage",
    didDrawPage: () => {
      pdf.setFontSize(14);
      pdf.text(`Planilla semanal - ${etiquetaCategoria}`, 14, 15);
      pdf.setFontSize(10);
      pdf.text(`${turno} - ${tituloMes}`, 14, 21);
      pdf.setDrawColor(200);
      pdf.line(14, 23, 280, 23);
    }
  });

  return pdf.lastAutoTable?.finalY ?? 28;
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
    pdf.text("Planilla semanal - Enfermeros", 14, 15);
    pdf.setFontSize(10);
    pdf.text(`Noche - ${tituloMes}${parte}`, 14, 21);
    pdf.setDrawColor(200);
    pdf.line(14, 23, 406, 23);
    autoTable(pdf, {
      startY: 27,
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
  pdf.text("Planilla semanal - Licenciados", 14, 15);
  pdf.setFontSize(10);
  pdf.text(`Noche - ${tituloMes}`, 14, 21);
  pdf.setDrawColor(200);
  pdf.line(14, 23, 406, 23);
  autoTable(pdf, {
    startY: 27,
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

export const crearPlanillaSemanalPDF = ({
  planillaEnfermeros,
  planillaLicenciados,
  semanas,
  personal = [],
  turnoId,
  mesActivo
}) => {
  const semanasActivas = Array.isArray(semanas)
    ? semanas
    : obtenerSemanasDelMes(mesActivo);
  const pdf = new jsPDF("l");
  const estrategiaSemanal = { tipo: "semanal" };

  renderizarCategoriaPlanillaSemanalPDF({
    pdf,
    categoria: "enfermero",
    planilla: planillaEnfermeros,
    periodos: semanasActivas,
    estrategia: estrategiaSemanal,
    personal,
    turnoId,
    mesActivo
  });

  pdf.addPage();

  renderizarCategoriaPlanillaSemanalPDF({
    pdf,
    categoria: "licenciado",
    planilla: planillaLicenciados,
    periodos: semanasActivas,
    estrategia: estrategiaSemanal,
    personal,
    turnoId,
    mesActivo
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

  const pdf = crearPlanillaSemanalPDF({
    planillaEnfermeros: planillaEnf,
    planillaLicenciados: planillaLic,
    semanas: opciones.semanas,
    personal,
    turnoId,
    mesActivo
  });
  pdf.save("planilla_mensual.pdf");
};




const formatearFechaCortaPDF = (fechaIso) => {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso || "");
  return coincidencia ? `${coincidencia[3]}/${coincidencia[2]}` : fechaIso || "";
};

const obtenerClaveFechaPDF = (fecha) =>
  fecha instanceof Date && !Number.isNaN(fecha.getTime())
    ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`
    : "";

export const prepararCertificacionesDiaPDF = ({
  certificaciones,
  fecha,
  personal
}) => {
  const claveFecha = obtenerClaveFechaPDF(fecha);
  if (!claveFecha) return [];

  return (Array.isArray(certificaciones) ? certificaciones : []).flatMap(
    (certificacion) => {
      if (
        !certificacion ||
        typeof certificacion !== "object" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(certificacion.desde || "") ||
        !/^\d{4}-\d{2}-\d{2}$/.test(certificacion.hasta || "") ||
        certificacion.desde > claveFecha ||
        certificacion.hasta < claveFecha
      ) return [];

      const persona = resolverPersonaDeCertificacion(certificacion, personal);
      const nombre = persona?.nombre || obtenerNombreDesdeReferencia(certificacion, personal);
      if (!nombre) return [];

      return [{
        nombre,
        categoria: persona?.categoria === "licenciado"
          ? "Licenciado"
          : "Enfermero",
        desde: certificacion.desde,
        hasta: certificacion.hasta,
        texto: `${nombre} - ${
          persona?.categoria === "licenciado" ? "Licenciado" : "Enfermero"
        } - ${formatearFechaCortaPDF(certificacion.desde)} al ${
          formatearFechaCortaPDF(certificacion.hasta)
        }`
      }];
    }
  );
};

export const prepararFilasCalendarioPDF = (asignaciones) =>
  (Array.isArray(asignaciones) ? asignaciones : [])
    .filter((item) => item?.nombre && item.tipo !== "divider")
    .map((item) => [
      item.nombre,
      item.enfermero?.nombre || item.etiquetaVacio || "Sin cobertura"
    ]);

const dibujarListaCompactaPDF = ({
  pdf,
  titulo,
  elementos,
  x,
  y,
  ancho,
  columnas = 2,
  mensajeVacio
}) => {
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.text(titulo, x, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6);

  const textos = elementos.length ? elementos : [mensajeVacio];
  const anchoColumna = ancho / columnas;
  const filas = Math.ceil(textos.length / columnas);
  let altoMaximo = 0;

  textos.forEach((texto, indice) => {
    const columna = Math.floor(indice / filas);
    const fila = indice % filas;
    const lineas = pdf.splitTextToSize(String(texto), anchoColumna - 3).slice(0, 2);
    const altoFila = Math.max(3.2, lineas.length * 2.6);
    const posicionY = y + 4 + fila * 5.4;
    pdf.text(lineas, x + columna * anchoColumna, posicionY);
    altoMaximo = Math.max(altoMaximo, posicionY - y + altoFila);
  });

  return Math.max(8, altoMaximo);
};

export const crearCalendarioDiarioPDF = ({
  fecha,
  enfermeros = {},
  licenciados = {},
  certificaciones = [],
  personal = [],
  turnoId,
  mesActivo
}) => {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const asignacionesEnfermeros = enfermeros.asignaciones || [];
  const asignacionesLicenciados = licenciados.asignaciones || [];
  const libresEnfermeros = enfermeros.libres || [];
  const libresLicenciados = licenciados.libres || [];
  const filasEnfermeros = prepararFilasCalendarioPDF(asignacionesEnfermeros);
  const filasLicenciados = prepararFilasCalendarioPDF(asignacionesLicenciados);
  const certificacionesDia = prepararCertificacionesDiaPDF({
    certificaciones,
    fecha,
    personal
  });
  const maximoFilas = Math.max(filasEnfermeros.length, filasLicenciados.length);
  const fuenteTabla = maximoFilas > 24 ? 5.5 : maximoFilas > 18 ? 6 : 6.5;
  const paddingTabla = maximoFilas > 24 ? 0.55 : maximoFilas > 18 ? 0.75 : 1;
  const anchoColumna = 137;
  const columnaIzquierda = 8;
  const columnaDerecha = 152;
  const turno = obtenerConfiguracionTurno(turnoId).nombre;
  const tituloMes = obtenerNombreMes(mesActivo);

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("Calendario Diario", 8, 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(90);
  pdf.text(
    `${fecha.toLocaleDateString("es-UY", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    })} - Turno ${turno} - ${tituloMes}`,
    8,
    16
  );
  pdf.setTextColor(0);
  pdf.setDrawColor(210);
  pdf.line(8, 19, 289, 19);

  const renderColumna = (titulo, filas, x, color) => {
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "bold");
    pdf.text(titulo, x, 24);
    pdf.setFont("helvetica", "normal");

    autoTable(pdf, {
      startY: 27,
      margin: { left: x },
      tableWidth: anchoColumna,
      head: [["Sector", "Asignado"]],
      body: filas,
      styles: {
        fontSize: fuenteTabla,
        cellPadding: paddingTabla,
        overflow: "linebreak",
        valign: "middle",
        minCellHeight: 3.2
      },
      headStyles: { fillColor: color, halign: "center" },
      columnStyles: {
        0: { cellWidth: 56 },
        1: { cellWidth: 81 }
      },
      pageBreak: "avoid",
      rowPageBreak: "avoid"
    });

    return pdf.lastAutoTable.finalY;
  };

  const finalEnfermeros = renderColumna(
    "Enfermeros",
    filasEnfermeros,
    columnaIzquierda,
    [41, 128, 185]
  );
  const finalLicenciados = renderColumna(
    "Licenciados",
    filasLicenciados,
    columnaDerecha,
    [22, 160, 133]
  );
  const inicioLibres = Math.max(finalEnfermeros, finalLicenciados) + 5;
  pdf.setDrawColor(220);
  pdf.line(8, inicioLibres - 3, 289, inicioLibres - 3);

  const altoLibresEnfermeros = dibujarListaCompactaPDF({
    pdf,
    titulo: "Libres del día - Enfermeros",
    elementos: libresEnfermeros.map((persona) => persona.nombre).filter(Boolean),
    x: columnaIzquierda,
    y: inicioLibres,
    ancho: anchoColumna,
    columnas: 2,
    mensajeVacio: "Sin libres"
  });
  const altoLibresLicenciados = dibujarListaCompactaPDF({
    pdf,
    titulo: "Libres del día - Licenciados",
    elementos: libresLicenciados.map((persona) => persona.nombre).filter(Boolean),
    x: columnaDerecha,
    y: inicioLibres,
    ancho: anchoColumna,
    columnas: 2,
    mensajeVacio: "Sin libres"
  });
  const inicioCertificaciones =
    inicioLibres + Math.max(altoLibresEnfermeros, altoLibresLicenciados) + 3;

  pdf.line(8, inicioCertificaciones - 3, 289, inicioCertificaciones - 3);
  dibujarListaCompactaPDF({
    pdf,
    titulo: "Certificaciones médicas del día",
    elementos: certificacionesDia.map((certificacion) => certificacion.texto),
    x: 8,
    y: inicioCertificaciones,
    ancho: 281,
    columnas: certificacionesDia.length > 8 ? 4 : 3,
    mensajeVacio: "Sin certificaciones médicas para esta fecha"
  });

  return pdf;
};

export const exportarCalendarioPDF = (opciones) => {
  const pdf = crearCalendarioDiarioPDF(opciones);
  const fechaClave = obtenerClaveFechaPDF(opciones.fecha) || "fecha";
  const turno = String(opciones.turnoId || "turno").replace(/[^a-z0-9_-]/gi, "-");
  pdf.save(`calendario-diario-${fechaClave}-${turno}.pdf`);
};
