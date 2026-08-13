import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { configuracionSectores } from "../data/sectores.js";
import {
  obtenerConfiguracionTurno,
  obtenerEstrategiaRotacionPlanilla
} from "../config/turnos.js";
import { obtenerDiasLibresDelMes, obtenerSemanasDelMes } from "./fechas.js";
import { obtenerBloquesQueIntersectanMes } from "./periodosRotacionPlanilla.js";
import {
  obtenerNombreDesdeReferencia,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { resolverPersonaDeCertificacion } from "./certificacionesPersonas.js";
import { obtenerNombreConMarcaTurnante } from "./etiquetaTurnante.js";
import {
  obtenerConfiguracionPlanillaEfectiva,
  obtenerFilasActivas
} from "./configuracionPlanilla.js";
import { resolverEstructuraCalendario } from "./estructuraCalendario.js";
import {
  crearIdentidadSector,
  crearIdentidadTurnante,
  obtenerClaveIdentidadOperativa,
  resolverIdentidadOperativaAsignacion
} from "./identidadOperativaAsignaciones.js";


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

export const obtenerFilasPlanillaPDF = ({
  estadoMensual,
  turnoId,
  mesActivo,
  tipo,
  ordenLegacy = []
} = {}) => {
  const configuracionEfectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual,
    turno: turnoId,
    categoria: tipo,
    mes: mesActivo
  });
  if (!configuracionEfectiva) return [];

  const filasActivas = obtenerFilasActivas(configuracionEfectiva.filas)
    .sort((filaA, filaB) => filaA.orden - filaB.orden)
    .map((fila) => fila.etiqueta);
  if (configuracionEfectiva.schemaVersion !== null) return filasActivas;

  const activas = new Set(filasActivas);
  const ordenHistorico = (Array.isArray(ordenLegacy) ? ordenLegacy : [])
    .filter((fila) => activas.has(fila));
  return [
    ...ordenHistorico,
    ...filasActivas.filter((fila) => !ordenHistorico.includes(fila))
  ];
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
  ordenFilas,
  estadoMensual,
  turnoId,
  mesActivo
}) => {
  const periodosValidos = Array.isArray(periodos) ? periodos : [];
  const nombreParaPDF = crearNombreParaPDF(personal);
  const encabezados = [
    "Sector",
    ...periodosValidos.map((periodo) => obtenerEtiquetaPeriodoPDF(periodo, estrategia))
  ];
  const cuerpo = obtenerFilasPlanillaPDF({
    estadoMensual,
    turnoId,
    mesActivo,
    tipo,
    ordenLegacy: ordenFilas
  }).map((filaPlanilla) => [
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

const GRUPOS_LIBRES_MENSUALES = [1, 2, 3, 4, 5];

export const prepararGruposLibresPDF = (personal = [], mesActivo = "") => {
  const crearFilas = (categoria) =>
    GRUPOS_LIBRES_MENSUALES.map((grupo) => {
      const primerosDias = obtenerDiasLibresDelMes(grupo, mesActivo).slice(0, 2);
      const funcionarios = personal
        .filter(
          (persona) =>
            String(persona?.categoria || persona?.tipo || "").trim().toLowerCase() === categoria &&
            Number(persona?.libre) === grupo
        )
        .map((persona) => String(persona?.nombre || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "es"));

      return [
        String(grupo),
        primerosDias.length ? primerosDias.join(" y ") : "Sin fechas",
        funcionarios.length ? funcionarios.join(", ") : "Ninguno"
      ];
    });

  return {
    enfermeros: crearFilas("enfermero"),
    licenciados: crearFilas("licenciado")
  };
};

const obtenerConfiguracionGruposLibres = (grupos) => {
  const textos = [...grupos.enfermeros, ...grupos.licenciados].map((fila) => fila[2]);
  const caracteresTotales = textos.reduce((total, texto) => total + texto.length, 0);
  const mayorGrupo = Math.max(0, ...textos.map((texto) => texto.length));

  if (caracteresTotales > 2400 || mayorGrupo > 500) {
    return { fontSize: 7, cellPadding: 0.8 };
  }
  if (caracteresTotales > 1400 || mayorGrupo > 300) {
    return { fontSize: 8, cellPadding: 1 };
  }
  return { fontSize: 9, cellPadding: 1.25 };
};

export const renderizarGruposLibresPDF = ({
  pdf,
  personal = [],
  turnoId,
  mesActivo
}) => {
  const grupos = prepararGruposLibresPDF(personal, mesActivo);
  const visual = obtenerConfiguracionGruposLibres(grupos);
  const margenHorizontal = 8;
  const turno = obtenerConfiguracionTurno(turnoId).nombre;

  pdf.addPage("a4", "landscape");
  pdf.setFontSize(11);
  pdf.text("Grupos de libres del mes", margenHorizontal, 10);
  pdf.setFontSize(8);
  pdf.text(`${turno} - ${obtenerNombreMes(mesActivo)}`, margenHorizontal, 15);

  const renderizarTabla = (titulo, filas, inicioY) => {
    pdf.setFontSize(9);
    pdf.text(titulo, margenHorizontal, inicioY);
    autoTable(pdf, {
      startY: inicioY + 2,
      head: [["Grupo", "Primeros libres del mes", "Funcionarios"]],
      body: filas,
      theme: "grid",
      margin: {
        left: margenHorizontal,
        right: margenHorizontal,
        top: 6,
        bottom: 6
      },
      pageBreak: "avoid",
      rowPageBreak: "avoid",
      styles: {
        fontSize: visual.fontSize,
        cellPadding: visual.cellPadding,
        overflow: "linebreak",
        valign: "middle",
        lineWidth: 0.1
      },
      headStyles: {
        fontSize: visual.fontSize,
        cellPadding: visual.cellPadding
      },
      columnStyles: {
        0: { cellWidth: 18, halign: "center" },
        1: { cellWidth: 34, halign: "center" },
        2: { cellWidth: "auto" }
      }
    });
    return pdf.lastAutoTable.finalY;
  };

  const finEnfermeros = renderizarTabla("Enfermeros", grupos.enfermeros, 21);
  renderizarTabla("Licenciados", grupos.licenciados, finEnfermeros + 5);
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
  mesActivo,
  estadoMensual
}) => {
  const esEnfermeros = categoria === "enfermero";
  const etiquetaCategoria = esEnfermeros ? "Enfermeros" : "Licenciados";
  const tabla = prepararTablaPlanillaPDF({
    planilla,
    periodos,
    estrategia,
    tipo: categoria,
    personal,
    ordenFilas: configuracionSectores[categoria].ordenPDF,
    estadoMensual,
    turnoId,
    mesActivo
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
  personal,
  estadoMensual
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
      ordenFilas: ORDEN_PDF_ENFERMEROS_TRES_DIAS,
      estadoMensual,
      turnoId,
      mesActivo
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
    ordenFilas: ORDEN_PDF_LICENCIADOS_NOCHE,
    estadoMensual,
    turnoId,
    mesActivo
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

  renderizarGruposLibresPDF({ pdf, personal, turnoId, mesActivo });
  return pdf;
};

export const crearPlanillaSemanalPDF = ({
  planillaEnfermeros,
  planillaLicenciados,
  semanas,
  personal = [],
  turnoId,
  mesActivo,
  estadoMensual
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
    mesActivo,
    estadoMensual
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
    mesActivo,
    estadoMensual
  });

  renderizarGruposLibresPDF({ pdf, personal, turnoId, mesActivo });
  return pdf;
};

// Conserva la firma posicional para cualquier consumidor histórico.
const normalizarOpcionesPlanillaPDF = (argumentos) => {
  const usaOpciones = argumentos[0] &&
    typeof argumentos[0] === "object" &&
    Object.hasOwn(argumentos[0], "planillaEnfermeros");
  return usaOpciones
    ? argumentos[0]
    : {
        planillaEnfermeros: argumentos[0],
        planillaLicenciados: argumentos[1],
        semanas: argumentos[2],
        personal: argumentos[3]
      };
};

export const obtenerDocumentoPlanillaPDF = (...argumentos) => {
  const opciones = normalizarOpcionesPlanillaPDF(argumentos);
  const {
    planillaEnfermeros: planillaEnf,
    planillaLicenciados: planillaLic,
    turnoId,
    mesActivo,
    personal = [],
    estadoMensual
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
      personal,
      estadoMensual
    });
    return {
      pdf,
      nombreArchivo: "planilla_mensual.pdf",
      tipoDocumento: "rotacion_nocturna"
    };
  }

  const pdf = crearPlanillaSemanalPDF({
    planillaEnfermeros: planillaEnf,
    planillaLicenciados: planillaLic,
    semanas: opciones.semanas,
    personal,
    turnoId,
    mesActivo,
    estadoMensual
  });
  return {
    pdf,
    nombreArchivo: "planilla_mensual.pdf",
    tipoDocumento: "planilla_mensual"
  };
};

export const obtenerAdjuntoPlanillaPDF = (...argumentos) => {
  const documento = obtenerDocumentoPlanillaPDF(...argumentos);
  return {
    blob: documento.pdf.output("blob"),
    nombreArchivo: documento.nombreArchivo,
    tipoDocumento: documento.tipoDocumento
  };
};

export const exportarPlanillaPDF = (...argumentos) => {
  const documento = obtenerDocumentoPlanillaPDF(...argumentos);
  documento.pdf.save(documento.nombreArchivo);
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
      String(item.nombre).toUpperCase(),
      String(obtenerNombreConMarcaTurnante(item.enfermero) ||
        item.etiquetaVacio ||
        "Sin cobertura").toUpperCase()
    ]);

export const obtenerAsignacionesCalendarioPDF = ({
  asignaciones,
  estadoMensual,
  turnoId,
  mesActivo,
  tipo
} = {}) => {
  const asignacionesActuales = Array.isArray(asignaciones) ? asignaciones : [];
  const configuracionEfectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual,
    turno: turnoId,
    categoria: tipo,
    mes: mesActivo
  });
  if (!configuracionEfectiva || configuracionEfectiva.schemaVersion === null) {
    return asignacionesActuales;
  }

  const estructura = resolverEstructuraCalendario({ configuracionEfectiva });
  const claveFilaConfigurada = (fila) => obtenerClaveIdentidadOperativa(
    fila.tipo === "sector"
      ? crearIdentidadSector(fila.sectorId)
      : crearIdentidadTurnante(fila.turnanteId)
  );
  const clavesConfiguradas = new Set(
    configuracionEfectiva.filas.map(claveFilaConfigurada).filter(Boolean)
  );
  const clavesSectoresActivos = estructura.filasConfiguracion
    .filter((fila) => fila.tipo === "sector")
    .map(claveFilaConfigurada)
    .filter(Boolean);
  const clavesAsignaciones = asignacionesActuales.map((asignacion) =>
    obtenerClaveIdentidadOperativa(resolverIdentidadOperativaAsignacion(asignacion))
  );
  const usados = new Set();
  const ordenadas = clavesSectoresActivos.flatMap((claveSector) => {
    const indice = asignacionesActuales.findIndex((asignacion, indiceActual) =>
      !usados.has(indiceActual) &&
      clavesAsignaciones[indiceActual] === claveSector
    );
    if (indice < 0) return [];
    usados.add(indice);
    return [asignacionesActuales[indice]];
  });
  asignacionesActuales.forEach((asignacion, indice) => {
    if (
      !usados.has(indice) &&
      asignacion?.tipo !== "divider" &&
      !clavesConfiguradas.has(clavesAsignaciones[indice])
    ) {
      ordenadas.push(asignacion);
    }
  });
  return ordenadas;
};

const dibujarListaCompactaPDF = ({
  pdf,
  titulo,
  elementos,
  x,
  y,
  ancho,
  columnas = 2,
  mensajeVacio,
  fuenteTitulo = 9,
  fuenteContenido = 7.5,
  separacionFila = 6,
  altoLinea = 2.9
}) => {
  pdf.setFontSize(fuenteTitulo);
  pdf.setFont("helvetica", "bold");
  pdf.text(String(titulo).toUpperCase(), x, y);
  pdf.setFontSize(fuenteContenido);

  const textos = elementos.length ? elementos : [mensajeVacio];
  const anchoColumna = ancho / columnas;
  const filas = Math.ceil(textos.length / columnas);
  let altoMaximo = 0;

  textos.forEach((texto, indice) => {
    const columna = Math.floor(indice / filas);
    const fila = indice % filas;
    const lineas = pdf.splitTextToSize(String(texto).toUpperCase(), anchoColumna - 3).slice(0, 2);
    const altoFila = Math.max(3.5, lineas.length * altoLinea);
    const posicionY = y + 4.5 + fila * separacionFila;
    pdf.text(lineas, x + columna * anchoColumna, posicionY);
    altoMaximo = Math.max(altoMaximo, posicionY - y + altoFila);
  });

  return Math.max(8, altoMaximo);
};

export const obtenerPerfilVisualCalendarioPDF = ({
  maximoFilas,
  cantidadInferior = 0
} = {}) => {
  if (maximoFilas <= 20) {
    const inferiorCargado = cantidadInferior > 12;
    return {
      nombre: "normal",
      fuenteTabla: inferiorCargado ? 8 : 9,
      fuenteEncabezadoTabla: 9,
      paddingTabla: inferiorCargado ? 1.15 : 1.3,
      altoMinimoFila: inferiorCargado ? 4 : 4.2,
      fuenteTituloTabla: 10,
      fuenteTituloInferior: 9,
      fuenteContenidoInferior: 8,
      separacionFilaInferior: 6.2,
      altoLineaInferior: 3
    };
  }
  if (maximoFilas <= 24) {
    return {
      nombre: "intermedio",
      fuenteTabla: 7.25,
      fuenteEncabezadoTabla: 7.25,
      paddingTabla: 0.85,
      altoMinimoFila: 3.7,
      fuenteTituloTabla: 9.25,
      fuenteTituloInferior: 8.5,
      fuenteContenidoInferior: 7,
      separacionFilaInferior: 5.7,
      altoLineaInferior: 2.8
    };
  }
  return {
    nombre: "extremo",
    fuenteTabla: 6.25,
    fuenteEncabezadoTabla: 6.25,
    paddingTabla: 0.6,
    altoMinimoFila: 3.4,
    fuenteTituloTabla: 8.75,
    fuenteTituloInferior: 8,
    fuenteContenidoInferior: 6.5,
    separacionFilaInferior: 5.3,
    altoLineaInferior: 2.7
  };
};

export const crearCalendarioDiarioPDF = ({
  fecha,
  enfermeros = {},
  licenciados = {},
  certificaciones = [],
  personal = [],
  turnoId,
  mesActivo,
  estadoMensual
}) => {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const asignacionesEnfermeros = obtenerAsignacionesCalendarioPDF({
    asignaciones: enfermeros.asignaciones,
    estadoMensual,
    turnoId,
    mesActivo,
    tipo: "enfermero"
  });
  const asignacionesLicenciados = obtenerAsignacionesCalendarioPDF({
    asignaciones: licenciados.asignaciones,
    estadoMensual,
    turnoId,
    mesActivo,
    tipo: "licenciado"
  });
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
  const cantidadInferior = libresEnfermeros.length +
    libresLicenciados.length + certificacionesDia.length;
  const perfilVisual = obtenerPerfilVisualCalendarioPDF({
    maximoFilas,
    cantidadInferior
  });
  const anchoColumna = 137;
  const columnaIzquierda = 8;
  const columnaDerecha = 152;
  const turno = obtenerConfiguracionTurno(turnoId).nombre;
  const tituloMes = obtenerNombreMes(mesActivo);

  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text("CALENDARIO DIARIO", 8, 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(perfilVisual.nombre === "normal" ? 8.5 : 8);
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
    pdf.setFontSize(perfilVisual.fuenteTituloTabla);
    pdf.setFont("helvetica", "bold");
    pdf.text(String(titulo).toUpperCase(), x, 24);
    pdf.setFont("helvetica", "normal");

    autoTable(pdf, {
      startY: 27,
      margin: { left: x },
      tableWidth: anchoColumna,
      head: [["SECTOR", "FUNCIONARIO"]],
      body: filas,
      styles: {
        fontSize: perfilVisual.fuenteTabla,
        cellPadding: perfilVisual.paddingTabla,
        overflow: "linebreak",
        valign: "middle",
        minCellHeight: perfilVisual.altoMinimoFila,
        textColor: [15, 23, 42]
      },
      headStyles: {
        fillColor: color,
        halign: "center",
        fontStyle: "bold",
        fontSize: perfilVisual.fuenteEncabezadoTabla,
        textColor: [255, 255, 255]
      },
      columnStyles: {
        0: { cellWidth: 56, fontStyle: "bold" },
        1: { cellWidth: 81, fontStyle: "bold" }
      },
      didParseCell: (datos) => {
        if (
          datos.section === "body" &&
          datos.column.index === 1 &&
          String(datos.cell.raw).trim() === "SIN COBERTURA"
        ) {
          datos.cell.styles.fontStyle = "normal";
          datos.cell.styles.fontSize = perfilVisual.fuenteTabla - 0.5;
        }
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
    mensajeVacio: "Sin libres",
    fuenteTitulo: perfilVisual.fuenteTituloInferior,
    fuenteContenido: perfilVisual.fuenteContenidoInferior,
    separacionFila: perfilVisual.separacionFilaInferior,
    altoLinea: perfilVisual.altoLineaInferior
  });
  const altoLibresLicenciados = dibujarListaCompactaPDF({
    pdf,
    titulo: "Libres del día - Licenciados",
    elementos: libresLicenciados.map((persona) => persona.nombre).filter(Boolean),
    x: columnaDerecha,
    y: inicioLibres,
    ancho: anchoColumna,
    columnas: 2,
    mensajeVacio: "Sin libres",
    fuenteTitulo: perfilVisual.fuenteTituloInferior,
    fuenteContenido: perfilVisual.fuenteContenidoInferior,
    separacionFila: perfilVisual.separacionFilaInferior,
    altoLinea: perfilVisual.altoLineaInferior
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
    mensajeVacio: "Sin certificaciones médicas para esta fecha",
    fuenteTitulo: perfilVisual.fuenteTituloInferior,
    fuenteContenido: perfilVisual.fuenteContenidoInferior,
    separacionFila: perfilVisual.separacionFilaInferior,
    altoLinea: perfilVisual.altoLineaInferior
  });

  return pdf;
};

export const obtenerDocumentoCalendarioPDF = (opciones) => {
  const pdf = crearCalendarioDiarioPDF(opciones);
  const fechaClave = obtenerClaveFechaPDF(opciones.fecha) || "fecha";
  const turno = String(opciones.turnoId || "turno").replace(/[^a-z0-9_-]/gi, "-");
  return {
    pdf,
    nombreArchivo: `calendario-diario-${fechaClave}-${turno}.pdf`,
    tipoDocumento: "calendario_diario"
  };
};

export const obtenerAdjuntoCalendarioPDF = (opciones) => {
  const documento = obtenerDocumentoCalendarioPDF(opciones);
  return {
    blob: documento.pdf.output("blob"),
    nombreArchivo: documento.nombreArchivo,
    tipoDocumento: documento.tipoDocumento
  };
};

export const exportarCalendarioPDF = (opciones) => {
  const documento = obtenerDocumentoCalendarioPDF(opciones);
  documento.pdf.save(documento.nombreArchivo);
};
