import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  actualizarCampoBorradorDotacion,
  alternarValoresGeneralesTurno,
  configuracionesDotacionIguales,
  crearBorradorConfiguracionDotacion,
  esMesHistoricoSupervision,
  validarBorradorConfiguracionDotacion
} from "../src/utils/borradorConfiguracionDotacionSupervision.js";
import { crearConfiguracionDotacionFallback } from "../src/utils/configuracionDotacionSupervisionMes.js";

const leer = (ruta) => readFile(new URL(ruta, import.meta.url), "utf8");
const editor = await leer("../src/components/supervision/EditorConfiguracionDotacionSupervision.jsx");
const vista = await leer("../src/components/supervision/VistaSupervision.jsx");
const estado = await leer("../src/components/supervision/EstadoConfiguracionDotacionSupervision.jsx");
const paquete = JSON.parse(await leer("../package.json"));
const configuracionBase = crearConfiguracionDotacionFallback();

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  process.stdout.write(`OK ${total} ${nombre}\n`);
};

probar("componente editor existe", () => assert.match(editor, /function EditorConfiguracionDotacionSupervision/));
probar("Vista integra editor", () => assert.match(vista, /<EditorConfiguracionDotacionSupervision[\s\S]*configuracionMes=\{configuracionMes\}/));
probar("conserva bloque de origen", () => assert.match(editor, /<EstadoConfiguracionDotacionSupervision/));
probar("muestra Valores generales", () => assert.match(editor, /Valores generales/));
probar("muestra Configuración por turno", () => assert.match(editor, /Configuración por turno/));
probar("fallback central entrega LE 9 y 11", () => assert.deepEqual(configuracionBase.defaults.licenciado, { minimo: 9, optimo: 11 }));
probar("fallback central entrega AE 13 y 16", () => assert.deepEqual(configuracionBase.defaults.enfermero, { minimo: 13, optimo: 16 }));
probar("editor no hardcodea defaults", () => assert.doesNotMatch(editor, /minimo:\s*(9|13)|optimo:\s*(11|16)/));
probar("borrador copia configuración", () => assert.deepEqual(crearBorradorConfiguracionDotacion(configuracionBase), configuracionBase));
probar("borrador no comparte defaults", () => {
  const borrador = crearBorradorConfiguracionDotacion(configuracionBase);
  borrador.defaults.licenciado.minimo = 8;
  assert.equal(configuracionBase.defaults.licenciado.minimo, 9);
});
probar("edición local de general", () => {
  const borrador = actualizarCampoBorradorDotacion(crearBorradorConfiguracionDotacion(configuracionBase), {
    fuente: "default", categoria: "licenciado", campo: "minimo", valor: "8"
  });
  assert.equal(validarBorradorConfiguracionDotacion(borrador).configuracion.defaults.licenciado.minimo, 8);
});
probar("override sólo licenciado", () => {
  const borrador = alternarValoresGeneralesTurno(crearBorradorConfiguracionDotacion(configuracionBase), {
    turno: "noche", categoria: "licenciado", usarGenerales: false
  });
  assert.ok(borrador.overridesTurno.noche.licenciado);
  assert.equal(borrador.overridesTurno.noche.enfermero, undefined);
});
probar("override sólo enfermero", () => {
  const borrador = alternarValoresGeneralesTurno(crearBorradorConfiguracionDotacion(configuracionBase), {
    turno: "tarde", categoria: "enfermero", usarGenerales: false
  });
  assert.ok(borrador.overridesTurno.tarde.enfermero);
  assert.equal(borrador.overridesTurno.tarde.licenciado, undefined);
});
probar("Usar generales elimina override local", () => {
  const conOverride = alternarValoresGeneralesTurno(crearBorradorConfiguracionDotacion(configuracionBase), {
    turno: "noche", categoria: "licenciado", usarGenerales: false
  });
  const sinOverride = alternarValoresGeneralesTurno(conOverride, {
    turno: "noche", categoria: "licenciado", usarGenerales: true
  });
  assert.equal(sinOverride.overridesTurno.noche, undefined);
});
probar("override nace desde general del borrador", () => {
  const generalEditado = actualizarCampoBorradorDotacion(crearBorradorConfiguracionDotacion(configuracionBase), {
    fuente: "default", categoria: "licenciado", campo: "minimo", valor: "7"
  });
  const conOverride = alternarValoresGeneralesTurno(generalEditado, {
    turno: "manana", categoria: "licenciado", usarGenerales: false
  });
  assert.equal(conOverride.overridesTurno.manana.licenciado.minimo, "7");
});
probar("óptimo menor a mínimo inválido", () => {
  let borrador = crearBorradorConfiguracionDotacion(configuracionBase);
  borrador = actualizarCampoBorradorDotacion(borrador, { fuente: "default", categoria: "licenciado", campo: "minimo", valor: "12" });
  const validacion = validarBorradorConfiguracionDotacion(borrador);
  assert.equal(validacion.ok, false);
  assert.equal(validacion.erroresCampos["defaults.licenciado.optimo"], "El óptimo no puede ser menor que el mínimo.");
});
probar("negativo inválido", () => {
  const borrador = actualizarCampoBorradorDotacion(crearBorradorConfiguracionDotacion(configuracionBase), {
    fuente: "default", categoria: "licenciado", campo: "minimo", valor: "-1"
  });
  assert.equal(validarBorradorConfiguracionDotacion(borrador).ok, false);
});
probar("decimal inválido", () => {
  const borrador = actualizarCampoBorradorDotacion(crearBorradorConfiguracionDotacion(configuracionBase), {
    fuente: "default", categoria: "enfermero", campo: "optimo", valor: "15.5"
  });
  assert.equal(validarBorradorConfiguracionDotacion(borrador).ok, false);
});
probar("vacío inválido", () => {
  const borrador = actualizarCampoBorradorDotacion(crearBorradorConfiguracionDotacion(configuracionBase), {
    fuente: "default", categoria: "enfermero", campo: "minimo", valor: ""
  });
  assert.equal(validarBorradorConfiguracionDotacion(borrador).ok, false);
});
probar("configuración inicial sin cambios", () => assert.equal(
  configuracionesDotacionIguales(crearBorradorConfiguracionDotacion(configuracionBase), configuracionBase), true
));
probar("edición detecta cambios", () => {
  const borrador = actualizarCampoBorradorDotacion(crearBorradorConfiguracionDotacion(configuracionBase), {
    fuente: "default", categoria: "licenciado", campo: "minimo", valor: "8"
  });
  assert.equal(configuracionesDotacionIguales(borrador, configuracionBase), false);
});
probar("mismo valor textual no es cambio semántico", () => {
  const borrador = actualizarCampoBorradorDotacion(crearBorradorConfiguracionDotacion(configuracionBase), {
    fuente: "default", categoria: "licenciado", campo: "minimo", valor: "9"
  });
  assert.equal(configuracionesDotacionIguales(borrador, configuracionBase), true);
});
probar("estado Cambios sin guardar", () => assert.match(editor, /Cambios sin guardar/));
probar("estado Sin cambios", () => assert.match(editor, /Sin cambios/));
probar("Descartar restaura desde cargada", () => assert.match(editor, /setBorrador\(crearBorradorConfiguracionDotacion\(configuracionCargada\)\)/));
probar("reinicia al cambiar mes", () => assert.match(vista, /key=\{configuracionMes\.mes\}/));
probar("recarga del mismo mes no remonta por revisión", () => assert.doesNotMatch(vista, /key=\{`\$\{configuracionMes\.mes\}:\$\{configuracionMes\.revision/));
probar("mes histórico Uruguay", () => assert.equal(esMesHistoricoSupervision("2026-07", new Date("2026-08-24T15:00:00Z")), true));
probar("mes actual editable", () => assert.equal(esMesHistoricoSupervision("2026-08", new Date("2026-08-24T15:00:00Z")), false));
probar("mes futuro editable", () => assert.equal(esMesHistoricoSupervision("2026-09", new Date("2026-08-24T15:00:00Z")), false));
probar("histórico informa solo lectura", () => assert.match(editor, /Los meses históricos son de solo lectura/));
probar("inputs históricos disabled", () => assert.match(editor, /disabled=\{soloLectura\}/));
probar("acciones históricas ocultas", () => assert.match(editor, /!soloLectura && conCambios/));
probar("labels reales", () => assert.match(editor, /<label htmlFor=\{id\}/));
probar("errores asociados", () => assert.match(editor, /aria-describedby=\{error/));
probar("selector turno accesible", () => assert.match(editor, /aria-pressed=\{turnoSeleccionado === turno\}/));
probar("checkbox accesible", () => assert.match(editor, /type="checkbox"[\s\S]*checked=\{usarGenerales\}/));
probar("sin ancho rígido", () => assert.doesNotMatch(editor, /w-\[[0-9]+px\]|min-w-\[[0-9]+px\]/));
probar("sin scroll horizontal", () => assert.doesNotMatch(editor, /overflow-x-(auto|scroll)/));
probar("Guardar se conecta por servicio", () => assert.match(editor, /guardarConfiguracionDotacionSupervisionMes\(preparacion\)/));
probar("sin RPC", () => assert.doesNotMatch(editor + vista, /guardar_configuracion_dotacion_supervision_mes|\.rpc\(/));
probar("sin autosave", () => assert.doesNotMatch(editor + vista, /autosave/i));
probar("cálculo diario conserva configuración cargada", () => assert.match(vista, /configuracionDotacion: configuracionMes\.configuracion/));
probar("cálculo mensual conserva configuración cargada", () => assert.match(vista, /configuracionDotacion=\{configuracionMes\.configuracion\}/));
probar("borrador no alimenta cálculos", () => assert.doesNotMatch(vista, /borrador/));
probar("orígenes informativos preservados", () => assert.match(estado, /persistida[\s\S]*fallback_codigo[\s\S]*heredada/));
probar("script registrado", () => assert.equal(paquete.scripts["test:supervision-editor-umbrales"], "node tests/supervision-editor-umbrales.test.mjs"));
probar("mojibake ausente", () => assert.doesNotMatch(editor, /Ã|Â|â/));

process.stdout.write(`Editor umbrales Supervisión: ${total}/${total} comprobaciones OK.\n`);
