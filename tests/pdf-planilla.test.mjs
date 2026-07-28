import assert from "node:assert/strict";
import fs from "node:fs";
import {
  obtenerPeriodosPlanillaPDF,
  prepararTablaPlanillaPDF
} from "../src/utils/exportPDF.js";
import { configuracionSectores } from "../src/data/sectores.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const fuente = fs.readFileSync(
  new URL("../src/utils/exportPDF.js", import.meta.url),
  "utf8"
);
const inicioSemanal = fuente.indexOf("const estrategiaSemanal");
const finSemanal = fuente.indexOf('pdf.save("planilla_mensual.pdf")', inicioSemanal);
const flujoSemanal = fuente.slice(inicioSemanal, finSemanal);
const llamadaEnfermeros = flujoSemanal.indexOf('categoria: "enfermero"');
const separacion = flujoSemanal.indexOf("pdf.addPage()", llamadaEnfermeros);
const llamadaLicenciados = flujoSemanal.indexOf('categoria: "licenciado"', separacion);

probar("1 Enfermeros se genera primero", () => {
  assert.ok(llamadaEnfermeros >= 0);
});
probar("2 Licenciados se genera después", () => {
  assert.ok(llamadaLicenciados > llamadaEnfermeros);
});
probar("3 existe separación explícita entre categorías", () => {
  assert.ok(separacion > llamadaEnfermeros && separacion < llamadaLicenciados);
});
probar("4 Licenciados inicia con posición propia", () => {
  assert.doesNotMatch(flujoSemanal, /finalY|lastAutoTable\.finalY \+ 10/);
  assert.match(fuente, /startY: 28/);
});
probar("5 cada categoría tiene título claro", () => {
  assert.match(fuente, /Planilla semanal - \$\{etiquetaCategoria\}/);
  assert.match(fuente, /Planilla semanal - Enfermeros/);
  assert.match(fuente, /Planilla semanal - Licenciados/);
});
probar("6 cada página repite encabezado", () => {
  assert.match(fuente, /showHead: "everyPage"/);
  assert.match(fuente, /didDrawPage:/);
});

const periodos = obtenerPeriodosPlanillaPDF({
  turnoId: "tarde",
  tipo: "enfermero",
  mesActivo: "2026-08"
});
const planilla = Object.fromEntries(
  periodos.periodos.map((periodo) => [
    periodo.clave,
    {
      "REA 1": { personaId: "e1", nombre: "Persona E" },
      "Triage 1": { personaId: "l1", nombre: "Persona L" }
    }
  ])
);
const tablaEnfermeros = prepararTablaPlanillaPDF({
  planilla,
  periodos: periodos.periodos,
  estrategia: periodos.estrategia,
  tipo: "enfermero",
  ordenFilas: configuracionSectores.enfermero.ordenPDF
});
const tablaLicenciados = prepararTablaPlanillaPDF({
  planilla,
  periodos: periodos.periodos,
  estrategia: periodos.estrategia,
  tipo: "licenciado",
  ordenFilas: configuracionSectores.licenciado.ordenPDF
});

probar("7 sectores de Enfermeros no entran en Licenciados", () => {
  assert.equal(tablaLicenciados.cuerpo.some(([sector]) => sector === "REA 1"), false);
});
probar("8 sectores de Licenciados no entran en Enfermeros", () => {
  assert.equal(tablaEnfermeros.cuerpo.some(([sector]) => sector === "Triage 1"), false);
});
probar("9 se mantienen todas las semanas del mes", () => {
  assert.equal(tablaEnfermeros.encabezados.length, periodos.periodos.length + 1);
  assert.equal(tablaLicenciados.encabezados.length, periodos.periodos.length + 1);
});
probar("10 Noche mantiene períodos cada tres días", () => {
  const noche = obtenerPeriodosPlanillaPDF({
    turnoId: "noche",
    tipo: "enfermero",
    mesActivo: "2026-08"
  });
  assert.equal(noche.estrategia.tipo, "cada_3_dias");
  assert.ok(noche.periodos.length > 6);
});
probar("11 Mañana, Tarde y Vespertino siguen semanales", () => {
  for (const turnoId of ["manana", "tarde", "vespertino"]) {
    assert.equal(
      obtenerPeriodosPlanillaPDF({
        turnoId,
        tipo: "enfermero",
        mesActivo: "2026-08"
      }).estrategia.tipo,
      "semanal"
    );
  }
});
probar("12 Calendario Diario conserva exportación independiente", () => {
  const bloqueCalendario = fuente.slice(fuente.indexOf("export const exportarCalendarioPDF"));
  assert.match(bloqueCalendario, /pdf\.save\(`calendario-diario-/);
  assert.doesNotMatch(bloqueCalendario, /renderizarCategoriaPlanillaSemanalPDF/);
});
probar("13 preparar tablas no modifica las planillas", () => {
  assert.equal(planilla[periodos.periodos[0].clave]["REA 1"].nombre, "Persona E");
});
probar("14 no hay integración con Supabase", () => {
  assert.doesNotMatch(fuente, /supabase|\.rpc\(|estado_por_turno_mes/i);
});
probar("15 conserva un nombre de archivo válido", () => {
  assert.match(fuente, /pdf\.save\("planilla_mensual\.pdf"\)/);
});
probar("16 no agrega páginas vacías al inicio o al final", () => {
  assert.ok(llamadaEnfermeros < separacion);
  assert.equal(flujoSemanal.indexOf("pdf.addPage()", llamadaLicenciados), -1);
});

console.log(`\n${total} pruebas de PDF de Planilla pasaron.`);
