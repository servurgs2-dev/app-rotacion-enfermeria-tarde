import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ESTADOS_ASISTENCIA,
  obtenerPersonasPrevistasConAusentes
} from "../src/utils/asistenciaPersonas.js";
import { crearResumenTurno } from "../src/utils/resumenTurno.js";
import { crearResumenCategoriaInicio } from "../src/utils/resumenInicioTurno.js";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas} ${nombre}`);
};

const persona = (indice, categoria = "enfermero") => ({
  id: `${categoria}-${indice}`,
  personaId: `${categoria}-${indice}`,
  nombre: `Persona ${indice}`,
  categoria
});
const personas = Array.from({ length: 12 }, (_, indice) => persona(indice + 1));
const asignaciones = personas.map((enfermero, indice) => ({
  sectorId: `sector-${indice + 1}`,
  nombre: `Sector ${indice + 1}`,
  tipo: "sector",
  enfermero
}));
const asistenciaCon = (cambios = {}) => Object.fromEntries(
  personas.map((actual) => [
    `id:${actual.id}`,
    cambios[actual.id] || ESTADOS_ASISTENCIA.PRESENTE
  ])
);
const resumir = ({ asistencia = asistenciaCon(), efectivas = asignaciones, ausentes = [] } = {}) => {
  const previstas = obtenerPersonasPrevistasConAusentes({
    asignaciones: efectivas,
    ausentes
  });
  return crearResumenTurno({
    asignaciones: efectivas,
    personasPrevistas: previstas,
    asistencia,
    destinosOperativos: efectivas
  }).conteos;
};

probar("12 previstos presentes producen 12 / 12 / 0 / 0", () => {
  const conteos = resumir();
  assert.deepEqual(
    [conteos.previstos, conteos.presentes, conteos.ausentes, conteos.pendientes],
    [12, 12, 0, 0]
  );
});

probar("un ausente retirado de la distribución produce 12 / 11 / 1 / 0", () => {
  const ausente = personas[4];
  const conteos = resumir({
    asistencia: asistenciaCon({ [ausente.id]: ESTADOS_ASISTENCIA.AUSENTE }),
    efectivas: asignaciones.filter((fila) => fila.enfermero.id !== ausente.id),
    ausentes: [{ persona: ausente, sectorOrigen: "Sector 5" }]
  });
  assert.deepEqual(
    [conteos.previstos, conteos.presentes, conteos.ausentes, conteos.pendientes],
    [12, 11, 1, 0]
  );
});

probar("un pendiente produce 12 / 11 / 0 / 1", () => {
  const asistencia = asistenciaCon();
  delete asistencia[`id:${personas[2].id}`];
  const conteos = resumir({ asistencia });
  assert.deepEqual(
    [conteos.previstos, conteos.presentes, conteos.ausentes, conteos.pendientes],
    [12, 11, 0, 1]
  );
});

probar("Presente → Ausente actualiza las categorías mutuamente excluyentes", () => {
  const antes = resumir();
  const despues = resumir({
    asistencia: asistenciaCon({ [personas[0].id]: ESTADOS_ASISTENCIA.AUSENTE }),
    efectivas: asignaciones.slice(1),
    ausentes: [{ persona: personas[0] }]
  });
  assert.equal(antes.presentes - despues.presentes, 1);
  assert.equal(despues.ausentes - antes.ausentes, 1);
});

probar("Ausente → Presente revierte los conteos", () => {
  assert.deepEqual([resumir().presentes, resumir().ausentes], [12, 0]);
});

probar("una identidad no cuenta simultáneamente como presente y ausente", () => {
  const actual = personas[0];
  const conteos = resumir({
    asistencia: asistenciaCon({ [actual.id]: ESTADOS_ASISTENCIA.AUSENTE }),
    efectivas: asignaciones,
    ausentes: [{ persona: { ...actual, nombre: "Nombre actualizado" } }]
  });
  assert.equal(conteos.previstos, 12);
  assert.equal(conteos.presentes + conteos.ausentes + conteos.pendientes, 12);
});

probar("bloque Ausentes y resumen comparten personaId estable", () => {
  const actual = personas[1];
  const previstas = obtenerPersonasPrevistasConAusentes({
    asignaciones: asignaciones.slice(2),
    ausentes: [{ persona: { ...actual, nombre: "Mismo ID" } }]
  });
  assert.equal(previstas.filter((item) => item.personaId === actual.personaId).length, 1);
});

probar("Enfermeros y Licenciados usan la misma proyección", () => {
  const licenciado = persona(1, "licenciado");
  const conteos = crearResumenTurno({
    asignaciones: [],
    personasPrevistas: [licenciado],
    asistencia: { [`id:${licenciado.id}`]: ESTADOS_ASISTENCIA.AUSENTE }
  }).conteos;
  assert.deepEqual([conteos.previstos, conteos.ausentes], [1, 1]);
});

probar("Extras conservan su contador separado", () => {
  const extra = { id: "extra-1", personaId: "extra-1", nombre: "Extra" };
  const conteos = crearResumenTurno({
    asignaciones,
    personasPrevistas: personas,
    asistencia: asistenciaCon(),
    extras: [extra, extra]
  }).conteos;
  assert.equal(conteos.previstos, 12);
  assert.equal(conteos.extras, 1);
});

probar("ausencias programadas no duplican la asistencia manual", () => {
  const actual = personas[0];
  const conteos = crearResumenTurno({
    asignaciones: asignaciones.slice(1),
    personasPrevistas: personas,
    asistencia: asistenciaCon({ [actual.id]: ESTADOS_ASISTENCIA.AUSENTE }),
    licencias: [actual],
    certificaciones: [actual],
    noDisponibles: [actual]
  }).conteos;
  assert.equal(conteos.ausentes, 1);
  assert.equal(conteos.licencias, 1);
  assert.equal(conteos.certificaciones, 1);
});

probar("los dos resúmenes de Calendario comparten resumenMostrado", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /Previstos: \{resumenMostrado\.conteos\.previstos\}/);
  assert.match(fuente, /\["Previstos", resumenMostrado\.conteos\.previstos\]/);
});

probar("Inicio recibe la cohorte y la asistencia por onDataReady", () => {
  const datos = {
    asignaciones: asignaciones.slice(1),
    personasPrevistas: personas,
    asistencia: asistenciaCon({ [personas[0].id]: ESTADOS_ASISTENCIA.AUSENTE }),
    ausentes: [personas[0]]
  };
  const resumen = crearResumenCategoriaInicio(datos);
  assert.deepEqual(
    [resumen.previstos, resumen.presentes, resumen.ausentesAsistencia, resumen.pendientes],
    [12, 11, 1, 0]
  );
});

probar("la corrección no modifica distribución ni Planilla", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /resumenInicio:\s*\{[\s\S]*personasPrevistas,/);
  assert.doesNotMatch(
    fs.readFileSync("src/utils/asistenciaPersonas.js", "utf8"),
    /planilla|resolverTurnantesYCoberturasOperativas/
  );
});

const destino = (destinoId, nombre, personaAsignada = null) => ({
  tipo: "sector", destinoId, nombre, etiqueta: nombre, enfermero: personaAsignada
});
const resumirDestinos = (destinosOperativos) => crearResumenTurno({
  asignaciones: destinosOperativos,
  destinosOperativos
});

probar("Licenciados v1 y Enfermeros conservan el resumen operativo existente", () => {
  assert.equal(crearResumenTurno({ asignaciones, destinosOperativos: asignaciones }).conteos.sectoresSinCobertura, 0);
});
probar("v2 <=9 expone exactamente ambos combinados", () => {
  const resultado = resumirDestinos([
    destino("reanimacion_sillones", "Reanimación + Sillones", persona(20, "licenciado")),
    destino("diagnostico_explora", "Diagnóstico + Explora")
  ]);
  assert.equal(resultado.conteos.sectoresSinCobertura, 1);
  assert.equal(resultado.alertas.filter(({ tipo }) => tipo.includes("sin_cobertura")).length, 1);
});
probar("v2 10 Sillones conserva sólo los tres destinos visibles", () => {
  assert.equal(resumirDestinos([
    destino("reanimacion", "Reanimación"), destino("sillones", "Sillones"),
    destino("diagnostico_explora", "Diagnóstico + Explora")
  ]).conteos.sectoresSinCobertura, 3);
});
probar("v2 10 Explora conserva sólo los tres destinos visibles", () => {
  assert.equal(resumirDestinos([
    destino("reanimacion_sillones", "Reanimación + Sillones"),
    destino("diagnostico", "Diagnóstico"), destino("explora", "Explora")
  ]).conteos.sectoresSinCobertura, 3);
});
probar("v2 11+ expone cuatro destinos individuales por destinoId", () => {
  assert.equal(resumirDestinos([
    destino("reanimacion", "Reanimación"), destino("sillones", "Sillones"),
    destino("diagnostico", "Diagnóstico"), destino("explora", "Explora")
  ]).conteos.sectoresSinCobertura, 4);
});
probar("Turnante T4 y Extra consumidos aparecen una sola vez en destino final", () => {
  const t4 = persona(40, "licenciado");
  const extra = persona(41, "licenciado");
  const resultado = resumirDestinos([destino("sillones", "Sillones", t4), destino("explora", "Explora", extra)]);
  assert.equal(resultado.alertas.some(({ tipo }) => tipo === "persona_duplicada"), false);
});
probar("movimiento manual se refleja sin reconstruir asignación base", () => {
  const a = persona(50, "licenciado"); const b = persona(51, "licenciado");
  const resultado = resumirDestinos([destino("reanimacion", "Reanimación", b), destino("sillones", "Sillones", a)]);
  assert.equal(resultado.conteos.sectoresSinCobertura, 0);
});
probar("Sin asignar permanece separado de destinos operativos", () => {
  const libre = persona(60, "licenciado");
  const inicio = crearResumenCategoriaInicio({
    asignaciones: [destino("reanimacion", "Reanimación", persona(61, "licenciado")), { tipo: "sector", nombre: "SIN ASIGNAR", enfermero: libre }],
    destinosOperativos: [destino("reanimacion", "Reanimación", persona(61, "licenciado"))]
  });
  assert.equal(inicio.sinAsignar, 1);
  assert.equal(Object.hasOwn(inicio, "destinosOperativos"), false);
});
probar("cambio 9→10→11 recalcula sin conservar destinos anteriores", () => {
  const nueve = resumirDestinos([destino("reanimacion_sillones", "Reanimación + Sillones"), destino("diagnostico_explora", "Diagnóstico + Explora")]);
  const diez = resumirDestinos([destino("reanimacion", "Reanimación"), destino("sillones", "Sillones"), destino("diagnostico_explora", "Diagnóstico + Explora")]);
  const once = resumirDestinos([destino("reanimacion", "Reanimación"), destino("sillones", "Sillones"), destino("diagnostico", "Diagnóstico"), destino("explora", "Explora")]);
  assert.deepEqual([nueve.conteos.sectoresSinCobertura, diez.conteos.sectoresSinCobertura, once.conteos.sectoresSinCobertura], [2, 3, 4]);
});
probar("cada combinado cuenta como un destino operativo", () => {
  const combinados = [destino("reanimacion_sillones", "Reanimación + Sillones"), destino("diagnostico_explora", "Diagnóstico + Explora", persona(70, "licenciado"))];
  assert.equal(crearResumenTurno({ asignaciones: combinados, destinosOperativos: combinados }).conteos.sectoresSinCobertura, 1);
});
probar("crearResumenTurno usa internamente los dos combinados v2 reales", () => {
  const vacios = [
    destino("reanimacion_sillones", "Reanimación + Sillones"),
    destino("diagnostico_explora", "Diagnóstico + Explora")
  ];
  const cubiertos = vacios.map((fila, indice) => ({ ...fila, enfermero: persona(80 + indice, "licenciado") }));
  assert.equal(crearResumenTurno({ asignaciones: vacios, destinosOperativos: vacios }).conteos.sectoresSinCobertura, 2);
  assert.equal(crearResumenTurno({ asignaciones: cubiertos, destinosOperativos: cubiertos }).conteos.sectoresSinCobertura, 0);
});
probar("crearResumenTurno recibe exactamente tres destinos v2 para dotación 10", () => {
  const tres = [
    destino("reanimacion", "Reanimación", persona(90, "licenciado")),
    destino("sillones", "Sillones"),
    destino("diagnostico_explora", "Diagnóstico + Explora", persona(91, "licenciado"))
  ];
  const resumen = crearResumenTurno({ asignaciones: tres, destinosOperativos: tres });
  assert.equal(resumen.conteos.sectoresSinCobertura, 1);
  assert.equal(resumen.alertas.filter(({ tipo }) => tipo.includes("sin_cobertura")).length, 1);
});
probar("crearResumenTurno recibe exactamente cuatro destinos v2 para 11+", () => {
  const cuatro = [
    destino("reanimacion", "Reanimación", persona(100, "licenciado")),
    destino("sillones", "Sillones", persona(101, "licenciado")),
    destino("diagnostico", "Diagnóstico"),
    destino("explora", "Explora", persona(102, "licenciado"))
  ];
  assert.equal(crearResumenTurno({ asignaciones: cuatro, destinosOperativos: cuatro }).conteos.sectoresSinCobertura, 1);
});
probar("Calendario cablea la distribución final al resumen interno", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(calendario, /const destinosOperativos = esDiaParo[\s\S]*asignacionOrdenada\.filter/);
  assert.match(calendario, /return \{[\s\S]*destinosOperativos,[\s\S]*\};[\s\S]*crearResumenTurno\(\{[\s\S]*\.\.\.datosResumenTurno/);
});
probar("Inicio conserva UI y shape históricos mientras el dominio v2 permanece", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const inicio = fs.readFileSync("src/components/layout/VistaInicio.jsx", "utf8");
  const dominio = fs.readFileSync("src/utils/resumenTurno.js", "utf8");
  assert.doesNotMatch(calendario, /destinosOperativos: resolverSectoresOperativosResumen\(/);
  assert.doesNotMatch(inicio, /Distribución operativa/);
  assert.doesNotMatch(inicio, /destinosOperativos\.map/);
  assert.doesNotMatch(dominio, /resolverSectoresOperativosResumen/);
  assert.match(dominio, /destino:\$\{destino\.destinoId\}/);
});

console.log(`\n${aprobadas} pruebas de resumen de asistencia aprobadas.`);
