import assert from "node:assert/strict";
import fs from "node:fs";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

const app = fs.readFileSync("src/App.jsx", "utf8");
const novedades = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
const reporte = fs.readFileSync("src/components/novedades/ReporteNovedades.jsx", "utf8");
const navegacion = fs.readFileSync("src/components/layout/NavegacionPrincipal.jsx", "utf8");
const utilidades = fs.readFileSync("src/utils/novedadesPersonal.js", "utf8");
const inicioVista = app.indexOf('<div id="novedades-principal"');
const finVista = app.indexOf('subvistaMas === "gestionMes"', inicioVista);
const vistaNovedades = app.slice(inicioVista, finVista);

probar("Novedades es una vista principal con encabezado estático", () => {
  assert.ok(inicioVista >= 0 && finVista > inicioVista);
  assert.match(vistaNovedades, /vistaActiva === "novedades" \? "" : "hidden"/);
  assert.match(vistaNovedades, /<h2[^>]*>📋 Novedades<\/h2>/);
  assert.equal((app.match(/<Novedades/g) || []).length, 1);
});

probar("la vista ya no depende de Seccion ni de scroll vertical artificial", () => {
  assert.doesNotMatch(vistaNovedades, /<Seccion|defaultAbierto/);
  assert.doesNotMatch(vistaNovedades, /max-h-|overflow-y-auto|overscroll-contain/);
});

probar("conserva las seis acciones operativas", () => {
  for (const etiqueta of [
    "Licencia",
    "Certificación",
    "Suspensión",
    "Lista de paro",
    "Cambio de horario",
    "Olvido de tarjeta"
  ]) {
    assert.ok(novedades.includes(`"${etiqueta}"`), etiqueta);
  }
});

probar("Otra y Excedente permanecen fuera de la UI operativa", () => {
  assert.match(novedades, /OPCIONES_TIPO_NOVEDAD_OPERATIVAS/);
  assert.doesNotMatch(novedades, /\["otra",\s*"Otra"|\["excedente",\s*"Excedente"/i);
  assert.match(utilidades, /OTRA:\s*"otra"/);
  assert.match(utilidades, /EXCEDENTE:\s*"excedente"/);
});

probar("Reporte y PDF continúan montados desde Novedades", () => {
  assert.match(novedades, /<ReporteNovedades/);
  assert.match(novedades, /reporteAbierto/);
  assert.match(reporte, /exportarReporteNovedadesPDF/);
  assert.match(reporte, /Exportar PDF/);
});

probar("Licencias y Certificaciones conservan la proyección legacy", () => {
  assert.match(novedades, /crearNovedadesLegacy/);
  assert.match(novedades, /licencias_legacy/);
  assert.match(novedades, /certificaciones_legacy/);
  assert.match(vistaNovedades, /onEditarLicencia/);
  assert.match(vistaNovedades, /onEditarCertificacion/);
});

probar("histórico conserva solo lectura y bloquea formularios", () => {
  assert.match(vistaNovedades, /soloLectura=\{modoSoloLecturaEfectiva\}/);
  assert.match(novedades, /!soloLectura/);
  assert.match(novedades, /novedad\.soloLectura/);
  assert.match(novedades, /Registro histórico vigente/);
});

probar("formularios, filtros y navegación interna permanecen", () => {
  assert.match(novedades, /accionAbierta/);
  assert.match(novedades, /reporteAbierto/);
  assert.match(novedades, /Filtrar por fecha/);
  assert.match(novedades, /Filtrar por tipo/);
  assert.match(novedades, /FormularioRangoPersona/);
  assert.match(novedades, /FormularioCambioHorario/);
  assert.match(novedades, /FormularioOlvidoTarjeta/);
  assert.match(novedades, /ListaParo/);
});

probar("no agrega Router ni persistencia para la pantalla", () => {
  assert.doesNotMatch(novedades, /react-router|BrowserRouter|useNavigate|localStorage/);
  assert.doesNotMatch(vistaNovedades, /key=\{.*vistaActiva/);
});

probar("la navegación principal conserva cinco accesos", () => {
  assert.deepEqual(
    [...navegacion.matchAll(/\{ id: "([^"]+)"/g)].map((coincidencia) => coincidencia[1]),
    ["inicio", "calendario", "planilla", "novedades", "mas"]
  );
});

console.log(`\n${aprobadas} pruebas de Novedades mobile pasaron.`);
