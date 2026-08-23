import assert from "node:assert/strict";
import fs from "node:fs";
import { TURNOS } from "../src/config/turnos.js";
import { crearSnapshotConfiguracionPlanilla, obtenerFilasActivas } from "../src/utils/configuracionPlanilla.js";
import { obtenerSemanasDelMes } from "../src/utils/fechas.js";
import { proyectarSupervisionDia, TURNOS_AGREGADO_SUPERVISION } from "../src/utils/agregadoSupervisionDia.js";
import { TIPOS_NOVEDAD_PERSONAL } from "../src/utils/novedadesPersonal.js";

let total=0;
const probar=(nombre,fn)=>{fn();total+=1;console.log(`✓ ${total} ${nombre}`);};
const copiar=(valor)=>JSON.parse(JSON.stringify(valor));
const MES="2026-06";
const FECHA="2026-06-10";
const crearCategoria=(turno,categoria,cantidad)=>{
  const snapshot=crearSnapshotConfiguracionPlanilla({turno,categoria,mes:MES});
  const filas=obtenerFilasActivas(snapshot.filas);
  const personas=Array.from({length:cantidad},(_,i)=>({id:`${turno}-${categoria}-${i+1}`,funcionario:`${turno}-${categoria}-${i+1}`,nombre:`${categoria} ${i+1}`,categoria}));
  const distribucion=Object.fromEntries(personas.map((p,i)=>[filas[i].etiqueta,{personaId:p.id,nombre:p.nombre}]));
  const planilla={semana1:{},semana2:{},semana3:{},semana4:{},semana5:{},semana6:{},coberturaLibreSM:{},asignacionesParciales:{}};
  obtenerSemanasDelMes(MES).forEach(({clave})=>{planilla[clave]=copiar(distribucion);});
  return {snapshot,personas,planilla};
};
const crearEstado=(turno,{licenciado=11,enfermero=16}={})=>{
  const le=crearCategoria(turno,"licenciado",licenciado);
  const ae=crearCategoria(turno,"enfermero",enfermero);
  return {
    personal:[...le.personas,...ae.personas],licencias:[],certificaciones:[],
    configuracionPlanilla:{licenciado:le.snapshot,enfermero:ae.snapshot},
    planillas:{licenciados:le.planilla,enfermeros:ae.planilla},
    calendario:{licenciados:{extras:{},noDisponibles:{},asistenciaDia:{}},enfermeros:{extras:{},noDisponibles:{},asistenciaDia:{}}}
  };
};
const crearEstados=()=>({
  noche:crearEstado("noche",{licenciado:8,enfermero:13}),
  manana:crearEstado("manana",{licenciado:9,enfermero:16}),
  tarde:crearEstado("tarde",{licenciado:10,enfermero:17}),
  vespertino:crearEstado("vespertino",{licenciado:11,enfermero:12})
});
const agregar=({estadosPorTurno=crearEstados(),novedadesModernas=[],configuracionDotacion}={})=>proyectarSupervisionDia({estadosPorTurno,novedadesModernas,fecha:FECHA,mes:MES,configuracionDotacion});
const combinaciones=(r)=>Object.values(r.turnos).flatMap((t)=>[t.licenciado,t.enfermero]);

probar("procesa cuatro turnos",()=>assert.deepEqual(Object.keys(agregar().turnos),Object.keys(TURNOS)));
probar("procesa dos categorías",()=>assert.deepEqual(Object.keys(agregar().turnos.tarde).filter(k=>k!=="disponible"),["licenciado","enfermero"]));
probar("produce ocho combinaciones",()=>assert.equal(combinaciones(agregar()).length,8));
probar("Enfermeros usan default 13/16",()=>assert.deepEqual([agregar().turnos.tarde.enfermero.umbral.minimo,agregar().turnos.tarde.enfermero.umbral.optimo],[13,16]));
probar("Licenciados usan default 9/11",()=>assert.deepEqual([agregar().turnos.tarde.licenciado.umbral.minimo,agregar().turnos.tarde.licenciado.umbral.optimo],[9,11]));
probar("debajo del mínimo es crítico",()=>assert.equal(agregar().turnos.noche.licenciado.estadoDotacion.estado,"critico"));
probar("exactamente mínimo es bajo óptimo",()=>assert.equal(agregar().turnos.manana.licenciado.estadoDotacion.estado,"bajo_optimo"));
probar("entre mínimo y óptimo es bajo óptimo",()=>assert.equal(agregar().turnos.tarde.licenciado.estadoDotacion.estado,"bajo_optimo"));
probar("exactamente óptimo es óptimo",()=>assert.equal(agregar().turnos.manana.enfermero.estadoDotacion.estado,"optimo"));
probar("sobre óptimo es óptimo",()=>assert.equal(agregar().turnos.tarde.enfermero.estadoDotacion.estado,"optimo"));
probar("override válido Licenciados",()=>{const r=agregar({configuracionDotacion:{overridesTurno:{tarde:{licenciado:{minimo:10,optimo:12}}}}});assert.equal(r.turnos.tarde.licenciado.umbral.fuente,"override");});
probar("override válido Enfermeros",()=>{const r=agregar({configuracionDotacion:{overridesTurno:{tarde:{enfermero:{minimo:17,optimo:18}}}}});assert.equal(r.turnos.tarde.enfermero.estadoDotacion.estado,"bajo_optimo");});
probar("override de Noche es explícito",()=>{const r=agregar({configuracionDotacion:{overridesTurno:{noche:{licenciado:{minimo:8,optimo:10}}}}});assert.equal(r.turnos.noche.licenciado.umbral.fuente,"override");});
probar("Noche sin override usa default",()=>assert.equal(agregar().turnos.noche.licenciado.umbral.fuente,"default"));
probar("estado null queda sin datos",()=>{const estados=crearEstados();estados.noche=null;assert.equal(agregar({estadosPorTurno:estados}).turnos.noche.licenciado.estadoDotacion.estado,"sin_datos");});
probar("sin datos no es crítico",()=>{const estados=crearEstados();estados.noche=null;assert.notEqual(agregar({estadosPorTurno:estados}).turnos.noche.enfermero.estadoDotacion.estado,"critico");});
probar("período faltante queda sin datos",()=>{const estados=crearEstados();delete estados.tarde.planillas.licenciados.semana2;assert.equal(agregar({estadosPorTurno:estados}).turnos.tarde.licenciado.disponible,false);});
probar("período vacío es cero real crítico",()=>{const estados=crearEstados();estados.tarde.planillas.licenciados.semana2={};const c=agregar({estadosPorTurno:estados}).turnos.tarde.licenciado;assert.equal(c.proyeccion.dotacionPrevistaOperativa.cantidad,0);assert.equal(c.estadoDotacion.estado,"critico");});
probar("turno sin datos no rompe otros",()=>{const estados=crearEstados();estados.vespertino=null;assert.equal(agregar({estadosPorTurno:estados}).turnos.tarde.disponible,true);});
probar("categoría sin datos no rompe la otra",()=>{const estados=crearEstados();delete estados.tarde.planillas.licenciados.semana2;assert.equal(agregar({estadosPorTurno:estados}).turnos.tarde.enfermero.disponible,true);});
probar("resumen cuenta críticos",()=>assert.equal(agregar().resumen.criticos,2));
probar("resumen cuenta bajo óptimo",()=>assert.equal(agregar().resumen.bajoOptimo,3));
probar("resumen cuenta óptimos",()=>assert.equal(agregar().resumen.optimos,3));
probar("resumen cuenta sin datos",()=>{const estados=crearEstados();estados.noche=null;assert.equal(agregar({estadosPorTurno:estados}).resumen.sinDatos,2);});
probar("resumen totaliza ocho",()=>assert.equal(Object.values(agregar().resumen).reduce((a,b)=>a+b,0),8));
probar("semáforo usa dotación prevista operativa",()=>{const c=agregar().turnos.tarde.licenciado;assert.equal(c.estadoDotacion.cantidad,c.proyeccion.dotacionPrevistaOperativa.cantidad);});
probar("ausente registrado no cambia semáforo",()=>{const estados=crearEstados();estados.tarde.calendario.licenciados.asistenciaDia[FECHA]={"id:tarde-licenciado-1":"ausente"};assert.equal(agregar({estadosPorTurno:estados}).turnos.tarde.licenciado.estadoDotacion.estado,"bajo_optimo");});
probar("presente registrado no cambia semáforo",()=>{const estados=crearEstados();estados.noche.calendario.licenciados.asistenciaDia[FECHA]={"id:noche-licenciado-1":"presente"};assert.equal(agregar({estadosPorTurno:estados}).turnos.noche.licenciado.estadoDotacion.estado,"critico");});
probar("Extra que aporta modifica semáforo vía dotación",()=>{const estados=crearEstados();estados.noche.calendario.licenciados.extras[FECHA]=[{id:"extra",nombre:"Extra",categoria:"licenciado"}];assert.equal(agregar({estadosPorTurno:estados}).turnos.noche.licenciado.estadoDotacion.estado,"bajo_optimo");});
probar("baja conocida modifica semáforo vía dotación",()=>{const estados=crearEstados();const p=estados.manana.personal.find(x=>x.categoria==="licenciado");estados.manana.certificaciones=[{personaId:p.id,nombre:p.nombre,desde:FECHA,hasta:FECHA}];assert.equal(agregar({estadosPorTurno:estados}).turnos.manana.licenciado.estadoDotacion.estado,"critico");});
probar("libre afecta sólo vía proyección consolidada",()=>{const estados=crearEstados();estados.manana.personal.find(x=>x.categoria==="licenciado").libre=1;const c=agregar({estadosPorTurno:estados}).turnos.manana.licenciado;assert.equal(c.estadoDotacion.cantidad,c.proyeccion.dotacionPrevistaOperativa.cantidad);});
probar("Noche reutiliza la proyección existente",()=>{const fuente=fs.readFileSync(new URL("../src/utils/agregadoSupervisionDia.js",import.meta.url),"utf8");assert.match(fuente,/proyectarDotacionDiaSupervision/);assert.doesNotMatch(fuente,/obtenerBloqueParaFecha/);});
probar("novedades se pasan a la proyección",()=>{const estados=crearEstados();const p=estados.tarde.personal.find(x=>x.categoria==="licenciado");const n={id:"n1",personaId:p.id,personaNombre:p.nombre,tipo:TIPOS_NOVEDAD_PERSONAL.SUSPENSION,fechaDesde:FECHA,fechaHasta:FECHA,turno:"tarde",categoria:"licenciado",afectaDisponibilidad:true,estado:"activa"};assert.equal(agregar({estadosPorTurno:estados,novedadesModernas:[n]}).turnos.tarde.licenciado.proyeccion.bajasConocidas.cantidad,1);});
probar("categorías no se mezclan",()=>assert.equal(agregar().turnos.tarde.enfermero.proyeccion.categoria,"enfermero"));
probar("turnos no se mezclan",()=>assert.equal(agregar().turnos.manana.licenciado.proyeccion.turno,"manana"));
probar("no consulta Supabase",()=>assert.doesNotMatch(fs.readFileSync(new URL("../src/utils/agregadoSupervisionDia.js",import.meta.url),"utf8"),/supabase|rpc\(/i));
probar("no usa React",()=>assert.doesNotMatch(fs.readFileSync(new URL("../src/utils/agregadoSupervisionDia.js",import.meta.url),"utf8"),/react|use[A-Z]/));
probar("no crea turno supervision",()=>assert.equal(TURNOS_AGREGADO_SUPERVISION.includes("supervision"),false));
probar("no muta estados",()=>{const estados=crearEstados();const antes=copiar(estados);agregar({estadosPorTurno:estados});assert.deepEqual(estados,antes);});
probar("no muta novedades",()=>{const novedades=[{id:"n"}];const antes=copiar(novedades);agregar({novedadesModernas:novedades});assert.deepEqual(novedades,antes);});
probar("no muta configuración",()=>{const configuracion={overridesTurno:{noche:{licenciado:{minimo:8,optimo:10}}}};const antes=copiar(configuracion);agregar({configuracionDotacion:configuracion});assert.deepEqual(configuracion,antes);});
probar("errores parciales se conservan",()=>{const estados=crearEstados();delete estados.tarde.planillas.licenciados.semana2;assert.ok(agregar({estadosPorTurno:estados}).errores.some(e=>e.turno==="tarde"&&e.categoria==="licenciado"));});
probar("advertencias se conservan con contexto",()=>{const estados=crearEstados();estados.tarde.calendario.licenciados.asistenciaDia[FECHA]={"id:fantasma":"presente"};assert.ok(agregar({estadosPorTurno:estados}).advertencias.some(a=>a.turno==="tarde"&&a.categoria==="licenciado"));});
probar("salida es determinística",()=>{const entrada={estadosPorTurno:crearEstados()};assert.deepEqual(agregar(entrada),agregar(entrada));});

console.log(`\nAgregado Supervisión día: ${total}/${total} pruebas OK`);
