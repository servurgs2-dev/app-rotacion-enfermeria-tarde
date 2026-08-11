import assert from "node:assert/strict";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio, normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import {
  analizarPreparacionMesNuevo,
  construirEstadoMesNuevo,
  obtenerFilasPlanilla
} from "../src/utils/preparacionMesNuevo.js";

const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const filasEnfermeros = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
const filasLicenciados = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
const personas = [
  ...filasEnfermeros.map((_, indice) => ({
    id: `enf-${indice}`, nombre: `Enfermero ${indice}`, categoria: "enfermero", turno: "tarde"
  })),
  ...filasLicenciados.map((_, indice) => ({
    id: `lic-${indice}`, nombre: `Licenciado ${indice}`, categoria: "licenciado", turno: "tarde"
  }))
];
const distribuir = (filas, categoria) => Object.fromEntries(filas.map((fila, indice) => {
  const persona = personas.filter((item) => item.categoria === categoria)[indice];
  return [fila, { personaId: persona.id, nombre: persona.nombre }];
}));

const crearAgostoLegacy = () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = clonar(personas);
  estado.planillas.enfermeros.semana5 = distribuir(filasEnfermeros, "enfermero");
  estado.planillas.licenciados.semana5 = distribuir(filasLicenciados, "licenciado");
  return estado;
};

const prepararSeptiembre = ({ destino = crearEstadoMensualVacio() } = {}) => {
  const origen = crearAgostoLegacy();
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "tarde",
    mesOrigen: "2026-08",
    mesDestino: "2026-09",
    estadoOrigen: origen,
    estadoDestino: destino
  });
  assert.equal(analisis.ok, true, analisis.mensaje);
  return { origen, analisis, resultado: construirEstadoMesNuevo({ analisis }) };
};

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const base = prepararSeptiembre();
const snapshots = base.resultado.estado.configuracionPlanilla;

probar("1 preparar mes nuevo crea configuracionPlanilla", () => assert.ok(snapshots));
probar("2 contiene snapshot de Enfermeros", () => assert.ok(snapshots.enfermero));
probar("3 contiene snapshot de Licenciados", () => assert.ok(snapshots.licenciado));
probar("4 usa el turno real", () => {
  assert.equal(snapshots.enfermero.turnoId, "tarde");
  assert.equal(snapshots.licenciado.turnoId, "tarde");
});
probar("5 usa el mes destino", () => {
  assert.equal(snapshots.enfermero.mes, "2026-09");
  assert.equal(snapshots.licenciado.mes, "2026-09");
});
probar("6 usa las categorías correctas", () => {
  assert.equal(snapshots.enfermero.categoria, "enfermero");
  assert.equal(snapshots.licenciado.categoria, "licenciado");
});
probar("7 T6 se refleja cuando está habilitado", () => {
  const destino = crearEstadoMensualVacio();
  destino.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  const snapshot = prepararSeptiembre({ destino }).resultado.estado.configuracionPlanilla.enfermero;
  assert.equal(snapshot.filas.some((fila) => fila.etiqueta === "T6"), true);
});
probar("8 T3 se refleja cuando está habilitado", () => {
  const destino = crearEstadoMensualVacio();
  destino.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  const snapshot = prepararSeptiembre({ destino }).resultado.estado.configuracionPlanilla.licenciado;
  assert.equal(snapshot.filas.some((fila) => fila.etiqueta === "T3"), true);
});
probar("9 sin T6/T3 no aparecen adicionales", () => {
  assert.equal(snapshots.enfermero.filas.some((fila) => fila.etiqueta === "T6"), false);
  assert.equal(snapshots.licenciado.filas.some((fila) => fila.etiqueta === "T3"), false);
});
probar("10 el origen legacy continúa sin configuracionPlanilla", () => {
  assert.equal(Object.hasOwn(base.origen, "configuracionPlanilla"), false);
});
probar("11 preparar septiembre no muta agosto", () => {
  const agosto = crearAgostoLegacy();
  const antes = clonar(agosto);
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "tarde", mesOrigen: "2026-08", mesDestino: "2026-09",
    estadoOrigen: agosto, estadoDestino: crearEstadoMensualVacio()
  });
  construirEstadoMesNuevo({ analisis });
  assert.deepEqual(agosto, antes);
});
probar("12 snapshots de categorías son independientes", () => {
  snapshots.enfermero.filas[0].etiqueta = "CAMBIO ENFERMERO";
  assert.notEqual(snapshots.licenciado.filas[0].etiqueta, "CAMBIO ENFERMERO");
});
probar("13 modificar snapshot no muta configuracionSectores", () => {
  const original = configuracionSectores.enfermero.sectoresFijos[0];
  snapshots.enfermero.filas[0].etiqueta = "OTRO CAMBIO";
  assert.equal(configuracionSectores.enfermero.sectoresFijos[0], original);
});
probar("14 normalizar agosto no agrega snapshot", () => {
  assert.equal(Object.hasOwn(normalizarEstadoMensual(crearAgostoLegacy()), "configuracionPlanilla"), false);
});
probar("15 preserva configuración válida ya existente en destino", () => {
  const destino = crearEstadoMensualVacio();
  const existente = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "enfermero", mes: "2026-09",
    posicionesMensualesAdicionales: ["T6"]
  });
  existente.filas[0].etiqueta = "ETIQUETA CONSERVADA";
  destino.configuracionPlanilla = { enfermero: existente };
  const resultado = prepararSeptiembre({ destino }).resultado;
  assert.equal(resultado.estado.configuracionPlanilla.enfermero.filas[0].etiqueta, "ETIQUETA CONSERVADA");
  assert.notEqual(resultado.estado.configuracionPlanilla.enfermero, existente);
  assert.ok(resultado.estado.configuracionPlanilla.licenciado);
});

console.log(`\nEtapa 34B2: ${total} pruebas de preparación con snapshots aprobadas.`);
