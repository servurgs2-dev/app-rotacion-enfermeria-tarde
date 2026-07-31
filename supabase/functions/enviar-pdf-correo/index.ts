import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};
const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS = new Set(["calendario_diario", "planilla_mensual", "rotacion_nocturna"]);
const correoValido = (valor: unknown) =>
  typeof valor === "string" &&
  valor.length <= 254 &&
  !/[\r\n,;]/.test(valor) &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
const responder = (status: number, codigo: string, mensaje: string, extra = {}) =>
  new Response(JSON.stringify({ ok: status < 400, codigo, mensaje, ...extra }), {
    status,
    headers: corsHeaders
  });
const escaparHtml = (valor: string) => valor
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const decodificarBase64 = (valor: string) => {
  if (!valor || !/^[A-Za-z0-9+/]*={0,2}$/.test(valor) || valor.length % 4 !== 0) {
    return null;
  }
  try {
    return Uint8Array.from(atob(valor), (caracter) => caracter.charCodeAt(0));
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responder(405, "METODO_INVALIDO", "Método no permitido.");

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return responder(401, "NO_AUTENTICADO", "La sesión no es válida.");
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey) {
    return responder(503, "CONFIG_INCOMPLETA", "El servicio de correo no está configurado.");
  }
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) {
    return responder(401, "NO_AUTENTICADO", "La sesión no es válida.");
  }

  const permitidos = (Deno.env.get("EMAIL_ALLOWED_USER_IDS") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!permitidos.length) {
    return responder(503, "CONFIG_ALLOWLIST", "El servicio de correo no está configurado.");
  }
  if (!permitidos.includes(authData.user.id)) {
    return responder(403, "NO_AUTORIZADO", "Tu usuario no está autorizado para enviar correos.");
  }

  const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";
  const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "";
  const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME") || "";
  if (!brevoApiKey || !brevoSenderEmail || !brevoSenderName || !serviceRoleKey) {
    return responder(503, "CONFIG_INCOMPLETA", "El servicio de correo no está configurado.");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return responder(400, "JSON_INVALIDO", "Los datos enviados no son válidos.");
  }
  const destinatario = typeof body.destinatario === "string" ? body.destinatario.trim() : "";
  const asunto = typeof body.asunto === "string" ? body.asunto.trim() : "";
  const mensaje = typeof body.mensaje === "string" ? body.mensaje : "";
  const archivo = body.archivo as Record<string, unknown> | undefined;
  const contexto = body.contexto as Record<string, unknown> | undefined;
  if (!correoValido(destinatario)) {
    return responder(400, "DESTINATARIO_INVALIDO", "El destinatario no es válido.");
  }
  if (!asunto || asunto.length > 150 || /[\r\n]/.test(asunto)) {
    return responder(400, "ASUNTO_INVALIDO", "El asunto no es válido.");
  }
  if (mensaje.length > 2000) {
    return responder(400, "MENSAJE_INVALIDO", "El mensaje supera el límite permitido.");
  }
  const nombre = typeof archivo?.nombre === "string" ? archivo.nombre : "";
  const base64 = typeof archivo?.contenidoBase64 === "string" ? archivo.contenidoBase64 : "";
  const tamanoDeclarado = Number(archivo?.tamanoBytes);
  if (!nombre.toLowerCase().endsWith(".pdf") || archivo?.mimeType !== "application/pdf") {
    return responder(400, "ARCHIVO_INVALIDO", "El archivo debe ser un PDF.");
  }
  const bytes = decodificarBase64(base64);
  if (!bytes?.length || !Number.isInteger(tamanoDeclarado) || bytes.length !== tamanoDeclarado) {
    return responder(400, "BASE64_INVALIDO", "El contenido del PDF no es válido.");
  }
  if (bytes.length > MAX_BYTES) {
    return responder(413, "ARCHIVO_GRANDE", "El PDF supera el tamaño permitido.");
  }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    return responder(400, "ARCHIVO_INVALIDO", "El archivo adjunto no contiene un PDF válido.");
  }
  const tipoDocumento = typeof contexto?.tipoDocumento === "string"
    ? contexto.tipoDocumento
    : "";
  if (!TIPOS.has(tipoDocumento)) {
    return responder(400, "CONTEXTO_INVALIDO", "El tipo de documento no es válido.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
  const registrarAuditoria = async (registro: Record<string, unknown>) => {
    try {
      await admin.from("envios_correo_pdf").insert(registro);
    } catch {
      // El resultado confirmado por el proveedor no debe provocar un reenvío
      // si la auditoría no está disponible temporalmente.
    }
  };
  const auditoriaBase = {
    usuario_id: authData.user.id,
    usuario_email: authData.user.email || null,
    destinatario,
    asunto,
    nombre_archivo: nombre,
    tipo_documento: tipoDocumento,
    mes: typeof contexto?.mes === "string" ? contexto.mes : null,
    turno: typeof contexto?.turno === "string" ? contexto.turno : null,
    categoria: typeof contexto?.categoria === "string" ? contexto.categoria : null,
    fecha_documento: typeof contexto?.fecha === "string" ? contexto.fecha : null,
    tamano_bytes: bytes.length,
    proveedor: "brevo"
  };
  const html = `<p>${escaparHtml(mensaje || "Se adjunta el documento generado desde la aplicación.").replaceAll("\n", "<br>")}</p><p>Enviado desde App Urgencias.</p>`;
  const payload: Record<string, unknown> = {
    sender: {
      email: brevoSenderEmail,
      name: brevoSenderName
    },
    to: [{ email: destinatario }],
    subject: asunto,
    htmlContent: html,
    attachment: [{ name: nombre, content: base64 }]
  };
  const replyTo = Deno.env.get("EMAIL_REPLY_TO") || "";
  if (correoValido(replyTo)) payload.replyTo = { email: replyTo };

  try {
    const respuesta = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const proveedor = await respuesta.json().catch(() => ({})) as { messageId?: unknown };
    if (
      !respuesta.ok ||
      typeof proveedor.messageId !== "string" ||
      !proveedor.messageId.trim()
    ) {
      await registrarAuditoria({
        ...auditoriaBase,
        estado: "error",
        error_codigo: "PROVEEDOR_ERROR",
        error_mensaje: "El proveedor rechazó el envío."
      });
      return responder(502, "PROVEEDOR_ERROR", "No se pudo enviar el correo. Intentá nuevamente.");
    }
    await registrarAuditoria({
      ...auditoriaBase,
      estado: "enviado",
      proveedor_message_id: proveedor.messageId
    });
    return responder(200, "ENVIADO", "Correo enviado correctamente.", {
      messageId: proveedor.messageId
    });
  } catch {
    await registrarAuditoria({
      ...auditoriaBase,
      estado: "error",
      error_codigo: "PROVEEDOR_NO_DISPONIBLE",
      error_mensaje: "No fue posible contactar al proveedor."
    });
    return responder(502, "PROVEEDOR_NO_DISPONIBLE", "No se pudo enviar el correo. Intentá nuevamente.");
  }
});
