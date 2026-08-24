import assert from "node:assert/strict";
import fs from "node:fs";
import {
  construirNovedadesSupervisionDia,
  formatearPeriodoNovedadSupervision,
  resumirNovedadesSupervisionDia
} from "../src/utils/novedadesSupervision.js";

const FECHA = "2026-08-23";
const persona = (id, categoria="enfermero", nombre=`Persona ${id}`) => ({ id, funcionario:`f-${id}`, nombre, categoria });
const estado = (personas, licencias=[], certificaciones=[]) => ({ personal:personas, licencias, certificaciones });
const rango = (p, desde=FECHA, hasta=FECHA, id=`r-${p.id}`) => ({ id, personaId:p.id, nombre:p.nombre, categoria:p.categoria, desde, hasta });
const moderna = (id,p,tipo,turno="tarde", extra={}) => ({
  id, personaId:p.id, personaNombre:p.nombre, categoria:p.categoria, turno, tipo,
  fechaDesde:FECHA, fechaHasta:FECHA, observacion:"", estado:"activa",
  afectaDisponibilidad:["suspension","adhesion_paro"].includes(tipo), datos:{}, origen:"novedades_personal", ...extra
});
const base = () => {
  const l=persona("l","licenciado","Ana"); const e=persona("e","enfermero","Bruno");
  return { l,e, estadosPorTurno:{ noche:null, manana:null, tarde:estado([l,e]), vespertino:null } };
};
const listar = ({estadosPorTurno,novedadesModernas=[],fecha=FECHA}) => construirNovedadesSupervisionDia({estadosPorTurno,novedadesModernas,fecha});
let total=0; const probar=(nombre,fn)=>{fn();total+=1;console.log(`OK ${total} ${nombre}`);};

probar("Licencia legacy aparece",()=>{const e=base();e.estadosPorTurno.tarde.licencias=[rango(e.l)];assert.equal(listar(e)[0].tipo,"licencia");});
probar("Certificacion legacy aparece",()=>{const e=base();e.estadosPorTurno.tarde.certificaciones=[rango(e.e)];assert.equal(listar(e)[0].tipo,"certificacion");});
probar("Suspension moderna aparece",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("s",e.e,"suspension")]}).length,1);});
probar("Adhesion a paro aparece",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("p",e.e,"adhesion_paro")]} )[0].tipo,"adhesion_paro");});
probar("Cambio horario aparece",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("c",e.e,"cambio_horario")]} )[0].tipo,"cambio_horario");});
probar("Olvido tarjeta aparece",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("o",e.e,"olvido_tarjeta", "tarde",{estado:"pendiente"})]} )[0].tipo,"olvido_tarjeta");});
probar("Excedente retirado no aparece",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("x",e.e,"excedente")]}).length,0);});
probar("Otra retirada no aparece",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("x",e.e,"otra")]}).length,0);});
probar("fecha fuera de periodo no aparece",()=>{const e=base();e.estadosPorTurno.tarde.licencias=[rango(e.e,"2026-08-20","2026-08-22")];assert.equal(listar(e).length,0);});
probar("rango que contiene fecha aparece",()=>{const e=base();e.estadosPorTurno.tarde.licencias=[rango(e.e,"2026-08-20","2026-08-25")];assert.equal(listar(e).length,1);});
probar("cuatro turnos aportan",()=>{const e=base();e.estadosPorTurno=Object.fromEntries(["noche","manana","tarde","vespertino"].map((t,i)=>{const p=persona(`${i}`);return[t,estado([p],[rango(p)])];}));assert.equal(new Set(listar(e).map(n=>n.turno)).size,4);});
probar("no depende de turnoActivo",()=>assert.doesNotMatch(fs.readFileSync("src/utils/novedadesSupervision.js","utf8"),/turnoActivo/));
probar("Enfermero conserva categoria",()=>{const e=base();e.estadosPorTurno.tarde.certificaciones=[rango(e.e)];assert.equal(listar(e)[0].categoria,"enfermero");});
probar("Licenciado conserva categoria",()=>{const e=base();e.estadosPorTurno.tarde.licencias=[rango(e.l)];assert.equal(listar(e)[0].categoria,"licenciado");});
probar("Certificacion del dia no se duplica",()=>{const e=base();e.estadosPorTurno.tarde.certificaciones=[{...rango(e.e),origen:"no_disponibles",motivo:"certificacion_dia"}];assert.equal(listar(e).length,1);});
probar("identidad no depende solo del nombre",()=>{const e=base();e.estadosPorTurno.tarde.licencias=[rango(e.e,FECHA,FECHA,"a"),rango(e.e,FECHA,FECHA,"b")];assert.equal(listar(e).length,2);});
probar("homonimos distintos coexisten",()=>{const a=persona("a","enfermero","Igual"),b=persona("b","enfermero","Igual");const estadosPorTurno={noche:null,manana:null,tarde:estado([a,b],[rango(a),rango(b)]),vespertino:null};assert.equal(listar({estadosPorTurno}).length,2);});
probar("orden es deterministico",()=>{const e=base();const ns=[moderna("2",e.e,"olvido_tarjeta","vespertino"),moderna("1",e.l,"suspension","noche")];assert.deepEqual(listar({...e,novedadesModernas:ns}).map(n=>n.turno),["noche","vespertino"]);});
probar("ausencia se clasifica",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("s",e.e,"suspension")]} )[0].clasificacion,"ausencia");});
probar("Cambio horario es informativa",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("c",e.e,"cambio_horario")]} )[0].clasificacion,"informativa");});
probar("Olvido es informativa",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("o",e.e,"olvido_tarjeta")]} )[0].clasificacion,"informativa");});
probar("sin novedades es lista vacia",()=>assert.deepEqual(listar(base()),[]));
probar("cancelada no aparece",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("s",e.e,"suspension","tarde",{estado:"cancelada"})]}).length,0);});
probar("fallo moderno permite legacy",()=>{const e=base();e.estadosPorTurno.tarde.licencias=[rango(e.l)];assert.equal(listar({...e,novedadesModernas:[]}).length,1);});
probar("turno faltante no bloquea otros",()=>{const e=base();e.estadosPorTurno.tarde.licencias=[rango(e.l)];assert.equal(listar(e).length,1);});
probar("observacion es opcional",()=>{const e=base();assert.equal(listar({...e,novedadesModernas:[moderna("s",e.e,"suspension")]} )[0].observacion,"");});
probar("periodo es legible",()=>assert.equal(formatearPeriodoNovedadSupervision({fechaDesde:"2026-08-20",fechaHasta:"2026-08-25"}),"20/08 – 25/08"));
const componente=fs.readFileSync("src/components/supervision/NovedadesSupervisionDia.jsx","utf8");
const vista=fs.readFileSync("src/components/supervision/VistaSupervision.jsx","utf8");
probar("tarjeta muestra nombre",()=>assert.match(componente,/novedad\.personaNombre/));
probar("tarjeta muestra categoria",()=>assert.match(componente,/novedad\.categoriaEtiqueta/));
probar("tarjeta muestra turno",()=>assert.match(componente,/novedad\.turnoNombre/));
probar("tarjeta muestra tipo",()=>assert.match(componente,/novedad\.tipoEtiqueta/));
probar("es read only",()=>assert.doesNotMatch(componente,/<input|<select|<textarea|onSubmit|guardar|eliminar/));
probar("sin Supabase directo",()=>assert.doesNotMatch(`${componente}${vista}`,/supabase/i));
probar("no modifica dotacion",()=>assert.doesNotMatch(componente,/proyectarSupervisionDia|dotacionPrevistaOperativa/));
probar("no modifica Calendario",()=>assert.doesNotMatch(componente,/setCalendario|calendario\s*=/));
probar("no modifica Planilla",()=>assert.doesNotMatch(componente,/setPlanilla|planilla\s*=/));
probar("mobile sin width fijo",()=>assert.doesNotMatch(componente,/w-\[\d+px\]/));
probar("texto permite wrap",()=>assert.match(componente,/break-words/));
probar("no revive Paro especial",()=>assert.doesNotMatch(componente,/redistrib|diaDeParo|díaDeParo/i));
probar("no muta inputs",()=>{const e=base();e.estadosPorTurno.tarde.licencias=[rango(e.l)];const antes=structuredClone(e);listar(e);assert.deepEqual(e,antes);});
probar("resumen deriva lista",()=>assert.deepEqual(resumirNovedadesSupervisionDia([{clasificacion:"ausencia"},{clasificacion:"informativa"}]),{total:2,ausencias:1,informativas:1}));
probar("Vista usa la misma fecha",()=>assert.match(vista,/<NovedadesSupervisionDia[\s\S]*fecha=\{fecha\}/));
probar("loading evita falso vacio",()=>assert.match(componente,/if \(cargando\)[\s\S]*Cargando novedades/));
probar("error parcial avisa",()=>assert.match(componente,/errorModernas[\s\S]*Parte de las novedades no pudo cargarse/));

console.log(`Supervision novedades: ${total}/${total} comprobaciones OK.`);
