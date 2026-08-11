import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva,
  obtenerEtiquetasFilasPlanilla,
  obtenerFilasActivas
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";

const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const etiquetas = (configuracion) => obtenerEtiquetasFilasPlanilla(
  obtenerFilasActivas(configuracion?.filas).sort((a, b) => a.orden - b.orden)
);
const resolver = ({ estadoMensual, turno = "tarde", categoria, mes = "2026-08" }) =>
  obtenerConfiguracionPlanillaEfectiva({ estadoMensual, turno, categoria, mes });
const legacy = crearEstadoMensualVacio();

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

await probar("1 legacy sin snapshot obtiene estructura 34A", () => {
  assert.equal(etiquetas(resolver({ estadoMensual: legacy, categoria: "enfermero" })).length, 20);
  assert.equal(etiquetas(resolver({ estadoMensual: legacy, categoria: "licenciado" })).length, 12);
});
await probar("2 leer legacy no agrega configuracionPlanilla", () => {
  resolver({ estadoMensual: legacy, categoria: "enfermero" });
  assert.equal(Object.hasOwn(legacy, "configuracionPlanilla"), false);
});
await probar("3 Enfermeros legacy mantiene T1-T5", () => {
  const filas = etiquetas(resolver({ estadoMensual: legacy, categoria: "enfermero" }));
  assert.deepEqual(filas.filter((fila) => /^T\d+$/.test(fila)), ["T1", "T2", "T3", "T4", "T5"]);
});
await probar("4 Licenciados legacy mantiene T1-T2", () => {
  const filas = etiquetas(resolver({ estadoMensual: legacy, categoria: "licenciado" }));
  assert.deepEqual(filas.filter((fila) => /^T\d+$/.test(fila)), ["T1", "T2"]);
});
await probar("5 T6 legacy sigue funcionando", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  assert.equal(etiquetas(resolver({ estadoMensual: estado, categoria: "enfermero" })).at(-1), "T6");
});
await probar("6 T3 legacy sigue funcionando", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  assert.equal(etiquetas(resolver({ estadoMensual: estado, categoria: "licenciado" })).at(-1), "T3");
});

const estadoSeptiembre = crearEstadoMensualVacio();
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
estadoSeptiembre.configuracionPlanilla = {
  enfermero: snapshotEnfermero,
  licenciado: snapshotLicenciado
};

await probar("7 snapshot Enfermeros prevalece sobre fallback", () => {
  const filas = etiquetas(resolver({
    estadoMensual: estadoSeptiembre, categoria: "enfermero", mes: "2026-09"
  }));
  assert.equal(filas[0], snapshotEnfermero.filas[1].etiqueta);
});
await probar("8 snapshot Licenciados prevalece sobre fallback", () => {
  const filas = etiquetas(resolver({
    estadoMensual: estadoSeptiembre, categoria: "licenciado", mes: "2026-09"
  }));
  assert.equal(filas[0], snapshotLicenciado.filas[1].etiqueta);
});
await probar("9 snapshot respeta su orden propio", () => {
  const filas = etiquetas(resolver({
    estadoMensual: estadoSeptiembre, categoria: "enfermero", mes: "2026-09"
  }));
  assert.deepEqual(filas.slice(0, 2), [
    snapshotEnfermero.filas[1].etiqueta,
    snapshotEnfermero.filas[0].etiqueta
  ]);
});
await probar("10 snapshot de otro mes no se usa", () => {
  const filas = etiquetas(resolver({
    estadoMensual: estadoSeptiembre, categoria: "enfermero", mes: "2026-10"
  }));
  assert.equal(filas[0], configuracionSectores.enfermero.sectoresFijos[0]);
});
await probar("11 snapshot de otro turno no se usa", () => {
  const filas = etiquetas(resolver({
    estadoMensual: estadoSeptiembre, turno: "noche", categoria: "enfermero", mes: "2026-09"
  }));
  assert.equal(filas[0], configuracionSectores.enfermero.sectoresFijos[0]);
});
await probar("12 contexto incompleto no lanza", () => {
  assert.doesNotThrow(() => obtenerConfiguracionPlanillaEfectiva({}));
  assert.equal(obtenerConfiguracionPlanillaEfectiva({}), null);
});

const servidor = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { default: PlanillaMensual } = await servidor.ssrLoadModule(
    "/src/components/planilla/PlanillaMensual.jsx"
  );
  await probar("13 primer render con contexto incompleto no lanza", () => {
    assert.doesNotThrow(() => renderToStaticMarkup(
      React.createElement(PlanillaMensual, {
        personal: [], planilla: {}, setPlanilla: () => {}, licencias: []
      })
    ));
  });
  await probar("14 Planilla sólo lee y no crea snapshots", async () => {
    const fuente = await readFile(
      new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url),
      "utf8"
    );
    assert.match(fuente, /obtenerConfiguracionPlanillaEfectiva\(\{/);
    assert.doesNotMatch(fuente, /crearSnapshotConfiguracionPlanilla/);
  });
  await probar("15 render con snapshot usa el orden efectivo", () => {
    const html = renderToStaticMarkup(React.createElement(PlanillaMensual, {
      personal: [],
      estadoMensual: estadoSeptiembre,
      planilla: estadoSeptiembre.planillas.enfermeros,
      setPlanilla: () => {},
      tipo: "enfermero",
      licencias: [],
      mesActivo: "2026-09",
      turnoId: "tarde"
    }));
    assert.ok(html.indexOf(snapshotEnfermero.filas[1].etiqueta) <
      html.indexOf(snapshotEnfermero.filas[0].etiqueta));
  });
} finally {
  await servidor.close();
}

await probar("16 lectura no muta estadoMensual ni configuracionSectores", () => {
  const estadoAntes = clonar(estadoSeptiembre);
  const sectoresAntes = clonar(configuracionSectores);
  resolver({ estadoMensual: estadoSeptiembre, categoria: "enfermero", mes: "2026-09" });
  assert.deepEqual(estadoSeptiembre, estadoAntes);
  assert.deepEqual(configuracionSectores, sectoresAntes);
});

console.log(`\nEtapa 34B3A: ${total} pruebas de Planilla con configuración efectiva aprobadas.`);
