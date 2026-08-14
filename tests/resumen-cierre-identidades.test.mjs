import assert from "node:assert/strict";
import { crearResumenTurno } from "../src/utils/resumenTurno.js";
import {
  crearSnapshotCierreTurno,
  snapshotAAsignacionesVisibles
} from "../src/utils/cierreTurno.js";
import { obtenerCierresEstadisticos } from "../src/utils/estadisticasCierres.js";

let numero = 0;
const prueba = (nombre, ejecutar) => {
  ejecutar();
  numero += 1;
  console.log(`✓ ${numero} ${nombre}`);
};

const persona = { id: "persona-1", nombre: "Persona Uno" };
const sector = (sectorId, nombre, enfermero = null) => ({
  tipo: "sector", sectorId, nombre, etiqueta: nombre, enfermero
});
const grupo = (groupId, nombre, enfermero = null) => ({
  tipo: "sector", groupId, nombre, etiqueta: nombre, enfermero
});
const sintetico = (syntheticId, nombre, enfermero = null) => ({
  tipo: "sector", syntheticId, nombre, etiqueta: nombre, enfermero
});
const resumen = (asignaciones, opciones = {}) => crearResumenTurno({
  asignaciones,
  destinosOperativos: asignaciones,
  sectoresCriticosIds: ["rea_1", "triage_1", "reanimacion_sillones"],
  ...opciones
});
const alertaSector = (resultado) => resultado.alertas.find((alerta) =>
  alerta.tipo?.endsWith("sin_cobertura")
);

prueba("crítico histórico conserva severidad", () => {
  const resultado = resumen([sector("rea_1", "REA 1")]);
  assert.equal(alertaSector(resultado).nivel, "critica");
  assert.equal(alertaSector(resultado).tipo, "sector_critico_sin_cobertura");
});

prueba("crítico renombrado conserva severidad y etiqueta", () => {
  const resultado = resumen([sector("rea_1", "Crítico A")]);
  assert.equal(alertaSector(resultado).nivel, "critica");
  assert.match(alertaSector(resultado).mensaje, /Crítico A/);
  assert.doesNotMatch(alertaSector(resultado).mensaje, /rea_1|REA 1/);
});

prueba("Salud Mental histórica conserva clasificación", () => {
  assert.equal(alertaSector(resumen([sector("salud_mental", "SM")])).tipo,
    "salud_mental_sin_cobertura");
});

prueba("Salud Mental renombrada conserva clasificación", () => {
  const alerta = alertaSector(resumen([sector("salud_mental", "Psiquiatría")]));
  assert.equal(alerta.tipo, "salud_mental_sin_cobertura");
  assert.match(alerta.mensaje, /Psiquiatría/);
});

prueba("sector cubierto renombrado no figura vacío", () => {
  assert.equal(resumen([sector("rea_1", "Crítico A", persona)]).conteos.sectoresSinCobertura, 0);
});

prueba("sector vacío duplicado por foto cuenta una vez", () => {
  const fila = sector("rea_1", "Crítico A");
  assert.equal(resumen([fila, { ...fila }]).conteos.sectoresSinCobertura, 1);
});

prueba("Drag and Drop no cambia clasificación", () => {
  const a = sector("rea_1", "Crítico A");
  const b = sector("rea_2", "Crítico B", persona);
  assert.equal(alertaSector(resumen([b, a])).tipo, alertaSector(resumen([a, b])).tipo);
});

prueba("renombrado transversal conserva Triage, REA 2 y Observación", () => {
  const asignaciones = [
    sector("triage_1", "Clasificación A"),
    sector("rea_2", "Crítico B"),
    sector("observacion_1", "Observación Central", persona)
  ];
  const resultado = resumen(asignaciones);
  const alertasSectores = resultado.alertas.filter((alerta) =>
    alerta.tipo?.endsWith("sin_cobertura")
  );
  assert.equal(alertasSectores.find((alerta) => /Clasificación A/.test(alerta.mensaje)).nivel, "critica");
  assert.equal(alertasSectores.find((alerta) => /Crítico B/.test(alerta.mensaje)).nivel, "informacion");
  assert.ok(!alertasSectores.some((alerta) => /Observación Central/.test(alerta.mensaje)));
  assert.equal(resultado.conteos.sectoresSinCobertura, 2);
});

prueba("fila inactiva ausente de destinos no participa", () => {
  const asignaciones = [sector("rea_2", "Crítico B", persona)];
  assert.equal(resumen(asignaciones).conteos.sectoresSinCobertura, 0);
});

prueba("fallback legacy exacto conserva contrato", () => {
  const resultado = crearResumenTurno({
    asignaciones: [{ nombre: "REA 1", enfermero: null }],
    sectoresReales: ["REA 1"],
    sectoresCriticos: ["REA 1"]
  });
  assert.equal(alertaSector(resultado).nivel, "critica");
});

prueba("Opción 1 conserva grupo por groupId", () => {
  const fila = grupo("opcion_1_boxes_11_18", "11–18");
  const resultado = resumen([fila]);
  assert.equal(resultado.conteos.sectoresSinCobertura, 1);
  assert.match(alertaSector(resultado).mensaje, /11–18/);
});

prueba("Opción 2 conserva grupo por groupId", () => {
  const fila = grupo("opcion_2_boxes_8_14", "8–14");
  assert.equal(resumen([fila]).conteos.sectoresSinCobertura, 1);
});

prueba("groupId no se confunde con sector crítico", () => {
  const fila = grupo("opcion_1_boxes_1_3_19_22", "REA 1");
  assert.equal(alertaSector(resumen([fila])).nivel, "informacion");
});

prueba("Reanimación combinada usa sectorId", () => {
  const alerta = alertaSector(resumen([sector("reanimacion_sillones", "Área Crítica")]));
  assert.equal(alerta.nivel, "critica");
});

prueba("Reanimación y Sillones sintéticos conservan identidades separadas", () => {
  const asignaciones = [
    sintetico("reanimacion_sillones.reanimacion", "Reanimación"),
    sintetico("reanimacion_sillones.sillones", "Sillones", persona)
  ];
  const resultado = resumen(asignaciones);
  assert.equal(resultado.conteos.sectoresSinCobertura, 1);
  assert.match(alertaSector(resultado).mensaje, /Reanimación/);
});

prueba("SIN ASIGNAR, Turnante y divider no son sectores", () => {
  const asignaciones = [
    { nombre: "SIN ASIGNAR", tipo: "sector", enfermero: persona },
    { nombre: "T1", turnanteId: "turnante_1", tipo: "turnante", enfermero: null },
    { tipo: "divider" }
  ];
  assert.equal(resumen(asignaciones).conteos.sectoresSinCobertura, 0);
});

prueba("cierre correlaciona sector renombrado por identidad", () => {
  const fila = sector("rea_1", "Crítico A", persona);
  const snapshot = crearSnapshotCierreTurno({
    fecha: "2026-08-13", tipo: "enfermero", resumen: resumen([fila]),
    asignaciones: [fila], asistencia: {}, destinosOperativos: [fila]
  });
  assert.deepEqual(snapshot.sectoresSinCobertura, []);
  assert.equal(snapshot.asignaciones[0].sector, "Crítico A");
  assert.equal(Object.hasOwn(snapshot.asignaciones[0], "sectorId"), false);
});

prueba("cierre persiste una sola etiqueta vacía y no IDs", () => {
  const fila = sector("rea_1", "Crítico A");
  const snapshot = crearSnapshotCierreTurno({
    fecha: "2026-08-13", tipo: "enfermero", resumen: resumen([fila]),
    asignaciones: [fila, { ...fila }], asistencia: {}, destinosOperativos: [fila, { ...fila }]
  });
  assert.deepEqual(snapshot.sectoresSinCobertura, ["Crítico A"]);
  assert.doesNotMatch(JSON.stringify(snapshot), /sector:rea_1|groupId|syntheticId/);
});

prueba("resumen y cierre no mutan asignaciones", () => {
  const asignaciones = [sector("salud_mental", "Psiquiatría")];
  const antes = structuredClone(asignaciones);
  const resultado = resumen(asignaciones);
  crearSnapshotCierreTurno({
    fecha: "2026-08-13", tipo: "enfermero", resumen: resultado,
    asignaciones, asistencia: {}, destinosOperativos: asignaciones
  });
  assert.deepEqual(asignaciones, antes);
});

prueba("snapshot histórico se lee sin reescribirse", () => {
  const snapshot = {
    asignaciones: [{ sector: "REA 1", persona: null, tipo: "sector" }],
    resumen: { conteos: {}, alertas: [] }, sectoresSinCobertura: ["REA 1"]
  };
  const antes = structuredClone(snapshot);
  assert.equal(snapshotAAsignacionesVisibles(snapshot)[0].nombre, "REA 1");
  assert.deepEqual(snapshot, antes);
});

prueba("estadísticas conservan contrato histórico", () => {
  const snapshot = {
    resumen: { conteos: { previstos: 1, presentes: 1 }, alertas: [{ nivel: "critica" }] },
    asignaciones: [], extrasRegistrados: [], sectoresSinCobertura: ["Crítico A"]
  };
  const calendario = { enfermeros: { cierresDia: {
    "2026-08-13": { estado: "cerrado", revisionActual: 1, versiones: [{ revision: 1, snapshot }] }
  } } };
  const fila = obtenerCierresEstadisticos({ calendario, categoria: "enfermero" })[0];
  assert.equal(fila.sectoresSinCobertura, 1);
  assert.equal(fila.alertasCriticas, 1);
});

console.log(`\n${numero} pruebas de resumen y cierre por identidades estables pasaron.`);
