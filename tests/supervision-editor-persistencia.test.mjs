import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  actualizarCampoBorradorDotacion,
  crearBorradorConfiguracionDotacion,
  crearFuenteEdicionConfiguracionDotacion,
  mensajeHumanoErrorGuardadoConfiguracionDotacion,
  prepararGuardadoBorradorConfiguracionDotacion,
  resolverSincronizacionEditorConfiguracionDotacion,
  resolverRevisionEsperadaConfiguracionDotacion
} from "../src/utils/borradorConfiguracionDotacionSupervision.js";
import { crearConfiguracionDotacionFallback } from "../src/utils/configuracionDotacionSupervisionMes.js";
import { interpretarRespuestaGuardadoConfiguracionDotacion } from "../src/services/repositorioConfiguracionDotacionSupervisionMes.js";

const leer = (ruta) => readFile(new URL(ruta, import.meta.url), "utf8");
const editor = await leer("../src/components/supervision/EditorConfiguracionDotacionSupervision.jsx");
const vista = await leer("../src/components/supervision/VistaSupervision.jsx");
const wrapper = await leer("../src/services/configuracionDotacionSupervisionMes.js");
const repositorio = await leer("../src/services/repositorioConfiguracionDotacionSupervisionMes.js");
const hook = await leer("../src/hooks/useConfiguracionDotacionSupervision.js");
const paquete = JSON.parse(await leer("../package.json"));
const base = crearConfiguracionDotacionFallback();
const editado = actualizarCampoBorradorDotacion(crearBorradorConfiguracionDotacion(base), {
  fuente: "default",
  categoria: "licenciado",
  campo: "minimo",
  valor: "8"
});

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  process.stdout.write(`OK ${total} ${nombre}\n`);
};

probar("persistida usa revisión actual", () => assert.equal(
  resolverRevisionEsperadaConfiguracionDotacion({ origen: "persistida", revision: "7" }), "7"
));
probar("editor guarda contra revisión base capturada", () => assert.match(
  editor,
  /origen: fuenteActiva\.origen,[\s\S]*revision: fuenteActiva\.revision/
));
probar("heredada usa cero", () => assert.equal(
  resolverRevisionEsperadaConfiguracionDotacion({ origen: "heredada", revision: "21" }), "0"
));
probar("fallback usa cero", () => assert.equal(
  resolverRevisionEsperadaConfiguracionDotacion({ origen: "fallback_codigo", revision: "0" }), "0"
));
probar("payload persistido es numérico", () => {
  const preparado = prepararGuardadoBorradorConfiguracionDotacion({
    mes: "2026-08", origen: "persistida", revision: "3", borrador: editado,
    configuracionInicial: base, ahora: new Date("2026-08-24T15:00:00Z")
  });
  assert.equal(preparado.ok, true);
  assert.equal(preparado.revisionEsperada, "3");
  assert.equal(preparado.configuracion.defaults.licenciado.minimo, 8);
  assert.equal(typeof preparado.configuracion.defaults.licenciado.minimo, "number");
});
probar("payload contiene sólo contrato materializado", () => {
  const preparado = prepararGuardadoBorradorConfiguracionDotacion({
    mes: "2026-09", origen: "heredada", revision: "0", borrador: editado,
    configuracionInicial: base, ahora: new Date("2026-08-24T15:00:00Z")
  });
  assert.deepEqual(Object.keys(preparado.configuracion), ["defaults", "overridesTurno"]);
});
probar("sin cambios no prepara RPC", () => assert.equal(
  prepararGuardadoBorradorConfiguracionDotacion({
    mes: "2026-08", origen: "persistida", revision: "2",
    borrador: crearBorradorConfiguracionDotacion(base), configuracionInicial: base,
    ahora: new Date("2026-08-24T15:00:00Z")
  }).codigo,
  "SIN_CAMBIOS"
));
probar("borrador inválido no prepara RPC", () => {
  const invalido = actualizarCampoBorradorDotacion(editado, {
    fuente: "default", categoria: "enfermero", campo: "minimo", valor: ""
  });
  assert.equal(prepararGuardadoBorradorConfiguracionDotacion({
    mes: "2026-08", origen: "persistida", revision: "2", borrador: invalido,
    configuracionInicial: base, ahora: new Date("2026-08-24T15:00:00Z")
  }).codigo, "CONFIGURACION_INVALIDA");
});
probar("mes histórico cerrado no prepara RPC", () => assert.equal(
  prepararGuardadoBorradorConfiguracionDotacion({
    mes: "2026-06", origen: "persistida", revision: "2", borrador: editado,
    configuracionInicial: base, ahora: new Date("2026-08-24T15:00:00Z")
  }).codigo,
  "MES_HISTORICO_PROTEGIDO"
));
probar("mes anterior inmediato conserva preparación", () => assert.equal(
  prepararGuardadoBorradorConfiguracionDotacion({
    mes: "2026-07", origen: "persistida", revision: "2", borrador: editado,
    configuracionInicial: base, ahora: new Date("2026-08-24T15:00:00Z")
  }).ok,
  true
));
probar("éxito RPC se interpreta", () => assert.deepEqual(
  interpretarRespuestaGuardadoConfiguracionDotacion({
    resultado: "guardado", mes: "2026-08", revision: "4", updated_at: "fecha"
  }),
  { ok: true, conflicto: false, mes: "2026-08", revision: "4", updatedAt: "fecha" }
));
const conflicto = interpretarRespuestaGuardadoConfiguracionDotacion({
  resultado: "conflicto", codigo: "REVISION_CONFLICTO", existe: true,
  mes: "2026-08", revision: "5", updated_at: "fecha", configuracion: base
});
probar("conflicto CAS se interpreta", () => assert.deepEqual(
  [conflicto.ok, conflicto.conflicto, conflicto.codigo],
  [false, true, "REVISION_CONFLICTO"]
));
probar("conflicto conserva versión remota", () => assert.deepEqual(conflicto.configuracionActual, base));
probar("wrapper expone guardado existente", () => assert.match(wrapper, /guardarConfiguracionDotacionSupervisionMes/));
probar("componente no llama Supabase directo", () => assert.doesNotMatch(editor, /supabase|\.rpc\(/i));
probar("repositorio usa RPC correcta", () => assert.match(repositorio, /cliente\.rpc\(RPC_GUARDADO/));
probar("repositorio no escribe tabla directo", () => assert.doesNotMatch(repositorio, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(/));
probar("botón Guardar aparece", () => assert.match(editor, />\s*\{guardando \? "Guardando…" : "Guardar configuración"\}\s*</));
probar("botón usa disabled real", () => assert.match(editor, /disabled=\{!puedeGuardar\}/));
probar("sin cambios deshabilita", () => assert.match(editor, /const puedeGuardar = !soloLectura && conCambios && validacion\.ok/));
probar("inválido deshabilita", () => assert.match(editor, /conCambios && validacion\.ok/));
probar("histórico deshabilita", () => assert.match(editor, /puedeGuardar = !soloLectura/));
probar("guardando deshabilita", () => assert.match(editor, /!guardando/));
probar("recargando deshabilita", () => assert.match(editor, /!configuracionMes\.recargando/));
probar("doble submit bloqueado", () => assert.match(editor, /if \(guardando\) return/));
probar("guardado recibe preparación normalizada", () => assert.match(editor, /guardarConfiguracionDotacionSupervisionMes\(preparacion\)/));
probar("éxito recarga hook", () => assert.match(editor, /Configuración guardada\.[\s\S]*configuracionMes\.recargar\(\)/));
probar("éxito no modifica tablero manualmente", () => assert.doesNotMatch(editor, /proyectarSupervision|estadoDotacion|resultadoMensual/));
probar("conflicto no reintenta", () => assert.equal((editor.match(/guardarConfiguracionDotacionSupervisionMes\(preparacion\)/g) || []).length, 1));
probar("conflicto conserva borrador", () => assert.match(editor, /if \(resultado\.conflicto\) \{\s*setConflicto\(resultado\);\s*return/));
probar("conflicto tiene mensaje humano", () => assert.match(editor, /La configuración cambió mientras la estabas editando/));
probar("cargar reciente recarga", () => assert.match(editor, /const cargarVersionReciente[\s\S]*configuracionMes\.recargar\(\)/));
probar("cargar reciente usa configuración remota", () => assert.match(editor, /conflicto\?\.configuracionActual \|\| configuracionCargada/));
probar("seguir revisando no cambia borrador", () => {
  const cuerpo = editor.match(/const seguirRevisando = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  assert.doesNotMatch(cuerpo, /setBorrador|recargar\(|guardarConfiguracion/);
});
const fuenteRevision3 = crearFuenteEdicionConfiguracionDotacion({
  origen: "persistida", revision: "3", configuracion: base
});
const configuracionRevision4 = structuredClone(base);
configuracionRevision4.defaults.enfermero.minimo = 14;
const fuenteRevision4 = crearFuenteEdicionConfiguracionDotacion({
  origen: "persistida", revision: "4", configuracion: configuracionRevision4
});
probar("actualización incidental conserva borrador", () => {
  const sincronizacion = resolverSincronizacionEditorConfiguracionDotacion({
    fuenteBase: fuenteRevision3,
    borrador: editado,
    fuenteEntrante: fuenteRevision4
  });
  assert.equal(sincronizacion.fuenteActiva.revision, "3");
  assert.equal(sincronizacion.borradorActivo.defaults.licenciado.minimo, "8");
  assert.equal(sincronizacion.actualizacionRemotaPendiente, true);
});
probar("actualización incidental no adopta revisión live", () => {
  const cuerpoGuardar = editor.match(/const guardar = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  assert.doesNotMatch(cuerpoGuardar, /origen: configuracionMes\.origen|revision: configuracionMes\.revision/);
});
probar("recarga sin cambios adopta fuente nueva", () => {
  const sincronizacion = resolverSincronizacionEditorConfiguracionDotacion({
    fuenteBase: fuenteRevision3,
    borrador: base,
    fuenteEntrante: fuenteRevision4
  });
  assert.equal(sincronizacion.fuenteActiva.revision, "4");
  assert.equal(sincronizacion.borradorActivo.defaults.enfermero.minimo, 14);
});
probar("fuente protegida no vuelve a versión vieja", () => {
  const sincronizacion = resolverSincronizacionEditorConfiguracionDotacion({
    fuenteBase: fuenteRevision4,
    borrador: configuracionRevision4,
    fuenteEntrante: fuenteRevision3,
    protegerFuente: true
  });
  assert.equal(sincronizacion.fuenteActiva.revision, "4");
});
probar("no sincroniza estado durante render", () => {
  const inicio = editor.indexOf("function EditorConfiguracionDotacionSupervision");
  const fin = editor.indexOf("const limpiarFeedbackEdicion", inicio);
  const renderPreparacion = editor.slice(inicio, fin);
  assert.doesNotMatch(renderPreparacion, /set(?:Borrador|FuenteEdicion|Feedback|Conflicto|ProtegerFuente)\(/);
});
probar("guardado espera recarga confirmada", () => assert.match(
  editor,
  /const fuenteRecargada = await configuracionMes\.recargar\(\)[\s\S]*setFuenteEdicion\(crearFuenteEdicionConfiguracionDotacion\(fuenteRecargada\)\)/
));
probar("aceptar conflicto protege fuente antes de recargar", () => assert.match(
  editor,
  /setFuenteEdicion\(fuenteRemota\)[\s\S]*setProtegerFuente\(true\)[\s\S]*configuracionMes\.recargar\(\)/
));
probar("fallo al recargar conflicto conserva fuente informada", () => {
  const bloque = editor.match(/const cargarVersionReciente = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  const catchRecarga = bloque.match(/\.catch\(\(\) => \{([\s\S]*?)\n      \}\);/)?.[1] || "";
  assert.doesNotMatch(catchRecarga, /setFuenteEdicion|setBorrador|setProtegerFuente\(false\)/);
});
probar("error conserva borrador", () => {
  const bloque = editor.match(/catch \(error\) \{([\s\S]*?)\n    \} finally/)?.[1] || "";
  assert.doesNotMatch(bloque, /setBorrador/);
});
probar("error de red humano", () => assert.equal(
  mensajeHumanoErrorGuardadoConfiguracionDotacion(new Error("fetch failed")),
  "No se pudo guardar la configuración. Intentá nuevamente."
));
probar("histórico humano", () => assert.match(
  mensajeHumanoErrorGuardadoConfiguracionDotacion(new Error("MES_HISTORICO_PROTEGIDO")),
  /solo lectura/
));
probar("permiso humano", () => assert.match(
  mensajeHumanoErrorGuardadoConfiguracionDotacion(new Error("PERMISO_SUPERVISION_REQUERIDO")),
  /permisos de Supervisión/
));
probar("configuración inválida humana", () => assert.match(
  mensajeHumanoErrorGuardadoConfiguracionDotacion(new Error("CONFIGURACION_INVALIDA")),
  /valores inválidos/
));
probar("revisión inválida humana", () => assert.match(
  mensajeHumanoErrorGuardadoConfiguracionDotacion(new Error("REVISION_ESPERADA_INVALIDA")),
  /validar la versión/
));
probar("aviso aplica a todo el mes", () => assert.match(editor, /Los cambios se aplicarán a todo el mes seleccionado/));
probar("feedback usa aria-live", () => assert.match(editor, /aria-live="polite"/));
probar("conflicto es accesible", () => assert.match(editor, /role="alert" tabIndex="-1"/));
probar("error recibe foco", () => assert.match(editor, /avisoRef\.current\?\.focus\(\)/));
probar("recarga mismo mes conserva editor", () => assert.match(vista, /key=\{configuracionMes\.mes\}/));
probar("recarga no bloquea todo el Panel", () => assert.match(vista, /datos\.cargando \|\| configuracionMes\.cargaInicial/));
probar("hook diferencia recarga", () => assert.match(hook, /recargando: recargando && tieneResultadoMes/));
probar("tablero sigue usando configuración efectiva", () => assert.match(vista, /configuracionDotacion: configuracionMes\.configuracion/));
probar("mensual sigue usando configuración efectiva", () => assert.match(vista, /configuracionDotacion=\{configuracionMes\.configuracion\}/));
probar("borrador no llega a Vista", () => assert.doesNotMatch(vista, /borrador/));
probar("sin autosave", () => {
  const efecto = editor.match(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[conflicto, feedback\]\);/)?.[1] || "";
  assert.doesNotMatch(editor, /autosave/i);
  assert.doesNotMatch(efecto, /guardarConfiguracion|recargar/);
});
probar("script registrado", () => assert.equal(
  paquete.scripts["test:supervision-editor-persistencia"],
  "node tests/supervision-editor-persistencia.test.mjs"
));
probar("sin mojibake", () => assert.doesNotMatch(editor + wrapper, /Ã|Â|â/));

process.stdout.write(`Persistencia editor Supervisión: ${total}/${total} comprobaciones OK.\n`);
