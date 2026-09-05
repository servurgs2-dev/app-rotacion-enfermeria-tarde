import assert from "node:assert/strict";
import fs from "node:fs";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

const app = fs.readFileSync("src/App.jsx", "utf8");
const planilla = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
const inicio = app.indexOf('<div id="planilla-principal"');
const fin = app.indexOf('<div id="novedades-principal"', inicio);
const vistaPlanilla = app.slice(inicio, fin);

probar("Planilla es una vista principal y ya no depende de Seccion", () => {
  assert.ok(inicio >= 0 && fin > inicio);
  assert.match(vistaPlanilla, /<h2[^>]*>📊 Planilla mensual<\/h2>/);
  assert.doesNotMatch(vistaPlanilla, /<Seccion|defaultAbierto/);
});

probar("el contenedor principal usa el scroll natural de la página", () => {
  assert.doesNotMatch(vistaPlanilla, /max-h-|overflow-y-auto|overscroll-contain/);
});

probar("la tabla conserva su desplazamiento horizontal legítimo", () => {
  assert.equal((planilla.match(/overflow-x-auto/g) || []).length, 1);
  assert.match(planilla, /<div className="overflow-x-auto[^\"]*">/);
  assert.match(planilla, /<table className="min-w-\[900px\][^\"]*border-separate border-spacing-0/);
  assert.doesNotMatch(vistaPlanilla, /overflow-x-hidden/);
});

probar("la primera columna tiene la estructura necesaria para sticky horizontal", () => {
  assert.equal((planilla.match(/<table/g) || []).length, 1);
  assert.match(planilla, /<th className="sticky left-0 z-20[^\"]*w-\[140px\][^\"]*min-w-\[140px\][^\"]*max-w-\[140px\][^\"]*bg-slate-100[^\"]*md:w-\[180px\][^\"]*">\s*Sector/);
  assert.match(planilla, /<td className="sticky left-0 z-10[^\"]*w-\[140px\][^\"]*min-w-\[140px\][^\"]*max-w-\[140px\][^\"]*bg-slate-50/);
  assert.match(planilla, /<td className="sticky left-0 z-10[^\"]*w-\[140px\][^\"]*min-w-\[140px\][^\"]*max-w-\[140px\][^\"]*bg-blue-50/);
  assert.match(planilla, /border-r[^\"]*shadow-\[/);
  assert.doesNotMatch(planilla, /<table[^>]*overflow-hidden/);
});

probar("el selector mobile controla la categoría de Planilla", () => {
  assert.match(vistaPlanilla, /aria-label="Categoría de la Planilla"/);
  assert.match(vistaPlanilla, /aria-pressed=\{tabPlanilla === "enfermeros"\}/);
  assert.match(vistaPlanilla, /aria-pressed=\{tabPlanilla === "licenciados"\}/);
  assert.match(vistaPlanilla, /setTabPlanilla\("enfermeros"\)/);
  assert.match(vistaPlanilla, /setTabPlanilla\("licenciados"\)/);
  assert.doesNotMatch(vistaPlanilla, /setTabCalendario|tabCalendario/);
});

probar("cada categoría conserva editor legacy y editor versionado sin duplicar el render activo", () => {
  assert.equal((vistaPlanilla.match(/<PlanillaMensual\s/g) || []).length, 4);
  assert.equal((vistaPlanilla.match(/<PlanillaMensualPorTramos\s/g) || []).length, 2);
  assert.match(vistaPlanilla, /tabPlanilla === "enfermeros" && \(/);
  assert.match(vistaPlanilla, /tabPlanilla === "licenciados" && \(/);
});

probar("mes, turno, licencias e histórico siguen conectados", () => {
  assert.equal((vistaPlanilla.match(/mesActivo=\{mesActivo\}/g) || []).length, 6);
  assert.equal((vistaPlanilla.match(/turnoId=\{turnoActivo\}/g) || []).length, 6);
  assert.equal((vistaPlanilla.match(/licencias=\{licenciasMes\}/g) || []).length, 4);
  assert.equal((vistaPlanilla.match(/soloLectura=\{modoSoloLecturaEfectiva\}/g) || []).length, 2);
});

probar("acciones y exportación permanecen disponibles", () => {
  assert.match(vistaPlanilla, /exportarPlanillaPDF/);
  assert.match(vistaPlanilla, /<BotonEnviarPDF/);
  assert.match(planilla, /Vaciar desde Semana 2/);
  assert.match(planilla, /Vaciar planilla/);
  assert.match(planilla, /Turnante mensual adicional/);
});

probar("la interacción y configuración productiva permanecen en PlanillaMensual", () => {
  assert.match(planilla, /validarIntercambioPlanilla/);
  assert.match(planilla, /aplicarIntercambioPlanilla/);
  assert.match(planilla, /setPlanilla\(\(prev\)/);
  assert.match(planilla, /configuracionEfectiva/);
});

probar("desktop conserva el selector y la estructura productiva", () => {
  assert.match(vistaPlanilla, /hidden gap-2 md:flex/);
  assert.match(planilla, /<table/);
});

console.log(`\n${aprobadas} pruebas de Planilla mobile pasaron.`);
