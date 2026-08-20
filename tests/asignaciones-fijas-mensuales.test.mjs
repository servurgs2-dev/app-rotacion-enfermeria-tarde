import assert from "node:assert/strict";
import {
  limpiarAsignacionesFijasDePersona,
  aplicarAsignacionesFijasADistribucion,
  normalizarAsignacionesFijasMensuales,
  obtenerAsignacionFijaPorPersonaId,
  obtenerAsignacionFijaPorSectorId,
  validarAsignacionesFijasMensuales
} from "../src/utils/asignacionesFijasMensuales.js";
import {
  generarRotacionMensual,
  prepararRotacion3DiasParaGenerar,
  regenerarRotacion3DiasDesdePrimerBloque
} from "../src/utils/rotacionPlanilla.js";
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
const persona = (id, categoria = "enfermero") => ({ id, nombre: `Persona ${id}`, categoria });
const personasGeneracion = [persona("a"), persona("b"), persona("c"), persona("d")];
const referencia = (id) => ({ personaId: id, nombre: `Persona ${id}` });
const filasGeneracion = [
  ["sector_x", "Sector X"],
  ["sillon_2", "Sillón 2"],
  ["rea_2", "REA 2"],
  ["sector_z", "Sector Z"]
].map(([sectorId, etiqueta], orden) => ({
  filaId: `enfermero.sector.${sectorId}`,
  tipo: "sector",
  etiqueta,
  sectorId,
  turnanteId: null,
  ordinalTurnante: null,
  orden,
  activo: true
}));
const baseGeneracion = () => ({
  "Sector X": referencia("a"),
  "Sillón 2": referencia("b"),
  "REA 2": referencia("c"),
  "Sector Z": referencia("d")
});
const idsDistribucion = (distribucion) => Object.values(distribucion)
  .map((item) => item?.personaId)
  .filter(Boolean)
  .sort();
const aplicarGeneracion = (asignacionesFijas, distribucion = baseGeneracion()) =>
  aplicarAsignacionesFijasADistribucion({
    distribucion,
    asignacionesFijas,
    filas: filasGeneracion,
    personal: personasGeneracion,
    categoria: "enfermero"
  });

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

probar("31 fija A en Sillón 2 e intercambia a B hacia el origen de A", () => {
  const resultado = aplicarGeneracion([fija("sillon_2", "a")]);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.distribucion["Sillón 2"].personaId, "a");
  assert.equal(resultado.distribucion["Sector X"].personaId, "b");
});

probar("32 la persona fija no queda duplicada", () => {
  const resultado = aplicarGeneracion([fija("sillon_2", "a")]);
  assert.equal(idsDistribucion(resultado.distribucion).filter((id) => id === "a").length, 1);
});

probar("33 la persona desplazada no desaparece", () => {
  assert.ok(idsDistribucion(aplicarGeneracion([fija("sillon_2", "a")]).distribucion).includes("b"));
});

probar("34 conserva el conjunto y cantidad de identidades", () => {
  const base = baseGeneracion();
  const resultado = aplicarGeneracion([fija("sillon_2", "a")], base);
  assert.deepEqual(idsDistribucion(resultado.distribucion), idsDistribucion(base));
});

probar("35 un destino vacío recibe A y deja vacío su origen", () => {
  const base = baseGeneracion();
  base["Sillón 2"] = "";
  const resultado = aplicarGeneracion([fija("sillon_2", "a")], base);
  assert.equal(resultado.distribucion["Sillón 2"].personaId, "a");
  assert.equal(resultado.distribucion["Sector X"], "");
});

probar("36 persona ausente de la base devuelve error sin mutar", () => {
  const base = baseGeneracion();
  const resultado = aplicarGeneracion([fija("sillon_2", "d")], {
    ...base,
    "Sector Z": ""
  });
  assert.equal(resultado.ok, false);
  assert.ok(codigos(resultado).includes("PERSONA_AUSENTE_EN_BASE"));
  assert.deepEqual(baseGeneracion(), base);
});

probar("37 sector inexistente devuelve error", () => {
  const resultado = aplicarGeneracion([fija("no_existe", "a")]);
  assert.equal(resultado.ok, false);
  assert.ok(codigos(resultado).includes("SECTOR_INEXISTENTE"));
});

probar("38 dos fijas compatibles se aplican juntas", () => {
  const resultado = aplicarGeneracion([
    fija("sillon_2", "a"), fija("rea_2", "d")
  ]);
  assert.equal(resultado.distribucion["Sillón 2"].personaId, "a");
  assert.equal(resultado.distribucion["REA 2"].personaId, "d");
  assert.deepEqual(idsDistribucion(resultado.distribucion), ["a", "b", "c", "d"]);
});

probar("39 resuelve una cadena de tres movimientos simultáneos", () => {
  const resultado = aplicarGeneracion([
    fija("sillon_2", "a"), fija("rea_2", "b"), fija("sector_z", "c")
  ]);
  assert.equal(resultado.distribucion["Sector X"].personaId, "d");
  assert.equal(resultado.distribucion["Sillón 2"].personaId, "a");
  assert.equal(resultado.distribucion["REA 2"].personaId, "b");
  assert.equal(resultado.distribucion["Sector Z"].personaId, "c");
});

probar("40 resuelve un ciclo sin perder identidades", () => {
  const resultado = aplicarGeneracion([
    fija("sillon_2", "a"), fija("rea_2", "b"), fija("sector_x", "c")
  ]);
  assert.equal(resultado.distribucion["Sector X"].personaId, "c");
  assert.equal(resultado.distribucion["Sillón 2"].personaId, "a");
  assert.equal(resultado.distribucion["REA 2"].personaId, "b");
  assert.equal(resultado.distribucion["Sector Z"].personaId, "d");
});

probar("41 invertir asignaciones produce el mismo resultado", () => {
  const asignaciones = [fija("sillon_2", "a"), fija("rea_2", "d")];
  assert.deepEqual(
    aplicarGeneracion(asignaciones).distribucion,
    aplicarGeneracion([...asignaciones].reverse()).distribucion
  );
});

probar("42 la transformación no muta distribución, filas ni asignaciones", () => {
  const base = baseGeneracion();
  const filas = structuredClone(filasGeneracion);
  const asignaciones = [fija("sillon_2", "a")];
  const copia = structuredClone({ base, filas, asignaciones });
  aplicarAsignacionesFijasADistribucion({
    distribucion: base, asignacionesFijas: asignaciones, filas,
    personal: personasGeneracion, categoria: "enfermero"
  });
  assert.deepEqual({ base, filas, asignaciones }, copia);
});

probar("43 resuelve la clave visible normalizada desde sectorId", () => {
  const base = { ...baseGeneracion(), "SILLON 2": referencia("b") };
  delete base["Sillón 2"];
  const resultado = aplicarGeneracion([fija("sillon_2", "a")], base);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.distribucion["SILLON 2"].personaId, "a");
});

probar("44 la misma transformación funciona con Licenciados", () => {
  const personal = personasGeneracion.map((item) => ({ ...item, categoria: "licenciado" }));
  const filas = filasGeneracion.map((fila) => ({
    ...fila, filaId: fila.filaId.replace("enfermero", "licenciado")
  }));
  const resultado = aplicarAsignacionesFijasADistribucion({
    distribucion: baseGeneracion(), asignacionesFijas: [fija("sillon_2", "a")],
    filas, personal, categoria: "licenciado"
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.distribucion["Sillón 2"].personaId, "a");
});

probar("45 generación semanal fija Sillón 2 y rota el resto", () => {
  const semanas = [1, 2, 3, 4, 5].map((numero) => ({ clave: `semana${numero}` }));
  const resultado = generarRotacionMensual({
    planilla: { semana1: baseGeneracion() },
    filas: filasGeneracion.map((fila) => fila.etiqueta),
    semanas,
    filasFijas: ["Sillón 2"],
    asignacionesFijas: [fija("sillon_2", "a")],
    filasConfiguracion: filasGeneracion,
    categoria: "enfermero",
    personal: personasGeneracion
  });
  semanas.forEach(({ clave }) => {
    assert.equal(resultado[clave]["Sillón 2"].personaId, "a");
    assert.equal(idsDistribucion(resultado[clave]).filter((id) => id === "a").length, 1);
  });
  assert.equal(resultado.semana2["Sector X"].personaId, "d");
  assert.equal(resultado.semana2["REA 2"].personaId, "b");
});

probar("46 generación cada tres días fija todos los bloques y rota el resto", () => {
  const periodos = [0, 1, 2].map((indice) => ({
    clave: `2026-08-${String(1 + indice * 3).padStart(2, "0")}`,
    indice,
    etiqueta: `Bloque ${indice + 1}`
  }));
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: { bloques: { [periodos[0].clave]: baseGeneracion() }, coberturaLibreSM: {} },
    periodos,
    filas: filasGeneracion.map((fila) => fila.etiqueta),
    filasFijas: ["Sillón 2"],
    asignacionesFijas: [fija("sillon_2", "a")],
    filasConfiguracion: filasGeneracion,
    personal: personasGeneracion,
    categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  periodos.forEach(({ clave }) => {
    assert.equal(resultado.rotacion3Dias.bloques[clave]["Sillón 2"].personaId, "a");
  });
  assert.equal(resultado.rotacion3Dias.bloques[periodos[1].clave]["Sector X"].personaId, "d");
});

probar("47 Salud Mental explícita usa el modelo general", () => {
  const filas = [...filasGeneracion, {
    filaId: "enfermero.sector.salud_mental", tipo: "sector",
    etiqueta: "SM", sectorId: "salud_mental", activo: true, orden: 4
  }];
  const base = { ...baseGeneracion(), SM: referencia("a") };
  base["Sector X"] = "";
  const resultado = aplicarAsignacionesFijasADistribucion({
    distribucion: base,
    asignacionesFijas: [fija("salud_mental", "d")],
    filas,
    personal: personasGeneracion,
    categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.distribucion.SM.personaId, "d");
  assert.equal(resultado.distribucion["Sector Z"].personaId, "a");
});

probar("48 sin asignaciones el generador conserva exactamente el resultado legacy", () => {
  const semanas = [1, 2, 3].map((numero) => ({ clave: `semana${numero}` }));
  const argumentos = {
    planilla: { semana1: baseGeneracion() },
    filas: filasGeneracion.map((fila) => fila.etiqueta),
    semanas,
    filaFija: "Sillón 2",
    personal: personasGeneracion
  };
  assert.deepEqual(
    generarRotacionMensual(argumentos),
    generarRotacionMensual({ ...argumentos, asignacionesFijas: [] })
  );
});

probar("49 coberturaLibreSM permanece intacta en bloques con fijas", () => {
  const periodos = [{ clave: "2026-08-01", indice: 0, etiqueta: "Bloque 1" }];
  const coberturaLibreSM = { [periodos[0].clave]: referencia("d") };
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: { bloques: { [periodos[0].clave]: baseGeneracion() }, coberturaLibreSM },
    periodos,
    filas: filasGeneracion.map((fila) => fila.etiqueta),
    filasFijas: ["Sillón 2"],
    asignacionesFijas: [fija("sillon_2", "a")],
    filasConfiguracion: filasGeneracion,
    personal: personasGeneracion,
    categoria: "enfermero"
  });
  assert.deepEqual(resultado.rotacion3Dias.coberturaLibreSM, coberturaLibreSM);
});

probar("50 una persona fijada desde Turnante no queda duplicada", () => {
  const base = { ...baseGeneracion(), T1: referencia("a") };
  base["Sector X"] = "";
  const resultado = aplicarGeneracion([fija("sillon_2", "a")], base);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.distribucion["Sillón 2"].personaId, "a");
  assert.equal(resultado.distribucion.T1.personaId, "b");
  assert.equal(idsDistribucion(resultado.distribucion).filter((id) => id === "a").length, 1);
});

probar("51 una rotación de tres días ya inicializada aplica fijas a base y bloques", () => {
  const periodos = [0, 1].map((indice) => ({
    clave: `2026-08-${String(1 + indice * 3).padStart(2, "0")}`,
    indice,
    etiqueta: `Bloque ${indice + 1}`
  }));
  const resultado = prepararRotacion3DiasParaGenerar({
    rotacion3Dias: {
      asignacionBase: baseGeneracion(),
      bloques: { [periodos[0].clave]: baseGeneracion() },
      coberturaLibreSM: {}
    },
    periodos,
    filas: filasGeneracion.map((fila) => fila.etiqueta),
    filasFijas: ["Sillón 2"],
    asignacionesFijas: [fija("sillon_2", "a")],
    filasConfiguracion: filasGeneracion,
    personal: personasGeneracion,
    categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.rotacion3Dias.asignacionBase["Sillón 2"].personaId, "a");
  periodos.forEach(({ clave }) => {
    assert.equal(resultado.rotacion3Dias.bloques[clave]["Sillón 2"].personaId, "a");
  });
});

probar("52 la generacion semanal expone una fija invalida como error", () => {
  const base = baseGeneracion();
  base["Sector Z"] = "";
  assert.throws(
    () => generarRotacionMensual({
      planilla: { semana1: base },
      filas: filasGeneracion.map((fila) => fila.etiqueta),
      semanas: [{ clave: "semana1" }, { clave: "semana2" }],
      asignacionesFijas: [fija("sillon_2", "d")],
      filasConfiguracion: filasGeneracion,
      categoria: "enfermero",
      personal: personasGeneracion
    }),
    (error) => {
      assert.equal(error.name, "ErrorGeneracionAsignacionesFijas");
      assert.equal(error.codigo, "BASE_INCOMPATIBLE_CON_ASIGNACIONES_FIJAS");
      assert.ok(error.errores.some(({ codigo }) => codigo === "PERSONA_AUSENTE_EN_BASE"));
      return true;
    }
  );
});

probar("53 resuelve diferencias de mayusculas por sectorId", () => {
  const base = { ...baseGeneracion(), "sIlLoN 2": referencia("b") };
  delete base["Sillón 2"];
  const resultado = aplicarGeneracion([fija("sillon_2", "a")], base);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.distribucion["sIlLoN 2"].personaId, "a");
});

probar("54 resuelve diferencias de acentuacion por sectorId", () => {
  const base = { ...baseGeneracion(), "SILLÓN 2": referencia("b") };
  delete base["Sillón 2"];
  const resultado = aplicarGeneracion([fija("sillon_2", "a")], base);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.distribucion["SILLÓN 2"].personaId, "a");
});

probar("55 resuelve un alias historico aunque cambie la etiqueta visible", () => {
  const filas = filasGeneracion.map((fila) => fila.sectorId === "sillon_2"
    ? { ...fila, etiqueta: "Butaca operativa 2" }
    : fila);
  const resultado = aplicarAsignacionesFijasADistribucion({
    distribucion: baseGeneracion(),
    asignacionesFijas: [fija("sillon_2", "a")],
    filas,
    personal: personasGeneracion,
    categoria: "enfermero"
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.distribucion["Sillón 2"].personaId, "a");
});

console.log(`\n${total} pruebas de asignaciones fijas mensuales pasaron.`);
