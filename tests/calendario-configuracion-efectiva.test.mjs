import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva,
  obtenerFilasActivas
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import {
  configurarTipoExtra,
  crearExtraTemporal,
  TIPOS_EXTRA
} from "../src/utils/extrasPersonas.js";
import { aplicarPrioridadCoberturaParejas } from "../src/utils/coberturaParejasEnfermeros.js";
import { vincularCambioOtroTurno } from "../src/utils/cambioOtroTurno.js";
import { resolverEstructuraCalendario } from "../src/utils/estructuraCalendario.js";

const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const filas = (configuracion) => obtenerFilasActivas(configuracion?.filas)
  .sort((a, b) => a.orden - b.orden);
const etiquetas = (configuracion) => filas(configuracion).map((fila) => fila.etiqueta);
const resolver = ({ estadoMensual, turno = "tarde", categoria, mes = "2026-08" }) =>
  obtenerConfiguracionPlanillaEfectiva({ estadoMensual, turno, categoria, mes });

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const legacy = crearEstadoMensualVacio();
await probar("1 legacy Enfermeros usa estructura 34A", () => {
  assert.equal(etiquetas(resolver({ estadoMensual: legacy, categoria: "enfermero" })).length, 20);
});
await probar("2 legacy Licenciados usa estructura 34A", () => {
  assert.equal(etiquetas(resolver({ estadoMensual: legacy, categoria: "licenciado" })).length, 12);
});
await probar("3 leer legacy no crea configuracionPlanilla", () => {
  resolver({ estadoMensual: legacy, categoria: "enfermero" });
  assert.equal(Object.hasOwn(legacy, "configuracionPlanilla"), false);
});
await probar("4 T6 legacy sigue funcionando", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  assert.equal(etiquetas(resolver({ estadoMensual: estado, categoria: "enfermero" })).includes("T6"), true);
});
await probar("5 T3 legacy sigue funcionando", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  assert.equal(etiquetas(resolver({ estadoMensual: estado, categoria: "licenciado" })).includes("T3"), true);
});

const septiembre = crearEstadoMensualVacio();
const snapshotEnfermero = crearSnapshotConfiguracionPlanilla({
  turno: "tarde", categoria: "enfermero", mes: "2026-09"
});
const snapshotLicenciado = crearSnapshotConfiguracionPlanilla({
  turno: "tarde", categoria: "licenciado", mes: "2026-09"
});
[snapshotEnfermero.filas[0].orden, snapshotEnfermero.filas[1].orden] =
  [snapshotEnfermero.filas[1].orden, snapshotEnfermero.filas[0].orden];
[snapshotLicenciado.filas[0].orden, snapshotLicenciado.filas[1].orden] =
  [snapshotLicenciado.filas[1].orden, snapshotLicenciado.filas[0].orden];
septiembre.configuracionPlanilla = {
  enfermero: snapshotEnfermero,
  licenciado: snapshotLicenciado
};

await probar("6 snapshot Enfermeros prevalece", () => {
  assert.equal(etiquetas(resolver({ estadoMensual: septiembre, categoria: "enfermero", mes: "2026-09" }))[0], snapshotEnfermero.filas[1].etiqueta);
});
await probar("7 snapshot Licenciados prevalece", () => {
  assert.equal(etiquetas(resolver({ estadoMensual: septiembre, categoria: "licenciado", mes: "2026-09" }))[0], snapshotLicenciado.filas[1].etiqueta);
});
await probar("8 snapshot respeta orden propio", () => {
  assert.deepEqual(
    etiquetas(resolver({ estadoMensual: septiembre, categoria: "enfermero", mes: "2026-09" })).slice(0, 2),
    [snapshotEnfermero.filas[1].etiqueta, snapshotEnfermero.filas[0].etiqueta]
  );
});
await probar("9 snapshot de otro mes no se usa", () => {
  assert.equal(etiquetas(resolver({ estadoMensual: septiembre, categoria: "enfermero", mes: "2026-10" }))[0], configuracionSectores.enfermero.sectoresFijos[0]);
});
await probar("10 snapshot de otro turno no se usa", () => {
  assert.equal(etiquetas(resolver({ estadoMensual: septiembre, turno: "noche", categoria: "enfermero", mes: "2026-09" }))[0], configuracionSectores.enfermero.sectoresFijos[0]);
});
await probar("11 contexto incompleto no lanza", () => {
  assert.doesNotThrow(() => obtenerConfiguracionPlanillaEfectiva({}));
  assert.equal(obtenerConfiguracionPlanillaEfectiva({}), null);
});

const servidor = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { default: CalendarioDiario } = await servidor.ssrLoadModule(
    "/src/components/calendario/CalendarioDiario.jsx"
  );
  const propsBase = {
    personal: [], planilla: {}, licencias: [], certificaciones: [],
    setCertificaciones: () => {}, calendario: {}, setCalendario: () => {},
    cargarPersonalOtrosTurnos: async () => [], esDiaParo: false,
    fecha: new Date(2026, 8, 1, 12), setFecha: () => {}
  };
  await probar("12 primer render incompleto no lanza", () => {
    assert.doesNotThrow(() => renderToStaticMarkup(
      React.createElement(CalendarioDiario, propsBase)
    ));
  });
  await probar("13 Calendario no invoca crearSnapshotConfiguracionPlanilla", async () => {
    const fuente = await readFile(
      new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
      "utf8"
    );
    assert.match(fuente, /obtenerConfiguracionPlanillaEfectiva\(\{/);
    assert.doesNotMatch(fuente, /crearSnapshotConfiguracionPlanilla/);
  });
  await probar("8b Calendario usa sectores activos del snapshot en su orden operativo", () => {
    const efectiva = resolver({
      estadoMensual: septiembre, categoria: "enfermero", mes: "2026-09"
    });
    efectiva.filas.find((fila) => fila.sectorId === "rea_1").etiqueta = "Reanimación principal";
    efectiva.filas.find((fila) => fila.sectorId === "sillon_2").activo = false;
    const estructura = resolverEstructuraCalendario({
      configuracionEfectiva: efectiva,
      ordenVisualLegacy: configuracionSectores.enfermero.ordenVisual
    });
    assert.deepEqual(estructura.filas.slice(0, 2), [
      snapshotEnfermero.filas[1].etiqueta,
      "Reanimación principal"
    ]);
    assert.deepEqual(estructura.ordenVisual.slice(0, 3), [
      "Reanimación principal", "REA 2", "DIVIDER"
    ]);
    assert.equal(estructura.ordenVisual.includes("SILLON 2"), false);
    assert.deepEqual(
      estructura.turnantes,
      filas(efectiva).filter((fila) => fila.tipo === "turnante").map((fila) => fila.etiqueta)
    );
  });
  await probar("8c Licenciados conserva orden operativo y etiquetas mensuales", () => {
    const efectiva = resolver({
      estadoMensual: septiembre, categoria: "licenciado", mes: "2026-09"
    });
    efectiva.filas.find((fila) => fila.sectorId === "triage_1").etiqueta = "Triage principal";
    efectiva.filas.find((fila) => fila.sectorId === "observacion_2").activo = false;
    const estructura = resolverEstructuraCalendario({
      configuracionEfectiva: efectiva,
      ordenVisualLegacy: configuracionSectores.licenciado.ordenVisual
    });
    assert.deepEqual(estructura.ordenVisual.slice(0, 3), [
      "Triage principal", "Triage 2", "DIVIDER"
    ]);
    assert.equal(estructura.ordenVisual.includes("Observación 2"), false);
  });
  await probar("8d legacy Mañana sustituye únicamente la etiqueta de boxes en el orden", () => {
    const efectiva = resolver({ estadoMensual: legacy, turno: "manana", categoria: "enfermero" });
    const estructura = resolverEstructuraCalendario({
      configuracionEfectiva: efectiva,
      ordenVisualLegacy: configuracionSectores.enfermero.ordenVisual
    });
    const esperado = configuracionSectores.enfermero.ordenVisual.map((item) =>
      item === "20-22+24" ? "19-22+24" : item
    );
    assert.deepEqual(estructura.ordenVisual, esperado);
  });
} finally {
  await servidor.close();
}

await probar("14 lectura no muta estado mensual", () => {
  const antes = clonar(septiembre);
  resolver({ estadoMensual: septiembre, categoria: "enfermero", mes: "2026-09" });
  assert.deepEqual(septiembre, antes);
});
await probar("15 lectura no muta configuracionSectores", () => {
  const antes = clonar(configuracionSectores);
  resolver({ estadoMensual: septiembre, categoria: "licenciado", mes: "2026-09" });
  assert.deepEqual(configuracionSectores, antes);
});

const titular = { id: "titular", nombre: "Titular", categoria: "enfermero" };
const extraBase = crearExtraTemporal({
  nombre: "Cobertura", categoria: "enfermero", crearId: () => "extra"
}).extra;
const cobertura = configurarTipoExtra({
  extra: extraBase,
  tipoExtra: TIPOS_EXTRA.COBERTURA,
  personaCubierta: titular,
  sectorCubierto: "REA 1",
  personal: [titular]
}).extra;
await probar("16 turnantes se resuelven antes que coberturas", async () => {
  const fuente = await readFile(
    new URL("../src/utils/distribucionTurnantesCoberturas.js", import.meta.url),
    "utf8"
  );
  assert.ok(sourceIndex(fuente, "const turnantes") <
    sourceIndex(fuente, "const conCoberturas = aplicarCoberturasDirectasExtras"));
});
await probar("17 cobertura de turnante no desaparece", () => {
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      { nombre: "T1", enfermero: titular, tipo: "turnante" },
      { nombre: "REA 1", enfermero: null, tipo: "sector", reemplazo: true }
    ],
    extras: [cobertura],
    personal: [titular],
    esPersonaDisponible: () => true
  }).asignaciones;
  assert.equal(resultado.find((fila) => fila.nombre === "REA 1").enfermero.id, "extra");
});
await probar("18 prioridades existentes continúan funcionando", () => {
  const persona = { id: "rea2", nombre: "REA 2" };
  const resultado = aplicarPrioridadCoberturaParejas({
    asignaciones: [
      { nombre: "REA 1", enfermero: null },
      { nombre: "REA 2", enfermero: persona }
    ]
  });
  assert.equal(resultado[0].enfermero, persona);
  assert.equal(resultado[1].enfermero, null);
});
await probar("19 Extras continúan funcionando", () => {
  const refuerzo = configurarTipoExtra({ extra: extraBase, tipoExtra: TIPOS_EXTRA.REFUERZO }).extra;
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [{ nombre: "REA 1", enfermero: null, tipo: "sector" }],
    extras: [refuerzo], personal: [], esPersonaDisponible: () => true
  }).asignaciones;
  assert.equal(resultado[0].enfermero.id, "extra");
});
await probar("20 cambio con funcionario de otro turno continúa funcionando", () => {
  const resultado = vincularCambioOtroTurno({
    calendarioCategoria: { extras: {}, noDisponibles: {}, cambiosDia: {} },
    fecha: "2026-09-01", titular, sector: "REA 1",
    extra: extraBase, personal: [titular]
  });
  assert.equal(resultado.error, "");
  assert.equal(resultado.calendario.extras["2026-09-01"].length, 1);
  assert.equal(resultado.calendario.noDisponibles["2026-09-01"].length, 1);
});

function sourceIndex(fuente, texto) {
  const indice = fuente.indexOf(texto);
  assert.ok(indice >= 0, texto);
  return indice;
}

console.log(`\nEtapa 34B3B: ${total} pruebas de Calendario con configuración efectiva aprobadas.`);
