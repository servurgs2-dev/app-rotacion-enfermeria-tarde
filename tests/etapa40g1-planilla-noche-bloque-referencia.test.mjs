import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  derivarAsignacionBaseDesdeBloque,
  regenerarRotacion3DiasDesdePrimerBloque,
  sincronizarAsignacionBaseDesdeBloqueReferencia
} from "../src/utils/rotacionPlanilla.js";
import {
  vaciarPlanillaDesdeBloque2,
  vaciarPlanillaMensual
} from "../src/utils/limpiezaSegura.js";
import { aplicarIntercambioPlanilla } from "../src/utils/intercambioPlanilla.js";
import { evaluarPreparacionRotacion3Dias } from "../src/utils/continuidadRotacionPlanilla.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";

const ref = (personaId) => ({ personaId, nombre: personaId });
const personas = ["A", "B", "C"].map((id) => ({ id, nombre: id, categoria: "enfermero" }));
const filas = ["REA 1", "REA 2", "T6"];
const periodos = obtenerBloquesQueIntersectanMes({
  mesActivo: "2026-09",
  fechaBase: "2026-07-02",
  duracionDias: 3
}).slice(0, 3);
const bloque1 = { "REA 1": ref("A"), "REA 2": ref("B"), T6: ref("C") };

test("Setiembre conserva el bloque cronológico 31/08–02/09 y su índice absoluto", () => {
  assert.equal(periodos[0].clave, "2026-08-31");
  assert.equal(periodos[0].fechaFin, "2026-09-02");
  assert.equal(periodos[0].indice, 20);
});

test("Bloque 1 deriva asignacionBase sin alterar la cronología institucional", () => {
  const sincronizada = sincronizarAsignacionBaseDesdeBloqueReferencia({
    rotacion3Dias: { version: 7, fechaBase: "2026-07-02", duracionDias: 3 },
    periodoReferencia: periodos[0], bloqueReferencia: bloque1, filas
  });
  assert.equal(sincronizada.ok, true);
  assert.equal(sincronizada.rotacion3Dias.fechaBase, "2026-07-02");
  assert.equal(sincronizada.rotacion3Dias.duracionDias, 3);
  assert.equal(sincronizada.rotacion3Dias.version, 7);
  assert.deepEqual(
    derivarAsignacionBaseDesdeBloque({ bloqueReferencia: bloque1, indiceReferencia: 20, filas }),
    sincronizada.asignacionBase
  );
});

test("vaciar manualmente la última posición de Bloque 1 también vacía la base interna", () => {
  const sincronizada = sincronizarAsignacionBaseDesdeBloqueReferencia({
    rotacion3Dias: { fechaBase: "2026-07-02", asignacionBase: bloque1 },
    periodoReferencia: periodos[0], bloqueReferencia: {}, filas
  });
  assert.equal(sincronizada.ok, true);
  assert.deepEqual(sincronizada.rotacion3Dias.asignacionBase, {});
});

test("generar conserva Bloque 1 y produce Bloque 2 en adelante", () => {
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: {
      version: 4, fechaBase: "2026-07-02", duracionDias: 3,
      asignacionBase: {}, bloques: { [periodos[0].clave]: bloque1 }
    },
    periodos, filas, personal: personas, personalCanonico: personas,
    personalPorPeriodo: Object.fromEntries(periodos.map((periodo) => [periodo.clave, personas])),
    categoria: "enfermero", estrategia: { fechaBase: "2026-07-02", duracionDias: 3 }
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.rotacion3Dias.bloques[periodos[0].clave], bloque1);
  assert.ok(resultado.rotacion3Dias.bloques[periodos[1].clave]);
  assert.ok(resultado.rotacion3Dias.bloques[periodos[2].clave]);
  assert.equal(resultado.rotacion3Dias.fechaBase, "2026-07-02");
  assert.equal(resultado.rotacion3Dias.duracionDias, 3);
});

test("un bloque posterior útil no sustituye a Bloque 1 vacío", () => {
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: { asignacionBase: {}, bloques: { [periodos[1].clave]: bloque1 } },
    periodos, filas, personal: personas, categoria: "enfermero"
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "BLOQUE_REFERENCIA_AUSENTE");
});

test("la evaluación habilita por Bloque 1 y no por una base heredada", () => {
  const estrategia = { tipo: "cada_3_dias", vigenteDesdeMes: "2026-07" };
  const sinBloque = evaluarPreparacionRotacion3Dias({
    estrategia, mesActivo: "2026-09", periodos,
    rotacion3Dias: { asignacionBase: bloque1, bloques: {} }
  });
  assert.equal(sinBloque.debeBloquearGeneracion, true);
  assert.match(sinBloque.mensaje, /Bloque 1/);
  const conBloque = evaluarPreparacionRotacion3Dias({
    estrategia, mesActivo: "2026-09", periodos,
    rotacion3Dias: { asignacionBase: {}, bloques: { [periodos[0].clave]: bloque1 } }
  });
  assert.equal(conBloque.debeBloquearGeneracion, false);
});

test("Vaciar total conserva identidad de rotación y permite reconstruir Bloque 1", () => {
  const vacia = vaciarPlanillaMensual({
    tipo: "enfermero", usaRotacionTresDias: true,
    planilla: {
      posicionesMensualesAdicionales: { T6: true },
      generacionFlexible: { posicionesNoAplicables: [] },
      asignacionesParciales: { [periodos[0].clave]: [{ id: "x" }] },
      rotacion3Dias: {
        version: 2, fechaBase: "2026-07-02", duracionDias: 3,
        asignacionBase: bloque1, bloques: { [periodos[0].clave]: bloque1 },
        coberturaLibreSM: { [periodos[0].clave]: ref("A") }
      }
    }
  });
  assert.deepEqual(vacia.rotacion3Dias.asignacionBase, {});
  assert.deepEqual(vacia.rotacion3Dias.bloques, {});
  assert.equal(vacia.rotacion3Dias.fechaBase, "2026-07-02");
  assert.equal(vacia.rotacion3Dias.duracionDias, 3);
  assert.equal(vacia.rotacion3Dias.version, 2);
  assert.deepEqual(vacia.posicionesMensualesAdicionales, { T6: true });
  const regenerada = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: {
      ...vacia.rotacion3Dias,
      bloques: { [periodos[0].clave]: { "REA 1": ref("C"), "REA 2": ref("A"), T6: ref("B") } }
    },
    periodos, filas, personal: personas, categoria: "enfermero"
  });
  assert.equal(regenerada.ok, true);
});

test("Vaciar desde Bloque 2 conserva referencia, T6 y parciales iniciales", () => {
  const planilla = {
    configuracion: { propia: true },
    posicionesMensualesAdicionales: { T6: true },
    generacionFlexible: { posicionesNoAplicables: [] },
    asignacionesParciales: {
      [periodos[0].clave]: [{ id: "primera" }],
      [periodos[1].clave]: [{ id: "segunda" }]
    },
    rotacion3Dias: {
      version: 3, fechaBase: "2026-07-02", duracionDias: 3,
      asignacionBase: { vieja: ref("A") },
      bloques: Object.fromEntries(periodos.map((periodo) => [periodo.clave, bloque1])),
      coberturaLibreSM: Object.fromEntries(periodos.map((periodo) => [periodo.clave, ref("A")]))
    }
  };
  const original = structuredClone(planilla);
  const limpia = vaciarPlanillaDesdeBloque2({ planilla, periodos, filas });
  assert.deepEqual(limpia.rotacion3Dias.bloques[periodos[0].clave], bloque1);
  assert.ok(Object.values(limpia.rotacion3Dias.bloques[periodos[1].clave]).every((valor) => valor === ""));
  assert.ok(Object.values(limpia.rotacion3Dias.bloques[periodos[2].clave]).every((valor) => valor === ""));
  assert.deepEqual(limpia.asignacionesParciales[periodos[0].clave], [{ id: "primera" }]);
  assert.equal(limpia.asignacionesParciales[periodos[1].clave], undefined);
  assert.equal(limpia.rotacion3Dias.coberturaLibreSM[periodos[0].clave].personaId, "A");
  assert.equal(limpia.rotacion3Dias.coberturaLibreSM[periodos[1].clave], undefined);
  assert.equal(limpia.rotacion3Dias.fechaBase, "2026-07-02");
  assert.equal(limpia.rotacion3Dias.duracionDias, 3);
  assert.equal(limpia.rotacion3Dias.version, 3);
  assert.deepEqual(limpia.configuracion, { propia: true });
  assert.deepEqual(limpia.posicionesMensualesAdicionales, { T6: true });
  assert.deepEqual(planilla, original);
});

test("intercambio en Bloque 1 deriva base; intercambio posterior no la redefine", () => {
  const planilla = {
    rotacion3Dias: {
      fechaBase: "2026-07-02", duracionDias: 3,
      asignacionBase: derivarAsignacionBaseDesdeBloque({ bloqueReferencia: bloque1, indiceReferencia: 20, filas }),
      bloques: { [periodos[0].clave]: bloque1, [periodos[1].clave]: bloque1 }
    }
  };
  const primero = aplicarIntercambioPlanilla({
    planilla, periodoClave: periodos[0].clave, periodoReferencia: periodos[0],
    filaOrigen: "REA 1", filaDestino: "REA 2", filas, personal: personas,
    categoria: "enfermero", usaRotacionTresDias: true
  });
  assert.equal(primero.ok, true);
  assert.notDeepEqual(primero.planilla.rotacion3Dias.asignacionBase, planilla.rotacion3Dias.asignacionBase);
  const basePrimera = structuredClone(primero.planilla.rotacion3Dias.asignacionBase);
  const segundo = aplicarIntercambioPlanilla({
    planilla: primero.planilla, periodoClave: periodos[1].clave, periodoReferencia: periodos[0],
    filaOrigen: "REA 1", filaDestino: "REA 2", filas, personal: personas,
    categoria: "enfermero", usaRotacionTresDias: true
  });
  assert.deepEqual(segundo.planilla.rotacion3Dias.asignacionBase, basePrimera);
});

test("la UI usa Bloque 1, elimina la Base separada y mantiene Licenciados semanal", () => {
  const fuente = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  assert.doesNotMatch(fuente, /Base editable de la rotación nocturna/);
  assert.doesNotMatch(fuente, /Continuar desde mes anterior/);
  assert.match(fuente, /Vaciar desde Bloque 2/);
  assert.match(fuente, /tipo === "enfermero"/);
  assert.match(fuente, /obtenerSemanasDelMes/);
});

test("la preparación seleccionada filtra por intersección y conserva el bloque cruzado", () => {
  const fuente = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(fuente, /periodo\.fechaInicio <= rangoEfectivo\.hasta/);
  assert.match(fuente, /periodo\.fechaFin >= rangoEfectivo\.desde/);
  assert.match(app, /rangoEfectivo=\{\{[\s\S]*preparacionPlanillaSeleccionada\.desde/);
});
