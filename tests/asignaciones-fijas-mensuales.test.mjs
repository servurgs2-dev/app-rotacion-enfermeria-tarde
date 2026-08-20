import assert from "node:assert/strict";
import {
  limpiarAsignacionesFijasDePersona,
  normalizarAsignacionesFijasMensuales,
  obtenerAsignacionFijaPorPersonaId,
  obtenerAsignacionFijaPorSectorId,
  validarAsignacionesFijasMensuales
} from "../src/utils/asignacionesFijasMensuales.js";
import {
  copiarSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva
} from "../src/utils/configuracionPlanilla.js";
import { normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import {
  limpiarReferenciasDeCategoria,
  limpiarReferenciasDePersona
} from "../src/utils/integridadPersonas.js";
import { renombrarPersonaEnEstado } from "../src/utils/renombrarPersona.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const enfermero = { id: "persona-e", nombre: "Enfermero", categoria: "enfermero" };
const enfermero2 = { id: "persona-e2", nombre: "Enfermero 2", categoria: "enfermero" };
const licenciado = { id: "persona-l", nombre: "Licenciado", categoria: "licenciado" };
const contexto = { turno: "manana", mes: "2026-08" };
const snapshotEnfermero = crearSnapshotConfiguracionPlanilla({
  ...contexto,
  categoria: "enfermero",
  posicionesMensualesAdicionales: ["T6"]
});
const snapshotLicenciado = crearSnapshotConfiguracionPlanilla({
  ...contexto,
  categoria: "licenciado"
});
const fija = (sectorId, personaId, extras = {}) => ({ sectorId, personaId, ...extras });
const validar = ({
  asignaciones = [fija("sillon_2", enfermero.id)],
  personal = [enfermero, enfermero2, licenciado],
  categoria = "enfermero",
  filas = snapshotEnfermero.filas
} = {}) => validarAsignacionesFijasMensuales({ asignaciones, personal, categoria, filas });
const codigos = (resultado) => resultado.errores.map((error) => error.codigo);

probar("1 undefined normaliza a lista vacía", () => {
  assert.deepEqual(normalizarAsignacionesFijasMensuales(undefined), []);
  assert.deepEqual(normalizarAsignacionesFijasMensuales(null), []);
});

probar("2 snapshot legacy equivale a asignaciones vacías", () => {
  const legacy = { ...snapshotEnfermero };
  delete legacy.asignacionesFijas;
  assert.deepEqual(copiarSnapshotConfiguracionPlanilla(legacy).asignacionesFijas, []);
});

probar("3 conserva exclusivamente sectorId y personaId", () => {
  assert.deepEqual(
    normalizarAsignacionesFijasMensuales([
      fija(" sillon_2 ", " persona-e ", { nombre: "No persistir", suplenteId: "x" })
    ]),
    [fija("sillon_2", "persona-e")]
  );
});

probar("4 no persiste nombres ni metadatos", () => {
  const [resultado] = normalizarAsignacionesFijasMensuales([
    fija("sillon_2", enfermero.id, { nombre: enfermero.nombre, otra: true })
  ]);
  assert.deepEqual(Object.keys(resultado), ["sectorId", "personaId"]);
});

probar("5 ordena y deduplica determinísticamente", () => {
  assert.deepEqual(normalizarAsignacionesFijasMensuales([
    fija("sillon_2", enfermero2.id),
    fija("rea_1", enfermero.id),
    fija("rea_1", enfermero.id)
  ]), [fija("rea_1", enfermero.id), fija("sillon_2", enfermero2.id)]);
});

probar("6 detecta una persona en dos sectores", () => {
  assert.ok(codigos(validar({ asignaciones: [
    fija("rea_1", enfermero.id), fija("sillon_2", enfermero.id)
  ] })).includes("PERSONA_REPETIDA"));
});

probar("7 detecta dos personas en un sector", () => {
  assert.ok(codigos(validar({ asignaciones: [
    fija("sillon_2", enfermero.id), fija("sillon_2", enfermero2.id)
  ] })).includes("SECTOR_REPETIDO"));
});

probar("8 detecta persona inexistente", () => {
  assert.ok(codigos(validar({ asignaciones: [fija("sillon_2", "ausente")] }))
    .includes("PERSONA_INEXISTENTE"));
});

probar("9 detecta categoría incorrecta", () => {
  assert.ok(codigos(validar({ asignaciones: [fija("sillon_2", licenciado.id)] }))
    .includes("CATEGORIA_INCORRECTA"));
});

probar("10 detecta sector inexistente", () => {
  assert.ok(codigos(validar({ asignaciones: [fija("sector-falso", enfermero.id)] }))
    .includes("SECTOR_INEXISTENTE"));
});

probar("11 detecta sector desactivado sin borrarlo", () => {
  const filas = snapshotEnfermero.filas.map((fila) =>
    fila.sectorId === "sillon_2" ? { ...fila, activo: false } : fila
  );
  const resultado = validar({ filas });
  assert.ok(codigos(resultado).includes("SECTOR_DESACTIVADO"));
  assert.deepEqual(resultado.asignaciones, [fija("sillon_2", enfermero.id)]);
});

probar("12 rechaza una fila Turnante como destino", () => {
  const turnante = snapshotEnfermero.filas.find((fila) => fila.tipo === "turnante");
  assert.ok(codigos(validar({ asignaciones: [fija(turnante.turnanteId, enfermero.id)] }))
    .includes("DESTINO_TURNANTE"));
});

probar("13 acepta sector activo con ID estable", () => {
  const resultado = validar();
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.errores, []);
});

probar("14 acepta Enfermeros en su configuración", () => {
  assert.equal(validar().valido, true);
});

probar("15 acepta Licenciados en su configuración", () => {
  assert.equal(validar({
    asignaciones: [fija("salud_mental", licenciado.id)],
    categoria: "licenciado",
    filas: snapshotLicenciado.filas
  }).valido, true);
});

probar("16 renombrar no modifica el vínculo por personaId", () => {
  const estado = {
    personal: [enfermero],
    configuracionPlanilla: {
      enfermero: { ...snapshotEnfermero, asignacionesFijas: [fija("sillon_2", enfermero.id)] }
    }
  };
  const renombrado = renombrarPersonaEnEstado(estado, enfermero.id, "Nombre nuevo");
  assert.deepEqual(
    renombrado.configuracionPlanilla.enfermero.asignacionesFijas,
    estado.configuracionPlanilla.enfermero.asignacionesFijas
  );
});

probar("17 eliminar persona limpia su asignación fija", () => {
  const estado = {
    personal: [enfermero], planillas: {}, calendario: {},
    configuracionPlanilla: {
      enfermero: { ...snapshotEnfermero, asignacionesFijas: [fija("sillon_2", enfermero.id)] }
    }
  };
  assert.deepEqual(
    limpiarReferenciasDePersona(estado, enfermero)
      .configuracionPlanilla.enfermero.asignacionesFijas,
    []
  );
});

probar("18 cambiar categoría limpia sólo la fija de la categoría anterior", () => {
  const estado = {
    personal: [enfermero], planillas: {}, calendario: {},
    configuracionPlanilla: {
      enfermero: { ...snapshotEnfermero, asignacionesFijas: [fija("sillon_2", enfermero.id)] },
      licenciado: { ...snapshotLicenciado, asignacionesFijas: [fija("salud_mental", "otra")] }
    }
  };
  const limpio = limpiarReferenciasDeCategoria(estado, "enfermero", enfermero);
  assert.deepEqual(limpio.configuracionPlanilla.enfermero.asignacionesFijas, []);
  assert.deepEqual(
    limpio.configuracionPlanilla.licenciado.asignacionesFijas,
    estado.configuracionPlanilla.licenciado.asignacionesFijas
  );
});

probar("19 acepta varias asignaciones compatibles", () => {
  assert.equal(validar({ asignaciones: [
    fija("rea_1", enfermero.id), fija("sillon_2", enfermero2.id)
  ] }).valido, true);
});

probar("20 salud_mental se representa sin campos especiales", () => {
  const resultado = normalizarAsignacionesFijasMensuales([
    fija("salud_mental", enfermero.id)
  ]);
  assert.deepEqual(resultado, [fija("salud_mental", enfermero.id)]);
});

probar("21 configuración efectiva legacy expone lista vacía sin mutar origen", () => {
  const legacy = { planillas: { enfermeros: {} } };
  const efectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: legacy, ...contexto, categoria: "enfermero"
  });
  assert.deepEqual(efectiva.asignacionesFijas, []);
  assert.equal(Object.hasOwn(legacy, "configuracionPlanilla"), false);
});

probar("22 normalizar asignaciones no cambia Planilla", () => {
  const planillas = { enfermeros: { semana1: { "SILLON 2": { personaId: enfermero.id } } } };
  const base = normalizarEstadoMensual({ personal: [enfermero], planillas, calendario: {} });
  const estado = normalizarEstadoMensual({
    personal: [enfermero], planillas, calendario: {},
    configuracionPlanilla: {
      enfermero: { ...snapshotEnfermero, asignacionesFijas: [fija("sillon_2", enfermero.id)] }
    }
  });
  assert.deepEqual(estado.planillas, base.planillas);
});

probar("23 normalizar asignaciones no cambia Calendario", () => {
  const calendario = { enfermeros: { cambiosDia: { "2026-08-20": {} } } };
  const base = normalizarEstadoMensual({ personal: [enfermero], planillas: {}, calendario });
  const estado = normalizarEstadoMensual({
    personal: [enfermero], planillas: {}, calendario,
    configuracionPlanilla: {
      enfermero: { ...snapshotEnfermero, asignacionesFijas: [fija("sillon_2", enfermero.id)] }
    }
  });
  assert.deepEqual(estado.calendario, base.calendario);
});

probar("24 serialización conserva exclusivamente IDs", () => {
  const snapshot = copiarSnapshotConfiguracionPlanilla({
    ...snapshotEnfermero,
    asignacionesFijas: [fija("sillon_2", enfermero.id, { nombre: "Descartar" })]
  });
  const restaurado = JSON.parse(JSON.stringify(snapshot));
  assert.deepEqual(restaurado.asignacionesFijas, [fija("sillon_2", enfermero.id)]);
  assert.deepEqual(obtenerAsignacionFijaPorSectorId(restaurado.asignacionesFijas, "sillon_2"),
    fija("sillon_2", enfermero.id));
  assert.deepEqual(obtenerAsignacionFijaPorPersonaId(restaurado.asignacionesFijas, enfermero.id),
    fija("sillon_2", enfermero.id));
});

probar("25 el modelo no admite campos de cobertura o suplencia", () => {
  const [resultado] = normalizarAsignacionesFijasMensuales([{
    sectorId: "sillon_2", personaId: enfermero.id,
    personaCoberturaId: "c1", suplenteId: "c2", reemplazoId: "c3"
  }]);
  assert.deepEqual(resultado, fija("sillon_2", enfermero.id));
});

probar("26 coberturaLibreSM permanece separada e intacta", () => {
  const cobertura = { semana1: { personaId: enfermero2.id, nombre: enfermero2.nombre } };
  const estado = normalizarEstadoMensual({
    personal: [enfermero, enfermero2],
    planillas: { enfermeros: { coberturaLibreSM: cobertura } },
    calendario: {},
    configuracionPlanilla: {
      enfermero: { ...snapshotEnfermero, asignacionesFijas: [fija("salud_mental", enfermero.id)] }
    }
  });
  assert.deepEqual(estado.planillas.enfermeros.coberturaLibreSM, cobertura);
  assert.deepEqual(estado.configuracionPlanilla.enfermero.asignacionesFijas,
    [fija("salud_mental", enfermero.id)]);
});

probar("27 detecta IDs duplicados en Personal", () => {
  assert.ok(codigos(validar({
    personal: [enfermero, { ...enfermero, nombre: "Duplicado" }]
  })).includes("PERSONA_ID_DUPLICADO"));
});

probar("28 detecta filas sector sin sectorId", () => {
  assert.ok(codigos(validar({
    filas: [...snapshotEnfermero.filas, {
      filaId: "enfermero.sector.invalido", tipo: "sector", sectorId: "", activo: true
    }]
  })).includes("FILA_SIN_SECTOR_ID"));
});

probar("29 limpiar por persona usa sólo personaId", () => {
  assert.deepEqual(limpiarAsignacionesFijasDePersona([
    fija("rea_1", enfermero.id), fija("sillon_2", enfermero2.id)
  ], enfermero.id), [fija("sillon_2", enfermero2.id)]);
});

probar("30 un duplicado idéntico se normaliza sin crear un conflicto falso", () => {
  const resultado = validar({ asignaciones: [
    fija("sillon_2", enfermero.id), fija("sillon_2", enfermero.id)
  ] });
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.asignaciones, [fija("sillon_2", enfermero.id)]);
});

console.log(`\n${total} pruebas de asignaciones fijas mensuales pasaron.`);
