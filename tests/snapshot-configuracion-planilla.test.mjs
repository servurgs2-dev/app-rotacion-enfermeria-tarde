import assert from "node:assert/strict";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva
} from "../src/utils/configuracionPlanilla.js";
import { normalizarEstadoMensual } from "../src/utils/estadoMensual.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const contextoEnfermeros = { turno: "tarde", categoria: "enfermero", mes: "2026-09" };
const contextoLicenciados = { turno: "tarde", categoria: "licenciado", mes: "2026-09" };
const etiquetas = (configuracion) => configuracion.filas.map((fila) => fila.etiqueta);

probar("1 crea snapshot de Enfermeros", () => {
  const snapshot = crearSnapshotConfiguracionPlanilla(contextoEnfermeros);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.turnoId, "tarde");
  assert.equal(snapshot.categoria, "enfermero");
  assert.equal(snapshot.mes, "2026-09");
  assert.equal(snapshot.filas.length, 20);
});

probar("2 crea snapshot de Licenciados", () => {
  const snapshot = crearSnapshotConfiguracionPlanilla(contextoLicenciados);
  assert.equal(snapshot.filas.length, 12);
  assert.equal(snapshot.filas.every((fila) => [
    "filaId", "tipo", "etiqueta", "sectorId", "turnanteId",
    "ordinalTurnante", "orden", "activo"
  ].every((campo) => Object.hasOwn(fila, campo))), true);
});

probar("3 exige turno", () => assert.throws(
  () => crearSnapshotConfiguracionPlanilla({ categoria: "enfermero", mes: "2026-09" }),
  /turno.*obligatorio/i
));
probar("4 exige categoría", () => assert.throws(
  () => crearSnapshotConfiguracionPlanilla({ turno: "tarde", mes: "2026-09" }),
  /categoría.*obligatoria/i
));
probar("5 exige mes", () => assert.throws(
  () => crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "enfermero" }),
  /mes.*obligatorio/i
));

probar("6 resolver con contexto incompleto no lanza", () => {
  assert.equal(obtenerConfiguracionPlanillaEfectiva({ estadoMensual: {} }), null);
  assert.equal(obtenerConfiguracionPlanillaEfectiva({ turno: "tarde" }), null);
});

probar("7 legacy sin snapshot devuelve fallback en memoria", () => {
  const resultado = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: { planillas: { enfermeros: {} } },
    ...contextoEnfermeros
  });
  assert.equal(resultado.schemaVersion, null);
  assert.equal(resultado.filas.length, 20);
});

probar("8 el legacy original permanece sin configuracionPlanilla", () => {
  const legacy = { planillas: { enfermeros: {} } };
  obtenerConfiguracionPlanillaEfectiva({ estadoMensual: legacy, ...contextoEnfermeros });
  assert.equal(Object.hasOwn(legacy, "configuracionPlanilla"), false);
});

probar("9 snapshot válido prevalece sobre legacy", () => {
  const snapshot = crearSnapshotConfiguracionPlanilla({
    ...contextoEnfermeros,
    posicionesMensualesAdicionales: ["T6"]
  });
  const resultado = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: {
      configuracionPlanilla: { enfermero: snapshot },
      planillas: { enfermeros: {} }
    },
    ...contextoEnfermeros
  });
  assert.equal(etiquetas(resultado).includes("T6"), true);
});

for (const [numero, nombre, cambio] of [
  [10, "turno", { turno: "noche" }],
  [11, "mes", { mes: "2026-10" }],
  [12, "categoría", { categoria: "licenciado" }]
]) {
  probar(`${numero} snapshot de otro ${nombre} no se usa`, () => {
    const snapshot = crearSnapshotConfiguracionPlanilla({
      ...contextoEnfermeros,
      posicionesMensualesAdicionales: ["T6"]
    });
    const contexto = { ...contextoEnfermeros, ...cambio };
    const resultado = obtenerConfiguracionPlanillaEfectiva({
      estadoMensual: { configuracionPlanilla: { enfermero: snapshot } },
      ...contexto
    });
    assert.equal(resultado.versionId, null);
  });
}

probar("13 snapshots, categorías, meses, turnos y resultados son copias independientes", () => {
  const snapshot = crearSnapshotConfiguracionPlanilla(contextoEnfermeros);
  const estado = { configuracionPlanilla: { enfermero: snapshot } };
  const primera = obtenerConfiguracionPlanillaEfectiva({ estadoMensual: estado, ...contextoEnfermeros });
  primera.filas[0].etiqueta = "CAMBIADA";
  assert.notEqual(snapshot.filas[0].etiqueta, "CAMBIADA");
  const septiembreLic = crearSnapshotConfiguracionPlanilla(contextoLicenciados);
  const octubreEnf = crearSnapshotConfiguracionPlanilla({ ...contextoEnfermeros, mes: "2026-10" });
  const nocheEnf = crearSnapshotConfiguracionPlanilla({ ...contextoEnfermeros, turno: "noche" });
  septiembreLic.filas[0].etiqueta = "LIC";
  octubreEnf.filas[0].etiqueta = "OCT";
  nocheEnf.filas[0].etiqueta = "NOCHE";
  assert.notEqual(snapshot.filas[0].etiqueta, "LIC");
  assert.notEqual(snapshot.filas[0].etiqueta, "OCT");
  assert.notEqual(snapshot.filas[0].etiqueta, "NOCHE");
  assert.notEqual(configuracionSectores.enfermero.sectoresFijos[0], "CAMBIADA");
});

probar("14 T6 sólo entra al snapshot mensual cuando está habilitado", () => {
  assert.equal(etiquetas(crearSnapshotConfiguracionPlanilla(contextoEnfermeros)).includes("T6"), false);
  assert.equal(etiquetas(crearSnapshotConfiguracionPlanilla({
    ...contextoEnfermeros, posicionesMensualesAdicionales: ["T6"]
  })).at(-1), "T6");
});

probar("15 T3 sólo entra al snapshot mensual cuando está habilitado", () => {
  assert.equal(etiquetas(crearSnapshotConfiguracionPlanilla(contextoLicenciados)).includes("T3"), false);
  assert.equal(etiquetas(crearSnapshotConfiguracionPlanilla({
    ...contextoLicenciados, posicionesMensualesAdicionales: ["T3"]
  })).at(-1), "T3");
});

probar("16 un contenedor conserva ambas categorías y las resuelve por separado", () => {
  const enfermero = crearSnapshotConfiguracionPlanilla({
    ...contextoEnfermeros, posicionesMensualesAdicionales: ["T6"]
  });
  const licenciado = crearSnapshotConfiguracionPlanilla({
    ...contextoLicenciados, posicionesMensualesAdicionales: ["T3"]
  });
  const estadoMensual = { configuracionPlanilla: { enfermero, licenciado } };
  const resultadoEnfermero = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual, ...contextoEnfermeros
  });
  const resultadoLicenciado = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual, ...contextoLicenciados
  });
  assert.equal(resultadoEnfermero.categoria, "enfermero");
  assert.equal(resultadoLicenciado.categoria, "licenciado");
  assert.equal(etiquetas(resultadoEnfermero).includes("T6"), true);
  assert.equal(etiquetas(resultadoLicenciado).includes("T6"), false);
  assert.equal(resultadoEnfermero.filas.some((fila) => fila.filaId === "licenciado.turnante.3"), false);
  assert.equal(resultadoLicenciado.filas.some((fila) => fila.filaId === "enfermero.turnante.6"), false);
  assert.equal(resultadoLicenciado.filas.filter(
    (fila) => fila.filaId === "licenciado.turnante.3"
  ).length, 1);
  resultadoEnfermero.filas[0].etiqueta = "CAMBIADA";
  assert.notEqual(resultadoLicenciado.filas[0].etiqueta, "CAMBIADA");
  assert.notEqual(enfermero.filas[0].etiqueta, "CAMBIADA");
});

probar("17 serializar y deserializar conserva ambos snapshots", () => {
  const contenedor = {
    enfermero: crearSnapshotConfiguracionPlanilla({
      ...contextoEnfermeros, posicionesMensualesAdicionales: ["T6"]
    }),
    licenciado: crearSnapshotConfiguracionPlanilla({
      ...contextoLicenciados, posicionesMensualesAdicionales: ["T3"]
    })
  };
  assert.deepEqual(JSON.parse(JSON.stringify(contenedor)), contenedor);
});

probar("18 normalizar estado legacy no agrega contenedor y preserva ambos snapshots", () => {
  const legacy = { planillas: {} };
  assert.equal(Object.hasOwn(normalizarEstadoMensual(legacy), "configuracionPlanilla"), false);
  const contenedor = {
    enfermero: crearSnapshotConfiguracionPlanilla(contextoEnfermeros),
    licenciado: crearSnapshotConfiguracionPlanilla(contextoLicenciados)
  };
  const normalizado = normalizarEstadoMensual({ planillas: {}, configuracionPlanilla: contenedor });
  assert.deepEqual(normalizado.configuracionPlanilla, contenedor);
  assert.notEqual(normalizado.configuracionPlanilla, contenedor);
  assert.notEqual(normalizado.configuracionPlanilla.enfermero, contenedor.enfermero);
  assert.notEqual(normalizado.configuracionPlanilla.licenciado, contenedor.licenciado);
});

probar("19 snapshots nuevos congelan las etiquetas de boxes según turno sin cambiar identidad", () => {
  for (const [turno, etiqueta14, etiqueta20] of [
    ["manana", "14-18", "19-20+22-24"], ["tarde", "14-19", "20+22-24"],
    ["vespertino", "14-19", "20+22-24"], ["noche", "14-19", "20+22-24"]
  ]) {
    const snapshot = crearSnapshotConfiguracionPlanilla({ turno, categoria: "enfermero", mes: "2026-10" });
    const fila14 = snapshot.filas.find(({ sectorId }) => sectorId === "boxes_14_19");
    const fila20 = snapshot.filas.find(({ sectorId }) => sectorId === "boxes_20_22_24");
    assert.equal(fila14.etiqueta, etiqueta14);
    assert.equal(fila14.filaId, "enfermero.sector.boxes_14_19");
    assert.equal(fila20.etiqueta, etiqueta20);
    assert.equal(fila20.filaId, "enfermero.sector.boxes_20_22_24");
  }
});

probar("19b snapshot histórico conserva 14-19 y sigue resolviéndose por identidad", () => {
  const snapshot = crearSnapshotConfiguracionPlanilla(contextoEnfermeros);
  const fila = snapshot.filas.find(({ sectorId }) => sectorId === "boxes_14_19");
  fila.etiqueta = "14-19";
  const resultado = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: { configuracionPlanilla: { enfermero: snapshot } }, ...contextoEnfermeros
  });
  const historica = resultado.filas.find(({ sectorId }) => sectorId === "boxes_14_19");
  assert.equal(historica.etiqueta, "14-19");
  assert.equal(historica.filaId, "enfermero.sector.boxes_14_19");
});

probar("20 snapshots históricos conservan su etiqueta congelada y la identidad", () => {
  for (const etiquetaHistorica of ["20-22-24", "20-22+24", "19-22+24"]) {
    const contextoHistorico = { turno: "tarde", categoria: "enfermero", mes: "2026-07" };
    const snapshot = crearSnapshotConfiguracionPlanilla(contextoHistorico);
    snapshot.filas.find(({ sectorId }) => sectorId === "boxes_20_22_24").etiqueta = etiquetaHistorica;
    const resultado = obtenerConfiguracionPlanillaEfectiva({
      estadoMensual: { configuracionPlanilla: { enfermero: snapshot } },
      ...contextoHistorico,
      mesReferencia: "2026-09"
    });
    const fila = resultado.filas.find(({ sectorId }) => sectorId === "boxes_20_22_24");
    assert.equal(fila.etiqueta, etiquetaHistorica);
    assert.equal(fila.filaId, "enfermero.sector.boxes_20_22_24");
  }
});

probar("21 mes editable reetiqueta la copia efectiva sin mutar el snapshot preparado", () => {
  for (const [turno, etiquetaAnterior, etiquetaVigente] of [
    ["manana", "19-22+24", "19-20+22-24"],
    ["tarde", "20-22-24", "20+22-24"],
    ["vespertino", "20-22+24", "20+22-24"],
    ["noche", "20-22-24", "20+22-24"]
  ]) {
    const contexto = { turno, categoria: "enfermero", mes: "2026-09" };
    const snapshot = crearSnapshotConfiguracionPlanilla(contexto);
    const filaPersistida = snapshot.filas.find(({ sectorId }) => sectorId === "boxes_20_22_24");
    filaPersistida.etiqueta = etiquetaAnterior;
    const resultado = obtenerConfiguracionPlanillaEfectiva({
      estadoMensual: { configuracionPlanilla: { enfermero: snapshot } },
      ...contexto,
      mesReferencia: "2026-08"
    });
    const filaEfectiva = resultado.filas.find(({ sectorId }) => sectorId === "boxes_20_22_24");
    assert.equal(filaEfectiva.etiqueta, etiquetaVigente);
    assert.equal(filaEfectiva.filaId, "enfermero.sector.boxes_20_22_24");
    assert.equal(filaPersistida.etiqueta, etiquetaAnterior);
  }
});

probar("22 mes anterior inmediato usa etiqueta vigente sin reescribir snapshot", () => {
  const contexto = { turno: "manana", categoria: "enfermero", mes: "2026-08" };
  const snapshot = crearSnapshotConfiguracionPlanilla(contexto);
  const filaPersistida = snapshot.filas.find(({ sectorId }) => sectorId === "boxes_20_22_24");
  filaPersistida.etiqueta = "19-22+24";
  const resultado = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: { configuracionPlanilla: { enfermero: snapshot } },
    ...contexto,
    mesReferencia: "2026-09"
  });
  assert.equal(
    resultado.filas.find(({ sectorId }) => sectorId === "boxes_20_22_24").etiqueta,
    "19-20+22-24"
  );
  assert.equal(filaPersistida.etiqueta, "19-22+24");
});

console.log(`\nEtapa 34B1: ${total} pruebas de snapshot aprobadas.`);
