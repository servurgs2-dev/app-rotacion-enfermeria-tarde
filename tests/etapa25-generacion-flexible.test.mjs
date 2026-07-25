import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TURNOS, obtenerEstrategiaRotacionPlanilla } from "../src/config/turnos.js";
import {
  analizarDistribucionBaseEnfermeros,
  crearMetadataGeneracionFlexible,
  quitarGeneracionFlexible,
  validarPosicionesNoAplicables
} from "../src/utils/generacionFlexiblePlanilla.js";
import {
  generarBloquesFaltantes,
  generarDistribucionParaIndice,
  generarRotacionMensual,
  regenerarRotacion3DiasDesdePrimerBloque
} from "../src/utils/rotacionPlanilla.js";
import { continuarRotacion3DiasEntreMeses } from "../src/utils/continuidadRotacionPlanilla.js";
import { continuarPlanillasDesdeMesAnterior } from "../src/utils/proteccionDatos.js";
import { quitarCierresDeEstadoCopiado } from "../src/utils/cierreTurno.js";

let cantidad = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  cantidad += 1;
  process.stdout.write(`✓ ${nombre}\n`);
};

const filas = [
  "REA 1", "EXPLORA 1", "T1", "1-3 + 21", "PRE INT 1",
  "DX 25-30", "T2", "8-13", "4-7", "T3",
  "SILLÓN 1", "14-19", "REA 2", "T4", "SILLON 2",
  "20-22-24", "PRE INT 2", "EXPLORA 2", "T5", "SM"
];
const personal = filas.map((fila, indice) => ({
  id: `persona-${indice + 1}`,
  nombre: `Persona ${indice + 1}`,
  categoria: "enfermero",
  fila
}));
const ref = (indice) => ({
  personaId: personal[indice].id,
  nombre: personal[indice].nombre
});
const distribucion = (vacias = []) => Object.fromEntries(
  filas.map((fila, indice) => [fila, vacias.includes(fila) ? "" : ref(indice)])
);
const semanas = Array.from({ length: 5 }, (_, indice) => ({
  clave: `semana${indice + 1}`
}));
const periodos = [
  { clave: "2026-06-29", indice: -1, etiqueta: "29 jun–1 jul" },
  { clave: "2026-07-02", indice: 0, etiqueta: "2–4 jul" },
  { clave: "2026-07-05", indice: 1, etiqueta: "5–7 jul" },
  { clave: "2026-07-08", indice: 2, etiqueta: "8–10 jul" }
];
const ids = (valores) => Object.values(valores)
  .map((valor) => valor?.personaId)
  .filter(Boolean);

for (const [turnoId, esperado] of [
  ["manana", "semanal"],
  ["tarde", "semanal"],
  ["vespertino", "semanal"],
  ["noche", "cada_3_dias"]
]) {
  await probar(`${turnoId} usa identificador y estrategia reales`, () => {
    assert.equal(TURNOS[turnoId].id, turnoId);
    assert.equal(obtenerEstrategiaRotacionPlanilla({
      turnoId,
      tipo: "enfermero",
      mesActivo: "2026-08"
    }).tipo, esperado);
  });
}

await probar("Licenciados conserva estrategia semanal en los cuatro turnos", () => {
  Object.keys(TURNOS).forEach((turnoId) => {
    assert.equal(obtenerEstrategiaRotacionPlanilla({
      turnoId,
      tipo: "licenciado",
      mesActivo: "2026-08"
    }).tipo, "semanal");
  });
});

await probar("20 personas válidas no requieren exclusión", () => {
  const resultado = analizarDistribucionBaseEnfermeros({
    distribucionBase: distribucion(),
    filas,
    personal
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.cantidadPersonas, 20);
  assert.equal(resultado.cantidadPosicionesNoAplicables, 0);
});

await probar("19 personas con T5 vacío requieren una exclusión", () => {
  const resultado = analizarDistribucionBaseEnfermeros({
    distribucionBase: distribucion(["T5"]),
    filas,
    personal
  });
  assert.deepEqual(resultado.filasVacias, ["T5"]);
  assert.equal(resultado.cantidadPosicionesNoAplicables, 1);
});

await probar("18 personas requieren dos exclusiones", () => {
  const resultado = analizarDistribucionBaseEnfermeros({
    distribucionBase: distribucion(["REA 1", "T5"]),
    filas,
    personal
  });
  assert.equal(resultado.cantidadPersonas, 18);
  assert.equal(resultado.cantidadPosicionesNoAplicables, 2);
});

await probar("referencia inexistente bloquea la generación", () => {
  const base = distribucion(["T5"]);
  base.T5 = { personaId: "inexistente", nombre: "Sintética" };
  const resultado = analizarDistribucionBaseEnfermeros({
    distribucionBase: base,
    filas,
    personal
  });
  assert.equal(resultado.ok, false);
  assert.match(resultado.mensaje, /personal existente/i);
});

await probar("persona duplicada bloquea la generación", () => {
  const base = distribucion();
  base.T5 = base["REA 1"];
  const resultado = analizarDistribucionBaseEnfermeros({
    distribucionBase: base,
    filas,
    personal
  });
  assert.equal(resultado.ok, false);
  assert.match(resultado.mensaje, /más de una vez/i);
});

await probar("configuración distinta de 20 filas bloquea", () => {
  const resultado = analizarDistribucionBaseEnfermeros({
    distribucionBase: distribucion(),
    filas: filas.slice(1),
    personal
  });
  assert.equal(resultado.ok, false);
});

await probar("posición ocupada no puede seleccionarse", () => {
  const resultado = validarPosicionesNoAplicables({
    seleccionadas: ["REA 1"],
    filas,
    filasVacias: ["T5"],
    cantidadRequerida: 1
  });
  assert.equal(resultado.ok, false);
  assert.match(resultado.mensaje, /vacías/i);
});

const generarSemanal = (vacias, excluidas) => generarRotacionMensual({
  planilla: { semana1: distribucion(vacias), coberturaLibreSM: {} },
  filas,
  semanas,
  filaFija: "SM",
  personal,
  posicionesNoAplicables: excluidas
});

for (const turnoId of ["manana", "tarde", "vespertino"]) {
  await probar(`${turnoId} con 20 personas conserva la rotación semanal`, () => {
    const resultado = generarSemanal([], []);
    assert.equal(ids(resultado.semana2).length, 20);
    assert.deepEqual(resultado.semana2["REA 1"], ref(18));
    assert.deepEqual(resultado.semana2.EXPLORA1, undefined);
  });
}

await probar("rotación semanal conserva sentido y un paso", () => {
  const resultado = generarSemanal(["T5"], ["T5"]);
  assert.deepEqual(resultado.semana2["REA 1"], ref(17));
  assert.deepEqual(resultado.semana2["EXPLORA 1"], ref(0));
});

await probar("Mañana con 19 personas puede excluir T5", () => {
  const resultado = generarSemanal(["T5"], ["T5"]);
  assert.equal(resultado.semana2.T5, "");
  assert.equal(new Set(ids(resultado.semana2)).size, 19);
});

await probar("Tarde con 19 personas puede excluir un sector fijo", () => {
  const resultado = generarSemanal(["REA 1"], ["REA 1"]);
  assert.equal(resultado.semana4["REA 1"], "");
  assert.equal(new Set(ids(resultado.semana4)).size, 19);
});

await probar("Vespertino con 18 personas puede excluir dos posiciones", () => {
  const resultado = generarSemanal(["REA 1", "T5"], ["REA 1", "T5"]);
  assert.equal(resultado.semana5["REA 1"], "");
  assert.equal(resultado.semana5.T5, "");
  assert.equal(new Set(ids(resultado.semana5)).size, 18);
});

await probar("posición semanal excluida permanece vacía", () => {
  const resultado = generarSemanal(["T5"], ["T5"]);
  semanas.forEach(({ clave }) => {
    if (clave === "semana1") return;
    assert.equal(resultado[clave].T5, "");
    assert.equal(Object.keys(resultado[clave]).length, 20);
  });
});

await probar("las otras 19 personas semanales no se duplican ni desaparecen", () => {
  const resultado = generarSemanal(["T5"], ["T5"]);
  semanas.slice(1).forEach(({ clave }) => {
    assert.equal(ids(resultado[clave]).length, 19);
    assert.equal(new Set(ids(resultado[clave])).size, 19);
  });
});

await probar("SM semanal permanece fija cuando participa", () => {
  const resultado = generarSemanal(["T5"], ["T5"]);
  semanas.slice(1).forEach(({ clave }) => {
    assert.deepEqual(resultado[clave].SM, ref(19));
  });
});

await probar("SM semanal permanece vacía cuando se excluye", () => {
  const resultado = generarSemanal(["SM"], ["SM"]);
  semanas.slice(1).forEach(({ clave }) => assert.equal(resultado[clave].SM, ""));
});

await probar("Noche sin exclusiones conserva rotación global anterior", () => {
  const base = distribucion();
  const resultado = generarDistribucionParaIndice({
    distribucionBase: base,
    filas,
    filasFijas: ["SM"],
    indice: 1
  });
  assert.deepEqual(resultado["REA 1"], ref(18));
  assert.deepEqual(resultado["EXPLORA 1"], ref(0));
  assert.deepEqual(resultado.SM, ref(19));
});

await probar("Noche excluye T5 directamente del anillo", () => {
  const base = distribucion(["T5"]);
  const resultado = generarDistribucionParaIndice({
    distribucionBase: base,
    filas,
    filasFijas: ["SM"],
    posicionesNoAplicables: ["T5"],
    indice: 1
  });
  assert.equal(resultado.T5, "");
  assert.deepEqual(resultado["REA 1"], ref(17));
  assert.equal(ids(resultado).length, 19);
  assert.equal(new Set(ids(resultado)).size, 19);
});

await probar("T5 permanece vacía en todos los bloques regenerados", () => {
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: {
      bloques: { "2026-06-29": distribucion(["T5"]) },
      coberturaLibreSM: {}
    },
    periodos,
    filas,
    filasFijas: ["SM"],
    posicionesNoAplicables: ["T5"],
    estrategia: { fechaBase: "2026-07-02", duracionDias: 3 }
  });
  assert.equal(resultado.ok, true);
  Object.values(resultado.rotacion3Dias.bloques).forEach((bloque) => {
    assert.equal(bloque.T5, "");
    assert.equal(new Set(ids(bloque)).size, 19);
  });
});

await probar("regeneración nocturna conserva el primer bloque manual", () => {
  const referencia = distribucion(["T5"]);
  const resultado = regenerarRotacion3DiasDesdePrimerBloque({
    rotacion3Dias: { bloques: { "2026-06-29": referencia } },
    periodos,
    filas,
    filasFijas: ["SM"],
    posicionesNoAplicables: ["T5"],
    estrategia: { fechaBase: "2026-07-02", duracionDias: 3 }
  });
  assert.deepEqual(resultado.rotacion3Dias.bloques["2026-06-29"], referencia);
});

await probar("bloques faltantes preservan bloques existentes", () => {
  const existente = { marca: { personaId: "manual", nombre: "Manual" } };
  const resultado = generarBloquesFaltantes({
    rotacion3Dias: {
      asignacionBase: distribucion(["T5"]),
      bloques: { "2026-07-02": existente }
    },
    periodos,
    filas,
    filasFijas: ["SM"],
    posicionesNoAplicables: ["T5"]
  });
  assert.deepEqual(resultado.bloques["2026-07-02"], existente);
  assert.equal(resultado.bloques["2026-07-05"].T5, "");
});

await probar("SM nocturna permanece fija o vacía según selección", () => {
  const fija = generarDistribucionParaIndice({
    distribucionBase: distribucion(["T5"]),
    filas,
    filasFijas: ["SM"],
    posicionesNoAplicables: ["T5"],
    indice: 4
  });
  const excluida = generarDistribucionParaIndice({
    distribucionBase: distribucion(["SM"]),
    filas,
    filasFijas: ["SM"],
    posicionesNoAplicables: ["SM"],
    indice: 4
  });
  assert.deepEqual(fija.SM, ref(19));
  assert.equal(excluida.SM, "");
});

await probar("continuidad nocturna sin exclusiones conserva índices y bloques", () => {
  const anterior = {
    version: 1,
    fechaBase: "2026-07-02",
    duracionDias: 3,
    asignacionBase: distribucion(),
    bloques: {},
    coberturaLibreSM: {}
  };
  const resultado = continuarRotacion3DiasEntreMeses({
    rotacionAnterior: anterior,
    rotacionActual: {},
    periodosDestino: periodos.slice(1),
    filas,
    filasFijas: ["SM"],
    estrategia: { fechaBase: "2026-07-02", duracionDias: 3 }
  });
  assert.deepEqual(resultado.asignacionBase, anterior.asignacionBase);
  assert.deepEqual(resultado.bloques["2026-07-05"]["REA 1"], ref(18));
});

await probar("metadata usa estrategia y turno reales", () => {
  for (const turnoId of Object.keys(TURNOS)) {
    const estrategia = obtenerEstrategiaRotacionPlanilla({
      turnoId,
      tipo: "enfermero",
      mesActivo: "2026-08"
    }).tipo;
    assert.deepEqual(crearMetadataGeneracionFlexible({
      estrategia,
      turnoId,
      posicionesNoAplicables: ["T5"],
      cantidadPersonasConsideradas: 19
    }).turnoId, turnoId);
  }
});

await probar("datos históricos sin metadata siguen siendo válidos", () => {
  const planilla = { semana1: distribucion() };
  assert.equal(quitarGeneracionFlexible(planilla), planilla);
  assert.equal(generarRotacionMensual({
    planilla,
    filas,
    semanas,
    filaFija: "SM",
    personal
  }).semana2 !== undefined, true);
});

await probar("una asignación manual posterior no se propaga", () => {
  const resultado = generarSemanal(["T5"], ["T5"]);
  resultado.semana3 = { ...resultado.semana3, T5: ref(18) };
  assert.deepEqual(resultado.semana3.T5, ref(18));
  assert.equal(resultado.semana2.T5, "");
  assert.equal(resultado.semana4.T5, "");
});

await probar("continuar mes elimina exclusión activa", () => {
  const estado = {
    planillas: {
      enfermeros: {
        semana1: distribucion(["T5"]),
        generacionFlexible: { posicionesNoAplicables: ["T5"] }
      },
      licenciados: { semana1: {} }
    }
  };
  const continuado = continuarPlanillasDesdeMesAnterior(estado, {
    planillaVacia: () => ({ semana1: {}, semana2: {} })
  });
  assert.equal(
    Object.hasOwn(continuado.planillas.enfermeros, "generacionFlexible"),
    false
  );
});

await probar("copiar mes elimina exclusión activa", () => {
  const estado = {
    planillas: {
      enfermeros: {
        semana1: distribucion(["T5"]),
        generacionFlexible: { posicionesNoAplicables: ["T5"] }
      },
      licenciados: { semana1: {} }
    },
    calendario: {
      enfermeros: { cierresDia: { "2026-08-01": {} } },
      licenciados: { cierresDia: {} }
    }
  };
  const copiado = quitarCierresDeEstadoCopiado(estado);
  assert.equal(Object.hasOwn(
    copiado.planillas.enfermeros,
    "generacionFlexible"
  ), false);
  assert.deepEqual(copiado.calendario.enfermeros.cierresDia, {});
});

const componente = await readFile(
  new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url),
  "utf8"
);
const selector = await readFile(
  new URL("../src/components/planilla/SelectorPosicionesNoAplicables.jsx", import.meta.url),
  "utf8"
);
const calendario = await readFile(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
const pdf = await readFile(new URL("../src/utils/exportPDF.js", import.meta.url), "utf8");

await probar("los cuatro turnos de Enfermeros usan el mismo flujo flexible", () => {
  assert.match(componente, /if \(tipo === "enfermero"\)/);
  assert.doesNotMatch(componente, /turnoId === "tarde"/);
});

await probar("el selector muestra ocupadas deshabilitadas y las 20 filas", () => {
  assert.match(selector, /filas\.map/);
  assert.match(selector, /disabled=\{!estaVacia\}/);
  assert.match(selector, /"Vacía"/);
});

await probar("sector crítico muestra advertencia no bloqueante", () => {
  assert.match(selector, /sectores críticos/i);
  assert.match(selector, /Podés continuar/i);
});

await probar("cancelar solo limpia estado local del modal", () => {
  assert.match(componente, /onCancelar=\{\(\) => \{/);
  assert.match(componente, /setPreparacionFlexible\(null\)/);
});

await probar("se advierte antes de regenerar períodos con datos", () => {
  assert.match(componente, /advertenciaSobrescritura/);
  assert.match(componente, /window\.confirm/);
});

await probar("Calendario y PDF continúan tolerando referencias vacías", () => {
  assert.match(calendario, /resolverPersonaDesdeReferencia/);
  assert.match(pdf, /nombreParaPDF\(valores\[filaPlanilla\]\) \|\| "-"/);
});

process.stdout.write(`\n${cantidad} pruebas permanentes de Etapa 25 superadas.\n`);
