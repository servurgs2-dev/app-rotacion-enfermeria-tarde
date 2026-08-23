import assert from "node:assert/strict";
import fs from "node:fs";
import { TURNOS } from "../src/config/turnos.js";
import { esPerfilSupervision } from "../src/utils/permisos.js";

const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const app = leer("src/App.jsx");
const selector = leer("src/components/turnos/SelectorTurno.jsx");
const vista = leer("src/components/supervision/VistaSupervision.jsx");
let total = 0;
const probar = (nombre, fn) => { fn(); total += 1; console.log(`OK ${total} ${nombre}`); };

const supervisor = { usuario: "supervisor", rol: "supervision", turno: null, activo: true };
const licenciado = { usuario: "licenciado", rol: "licenciado", turno: "tarde", activo: true };

probar("rol supervision tiene permiso central", () => assert.equal(esPerfilSupervision(supervisor), true));
probar("rol no autorizado no tiene permiso", () => assert.equal(esPerfilSupervision(licenciado), false));
probar("Selector recibe permiso central", () => assert.match(app, /mostrarSupervision=\{esPerfilSupervision\(perfil\)\}/));
probar("los cuatro turnos continuan presentes", () => assert.equal(Object.keys(TURNOS).length, 4));
probar("Supervision no es un quinto turno", () => assert.equal(Object.hasOwn(TURNOS, "supervision"), false));
probar("tarjeta esta separada de la grilla", () => assert.match(selector, /<\/div>\s*\{mostrarSupervision && \(/));
probar("tarjeta tiene descripcion", () => assert.match(selector, /Vista general del servicio/));
probar("tarjeta es tactil", () => assert.match(selector, /min-h-24 w-full/));
probar("App representa Supervision como vista", () => assert.match(app, /vistaInicial, setVistaInicial.*useState\("selector"\)/));
probar("abrir no cambia turnoActivo", () => { const b=app.slice(app.indexOf("const abrirSupervision"),app.indexOf("const volverDesdeSupervision")); assert.doesNotMatch(b,/setTurnoActivo/); });
probar("volver restaura selector", () => assert.match(app,/setVistaInicial\("selector"\)/));
probar("no crea estado mensual supervision", () => assert.doesNotMatch(app,/supervision\|\$\{/));
probar("seleccion normal permanece", () => assert.match(app,/onSeleccionar=\{seleccionarTurno\}/));
probar("usa una fuente transversal", () => assert.equal((vista.match(/useDatosSupervisionMes\(/g)||[]).length,1));
probar("usa agregado consolidado", () => assert.equal((vista.match(/proyectarSupervisionDia\(/g)||[]).length,1));
probar("fecha deriva mes", () => assert.match(vista,/const mes = obtenerMesFecha\(fecha\)/));
probar("controles de fecha", () => { assert.match(vista,/anterior/); assert.match(vista,/siguiente/); assert.match(vista,/type="date"/); });
probar("renderiza cuatro turnos centrales", () => assert.match(vista,/TURNOS_AGREGADO_SUPERVISION\.map/));
probar("separa categorias", () => { assert.match(vista,/\["licenciado", "Licenciados"\]/); assert.match(vista,/\["enfermero", "Enfermeros"\]/); });
probar("presenta cuatro estados", () => { for(const e of ["critico","bajo_optimo","optimo","sin_datos"]) assert.match(vista,new RegExp(`${e}:`)); });
probar("sin datos no muestra cero", () => assert.match(vista,/disponible \? `\$\{cantidad\} previstos` : "Sin datos"/));
probar("cero real es entero disponible", () => assert.match(vista,/Number\.isInteger\(cantidad\)/));
probar("umbrales vienen del motor", () => { assert.match(vista,/datos\.umbral\.minimo/); assert.match(vista,/datos\.umbral\.optimo/); });
probar("resumen viene del agregado", () => assert.match(vista,/resultado\.resumen\[clave\]/));
probar("incluye loading", () => assert.match(vista,/datos\.cargando/));
probar("incluye error y reintento", () => { assert.match(vista,/errorTotal/); assert.match(vista,/onClick=\{datos\.recargar\}/); });
probar("error parcial conserva tablero", () => { assert.match(vista,/erroresParciales\.length > 0/); assert.match(vista,/Se muestran los datos disponibles/); });
probar("UI no recalcula semaforo", () => { assert.doesNotMatch(vista,/cantidad\s*</); assert.doesNotMatch(vista,/resolverEstadoDotacion/); });
probar("layout mobile sin ancho fijo", () => { assert.match(vista,/grid-cols-1 gap-4 md:grid-cols-2/); assert.match(vista,/overflow-x-hidden/); assert.doesNotMatch(vista,/w-\[(?:\d+)px\]/); });
probar("vista es read only", () => { assert.doesNotMatch(vista,/supabase/i); assert.doesNotMatch(vista,/guardarEstado|actualizarEstado|insert\(/); });

console.log(`Supervision tablero: ${total}/${total} comprobaciones OK.`);
