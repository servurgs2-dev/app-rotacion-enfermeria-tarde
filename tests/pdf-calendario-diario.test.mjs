import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearCalendarioDiarioPDF,
  crearPlanillaSemanalPDF,
  prepararCertificacionesDiaPDF,
  prepararFilasCalendarioPDF
} from "../src/utils/exportPDF.js";
import { obtenerSemanasDelMes } from "../src/utils/fechas.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const fecha = new Date(2026, 7, 5, 12);
const personas = Array.from({ length: 45 }, (_, indice) => ({
  id: `p${indice + 1}`,
  nombre: `Persona sintética con nombre extenso ${indice + 1}`,
  categoria: indice < 28 ? "enfermero" : "licenciado"
}));
const crearAsignaciones = (prefijo, cantidad, desplazamiento = 0) =>
  Array.from({ length: cantidad }, (_, indice) => ({
    nombre: `${prefijo} ${indice + 1}`,
    enfermero: indice === cantidad - 2
      ? null
      : personas[indice + desplazamiento],
    ...(indice === cantidad - 2
      ? { etiquetaVacio: "Sin asignar - ausencia" }
      : {}),
    tipo: "sector"
  }));

const asignacionesEnfermeros = [
  ...crearAsignaciones("Sector E", 17),
  { nombre: "1-3 + 19-22", enfermero: personas[17], tipo: "sector" },
  { nombre: "DX 23-29", enfermero: personas[18], tipo: "sector" },
  { nombre: "SIN ASIGNAR", enfermero: personas[19], tipo: "sector" }
];
const asignacionesLicenciados = crearAsignaciones("Sector L", 13, 28);
const certificaciones = [
  {
    personaId: "p1",
    nombre: personas[0].nombre,
    desde: "2026-08-03",
    hasta: "2026-08-07"
  },
  {
    personaId: "p29",
    nombre: personas[28].nombre,
    desde: "2026-08-05",
    hasta: "2026-08-05"
  },
  { personaId: "p2", nombre: personas[1].nombre, desde: "2026-07-01", hasta: "2026-07-31" },
  { personaId: "p3", nombre: personas[2].nombre, desde: "2026-08-10", hasta: "2026-08-12" },
  ...Array.from({ length: 12 }, (_, indice) => ({
    personaId: `p${indice + 4}`,
    nombre: personas[indice + 3].nombre,
    desde: "2026-08-01",
    hasta: "2026-08-09"
  }))
];
const opciones = {
  fecha,
  turnoId: "tarde",
  mesActivo: "2026-08",
  personal: personas,
  certificaciones,
  enfermeros: {
    asignaciones: asignacionesEnfermeros,
    libres: personas.slice(20, 28)
  },
  licenciados: {
    asignaciones: asignacionesLicenciados,
    libres: personas.slice(41, 45)
  }
};
const copiaOpciones = structuredClone(opciones);
const pdf = crearCalendarioDiarioPDF(opciones);

probar("1 el PDF diario tiene exactamente una página", () => {
  assert.equal(pdf.getNumberOfPages(), 1);
});
probar("2 utiliza A4 horizontal", () => {
  assert.ok(pdf.internal.pageSize.getWidth() > pdf.internal.pageSize.getHeight());
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 297) < 1);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 210) < 1);
});
probar("3 incluye Enfermeros", () => {
  assert.equal(prepararFilasCalendarioPDF(asignacionesEnfermeros).length, 20);
});
probar("4 incluye Licenciados", () => {
  assert.equal(prepararFilasCalendarioPDF(asignacionesLicenciados).length, 13);
});
probar("5 ambas categorías permanecen en la misma página", () => {
  assert.equal(pdf.getNumberOfPages(), 1);
});
probar("6 conserva todos los sectores visibles de Enfermeros", () => {
  assert.deepEqual(
    prepararFilasCalendarioPDF(asignacionesEnfermeros).map(([sector]) => sector),
    asignacionesEnfermeros.map((fila) => fila.nombre)
  );
});
probar("7 conserva todos los sectores visibles de Licenciados", () => {
  assert.deepEqual(
    prepararFilasCalendarioPDF(asignacionesLicenciados).map(([sector]) => sector),
    asignacionesLicenciados.map((fila) => fila.nombre)
  );
});
probar("8 mantiene sectores vacíos", () => {
  assert.ok(
    prepararFilasCalendarioPDF([{ nombre: "Vacío", enfermero: null }])
      .some(([, asignado]) => asignado === "Sin cobertura")
  );
});
probar("9 mantiene la señal Sin asignar por ausencia", () => {
  assert.ok(
    prepararFilasCalendarioPDF(asignacionesEnfermeros)
      .some(([, asignado]) => asignado === "Sin asignar - ausencia")
  );
});
probar("10 mantiene personas en SIN ASIGNAR", () => {
  assert.ok(
    prepararFilasCalendarioPDF(asignacionesEnfermeros)
      .some(([sector, asignado]) =>
        sector === "SIN ASIGNAR" && asignado === personas[19].nombre
      )
  );
});
probar("11 mantiene cambios manuales finales", () => {
  assert.equal(
    prepararFilasCalendarioPDF([
      { nombre: "REA 1", enfermero: { nombre: "Asignación manual" } }
    ])[0][1],
    "Asignación manual"
  );
});
probar("12 mantiene Redistribución opción 1", () => {
  assert.ok(asignacionesEnfermeros.some((fila) => fila.nombre === "1-3 + 19-22"));
});
probar("13 mantiene Redistribución opción 2", () => {
  assert.ok(asignacionesEnfermeros.some((fila) => fila.nombre === "DX 23-29"));
});
probar("14 incluye libres de Enfermeros del día", () => {
  assert.equal(opciones.enfermeros.libres.length, 8);
});
probar("15 incluye libres de Licenciados del día", () => {
  assert.equal(opciones.licenciados.libres.length, 4);
});

const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
probar("16 onDataReady identifica únicamente la fecha activa", () => {
  assert.match(calendarioFuente, /keyDia/);
  assert.match(calendarioFuente, /libresParaPDF/);
});
probar("17 ausentes no entran en libres del PDF", () => {
  assert.match(
    calendarioFuente,
    /obtenerEstadoAsistencia\(asistenciaFecha, persona\) !==\s*ESTADOS_ASISTENCIA\.AUSENTE/
  );
});

const certificacionesDia = prepararCertificacionesDiaPDF({
  certificaciones,
  fecha,
  personal: personas
});
probar("18 incluye certificaciones vigentes", () => {
  assert.ok(certificacionesDia.some((item) => item.nombre === personas[0].nombre));
});
probar("19 excluye certificaciones vencidas", () => {
  assert.equal(certificacionesDia.some((item) => item.nombre === personas[1].nombre), false);
});
probar("20 excluye certificaciones futuras", () => {
  assert.equal(certificacionesDia.some((item) => item.nombre === personas[2].nombre), false);
});
probar("21 contempla el mensaje sin certificaciones", () => {
  const fuente = fs.readFileSync(
    new URL("../src/utils/exportPDF.js", import.meta.url),
    "utf8"
  );
  assert.match(fuente, /Sin certificaciones médicas para esta fecha/);
});
probar("22 no modifica los datos mensuales recibidos", () => {
  assert.deepEqual(opciones, copiaOpciones);
});
probar("23 no genera una segunda página", () => {
  assert.equal(pdf.getNumberOfPages(), 1);
});
probar("24 no deja una página vacía", () => {
  assert.ok(pdf.output("arraybuffer").byteLength > 1000);
});

const semanas = obtenerSemanasDelMes("2026-08");
const planillaVacia = Object.fromEntries(
  semanas.map((semana) => [semana.clave, {}])
);
const pdfSemanal = crearPlanillaSemanalPDF({
  planillaEnfermeros: planillaVacia,
  planillaLicenciados: planillaVacia,
  semanas,
  personal: personas,
  turnoId: "tarde",
  mesActivo: "2026-08"
});
probar("25 Planilla semanal continúa con exactamente dos páginas", () => {
  assert.equal(pdfSemanal.getNumberOfPages(), 2);
});
probar("26 ambos PDFs usan generadores separados", () => {
  const fuente = fs.readFileSync(
    new URL("../src/utils/exportPDF.js", import.meta.url),
    "utf8"
  );
  assert.match(fuente, /export const crearCalendarioDiarioPDF/);
  assert.match(fuente, /export const crearPlanillaSemanalPDF/);
});

console.log(`\n${total} pruebas de PDF de Calendario Diario pasaron.`);
