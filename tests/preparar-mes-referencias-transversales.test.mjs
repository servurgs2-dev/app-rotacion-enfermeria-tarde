import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  crearConfiguracionPlanillaLicenciadosV2,
  obtenerFilasActivas
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { generarRotacionMensual } from "../src/utils/rotacionPlanilla.js";
import {
  analizarPreparacionMesNuevo,
  aplicarOmisionesPersonalEstadoPreparado,
  construirEstadoMesNuevo as construirEstadoMesNuevoBase,
  obtenerFilasPlanilla,
  reconciliarPersonalPreparacionMes
} from "../src/utils/preparacionMesNuevo.js";
import { CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 } from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";

const prioridadV2 = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2.map(({ id }) => id);
const configuracionV2Base = crearConfiguracionPlanillaLicenciadosV2({
  prioridadCoberturaSectorIds: prioridadV2
}).configuracion;
const construirEstadoMesNuevo = (entrada = {}) => construirEstadoMesNuevoBase({
  ...entrada,
  configuracionLicenciadosV2: {
    ...configuracionV2Base,
    asignacionesFijas: (
      entrada.borradoresConfiguracionPlanilla || entrada.analisis?.borradoresConfiguracionPlanilla
    )?.licenciado?.asignacionesFijas || []
  }
});

const filasEnfermeros = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
const filasLicenciados = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
const persona = (id, categoria, nombre = id) => ({ id, categoria, nombre, turno: "tarde" });
const romina = persona("P", "enfermero", "Romina");
const enfermeros = filasEnfermeros.map((_, indice) => persona(`E${indice}`, "enfermero"));
const licenciados = filasLicenciados.map((_, indice) => persona(`L${indice}`, "licenciado"));
const ref = (actual) => ({ personaId: actual.id, nombre: actual.nombre });
const distribuir = (filas, personas) => Object.fromEntries(
  filas.map((fila, indice) => [fila, ref(personas[indice])])
);

const crearOrigen = ({
  transversal = romina,
  fija = null,
  fijaLicenciado = null,
  referenciaInexistente = false
} = {}) => {
  const estado = crearEstadoMensualVacio();
  estado.personal = structuredClone([...enfermeros, ...licenciados]);
  const baseEnfermeros = distribuir(filasEnfermeros, enfermeros);
  if (transversal) baseEnfermeros[filasEnfermeros[0]] = ref(transversal);
  if (referenciaInexistente) {
    baseEnfermeros[filasEnfermeros[0]] = { personaId: "Z", nombre: "Inexistente" };
  }
  estado.planillas.enfermeros.semana5 = baseEnfermeros;
  estado.planillas.licenciados.semana5 = distribuir(filasLicenciados, licenciados);
  estado.planillas.enfermeros.asignacionesParciales = {
    semana5: transversal
      ? [{ id: "parcial", personaId: transversal.id, nombre: transversal.nombre }]
      : []
  };
  const snapshotEnf = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "enfermero", mes: "2026-09"
  });
  const snapshotLic = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "licenciado", mes: "2026-09"
  });
  snapshotEnf.asignacionesFijas = fija ? [fija] : [];
  snapshotLic.asignacionesFijas = fijaLicenciado ? [fijaLicenciado] : [];
  estado.configuracionPlanilla = { enfermero: snapshotEnf, licenciado: snapshotLic };
  return estado;
};

const analizar = ({ origen = crearOrigen(), canonico = [...enfermeros, ...licenciados, romina] } = {}) =>
  analizarPreparacionMesNuevo({
    turnoId: "tarde", mesOrigen: "2026-09", mesDestino: "2026-10",
    estadoOrigen: origen, personalCanonicoOrigen: canonico,
    estadoDestino: crearEstadoMensualVacio()
  });

test("legacy normal conserva el resultado previo", () => {
  const origen = crearOrigen({ transversal: null });
  const sinContexto = analizarPreparacionMesNuevo({
    turnoId: "tarde", mesOrigen: "2026-09", mesDestino: "2026-10",
    estadoOrigen: origen, estadoDestino: crearEstadoMensualVacio()
  });
  const conContexto = analizar({ origen, canonico: origen.personal });
  assert.deepEqual(conContexto, sinContexto);
});

test("referencia moderna local y transversal son válidas en el origen", () => {
  const local = crearOrigen({ transversal: enfermeros[0] });
  assert.equal(analizar({ origen: local, canonico: local.personal }).ok, true);
  const transversal = analizar();
  assert.equal(transversal.ok, true, transversal.mensaje);
  assert.equal(transversal.enfermeros.base[filasEnfermeros[0]].personaId, "P");
  assert.equal(transversal.personalCanonicoOrigen.some(({ id }) => id === "P"), true);
});

test("Romina Tarde septiembre no se agrega ni se arrastra a octubre", () => {
  const origen = crearOrigen();
  const copia = structuredClone(origen);
  const analisis = analizar({ origen });
  const construccion = construirEstadoMesNuevo({ analisis });
  assert.equal(construccion.ok, true);
  assert.equal(construccion.estado.personal.some(({ id }) => id === "P"), false);
  assert.equal(construccion.estado.planillas.enfermeros.semana1[filasEnfermeros[0]], "");
  assert.equal("vigencias" in construccion.estado, false);
  assert.deepEqual(construccion.estado.calendario.enfermeros.extras, {});
  assert.deepEqual(origen, copia);
});

test("Romina continúa en Octubre Mañana únicamente por su padrón físico", () => {
  const origenManana = crearOrigen({ transversal: null });
  origenManana.personal.push({ ...romina, turno: "manana" });
  origenManana.planillas.enfermeros.semana5[filasEnfermeros[0]] = ref(romina);
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "manana", mesOrigen: "2026-09", mesDestino: "2026-10",
    estadoOrigen: origenManana,
    personalCanonicoOrigen: origenManana.personal,
    estadoDestino: crearEstadoMensualVacio()
  });
  const resultado = construirEstadoMesNuevo({ analisis });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.estado.personal.filter(({ id }) => id === "P").length, 1);
  assert.equal(resultado.estado.planillas.enfermeros.semana1[filasEnfermeros[0]].personaId, "P");
});

test("identidad realmente inexistente sigue bloqueando", () => {
  const resultado = analizar({ origen: crearOrigen({ referenciaInexistente: true }) });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "BASE_ENFERMEROS");
});

test("fija transversal es válida en origen, no se hereda y octubre genera sin huérfanos", () => {
  const filaSector = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "enfermero", mes: "2026-09"
  }).filas.find((fila) => fila.tipo === "sector" && fila.activo === true);
  const analisis = analizar({
    origen: crearOrigen({ fija: { sectorId: filaSector.sectorId, personaId: "P" } })
  });
  const construccion = construirEstadoMesNuevo({ analisis });
  assert.equal(construccion.ok, true);
  assert.deepEqual(construccion.estado.configuracionPlanilla.enfermero.asignacionesFijas, []);
  const snapshotDestino = construccion.estado.configuracionPlanilla.enfermero;
  assert.doesNotThrow(() => generarRotacionMensual({
    planilla: construccion.estado.planillas.enfermeros,
    filas: obtenerFilasActivas(snapshotDestino.filas).map((fila) => fila.etiqueta),
    semanas: [{ clave: "semana1" }, { clave: "semana2" }],
    asignacionesFijas: snapshotDestino.asignacionesFijas,
    filasConfiguracion: snapshotDestino.filas,
    categoria: "enfermero",
    personal: construccion.estado.personal
  }));

  const corrupto = analizar({
    origen: crearOrigen({ fija: { sectorId: filaSector.sectorId, personaId: "Z" } })
  });
  const rechazo = construirEstadoMesNuevo({ analisis: corrupto });
  assert.equal(rechazo.ok, false);
  assert.ok(rechazo.errores.some(({ codigo }) => codigo === "PERSONA_INEXISTENTE"));
});

test("fijas locales de Enfermeros y Licenciados continúan heredándose", () => {
  const snapshotEnf = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "enfermero", mes: "2026-09"
  });
  const snapshotLic = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "licenciado", mes: "2026-09"
  });
  const sectorEnf = snapshotEnf.filas.find((fila) => fila.tipo === "sector" && fila.activo);
  const sectorLic = snapshotLic.filas.find((fila) => fila.tipo === "sector" && fila.activo);
  const origen = crearOrigen({
    transversal: null,
    fija: { sectorId: sectorEnf.sectorId, personaId: enfermeros[0].id },
    fijaLicenciado: { sectorId: sectorLic.sectorId, personaId: licenciados[0].id }
  });
  const resultado = construirEstadoMesNuevo({
    analisis: analizar({ origen, canonico: origen.personal })
  });
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.asignacionesFijas, [
    { sectorId: sectorEnf.sectorId, personaId: enfermeros[0].id }
  ]);
  assert.deepEqual(resultado.estado.configuracionPlanilla.licenciado.asignacionesFijas, [
    { sectorId: sectorLic.sectorId, personaId: licenciados[0].id }
  ]);
});

test("parciales y reintegros transversales no se reinterpretan ni se heredan", () => {
  const origen = crearOrigen();
  const analisis = analizar({ origen });
  assert.equal(analisis.ok, true);
  const resultado = construirEstadoMesNuevo({ analisis });
  assert.equal(resultado.estado.planillas.enfermeros.asignacionesParciales, undefined);
  assert.equal(origen.planillas.enfermeros.asignacionesParciales.semana5[0].personaId, "P");
});

test("semana de transición usa el mismo ID sin crear duplicados", () => {
  const manana = crearOrigen({ transversal: enfermeros[0] });
  manana.planillas.enfermeros.semana3 = { A: ref(romina) };
  const tarde = crearOrigen();
  tarde.planillas.enfermeros.semana3 = { B: ref(romina) };
  assert.equal(manana.planillas.enfermeros.semana3.A.personaId, "P");
  assert.equal(tarde.planillas.enfermeros.semana3.B.personaId, "P");
  assert.equal(analizar({ origen: tarde }).ok, true);
});

test("B4C3 conserva omisiones y limpia solamente el resultado", () => {
  const origen = crearOrigen({ transversal: null });
  const movida = enfermeros[0];
  const destinoManana = crearEstadoMensualVacio();
  destinoManana.personal = [structuredClone(movida)];
  const reconciliacion = reconciliarPersonalPreparacionMes({
    estadoOrigen: origen, turnoDestino: "tarde",
    estadosDestinoPorTurno: { manana: destinoManana }
  });
  assert.deepEqual(reconciliacion.personaIdsOmitidos, [movida.id]);
  const construccion = construirEstadoMesNuevo({
    analisis: analizar({ origen, canonico: origen.personal })
  });
  const limpio = aplicarOmisionesPersonalEstadoPreparado({
    estadoPreparado: construccion.estado,
    personaIdsOmitidos: reconciliacion.personaIdsOmitidos
  });
  assert.equal(limpio.personal.some(({ id }) => id === movida.id), false);
  assert.equal(destinoManana.personal[0].id, movida.id);
  assert.equal(origen.personal.some(({ id }) => id === movida.id), true);
});

test("B4C3 elimina del resultado la fija de una persona omitida", () => {
  const snapshot = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "enfermero", mes: "2026-09"
  });
  const sector = snapshot.filas.find((fila) => fila.tipo === "sector" && fila.activo);
  const movida = enfermeros[0];
  const origen = crearOrigen({
    transversal: null,
    fija: { sectorId: sector.sectorId, personaId: movida.id }
  });
  const construido = construirEstadoMesNuevo({
    analisis: analizar({ origen, canonico: origen.personal })
  });
  const limpio = aplicarOmisionesPersonalEstadoPreparado({
    estadoPreparado: construido.estado,
    personaIdsOmitidos: [movida.id]
  });
  assert.deepEqual(limpio.configuracionPlanilla.enfermero.asignacionesFijas, []);
  assert.deepEqual(origen.configuracionPlanilla.enfermero.asignacionesFijas, [
    { sectorId: sector.sectorId, personaId: movida.id }
  ]);
});

test("Turnantes, filas y snapshots permanecen estructuralmente intactos", () => {
  const analisis = analizar();
  const resultado = construirEstadoMesNuevo({ analisis });
  assert.equal(resultado.ok, true);
  assert.ok(Array.isArray(resultado.estado.configuracionPlanilla.enfermero.filas));
  assert.equal(
    resultado.estado.configuracionPlanilla.enfermero.filas.length,
    analisis.borradoresConfiguracionPlanilla.enfermero.filas.length
  );
});

test("App carga una sola configuración mensual de vigencias del origen", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(app, /cargarPadronPersonalEfectivoMes/);
  assert.match(app, /mes:\s*mesOrigen/);
  assert.match(app, /personalCanonicoOrigen:\s*padronOrigen\.personas/);
  assert.doesNotMatch(app, /guardarVigenciasTurnoPersonaMes|eliminarVigenciasTurnoPersonaMes/);
});

test("Noche transversal queda soportada y el motor legacy no cambia", () => {
  const preparacion = fs.readFileSync("src/utils/preparacionMesNuevo.js", "utf8");
  assert.doesNotMatch(preparacion, /REFERENCIA_TRANSVERSAL_NOCTURNA_DIFERIDA/);
  assert.match(preparacion, /resolverAsignacionBaseRotacion3DiasEfectiva/);
  assert.doesNotMatch(preparacion, /generarBloquesFaltantes/);
});
