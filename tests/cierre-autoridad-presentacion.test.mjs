import assert from "node:assert/strict";
import fs from "node:fs";
import { resolverCertificacionesCalendarioPDF } from "../src/utils/exportPDF.js";

const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");
const modalCorreo = fs.readFileSync("src/components/correo/ModalEnviarPDF.jsx", "utf8");

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

probar("Calendario resuelve una autoridad común de presentación", () => {
  assert.match(calendario, /resolverDatosPresentacionCierreTurno\(\{[\s\S]*snapshot: snapshotPresentacion/);
});

probar("datos PDF usan las asignaciones de la autoridad común", () => {
  assert.match(calendario, /const asignacionesParaPDF = asignacionesMostradas\.map/);
  assert.match(calendario, /resumenInicio:\s*\{[\s\S]*asignaciones: asignacionesMostradas/);
});

probar("snapshot cerrado evita decoraciones reconstruidas posteriores", () => {
  assert.match(calendario, /if \(snapshotPresentacion\) return item/);
});

probar("snapshot gobierna asistencia y listas congeladas", () => {
  for (const campo of [
    "personasPrevistasMostradas",
    "asistenciaMostrada",
    "libresMostrados",
    "licenciasMostradas",
    "certificacionesMostradas",
    "noDisponiblesMostrados",
    "extrasMostrados"
  ]) assert.match(calendario, new RegExp(`const ${campo} = datosPresentacionDia\\.`));
});

probar("día con snapshot muestra Fotografía guardada", () => {
  assert.match(calendario, /snapshotPresentacion && \([\s\S]*Fotografía guardada/);
});

probar("histórico sin snapshot declara reconstrucción", () => {
  assert.match(calendario, /modoHistorico && !snapshotPresentacion && \([\s\S]*Reconstruido a partir de registros disponibles/);
});

probar("App propaga el estado histórico a ambas categorías", () => {
  assert.ok((app.match(/modoHistorico=\{mesHistoricoCerradoActivo\}/g) || []).length >= 2);
});

probar("exportación y correo comparten dataPDF", () => {
  assert.match(app, /exportarCalendarioPDF\(\{[\s\S]*enfermeros: dataPDFEnf,[\s\S]*licenciados: dataPDFLic/);
  assert.match(app, /obtenerAdjuntoCalendarioPDF\(\{[\s\S]*enfermeros: dataPDFEnf,[\s\S]*licenciados: dataPDFLic/);
});

probar("correo envía el adjunto generado sin segunda representación", () => {
  assert.match(modalCorreo, /const adjunto = await generarPDF\(\)/);
  assert.match(modalCorreo, /enviarPDFCorreo\(\{[\s\S]*blob: adjunto\.blob/);
});

probar("PDF usa certificaciones congeladas sólo para la categoría cerrada", () => {
  const resultado = resolverCertificacionesCalendarioPDF({
    enfermeros: {
      certificacionesCongeladas: [{ personaId: "enf-cierre", nombre: "Enfermera Cierre" }]
    },
    licenciados: {},
    certificaciones: [{
      personaId: "enf-actual",
      nombre: "Enfermera Actual",
      desde: "2026-08-13",
      hasta: "2026-08-13"
    }, {
      personaId: "lic-actual",
      nombre: "Licenciado Actual",
      desde: "2026-08-13",
      hasta: "2026-08-13"
    }],
    fecha: new Date(2026, 7, 13, 12),
    personal: [
      { id: "enf-actual", nombre: "Enfermera Actual", categoria: "enfermero" },
      { id: "lic-actual", nombre: "Licenciado Actual", categoria: "licenciado" }
    ]
  });
  assert.deepEqual(resultado.map(({ nombre }) => nombre), ["Licenciado Actual", "Enfermera Cierre"]);
  assert.ok(!resultado.some(({ nombre }) => nombre === "Enfermera Actual"));
});

console.log(`\n${total} pruebas de autoridad de presentación del cierre pasaron.`);
