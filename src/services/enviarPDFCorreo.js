import { supabase } from "../supabase.js";
import {
  convertirBlobABase64,
  LIMITE_PDF_CORREO_BYTES,
  validarFormularioCorreoPDF
} from "../utils/correoPDF.js";

const mensajeSeguro = (codigo, estado) => {
  if (estado === 401) return "La sesión venció. Volvé a ingresar.";
  if (estado === 403) return "Tu usuario no está autorizado para enviar correos.";
  if (estado === 413) return "El PDF supera el tamaño permitido.";
  if (estado === 503) return "El servicio de correo no está configurado.";
  if (codigo === "DESTINATARIO_INVALIDO") return "El destinatario no es válido.";
  return "No se pudo enviar el correo. Intentá nuevamente.";
};

export const enviarPDFCorreo = async ({
  destinatario,
  asunto,
  mensaje,
  blob,
  nombreArchivo,
  contexto
} = {}) => {
  const formulario = validarFormularioCorreoPDF({ destinatario, asunto, mensaje });
  if (!formulario.ok) throw new Error(formulario.mensaje);
  if (!(blob instanceof Blob) || blob.type !== "application/pdf") {
    throw new Error("No se pudo generar el PDF.");
  }
  if (!blob.size) throw new Error("No se pudo generar el PDF.");
  if (blob.size > LIMITE_PDF_CORREO_BYTES) {
    throw new Error("No se puede enviar el PDF porque supera el tamaño permitido.");
  }
  if (!supabase) {
    throw new Error("El servicio de correo no está configurado.");
  }
  const contenidoBase64 = await convertirBlobABase64(blob);
  const { data, error } = await supabase.functions.invoke("enviar-pdf-correo", {
    body: {
      destinatario: formulario.destinatario,
      asunto: formulario.asunto,
      mensaje: formulario.mensaje,
      archivo: {
        nombre: nombreArchivo,
        mimeType: "application/pdf",
        contenidoBase64,
        tamanoBytes: blob.size
      },
      contexto
    }
  });
  if (error || !data?.ok) {
    const estado = error?.context?.status;
    throw new Error(mensajeSeguro(data?.codigo, estado));
  }
  return data;
};
