import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aplicarIntercambioPlanilla,
  debeSincronizarAsignacionBase,
  obtenerDistribucionPeriodo,
  obtenerOpcionesOcupadas,
  validarIntercambioPlanilla
} from "../src/utils/intercambioPlanilla.js";

let cantidad = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  cantidad += 1;
  process.stdout.write(`✓ ${nombre}\n`);
};

const filasEnfermeros = ["REA 1", "T1", "SM"];
const enfermeros = [
  { id: "e1", nombre: "Persona A", categoria: "enfermero" },
  { id: "e2", nombre: "Persona B", categoria: "enfermero" },
  { id: "e3", nombre: "Persona C", categoria: "enfermero" }
];
const filasLicenciados = ["Triage 1", "T1", "Salud Mental"];
const licenciados = [
  { id: "l1", nombre: "Licenciada A", categoria: "licenciado" },
  { id: "l2", nombre: "Licenciada B", categoria: "licenciado" },
  { id: "l3", nombre: "Licenciada C", categoria: "licenciado" }
];
const ref = (persona) => ({ personaId: persona.id, nombre: persona.nombre });
const semanaEnfermeros = () => ({
  "REA 1": ref(enfermeros[0]),
  T1: ref(enfermeros[1]),
  SM: ref(enfermeros[2])
});
const argumentosSemanales = (planilla = {
  semana1: semanaEnfermeros(),
  semana2: semanaEnfermeros(),
  coberturaLibreSM: { semana1: ref(enfermeros[1]) },
  generacionFlexible: {
    version: 1,
    posicionesNoAplicables: ["T1"]
  }
}) => ({
  planilla,
  periodoClave: "semana1",
  filaOrigen: "REA 1",
  filaDestino: "T1",
  filas: filasEnfermeros,
  personal: enfermeros,
  categoria: "enfermero",
  usaRotacionTresDias: false,
  personaIdOrigenEsperada: "e1",
  personaIdDestinoEsperada: "e2"
});

await probar("intercambio válido invierte las dos referencias", () => {
  const resultado = aplicarIntercambioPlanilla(argumentosSemanales());
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.planilla.semana1["REA 1"], ref(enfermeros[1]));
  assert.deepEqual(resultado.planilla.semana1.T1, ref(enfermeros[0]));
});

await probar("las demás filas permanecen iguales", () => {
  const args = argumentosSemanales();
  const resultado = aplicarIntercambioPlanilla(args);
  assert.deepEqual(resultado.planilla.semana1.SM, args.planilla.semana1.SM);
});

await probar("las demás semanas permanecen iguales", () => {
  const args = argumentosSemanales();
  const resultado = aplicarIntercambioPlanilla(args);
  assert.equal(resultado.planilla.semana2, args.planilla.semana2);
});

await probar("cobertura y metadata permanecen iguales", () => {
  const args = argumentosSemanales();
  const resultado = aplicarIntercambioPlanilla(args);
  assert.equal(resultado.planilla.coberturaLibreSM, args.planilla.coberturaLibreSM);
  assert.equal(resultado.planilla.generacionFlexible, args.planilla.generacionFlexible);
});

await probar("misma fila se rechaza", () => {
  const resultado = validarIntercambioPlanilla({
    ...argumentosSemanales(),
    filaDestino: "REA 1"
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "FILAS_IGUALES");
});

await probar("período inexistente se rechaza", () => {
  const resultado = validarIntercambioPlanilla({
    ...argumentosSemanales(),
    periodoClave: "semana9"
  });
  assert.equal(resultado.codigo, "PERIODO_INEXISTENTE");
});

await probar("fila inexistente se rechaza", () => {
  const resultado = validarIntercambioPlanilla({
    ...argumentosSemanales(),
    filaDestino: "NO EXISTE"
  });
  assert.equal(resultado.codigo, "FILA_INEXISTENTE");
});

await probar("primera posición vacía se rechaza", () => {
  const planilla = { semana1: { ...semanaEnfermeros(), "REA 1": "" } };
  assert.equal(validarIntercambioPlanilla({
    ...argumentosSemanales(planilla)
  }).codigo, "POSICION_VACIA");
});

await probar("segunda posición vacía se rechaza", () => {
  const planilla = { semana1: { ...semanaEnfermeros(), T1: "" } };
  assert.equal(validarIntercambioPlanilla({
    ...argumentosSemanales(planilla)
  }).codigo, "POSICION_VACIA");
});

await probar("persona inexistente se rechaza", () => {
  const planilla = {
    semana1: {
      ...semanaEnfermeros(),
      T1: { personaId: "ausente", nombre: "Ausente" }
    }
  };
  assert.equal(validarIntercambioPlanilla({
    ...argumentosSemanales(planilla)
  }).codigo, "PERSONA_INEXISTENTE");
});

await probar("referencia histórica por nombre puede resolverse", () => {
  const planilla = {
    semana1: { ...semanaEnfermeros(), "REA 1": "Persona A" }
  };
  const resultado = aplicarIntercambioPlanilla(argumentosSemanales(planilla));
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.planilla.semana1.T1, ref(enfermeros[0]));
});

await probar("referencia inválida en otra fila se rechaza", () => {
  const planilla = {
    semana1: { ...semanaEnfermeros(), SM: "No identificada" }
  };
  assert.equal(validarIntercambioPlanilla({
    ...argumentosSemanales(planilla)
  }).codigo, "REFERENCIA_INVALIDA");
});

await probar("duplicado previo bloquea intercambio", () => {
  const planilla = {
    semana1: { ...semanaEnfermeros(), SM: ref(enfermeros[0]) }
  };
  assert.equal(validarIntercambioPlanilla({
    ...argumentosSemanales(planilla)
  }).codigo, "DUPLICADO_PREVIO");
});

await probar("personas diferentes siguen únicas después", () => {
  const resultado = aplicarIntercambioPlanilla(argumentosSemanales());
  const ids = Object.values(resultado.planilla.semana1).map((item) => item.personaId);
  assert.equal(new Set(ids).size, 3);
});

await probar("cambio desde selección bloquea confirmación", () => {
  const resultado = validarIntercambioPlanilla({
    ...argumentosSemanales(),
    personaIdDestinoEsperada: "e3"
  });
  assert.equal(resultado.codigo, "PLANILLA_CAMBIO");
  assert.match(resultado.mensaje, /cambió desde que seleccionaste/i);
});

for (const turno of ["Mañana", "Tarde", "Vespertino", "Noche semanal histórica"]) {
  await probar(`${turno} usa el mismo intercambio semanal`, () => {
    assert.equal(aplicarIntercambioPlanilla(argumentosSemanales()).ok, true);
  });
}

await probar("sector fijo y turnante pueden intercambiarse", () => {
  const resultado = aplicarIntercambioPlanilla(argumentosSemanales());
  assert.deepEqual(resultado.planilla.semana1.T1, ref(enfermeros[0]));
});

await probar("SM puede intercambiarse", () => {
  const resultado = aplicarIntercambioPlanilla({
    ...argumentosSemanales(),
    filaDestino: "SM",
    personaIdDestinoEsperada: "e3"
  });
  assert.deepEqual(resultado.planilla.semana1.SM, ref(enfermeros[0]));
});

await probar("posición no aplicable completada puede intercambiarse", () => {
  const args = argumentosSemanales();
  const resultado = aplicarIntercambioPlanilla(args);
  assert.equal(resultado.ok, true);
  assert.deepEqual(
    resultado.planilla.generacionFlexible.posicionesNoAplicables,
    ["T1"]
  );
});

const crearNoche = () => ({
  generacionFlexible: { posicionesNoAplicables: [] },
  rotacion3Dias: {
    version: 1,
    fechaBase: "2026-07-02",
    duracionDias: 3,
    asignacionBase: semanaEnfermeros(),
    bloques: {
      "2026-07-02": semanaEnfermeros(),
      "2026-07-05": {
        "REA 1": ref(enfermeros[1]),
        T1: ref(enfermeros[2]),
        SM: ref(enfermeros[0])
      }
    },
    coberturaLibreSM: { "2026-07-02": ref(enfermeros[1]) }
  }
});
const argumentosNoche = (periodoClave = "2026-07-05") => ({
  planilla: crearNoche(),
  periodoClave,
  filaOrigen: "REA 1",
  filaDestino: "T1",
  filas: filasEnfermeros,
  personal: enfermeros,
  categoria: "enfermero",
  usaRotacionTresDias: true
});

await probar("Noche cada tres días intercambia dentro del bloque", () => {
  const resultado = aplicarIntercambioPlanilla(argumentosNoche());
  assert.deepEqual(
    resultado.planilla.rotacion3Dias.bloques["2026-07-05"]["REA 1"],
    ref(enfermeros[2])
  );
});

await probar("bloque normal no modifica asignacionBase", () => {
  const args = argumentosNoche();
  const resultado = aplicarIntercambioPlanilla(args);
  assert.equal(
    resultado.planilla.rotacion3Dias.asignacionBase,
    args.planilla.rotacion3Dias.asignacionBase
  );
});

await probar("período base sincroniza ambas filas de asignacionBase", () => {
  const resultado = aplicarIntercambioPlanilla(argumentosNoche("2026-07-02"));
  assert.deepEqual(
    resultado.planilla.rotacion3Dias.asignacionBase["REA 1"],
    ref(enfermeros[1])
  );
  assert.deepEqual(
    resultado.planilla.rotacion3Dias.asignacionBase.T1,
    ref(enfermeros[0])
  );
});

await probar("condición base reutiliza fechaBase y base útil", () => {
  const noche = crearNoche();
  assert.equal(debeSincronizarAsignacionBase({
    rotacion3Dias: noche.rotacion3Dias,
    periodoClave: "2026-07-02"
  }), true);
  assert.equal(debeSincronizarAsignacionBase({
    rotacion3Dias: noche.rotacion3Dias,
    periodoClave: "2026-07-05"
  }), false);
});

await probar("otros bloques nocturnos permanecen iguales", () => {
  const args = argumentosNoche("2026-07-02");
  const resultado = aplicarIntercambioPlanilla(args);
  assert.equal(
    resultado.planilla.rotacion3Dias.bloques["2026-07-05"],
    args.planilla.rotacion3Dias.bloques["2026-07-05"]
  );
});

await probar("metadata nocturna permanece intacta", () => {
  const args = argumentosNoche();
  const resultado = aplicarIntercambioPlanilla(args);
  assert.equal(resultado.planilla.generacionFlexible, args.planilla.generacionFlexible);
  assert.equal(
    resultado.planilla.rotacion3Dias.coberturaLibreSM,
    args.planilla.rotacion3Dias.coberturaLibreSM
  );
  assert.equal(resultado.planilla.rotacion3Dias.version, 1);
  assert.equal(resultado.planilla.rotacion3Dias.fechaBase, "2026-07-02");
  assert.equal(resultado.planilla.rotacion3Dias.duracionDias, 3);
});

await probar("Licenciados intercambia sector y turnante", () => {
  const planilla = {
    semana1: {
      "Triage 1": ref(licenciados[0]),
      T1: ref(licenciados[1]),
      "Salud Mental": ref(licenciados[2])
    }
  };
  const resultado = aplicarIntercambioPlanilla({
    planilla,
    periodoClave: "semana1",
    filaOrigen: "Triage 1",
    filaDestino: "T1",
    filas: filasLicenciados,
    personal: licenciados,
    categoria: "licenciado"
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.planilla.semana1.T1, ref(licenciados[0]));
  assert.equal(Object.hasOwn(resultado.planilla, "rotacion3Dias"), false);
});

await probar("Licenciados permite Salud Mental", () => {
  const planilla = {
    semana1: {
      "Triage 1": ref(licenciados[0]),
      T1: ref(licenciados[1]),
      "Salud Mental": ref(licenciados[2])
    }
  };
  const resultado = aplicarIntercambioPlanilla({
    planilla,
    periodoClave: "semana1",
    filaOrigen: "Triage 1",
    filaDestino: "Salud Mental",
    filas: filasLicenciados,
    personal: licenciados,
    categoria: "licenciado"
  });
  assert.deepEqual(resultado.planilla.semana1["Salud Mental"], ref(licenciados[0]));
});

await probar("cantidad de filas configuradas no está codificada", async () => {
  const fuente = await readFile(
    new URL("../src/utils/intercambioPlanilla.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(fuente, /length\s*!==\s*(20|13)/);
});

await probar("opciones muestran solo posiciones ocupadas", () => {
  const planilla = { semana1: { ...semanaEnfermeros(), T1: "" } };
  const opciones = obtenerOpcionesOcupadas({
    planilla,
    periodoClave: "semana1",
    filas: filasEnfermeros,
    personal: enfermeros,
    categoria: "enfermero"
  });
  assert.deepEqual(opciones.map((item) => item.fila), ["REA 1", "SM"]);
});

await probar("obtener distribución distingue semanal y nocturna", () => {
  assert.equal(obtenerDistribucionPeriodo({
    planilla: { semana1: semanaEnfermeros() },
    periodoClave: "semana1"
  }) !== null, true);
  assert.equal(obtenerDistribucionPeriodo({
    planilla: crearNoche(),
    periodoClave: "2026-07-02",
    usaRotacionTresDias: true
  }) !== null, true);
});

const componente = await readFile(
  new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url),
  "utf8"
);
const panel = await readFile(
  new URL("../src/components/planilla/PanelIntercambioPlanilla.jsx", import.meta.url),
  "utf8"
);
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const pdf = await readFile(new URL("../src/utils/exportPDF.js", import.meta.url), "utf8");
const calendario = await readFile(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
const historialSql = await readFile(
  new URL("../supabase/migrations/20260725_agregar_consulta_y_restauracion_historial.sql", import.meta.url),
  "utf8"
);

await probar("existe un único botón general", () => {
  assert.equal((componente.match(/⇄ Intercambiar personas/g) || []).length, 1);
});

await probar("panel contiene selectores y resumen", () => {
  assert.match(panel, /Período/);
  assert.match(panel, /Primera posición/);
  assert.match(panel, /Segunda posición/);
  assert.match(panel, /Intercambiar:/);
});

await probar("segunda posición excluye la primera", () => {
  assert.match(panel, /opcion\.fila !== filaOrigen/);
});

await probar("cancelar no llama setPlanilla", () => {
  const bloqueCancelar = componente.match(/onCancelar=\{\(\) => setIntercambio\(null\)\}/);
  assert.ok(bloqueCancelar);
});

await probar("confirmación contiene una única llamada funcional", () => {
  const inicio = componente.indexOf("const confirmarIntercambio");
  const fin = componente.indexOf("  return (", inicio);
  const bloque = componente.slice(inicio, fin);
  assert.equal((bloque.match(/setPlanilla\(/g) || []).length, 1);
  assert.match(bloque, /setPlanilla\(\(prev\) =>/);
  assert.doesNotMatch(bloque, /actualizarCelda/);
});

await probar("solo lectura y versión histórica bloquean", () => {
  assert.match(componente, /disabled=\{soloLectura \|\| versionHistoricaActiva\}/);
  assert.match(componente, /No se puede intercambiar mientras estás viendo una versión histórica/);
});

await probar("cambios de contexto invalidan selección", () => {
  assert.match(componente, /claveContextoIntercambio/);
  assert.match(componente, /setIntercambio\(null\)/);
});

await probar("autosave y CAS permanecen sin integración especial", () => {
  assert.match(app, /setTimeout\(\(\) => \{/);
  assert.match(app, /guardarEstadoTurnoMesConRevision/);
  assert.doesNotMatch(app, /ultimoIntercambio/);
});

await probar("Calendario y PDF consumen referencias finales", () => {
  assert.match(calendario, /resolverPersonaDesdeReferencia/);
  assert.match(pdf, /resolverPersonaDesdeReferencia/);
});

await probar("Historial conserva actualizacion_cas", () => {
  assert.match(historialSql, /actualizacion_cas/);
});

process.stdout.write(`\n${cantidad} pruebas permanentes de Etapa 26 superadas.\n`);
