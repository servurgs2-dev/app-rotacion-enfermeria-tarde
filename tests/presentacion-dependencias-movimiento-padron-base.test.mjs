import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analizarDependenciasMovimientoPadronBase } from "../src/utils/dependenciasMovimientoPadronBase.js";
import { MOTIVOS_NO_DISPONIBLE } from "../src/utils/noDisponiblesMotivos.js";
import { presentarBloqueosMovimientoPadronBase } from "../src/utils/presentacionDependenciasMovimientoPadronBase.js";

const modal = fs.readFileSync("src/components/personal/MoverTurnoBaseSupervision.jsx", "utf8");

test("presenta asistencia, cambios, contexto y fechas sin rutas internas", () => {
  const lineas = presentarBloqueosMovimientoPadronBase([{
    codigo: "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES",
    ambito: "calendario",
    rutas: [
      "2026-09-12 / asistencia",
      "2026-09-16 / cambio diario / REA1",
      "2026-09-17 / cambio por paro / SILLONES1"
    ],
    rutasInternas: ["calendario.licenciados.asistenciaDia.2026-09-12.id:p-1"]
  }]);
  assert.deepEqual(lineas, [
    "Asistencia registrada — 12/09",
    "Cambio diario — 16/09 · REA1",
    "Cambio por paro — 17/09 · SILLONES1"
  ]);
  assert.doesNotMatch(lineas.join(" "), /calendario\.|personaId|p-1/);
});

test("identifica Cambio con otro turno y su Extra vinculado", () => {
  const lineas = presentarBloqueosMovimientoPadronBase([
    {
      codigo: "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES",
      ambito: "calendario",
      rutas: ["2026-09-18 / no disponible"]
    },
    {
      codigo: "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES",
      ambito: "extras",
      rutas: ["2026-09-18 / Extra"]
    }
  ]);
  assert.deepEqual(lineas, [
    "Cambio con otro turno — 18/09",
    "Extra vinculado — 18/09"
  ]);
});

test("presenta No disponible vinculado sin Extra y deduplica rutas", () => {
  const lineas = presentarBloqueosMovimientoPadronBase([{
    codigo: "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES",
    ambito: "calendario",
    rutas: ["2026-09-18 / no disponible", "2026-09-18 / no disponible"]
  }]);
  assert.deepEqual(lineas, ["No disponible con vínculo operativo — 18/09"]);
});

test("legacy usa etiquetas amigables y nunca expone códigos", () => {
  const lineas = presentarBloqueosMovimientoPadronBase([
    { codigo: "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE", ambito: "planilla", rutas: ["Enfermeros / semana1 / REA1"] },
    { codigo: "REFERENCIA_LEGACY_AMBIGUA", ambito: "planilla", rutas: ["Enfermeros / semana2 / REA2"] }
  ]);
  assert.deepEqual(lineas, [
    "Registro anterior pendiente de compatibilidad",
    "Registro anterior con identidad ambigua"
  ]);
  assert.doesNotMatch(lineas.join(" "), /REFERENCIA_|LEGACY_/);
});

test("el modal separa bloqueos de informativas y no muestra rutasInternas", () => {
  assert.match(modal, /presentarBloqueosMovimientoPadronBase\(bloqueos\)/);
  assert.match(modal, /registros que deben resolverse[\s\S]+bloqueosPresentados\.map/);
  assert.match(modal, /Se conservarán sin mover/);
  assert.doesNotMatch(modal, /rutasInternas/);
});

test("la presentación no altera tieneBloqueos ni convierte informativas", () => {
  const persona = { id: "p-1", nombre: "Cintia", categoria: "enfermero" };
  const estado = {
    personal: [persona],
    planillas: { enfermeros: { semana1: { REA1: { personaId: "p-1" } } }, licenciados: {} },
    calendario: {
      enfermeros: {
        cambiosDia: {}, cambiosParoDia: {}, asistenciaDia: {}, extras: {},
        noDisponibles: { "2026-09-18": [{ personaId: "p-1", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO }] }
      },
      licenciados: {}
    }
  };
  const resultado = analizarDependenciasMovimientoPadronBase({
    estadoOrigen: estado, personaId: "p-1", categoria: "enfermero",
    turnoOrigen: "vespertino", turnoDestino: "noche", mes: "2026-09"
  });
  assert.equal(resultado.tieneBloqueos, false);
  assert.equal(resultado.bloqueos.length, 0);
  assert.deepEqual(presentarBloqueosMovimientoPadronBase(resultado.bloqueos), []);
  assert.deepEqual(resultado.informativas.map(({ codigo }) => codigo), [
    "PLANILLA_REFERENCIA_PERSONA",
    "NO_DISPONIBLE_PROYECTABLE_POR_VIGENCIA"
  ]);
});
