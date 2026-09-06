import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  analizarDistribucionBaseEnfermeros,
  validarPosicionesNoAplicables
} from "../src/utils/generacionFlexiblePlanilla.js";
import {
  derivarAsignacionBaseDesdeBloque,
  regenerarRotacion3DiasDesdePrimerBloque,
  rotarDistribucionPorPasos
} from "../src/utils/rotacionPlanilla.js";
import { vaciarPlanillaDesdeBloque2, vaciarPlanillaMensual } from "../src/utils/limpiezaSegura.js";
import { aplicarIntercambioPlanilla } from "../src/utils/intercambioPlanilla.js";
import { aplicarCambiosPreparacionAlEstado } from "../src/utils/edicionPreparacionVersionada.js";

const ref = (id) => ({ personaId: id, nombre: id });
const filas = ["A", "B", "C", "D"];
const personal = ["1", "2", "3"].map((id) => ({ id, nombre: id, categoria: "enfermero" }));
const periodos = [
  { clave: "2026-08-31", indice: 20 },
  { clave: "2026-09-03", indice: 21 },
  { clave: "2026-09-06", indice: 22 }
];
const parcial = { A: ref("1"), B: ref("2"), C: ref("3"), D: "" };

test("Bloque 1 parcial es válido y descubre sus vacíos sin convertirlos en exclusiones", () => {
  const analisis = analizarDistribucionBaseEnfermeros({
    distribucionBase: parcial, filas, personal, cantidadEsperada: filas.length
  });
  assert.equal(analisis.ok, true);
  assert.deepEqual(analisis.filasVacias, ["D"]);
  assert.equal(analisis.cantidadPersonas, 3);
});

test("Noche permite cero, algunas o todas las posiciones vacías como no aplicables", () => {
  const base = { filas, filasVacias: ["C", "D"] };
  assert.equal(validarPosicionesNoAplicables({ ...base, seleccionadas: [] }).ok, true);
  assert.equal(validarPosicionesNoAplicables({ ...base, seleccionadas: ["C"] }).ok, true);
  assert.equal(validarPosicionesNoAplicables({ ...base, seleccionadas: ["C", "D"] }).ok, true);
});

test("una posición ocupada o inexistente no puede excluirse", () => {
  const base = { filas, filasVacias: ["D"] };
  assert.equal(validarPosicionesNoAplicables({ ...base, seleccionadas: ["A"] }).ok, false);
  assert.equal(validarPosicionesNoAplicables({ ...base, seleccionadas: ["X"] }).ok, false);
});

test("la estrategia semanal también admite huecos sin cantidad exacta", () => {
  const base = { filas, filasVacias: ["C", "D"] };
  assert.equal(validarPosicionesNoAplicables({ ...base, seleccionadas: [] }).ok, true);
  assert.equal(validarPosicionesNoAplicables({ ...base, seleccionadas: ["C", "D"] }).ok, true);
});

test("un hueco aplicable rota junto con las personas", () => {
  const siguiente = rotarDistribucionPorPasos({ distribucionBase: parcial, filas, pasos: 1 });
  assert.equal(siguiente.A, "");
  assert.equal(siguiente.B.personaId, "1");
  assert.deepEqual(Object.values(siguiente).filter((valor) => valor === ""), [""]);
});

test("varios huecos, incluso más que personas, rotan sin crear ni perder personas", () => {
  const base = { A: ref("1"), B: "", C: "", D: "" };
  const siguiente = rotarDistribucionPorPasos({ distribucionBase: base, filas, pasos: 2 });
  assert.equal(Object.values(siguiente).filter((valor) => valor === "").length, 3);
  assert.deepEqual(
    Object.values(siguiente).filter((valor) => valor?.personaId).map((valor) => valor.personaId),
    ["1"]
  );
});

test("persona, hueco y no aplicable permanecen como tres conceptos distintos", () => {
  const siguiente = rotarDistribucionPorPasos({
    distribucionBase: parcial, filas, posicionesNoAplicables: ["D"], pasos: 1
  });
  assert.equal(siguiente.D, "");
  assert.equal(Object.values(siguiente).filter((valor) => valor?.personaId).length, 3);
  const conHuecoYExclusion = rotarDistribucionPorPasos({
    distribucionBase: { A: ref("1"), B: ref("2"), C: "", D: "" },
    filas, posicionesNoAplicables: ["D"], pasos: 1
  });
  assert.equal(conHuecoYExclusion.A, "");
  assert.equal(conHuecoYExclusion.D, "");
  assert.equal(Object.values(conHuecoYExclusion).filter((valor) => valor?.personaId).length, 2);
});

test("la regeneración nocturna conserva huecos y T6 dentro del anillo", () => {
  const filasT6 = ["A", "B", "T6"];
  const bloque = { A: ref("1"), B: "", T6: ref("2") };
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: { fechaBase: "2026-07-02", duracionDias: 3, bloques: { [periodos[0].clave]: bloque } },
    periodos, filas: filasT6, personal, categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.rotacion3Dias.bloques[periodos[0].clave], bloque);
  assert.equal(Object.values(resultado.rotacion3Dias.bloques[periodos[1].clave]).filter((v) => v === "").length, 1);
  assert.deepEqual(
    Object.values(resultado.rotacion3Dias.bloques[periodos[1].clave]).filter((v) => v?.personaId).map((v) => v.personaId).sort(),
    ["1", "2"]
  );
});

test("después de Vaciar total alcanza con reconstruir parcialmente Bloque 1", () => {
  const vacia = vaciarPlanillaMensual({
    tipo: "enfermero", usaRotacionTresDias: true,
    planilla: { rotacion3Dias: { fechaBase: "2026-07-02", duracionDias: 3, asignacionBase: parcial, bloques: { [periodos[0].clave]: parcial } } }
  });
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: { ...vacia.rotacion3Dias, bloques: { [periodos[0].clave]: { A: ref("1"), B: "", C: "", D: "" } } },
    periodos, filas, personal, categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  assert.equal(Object.values(resultado.rotacion3Dias.bloques[periodos[1].clave]).filter((v) => v === "").length, 3);
});

test("Vaciar desde Bloque 2 conserva los huecos de Bloque 1 y permite regenerar", () => {
  const planilla = {
    generacionFlexible: { posicionesNoAplicables: [] },
    rotacion3Dias: {
      fechaBase: "2026-07-02", duracionDias: 3,
      asignacionBase: derivarAsignacionBaseDesdeBloque({ bloqueReferencia: parcial, indiceReferencia: 20, filas }),
      bloques: Object.fromEntries(periodos.map((periodo) => [periodo.clave, parcial]))
    }
  };
  const limpia = vaciarPlanillaDesdeBloque2({ planilla, periodos, filas });
  assert.equal(limpia.rotacion3Dias.bloques[periodos[0].clave].D, "");
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: limpia.rotacion3Dias, periodos, filas, personal, categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  assert.equal(Object.values(resultado.rotacion3Dias.bloques[periodos[1].clave]).filter((v) => v === "").length, 1);
});

test("intercambiar personas en Bloque 1 no elimina su hueco", () => {
  const planilla = {
    rotacion3Dias: {
      fechaBase: "2026-07-02", duracionDias: 3,
      asignacionBase: derivarAsignacionBaseDesdeBloque({ bloqueReferencia: parcial, indiceReferencia: 20, filas }),
      bloques: { [periodos[0].clave]: parcial }
    }
  };
  const resultado = aplicarIntercambioPlanilla({
    planilla, periodoClave: periodos[0].clave, periodoReferencia: periodos[0],
    filaOrigen: "A", filaDestino: "B", filas, personal,
    categoria: "enfermero", usaRotacionTresDias: true
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.planilla.rotacion3Dias.bloques[periodos[0].clave].D, "");
});

test("actualizar C mediante el adaptador versionado mantiene A/B intactas", () => {
  const categoria = (planilla) => ({ enfermero: { planilla, configuracion: {} }, licenciado: { planilla: {}, configuracion: {} } });
  const preparaciones = [
    { id: "A", desde: "2026-09-01", hasta: "2026-09-09", categorias: categoria({ marca: "A" }) },
    { id: "B", desde: "2026-09-10", hasta: "2026-09-19", categorias: categoria({ marca: "B" }) },
    { id: "C", desde: "2026-09-20", hasta: "2026-09-30", categorias: categoria({ rotacion3Dias: { bloques: { X: parcial } } }) }
  ];
  const estado = { preparaciones };
  const antesA = structuredClone(preparaciones[0]);
  const antesB = structuredClone(preparaciones[1]);
  const planillaC = { rotacion3Dias: { bloques: { X: rotarDistribucionPorPasos({ distribucionBase: parcial, filas, pasos: 1 }) } } };
  const resultado = aplicarCambiosPreparacionAlEstado({
    estado, mes: "2026-09", preparacionId: "C", categoria: "enfermero", planilla: planillaC
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.estado.preparaciones[0], antesA);
  assert.deepEqual(resultado.estado.preparaciones[1], antesB);
  assert.deepEqual(resultado.estado.preparaciones[2].categorias.enfermero.planilla, planillaC);
});

test("el modal nocturno explica huecos y habilita confirmar sin cantidad exacta", () => {
  const selector = fs.readFileSync("src/components/planilla/SelectorPosicionesNoAplicables.jsx", "utf8");
  const planilla = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  assert.match(selector, /permanecerán como huecos/);
  assert.doesNotMatch(selector, /seleccionadas\.length !== cantidadRequerida/);
  assert.doesNotMatch(planilla, /permitirHuecos=\{usaRotacionTresDias/);
  assert.doesNotMatch(planilla, /Base editable de la rotación nocturna/);
});
