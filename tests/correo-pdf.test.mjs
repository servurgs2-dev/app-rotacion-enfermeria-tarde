import assert from "node:assert/strict";
import fs from "node:fs";
import {
  obtenerDocumentoCalendarioPDF,
  obtenerDocumentoPlanillaPDF
} from "../src/utils/exportPDF.js";
import {
  crearAsuntoCorreoPDF,
  convertirBlobABase64,
  LIMITE_PDF_CORREO_BYTES,
  validarFormularioCorreoPDF
} from "../src/utils/correoPDF.js";
import { CORREO_INSTITUCIONAL } from "../src/config/destinatariosCorreo.js";
import { obtenerSemanasDelMes } from "../src/utils/fechas.js";

let total = 0;
const probar = async (nombre, fn) => {
  await fn();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const exportPDF = leer("src/utils/exportPDF.js");
const app = leer("src/App.jsx");
const modal = leer("src/components/correo/ModalEnviarPDF.jsx");
const boton = leer("src/components/correo/BotonEnviarPDF.jsx");
const servicio = leer("src/services/enviarPDFCorreo.js");
const edge = leer("supabase/functions/enviar-pdf-correo/index.ts");
const migracion = leer("supabase/migrations/20260730_crear_auditoria_envios_correo_pdf.sql");
const destinatarios = leer("src/config/destinatariosCorreo.js");
const envEjemplo = leer("supabase/functions/.env.example");
const planillaOpciones = {
  planillaEnfermeros: {},
  planillaLicenciados: {},
  semanas: obtenerSemanasDelMes("2026-08"),
  personal: [],
  turnoId: "tarde",
  mesActivo: "2026-08"
};
const calendarioOpciones = {
  fecha: new Date(2026, 7, 12, 12),
  enfermeros: { asignaciones: [], libres: [] },
  licenciados: { asignaciones: [], libres: [] },
  certificaciones: [],
  personal: [],
  turnoId: "tarde",
  mesActivo: "2026-08"
};

await probar("1 descarga conserva el mismo constructor", () =>
  assert.match(exportPDF, /exportarPlanillaPDF[\s\S]*obtenerDocumentoPlanillaPDF/));
await probar("2 correo genera el mismo número de páginas", () => {
  const documento = obtenerDocumentoPlanillaPDF(planillaOpciones);
  assert.equal(documento.pdf.getNumberOfPages(), 3);
});
await probar("3 conserva nombre de archivo", () =>
  assert.equal(obtenerDocumentoPlanillaPDF(planillaOpciones).nombreArchivo, "planilla_mensual.pdf"));
await probar("4 conserva contenido principal", () => {
  const pdf = obtenerDocumentoCalendarioPDF(calendarioOpciones).pdf;
  assert.ok(pdf.output("arraybuffer").byteLength > 0);
});
await probar("5 modal exige destinatario", () =>
  assert.equal(validarFormularioCorreoPDF({ asunto: "Asunto" }).ok, false));
await probar("6 rechaza correo inválido", () =>
  assert.equal(validarFormularioCorreoPDF({ destinatario: "invalido", asunto: "Asunto" }).ok, false));
await probar("7 rechaza múltiples destinatarios", () =>
  assert.equal(validarFormularioCorreoPDF({ destinatario: "a@b.com,c@d.com", asunto: "Asunto" }).ok, false));
await probar("8 asunto obligatorio", () =>
  assert.equal(validarFormularioCorreoPDF({ destinatario: "a@b.com", asunto: "" }).ok, false));
await probar("9 mensaje respeta límite", () =>
  assert.equal(validarFormularioCorreoPDF({ destinatario: "a@b.com", asunto: "A", mensaje: "x".repeat(2001) }).ok, false));
await probar("10 botón institucional es el texto predeterminado", () =>
  assert.match(boton, /Enviar al mail institucional/));
await probar("11 no permite doble envío", () => assert.match(modal, /if \(procesando\) return/));
await probar("12 cancelar no genera PDF", () => {
  const cerrar = modal.slice(modal.indexOf("const cerrar"), modal.indexOf("return ("));
  assert.doesNotMatch(cerrar, /generarPDF/);
});
await probar("13 error de generación es controlado", () => assert.match(modal, /No se pudo enviar el correo/));
await probar("14 límite propio es 8 MB", () => assert.equal(LIMITE_PDF_CORREO_BYTES, 8 * 1024 * 1024));
await probar("15 conversión Base64 es correcta", async () => {
  const base64 = await convertirBlobABase64(new Blob(["PDF"], { type: "application/pdf" }));
  assert.equal(base64, "UERG");
});
await probar("16 invoca función con contexto", () =>
  assert.match(servicio, /functions\.invoke\("enviar-pdf-correo"[\s\S]*contexto/));
await probar("17 React no envía remitente", () => assert.doesNotMatch(servicio, /\bfrom\s*:/));
await probar("18 React no envía API key", () => assert.doesNotMatch(servicio, /BREVO_API_KEY/));
await probar("19 Edge Function exige JWT", () => {
  assert.match(edge, /Authorization/);
  assert.match(edge, /auth\.getUser/);
});
await probar("20 rechaza usuario fuera de allowlist", () =>
  assert.match(edge, /!permitidos\.includes\(authData\.user\.id\)/));
await probar("21 allowlist vacía falla seguro", () =>
  assert.match(edge, /if \(!permitidos\.length\)[\s\S]*503/));
await probar("22 falta BREVO_API_KEY falla seguro", () => assert.match(edge, /BREVO_API_KEY/));
await probar("23 faltan remitente Brevo falla seguro", () => {
  assert.match(edge, /BREVO_SENDER_EMAIL/);
  assert.match(edge, /BREVO_SENDER_NAME/);
  assert.match(edge, /CONFIG_INCOMPLETA/);
});
await probar("24 servidor revalida destinatario", () => assert.match(edge, /correoValido\(destinatario\)/));
await probar("25 servidor revalida asunto", () => assert.match(edge, /ASUNTO_INVALIDO/));
await probar("26 rechaza Base64 inválido", () => assert.match(edge, /BASE64_INVALIDO/));
await probar("27 rechaza MIME distinto", () => assert.match(edge, /mimeType !== "application\/pdf"/));
await probar("28 rechaza extensión distinta", () => assert.match(edge, /endsWith\("\.pdf"\)/));
await probar("29 rechaza tamaño inconsistente", () => assert.match(edge, /bytes\.length !== tamanoDeclarado/));
await probar("30 escapa mensaje", () => assert.match(edge, /escaparHtml\(mensaje/));
await probar("31 maneja OPTIONS y CORS", () => {
  assert.match(edge, /req\.method === "OPTIONS"/);
  assert.match(edge, /Access-Control-Allow-Origin/);
});
await probar("32 éxito devuelve messageId", () => assert.match(edge, /messageId: proveedor\.messageId/));
await probar("33 proveedor devuelve error controlado", () => assert.match(edge, /PROVEEDOR_ERROR/));
await probar("34 respuestas no devuelven secretos", () =>
  assert.doesNotMatch(edge, /responder\([^\n]*resendKey/));
await probar("35 no imprime Base64", () => assert.doesNotMatch(edge, /console\.(log|error)/));
await probar("36 auditoría no almacena PDF", () =>
  assert.doesNotMatch(migracion, /contenido_base64|pdf bytea|mensaje_completo/i));
await probar("37 auditoría registra éxito", () => assert.match(edge, /estado: "enviado"/));
await probar("38 auditoría registra error proveedor", () => assert.match(edge, /estado: "error"/));
await probar("39 PDF diario continúa en una página", () =>
  assert.equal(obtenerDocumentoCalendarioPDF(calendarioOpciones).pdf.getNumberOfPages(), 1));
await probar("40 PDF semanal conserva tres páginas", () =>
  assert.equal(obtenerDocumentoPlanillaPDF(planillaOpciones).pdf.getNumberOfPages(), 3));
await probar("41 PDF nocturno conserva A3 y paginación", () => {
  const doc = obtenerDocumentoPlanillaPDF({ ...planillaOpciones, turnoId: "noche" });
  assert.equal(doc.tipoDocumento, "rotacion_nocturna");
  assert.ok(doc.pdf.getNumberOfPages() >= 3);
});
await probar("42 hoja de grupos de libres no cambia", () => assert.match(exportPDF, /renderizarGruposLibresPDF/));
await probar("43 T6 y T3 siguen derivados por helper", () => assert.match(exportPDF, /obtenerFilasEfectivasPlanilla/));
await probar("44 estados históricos pueden generar adjunto", () =>
  assert.ok(obtenerDocumentoPlanillaPDF(planillaOpciones).pdf));
await probar("45 modal y botones están integrados", () => {
  assert.match(app, /BotonEnviarPDF/);
  assert.match(boton, /ModalEnviarPDF/);
});
await probar("46 no hay claves reales en archivos creados", () => {
  const conjunto = [edge, envEjemplo, leer("docs/CONFIGURAR_ENVIO_CORREO.md")].join("\n");
  assert.doesNotMatch(conjunto, /\b(?:re_[A-Za-z0-9]{20,}|xkeysib-[A-Za-z0-9_-]{20,})/);
});
await probar("47 la migración solo está versionada", () =>
  assert.match(migracion, /create table if not exists/));
await probar("48 no existe configuración de despliegue automático", () =>
  assert.doesNotMatch(JSON.stringify(JSON.parse(leer("package.json"))), /functions deploy/));
await probar("49 destinatario institucional fijo está configurado", () => {
  assert.equal(CORREO_INSTITUCIONAL, "caservurgs2@casmu.com");
  assert.match(destinatarios, /export const CORREO_INSTITUCIONAL/);
});
await probar("50 no existe selector de destinatarios", () =>
  assert.doesNotMatch(modal, /<select|destinos\.map|Destinatario configurado/));
await probar("51 no existe Otro correo", () => assert.doesNotMatch(modal, /Otro correo/));
await probar("52 el destinatario se muestra pero no es editable", () => {
  assert.match(modal, /Destinatario:[\s\S]*\{CORREO_INSTITUCIONAL\}/);
  assert.doesNotMatch(modal, /type="email"|setDestinatario/);
});
await probar("53 Edge Function usa Brevo sin código activo de Resend", () => {
  assert.match(edge, /https:\/\/api\.brevo\.com\/v3\/smtp\/email/);
  assert.doesNotMatch(edge, /api\.resend\.com|RESEND_API_KEY|EMAIL_FROM/);
});
await probar("54 payload Brevo conserva adjunto y remitente seguro", () => {
  assert.match(edge, /sender:\s*\{[\s\S]*email: brevoSenderEmail[\s\S]*name: brevoSenderName/);
  assert.match(edge, /to: \[\{ email: destinatario \}\]/);
  assert.match(edge, /htmlContent: html/);
  assert.match(edge, /attachment: \[\{ name: nombre, content: base64 \}\]/);
  assert.match(edge, /"api-key": brevoApiKey/);
  assert.doesNotMatch(servicio, /\bsender\s*:|\bfrom\s*:|replyTo|api-key/);
});
await probar("55 replyTo solo se agrega cuando es válido", () =>
  assert.match(edge, /if \(correoValido\(replyTo\)\) payload\.replyTo = \{ email: replyTo \}/));
await probar("56 auditoría identifica explícitamente a Brevo", () =>
  assert.match(edge, /proveedor: "brevo"/));
await probar("57 configuración activa solo requiere secrets de Brevo", () => {
  assert.match(envEjemplo, /BREVO_API_KEY=\s*\nBREVO_SENDER_EMAIL=\s*\nBREVO_SENDER_NAME=/);
  assert.doesNotMatch(envEjemplo, /RESEND_API_KEY|EMAIL_FROM/);
});
await probar("58 firma PDF continúa validándose", () => assert.match(edge, /%PDF-/));
await probar("59 éxito Brevo exige messageId no vacío", () => {
  assert.match(edge, /typeof proveedor\.messageId !== "string"/);
  assert.match(edge, /!proveedor\.messageId\.trim\(\)/);
});
await probar("60 el botón abre el mismo modal sin enviar automáticamente", () => {
  assert.match(boton, /onClick=\{\(\) => setAbierto\(true\)\}/);
  assert.match(boton, /<ModalEnviarPDF/);
  assert.doesNotMatch(boton, /enviarPDFCorreo|generarPDF\(\)/);
});
await probar("61 el modal mantiene bloqueos durante preparación y envío", () => {
  assert.match(modal, /estado === "preparando" \|\| estado === "enviando"/);
  assert.match(modal, /disabled=\{procesando\}/);
});
await probar("62 Calendario Diario usa el botón institucional reutilizable", () =>
  assert.match(app, /Exportar calendario PDF[\s\S]*<BotonEnviarPDF[\s\S]*obtenerAdjuntoCalendarioPDF/));
await probar("63 Planilla mensual usa el botón institucional reutilizable", () =>
  assert.match(app, /Exportar planilla PDF[\s\S]*<BotonEnviarPDF[\s\S]*obtenerAdjuntoPlanillaPDF/));
await probar("64 Rotación nocturna conserva el mismo botón y contexto", () => {
  assert.match(app, /tipo === "cada_3_dias" \? "Rotación nocturna" : "Planilla mensual"/);
  assert.equal(crearAsuntoCorreoPDF({
    tipoDocumento: "rotacion_nocturna",
    turnoId: "noche",
    mesActivo: "2026-08"
  }), "Turno Noche - Planilla mensual - Agosto 2026");
});
await probar("65 un fallo de auditoría no provoca un segundo envío", () => {
  assert.match(edge, /const registrarAuditoria = async[\s\S]*catch \{/);
  assert.equal((edge.match(/fetch\("https:\/\/api\.brevo\.com\/v3\/smtp\/email"/g) || []).length, 1);
});
await probar("66 el modal reinicia su formulario al abrir", () =>
  assert.match(modal, /useEffect\(\(\) => \{[\s\S]*if \(!abierto\) return undefined;[\s\S]*queueMicrotask/));
await probar("67 el reinicio depende de abierto y asunto actual", () =>
  assert.match(modal, /\}, \[abierto, asuntoInicial\]\)/));
await probar("68 el mensaje opcional se reinicia vacío", () => {
  assert.match(modal, /useState\(""\)/);
  assert.match(modal, /setMensaje\(""\)/);
  assert.match(modal, /placeholder="Agregar un mensaje opcional"/);
});
await probar("69 el asunto es visible y no editable", () => {
  assert.match(modal, /Asunto:[\s\S]*\{asuntoInicial\}/);
  assert.doesNotMatch(modal, /setAsunto|value=\{asunto\}/);
});
await probar("70 no existe segundo paso de confirmación", () =>
  assert.doesNotMatch(modal, /pasoConfirmacion|Confirmar envío|solicitarConfirmacion/));
await probar("71 Enviar genera y remite el PDF directamente", () => {
  assert.match(modal, /onClick=\{enviar\}/);
  assert.match(modal, /const adjunto = await generarPDF\(\)[\s\S]*await enviarPDFCorreo/);
});
await probar("72 limpia errores y resultado anterior", () => {
  assert.match(modal, /setError\(""\)/);
  assert.match(modal, /setExito\(""\)/);
});
await probar("73 restaura el estado normal", () =>
  assert.match(modal, /setEstado\("normal"\)/));
await probar("74 Calendario usa turno y fecha del documento", () =>
  assert.equal(crearAsuntoCorreoPDF({
    tipoDocumento: "calendario_diario",
    turnoId: "vespertino",
    fecha: new Date(2026, 6, 31, 12),
    mesActivo: "2026-07"
  }), "Turno Vespertino - Calendario diario - 31/07/2026"));
await probar("74b Calendario distingue Tarde de Vespertino", () => {
  const fecha = new Date(2026, 7, 1, 12);
  assert.equal(crearAsuntoCorreoPDF({
    tipoDocumento: "calendario_diario",
    turnoId: "tarde",
    fecha
  }), "Turno Tarde - Calendario diario - 01/08/2026");
  assert.equal(crearAsuntoCorreoPDF({
    tipoDocumento: "calendario_diario",
    turnoId: "vespertino",
    fecha
  }), "Turno Vespertino - Calendario diario - 01/08/2026");
});
await probar("74c Calendario conserva Mañana y Noche", () => {
  const fecha = new Date(2026, 7, 1, 12);
  assert.equal(crearAsuntoCorreoPDF({
    tipoDocumento: "calendario_diario",
    turnoId: "manana",
    fecha
  }), "Turno Mañana - Calendario diario - 01/08/2026");
  assert.equal(crearAsuntoCorreoPDF({
    tipoDocumento: "calendario_diario",
    turnoId: "noche",
    fecha
  }), "Turno Noche - Calendario diario - 01/08/2026");
});
await probar("75 Planilla usa turno y mes activo", () =>
  assert.equal(crearAsuntoCorreoPDF({
    tipoDocumento: "planilla_mensual",
    turnoId: "tarde",
    mesActivo: "2026-08"
  }), "Turno Tarde - Planilla mensual - Agosto 2026"));
await probar("76 el éxito identifica el correo institucional", () =>
  assert.match(modal, /Correo enviado correctamente a \$\{CORREO_INSTITUCIONAL\}/));
await probar("77 no conserva tamaño ni texto temporal al reabrir", () => {
  assert.match(modal, /setTamanoAdjunto\(null\)/);
  assert.match(modal, /setMensaje\(""\)/);
});

console.log(`\n${total} pruebas de correo PDF pasaron.`);
