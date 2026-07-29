import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearPlanillaSemanalPDF,
  crearPlanillaTresDiasPDF,
  dividirPeriodosPlanillaPDF,
  obtenerPeriodosPlanillaPDF,
  prepararGruposLibresPDF,
  prepararTablaPlanillaPDF
} from "../src/utils/exportPDF.js";
import { configuracionSectores } from "../src/data/sectores.js";
import { obtenerDiasLibresDelMes } from "../src/utils/fechas.js";

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
  assert.match(flujoSemanal.slice(llamadaLicenciados), /renderizarGruposLibresPDF/);
});

const personalNumeroso = ["enfermero", "licenciado"].flatMap((categoria) =>
  Array.from({ length: 60 }, (_, indice) => ({
    id: `${categoria}-${indice + 1}`,
    nombre: `Persona sintética con nombre extenso ${categoria} ${String(indice + 1).padStart(2, "0")}`,
    categoria,
    libre: (indice % 5) + 1
  }))
);
const gruposNumerosos = prepararGruposLibresPDF(personalNumeroso, "2026-08");

probar("17 prepara los grupos 1 a 5 para ambas categorías", () => {
  assert.deepEqual(gruposNumerosos.enfermeros.map(([grupo]) => grupo), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(gruposNumerosos.licenciados.map(([grupo]) => grupo), ["1", "2", "3", "4", "5"]);
  assert.equal(gruposNumerosos.enfermeros.every((fila) => fila.length === 3), true);
});
probar("18 conserva todos los nombres aunque deban envolverse", () => {
  for (const categoria of ["enfermero", "licenciado"]) {
    const clave = categoria === "enfermero" ? "enfermeros" : "licenciados";
    const textos = gruposNumerosos[clave].map((fila) => fila[2]).join(", ");
    assert.equal(
      personalNumeroso
        .filter((persona) => persona.categoria === categoria)
        .every((persona) => textos.includes(persona.nombre)),
      true
    );
  }
});

const pdfSemanalNumeroso = crearPlanillaSemanalPDF({
  planillaEnfermeros: planilla,
  planillaLicenciados: planilla,
  semanas: periodos.periodos,
  personal: personalNumeroso,
  turnoId: "tarde",
  mesActivo: "2026-08"
});
probar("19 el PDF semanal sintético tiene exactamente tres páginas", () => {
  assert.equal(pdfSemanalNumeroso.getNumberOfPages(), 3);
});
probar("20 la tercera página es A4 horizontal", () => {
  pdfSemanalNumeroso.setPage(3);
  assert.ok(Math.abs(pdfSemanalNumeroso.internal.pageSize.getWidth() - 297) < 1);
  assert.ok(Math.abs(pdfSemanalNumeroso.internal.pageSize.getHeight() - 210) < 1);
});

const pdfNoche = crearPlanillaTresDiasPDF({
  planillaEnfermeros: { rotacion3Dias: { bloques: {}, coberturaLibreSM: {} } },
  planillaLicenciados: {},
  personal: personalNumeroso,
  turnoId: "noche",
  mesActivo: "2026-08"
});
probar("21 Noche conserva sus páginas originales y agrega una sola página", () => {
  const paginasOriginales = dividirPeriodosPlanillaPDF(
    obtenerPeriodosPlanillaPDF({
      turnoId: "noche",
      tipo: "enfermero",
      mesActivo: "2026-08"
    }).periodos,
    6
  ).length + 1;
  assert.equal(pdfNoche.getNumberOfPages(), paginasOriginales + 1);
  pdfNoche.setPage(paginasOriginales + 1);
  assert.ok(Math.abs(pdfNoche.internal.pageSize.getWidth() - 297) < 1);
  assert.ok(Math.abs(pdfNoche.internal.pageSize.getHeight() - 210) < 1);
});

probar("22 calcula los dos primeros libres reales de agosto de 2026", () => {
  assert.deepEqual(
    gruposNumerosos.enfermeros.map((fila) => fila[1]),
    ["5 y 10", "1 y 6", "2 y 7", "3 y 8", "4 y 9"]
  );
});
probar("23 usa el helper de libres y respeta la longitud real de cada mes", () => {
  for (const [mesActivo, ultimoDia] of [
    ["2025-02", 28],
    ["2024-02", 29],
    ["2026-04", 30],
    ["2026-01", 31]
  ]) {
    const dias = Array.from(
      { length: 5 },
      (_, indice) => obtenerDiasLibresDelMes(indice + 1, mesActivo)
    ).flat();
    assert.equal(Math.max(...dias), ultimoDia);
    assert.equal(dias.every((dia) => dia >= 1 && dia <= ultimoDia), true);
  }
  assert.match(fuente, /obtenerDiasLibresDelMes\(grupo, mesActivo\)\.slice\(0, 2\)/);
});
probar("24 separa categorías, ordena nombres y usa Ninguno en grupos vacíos", () => {
  const grupos = prepararGruposLibresPDF([
    { nombre: "Zeta", categoria: "enfermero", libre: 1 },
    { nombre: "Alfa", categoria: "enfermero", libre: 1 },
    { nombre: "Licenciada", categoria: "licenciado", libre: 1 }
  ], "2026-08");
  assert.equal(grupos.enfermeros[0][2], "Alfa, Zeta");
  assert.equal(grupos.licenciados[0][2], "Licenciada");
  assert.equal(grupos.enfermeros[1][2], "Ninguno");
});
probar("25 la tabla declara las tres columnas obligatorias", () => {
  assert.match(fuente, /\[\["Grupo", "Primeros libres del mes", "Funcionarios"\]\]/);
});

console.log(`\n${total} pruebas de PDF de Planilla pasaron.`);
