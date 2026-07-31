export const LIMITE_PDF_CORREO_BYTES = 8 * 1024 * 1024;
const PATRON_CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

const NOMBRES_TURNO_CORREO = {
  manana: "Mañana",
  tarde: "Vespertino",
  vespertino: "Vespertino",
  noche: "Noche"
};

export const obtenerNombreTurnoCorreo = (turnoId) =>
  NOMBRES_TURNO_CORREO[turnoId] || String(turnoId || "");

export const formatearMesCorreo = (mesActivo) => {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(String(mesActivo || ""));
  if (!coincidencia) return String(mesActivo || "");
  const fecha = new Date(Number(coincidencia[1]), Number(coincidencia[2]) - 1, 1);
  const mes = new Intl.DateTimeFormat("es-UY", { month: "long" }).format(fecha);
  const mesVisible = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${mesVisible} ${coincidencia[1]}`;
};

const formatearFechaCorreo = (fecha) => {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return "";
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()}`;
};

export const crearAsuntoCorreoPDF = ({
  tipoDocumento,
  turnoId,
  fecha,
  mesActivo
} = {}) => {
  const turno = obtenerNombreTurnoCorreo(turnoId);
  if (tipoDocumento === "calendario_diario") {
    return `Turno ${turno} - Calendario diario - ${formatearFechaCorreo(fecha)}`;
  }
  return `Turno ${turno} - Planilla mensual - ${formatearMesCorreo(mesActivo)}`;
};

export const validarFormularioCorreoPDF = ({
  destinatario,
  asunto,
  mensaje = ""
} = {}) => {
  const correo = String(destinatario || "").trim();
  const titulo = String(asunto || "").trim();
  const texto = String(mensaje || "");
  if (
    !correo ||
    correo.length > 254 ||
    /[\r\n,;]/.test(correo) ||
    !PATRON_CORREO.test(correo)
  ) {
    return { ok: false, campo: "destinatario", mensaje: "El destinatario no es válido." };
  }
  if (!titulo || titulo.length > 150 || /[\r\n]/.test(titulo)) {
    return { ok: false, campo: "asunto", mensaje: "El asunto debe tener entre 1 y 150 caracteres." };
  }
  if (texto.length > 2000) {
    return { ok: false, campo: "mensaje", mensaje: "El mensaje no puede superar 2000 caracteres." };
  }
  return { ok: true, destinatario: correo, asunto: titulo, mensaje: texto };
};

export const convertirBlobABase64 = async (blob) => {
  if (!(blob instanceof Blob)) throw new Error("PDF_INVALIDO");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = "";
  const bloque = 0x8000;
  for (let indice = 0; indice < bytes.length; indice += bloque) {
    binario += String.fromCharCode(...bytes.subarray(indice, indice + bloque));
  }
  return btoa(binario);
};
