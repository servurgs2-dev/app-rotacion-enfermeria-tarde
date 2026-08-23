import assert from "node:assert/strict";
import fs from "node:fs";
import { TURNOS } from "../src/config/turnos.js";
import { proyectarSupervisionMes } from "../src/utils/proyeccionSupervisionMes.js";

const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const componente = leer("src/components/supervision/DotacionMensualSupervision.jsx");
const vista = leer("src/components/supervision/VistaSupervision.jsx");
const motorMensual = leer("src/utils/proyeccionSupervisionMes.js");
let total = 0;
const probar = (nombre, fn) => { fn(); total += 1; console.log(`OK ${total} ${nombre}`); };

const semanasVacias = () => Object.fromEntries(
  Array.from({ length: 6 }, (_, indice) => [`semana${indice + 1}`, {}])
);
const crearEstadoVacio = () => ({
  personal: [], licencias: [], certificaciones: [],
  planillas: { licenciados: semanasVacias(), enfermeros: semanasVacias() },
  calendario: {
    licenciados: { extras: {}, noDisponibles: {}, asistenciaDia: {} },
    enfermeros: { extras: {}, noDisponibles: {}, asistenciaDia: {} }
  }
});
const estados = Object.fromEntries(Object.keys(TURNOS).map((turno) => [turno, crearEstadoVacio()]));
const resultado = proyectarSupervisionMes({ mes: "2026-01", estadosPorTurno: estados, novedadesModernas: [] });
const celda = resultado.dias[0].turnos[Object.keys(TURNOS)[0]].licenciado;

probar("componente existe", () => assert.equal(fs.existsSync("src/components/supervision/DotacionMensualSupervision.jsx"), true));
probar("usa proyectarSupervisionMes", () => assert.match(componente, /proyectarSupervisionMes\(\{/));
probar("usa useMemo", () => assert.match(componente, /useMemo\(\(\) => proyectarSupervisionMes/));
probar("no llama proyectarSupervisionDia", () => assert.doesNotMatch(componente, /proyectarSupervisionDia/));
probar("título Dotación mensual", () => assert.match(componente, /Dotaci&oacute;n mensual/));
probar("usa mes global", () => assert.match(vista, /mes=\{mes\}/));
probar("usa fecha seleccionada", () => assert.match(vista, /fechaSeleccionada=\{fecha\}/));
probar("selector usa cuatro TURNOS", () => assert.equal(Object.keys(TURNOS).length, 4));
probar("no depende de turnoActivo", () => assert.doesNotMatch(componente, /turnoActivo/));
probar("selector no modifica turnoActivo", () => assert.doesNotMatch(componente, /setTurnoActivo/));
probar("Noche visible desde contrato", () => assert.equal(TURNOS.noche.nombre, "Noche"));
probar("Mañana visible desde contrato", () => assert.equal(TURNOS.manana.id, "manana"));
probar("Tarde visible desde contrato", () => assert.equal(TURNOS.tarde.nombre, "Tarde"));
probar("Vespertino visible desde contrato", () => assert.equal(TURNOS.vespertino.nombre, "Vespertino"));
probar("muestra Licenciados", () => assert.match(componente, /"Licenciados"/));
probar("muestra Enfermeros", () => assert.match(componente, /"Enfermeros"/));
probar("muestra dotacionPrevistaOperativa", () => assert.match(componente, /dotacionPrevistaOperativa\?\.cantidad/));
probar("muestra previstosBase", () => assert.match(componente, /previstosBase\?\.cantidad/));
probar("rotula Base", () => assert.match(componente, /Base \{base\}/));
probar("no usa cohortePlanilla como Base", () => assert.doesNotMatch(componente, /cohortePlanilla/));
probar("no usa baseDisponible como Base", () => assert.doesNotMatch(componente, /baseDisponible/));
probar("muestra estadoDotacion", () => assert.match(componente, /estadoDotacion\?\.estado/));
probar("crítico visible", () => assert.match(componente, /Cr\u00edtico/));
probar("bajo óptimo visible", () => assert.match(componente, /Bajo \u00f3ptimo/));
probar("óptimo visible", () => assert.match(componente, /\u00d3ptimo/));
probar("sin datos visible", () => assert.match(componente, /Sin datos/));
probar("no hardcodea mínimo 9", () => assert.doesNotMatch(componente, /cantidad\s*[<>]=?\s*9/));
probar("no hardcodea óptimo 11", () => assert.doesNotMatch(componente, /cantidad\s*[<>]=?\s*11/));
probar("no hardcodea mínimo 13", () => assert.doesNotMatch(componente, /cantidad\s*[<>]=?\s*13/));
probar("no hardcodea óptimo 16", () => assert.doesNotMatch(componente, /cantidad\s*[<>]=?\s*16/));
probar("sin datos no muestra cero falso", () => assert.match(componente, /if \(!disponible\)[\s\S]*Sin datos/));
probar("cero real puede mostrarse", () => assert.equal(celda.proyeccion.dotacionPrevistaOperativa.cantidad, 0));
probar("fila seleccionada se destaca", () => assert.match(componente, /dia\.fecha === fechaSeleccionada/));
probar("fechas vienen del resultado mensual", () => assert.match(componente, /resultadoMensual\.dias\.map/));
probar("no genera días manualmente en React", () => assert.doesNotMatch(componente, /Array\.from\(\{\s*length|new Date\([^)]*,\s*0\)/));
probar("incluye loading", () => assert.match(componente, /Cargando dotaci&oacute;n mensual/));
probar("maneja mes inválido", () => assert.match(componente, /!resultadoMensual\.ok/));
probar("error parcial no bloquea otros días", () => assert.match(componente, /dia\.turnos\?\.\[turnoSeleccionado\]/));
probar("es read-only", () => assert.doesNotMatch(componente, /<input|<form|contentEditable/));
probar("sin Supabase", () => assert.doesNotMatch(componente, /supabase|rpc\(|\.from\(/i));
probar("sin autosave", () => assert.doesNotMatch(componente, /autosave|autoSave|guardarEstado/));
probar("sin edición de Planilla", () => assert.doesNotMatch(componente, /setPlanilla|actualizarPlanilla/));
probar("sin edición de Extras", () => assert.doesNotMatch(componente, /agregarExtra|eliminarExtra/));
probar("sin edición de Novedades", () => assert.doesNotMatch(componente, /crearNovedad|eliminarNovedad/));
probar("mobile sin width rígido", () => assert.doesNotMatch(componente, /w-\[\d+px\]|min-w-\[\d+px\]/));
probar("no provoca scroll horizontal de página", () => assert.doesNotMatch(componente, /overflow-x-auto|whitespace-nowrap/));
probar("texto puede envolver", () => assert.match(componente, /break-words/));
probar("coherencia operativa con resultado mensual", () => { assert.match(componente, /datos\?\.proyeccion\?\.dotacionPrevistaOperativa/); assert.equal(celda.estadoDotacion.cantidad, celda.proyeccion.dotacionPrevistaOperativa.cantidad); });
probar("coherencia Base con previstosBase", () => { assert.match(componente, /datos\?\.proyeccion\?\.previstosBase/); assert.equal(celda.proyeccion.previstosBase.cantidad, 0); });
probar("selector visual no entra en dependencias del motor", () => { const dependencias = componente.match(/\), \[estadosPorTurno, novedadesModernas, mes, configuracionDotacion\]\)/); assert.ok(dependencias); });
probar("no crea accordion diario", () => assert.doesNotMatch(componente, /aria-expanded|Ver detalle|Ocultar detalle/));
probar("no crea estadísticas mensuales", () => assert.doesNotMatch(componente, /promedio|porcentaje|peor turno|críticos del mes/i));
probar("no usa Previstos como etiqueta principal", () => assert.doesNotMatch(componente, />\s*Previstos\s*</));
probar("leyenda explica Operativa", () => assert.match(componente, /<strong>Operativa:<\/strong> base planificada, menos bajas conocidas, m&aacute;s Extras que aportan/));
probar("leyenda explica Base", () => assert.match(componente, /<strong>Base:<\/strong> personal planificado menos libres programados/));
probar("no depende sólo del color", () => assert.match(componente, /\{presentacion\.etiqueta\}/));
probar("mojibake ausente", () => assert.doesNotMatch(componente, /\u00c3|\u00c2|\u00e2/));
probar("no modifica motor diario", () => assert.doesNotMatch(componente, /agregadoSupervisionDia|proyeccionDotacionSupervision/));
probar("no modifica orquestador mensual", () => assert.equal(motorMensual.includes("proyectarSupervisionDia"), true));
probar("no muta inputs", () => assert.doesNotMatch(componente, /estadosPorTurno\s*=|novedadesModernas\.(push|splice)|configuracionDotacion\s*=/));

console.log(`Supervision dotacion mensual: ${total}/${total} comprobaciones OK.`);
