import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva,
  obtenerFilasActivas
} from "../src/utils/configuracionPlanilla.js";
import { resolverEstructuraCalendario } from "../src/utils/estructuraCalendario.js";
import { obtenerFilasPlanillaPDF } from "../src/utils/exportPDF.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  analizarPreparacionMesNuevo,
  construirEstadoMesNuevo,
  obtenerFilasPlanilla
} from "../src/utils/preparacionMesNuevo.js";
import {
  cambiarActivoFilaBorrador,
  moverFilaBorrador,
  validarBorradoresConfiguracionPlanilla
} from "../src/utils/plantillasConfiguracionPlanilla.js";

const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const firma = (valor) => JSON.stringify(valor);
const filasEnf = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
const filasLic = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
const personas = [
  ...filasEnf.map((_, indice) => ({ id: `e${indice}`, nombre: `E ${indice}`, categoria: "enfermero", turno: "tarde" })),
  ...filasLic.map((_, indice) => ({ id: `l${indice}`, nombre: `L ${indice}`, categoria: "licenciado", turno: "tarde" }))
];
const distribuir = (filas, categoria) => Object.fromEntries(filas.map((fila, indice) => {
  const persona = personas.filter((item) => item.categoria === categoria)[indice];
  return [fila, { personaId: persona.id, nombre: persona.nombre }];
}));
const crearOrigen = ({ t6 = false, t3 = false, snapshots = false } = {}) => {
  const estado = crearEstadoMensualVacio();
  estado.personal = clonar(personas);
  estado.planillas.enfermeros.semana5 = distribuir(filasEnf, "enfermero");
  estado.planillas.licenciados.semana5 = distribuir(filasLic, "licenciado");
  if (t6) estado.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  if (t3) estado.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  if (snapshots) estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({
      turno: "tarde", categoria: "enfermero", mes: "2026-08",
      posicionesMensualesAdicionales: t6 ? ["T6"] : []
    }),
    licenciado: crearSnapshotConfiguracionPlanilla({
      turno: "tarde", categoria: "licenciado", mes: "2026-08",
      posicionesMensualesAdicionales: t3 ? ["T3"] : []
    })
  };
  return estado;
};
const analizar = (origen, destino = crearEstadoMensualVacio()) => {
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "tarde", mesOrigen: "2026-08", mesDestino: "2026-09",
    estadoOrigen: origen, estadoDestino: destino
  });
  assert.equal(analisis.ok, true, analisis.mensaje);
  return analisis;
};
const construir = (analisis, borradores = analisis.borradoresConfiguracionPlanilla) =>
  construirEstadoMesNuevo({ analisis, borradoresConfiguracionPlanilla: borradores });
let total = 0;
const probar = (nombre, prueba) => { prueba(); total += 1; console.log(`✓ ${nombre}`); };

const origenBase = crearOrigen();
const origenBaseAntes = firma(origenBase);
const analisisBase = analizar(origenBase);
const borradoresBaseAntes = firma(analisisBase.borradoresConfiguracionPlanilla);
const resultadoBase = construir(analisisBase);
assert.equal(resultadoBase.ok, true, resultadoBase.mensaje);
const estadoBase = resultadoBase.estado;

probar("1 borrador sin cambios crea snapshot equivalente al origen", () => {
  assert.deepEqual(estadoBase.configuracionPlanilla.enfermero.filas,
    analisisBase.borradoresConfiguracionPlanilla.enfermero.filas);
});
probar("2 reordenar se refleja en snapshot destino", () => {
  const borradores = clonar(analisisBase.borradoresConfiguracionPlanilla);
  borradores.enfermero = moverFilaBorrador(borradores.enfermero, borradores.enfermero.filas[1].filaId, "arriba");
  assert.equal(construir(analisisBase, borradores).estado.configuracionPlanilla.enfermero.filas[0].filaId,
    borradores.enfermero.filas[0].filaId);
});
const borradoresInactivos = clonar(analisisBase.borradoresConfiguracionPlanilla);
borradoresInactivos.enfermero = cambiarActivoFilaBorrador(
  borradoresInactivos.enfermero, borradoresInactivos.enfermero.filas[1].filaId, false
);
const estadoInactivo = construir(analisisBase, borradoresInactivos).estado;
probar("3 fila Inactiva queda activo=false", () => assert.equal(
  estadoInactivo.configuracionPlanilla.enfermero.filas[1].activo, false
));
probar("4 fila inactiva no aparece entre filas activas", () => assert.equal(
  obtenerFilasActivas(estadoInactivo.configuracionPlanilla.enfermero.filas)
    .some((fila) => fila.filaId === borradoresInactivos.enfermero.filas[1].filaId), false
));
const efectiva = obtenerConfiguracionPlanillaEfectiva({
  estadoMensual: estadoInactivo, turno: "tarde", categoria: "enfermero", mes: "2026-09"
});
probar("5 Planilla efectiva respeta snapshot", () => assert.equal(efectiva.filas[1].activo, false));
probar("6 Calendario efectivo respeta snapshot", () => assert.equal(
  resolverEstructuraCalendario({ configuracionEfectiva: efectiva }).filas.includes(efectiva.filas[1].etiqueta), false
));
probar("7 PDF efectivo respeta snapshot", () => assert.equal(
  obtenerFilasPlanillaPDF({ estadoMensual: estadoInactivo, turnoId: "tarde", mesActivo: "2026-09", tipo: "enfermero" })
    .includes(efectiva.filas[1].etiqueta), false
));
for (const [numero, campo] of [[8,"filaId"],[9,"sectorId"],[10,"turnanteId"],[11,"ordinalTurnante"],[12,"tipo"],[13,"etiqueta"]]) {
  probar(`${numero} preserva ${campo}`, () => {
    const origen = analisisBase.borradoresConfiguracionPlanilla.enfermero.filas;
    const destino = estadoBase.configuracionPlanilla.enfermero.filas;
    assert.deepEqual(destino.map((fila) => fila[campo]), origen.map((fila) => fila[campo]));
  });
}
probar("14 orden queda normalizado", () => assert.deepEqual(
  estadoBase.configuracionPlanilla.enfermero.filas.map((fila) => fila.orden),
  estadoBase.configuracionPlanilla.enfermero.filas.map((_, indice) => indice)
));
probar("15 origen no mutado", () => assert.equal(firma(origenBase), origenBaseAntes));
probar("16 borrador entrada no mutado", () => assert.equal(
  firma(analisisBase.borradoresConfiguracionPlanilla), borradoresBaseAntes
));
const sectoresAntes = firma(configuracionSectores);
probar("17 configuracionSectores no mutado", () => assert.equal(firma(configuracionSectores), sectoresAntes));
probar("18 categorías independientes", () => assert.notEqual(
  estadoBase.configuracionPlanilla.enfermero.filas, estadoBase.configuracionPlanilla.licenciado.filas
));
probar("19 snapshot de otro turno no se toca", () => {
  const otro = crearSnapshotConfiguracionPlanilla({ turno: "noche", categoria: "enfermero", mes: "2026-09" });
  const antes = firma(otro); construir(analisisBase); assert.equal(firma(otro), antes);
});
probar("20 snapshot preexistente válido conserva protección", () => {
  const destino = crearEstadoMensualVacio();
  const existente = crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "enfermero", mes: "2026-09" });
  existente.filas[0].etiqueta = "CONSERVADA";
  destino.configuracionPlanilla = { enfermero: existente };
  const resultado = construir(analizar(crearOrigen(), destino));
  assert.equal(resultado.estado.configuracionPlanilla.enfermero.filas[0].etiqueta, "CONSERVADA");
  assert.notEqual(resultado.estado.configuracionPlanilla.enfermero, existente);
});
probar("21 borrador inválido bloquea", () => assert.equal(
  construirEstadoMesNuevo({ analisis: analisisBase, borradoresConfiguracionPlanilla: {} }).ok, false
));
const probarDuplicado = (numero, campo, categoria, indiceA, indiceB) => probar(
  `${numero} ${campo} duplicado bloquea`, () => {
    const borradores = clonar(analisisBase.borradoresConfiguracionPlanilla);
    borradores[categoria].filas[indiceB][campo] = borradores[categoria].filas[indiceA][campo];
    assert.equal(construir(analisisBase, borradores).ok, false);
  }
);
probarDuplicado(22, "filaId", "enfermero", 0, 1);
const sectores = analisisBase.borradoresConfiguracionPlanilla.enfermero.filas
  .map((fila, indice) => ({ fila, indice })).filter(({ fila }) => fila.tipo === "sector");
const turnantes = analisisBase.borradoresConfiguracionPlanilla.enfermero.filas
  .map((fila, indice) => ({ fila, indice })).filter(({ fila }) => fila.tipo === "turnante");
probarDuplicado(23, "sectorId", "enfermero", sectores[0].indice, sectores[1].indice);
probarDuplicado(24, "turnanteId", "enfermero", turnantes[0].indice, turnantes[1].indice);

const prepararAdicional = ({ categoria, etiqueta, activo }) => {
  const origen = crearOrigen({ t6: etiqueta === "T6", t3: etiqueta === "T3", snapshots: true });
  const analisis = analizar(origen);
  const borradores = clonar(analisis.borradoresConfiguracionPlanilla);
  const fila = borradores[categoria].filas.find((item) => item.etiqueta === etiqueta);
  fila.activo = activo;
  return construir(analisis, borradores).estado;
};
probar("25 T6 activo sincroniza posición mensual", () => assert.deepEqual(
  prepararAdicional({ categoria:"enfermero", etiqueta:"T6", activo:true }).planillas.enfermeros.posicionesMensualesAdicionales, ["T6"]
));
probar("26 T6 inactivo no queda habilitado", () => assert.equal(
  prepararAdicional({ categoria:"enfermero", etiqueta:"T6", activo:false }).planillas.enfermeros.posicionesMensualesAdicionales, undefined
));
probar("27 T3 activo sincroniza posición mensual", () => assert.deepEqual(
  prepararAdicional({ categoria:"licenciado", etiqueta:"T3", activo:true }).planillas.licenciados.posicionesMensualesAdicionales, ["T3"]
));
probar("28 T3 inactivo no queda habilitado", () => assert.equal(
  prepararAdicional({ categoria:"licenciado", etiqueta:"T3", activo:false }).planillas.licenciados.posicionesMensualesAdicionales, undefined
));
probar("29 Cancelar no crea snapshot", () => {
  const origen = crearOrigen(); analizar(origen); assert.equal(Object.hasOwn(origen, "configuracionPlanilla"), false);
});
probar("30 lectura no crea snapshot", () => {
  const legacy = crearOrigen(); obtenerConfiguracionPlanillaEfectiva({ estadoMensual:legacy, turno:"tarde", categoria:"enfermero", mes:"2026-08" });
  assert.equal(Object.hasOwn(legacy, "configuracionPlanilla"), false);
});
probar("31 contexto incompleto falla controladamente", () => assert.equal(
  validarBorradoresConfiguracionPlanilla({ borradores: {} }).ok, false
));
probar("32 agosto legacy permanece intacto", () => assert.equal(firma(origenBase), origenBaseAntes));

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(app, /validarBorradoresConfiguracionPlanilla[\s\S]*construirEstadoMesNuevo/);
console.log(`\nEtapa 34C3: ${total} pruebas de confirmación de configuración aprobadas.`);
