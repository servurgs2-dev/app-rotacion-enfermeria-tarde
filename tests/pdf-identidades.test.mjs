import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearCalendarioDiarioPDF,
  obtenerAsignacionesCalendarioPDF,
  prepararFilasCalendarioPDF
} from "../src/utils/exportPDF.js";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerFilasActivas
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { MODOS_REDISTRIBUCION, SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION } from "../src/utils/gruposRedistribucion.js";
import { SYNTHETIC_IDS_REANIMACION_SILLONES } from "../src/utils/reanimacionSillones.js";
import { resolverIdentidadOperativaAsignacion } from "../src/utils/identidadOperativaAsignaciones.js";

const contexto = { turnoId: "tarde", mesActivo: "2026-08" };
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const persona = (id) => ({ id, nombre: `Persona ${id}` });
const crearEstado = () => {
  const estado = crearEstadoMensualVacio();
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({
      turno: contexto.turnoId,
      categoria: "enfermero",
      mes: contexto.mesActivo,
      posicionesMensualesAdicionales: ["T6"]
    }),
    licenciado: crearSnapshotConfiguracionPlanilla({
      turno: contexto.turnoId,
      categoria: "licenciado",
      mes: contexto.mesActivo,
      posicionesMensualesAdicionales: ["T3"]
    })
  };
  return estado;
};
const ordenar = (asignaciones, estado, tipo = "enfermero") =>
  obtenerAsignacionesCalendarioPDF({ asignaciones, estadoMensual: estado, tipo, ...contexto });

probar("orden histórico y etiquetas permanecen iguales con IDs", () => {
  const estado = crearEstado();
  const filas = obtenerFilasActivas(estado.configuracionPlanilla.enfermero.filas)
    .filter((fila) => fila.tipo === "sector")
    .sort((a, b) => a.orden - b.orden);
  const asignaciones = [...filas].reverse().map((fila, indice) => ({
    nombre: fila.etiqueta,
    sectorId: fila.sectorId,
    enfermero: persona(`historica-${indice}`),
    tipo: "sector"
  }));
  const resultado = ordenar(asignaciones, estado);
  assert.deepEqual(resultado.map((fila) => fila.sectorId), filas.map((fila) => fila.sectorId));
  assert.deepEqual(resultado.map((fila) => fila.nombre), filas.map((fila) => fila.etiqueta));
});

probar("sector renombrado conserva identidad, posición, texto y persona", () => {
  const estado = crearEstado();
  const snapshot = estado.configuracionPlanilla.enfermero;
  const renombrados = new Map([
    ["rea_1", "Crítico A"],
    ["explora_1", "Exploración principal"],
    ["sillon_1", "Sillón principal"],
    ["pre_int_1", "Preinternación principal"],
    ["salud_mental", "Salud Mental turno"],
    ["boxes_8_13", "Boxes central"]
  ]);
  snapshot.filas.forEach((fila) => {
    if (renombrados.has(fila.sectorId)) fila.etiqueta = renombrados.get(fila.sectorId);
  });
  const filas = snapshot.filas.filter((fila) => fila.tipo === "sector" && fila.activo !== false);
  const asignaciones = [...filas].reverse().map((fila) => ({
    nombre: fila.etiqueta,
    sectorId: fila.sectorId,
    enfermero: persona(fila.sectorId),
    tipo: "sector"
  }));
  const resultado = ordenar(asignaciones, estado);
  for (const [sectorId, etiqueta] of renombrados) {
    const indiceEsperado = [...filas].sort((a, b) => a.orden - b.orden)
      .findIndex((fila) => fila.sectorId === sectorId);
    assert.equal(resultado[indiceEsperado].sectorId, sectorId);
    assert.equal(resultado[indiceEsperado].nombre, etiqueta);
    assert.equal(resultado[indiceEsperado].enfermero.id, sectorId);
  }
});

probar("Drag & Drop configurado conserva identidad y define el orden vigente", () => {
  const estado = crearEstado();
  const filas = estado.configuracionPlanilla.enfermero.filas;
  filas.reverse().forEach((fila, indice) => { fila.orden = indice; });
  const sectores = filas.filter((fila) => fila.tipo === "sector");
  const asignaciones = sectores.map((fila) => ({ nombre: fila.etiqueta, sectorId: fila.sectorId, tipo: "sector" }));
  assert.deepEqual(ordenar([...asignaciones].reverse(), estado).map((fila) => fila.sectorId), sectores.map((fila) => fila.sectorId));
});

probar("fila inactiva no reaparece por sectorId ni alias histórico", () => {
  const estado = crearEstado();
  estado.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === "rea_1").activo = false;
  const resultado = ordenar([
    { nombre: "Crítico A", sectorId: "rea_1", tipo: "sector" },
    { nombre: "REA 1", tipo: "sector" },
    { nombre: "REA 2", sectorId: "rea_2", tipo: "sector" }
  ], estado);
  assert.equal(resultado.some((fila) => fila.sectorId === "rea_1" || fila.nombre === "REA 1"), false);
  assert.equal(resultado.some((fila) => fila.sectorId === "rea_2"), true);
});

for (const modo of MODOS_REDISTRIBUCION) {
  probar(`${modo.modeId} conserva grupos por groupId y no revive seis filas`, () => {
    const estado = crearEstado();
    const grupos = modo.groups.map((grupo, indice) => ({
      nombre: grupo.etiqueta,
      groupId: grupo.groupId,
      enfermero: persona(`${modo.modeId}-${indice}`),
      tipo: "sector"
    }));
    const resultado = ordenar([
      { nombre: "REA 1", sectorId: "rea_1", tipo: "sector" },
      ...grupos
    ], estado);
    assert.deepEqual(resultado.filter((fila) => fila.groupId).map((fila) => fila.groupId), modo.groups.map((grupo) => grupo.groupId));
    assert.equal(resultado.some((fila) => SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION.includes(fila.sectorId)), false);
  });
}

probar("Reanimación + Sillones combinada usa sectorId aunque esté renombrada", () => {
  const estado = crearEstado();
  const fila = estado.configuracionPlanilla.licenciado.filas.find((actual) => actual.sectorId === "reanimacion_sillones");
  fila.etiqueta = "Área crítica combinada";
  const resultado = ordenar([{ nombre: fila.etiqueta, sectorId: fila.sectorId, tipo: "sector" }], estado, "licenciado");
  assert.equal(resultado[0].sectorId, "reanimacion_sillones");
  assert.equal(resultado[0].nombre, "Área crítica combinada");
});

probar("Reanimación y Sillones divididas usan syntheticId y conservan orden relativo", () => {
  const estado = crearEstado();
  const sinteticas = [
    { nombre: "Reanimación", syntheticId: SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION, tipo: "sector" },
    { nombre: "Sillones", syntheticId: SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES, tipo: "sector" }
  ];
  const resultado = ordenar(sinteticas, estado, "licenciado");
  assert.deepEqual(resultado.map((fila) => fila.syntheticId), sinteticas.map((fila) => fila.syntheticId));
});

probar("Turnantes base y adicionales resuelven turnanteId exacto", () => {
  for (const [nombre, turnanteId] of [["T1", "turnante_1"], ["T6", "turnante_6"], ["T3", "turnante_3"]]) {
    assert.deepEqual(resolverIdentidadOperativaAsignacion({ nombre: "Visible", turnanteId }), {
      tipoIdentidad: "turnante",
      turnanteId
    });
    assert.deepEqual(resolverIdentidadOperativaAsignacion({ nombre }), {
      tipoIdentidad: "turnante",
      turnanteId
    });
  }
  assert.equal(resolverIdentidadOperativaAsignacion({ nombre: "T1 parcial" }), null);
});

probar("marca Turnante y SIN ASIGNAR conservan presentación", () => {
  assert.deepEqual(prepararFilasCalendarioPDF([
    { nombre: "REA 1", sectorId: "rea_1", enfermero: { id: "t", nombre: "Persona T", esTurnante: true }, tipo: "sector" },
    { nombre: "SIN ASIGNAR", enfermero: { id: "l", nombre: "Persona libre" }, tipo: "sector" }
  ]), [
    ["REA 1", "PERSONA T (T)"],
    ["SIN ASIGNAR", "PERSONA LIBRE"]
  ]);
});

probar("fallback legacy exacto conserva foto y rechaza coincidencias parciales", () => {
  const estado = crearEstadoMensualVacio();
  const entrada = [
    { nombre: "REA 1", tipo: "sector" },
    { nombre: "REA 1 parcial", tipo: "sector" }
  ];
  assert.deepEqual(ordenar(entrada, estado), entrada);
  assert.equal(resolverIdentidadOperativaAsignacion(entrada[0]).sectorId, "rea_1");
  assert.equal(resolverIdentidadOperativaAsignacion(entrada[1]), null);
});

probar("ordenar y preparar PDF no mutan asignaciones, configuración ni escriben IDs", () => {
  const estado = crearEstado();
  const asignaciones = [{ nombre: "REA 1", sectorId: "rea_1", enfermero: persona("pura"), tipo: "sector" }];
  const antesEstado = structuredClone(estado);
  const antesAsignaciones = structuredClone(asignaciones);
  prepararFilasCalendarioPDF(ordenar(asignaciones, estado));
  assert.deepEqual(estado, antesEstado);
  assert.deepEqual(asignaciones, antesAsignaciones);
  assert.equal(JSON.stringify(asignaciones).includes("groupId"), false);
  assert.equal(JSON.stringify(asignaciones).includes("syntheticId"), false);
});

probar("Sin cobertura conserva estilo aprobado", () => {
  const fuente = fs.readFileSync("src/utils/exportPDF.js", "utf8");
  assert.match(fuente, /String\(datos\.cell\.raw\)\.trim\(\) === "SIN COBERTURA"/);
  assert.match(fuente, /fontStyle = "normal"/);
  assert.match(fuente, /fontSize = perfilVisual\.fuenteTabla - 0\.5/);
});

probar("PDF diario por identidades continúa en una página", () => {
  const estado = crearEstado();
  const asignaciones = [{ nombre: "REA 1", sectorId: "rea_1", enfermero: persona("pdf"), tipo: "sector" }];
  const pdf = crearCalendarioDiarioPDF({
    fecha: new Date(2026, 7, 13, 12),
    enfermeros: { asignaciones, libres: [] },
    licenciados: { asignaciones: [], libres: [] },
    personal: [],
    estadoMensual: estado,
    ...contexto
  });
  assert.equal(pdf.getNumberOfPages(), 1);
});

console.log(`\n${total} pruebas de PDF diario por identidades estables pasaron.`);
