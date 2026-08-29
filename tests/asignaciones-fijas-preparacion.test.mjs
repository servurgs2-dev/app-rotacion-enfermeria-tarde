import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  crearConfiguracionPlanillaLicenciadosV2,
  obtenerFilasActivas
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  analizarPreparacionMesNuevo,
  construirEstadoMesNuevo as construirEstadoMesNuevoBase,
  obtenerFilasPlanilla
} from "../src/utils/preparacionMesNuevo.js";
import { generarRotacionMensual } from "../src/utils/rotacionPlanilla.js";
import { CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 } from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";

const clonar = (valor) => structuredClone(valor);
const filasEnfermeros = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
const filasLicenciados = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
const prioridadV2 = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2.map(({ id }) => id);
const filasV2 = crearConfiguracionPlanillaLicenciadosV2({
  prioridadCoberturaSectorIds: prioridadV2
}).configuracion.filas;
const construirEstadoMesNuevo = (entrada = {}) => construirEstadoMesNuevoBase({
  ...entrada,
  configuracionLicenciadosV2: {
    estructuraLicenciadosVersion: 2,
    filas: filasV2,
    prioridadCoberturaSectorIds: prioridadV2,
    asignacionesFijas: entrada.borradoresConfiguracionPlanilla?.licenciado?.asignacionesFijas || []
  }
});
const personal = [
  ...filasEnfermeros.map((_, indice) => ({
    id: `enf-${indice}`, nombre: `Enfermero ${indice}`, categoria: "enfermero", turno: "tarde"
  })),
  ...filasLicenciados.map((_, indice) => ({
    id: `lic-${indice}`, nombre: `Licenciado ${indice}`, categoria: "licenciado", turno: "tarde"
  }))
];
const distribuir = (filas, categoria) => Object.fromEntries(filas.map((fila, indice) => {
  const persona = personal.filter((item) => item.categoria === categoria)[indice];
  return [fila, { personaId: persona.id, nombre: persona.nombre }];
}));

const crearOrigen = ({ fijasEnfermeros = [], fijasLicenciados = [] } = {}) => {
  const estado = crearEstadoMensualVacio();
  estado.personal = clonar(personal);
  estado.planillas.enfermeros.semana5 = distribuir(filasEnfermeros, "enfermero");
  estado.planillas.licenciados.semana5 = distribuir(filasLicenciados, "licenciado");
  const enfermero = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "enfermero", mes: "2026-08"
  });
  const licenciado = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "licenciado", mes: "2026-08"
  });
  enfermero.asignacionesFijas = clonar(fijasEnfermeros);
  licenciado.asignacionesFijas = clonar(fijasLicenciados);
  estado.configuracionPlanilla = { enfermero, licenciado };
  return estado;
};

const analizar = (origen) => analizarPreparacionMesNuevo({
  turnoId: "tarde",
  mesOrigen: "2026-08",
  mesDestino: "2026-09",
  estadoOrigen: origen,
  estadoDestino: crearEstadoMensualVacio()
});

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${nombre}`);
};

probar("1 mes anterior sin fijas crea borradores vacíos", () => {
  const propuesta = analizar(crearOrigen()).borradoresConfiguracionPlanilla;
  assert.deepEqual(propuesta.enfermero.asignacionesFijas, []);
  assert.deepEqual(propuesta.licenciado.asignacionesFijas, []);
});

probar("2 las fijas anteriores aparecen como propuesta editable", () => {
  const fija = { sectorId: "sillon_2", personaId: "enf-0" };
  const propuesta = analizar(crearOrigen({ fijasEnfermeros: [fija] }))
    .borradoresConfiguracionPlanilla;
  assert.deepEqual(propuesta.enfermero.asignacionesFijas, [fija]);
});

probar("3 editar la propuesta no muta el mes origen", () => {
  const origen = crearOrigen({
    fijasEnfermeros: [{ sectorId: "sillon_2", personaId: "enf-0" }]
  });
  const antes = clonar(origen);
  const propuesta = analizar(origen).borradoresConfiguracionPlanilla;
  propuesta.enfermero.asignacionesFijas[0].personaId = "enf-1";
  assert.deepEqual(origen, antes);
});

probar("4 quitar una fija del borrador se persiste como lista vacía", () => {
  const analisis = analizar(crearOrigen({
    fijasEnfermeros: [{ sectorId: "sillon_2", personaId: "enf-0" }]
  }));
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [];
  const resultado = construirEstadoMesNuevo({
    analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.asignacionesFijas, []);
});

probar("5 agregar una fija persiste sólo sectorId y personaId", () => {
  const analisis = analizar(crearOrigen());
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [{
    sectorId: "sillon_2", personaId: "enf-0", nombre: "No persistir"
  }];
  const resultado = construirEstadoMesNuevo({
    analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla
  });
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.asignacionesFijas, [
    { sectorId: "sillon_2", personaId: "enf-0" }
  ]);
});

probar("6 Enfermeros y Licenciados permanecen separados", () => {
  const analisis = analizar(crearOrigen());
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [
    { sectorId: "sillon_2", personaId: "enf-0" }
  ];
  analisis.borradoresConfiguracionPlanilla.licenciado.asignacionesFijas = [
    { sectorId: "salud_mental", personaId: "lic-0" }
  ];
  const resultado = construirEstadoMesNuevo({ analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.estado.configuracionPlanilla.enfermero.asignacionesFijas[0].personaId, "enf-0");
  assert.equal(resultado.estado.configuracionPlanilla.licenciado.asignacionesFijas[0].personaId, "lic-0");
});

probar("7 una persona de otra categoría bloquea la preparación", () => {
  const analisis = analizar(crearOrigen());
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [
    { sectorId: "sillon_2", personaId: "lic-0" }
  ];
  const resultado = construirEstadoMesNuevo({ analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "ASIGNACIONES_FIJAS_INVALIDAS");
});

probar("8 sector repetido bloquea la preparación", () => {
  const analisis = analizar(crearOrigen());
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [
    { sectorId: "sillon_2", personaId: "enf-0" },
    { sectorId: "sillon_2", personaId: "enf-1" }
  ];
  const resultado = construirEstadoMesNuevo({ analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla });
  assert.equal(resultado.ok, false);
  assert.ok(resultado.errores.some((error) => error.codigo === "SECTOR_REPETIDO"));
});

probar("9 persona repetida bloquea la preparación", () => {
  const analisis = analizar(crearOrigen());
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [
    { sectorId: "sillon_2", personaId: "enf-0" },
    { sectorId: "rea_2", personaId: "enf-0" }
  ];
  const resultado = construirEstadoMesNuevo({ analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla });
  assert.equal(resultado.ok, false);
  assert.ok(resultado.errores.some((error) => error.codigo === "PERSONA_REPETIDA"));
});

probar("10 Salud Mental es una fija normal y no altera coberturaLibreSM", () => {
  const origen = crearOrigen();
  origen.planillas.enfermeros.coberturaLibreSM.semana5 = { personaId: "enf-1" };
  const coberturaOrigen = clonar(origen.planillas.enfermeros.coberturaLibreSM.semana5);
  const analisis = analizar(origen);
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [
    { sectorId: "salud_mental", personaId: "enf-0" }
  ];
  const resultado = construirEstadoMesNuevo({ analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.asignacionesFijas, [
    { sectorId: "salud_mental", personaId: "enf-0" }
  ]);
  assert.equal(
    resultado.estado.planillas.enfermeros.coberturaLibreSM.semana1.personaId,
    coberturaOrigen.personaId
  );
  assert.deepEqual(origen.planillas.enfermeros.coberturaLibreSM.semana5, coberturaOrigen);
});

probar("11 la Planilla destino consume la fija mediante 37B3", () => {
  const analisis = analizar(crearOrigen());
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [
    { sectorId: "sillon_2", personaId: "enf-0" }
  ];
  const resultado = construirEstadoMesNuevo({ analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla });
  const snapshot = resultado.estado.configuracionPlanilla.enfermero;
  const filas = obtenerFilasActivas(snapshot.filas).map((fila) => fila.etiqueta);
  const generada = generarRotacionMensual({
    planilla: resultado.estado.planillas.enfermeros,
    filas,
    semanas: [{ clave: "semana1" }, { clave: "semana2" }],
    filasFijas: [snapshot.filas.find((fila) => fila.sectorId === "sillon_2").etiqueta],
    asignacionesFijas: snapshot.asignacionesFijas,
    filasConfiguracion: snapshot.filas,
    categoria: "enfermero",
    personal: resultado.estado.personal
  });
  const claveSillon = snapshot.filas.find((fila) => fila.sectorId === "sillon_2").etiqueta;
  assert.equal(generada.semana1[claveSillon].personaId, "enf-0");
  assert.equal(generada.semana2[claveSillon].personaId, "enf-0");
  const ids = Object.values(generada.semana2).filter(Boolean).map((ref) => ref.personaId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, filasEnfermeros.length);
});

probar("12 cancelar conserva el borrador sólo en estado local", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /onCancelar=\{\(\) => setPreparacionMes\(null\)\}/);
  assert.doesNotMatch(app, /onCancelar=.*setEstadoPorTurnoMes/);
});

probar("13 la UI usa sectores activos, categorías y botones táctiles", () => {
  const ui = readFileSync(new URL("../src/components/mes/AsignacionesFijasMes.jsx", import.meta.url), "utf8");
  assert.match(ui, /fila\.tipo === "sector" && fila\.activo === true && fila\.sectorId/);
  assert.match(ui, /persona\.categoria === categoriaFormulario/);
  assert.match(ui, /min-h-11/);
  assert.doesNotMatch(ui, /<table|overflow-x/);
});

probar("14 la UI reutiliza la validación central y oculta códigos técnicos", () => {
  const ui = readFileSync(new URL("../src/components/mes/AsignacionesFijasMes.jsx", import.meta.url), "utf8");
  assert.match(ui, /validarAsignacionesFijasMensuales/);
  assert.match(ui, /Este funcionario ya tiene otro sector fijo/);
  assert.match(ui, /Este sector ya tiene un funcionario fijo/);
});

probar("15 la UI no ofrece suplentes ni cobertura generalizada", () => {
  const ui = readFileSync(new URL("../src/components/mes/AsignacionesFijasMes.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /personaCoberturaId|suplenteId|reemplazoId|coberturaLibreSM/);
});

probar("16 un error de generación fija se muestra y no se interpreta como éxito", () => {
  const planilla = readFileSync(
    new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url),
    "utf8"
  );
  assert.match(planilla, /instanceof ErrorGeneracionAsignacionesFijas/);
  assert.match(planilla, /No se pudo generar la Planilla porque una asignación fija/);
  assert.match(planilla, /if \(!generada\) return/);
});

console.log(`\n${total} pruebas de preparación de asignaciones fijas pasaron.`);
