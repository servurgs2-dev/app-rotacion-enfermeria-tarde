import assert from "node:assert/strict";
import fs from "node:fs";
import {
  resolverPadronVigenciasEfectivasMes,
  resolverPersonalMensualPorTurno
} from "../src/utils/padronVigenciasTurnoPersonal.js";

const lista = fs.readFileSync("src/components/personal/ListaPersonal.jsx", "utf8");
const hook = fs.readFileSync("src/hooks/usePadronVigenciasPersonalMes.js", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

const romina = { id: "P", nombre: "Romina", categoria: "enfermero" };
const estadosBase = {
  noche: { personal: [] },
  manana: { personal: [romina] },
  tarde: { personal: [] },
  vespertino: { personal: [] }
};
const resolver = (configuracionesExplicitas = []) => resolverPadronVigenciasEfectivasMes({
  mes: "2026-09", estadosPorTurno: estadosBase, configuracionesExplicitas
});
const visibles = (padron, turno, personalFisico = estadosBase[turno].personal) =>
  resolverPersonalMensualPorTurno({ padron, turno, personalFisico });
const ids = (personas) => personas.map(({ personaId }) => personaId);

probar("legacy Mañana sólo aparece en Mañana", () => {
  const padron = resolver();
  assert.deepEqual(ids(visibles(padron, "manana")), ["P"]);
  assert.deepEqual(ids(visibles(padron, "tarde")), []);
});

const configuracionRomina = [{
  existe: true,
  personaId: "P",
  mes: "2026-09",
  revision: "2",
  vigencias: [
    { personaId: "P", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-19" },
    { personaId: "P", mes: "2026-09", turno: "tarde", desde: "2026-09-20", hasta: "2026-09-30" }
  ]
}];

probar("Romina aparece en Mañana y Tarde", () => {
  const padron = resolver(configuracionRomina);
  assert.deepEqual(ids(visibles(padron, "manana")), ["P"]);
  assert.deepEqual(ids(visibles(padron, "tarde")), ["P"]);
});
probar("misma identidad aparece máximo una vez por turno", () => {
  const padron = resolver(configuracionRomina);
  assert.equal(visibles(padron, "manana").filter((item) => item.personaId === "P").length, 1);
  assert.equal(visibles(padron, "tarde").filter((item) => item.personaId === "P").length, 1);
});
probar("explícita Tarde mes completo reemplaza legacy Mañana", () => {
  const padron = resolver([{ ...configuracionRomina[0], vigencias: [
    { personaId: "P", mes: "2026-09", turno: "tarde", desde: "2026-09-01", hasta: "2026-09-30" }
  ] }]);
  assert.deepEqual(ids(visibles(padron, "manana")), []);
  assert.deepEqual(ids(visibles(padron, "tarde")), ["P"]);
});
probar("dos rangos del mismo turno no duplican", () => {
  const padron = resolver([{ ...configuracionRomina[0], vigencias: [
    { personaId: "P", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-10" },
    { personaId: "P", mes: "2026-09", turno: "manana", desde: "2026-09-20", hasta: "2026-09-30" }
  ] }]);
  assert.deepEqual(ids(visibles(padron, "manana")), ["P"]);
});
probar("tres turnos producen tres pertenencias mensuales", () => {
  const padron = resolver([{ ...configuracionRomina[0], vigencias: [
    { personaId: "P", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-10" },
    { personaId: "P", mes: "2026-09", turno: "tarde", desde: "2026-09-11", hasta: "2026-09-20" },
    { personaId: "P", mes: "2026-09", turno: "noche", desde: "2026-09-21", hasta: "2026-09-30" }
  ] }]);
  assert.deepEqual(["manana", "tarde", "noche"].map((turno) => ids(visibles(padron, turno))), [["P"], ["P"], ["P"]]);
});
probar("huecos no generan ni eliminan pertenencia mensual", () => {
  const padron = resolver([{ ...configuracionRomina[0], vigencias: [
    { personaId: "P", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-10" },
    { personaId: "P", mes: "2026-09", turno: "tarde", desde: "2026-09-20", hasta: "2026-09-30" }
  ] }]);
  assert.deepEqual(ids(visibles(padron, "manana")), ["P"]);
  assert.deepEqual(ids(visibles(padron, "tarde")), ["P"]);
});
probar("personaId permanece estable", () => {
  const resultado = visibles(resolver(configuracionRomina), "tarde")[0];
  assert.equal(resultado.personaId, "P");
  assert.equal(resultado.persona.id, "P");
});
probar("homónimos con IDs distintos permanecen separados", () => {
  const p2 = { id: "P2", nombre: "Romina", categoria: "enfermero" };
  const padron = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: { ...estadosBase, manana: { personal: [romina, p2] } },
    configuracionesExplicitas: configuracionRomina
  });
  assert.deepEqual(ids(resolverPersonalMensualPorTurno({ padron, turno: "tarde", personalFisico: [] })), ["P"]);
});
probar("identidad inválida conserva su turnoFuente", () => {
  const padron = {
    mes: "2026-09",
    personas: [{ personaId: "P", persona: romina, turnoFuente: "manana", origen: "configuracion_invalida", invalida: true, vigencias: [] }],
    porPersonaId: {}, invalidasPorPersonaId: { P: "CONFIGURACION_EXPLICITA_DUPLICADA" }
  };
  assert.deepEqual(ids(visibles(padron, "manana")), ["P"]);
  assert.deepEqual(ids(visibles(padron, "tarde", [])), []);
});
probar("helper no muta padrón ni personal físico", () => {
  const padron = resolver(configuracionRomina);
  const copiaPadron = structuredClone(padron);
  const fisico = structuredClone(estadosBase.manana.personal);
  const copiaFisico = structuredClone(fisico);
  visibles(padron, "manana", fisico)[0].persona.nombre = "Cambio local";
  assert.deepEqual(padron, copiaPadron);
  assert.deepEqual(fisico, copiaFisico);
});
probar("helper no persiste copias", () => assert.doesNotMatch(
  fs.readFileSync("src/utils/padronVigenciasTurnoPersonal.js", "utf8"),
  /guardarEstado|supabase|\.insert\s*\(|\.update\s*\(/
));
probar("estados mensuales no se modifican", () => {
  const original = structuredClone(estadosBase);
  resolverPersonalMensualPorTurno({ padron: resolver(configuracionRomina), turno: "tarde", personalFisico: [] });
  assert.deepEqual(estadosBase, original);
});
probar("ListaPersonal usa colección mensual visible", () => {
  assert.match(lista, /const personalVisible = resolverPersonalMensualPorTurno/);
  assert.match(lista, /const filtrados = personalVisible\.filter/);
});
probar("persona física se detecta por identidad canónica", () => {
  assert.match(lista, /personalFisicoPorId = new Map\(personal\.map/);
  assert.match(lista, /asegurarIdPersona\(personaFisica\)\?\.id/);
  assert.doesNotMatch(lista, /personaFisica\?\.nombre ===/);
});
probar("aparición transversal conserva EditorVigencias", () => assert.match(lista,
  /!esFisicaEnTurnoVisualizado[\s\S]*Editar mi turno/));
probar("aparición transversal no ejecuta eliminación legacy", () => {
  assert.match(lista, /disabled=\{soloLectura \|\| !esFisicaEnTurnoVisualizado\}/);
  assert.match(lista, /if \(!esFisicaEnTurnoVisualizado\) return;[\s\S]*solicitarEliminarPersona\(personaOperacion\)/);
  assert.match(lista, /onEliminarPersona\(pendiente\.persona\)/);
});
probar("aparición transversal no edita identidad legacy", () => assert.equal(
  (lista.match(/disabled=\{soloLectura \|\| !esFisicaEnTurnoVisualizado\}/g) || []).length >= 7,
  true
));
probar("persona física conserva acciones actuales", () => {
  assert.match(lista, /const personaOperacion = personaFisica \|\| p/);
  assert.match(lista, /actualizarPersona\(personaOperacion/);
});
probar("nuevo padrón tras recarga cambia lista inmediatamente", () => {
  assert.deepEqual(ids(visibles(resolver(), "tarde")), []);
  assert.deepEqual(ids(visibles(resolver(configuracionRomina), "tarde")), ["P"]);
  assert.match(hook, /const recargar = useCallback/);
});
probar("sin consultas adicionales ni N más uno", () => {
  assert.doesNotMatch(lista, /cargarVigenciasTurnoMes|cargarEstadosTurnosPorMes|supabase/);
  assert.equal((hook.match(/cargarVigenciasTurnoMes\(mes\)/g) || []).length, 1);
});
probar("pertenencia mensual no usa fecha diaria", () => {
  const codigo = fs.readFileSync("src/utils/padronVigenciasTurnoPersonal.js", "utf8");
  const bloque = codigo.slice(codigo.indexOf("export const resolverPersonalMensualPorTurno"));
  assert.doesNotMatch(bloque.split("export const resolverPertenenciaPersonaEnFecha")[0], /fechaActual|fechaSeleccionada|new Date/);
});
probar("Planilla no integra helper mensual", () => assert.doesNotMatch(
  fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8"),
  /resolverPersonalMensualPorTurno/
));
probar("Calendario no integra helper mensual", () => assert.doesNotMatch(
  fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8"),
  /resolverPersonalMensualPorTurno/
));
probar("caso Romina no crea copia física en Tarde", () => {
  const padron = resolver(configuracionRomina);
  const tardeFisico = estadosBase.tarde.personal;
  const resultado = visibles(padron, "tarde", tardeFisico);
  assert.equal(resultado[0].esFisicaEnTurnoVisualizado, false);
  assert.deepEqual(tardeFisico, []);
});
probar("script mensual registrado", () => assert.equal(
  packageJson.scripts["test:personal-padron-mensual-turnos"],
  "node tests/personal-padron-mensual-turnos.test.mjs"
));

console.log(`Personal padrón mensual por turnos: ${total}/${total} comprobaciones OK.`);
