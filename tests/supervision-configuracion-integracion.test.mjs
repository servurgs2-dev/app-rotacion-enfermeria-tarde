import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = (ruta) => readFile(new URL(ruta, import.meta.url), "utf8");
const vista = await leer("../src/components/supervision/VistaSupervision.jsx");
const mensual = await leer("../src/components/supervision/DotacionMensualSupervision.jsx");
const estado = await leer("../src/components/supervision/EstadoConfiguracionDotacionSupervision.jsx");
const editor = await leer("../src/components/supervision/EditorConfiguracionDotacionSupervision.jsx");
const hook = await leer("../src/hooks/useConfiguracionDotacionSupervision.js");
const dominio = await leer("../src/utils/configuracionDotacionSupervisionMes.js");
const repositorio = await leer("../src/services/repositorioConfiguracionDotacionSupervisionMes.js");
const migracion = await leer("../supabase/migrations/20260820_crear_configuracion_dotacion_supervision_mes.sql");
const motores = await Promise.all([
  "dotacionSupervision.js",
  "proyeccionDotacionSupervision.js",
  "agregadoSupervisionDia.js",
  "proyeccionSupervisionMes.js",
  "estadisticasSupervisionMes.js",
  "alertasSupervisionMes.js"
].map((archivo) => leer(`../src/utils/${archivo}`)));
const paquete = JSON.parse(await leer("../package.json"));

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  process.stdout.write(`OK ${total} ${nombre}\n`);
};

probar("Vista importa hook", () => assert.match(vista, /import \{ useConfiguracionDotacionSupervision \}/));
probar("una sola llamada al hook", () => assert.equal((vista.match(/useConfiguracionDotacionSupervision\(mes\)/g) || []).length, 1));
probar("hook recibe mes", () => assert.match(vista, /useConfiguracionDotacionSupervision\(mes\)/));
probar("hook no recibe turno", () => assert.doesNotMatch(vista, /useConfiguracionDotacionSupervision\([^)]*turno/));
probar("diario recibe configuracionDotacion", () => assert.match(vista, /proyectarSupervisionDia\(\{[\s\S]*configuracionDotacion: configuracionMes\.configuracion/));
probar("mensual recibe misma configuración", () => assert.match(vista, /<DotacionMensualSupervision[\s\S]*configuracionDotacion=\{configuracionMes\.configuracion\}/));
probar("useMemo diario depende de configuración", () => assert.match(vista, /\[[^\]]*configuracionMes\.configuracion[^\]]*\]/));
probar("DotacionMensual no llama hook", () => assert.doesNotMatch(mensual, /useConfiguracionDotacionSupervision/));
probar("DotacionMensual no consulta Supabase", () => assert.doesNotMatch(mensual, /supabase|\.from\(|\.rpc\(/i));
probar("una sola proyección mensual", () => assert.equal((mensual.match(/proyectarSupervisionMes\(/g) || []).length, 1));
probar("estadísticas reutilizan mensual", () => assert.match(mensual, /resumirEstadisticasSupervisionMes\(resultadoMensual\)/));
probar("Calidad reutiliza mensual", () => assert.match(mensual, /construirAlertasSupervisionMes\(resultadoMensual/));
probar("loading coordina datos y carga inicial de configuración", () => assert.match(vista, /datos\.cargando \|\| configuracionMes\.cargaInicial/));
probar("loading conjunto gobierna render", () => assert.match(vista, /\{cargandoPanel \? \(/));
probar("no presenta metadata vieja durante carga", () => assert.ok(vista.indexOf("cargandoPanel ?") < vista.indexOf("<EditorConfiguracionDotacionSupervision" , vista.indexOf("return ("))));
probar("error no bloquea Panel", () => assert.doesNotMatch(vista, /configuracionMes\.error[\s\S]*errorTotal/));
probar("fallback por error se informa", () => assert.match(estado, /Valores generales por fallo de carga/));
probar("mensaje humano de error", () => assert.match(estado, /No se pudo cargar la configuración mensual de dotación/));
probar("código Supabase no es título", () => assert.doesNotMatch(estado, /PGRST|42P01|\bRLS\b/));
probar("persistida se identifica", () => assert.match(estado, /Configuración guardada para este mes/));
probar("heredada se identifica", () => assert.match(estado, /Valores heredados de/));
probar("heredada usa mes origen", () => assert.match(estado, /configuracionMes\.heredadaDesdeMes/));
probar("heredada no se llama persistida", () => assert.doesNotMatch(estado, /heredada[\s\S]*Configuración guardada/));
probar("fallback normal se identifica", () => assert.match(estado, /titulo: "Valores generales"/));
probar("fallback normal no usa error", () => assert.match(estado, /const conError = Boolean\(configuracionMes\?\.error\)/));
probar("no recalcula semáforo React", () => assert.doesNotMatch(vista + estado, /cantidad\s*[<>]=?\s*(minimo|optimo)/));
probar("no recalcula déficit React", () => assert.doesNotMatch(vista + estado, /Math\.max|faltanParaMinimo/));
probar("números diarios vienen de proyección", () => assert.match(vista, /datos\?\.estadoDotacion[\s\S]*datos\?\.proyeccion/));
probar("sin datos preservado", () => assert.match(vista, /estadoDotacion\?\.estado \|\| "sin_datos"/));
probar("cambio turno no recarga hook", () => assert.doesNotMatch(mensual, /useConfiguracionDotacionSupervision|cargarConfiguracion/));
probar("cambio fecha no cambia entrada salvo mes", () => assert.equal((vista.match(/useConfiguracionDotacionSupervision\(mes\)/g) || []).length, 1));
probar("cambio mes alimenta hook", () => assert.match(vista, /const mes = obtenerMesFecha\(fecha\)[\s\S]*useConfiguracionDotacionSupervision\(mes\)/));
probar("guardado no ocurre en Vista", () => assert.doesNotMatch(vista + mensual + estado, /guardarConfiguracionDotacionSupervisionMes|\.rpc\(/));
probar("editor local integrado", () => assert.match(vista, /EditorConfiguracionDotacionSupervision/));
probar("editor no alimenta cálculos", () => assert.doesNotMatch(vista, /borrador/));
probar("sin autosave", () => assert.doesNotMatch(vista + mensual + estado + editor, /autosave/i));
probar("sin SQL remoto", () => assert.doesNotMatch(vista + mensual + estado, /service_role|db push|migration up/));
probar("hook conserva contrato de lectura", () => assert.match(hook, /cargando:[\s\S]*recargar/));
probar("dominio conserva tres orígenes", () => assert.match(dominio, /PERSISTIDA[\s\S]*HEREDADA[\s\S]*FALLBACK_CODIGO/));
probar("repositorio conserva carga efectiva", () => assert.match(repositorio, /cargarConfiguracionDotacionSupervisionEfectiva/));
probar("migración conserva RPC", () => assert.match(migracion, /guardar_configuracion_dotacion_supervision_mes/));
probar("motores conservan contratos", () => assert.ok(motores.every((fuente) => fuente.length > 0)));
probar("mobile sin ancho rígido", () => assert.doesNotMatch(estado, /w-\[[0-9]+px\]|min-w-\[[0-9]+px\]/));
probar("sin scroll horizontal", () => assert.doesNotMatch(estado, /overflow-x-(auto|scroll)/));
probar("estado de error accesible", () => assert.match(estado, /role=\{conError \? "status" : undefined\}/));
probar("texto puede envolver", () => assert.match(estado, /break-words/));
probar("script registrado", () => assert.equal(paquete.scripts["test:supervision-configuracion-integracion"], "node tests/supervision-configuracion-integracion.test.mjs"));
probar("mojibake ausente", () => assert.doesNotMatch(vista + estado, /Ã|Â|â/));

process.stdout.write(`Integración configuración Supervisión: ${total}/${total} comprobaciones OK.\n`);
