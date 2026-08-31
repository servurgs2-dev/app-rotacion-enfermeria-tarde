import assert from "node:assert/strict";
import fs from "node:fs";
import {
  obtenerMensajeErrorVigenciasTurnoPropio,
  prepararEditorVigenciasTurnoPropio
} from "../src/utils/editorVigenciasTurnoPropio.js";
import { validarRangosTurnoPropio } from "../src/utils/vigenciasTurnoPersonal.js";

const lista = fs.readFileSync("src/components/personal/ListaPersonal.jsx", "utf8");
const editor = fs.readFileSync("src/components/personal/EditorVigenciasTurnoPropio.jsx", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");
const hook = fs.readFileSync("src/hooks/usePadronVigenciasPersonalMes.js", "utf8");
const wrapper = fs.readFileSync("src/services/vigenciasTurnoPersonal.js", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

const persona = { personaId: "p-1", turnoFuente: "manana", revision: "0" };
const explicita = {
  ...persona,
  origen: "explicita",
  existeConfiguracionExplicita: true,
  revision: "7",
  vigencias: [
    { personaId: "p-1", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-15" },
    { personaId: "p-1", mes: "2026-09", turno: "tarde", desde: "2026-09-16", hasta: "2026-09-30" }
  ]
};

probar("Licenciado activo ve acción editar", () => {
  assert.match(lista, /perfilValido\?\.activo[\s\S]*ROLES_APLICACION\.LICENCIADO/);
  assert.match(lista, />\s*Editar mi turno\s*</);
});
probar("Enfermería no cumple condición del editor", () => assert.doesNotMatch(lista,
  /ROLES_APLICACION\.ENFERMERIA[\s\S]*Editar mi turno/));
probar("Supervisión no usa editor parcial", () => {
  assert.match(lista, /puedeEditarVigenciasPropias[\s\S]*ROLES_APLICACION\.LICENCIADO/);
  assert.doesNotMatch(editor, /ROLES_APLICACION\.SUPERVISION|guardarVigenciasTurnoPersonaMes\s*\(/);
});
probar("histórico deshabilita acción", () => assert.match(lista,
  /disabled=\{modoHistorico \|\| vigenciasPersonal\?\.cargando/));
probar("turno editable proviene del perfil", () => assert.match(lista,
  /turnoPerfil=\{perfilValido\.turno\}/));
probar("turnoActivo no determina turno del editor", () => assert.doesNotMatch(editor, /turnoActivo/));
probar("identidad usa asegurarIdPersona", () => assert.match(lista,
  /asegurarIdPersona\(personaFisica\)\?\.id/));
probar("acción reutiliza personaId canónica", () => assert.match(lista,
  /setEditorVigencias\(\{ persona: asegurarIdPersona\(p\), personaId: personaIdVigencias \}\)/));

probar("primera configuración del turno fuente inicia mes completo", () => {
  const resultado = prepararEditorVigenciasTurnoPropio({
    mes: "2026-09", turnoPerfil: "manana",
    entrada: { ...persona, origen: "legacy_implicita", existeConfiguracionExplicita: false, vigencias: [] }
  });
  assert.equal(resultado.editable, true);
  assert.deepEqual(resultado.rangos, [{ desde: "2026-09-01", hasta: "2026-09-30" }]);
  assert.equal(resultado.revision, "0");
});
probar("primera configuración desde otro turno queda bloqueada", () => {
  const resultado = prepararEditorVigenciasTurnoPropio({
    mes: "2026-09", turnoPerfil: "tarde",
    entrada: { ...persona, origen: "legacy_implicita", existeConfiguracionExplicita: false, vigencias: [] }
  });
  assert.equal(resultado.editable, false);
  assert.equal(resultado.codigo, "CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE");
});
probar("explícita sin rango propio permite comenzar vacía", () => {
  const resultado = prepararEditorVigenciasTurnoPropio({
    mes: "2026-09", turnoPerfil: "noche", entrada: explicita
  });
  assert.equal(resultado.editable, true);
  assert.deepEqual(resultado.rangos, []);
  assert.equal(resultado.revision, "7");
});
probar("sólo rangos propios entran al borrador", () => {
  const resultado = prepararEditorVigenciasTurnoPropio({
    mes: "2026-09", turnoPerfil: "tarde", entrada: explicita
  });
  assert.deepEqual(resultado.rangos, [{ desde: "2026-09-16", hasta: "2026-09-30" }]);
});
probar("RPC no recibe turno", () => {
  assert.match(editor, /guardarVigenciasTurnoPersonaMesTurnoPropio\(\{[\s\S]*mes,[\s\S]*personaId,[\s\S]*rangos: validacion\.rangos,[\s\S]*revisionEsperada/);
  assert.doesNotMatch(editor, /guardarVigenciasTurnoPersonaMesTurnoPropio\(\{[\s\S]*turno:/);
});
probar("rangos ajenos no se envían al service", () => assert.doesNotMatch(editor,
  /rangos:\s*inicial\.rangosAjenos/));
probar("múltiples rangos y huecos son válidos", () => assert.equal(validarRangosTurnoPropio({
  mes: "2026-09",
  rangos: [
    { desde: "2026-09-01", hasta: "2026-09-05" },
    { desde: "2026-09-10", hasta: "2026-09-15" }
  ]
}).valido, true));
probar("solapamiento queda bloqueado", () => assert.equal(validarRangosTurnoPropio({
  mes: "2026-09",
  rangos: [
    { desde: "2026-09-01", hasta: "2026-09-10" },
    { desde: "2026-09-10", hasta: "2026-09-15" }
  ]
}).valido, false));
probar("fecha fuera del mes queda bloqueada", () => assert.equal(validarRangosTurnoPropio({
  mes: "2026-09", rangos: [{ desde: "2026-10-01", hasta: "2026-10-02" }]
}).valido, false));
probar("array vacío es válido para explícita", () => assert.equal(validarRangosTurnoPropio({
  mes: "2026-09", rangos: []
}).valido, true));
probar("componente usa service y no repository", () => {
  assert.match(editor, /services\/vigenciasTurnoPersonal\.js/);
  assert.doesNotMatch(editor, /repositorioVigenciasTurnoPersonal/);
});
probar("revisión cero para legacy y real para explícita", () => {
  assert.equal(prepararEditorVigenciasTurnoPropio({
    mes: "2026-09", turnoPerfil: "manana",
    entrada: { ...persona, origen: "legacy_implicita", vigencias: [] }
  }).revision, "0");
  assert.equal(prepararEditorVigenciasTurnoPropio({
    mes: "2026-09", turnoPerfil: "manana", entrada: explicita
  }).revision, "7");
});
probar("CAS se informa y no reintenta", () => {
  assert.match(editor, /resultado\.conflicto[\s\S]*setConflicto\(true\)/);
  assert.equal((editor.match(/guardarVigenciasTurnoPersonaMesTurnoPropio\(/g) || []).length, 1);
});
probar("base y revisión quedan fijadas al abrir el editor", () => {
  assert.match(editor, /const \[inicial\] = useState\(\(\) => prepararEditorVigenciasTurnoPropio/);
  assert.match(lista, /key=\{`\$\{mesActivo\}\|\$\{editorVigencias\.personaId\}`\}/);
  assert.doesNotMatch(lista, /key=\{`[^`]*revision/);
});
probar("conflicto ofrece recarga explícita", () => assert.match(editor,
  /La configuración cambió mientras la estabas editando[\s\S]*Recargar/));
probar("éxito cierra y recarga", () => assert.match(editor,
  /onCerrar\(\);\s*onRecargar\(\);/));
probar("hook conserva protección stale", () => assert.match(hook,
  /solicitudRef\.current !== solicitud/));
probar("otros turnos son contexto de sólo lectura", () => assert.match(editor,
  /Otros turnos[\s\S]*Sólo lectura/));

probar("error de turno fuente tiene mensaje humano", () => assert.match(
  obtenerMensajeErrorVigenciasTurnoPropio(new Error("CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE")),
  /turno base|asignación mensual/i
));
probar("error de configuración vacía tiene mensaje humano", () => assert.match(
  obtenerMensajeErrorVigenciasTurnoPropio(new Error("CONFIGURACION_EXPLICITA_VACIA_NO_PERMITIDA")),
  /último período/i
));
probar("error de identidad tiene mensaje humano", () => assert.match(
  obtenerMensajeErrorVigenciasTurnoPropio(new Error("PERSONA_LEGACY_NO_IDENTIFICABLE")),
  /identificar|Supervisión/i
));
probar("UI no muestra JSON técnico", () => assert.doesNotMatch(editor,
  /<pre|persona_id|p_revision_esperada/));
probar("editor es compacto mobile-first", () => {
  assert.match(editor, /w-full max-w-lg/);
  assert.match(editor, /grid-cols-1[\s\S]*min-\[390px\]:grid-cols-2/);
  assert.doesNotMatch(editor, /min-w-\[[5-9]\d\dpx\]|w-\[[5-9]\d\dpx\]/);
});
probar("lista visible usa padrón y conserva el array físico para operaciones", () => {
  assert.match(lista, /const personalVisible = resolverPersonalMensualPorTurno/);
  assert.match(lista, /const filtrados = personalVisible\.filter/);
  assert.match(lista, /const personalFisicoPorId = new Map\(personal\.map/);
});
probar("App pasa perfil y el histórico cerrado central", () => {
  assert.match(app, /const mesHistoricoCerradoActivo = esMesHistoricoCerrado/);
  assert.match(app, /perfil=\{perfil\}[\s\S]*modoHistorico=\{mesHistoricoCerradoActivo\}/);
});
probar("Enfermería no monta editor y Supervisión usa componente separado", () => {
  assert.match(wrapper, /guardarVigenciasTurnoPersonaMesTurnoPropio/);
  assert.match(lista, /EditorVigenciasSupervision/);
  assert.doesNotMatch(editor, /EditorVigenciasSupervision/);
});
probar("Planilla Calendario y Supervisión no integran guardado parcial", () => {
  for (const archivo of [
    "src/components/planilla/PlanillaMensual.jsx",
    "src/components/calendario/CalendarioDiario.jsx",
    "src/components/supervision/VistaSupervision.jsx"
  ]) {
    assert.doesNotMatch(fs.readFileSync(archivo, "utf8"), /guardarVigenciasTurnoPersonaMesTurnoPropio/);
  }
});
probar("script específico registrado", () => assert.equal(
  packageJson.scripts["test:personal-vigencias-editor-turno-propio"],
  "node tests/personal-vigencias-editor-turno-propio.test.mjs"
));

console.log(`Editor vigencias turno propio: ${total}/${total} comprobaciones OK.`);
