import assert from "node:assert/strict";
import { crearResumenTurno } from "../src/utils/resumenTurno.js";
import {
  crearSnapshotCierreTurno,
  resolverDatosPresentacionCierreTurno,
  snapshotAAsignacionesVisibles,
  VERSION_SNAPSHOT_CIERRE_ACTUAL
} from "../src/utils/cierreTurno.js";
import { obtenerCierresEstadisticos } from "../src/utils/estadisticasCierres.js";
import { obtenerNombreAsignacionCalendario } from "../src/utils/procedenciaCoberturaAutomatica.js";
import { prepararFilasCalendarioPDF } from "../src/utils/exportPDF.js";

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
  assert.equal(snapshot.versionSnapshot, 2);
  assert.equal(snapshot.asignaciones[0].sector, "Crítico A");
  assert.equal(snapshot.asignaciones[0].sectorId, "rea_1");
});

prueba("cierre persiste una sola etiqueta vacía e identidad estable", () => {
  const fila = sector("rea_1", "Crítico A");
  const snapshot = crearSnapshotCierreTurno({
    fecha: "2026-08-13", tipo: "enfermero", resumen: resumen([fila]),
    asignaciones: [fila, { ...fila }], asistencia: {}, destinosOperativos: [fila, { ...fila }]
  });
  assert.deepEqual(snapshot.sectoresSinCobertura, ["Crítico A"]);
  assert.equal(snapshot.asignaciones[0].sectorId, "rea_1");
  assert.equal(Object.hasOwn(snapshot.asignaciones[0], "groupId"), false);
  assert.equal(Object.hasOwn(snapshot.asignaciones[0], "syntheticId"), false);
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

prueba("snapshot v1 ausente de versión no inventa metadata", () => {
  const snapshot = {
    asignaciones: [{
      sector: "REA 1",
      persona: { personaId: "persona-1", nombre: "Persona Uno", esTurnante: true },
      tipo: "sector",
      sectorId: "rea_1",
      origenCoberturaAutomaticaSectorId: "rea_2"
    }]
  };
  const antes = structuredClone(snapshot);
  const [visible] = snapshotAAsignacionesVisibles(snapshot);
  assert.equal(visible.sectorId, undefined);
  assert.equal(visible.origenCoberturaAutomaticaSectorId, undefined);
  assert.equal(visible.enfermero.esTurnante, undefined);
  assert.deepEqual(snapshot, antes);
});

prueba("snapshot v2 conserva orden, identidades y destinos dinámicos", () => {
  const asignaciones = [
    { ...grupo("grupo-a", "Primero", persona), filaId: "fila-a", destinoId: "destino-a" },
    { ...sintetico("sintetico-b", "Segundo"), filaId: "fila-b" },
    { nombre: "T1", etiqueta: "T1", tipo: "turnante", turnanteId: "turnante_1",
      filaId: "enfermero.turnante.1", enfermero: { ...persona, id: "persona-t", esTurnante: true } }
  ];
  const snapshot = crearSnapshotCierreTurno({
    fecha: "2026-08-13", tipo: "enfermero", resumen: resumen(asignaciones),
    asignaciones, asistencia: {}, destinosOperativos: asignaciones
  });
  assert.equal(snapshot.versionSnapshot, VERSION_SNAPSHOT_CIERRE_ACTUAL);
  assert.deepEqual(snapshot.asignaciones.map(({ sector: nombre }) => nombre), ["Primero", "Segundo", "T1"]);
  assert.equal(snapshot.asignaciones[0].groupId, "grupo-a");
  assert.equal(snapshot.asignaciones[0].filaId, "fila-a");
  assert.equal(snapshot.asignaciones[0].destinoId, "destino-a");
  assert.equal(snapshot.asignaciones[1].syntheticId, "sintetico-b");
  assert.equal(snapshot.asignaciones[2].turnanteId, "turnante_1");
  assert.equal(snapshot.asignaciones[2].persona.esTurnante, true);
  assert.deepEqual(snapshotAAsignacionesVisibles(snapshot).map(({ nombre }) => nombre),
    ["Primero", "Segundo", "T1"]);
});

prueba("snapshot v2 conserva Extras y procedencia RT ET ST sin marcar Pre Int", () => {
  const asignaciones = [
    { ...sector("rea_1", "REA 1", persona), filaId: "enfermero.sector.rea_1",
      origenCoberturaAutomaticaSectorId: "rea_2" },
    { ...sector("explora_1", "Explora 1", { ...persona, id: "persona-2" }),
      origenCoberturaAutomaticaSectorId: "explora_2" },
    { ...sector("sillon_1", "Sillones 1", { ...persona, id: "persona-3" }),
      origenCoberturaAutomaticaSectorId: "sillon_2" },
    { ...sector("pre_int_1", "PRE INT 1", { ...persona, id: "persona-4" }),
      origenCoberturaAutomaticaSectorId: "pre_int_2" },
    { ...sector("salud_mental", "Salud Mental", { ...persona, id: "extra-1", esExtra: true }) }
  ];
  const snapshot = crearSnapshotCierreTurno({
    fecha: "2026-08-13", tipo: "enfermero", resumen: resumen(asignaciones),
    asignaciones, asistencia: {}, destinosOperativos: asignaciones
  });
  const visibles = snapshotAAsignacionesVisibles(snapshot);
  assert.deepEqual(visibles.slice(0, 4).map((item) => obtenerNombreAsignacionCalendario(item)), [
    "Persona Uno (RT)", "Persona Uno (ET)", "Persona Uno (ST)", "Persona Uno"
  ]);
  assert.equal(visibles[4].enfermero.esExtra, true);
  assert.equal(obtenerNombreAsignacionCalendario(visibles[4]), "Persona Uno (E)");
});

prueba("snapshot v2 congela perfiles operativos de Licenciados sin recalcular", () => {
  const perfiles = [
    ["Reanimación + Sillones", "Diagnóstico + Explora"],
    ["Reanimación", "Sillones", "Diagnóstico + Explora"],
    ["Reanimación", "Sillones", "Diagnóstico", "Explora"]
  ];
  perfiles.forEach((nombres, indice) => {
    const asignaciones = nombres.map((nombre, posicion) => ({
      nombre, etiqueta: nombre, tipo: "sector", syntheticId: `perfil-${indice}-${posicion}`,
      enfermero: { id: `lic-${indice}-${posicion}`, nombre: `Lic ${posicion}` }
    }));
    const snapshot = crearSnapshotCierreTurno({
      fecha: "2026-08-13", tipo: "licenciado", resumen: resumen(asignaciones),
      asignaciones, asistencia: {}, destinosOperativos: asignaciones
    });
    assert.deepEqual(snapshotAAsignacionesVisibles(snapshot).map(({ nombre }) => nombre), nombres);
  });
});

prueba("snapshot v2 conserva asistencia, resumen y listas sin mutar entradas", () => {
  const asignaciones = [sector("rea_1", "REA 1", persona)];
  const resumenTurno = resumen(asignaciones);
  const asistencia = { "id:persona-1": "presente" };
  const listas = {
    libres: [{ id: "libre-1", nombre: "Libre" }],
    licencias: [{ id: "licencia-1", nombre: "Licencia" }],
    certificaciones: [{ id: "cert-1", nombre: "Certificada" }],
    noDisponibles: [{ id: "nd-1", nombre: "No disponible" }],
    extrasRegistrados: [{ id: "extra-1", nombre: "Extra" }]
  };
  const entradas = structuredClone({ asignaciones, resumenTurno, asistencia, listas });
  const snapshot = crearSnapshotCierreTurno({
    fecha: "2026-08-13", tipo: "enfermero", resumen: resumenTurno,
    asignaciones, asistencia, destinosOperativos: asignaciones, ...listas
  });
  assert.equal(snapshot.asistencia["id:persona-1"], "presente");
  assert.deepEqual(snapshot.resumen, { conteos: resumenTurno.conteos, alertas: resumenTurno.alertas });
  for (const campo of Object.keys(listas)) assert.equal(snapshot[campo].length, 1);
  assert.deepEqual({ asignaciones, resumenTurno, asistencia, listas }, entradas);
});

prueba("snapshot cerrado prevalece sobre una reconstrucción deliberadamente distinta", () => {
  const snapshot = crearSnapshotCierreTurno({
    fecha: "2026-08-13",
    tipo: "enfermero",
    resumen: resumen([
      sector("rea_1", "REA 1", { id: "persona-a", nombre: "Persona A" }),
      sector("rea_2", "REA 2", { id: "persona-b", nombre: "Persona B" })
    ]),
    asignaciones: [
      sector("rea_1", "REA 1", { id: "persona-a", nombre: "Persona A" }),
      sector("rea_2", "REA 2", { id: "persona-b", nombre: "Persona B" })
    ],
    asistencia: { "id:persona-a": "presente" },
    libres: [{ id: "libre-cierre", nombre: "Libre cierre" }],
    destinosOperativos: [sector("rea_1", "REA 1"), sector("rea_2", "REA 2")]
  });
  const reconstruccion = {
    asignaciones: [
      sector("rea_1", "REA 1", { id: "persona-c", nombre: "Persona C" }),
      sector("rea_2", "REA 2", { id: "persona-d", nombre: "Persona D" })
    ],
    asistencia: { "id:persona-c": "ausente" },
    libres: [{ id: "libre-actual", nombre: "Libre actual" }]
  };
  const datos = resolverDatosPresentacionCierreTurno({ snapshot, reconstruccion });
  assert.equal(datos.fuente, "snapshot_cierre");
  assert.deepEqual(datos.asignaciones.map((item) => item.enfermero.nombre), ["Persona A", "Persona B"]);
  assert.deepEqual(datos.libres.map(({ nombre }) => nombre), ["Libre cierre"]);
  assert.equal(datos.asistencia["id:persona-a"], "presente");
  assert.deepEqual(reconstruccion.asignaciones.map((item) => item.enfermero.nombre), ["Persona C", "Persona D"]);
});

prueba("día abierto conserva la reconstrucción operativa sin snapshot ficticio", () => {
  const reconstruccion = {
    asignaciones: [sector("rea_1", "REA 1", persona)],
    asistencia: { "id:persona-1": "presente" },
    libres: []
  };
  const datos = resolverDatosPresentacionCierreTurno({ reconstruccion });
  assert.equal(datos.fuente, "reconstruccion_operativa");
  assert.equal(datos.asignaciones, reconstruccion.asignaciones);
  assert.equal(datos.asistencia, reconstruccion.asistencia);
});

prueba("autoridad de presentación no muta snapshot v1 ni completa sus IDs", () => {
  const snapshot = {
    asignaciones: [{ sector: "REA 1", persona: { personaId: "p-v1", nombre: "V1" }, tipo: "sector" }],
    resumen: { conteos: { presentes: 1 }, alertas: [] },
    asistencia: { "id:p-v1": "presente" },
    libres: [{ personaId: "libre-v1", nombre: "Libre V1" }]
  };
  const antes = structuredClone(snapshot);
  const datos = resolverDatosPresentacionCierreTurno({
    snapshot,
    reconstruccion: { asignaciones: [sector("rea_1", "REA 1", persona)] }
  });
  assert.equal(datos.asignaciones[0].sectorId, undefined);
  assert.equal(datos.asignaciones[0].origenCoberturaAutomaticaSectorId, undefined);
  assert.deepEqual(snapshot, antes);
});

prueba("PDF cerrado consume la misma fotografía v2 con RT ET ST Turnante y Extra", () => {
  const asignaciones = [
    { ...sector("rea_1", "REA 1", persona), origenCoberturaAutomaticaSectorId: "rea_2" },
    { ...sector("explora_1", "Explora 1", { ...persona, id: "p-et" }),
      origenCoberturaAutomaticaSectorId: "explora_2" },
    { ...sector("sillon_1", "Sillones 1", { ...persona, id: "p-st" }),
      origenCoberturaAutomaticaSectorId: "sillon_2" },
    { ...sector("pre_int_1", "PRE INT 1", { ...persona, id: "p-pre" }),
      origenCoberturaAutomaticaSectorId: "pre_int_2" },
    { nombre: "Destino T", tipo: "sector", enfermero: { ...persona, id: "p-t", esTurnante: true } },
    { nombre: "Destino E", tipo: "sector", enfermero: { ...persona, id: "p-e", esExtra: true } }
  ];
  const snapshot = crearSnapshotCierreTurno({
    fecha: "2026-08-13", tipo: "enfermero", resumen: resumen(asignaciones),
    asignaciones, asistencia: {}, destinosOperativos: asignaciones
  });
  const datos = resolverDatosPresentacionCierreTurno({ snapshot });
  assert.deepEqual(prepararFilasCalendarioPDF(datos.asignaciones).map((fila) => fila[1]), [
    "PERSONA UNO (RT)", "PERSONA UNO (ET)", "PERSONA UNO (ST)", "PERSONA UNO",
    "PERSONA UNO (T)", "PERSONA UNO (E)"
  ]);
});

prueba("PDF v1 usa únicamente el orden y personas disponibles en el snapshot", () => {
  const snapshot = {
    asignaciones: [
      { sector: "Segundo histórico", persona: { personaId: "v1-b", nombre: "Persona B" }, tipo: "sector" },
      { sector: "Primero histórico", persona: { personaId: "v1-a", nombre: "Persona A" }, tipo: "sector" }
    ]
  };
  const antes = structuredClone(snapshot);
  const datos = resolverDatosPresentacionCierreTurno({
    snapshot,
    reconstruccion: { asignaciones: [sector("rea_1", "Actual", persona)] }
  });
  assert.deepEqual(prepararFilasCalendarioPDF(datos.asignaciones), [
    ["SEGUNDO HISTÓRICO", "PERSONA B"],
    ["PRIMERO HISTÓRICO", "PERSONA A"]
  ]);
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
