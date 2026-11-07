import assert from "node:assert/strict";
import test from "node:test";
import {
  crearSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanillaLicenciadosV2
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  analizarPreparacionMesNuevo,
  construirEstadoMesNuevo
} from "../src/utils/preparacionMesNuevo.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";
import { CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 } from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";

const clonar = (valor) => structuredClone(valor);
const ref = (persona) => ({ personaId: persona.id, nombre: persona.nombre });
const prioridadLicenciados = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2
  .map(({ id }) => id);

const crearOrigenNocheConT6 = () => {
  const estado = crearEstadoMensualVacio();
  const configuracionEnfermeros = crearSnapshotConfiguracionPlanilla({
    turno: "noche",
    categoria: "enfermero",
    mes: "2026-09",
    posicionesMensualesAdicionales: ["T6"]
  });
  const configuracionLicenciados = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "noche",
    mes: "2026-09",
    prioridadCoberturaSectorIds: prioridadLicenciados
  }).snapshot;
  const enfermeros = configuracionEnfermeros.filas.map((fila, indice) => ({
    id: `e-${indice}`,
    nombre: `Enfermero ${fila.etiqueta}`,
    categoria: "enfermero",
    turno: "noche"
  }));
  const licenciados = configuracionLicenciados.filas.map((fila, indice) => ({
    id: `l-${indice}`,
    nombre: `Licenciado ${fila.etiqueta}`,
    categoria: "licenciado",
    turno: "noche"
  }));
  const baseEnfermeros = Object.fromEntries(
    configuracionEnfermeros.filas.map((fila, indice) => [
      fila.etiqueta,
      ref(enfermeros[indice])
    ])
  );
  const baseLicenciados = Object.fromEntries(
    configuracionLicenciados.filas.map((fila, indice) => [
      fila.etiqueta,
      ref(licenciados[indice])
    ])
  );
  const [periodo] = obtenerBloquesQueIntersectanMes({
    mesActivo: "2026-09",
    fechaBase: "2026-07-02",
    duracionDias: 3
  });

  estado.personal = [...enfermeros, ...licenciados];
  estado.configuracionPlanilla = {
    enfermero: configuracionEnfermeros,
    licenciado: configuracionLicenciados
  };
  estado.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  estado.planillas.enfermeros.rotacion3Dias = {
    version: 1,
    fechaBase: "2026-07-02",
    duracionDias: 3,
    asignacionBase: clonar(baseEnfermeros),
    bloques: { [periodo.clave]: clonar(baseEnfermeros) },
    coberturaLibreSM: {}
  };
  estado.planillas.licenciados.semana5 = baseLicenciados;
  return estado;
};

const analizar = (estadoOrigen) => analizarPreparacionMesNuevo({
  turnoId: "noche",
  mesOrigen: "2026-09",
  mesDestino: "2026-10",
  estadoOrigen,
  personalCanonicoOrigen: estadoOrigen.personal,
  estadoDestino: crearEstadoMensualVacio()
});

test("Noche acepta las 20 posiciones base más T6 configurado en el origen", () => {
  const origen = crearOrigenNocheConT6();
  const antes = clonar(origen);
  const resultado = analizar(origen);

  assert.equal(resultado.ok, true, resultado.mensaje);
  assert.equal(resultado.enfermeros.filas.length, 21);
  assert.equal(resultado.enfermeros.filas.at(-1), "T6");
  assert.deepEqual(origen, antes);
});

test("la preparación en memoria conserva personal, T6 y crea configuración válida de Octubre", () => {
  const origen = crearOrigenNocheConT6();
  const analisis = analizar(origen);
  const construccion = construirEstadoMesNuevo({ analisis });

  assert.equal(construccion.ok, true, construccion.mensaje);
  assert.equal(construccion.estado.personal.length, origen.personal.length);
  assert.deepEqual(
    construccion.estado.planillas.enfermeros.posicionesMensualesAdicionales,
    ["T6"]
  );
  assert.equal(construccion.estado.configuracionPlanilla.enfermero.filas.length, 21);
  assert.equal(
    construccion.estado.configuracionPlanilla.enfermero.filas.at(-1).etiqueta,
    "T6"
  );
  assert.equal(construccion.estado.configuracionPlanilla.enfermero.mes, "2026-10");
});

test("una etiqueta histórica duplicada continúa bloqueando la preparación", () => {
  const origen = crearOrigenNocheConT6();
  const filas = origen.configuracionPlanilla.enfermero.filas;
  filas.find(({ turnanteId }) => turnanteId === "turnante_4").etiqueta = "T5";
  const resultado = analizar(origen);

  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "BASE_ENFERMEROS");
  assert.match(resultado.mensaje, /posiciones distintas/);
});

test("el análisis fallido no crea ni modifica un estado destino", () => {
  const origen = crearOrigenNocheConT6();
  origen.configuracionPlanilla.enfermero.filas
    .find(({ turnanteId }) => turnanteId === "turnante_4").etiqueta = "T5";
  const destino = crearEstadoMensualVacio();
  const antes = clonar(destino);
  const resultado = analizarPreparacionMesNuevo({
    turnoId: "noche",
    mesOrigen: "2026-09",
    mesDestino: "2026-10",
    estadoOrigen: origen,
    personalCanonicoOrigen: origen.personal,
    estadoDestino: destino
  });

  assert.equal(resultado.ok, false);
  assert.deepEqual(destino, antes);
});
