import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { crearEstadoVersionadoDesdeLegacy, crearEstadoVersionadoDesdeVersionado } from "../src/utils/transicionPreparacionesMes.js";
import {
  ejecutarExportacionPlanillaPDF,
  obtenerAdjuntoPlanillaPDF,
  obtenerDocumentoCalendarioPDF,
  obtenerDocumentoPlanillaPDF
} from "../src/utils/exportPDF.js";
import { habilitarTurnanteMensual } from "../src/utils/turnanteMensual.js";

let total = 0;
const probar = async (nombre, prueba) => { await prueba(); total += 1; console.log(`✓ ${nombre}`); };
const mes = "2026-09";
const legacy = (turno = "tarde") => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "e1", nombre: "E", categoria: "enfermero" }, { id: "l1", nombre: "L", categoria: "licenciado" }];
  const planilla = (id) => ({ semana1: { "REA 1": { personaId: id } }, semana2: {}, semana3: {}, semana4: {}, semana5: {}, semana6: {} });
  estado.planillas = { enfermeros: planilla("e1"), licenciados: planilla("l1") };
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({ turno, categoria: "enfermero", mes }),
    licenciado: crearSnapshotConfiguracionPlanilla({ turno, categoria: "licenciado", mes })
  };
  return estado;
};
const versionar = (turno = "tarde") => crearEstadoVersionadoDesdeLegacy({ estado: legacy(turno), mes, desde: "2026-09-04", fechaReferencia: "2026-09-04" }).estado;
const opciones = (estado, turnoId = "tarde") => ({
  planillaEnfermeros: estado.planillas.enfermeros,
  planillaLicenciados: estado.planillas.licenciados,
  personal: estado.personal,
  turnoId,
  mesActivo: mes,
  estadoMensual: estado
});

const estadoLegacy = legacy();
const estadoAB = versionar();
const estadoABC = crearEstadoVersionadoDesdeVersionado({ estado: estadoAB, mes, desde: "2026-09-15", fechaReferencia: "2026-09-04" }).estado;
await probar("PDF legacy sigue funcionando", () => assert.equal(obtenerDocumentoPlanillaPDF(opciones(estadoLegacy)).tipoDocumento, "planilla_mensual"));
await probar("A/B genera documento versionado", () => assert.equal(obtenerDocumentoPlanillaPDF(opciones(estadoAB)).tipoDocumento, "planilla_mensual_versionada"));
await probar("A/B/C genera documento versionado", () => assert.equal(obtenerDocumentoPlanillaPDF(opciones(estadoABC)).tipoDocumento, "planilla_mensual_versionada"));
await probar("handler productivo llama exportación", () => { let llamadas = 0; const r = ejecutarExportacionPlanillaPDF({ opciones: opciones(estadoAB), exportar: () => { llamadas += 1; } }); assert.equal(r.ok, true); assert.equal(llamadas, 1); });
await probar("handler no retorna antes en versionado", () => assert.equal(ejecutarExportacionPlanillaPDF({ opciones: opciones(estadoABC), exportar: () => {} }).codigo, "PDF_PLANILLA_EXPORTADO"));
await probar("selección visual no limita el PDF mensual", async () => assert.match(await readFile(new URL("../src/App.jsx", import.meta.url), "utf8"), /estadoMensual: mesData/));
await probar("PDF usa el mes completo", () => assert.equal(obtenerDocumentoPlanillaPDF(opciones(estadoABC)).pdf.getNumberOfPages() > 0, true));
const nocheAB = versionar("noche");
await probar("Noche A/B sin bloques distribuidos genera PDF", () => assert.equal(obtenerDocumentoPlanillaPDF(opciones(nocheAB, "noche")).tipoDocumento, "planilla_mensual_versionada"));
const nocheABC = crearEstadoVersionadoDesdeVersionado({ estado: nocheAB, mes, desde: "2026-09-15", fechaReferencia: "2026-09-04" }).estado;
await probar("Noche A/B/C genera PDF", () => assert.equal(obtenerDocumentoPlanillaPDF(opciones(nocheABC, "noche")).pdf.getNumberOfPages() > 0, true));
await probar("T6 no rompe generación versionada", () => { const estado = structuredClone(estadoAB); estado.preparaciones[1].categorias.enfermero.planilla = habilitarTurnanteMensual(estado.preparaciones[1].categorias.enfermero.planilla, "enfermero", estado.preparaciones[1].categorias.enfermero.configuracion); assert.equal(obtenerDocumentoPlanillaPDF(opciones(estado)).tipoDocumento, "planilla_mensual_versionada"); });
await probar("T4 no rompe generación versionada", () => { const estado = structuredClone(estadoAB); const config = { ...estado.preparaciones[1].categorias.licenciado.configuracion, estructuraLicenciadosVersion: 2 }; estado.preparaciones[1].categorias.licenciado.configuracion = config; estado.preparaciones[1].categorias.licenciado.planilla = habilitarTurnanteMensual(estado.preparaciones[1].categorias.licenciado.planilla, "licenciado", config); assert.equal(obtenerDocumentoPlanillaPDF(opciones(estado)).tipoDocumento, "planilla_mensual_versionada"); });
await probar("preparación sin distribuir no produce silencio", () => assert.equal(obtenerDocumentoPlanillaPDF(opciones(nocheAB, "noche")).pdf.getNumberOfPages() > 0, true));
await probar("error real devuelve feedback", () => { let mensaje = ""; const r = ejecutarExportacionPlanillaPDF({ opciones: {}, exportar: () => { const e = new Error("fallo"); e.codigo = "FALLO_PRUEBA"; throw e; }, onError: (valor) => { mensaje = valor; } }); assert.equal(r.ok, false); assert.equal(r.codigo, "FALLO_PRUEBA"); assert.match(mensaje, /No se pudo generar/); });
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
await probar("botón no queda disabled indebidamente", () => assert.doesNotMatch(app, /Exportar planilla PDF[\s\S]{0,120}disabled/));
await probar("click usa handler y feedback visible", () => { assert.match(app, /ejecutarExportacionPlanillaPDF/); assert.match(app, /errorExportacionPlanilla[\s\S]*role="alert"/); });
await probar("PDF Calendario mantiene contrato independiente", () => assert.equal(obtenerDocumentoCalendarioPDF({ turnoId: "tarde", fecha: new Date(2026, 8, 4), personal: [], enfermeros: {}, licenciados: {} }).tipoDocumento, "calendario_diario"));
await probar("correo obtiene el mismo adjunto versionado", () => assert.equal(obtenerAdjuntoPlanillaPDF(opciones(estadoABC)).tipoDocumento, "planilla_mensual_versionada"));

console.log(`\n${total} comprobaciones de Etapa 40E.3.1 superadas.`);
