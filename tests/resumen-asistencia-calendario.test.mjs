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

console.log(`\n${aprobadas} pruebas de resumen de asistencia aprobadas.`);
