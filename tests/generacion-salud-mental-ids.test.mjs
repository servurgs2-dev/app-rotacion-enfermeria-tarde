import assert from "node:assert/strict";
import fs from "node:fs";
import {
  adaptarPlanillaSaludMental,
  obtenerFilaSaludMentalActiva,
  obtenerReferenciaSaludMental
} from "../src/utils/saludMentalGeneracion.js";
import { generarRotacionMensual, generarDistribucionParaIndice } from "../src/utils/rotacionPlanilla.js";
import { crearReferenciaPersona } from "../src/utils/referenciasPersonas.js";

let numero = 0;
const prueba = (nombre, ejecutar) => {
  ejecutar();
  numero += 1;
  console.log(`✓ ${numero} ${nombre}`);
};

const persona = (id, nombre, categoria = "enfermero") => ({ id, nombre, categoria });
const titular = persona("persona-sm", "Titular SM");
const otra = persona("persona-otra", "Otra Persona");
const refTitular = crearReferenciaPersona(titular);
const refOtra = crearReferenciaPersona(otra);
const fila = (etiqueta, { activo = true, orden = 1, categoria = "enfermero" } = {}) => ({
  filaId: `${categoria}.sector.salud_mental`,
  tipo: "sector",
  sectorId: "salud_mental",
  etiqueta,
  orden,
  activo
});
const otraFila = (etiqueta = "REA 1", orden = 0) => ({
  filaId: "enfermero.sector.rea_1",
  tipo: "sector",
  sectorId: "rea_1",
  etiqueta,
  orden,
  activo: true
});
const semanas = [{ clave: "semana1" }, { clave: "semana2" }];

const generarSemanal = ({ etiqueta, categoria = "enfermero", activo = true, orden = 1 }) => {
  const configuracion = [otraFila("REA 1", orden === 0 ? 1 : 0), fila(etiqueta, { activo, orden, categoria })];
  const activas = configuracion.filter((item) => item.activo !== false).sort((a, b) => a.orden - b.orden);
  const adaptada = adaptarPlanillaSaludMental({
    planilla: { semana1: { "REA 1": refOtra, [categoria === "enfermero" ? "SM" : "Salud Mental"]: refTitular } },
    filasConfiguracion: configuracion
  });
  const filaSM = obtenerFilaSaludMentalActiva(configuracion);
  return {
    configuracion,
    adaptada,
    resultado: generarRotacionMensual({
      planilla: adaptada,
      filas: activas.map((item) => item.etiqueta),
      semanas,
      filaFija: filaSM?.etiqueta || null,
      personal: [titular, otra]
    })
  };
};

prueba("Enfermeros histórico SM conserva titular fijo", () => {
  const { resultado } = generarSemanal({ etiqueta: "SM" });
  assert.deepEqual(resultado.semana2.SM, refTitular);
});

prueba("Licenciados histórico Salud Mental conserva titular fijo", () => {
  const { resultado } = generarSemanal({ etiqueta: "Salud Mental", categoria: "licenciado" });
  assert.deepEqual(resultado.semana2["Salud Mental"], refTitular);
});

prueba("Enfermeros renombrado usa Psiquiatría sin fila fantasma", () => {
  const { resultado } = generarSemanal({ etiqueta: "Psiquiatría" });
  assert.deepEqual(resultado.semana2.Psiquiatría, refTitular);
  assert.equal(Object.hasOwn(resultado.semana2, "SM"), false);
});

prueba("Licenciados renombrado conserva Área de Salud Mental", () => {
  const { resultado } = generarSemanal({ etiqueta: "Área de Salud Mental", categoria: "licenciado" });
  assert.deepEqual(resultado.semana2["Área de Salud Mental"], refTitular);
  assert.equal(Object.hasOwn(resultado.semana2, "Salud Mental"), false);
});

prueba("nocturno renombrado fija salud_mental por etiqueta efectiva", () => {
  const configuracion = [otraFila(), fila("Psiquiatría")];
  const adaptada = adaptarPlanillaSaludMental({
    planilla: { rotacion3Dias: { asignacionBase: { "REA 1": refOtra, SM: refTitular }, bloques: {} } },
    filasConfiguracion: configuracion
  });
  const resultado = generarDistribucionParaIndice({
    distribucionBase: adaptada.rotacion3Dias.asignacionBase,
    filas: ["REA 1", "Psiquiatría"],
    filasFijas: ["Psiquiatría"],
    indice: 1
  });
  assert.deepEqual(resultado.Psiquiatría, refTitular);
  assert.equal(Object.hasOwn(resultado, "SM"), false);
});

prueba("generación flexible recibe la etiqueta fija resuelta por sectorId", () => {
  const configuracion = [otraFila(), fila("Psiquiatría")];
  const resuelta = obtenerFilaSaludMentalActiva(configuracion);
  assert.equal(resuelta.sectorId, "salud_mental");
  assert.equal(resuelta.etiqueta, "Psiquiatría");
});

prueba("fila inactiva elimina alias y no reaparece como fija", () => {
  const { adaptada, resultado } = generarSemanal({ etiqueta: "Psiquiatría", activo: false });
  assert.equal(obtenerFilaSaludMentalActiva([fila("Psiquiatría", { activo: false })]), null);
  assert.equal(Object.hasOwn(adaptada.semana1, "SM"), false);
  assert.equal(Object.hasOwn(resultado.semana2, "SM"), false);
  assert.equal(Object.hasOwn(resultado.semana2, "Psiquiatría"), false);
  assert.equal(Object.hasOwn(resultado.semana2, "null"), false);
});

prueba("Drag and Drop conserva semántica y nueva posición", () => {
  const { resultado } = generarSemanal({ etiqueta: "Psiquiatría", orden: 0 });
  assert.deepEqual(Object.keys(resultado.semana2), ["Psiquiatría", "REA 1"]);
  assert.deepEqual(resultado.semana2.Psiquiatría, refTitular);
});

prueba("no duplica persona ni conserva alias histórico fantasma", () => {
  const { resultado } = generarSemanal({ etiqueta: "Psiquiatría" });
  const referencias = Object.values(resultado.semana2).filter(Boolean);
  assert.equal(referencias.filter((ref) => ref.personaId === titular.id).length, 1);
  assert.equal(Object.hasOwn(resultado.semana2, "SM"), false);
});

prueba("otras filas conservan su referencia", () => {
  const { resultado } = generarSemanal({ etiqueta: "Psiquiatría" });
  assert.deepEqual(resultado.semana1["REA 1"], refOtra);
});

prueba("titular se resuelve desde etiqueta efectiva o alias legacy", () => {
  const filaSM = fila("Psiquiatría");
  assert.deepEqual(obtenerReferenciaSaludMental({ distribucion: { Psiquiatría: refTitular }, fila: filaSM }), refTitular);
  assert.deepEqual(obtenerReferenciaSaludMental({ distribucion: { SM: refTitular }, fila: filaSM }), refTitular);
});

prueba("adaptación es pura y no reescribe configuración", () => {
  const configuracion = [otraFila(), fila("Psiquiatría")];
  const planilla = { semana1: { SM: refTitular } };
  const antesConfiguracion = JSON.stringify(configuracion);
  const antesPlanilla = JSON.stringify(planilla);
  adaptarPlanillaSaludMental({ planilla, filasConfiguracion: configuracion });
  assert.equal(JSON.stringify(configuracion), antesConfiguracion);
  assert.equal(JSON.stringify(planilla), antesPlanilla);
});

prueba("PlanillaMensual decide Salud Mental desde sectorId", () => {
  const fuente = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  assert.match(fuente, /obtenerFilaSaludMentalActiva\(filasConfiguracion\)/);
  assert.doesNotMatch(fuente, /filasFijas:\s*\["SM"\]/);
  assert.doesNotMatch(fuente, /filaFija:\s*tipo\s*===/);
  assert.doesNotMatch(fuente, /valoresPeriodo\[sectorSM\]/);
});

console.log(`\n${numero} pruebas de generación de Salud Mental por sectorId pasaron.`);
