import assert from "node:assert/strict";
import fs from "node:fs";
import { crearSnapshotConfiguracionPlanilla, obtenerFilasActivas } from "../src/utils/configuracionPlanilla.js";
import { esDiaLibre, obtenerSemanasDelMes } from "../src/utils/fechas.js";
import { proyectarDotacionDiaSupervision } from "../src/utils/proyeccionDotacionSupervision.js";

let total = 0;
const probar = (nombre, prueba) => { prueba(); total += 1; console.log(`✓ ${total} ${nombre}`); };
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const persona = (id, categoria = "enfermero") => ({ id, funcionario:id, nombre:`Persona ${id}`, categoria });
const referencia = (actual) => ({ personaId:actual.id, nombre:actual.nombre });
const crearEscenario = ({ categoria="enfermero", mes="2026-08", turno="tarde" } = {}) => {
  const snapshot = crearSnapshotConfiguracionPlanilla({ turno, categoria, mes });
  const filas = obtenerFilasActivas(snapshot.filas);
  const personas = [persona("p1",categoria),persona("p2",categoria),persona("p3",categoria)];
  const distribucion = Object.fromEntries(personas.map((actual, indice) => [filas[indice].etiqueta, referencia(actual)]));
  const planilla = { semana1:{},semana2:{},semana3:{},semana4:{},semana5:{},semana6:{},coberturaLibreSM:{},asignacionesParciales:{} };
  obtenerSemanasDelMes(mes).forEach(({ clave }) => { planilla[clave]=copiar(distribucion); });
  const calendarioCategoria = { extras:{},noDisponibles:{},asistenciaDia:{} };
  const vacio = { extras:{},noDisponibles:{},asistenciaDia:{} };
  const estado = {
    personal:personas, licencias:[], certificaciones:[],
    configuracionPlanilla:{ [categoria]:snapshot },
    planillas:{ enfermeros:categoria==="enfermero"?planilla:{}, licenciados:categoria==="licenciado"?planilla:{} },
    calendario:{ enfermeros:categoria==="enfermero"?calendarioCategoria:vacio, licenciados:categoria==="licenciado"?calendarioCategoria:vacio }
  };
  return { estado,personas,planilla,calendarioCategoria,categoria,mes,turno };
};
const proyectar = (e, fecha=`${e.mes}-10`) => proyectarDotacionDiaSupervision({ estadoMensual:e.estado, novedadesModernas:[], fecha, turno:e.turno, categoria:e.categoria, mes:e.mes });
const registrar = (e, personaActual, estado, fecha="2026-08-10") => {
  e.calendarioCategoria.asistenciaDia[fecha] ||= {};
  e.calendarioCategoria.asistenciaDia[fecha][`id:${personaActual.id}`] = estado;
};
const marcarLibre = (actual) => { actual.libre=[1,2,3,4,5].find((fase)=>esDiaLibre({libre:fase},new Date(2026,7,10,12))); };
const extra = (actual) => ({ ...actual, personaId:actual.id, origenExtra:"libre" });
const certificacion = (actual) => ({ ...referencia(actual), desde:"2026-08-10", hasta:"2026-08-10" });

probar("todos sin registro quedan pendientes",()=>{const r=proyectar(crearEscenario());assert.equal(r.asistenciaRegistrada.pendientes.cantidad,3);});
probar("clasifica un presente",()=>{const e=crearEscenario();registrar(e,e.personas[0],"presente");assert.equal(proyectar(e).asistenciaRegistrada.presentes.cantidad,1);});
probar("clasifica un ausente",()=>{const e=crearEscenario();registrar(e,e.personas[0],"ausente");assert.equal(proyectar(e).asistenciaRegistrada.ausentes.cantidad,1);});
probar("presente ausente y pendiente son excluyentes",()=>{const e=crearEscenario();registrar(e,e.personas[0],"presente");registrar(e,e.personas[1],"ausente");const a=proyectar(e).asistenciaRegistrada;assert.deepEqual([a.presentes.cantidad,a.ausentes.cantidad,a.pendientes.cantidad],[1,1,1]);});
probar("los tres estados suman considerados",()=>{const a=proyectar(crearEscenario()).asistenciaRegistrada;assert.equal(a.presentes.cantidad+a.ausentes.cantidad+a.pendientes.cantidad,a.personasConsideradas.cantidad);});
probar("ausencia manual no cambia dotación",()=>{const e=crearEscenario();registrar(e,e.personas[0],"ausente");assert.equal(proyectar(e).dotacionPrevistaOperativa.cantidad,3);});
probar("ausencia manual no crea baja",()=>{const e=crearEscenario();registrar(e,e.personas[0],"ausente");assert.equal(proyectar(e).bajasConocidas.cantidad,0);});
probar("presente manual no cambia dotación",()=>{const e=crearEscenario();registrar(e,e.personas[0],"presente");assert.equal(proyectar(e).dotacionPrevistaOperativa.cantidad,3);});
probar("Extra que aporta integra asistencia",()=>{const e=crearEscenario();e.calendarioCategoria.extras["2026-08-10"]=[{id:"e1",nombre:"Extra",categoria:"enfermero"}];registrar(e,{id:"e1"},"presente");const a=proyectar(e).asistenciaRegistrada;assert.equal(a.personasConsideradas.cantidad,4);assert.equal(a.presentes.cantidad,1);});
probar("Extra sin registro queda pendiente",()=>{const e=crearEscenario();e.calendarioCategoria.extras["2026-08-10"]=[{id:"e1",nombre:"Extra",categoria:"enfermero"}];assert.equal(proyectar(e).asistenciaRegistrada.pendientes.cantidad,4);});
probar("Extra ya en base no duplica",()=>{const e=crearEscenario();e.calendarioCategoria.extras["2026-08-10"]=[extra(e.personas[0])];assert.equal(proyectar(e).asistenciaRegistrada.personasConsideradas.cantidad,3);});
probar("Extra bloqueado no entra",()=>{const e=crearEscenario();e.estado.certificaciones.push(certificacion(e.personas[0]));e.calendarioCategoria.extras["2026-08-10"]=[extra(e.personas[0])];assert.equal(proyectar(e).asistenciaRegistrada.personasConsideradas.cantidad,2);});
probar("libre sin Extra no entra",()=>{const e=crearEscenario();marcarLibre(e.personas[0]);assert.equal(proyectar(e).asistenciaRegistrada.personasConsideradas.cantidad,2);});
probar("libre con Extra entra",()=>{const e=crearEscenario();marcarLibre(e.personas[0]);e.calendarioCategoria.extras["2026-08-10"]=[extra(e.personas[0])];assert.equal(proyectar(e).asistenciaRegistrada.personasConsideradas.cantidad,3);});
probar("certificada no entra",()=>{const e=crearEscenario();e.estado.certificaciones.push(certificacion(e.personas[0]));assert.equal(proyectar(e).asistenciaRegistrada.personasConsideradas.cantidad,2);});
probar("certificada ausente queda fuera de dotación",()=>{const e=crearEscenario();e.estado.certificaciones.push(certificacion(e.personas[0]));registrar(e,e.personas[0],"ausente");const a=proyectar(e).asistenciaRegistrada;assert.equal(a.ausentes.cantidad,0);assert.equal(a.registrosFueraDeDotacion.cantidad,1);});
probar("registro residual queda detallado",()=>{const e=crearEscenario();e.calendarioCategoria.asistenciaDia["2026-08-10"]={"id:fantasma":"presente"};const r=proyectar(e);assert.equal(r.asistenciaRegistrada.registrosFueraDeDotacion.cantidad,1);assert.ok(r.advertencias.some(a=>a.codigo==="ASISTENCIA_FUERA_DE_DOTACION"));});
probar("identidad ajena no asigna estado",()=>{const e=crearEscenario();e.calendarioCategoria.asistenciaDia["2026-08-10"]={"nombre:persona p1":"ausente"};assert.equal(proyectar(e).asistenciaRegistrada.ausentes.cantidad,0);});
probar("estado null produce asistencia null",()=>assert.equal(proyectarDotacionDiaSupervision({estadoMensual:null,fecha:"2026-08-10",turno:"tarde",categoria:"enfermero",mes:"2026-08"}).asistenciaRegistrada,null));
probar("período faltante produce asistencia null",()=>{const e=crearEscenario();delete e.planilla.semana3;assert.equal(proyectar(e).asistenciaRegistrada,null);});
probar("período vacío produce ceros reales",()=>{const e=crearEscenario();e.planilla.semana3={};const a=proyectar(e).asistenciaRegistrada;assert.deepEqual([a.personasConsideradas.cantidad,a.presentes.cantidad,a.ausentes.cantidad,a.pendientes.cantidad],[0,0,0,0]);});
probar("Enfermeros y Licenciados son independientes",()=>{const e=crearEscenario({categoria:"licenciado"});registrar(e,e.personas[0],"presente");assert.equal(proyectar(e).asistenciaRegistrada.presentes.cantidad,1);});
probar("otra fecha no afecta",()=>{const e=crearEscenario();registrar(e,e.personas[0],"ausente","2026-08-11");assert.equal(proyectar(e).asistenciaRegistrada.ausentes.cantidad,0);});
probar("otra categoría no afecta",()=>{const e=crearEscenario();e.estado.calendario.licenciados.asistenciaDia={"2026-08-10":{"id:p1":"ausente"}};assert.equal(proyectar(e).asistenciaRegistrada.ausentes.cantidad,0);});
probar("no crea presenciaReal",()=>assert.equal(Object.hasOwn(proyectar(crearEscenario()),"presenciaReal"),false));
probar("asistencia no modifica bajas",()=>{const e=crearEscenario();registrar(e,e.personas[0],"ausente");assert.equal(proyectar(e).bajasConocidas.cantidad,0);});
probar("asistencia no modifica Extras",()=>{const e=crearEscenario();e.calendarioCategoria.extras["2026-08-10"]=[{id:"e1",nombre:"Extra",categoria:"enfermero"}];registrar(e,{id:"e1"},"ausente");assert.equal(proyectar(e).extrasQueAportan.cantidad,1);});
probar("no calcula semáforo",()=>assert.equal(Object.hasOwn(proyectar(crearEscenario()),"estadoDotacion"),false));
probar("no ejecuta coberturas",()=>{const fuente=fs.readFileSync(new URL("../src/utils/proyeccionDotacionSupervision.js",import.meta.url),"utf8");assert.doesNotMatch(fuente,/resolverTurnantesYCoberturasOperativas|aplicarCoberturaParejas/);});
probar("no muta entradas",()=>{const e=crearEscenario();registrar(e,e.personas[0],"ausente");const antes=copiar(e.estado);proyectar(e);assert.deepEqual(e.estado,antes);});

console.log(`\nAsistencia Supervisión: ${total}/${total} pruebas OK`);
