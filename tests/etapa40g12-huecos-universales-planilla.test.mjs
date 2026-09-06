import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { obtenerEstrategiaRotacionPlanilla } from "../src/config/turnos.js";
import {
  generarRotacionMensual,
  generarRotacionMensualDesdeConfiguracion
} from "../src/utils/rotacionPlanilla.js";
import {
  analizarDistribucionBaseEnfermeros,
  validarPosicionesNoAplicables
} from "../src/utils/generacionFlexiblePlanilla.js";
import { obtenerFilasActivas } from "../src/utils/configuracionPlanilla.js";

const ref = (id) => ({ personaId: id, nombre: id });
const semanas = ["semana1", "semana2", "semana3"].map((clave) => ({ clave }));
const personas = ["1", "2", "3"].map((id) => ({ id, nombre: id }));
const contar = (distribucion) => Object.values(distribucion).filter((valor) => valor?.personaId).length;

test("la matriz conserva Enfermeros Noche por bloques y las otras siete rutas semanales", () => {
  for (const categoria of ["enfermero", "licenciado"]) {
    for (const turnoId of ["manana", "tarde", "vespertino", "noche"]) {
      const estrategia = obtenerEstrategiaRotacionPlanilla({ turnoId, tipo: categoria, mesActivo: "2026-09" });
      assert.equal(
        estrategia.tipo,
        categoria === "enfermero" && turnoId === "noche" ? "cada_3_dias" : "semanal"
      );
    }
  }
});

test("cero, algunas y todas las vacías pueden excluirse universalmente", () => {
  const contexto = { filas: ["A", "B", "C"], filasVacias: ["B", "C"] };
  for (const seleccionadas of [[], ["B"], ["B", "C"]]) {
    assert.equal(validarPosicionesNoAplicables({ ...contexto, seleccionadas }).ok, true);
  }
});

test("ocupadas, inexistentes y selecciones duplicadas siguen bloqueadas", () => {
  const contexto = { filas: ["A", "B"], filasVacias: ["B"] };
  assert.equal(validarPosicionesNoAplicables({ ...contexto, seleccionadas: ["A"] }).ok, false);
  assert.equal(validarPosicionesNoAplicables({ ...contexto, seleccionadas: ["X"] }).ok, false);
  assert.equal(validarPosicionesNoAplicables({ ...contexto, seleccionadas: ["B", "B"] }).ok, false);
});

test("Semana 1 rota personas y huecos sin duplicar ni perder", () => {
  const filas = ["A", "B", "C", "D"];
  const planilla = { semana1: { A: ref("1"), B: ref("2"), C: "", D: ref("3") } };
  const generada = generarRotacionMensual({ planilla, filas, semanas, personal: personas });
  assert.equal(contar(generada.semana1), 3);
  assert.equal(contar(generada.semana2), 3);
  assert.equal(Object.values(generada.semana2).filter((valor) => valor === "").length, 1);
  assert.notEqual(Object.entries(generada.semana2).find(([, valor]) => valor === "")?.[0], "C");
});

test("los casos 8 personas con cero, una o dos exclusiones conservan ocho personas", () => {
  const filas = Array.from({ length: 10 }, (_, indice) => `F${indice + 1}`);
  const base = Object.fromEntries(filas.map((fila, indice) => [fila, indice < 8 ? ref(String(indice + 1)) : ""]));
  const personal = Array.from({ length: 8 }, (_, indice) => ({ id: String(indice + 1), nombre: String(indice + 1) }));
  for (const posicionesNoAplicables of [[], ["F9"], ["F9", "F10"]]) {
    const generada = generarRotacionMensual({ planilla: { semana1: base }, filas, semanas, personal, posicionesNoAplicables });
    assert.equal(contar(generada.semana2), 8);
  }
});

test("más huecos que personas funciona también semanalmente", () => {
  const filas = Array.from({ length: 20 }, (_, indice) => `F${indice + 1}`);
  const base = Object.fromEntries(filas.map((fila, indice) => [fila, indice < 3 ? ref(String(indice + 1)) : ""]));
  const generada = generarRotacionMensual({ planilla: { semana1: base }, filas, semanas, personal: personas });
  assert.equal(contar(generada.semana2), 3);
  assert.equal(Object.values(generada.semana2).filter((valor) => valor === "").length, 17);
});

test("T6 y T4 habilitados pueden ser hueco o no aplicable", () => {
  for (const turnante of ["T6", "T4"]) {
    const filas = ["A", "B", turnante];
    const base = { A: ref("1"), B: ref("2"), [turnante]: "" };
    const conHueco = generarRotacionMensual({ planilla: { semana1: base }, filas, semanas, personal: personas });
    const excluido = generarRotacionMensual({ planilla: { semana1: base }, filas, semanas, personal: personas, posicionesNoAplicables: [turnante] });
    assert.equal(contar(conHueco.semana2), 2);
    assert.equal(excluido.semana2[turnante], "");
  }
});

test("Licenciados v2 distingue fila inactiva, hueco activo y no aplicable", () => {
  const configuracion = {
    categoria: "licenciado",
    estructuraVersion: 2,
    filas: [
      { filaId: "a", sectorId: "a", etiqueta: "A", tipo: "sector", activo: true, orden: 1 },
      { filaId: "b", sectorId: "b", etiqueta: "B", tipo: "sector", activo: true, orden: 2 },
      { filaId: "t3", sectorId: "t3", etiqueta: "T3", tipo: "turnante", activo: true, orden: 3 },
      { filaId: "inactiva", sectorId: "x", etiqueta: "X", tipo: "sector", activo: false, orden: 4 }
    ],
    asignacionesFijas: []
  };
  assert.deepEqual(obtenerFilasActivas(configuracion.filas).map((fila) => fila.etiqueta), ["A", "B", "T3"]);
  const generada = generarRotacionMensualDesdeConfiguracion({
    configuracion, categoria: "licenciado", planilla: { semana1: { A: ref("1"), B: "", T3: "" } },
    semanas, personal: personas, posicionesNoAplicables: ["T3"]
  });
  assert.equal(Object.hasOwn(generada.semana2, "X"), false);
  assert.equal(generada.semana2.T3, "");
  assert.equal(contar(generada.semana2), 1);
});

test("una asignación fija conserva su persona frente a huecos", () => {
  const personalLicenciado = personas.map((persona) => ({ ...persona, categoria: "licenciado" }));
  const configuracion = {
    categoria: "licenciado",
    estructuraVersion: 2,
    filas: [
      { filaId: "a", sectorId: "a", etiqueta: "A", tipo: "sector", activo: true, orden: 1 },
      { filaId: "b", sectorId: "b", etiqueta: "B", tipo: "sector", activo: true, orden: 2 }
    ],
    asignacionesFijas: [{ sectorId: "a", personaId: "1" }]
  };
  const generada = generarRotacionMensualDesdeConfiguracion({
    configuracion, categoria: "licenciado", planilla: { semana1: { A: ref("1"), B: "" } },
    semanas, personal: personalLicenciado, filasFijas: ["A"]
  });
  assert.equal(generada.semana2.A.personaId, "1");
  assert.equal(generada.semana2.B, "");
});

test("Planilla y modal usan el contrato universal sin condición nocturna", () => {
  const planilla = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  const modal = fs.readFileSync("src/components/planilla/SelectorPosicionesNoAplicables.jsx", "utf8");
  assert.match(planilla, /function generarMes\(\)[\s\S]*iniciarGeneracionFlexible\(\)/);
  assert.doesNotMatch(planilla, /permitirHuecos=\{usaRotacionTresDias/);
  assert.doesNotMatch(modal, /Seleccioná exactamente/);
  assert.match(modal, /permanecerán como huecos/);
});

test("Calendario y PDF conservan representación de posiciones activas vacías", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const pdf = fs.readFileSync("src/utils/exportPDF.js", "utf8");
  assert.match(calendario, /Sin cobertura|Sin asignar/);
  assert.match(pdf, /Sin asignar|—|-|Ninguno/);
});
