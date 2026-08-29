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
import {
  cambiarActivoFilaBorrador,
  crearBorradoresConfiguracionPlanilla,
  moverFilaBorrador,
  moverFilaBorradorAIndice
} from "../src/utils/plantillasConfiguracionPlanilla.js";

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

const crearBorradorPrueba = () => crearBorradoresConfiguracionPlanilla({
  estadoMensual: crearEstadoMensualVacio(), ...contexto
}).enfermero;

await probar("9 subir mueve exactamente una posición y normaliza orden", () => {
  const original = crearBorradorPrueba();
  const fila = original.filas[2];
  const resultado = moverFilaBorrador(original, fila.filaId, "arriba");
  assert.equal(resultado.filas[1].filaId, fila.filaId);
  assert.deepEqual(resultado.filas.map((item) => item.orden),
    resultado.filas.map((_, indice) => indice));
  assert.notEqual(resultado, original);
});

await probar("10 bajar mueve exactamente una posición", () => {
  const original = crearBorradorPrueba();
  const fila = original.filas[1];
  const resultado = moverFilaBorrador(original, fila.filaId, "abajo");
  assert.equal(resultado.filas[2].filaId, fila.filaId);
});

await probar("11 los límites no permiten mover fuera de rango", () => {
  const original = crearBorradorPrueba();
  assert.equal(moverFilaBorrador(original, original.filas[0].filaId, "arriba"), original);
  assert.equal(moverFilaBorrador(original, original.filas.at(-1).filaId, "abajo"), original);
});

await probar("12 reordenar preserva identidad y contenido de cada fila", () => {
  const original = crearBorradorPrueba();
  const firmas = new Map(original.filas.map(({ orden: _orden, ...fila }) => [fila.filaId, firma(fila)]));
  const resultado = moverFilaBorrador(original, original.filas[3].filaId, "arriba");
  for (const { orden: _orden, ...fila } of resultado.filas) {
    assert.equal(firma(fila), firmas.get(fila.filaId));
  }
});

await probar("13 activar o desactivar sólo modifica activo y conserva la fila", () => {
  const original = crearBorradorPrueba();
  const objetivo = original.filas[1];
  const resultado = cambiarActivoFilaBorrador(original, objetivo.filaId, false);
  assert.equal(resultado.filas.length, original.filas.length);
  const modificada = resultado.filas.find((fila) => fila.filaId === objetivo.filaId);
  assert.equal(modificada.activo, false);
  const { activo: _antes, ...identidadAntes } = objetivo;
  const { activo: _despues, ...identidadDespues } = modificada;
  assert.deepEqual(identidadDespues, identidadAntes);
  assert.equal(original.filas[1].activo, true);
});

await probar("14 editar Enfermeros no modifica Licenciados ni el origen", () => {
  const origen = crearEstadoMensualVacio();
  const origenAntes = firma(origen);
  const borradores = crearBorradoresConfiguracionPlanilla({ estadoMensual: origen, ...contexto });
  const licenciadoAntes = firma(borradores.licenciado);
  const enfermeroEditado = cambiarActivoFilaBorrador(
    borradores.enfermero, borradores.enfermero.filas[0].filaId, false
  );
  assert.equal(firma(borradores.licenciado), licenciadoAntes);
  assert.equal(firma(origen), origenAntes);
  assert.notEqual(enfermeroEditado, borradores.enfermero);
});

await probar("15 cancelar y recrear vuelve a heredar el origen", () => {
  const origen = crearEstadoMensualVacio();
  let transitorio = crearBorradoresConfiguracionPlanilla({ estadoMensual: origen, ...contexto });
  transitorio = {
    ...transitorio,
    enfermero: cambiarActivoFilaBorrador(
      transitorio.enfermero, transitorio.enfermero.filas[0].filaId, false
    )
  };
  assert.equal(transitorio.enfermero.filas[0].activo, false);
  transitorio = null;
  const recreado = crearBorradoresConfiguracionPlanilla({ estadoMensual: origen, ...contexto });
  assert.equal(transitorio, null);
  assert.equal(recreado.enfermero.filas[0].activo, true);
});

await probar("16 T6 y T3 mantienen todas sus identidades al moverlos", () => {
  const origen = crearEstadoMensualVacio();
  origen.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  origen.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  const borradores = crearBorradoresConfiguracionPlanilla({ estadoMensual: origen, ...contexto });
  for (const [categoria, etiqueta] of [["enfermero", "T6"], ["licenciado", "T3"]]) {
    const original = borradores[categoria].filas.find((fila) => fila.etiqueta === etiqueta);
    const movido = moverFilaBorrador(borradores[categoria], original.filaId, "arriba")
      .filas.find((fila) => fila.filaId === original.filaId);
    assert.equal(movido.filaId, original.filaId);
    assert.equal(movido.turnanteId, original.turnanteId);
    assert.equal(movido.ordinalTurnante, original.ordinalTurnante);
    assert.equal(movido.tipo, original.tipo);
  }
});

await probar("17 drag mueve entre índices, extremos y ambas direcciones", () => {
  const original = crearBorradorPrueba();
  const fila = original.filas[5];
  const haciaArriba = moverFilaBorradorAIndice(original, fila.filaId, 2);
  assert.equal(haciaArriba.filas[2].filaId, fila.filaId);
  const aPrimera = moverFilaBorradorAIndice(haciaArriba, fila.filaId, 0);
  assert.equal(aPrimera.filas[0].filaId, fila.filaId);
  const aUltima = moverFilaBorradorAIndice(aPrimera, fila.filaId, 999);
  assert.equal(aUltima.filas.at(-1).filaId, fila.filaId);
  const haciaAbajo = moverFilaBorradorAIndice(original, original.filas[1].filaId, 4);
  assert.equal(haciaAbajo.filas[4].filaId, original.filas[1].filaId);
});

await probar("18 drag seguro normaliza y no muta el borrador", () => {
  const original = crearBorradorPrueba();
  const antes = firma(original);
  const misma = moverFilaBorradorAIndice(original, original.filas[2].filaId, 2);
  const inexistente = moverFilaBorradorAIndice(original, "fila-inexistente", 1);
  assert.equal(misma, original);
  assert.equal(inexistente, original);
  const resultado = moverFilaBorradorAIndice(original, original.filas[5].filaId, 2);
  assert.deepEqual(resultado.filas.map((fila) => fila.orden),
    resultado.filas.map((_, indice) => indice));
  assert.equal(firma(original), antes);
});

await probar("19 drag sólo cambia orden y conserva estado e identidades", () => {
  const originalActivo = crearBorradorPrueba();
  const objetivo = originalActivo.filas.find((fila) => fila.tipo === "turnante");
  const original = cambiarActivoFilaBorrador(originalActivo, objetivo.filaId, false);
  const firmaSinOrden = ({ orden: _orden, ...fila }) => firma(fila);
  const antes = firmaSinOrden(original.filas.find((fila) => fila.filaId === objetivo.filaId));
  const resultado = moverFilaBorradorAIndice(original, objetivo.filaId, 0);
  const despues = resultado.filas[0];
  assert.equal(firmaSinOrden(despues), antes);
  assert.equal(despues.activo, false);
});

await probar("20 drag conserva T6/T3 y no cruza categorías", () => {
  const origen = crearEstadoMensualVacio();
  origen.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  origen.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  const borradores = crearBorradoresConfiguracionPlanilla({ estadoMensual: origen, ...contexto });
  const licenciaAntes = firma(borradores.licenciado);
  for (const [categoria, etiqueta] of [["enfermero", "T6"], ["licenciado", "T3"]]) {
    const original = borradores[categoria].filas.find((fila) => fila.etiqueta === etiqueta);
    const movido = moverFilaBorradorAIndice(borradores[categoria], original.filaId, 0).filas[0];
    assert.deepEqual({
      filaId: movido.filaId, tipo: movido.tipo, turnanteId: movido.turnanteId,
      ordinalTurnante: movido.ordinalTurnante, activo: movido.activo
    }, {
      filaId: original.filaId, tipo: original.tipo, turnanteId: original.turnanteId,
      ordinalTurnante: original.ordinalTurnante, activo: original.activo
    });
  }
  moverFilaBorradorAIndice(borradores.enfermero,
    borradores.enfermero.filas.at(-1).filaId, 0);
  assert.equal(firma(borradores.licenciado), licenciaAntes);
});

const servidor = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const moduloConfiguracion = await servidor.ssrLoadModule(
    "/src/components/configuracion/ConfiguracionPlanilla.jsx"
  );
  const { default: ConfiguracionPlanilla, FilaConfiguracionPlanilla } = moduloConfiguracion;
  const { default: PanelPrepararMes } = await servidor.ssrLoadModule(
    "/src/components/mes/PanelPrepararMes.jsx"
  );
  const borradores = crearBorradoresConfiguracionPlanilla({
    estadoMensual: crearEstadoMensualVacio(), ...contexto
  });
  await probar("21 primer render y controles no lanzan", () => {
    let html = "";
    assert.doesNotThrow(() => { html = renderToStaticMarkup(
      React.createElement(ConfiguracionPlanilla, { borradores })
    ); });
    assert.match(html, />↑</);
    assert.match(html, />↓</);
    assert.match(html, /Activo/);
    assert.match(html, /aria-label="Arrastrar REA 1"/);
    assert.match(html, /disabled=""/);
  });
  await probar("18 primera subida y última bajada están deshabilitadas", () => {
    const html = renderToStaticMarkup(React.createElement(ConfiguracionPlanilla, { borradores }));
    assert.match(html, /aria-label="Subir REA 1" disabled=""/);
    assert.equal(html.includes(
      `aria-label="Bajar ${borradores.enfermero.filas.at(-1).etiqueta}" disabled=""`
    ), true);
  });
  await probar("19 una fila inactiva sigue visible e identificada", () => {
    const inactivos = {
      ...borradores,
      enfermero: cambiarActivoFilaBorrador(
        borradores.enfermero, borradores.enfermero.filas[0].filaId, false
      )
    };
    const html = renderToStaticMarkup(React.createElement(
      ConfiguracionPlanilla, { borradores: inactivos }
    ));
    assert.match(html, /REA 1/);
    assert.match(html, /Inactivo/);
  });
  await probar("20 click Activo actualiza el harness y permite volver a Activo", () => {
    let borradorControlado = borradores.enfermero;
    const filaId = borradorControlado.filas[0].filaId;
    const onCambiarActivo = (id) => {
      borradorControlado = cambiarActivoFilaBorrador(
        borradorControlado,
        id,
        !borradorControlado.filas.find((fila) => fila.filaId === id).activo
      );
    };
    const obtenerBotonEstado = () => {
      const fila = borradorControlado.filas.find((item) => item.filaId === filaId);
      const elemento = FilaConfiguracionPlanilla({
        fila, indice: 0, cantidadFilas: borradorControlado.filas.length,
        onMover: () => {}, onCambiarActivo
      });
      const pendientes = [elemento];
      while (pendientes.length) {
        const actual = pendientes.shift();
        if (actual?.type === "button" && ["Activo", "Inactivo"].includes(actual.props.children)) {
          return actual;
        }
        React.Children.forEach(actual?.props?.children, (hijo) => pendientes.push(hijo));
      }
      return null;
    };
    const activo = obtenerBotonEstado();
    assert.equal(activo.props.children, "Activo");
    activo.props.onClick();
    const inactivo = obtenerBotonEstado();
    assert.equal(inactivo.props.children, "Inactivo");
    assert.equal(borradorControlado.filas[0].activo, false);
    inactivo.props.onClick();
    assert.equal(obtenerBotonEstado().props.children, "Activo");
    assert.equal(borradorControlado.filas[0].activo, true);
  });
  await probar("21 editor se muestra dentro de PanelPrepararMes", () => {
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

await probar("22 cambiar categoría sólo cambia selección local", async () => {
  const fuente = await readFile(new URL(
    "../src/components/configuracion/ConfiguracionPlanilla.jsx", import.meta.url
  ), "utf8");
  assert.match(fuente, /setCategoria/);
  assert.doesNotMatch(fuente, /setBorradores|setPlantillas/);
});

await probar("23 no existe sección independiente ni restricción exclusiva", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /titulo="⚙️ Configuración de Planilla"/);
  assert.doesNotMatch(app, /esPerfilSupervision\(perfil\)[\s\S]{0,200}ConfiguracionPlanilla/);
  assert.match(app, /borradoresConfiguracionPlanilla=\{preparacionMes\.borradoresConfiguracionPlanilla\}/);
});

await probar("24 cancelar descarta el estado transitorio completo", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /onCancelar=\{\(\) => setPreparacionMes\(null\)\}/);
});

await probar("25 Licenciados v2 es obligatorio y exige preflight válido", async () => {
  const panel = await readFile(new URL(
    "../src/components/mes/PanelPrepararMes.jsx", import.meta.url
  ), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /Usar nueva estructura de Licenciados|type="checkbox"|previsualizarLicenciadosV2/);
  assert.match(panel, /Estructura de Licenciados v2/);
  assert.match(panel, /Se aplicará automáticamente al preparar el nuevo mes/);
  assert.match(panel, /crearConfiguracionPlanillaLicenciadosV2/);
  assert.match(panel, /prepararTransicionLicenciadosV1aV2/);
  assert.match(panel, /borradoresVisibles/);
  assert.match(panel, /Falta configurar la prioridad de cobertura de Licenciados v2/);
  assert.match(panel, /versionEstructura=\{borrador\}/);
  assert.match(panel, /Explora → T3/);
  assert.match(panel, /T3 adicional → T4/);
  assert.match(panel, /Reanimación \+ Sillones no se trasladará automáticamente/);
  assert.match(panel, /Quedarán Sin asignar/);
  assert.match(panel, /const configuracionV2Lista = validacionConfiguracionV2\.ok[\s\S]*?fijasLegacyPendientes\.length === 0/);
  assert.match(panel, /disabled=\{!configuracionV2Lista\}/);
  assert.match(panel, /if \(!configuracionV2Lista\) return/);
  const payload = panel.match(/onConfirmar\?\.\(\{[\s\S]*?configuracionLicenciadosV2:[\s\S]*?\n\s*\}\);/)?.[0] || "";
  assert.doesNotMatch(payload, /activar:/);
  assert.match(payload, /estructuraLicenciadosVersion: VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA/);
  assert.match(payload, /filas: borradorLicenciadosV2\.filas/);
  assert.match(payload, /prioridadCoberturaSectorIds: borradorLicenciadosV2\.prioridadCoberturaSectorIds/);
  assert.match(payload, /asignacionesFijas: borradorLicenciadosV2\.asignacionesFijas/);
  assert.doesNotMatch(payload, /fijasLegacyPendientes|personasSinAsignar|resultadoTransicion|referenciasTransformadas|referenciasOmitidas/);
  assert.match(app, /const confirmarPreparacionMes = \(\{ configuracionLicenciadosV2 \} = \{\}\) =>/);
  assert.match(app, /construirEstadoMesNuevo\(\{[\s\S]*?configuracionLicenciadosV2/);
  assert.doesNotMatch(app, /TRANSICION_EXPLORA_A_T3|TRANSICION_T3_ADICIONAL_A_T4/);
});

await probar("26 editor de fijas usa siempre el borrador local v2 para Licenciados", async () => {
  const panel = await readFile(new URL(
    "../src/components/mes/PanelPrepararMes.jsx", import.meta.url
  ), "utf8");
  const editorFijas = await readFile(new URL(
    "../src/components/mes/AsignacionesFijasMes.jsx", import.meta.url
  ), "utf8");
  assert.match(editorFijas, /function AsignacionesFijasMes\(\{ borradores = \{\}, personal = \[\], onActualizarBorrador \}\)/);
  assert.match(editorFijas, /borradores\?\.\[categoriaFormulario\]/);
  assert.match(panel, /const borradoresVisibles = \{[\s\S]*?licenciado: borradorLicenciadosV2/);
  assert.match(panel, /<AsignacionesFijasMes[\s\S]*?borradores=\{borradoresVisibles\}[\s\S]*?onActualizarBorrador=\{actualizarBorradorVisible\}/);
  assert.match(panel, /if \(categoria === "licenciado"\)[\s\S]*?setBorradorLicenciadosV2/);
  assert.match(panel, /onActualizarBorradorConfiguracionPlanilla\?\.\(categoria, actualizador\)/);
  assert.match(panel, /Fijas que requieren revisión/);
  assert.match(panel, /setFijasLegacyPendientes/);
});

await probar("27 Panel consume Sin asignar de C7B sin filtro cosmético", async () => {
  const panel = await readFile(new URL(
    "../src/components/mes/PanelPrepararMes.jsx", import.meta.url
  ), "utf8");
  assert.match(panel, /resultadoTransicion\?\.personasSinAsignar\?\.length/);
  assert.match(panel, /resultadoTransicion\.personasSinAsignar\.map\(\(persona\)/);
  assert.doesNotMatch(panel, /personasSinAsignar\.(?:filter|reduce)/);
  assert.match(panel, /personalDestino: \(analisis\.personal \|\| \[\]\)\.filter\([\s\S]*?persona\?\.categoria === "licenciado"/);
  assert.match(panel, /No hay una persona Licenciada elegible asignada a Explora en \{analisis\.licenciados\.claveBase\}/);
});

await probar("29 drag usa la integración actual sin persistencia ni snapshots", async () => {
  const fuentes = await Promise.all([
    "../src/utils/plantillasConfiguracionPlanilla.js",
    "../src/components/configuracion/ConfiguracionPlanilla.jsx",
    "../src/components/mes/PanelPrepararMes.jsx"
  ].map((ruta) => readFile(new URL(ruta, import.meta.url), "utf8")));
  const fuente = fuentes.join("\n");
  assert.doesNotMatch(fuente, /localStorage|supabase|guardarEstado|crearSnapshotConfiguracionPlanilla/i);
  assert.match(fuente, /DragDropProvider/);
  assert.match(fuente, /useSortable\(\{[\s\S]*?id: fila\.filaId/);
  assert.match(fuente, /handleRef/);
  assert.match(fuente, /moverFilaBorradorAIndice/);
});

await probar("26 el borrador validado llega al constructor de mes", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /validarBorradoresConfiguracionPlanilla\([\s\S]*?construirEstadoMesNuevo\(\{[\s\S]*?borradoresConfiguracionPlanilla: validacionBorradores\.borradores/);
});

console.log(`\n${total} pruebas del borrador mensual de configuración superadas.`);
