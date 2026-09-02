import assert from "node:assert/strict";
import fs from "node:fs";
import {
  obtenerMensajeErrorVigenciasSupervision,
  prepararEditorVigenciasSupervision,
  validarBorradorVigenciasSupervision
} from "../src/utils/editorVigenciasSupervision.js";
import { resolverPersonalMensualPorTurno } from "../src/utils/padronVigenciasTurnoPersonal.js";

const lista = fs.readFileSync("src/components/personal/ListaPersonal.jsx", "utf8");
const editor = fs.readFileSync("src/components/personal/EditorVigenciasSupervision.jsx", "utf8");
const modalShell = fs.readFileSync("src/components/ui/ModalMobileShell.jsx", "utf8");
const editorPropio = fs.readFileSync("src/components/personal/EditorVigenciasTurnoPropio.jsx", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

const persona = { id: "p-romina", nombre: "Romina", categoria: "enfermero" };
const entradaLegacy = {
  personaId: "p-romina",
  persona,
  turnoFuente: "manana",
  origen: "legacy_implicita",
  existeConfiguracionExplicita: false,
  revision: "0",
  vigencias: []
};
const entradaExplicita = {
  ...entradaLegacy,
  origen: "explicita",
  existeConfiguracionExplicita: true,
  revision: "7",
  vigencias: [
    { personaId: "p-romina", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-19" },
    { personaId: "p-romina", mes: "2026-09", turno: "tarde", desde: "2026-09-20", hasta: "2026-09-30" }
  ]
};

probar("Supervisión ve Editar vigencias", () => {
  assert.match(lista, /ROLES_APLICACION\.SUPERVISION/);
  assert.match(lista, />\s*Editar vigencias\s*</);
});
probar("Licenciado conserva únicamente Editar mi turno", () => {
  assert.match(lista, /ROLES_APLICACION\.LICENCIADO/);
  assert.doesNotMatch(editorPropio, /guardarVigenciasTurnoPersonaMes\s*\(/);
});
probar("Enfermería no cumple ninguna condición de edición", () => assert.doesNotMatch(lista,
  /ROLES_APLICACION\.ENFERMERIA[\s\S]*setEditorVigencias/));
probar("histórico deshabilita Editar vigencias", () => assert.match(lista,
  /puedeEditarVigenciasCompletas[\s\S]*disabled=\{modoHistorico \|\| vigenciasPersonal\?\.cargando/));
probar("aparición transversal permite editor completo", () => {
  assert.match(lista, /!esFisicaEnTurnoVisualizado[\s\S]*puedeEditarVigenciasCompletas/);
  assert.doesNotMatch(lista, /puedeEditarVigenciasCompletas && esFisicaEnTurnoVisualizado/);
});
probar("acción reutiliza personaId canónico de entradaVisible", () => assert.match(lista,
  /personaIdVigencias = entradaVisible\.personaId[\s\S]*setEditorVigenciasSupervision\(\{[\s\S]*personaId: personaIdVigencias/));

probar("legacy inicia turnoFuente durante mes completo", () => {
  const inicial = prepararEditorVigenciasSupervision({ mes: "2026-09", entrada: entradaLegacy });
  assert.equal(inicial.editable, true);
  assert.equal(inicial.revision, "0");
  assert.deepEqual(inicial.rangos, [{ turno: "manana", desde: "2026-09-01", hasta: "2026-09-30" }]);
});
probar("explícita carga todos los rangos y revisión real", () => {
  const inicial = prepararEditorVigenciasSupervision({ mes: "2026-09", entrada: entradaExplicita });
  assert.equal(inicial.revision, "7");
  assert.equal(inicial.rangos.length, 2);
  assert.deepEqual(inicial.rangos.map(({ turno }) => turno), ["manana", "tarde"]);
});
probar("select ofrece los cuatro turnos", () => assert.match(editor,
  /Object\.entries\(TURNOS\)[\s\S]*option key=\{turnoId\} value=\{turnoId\}/));
probar("múltiples rangos y huecos son válidos", () => assert.equal(
  validarBorradorVigenciasSupervision({
    mes: "2026-09", personaId: "p-1", rangos: [
      { turno: "manana", desde: "2026-09-01", hasta: "2026-09-05" },
      { turno: "tarde", desde: "2026-09-10", hasta: "2026-09-15" }
    ]
  }).valido,
  true
));
probar("solapamiento global queda bloqueado", () => assert.equal(
  validarBorradorVigenciasSupervision({
    mes: "2026-09", personaId: "p-1", rangos: [
      { turno: "manana", desde: "2026-09-01", hasta: "2026-09-15" },
      { turno: "tarde", desde: "2026-09-15", hasta: "2026-09-30" }
    ]
  }).valido,
  false
));
probar("fecha fuera de mes queda bloqueada", () => assert.equal(
  validarBorradorVigenciasSupervision({
    mes: "2026-09", personaId: "p-1",
    rangos: [{ turno: "noche", desde: "2026-10-01", hasta: "2026-10-02" }]
  }).valido,
  false
));
probar("rangos contiguos no se fusionan", () => {
  const validacion = validarBorradorVigenciasSupervision({
    mes: "2026-09", personaId: "p-1", rangos: [
      { turno: "manana", desde: "2026-09-01", hasta: "2026-09-10" },
      { turno: "manana", desde: "2026-09-11", hasta: "2026-09-20" }
    ]
  });
  assert.equal(validacion.valido, true);
  assert.equal(validacion.vigencias.length, 2);
});
probar("guardado usa service completo y no repository", () => {
  assert.match(editor, /guardarVigenciasTurnoPersonaMes\(\{/);
  assert.doesNotMatch(editor, /repositorioVigenciasTurnoPersonal|\.rpc\(/);
});
probar("vigencias expandidas incluyen identidad mes y turno", () => {
  const resultado = validarBorradorVigenciasSupervision({
    mes: "2026-09", personaId: "p-1",
    rangos: [{ turno: "vespertino", desde: "2026-09-01", hasta: "2026-09-30" }]
  });
  assert.deepEqual(resultado.vigencias[0], {
    personaId: "p-1", mes: "2026-09", turno: "vespertino",
    desde: "2026-09-01", hasta: "2026-09-30"
  });
});
probar("revisión cero legacy y revisión real explícita", () => {
  assert.equal(prepararEditorVigenciasSupervision({ mes: "2026-09", entrada: entradaLegacy }).revision, "0");
  assert.equal(prepararEditorVigenciasSupervision({ mes: "2026-09", entrada: entradaExplicita }).revision, "7");
});
probar("revisión y base quedan fijadas al abrir", () => {
  assert.match(editor, /const \[inicial\] = useState\(\(\) => prepararEditorVigenciasSupervision/);
  assert.match(lista, /key=\{`\$\{mesActivo\}\|\$\{editorVigenciasSupervision\.personaId\}`\}/);
});
probar("CAS es visible y no tiene auto retry", () => {
  assert.match(editor, /resultado\.conflicto[\s\S]*setConflicto\(true\)/);
  assert.equal((editor.match(/guardarVigenciasTurnoPersonaMes\(/g) || []).length, 1);
  assert.match(editor, /La configuración cambió mientras la estabas editando/);
});
probar("guardado exitoso cierra y recarga", () => assert.match(editor,
  /const terminarConExito[\s\S]*onCerrar\(\);[\s\S]*onRecargar\(\);/));
probar("configuración vacía no se guarda", () => {
  assert.equal(validarBorradorVigenciasSupervision({ mes: "2026-09", personaId: "p-1", rangos: [] }).valido, false);
  assert.match(editor, /La configuración completa no puede quedar vacía/);
});
probar("existe acción Volver al padrón base", () => assert.match(editor, /Volver al padrón base/));
probar("fallback usa service eliminar y no guardar vacío", () => {
  assert.match(editor, /eliminarVigenciasTurnoPersonaMes\(\{/);
  assert.doesNotMatch(editor, /guardarVigenciasTurnoPersonaMes\(\{[\s\S]*vigencias:\s*\[\]/);
});
probar("fallback exige confirmación inline", () => {
  assert.match(editor, /confirmarFallback/);
  assert.match(editor, /role="alertdialog"/);
  assert.doesNotMatch(editor, /window\.confirm/);
});
probar("fallback usa revisión CAS fijada", () => assert.match(editor,
  /eliminarVigenciasTurnoPersonaMes\(\{[\s\S]*revisionEsperada: inicial\.revision/));
probar("fallback exitoso también recarga", () => assert.equal((editor.match(/terminarConExito\(\)/g) || []).length, 2));

probar("Romina Mañana y Tarde carga igual desde ambas apariciones", () => {
  for (const turno of ["manana", "tarde"]) {
    const visible = resolverPersonalMensualPorTurno({
      padron: { personas: [entradaExplicita], porPersonaId: { "p-romina": entradaExplicita }, diagnosticos: [] },
      turno,
      personalFisico: turno === "manana" ? [persona] : []
    });
    assert.equal(visible[0].personaId, "p-romina");
    assert.equal(prepararEditorVigenciasSupervision({ mes: "2026-09", entrada: entradaExplicita }).rangos.length, 2);
  }
});
probar("Romina puede cambiar a Mañana 01-15 y Tarde 16-30", () => {
  const resultado = validarBorradorVigenciasSupervision({
    mes: "2026-09",
    personaId: "p-romina",
    rangos: [
      { turno: "manana", desde: "2026-09-01", hasta: "2026-09-15" },
      { turno: "tarde", desde: "2026-09-16", hasta: "2026-09-30" }
    ]
  });
  assert.equal(resultado.valido, true);
  assert.equal(resultado.vigencias.every(({ personaId }) => personaId === "p-romina"), true);
});
probar("al volver al fallback Romina queda sólo en su base Mañana", () => {
  const padronLegacy = {
    personas: [entradaLegacy],
    porPersonaId: { "p-romina": entradaLegacy },
    diagnosticos: []
  };
  assert.equal(resolverPersonalMensualPorTurno({
    padron: padronLegacy, turno: "manana", personalFisico: [persona]
  }).length, 1);
  assert.equal(resolverPersonalMensualPorTurno({
    padron: padronLegacy, turno: "tarde", personalFisico: []
  }).length, 0);
});
probar("Tarde mes completo es configuración válida", () => assert.equal(
  validarBorradorVigenciasSupervision({
    mes: "2026-09", personaId: "p-romina",
    rangos: [{ turno: "tarde", desde: "2026-09-01", hasta: "2026-09-30" }]
  }).valido,
  true
));
probar("padrón base se muestra separado de vigencias", () => {
  assert.match(editor, /Padrón base:/);
  assert.doesNotMatch(editor, /Cambiar padrón base|setPersonal|turno destino/i);
});
probar("identidad inválida bloquea edición", () => {
  const inicial = prepararEditorVigenciasSupervision({ mes: "2026-09", entrada: { ...entradaLegacy, invalida: true } });
  assert.equal(inicial.editable, false);
  assert.match(editor, /No se puede editar esta configuración con seguridad/);
});
probar("mensajes remotos son humanos", () => {
  assert.match(obtenerMensajeErrorVigenciasSupervision(new Error("MES_HISTORICO_PROTEGIDO")), /históricos/i);
  assert.match(obtenerMensajeErrorVigenciasSupervision(new Error("PERMISO_SUPERVISION_REQUERIDO")), /permiso de Supervisión/i);
  assert.match(obtenerMensajeErrorVigenciasSupervision(new Error("SOLAPAMIENTO_VIGENCIAS")), /superponerse/i);
});
probar("UI no muestra JSON SQL ni RPC", () => assert.doesNotMatch(editor, /<pre|SQLERRM|p_revision|guardar_vigencias_turno/));
probar("editor es mobile-first", () => {
  assert.match(editor, /<ModalMobileShell/);
  assert.match(modalShell, /w-full[\s\S]+maxWidthClassName/);
  assert.match(editor, /grid-cols-1[\s\S]*min-\[390px\]:grid-cols-2/);
});
probar("acciones legacy transversales continúan bloqueadas", () => {
  assert.match(lista, /disabled=\{soloLectura \|\| !esFisicaEnTurnoVisualizado\}/);
  assert.match(lista, /if \(!esFisicaEnTurnoVisualizado\) return/);
});
probar("no modifica Planilla ni Calendario", () => {
  for (const archivo of [
    "src/components/planilla/PlanillaMensual.jsx",
    "src/components/calendario/CalendarioDiario.jsx"
  ]) {
    assert.doesNotMatch(fs.readFileSync(archivo, "utf8"), /EditorVigenciasSupervision|guardarVigenciasTurnoPersonaMes/);
  }
});
probar("no implementa cambio de padrón base", () => {
  assert.doesNotMatch(editor + lista, /mover_persona_padron|moverPersonaPadron|Cambiar padrón base/);
});
probar("script específico está registrado", () => assert.equal(
  packageJson.scripts["test:personal-vigencias-editor-supervision"],
  "node tests/personal-vigencias-editor-supervision.test.mjs"
));

console.log(`Editor vigencias Supervisión: ${total}/${total} comprobaciones OK.`);
