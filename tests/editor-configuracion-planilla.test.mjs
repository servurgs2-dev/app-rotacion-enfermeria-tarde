import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionLegacyPlanilla
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearBorradoresConfiguracionPlanilla } from "../src/utils/plantillasConfiguracionPlanilla.js";

const firma = (valor) => JSON.stringify(valor);
const contexto = { turno: "tarde", mes: "2026-08" };
let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

await probar("1 legacy anterior se hereda por configuración efectiva", () => {
  const origen = crearEstadoMensualVacio();
  const borradores = crearBorradoresConfiguracionPlanilla({ estadoMensual: origen, ...contexto });
  assert.deepEqual(
    borradores.enfermero.filas.map((fila) => fila.etiqueta),
    obtenerConfiguracionLegacyPlanilla("enfermero").filas.map((fila) => fila.etiqueta)
  );
  assert.deepEqual(
    borradores.licenciado.filas.map((fila) => fila.etiqueta),
    obtenerConfiguracionLegacyPlanilla("licenciado").filas.map((fila) => fila.etiqueta)
  );
});

await probar("2 snapshot anterior se hereda con orden y estado", () => {
  const origen = crearEstadoMensualVacio();
  const snapshot = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "enfermero", mes: "2026-08"
  });
  snapshot.filas[0].orden = 1;
  snapshot.filas[1].orden = 0;
  snapshot.filas[1].activo = false;
  origen.configuracionPlanilla = { enfermero: snapshot };
  const borrador = crearBorradoresConfiguracionPlanilla({
    estadoMensual: origen, ...contexto
  }).enfermero;
  assert.equal(borrador.filas[0].filaId, snapshot.filas[1].filaId);
  assert.equal(borrador.filas[0].activo, false);
});

await probar("3 copia explícitamente todos los campos 34A", () => {
  const campos = ["filaId", "tipo", "etiqueta", "sectorId", "turnanteId",
    "ordinalTurnante", "orden", "activo"];
  const borradores = crearBorradoresConfiguracionPlanilla({
    estadoMensual: crearEstadoMensualVacio(), ...contexto
  });
  for (const borrador of Object.values(borradores)) {
    assert.equal(borrador.filas.every((fila) => campos.every(
      (campo) => Object.hasOwn(fila, campo)
    )), true);
  }
});

await probar("4 borradores y origen no comparten referencias", () => {
  const origen = crearEstadoMensualVacio();
  origen.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({
      turno: "tarde", categoria: "enfermero", mes: "2026-08"
    })
  };
  const antes = firma(origen);
  const borradores = crearBorradoresConfiguracionPlanilla({ estadoMensual: origen, ...contexto });
  borradores.enfermero.filas[0].etiqueta = "Cambio aislado";
  assert.equal(firma(origen), antes);
  assert.notEqual(borradores.enfermero.filas[0], origen.configuracionPlanilla.enfermero.filas[0]);
});

await probar("5 Enfermeros y Licenciados son independientes", () => {
  const borradores = crearBorradoresConfiguracionPlanilla({
    estadoMensual: crearEstadoMensualVacio(), ...contexto
  });
  const licenciaAntes = firma(borradores.licenciado);
  borradores.enfermero.filas[0].activo = false;
  assert.equal(firma(borradores.licenciado), licenciaAntes);
  assert.notEqual(borradores.enfermero, borradores.licenciado);
});

await probar("6 T6 y T3 se heredan sólo si estaban activos en el origen", () => {
  const origen = crearEstadoMensualVacio();
  origen.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  origen.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  const borradores = crearBorradoresConfiguracionPlanilla({ estadoMensual: origen, ...contexto });
  assert.equal(borradores.enfermero.filas.at(-1).etiqueta, "T6");
  assert.equal(borradores.licenciado.filas.at(-1).etiqueta, "T3");
});

await probar("7 fallback final funciona con contexto sin estado", () => {
  const borradores = crearBorradoresConfiguracionPlanilla({ ...contexto });
  assert.equal(borradores.enfermero.filas.length, 20);
  assert.equal(borradores.licenciado.filas.length, 12);
});

await probar("8 crear borradores no muta configuracionSectores ni fuente 34A", () => {
  const sectoresAntes = firma(configuracionSectores);
  const fuenteAntes = firma({
    enfermero: obtenerConfiguracionLegacyPlanilla("enfermero").filas,
    licenciado: obtenerConfiguracionLegacyPlanilla("licenciado").filas
  });
  crearBorradoresConfiguracionPlanilla({ estadoMensual: crearEstadoMensualVacio(), ...contexto });
  assert.equal(firma(configuracionSectores), sectoresAntes);
  assert.equal(firma({
    enfermero: obtenerConfiguracionLegacyPlanilla("enfermero").filas,
    licenciado: obtenerConfiguracionLegacyPlanilla("licenciado").filas
  }), fuenteAntes);
});

const servidor = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { default: ConfiguracionPlanilla } = await servidor.ssrLoadModule(
    "/src/components/configuracion/ConfiguracionPlanilla.jsx"
  );
  const { default: PanelPrepararMes } = await servidor.ssrLoadModule(
    "/src/components/mes/PanelPrepararMes.jsx"
  );
  const borradores = crearBorradoresConfiguracionPlanilla({
    estadoMensual: crearEstadoMensualVacio(), ...contexto
  });
  await probar("9 primer render del editor controlado no lanza", () => {
    assert.doesNotThrow(() => renderToStaticMarkup(
      React.createElement(ConfiguracionPlanilla, { borradores })
    ));
  });
  await probar("10 editor se muestra dentro de PanelPrepararMes", () => {
    const analisis = {
      turnoNombre: "Tarde", mesOrigen: "2026-08", mesDestino: "2026-09",
      revisionDestino: "1", destino: { clasificacion: "vacío" },
      conteosPersonal: { total: 0, enfermeros: 0, licenciados: 0 },
      licencias: [], certificaciones: [],
      enfermeros: {
        estrategia: { tipo: "semanal" }, claveBase: "semana6", filas: [],
        analisis: { cantidadPersonas: 0, filasVacias: [] }, bloquesDestino: []
      },
      licenciados: { claveBase: "semana6", filas: [], cantidadPersonas: 0 }
    };
    const html = renderToStaticMarkup(React.createElement(PanelPrepararMes, {
      analisis, borradoresConfiguracionPlanilla: borradores,
      onCancelar: () => {}, onConfirmar: () => {}
    }));
    assert.match(html, /Estructura de Planilla del mes a preparar/);
    assert.match(html, /REA 1/);
  });
} finally {
  await servidor.close();
}

await probar("11 cambiar categoría sólo cambia selección local", async () => {
  const fuente = await readFile(new URL(
    "../src/components/configuracion/ConfiguracionPlanilla.jsx", import.meta.url
  ), "utf8");
  assert.match(fuente, /setCategoria/);
  assert.doesNotMatch(fuente, /setBorradores|setPlantillas/);
});

await probar("12 no existe sección independiente ni restricción exclusiva", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /titulo="⚙️ Configuración de Planilla"/);
  assert.doesNotMatch(app, /esPerfilSupervision\(perfil\)[\s\S]{0,200}ConfiguracionPlanilla/);
  assert.match(app, /borradoresConfiguracionPlanilla=\{preparacionMes\.borradoresConfiguracionPlanilla\}/);
});

await probar("13 cancelar descarta el estado transitorio completo", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /onCancelar=\{\(\) => setPreparacionMes\(null\)\}/);
});

await probar("14 no existe persistencia del borrador", async () => {
  const fuentes = await Promise.all([
    "../src/utils/plantillasConfiguracionPlanilla.js",
    "../src/components/configuracion/ConfiguracionPlanilla.jsx",
    "../src/components/mes/PanelPrepararMes.jsx"
  ].map((ruta) => readFile(new URL(ruta, import.meta.url), "utf8")));
  assert.doesNotMatch(fuentes.join("\n"), /localStorage|supabase|guardarEstado/i);
});

await probar("15 el borrador todavía no llega al constructor de mes", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /construirEstadoMesNuevo\(\{\s*analisis: preparacionMes\.analisis\s*\}\)/);
});

console.log(`\n${total} pruebas del borrador mensual de configuración superadas.`);
