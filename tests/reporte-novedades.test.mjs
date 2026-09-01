import assert from "node:assert/strict";
import fs from "node:fs";
import { crearNovedadesLegacy } from "../src/utils/novedadesPersonal.js";
import {
  clasificarImpactoNovedad,
  construirReporteNovedades,
  contarJornadasEnInterseccion,
  obtenerDetalleReporteNovedad,
  presentarEstadoReporteNovedad,
  TIPOS_REPORTE_NOVEDADES
} from "../src/utils/reporteNovedades.js";

let total = 0;
const probar = (nombre, fn) => {
  fn(); total += 1; console.log(`✓ ${total} ${nombre}`);
};

const ana = { id: "ana", nombre: "Ana", categoria: "enfermero" };
const beto = { id: "beto", nombre: "Beto", categoria: "licenciado" };
const personal = [ana, beto];
const legacy = crearNovedadesLegacy({
  licencias: [{ personaId: "ana", nombre: "Ana", desde: "2026-08-28", hasta: "2026-09-03" }],
  certificaciones: [{ personaId: "beto", nombre: "Beto", desde: "2026-08-10", hasta: "2026-08-10" }],
  personal
});
const central = [
  { id: "sus", personaId: "ana", personaNombre: "Ana", categoria: "enfermero", turno: "tarde", tipo: "suspension", fechaDesde: "2026-08-12", fechaHasta: "2026-08-13", estado: "activa", observacion: "Suspensión" },
  { id: "paro", personaId: "beto", personaNombre: "Beto", categoria: "licenciado", turno: "tarde", tipo: "adhesion_paro", fechaDesde: "2026-08-14", fechaHasta: "2026-08-14", estado: "activa" },
  { id: "olvido", personaId: "ana", personaNombre: "Ana", categoria: "enfermero", turno: "tarde", tipo: "olvido_tarjeta", fechaDesde: "2026-08-15", fechaHasta: "2026-08-15", estado: "revisada", observacion: "Olvidó salida" },
  { id: "horario", personaId: "beto", personaNombre: "Beto", categoria: "licenciado", turno: "tarde", tipo: "cambio_horario", fechaDesde: "2026-08-16", fechaHasta: "2026-08-16", estado: "activa", datos: { horaEntrada: "12:30", horaSalida: "18:30" } }
];
const filtrosBase = { turnoActivo: "tarde", desde: "2026-08-01", hasta: "2026-08-31" };

probar("consolida seis tipos desde legacy y novedades centrales", () => {
  const reporte = construirReporteNovedades({ novedades: [...legacy, ...central], ...filtrosBase });
  assert.equal(reporte.registros.length, 6);
  assert.deepEqual(new Set(reporte.registros.map((n) => n.tipo)), new Set(TIPOS_REPORTE_NOVEDADES));
});

probar("excluye canceladas, otros turnos, Otra y Excedente", () => {
  const extras = [
    { ...central[0], id: "cancelada", estado: "cancelada" },
    { ...central[0], id: "manana", turno: "manana" },
    { ...central[0], id: "otra", tipo: "otra" },
    { ...central[0], id: "excedente", tipo: "excedente" }
  ];
  const reporte = construirReporteNovedades({ novedades: [...legacy, ...central, ...extras], ...filtrosBase });
  assert.equal(reporte.registros.length, 6);
  assert.ok(reporte.registros.every((n) => !["cancelada", "manana", "otra", "excedente"].includes(n.id)));
});

probar("la intersección incluye rangos que empiezan antes o terminan después", () => {
  const reporte = construirReporteNovedades({ novedades: legacy, turnoActivo: "tarde", desde: "2026-08-30", hasta: "2026-08-31" });
  assert.deepEqual(reporte.registros.map((n) => n.tipo), ["licencia"]);
  assert.equal(contarJornadasEnInterseccion(reporte.registros[0], "2026-08-30", "2026-08-31"), 2);
});

probar("un rango que cruza vigencias aparece en el reporte de cada turno con el mismo registro", () => {
  const padronVigencias = {
    porPersonaId: {
      ana: { persona: ana, personaId: "ana", vigencias: [
        { turno: "tarde", desde: "2026-08-01", hasta: "2026-08-14" },
        { turno: "manana", desde: "2026-08-15", hasta: "2026-08-31" }
      ] }
    }
  };
  const [licencia] = crearNovedadesLegacy({
    licencias: [{ id: "lic-cruzada", personaId: "ana", nombre: "Ana", desde: "2026-08-10", hasta: "2026-08-20", turnoOrigenEstado: "tarde" }],
    personal
  });
  const tarde = construirReporteNovedades({ novedades: [licencia], turnoActivo: "tarde", padronVigencias, desde: "2026-08-01", hasta: "2026-08-31" });
  const manana = construirReporteNovedades({ novedades: [licencia], turnoActivo: "manana", padronVigencias, desde: "2026-08-01", hasta: "2026-08-31" });
  assert.equal(tarde.registros[0].id, licencia.id);
  assert.equal(manana.registros[0].id, licencia.id);
});

probar("filtra categoría, persona, tipo e impacto combinadamente", () => {
  const novedades = [...legacy, ...central];
  assert.equal(construirReporteNovedades({ novedades, ...filtrosBase, categoria: "licenciado" }).registros.length, 3);
  assert.equal(construirReporteNovedades({ novedades, ...filtrosBase, personaId: "ana" }).registros.length, 3);
  assert.deepEqual(construirReporteNovedades({ novedades, ...filtrosBase, tipo: "adhesion_paro" }).registros.map((n) => n.id), ["paro"]);
  assert.equal(construirReporteNovedades({ novedades, ...filtrosBase, impacto: "ausencia" }).registros.length, 4);
  assert.equal(construirReporteNovedades({ novedades, ...filtrosBase, impacto: "administrativa" }).registros.length, 2);
});

probar("clasifica explícitamente cuatro ausencias y dos administrativas", () => {
  assert.deepEqual(TIPOS_REPORTE_NOVEDADES.map((tipo) => clasificarImpactoNovedad({ tipo })), [
    "ausencia", "ausencia", "ausencia", "ausencia", "administrativa", "administrativa"
  ]);
});

probar("resume registros, impacto, desglose y jornadas dentro del filtro", () => {
  const { resumen } = construirReporteNovedades({ novedades: [...legacy, ...central], ...filtrosBase });
  assert.deepEqual({ total: resumen.total, ausencias: resumen.ausencias, administrativas: resumen.administrativas, jornadas: resumen.jornadasAfectadas }, {
    total: 6, ausencias: 4, administrativas: 2, jornadas: 8
  });
  assert.equal(resumen.desglose.licencia, 1);
  assert.equal(resumen.desglose.cambio_horario, 1);
});

probar("ordena por fecha, persona y tipo de forma estable", () => {
  const mismaFecha = [
    { ...central[0], id: "z", personaNombre: "Beto", fechaDesde: "2026-08-20", fechaHasta: "2026-08-20", tipo: "suspension" },
    { ...central[0], id: "a2", personaNombre: "Ana", fechaDesde: "2026-08-20", fechaHasta: "2026-08-20", tipo: "suspension" },
    { ...central[0], id: "a1", personaNombre: "Ana", fechaDesde: "2026-08-20", fechaHasta: "2026-08-20", tipo: "adhesion_paro" }
  ];
  const reporte = construirReporteNovedades({ novedades: mismaFecha, ...filtrosBase });
  assert.deepEqual(reporte.registros.map((n) => n.id), ["a1", "a2", "z"]);
});

probar("presenta horario excepcional y estados administrativos vigentes", () => {
  assert.equal(obtenerDetalleReporteNovedad(central[3]), "Horario: 12:30 – 18:30");
  assert.equal(presentarEstadoReporteNovedad(central[2]), "Revisada");
  assert.equal(presentarEstadoReporteNovedad({ ...central[2], estado: "resuelta" }), "Resuelta");
});

probar("conserva el origen visible de una Certificación creada desde No disponibles", () => {
  const certificacionDia = crearNovedadesLegacy({
    certificaciones: [{ id: "cert-dia-1", origen: "no_disponibles_dia", personaId: "ana", nombre: "Ana", desde: "2026-08-20", hasta: "2026-08-20" }],
    personal
  })[0];
  assert.equal(certificacionDia.datos.creadaDesdeNoDisponibles, true);
  assert.equal(obtenerDetalleReporteNovedad(certificacionDia), "Creada desde No disponibles");
});

probar("la UI limita el rango al mes, no ofrece turno y funciona en histórico", () => {
  const fuente = fs.readFileSync("src/components/novedades/ReporteNovedades.jsx", "utf8");
  const contenedor = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  assert.match(fuente, /min=\{limitesMes\.fechaDesde\} max=\{limitesMes\.fechaHasta\}/);
  assert.doesNotMatch(fuente, /Todos los turnos|Filtrar por turno|select.*turno/i);
  assert.doesNotMatch(fuente, /Otra|Excedente/);
  assert.match(contenedor, /reporteAbierto && \(/);
  assert.doesNotMatch(contenedor, /!soloLectura && reporteAbierto/);
});

probar("el PDF incluye título, filtros, resumen, tabla y no exporta vacío", () => {
  const fuente = fs.readFileSync("src/utils/exportReporteNovedadesPDF.js", "utf8");
  assert.match(fuente, /Reporte de Novedades \/ Ausencias/);
  assert.match(fuente, /Total:.*Ausencias:.*Administrativas:.*Jornadas\/persona afectadas:/s);
  assert.match(fuente, /Fecha \/ rango.*Funcionario.*Categoría.*Tipo.*Detalle.*Estado/s);
  assert.match(fuente, /autoTable\(pdf/);
  assert.match(fuente, /if \(!reporte\?\.registros\?\.length\) return false/);
  assert.doesNotMatch(fuente, /correo|email/i);
});

console.log(`\n${total} pruebas del Reporte de Novedades aprobadas.`);
