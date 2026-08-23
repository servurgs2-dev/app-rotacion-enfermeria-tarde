import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerFilasActivas
} from "../src/utils/configuracionPlanilla.js";
import { esDiaLibre, obtenerSemanasDelMes } from "../src/utils/fechas.js";
import { proyectarDotacionDiaSupervision } from "../src/utils/proyeccionDotacionSupervision.js";
import { TIPOS_NOVEDAD_PERSONAL } from "../src/utils/novedadesPersonal.js";
import { MOTIVOS_NO_DISPONIBLE } from "../src/utils/noDisponiblesMotivos.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const persona = (id, categoria = "enfermero", extra = {}) => ({
  id, funcionario: id, nombre: `Persona ${id}`, categoria, ...extra
});
const ref = (actual) => ({ personaId: actual.id, nombre: actual.nombre });
const crearEscenario = ({ categoria = "enfermero", turno = "tarde", mes = "2026-08" } = {}) => {
  const snapshot = crearSnapshotConfiguracionPlanilla({ turno, categoria, mes });
  const filas = obtenerFilasActivas(snapshot.filas);
  const personas = [persona("p1", categoria), persona("p2", categoria), persona("p3", categoria)];
  const distribucion = {
    [filas[0].etiqueta]: ref(personas[0]),
    [filas[1].etiqueta]: ref(personas[1]),
    [filas[2].etiqueta]: ref(personas[2])
  };
  const planilla = { semana1:{}, semana2:{}, semana3:{}, semana4:{}, semana5:{}, semana6:{}, coberturaLibreSM:{}, asignacionesParciales:{} };
  obtenerSemanasDelMes(mes).forEach(({ clave }) => { planilla[clave] = copiar(distribucion); });
  const calendarioCategoria = { extras:{}, noDisponibles:{}, asistenciaDia:{} };
  const estado = {
    personal: personas,
    licencias: [],
    certificaciones: [],
    configuracionPlanilla: { [categoria]: snapshot },
    planillas: {
      enfermeros: categoria === "enfermero" ? planilla : {},
      licenciados: categoria === "licenciado" ? planilla : {}
    },
    calendario: {
      enfermeros: categoria === "enfermero" ? calendarioCategoria : { extras:{}, noDisponibles:{}, asistenciaDia:{} },
      licenciados: categoria === "licenciado" ? calendarioCategoria : { extras:{}, noDisponibles:{}, asistenciaDia:{} }
    }
  };
  return { estado, personas, filas, planilla, calendarioCategoria, categoria, turno, mes };
};
const proyectar = (e, novedadesModernas = [], fecha = `${e.mes}-10`) =>
  proyectarDotacionDiaSupervision({
    estadoMensual:e.estado, novedadesModernas, fecha,
    turno:e.turno, categoria:e.categoria, mes:e.mes
  });
const novedad = (personaActual, tipo, extra = {}) => ({
  id:`n-${tipo}`, personaId:personaActual.id, personaNombre:personaActual.nombre,
  tipo, fechaDesde:"2026-08-10", fechaHasta:"2026-08-10",
  turno:"tarde", categoria:personaActual.categoria,
  afectaDisponibilidad:true, estado:"activa", ...extra
});
const licencia = (actual) => ({ ...ref(actual), desde:"2026-08-10", hasta:"2026-08-10" });
const marcarLibre = (actual) => {
  actual.libre = [1,2,3,4,5].find((fase) => esDiaLibre({ libre:fase }, new Date(2026,7,10,12)));
};

probar("1 previstosBase simple sin bajas", () => assert.equal(proyectar(crearEscenario()).previstosBase.cantidad, 3));
probar("2 licencia resta una", () => { const e=crearEscenario(); e.estado.licencias.push(licencia(e.personas[0])); assert.equal(proyectar(e).baseDisponible.cantidad,2); });
probar("3 certificación resta una", () => { const e=crearEscenario(); e.estado.certificaciones.push(licencia(e.personas[0])); assert.equal(proyectar(e).bajasConocidas.porCausa.certificacion,1); });
probar("4 suspensión resta una", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]).baseDisponible.cantidad,2); });
probar("5 adhesión a paro resta una", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO)]).bajasConocidas.porCausa.adhesion_paro,1); });
probar("6 No disponible resta una", () => { const e=crearEscenario(); e.calendarioCategoria.noDisponibles["2026-08-10"]=[{...ref(e.personas[0]),motivo:MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO}]; assert.equal(proyectar(e).baseDisponible.cantidad,2); });
probar("7 olvido de tarjeta no resta", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA,{afectaDisponibilidad:false,estado:"pendiente"})]).bajasConocidas.cantidad,0); });
probar("8 cambio de horario no resta", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO,{afectaDisponibilidad:false})]).bajasConocidas.cantidad,0); });
probar("9 excedente no resta", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.EXCEDENTE,{afectaDisponibilidad:false})]).bajasConocidas.cantidad,0); });
probar("10 otra informativa no resta", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.OTRA,{afectaDisponibilidad:false})]).bajasConocidas.cantidad,0); });
probar("11 libre no es baja", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); assert.equal(proyectar(e).bajasConocidas.cantidad,0); });
probar("12 libre más certificación no aumenta bajas", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.estado.certificaciones.push(licencia(e.personas[0])); assert.equal(proyectar(e).bajasConocidas.cantidad,0); });
probar("13 licencia más certificación es una baja", () => { const e=crearEscenario(); e.estado.licencias.push(licencia(e.personas[0])); e.estado.certificaciones.push(licencia(e.personas[0])); assert.equal(proyectar(e).bajasConocidas.cantidad,1); });
probar("14 certificación más suspensión es una baja", () => { const e=crearEscenario(); e.estado.certificaciones.push(licencia(e.personas[0])); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]).bajasConocidas.cantidad,1); });
probar("15 porCausa conserva ambas causas", () => { const e=crearEscenario(); e.estado.certificaciones.push(licencia(e.personas[0])); const r=proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]); assert.deepEqual(r.bajasConocidas.personas[0].causas,["certificacion","suspension"]); });
probar("16 suma porCausa puede superar bajas", () => { const e=crearEscenario(); e.estado.certificaciones.push(licencia(e.personas[0])); const r=proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]); assert.equal(Object.values(r.bajasConocidas.porCausa).reduce((a,b)=>a+b,0),2); });
probar("17 novedad cancelada no resta", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION,{estado:"cancelada"})]).bajasConocidas.cantidad,0); });
probar("18 novedad fuera de rango no resta", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION,{fechaDesde:"2026-08-11",fechaHasta:"2026-08-11"})]).bajasConocidas.cantidad,0); });
probar("19 novedad sin efecto no resta", () => { const e=crearEscenario(); assert.equal(proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION,{afectaDisponibilidad:false})]).bajasConocidas.cantidad,0); });
probar("20 Extra externo suma una", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{id:"ext1",nombre:"Externa",categoria:"enfermero",temporal:true}]; assert.equal(proyectar(e).dotacionPrevistaOperativa.cantidad,4); });
probar("21 Extra de otro turno suma en destino", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{id:"ext1",personaId:"ext1",nombre:"Externa",categoria:"enfermero",origenExtra:"personal_otro_turno",turnoOrigen:"manana"}]; assert.equal(proyectar(e).extrasRegistrados.personas[0].turnoOrigen,"manana"); });
probar("22 dos Extras distintos suman dos", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{id:"e1",nombre:"E1",categoria:"enfermero"},{id:"e2",nombre:"E2",categoria:"enfermero"}]; assert.equal(proyectar(e).dotacionPrevistaOperativa.cantidad,5); });
probar("23 Extra duplicado cuenta una", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{id:"e1",nombre:"E1",categoria:"enfermero"},{id:"e1",nombre:"E1",categoria:"enfermero"}]; assert.equal(proyectar(e).extrasRegistrados.cantidad,1); });
probar("24 Extra ya en base disponible no aumenta dotación", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; assert.equal(proyectar(e).dotacionPrevistaOperativa.cantidad,3); });
probar("25 libre más Extra reincorpora una persona", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1",origenExtra:"libre"}]; assert.equal(proyectar(e).dotacionPrevistaOperativa.cantidad,3); });
probar("26 libre más Extra conserva libre programado", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1",origenExtra:"libre"}]; assert.equal(proyectar(e).libresProgramados.cantidad,1); });
probar("27 Extra con licencia no resucita", () => { const e=crearEscenario(); e.estado.licencias.push(licencia(e.personas[0])); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.dotacionPrevistaOperativa.cantidad,2); assert.equal(r.advertencias.some(a=>a.codigo==="EXTRA_CON_INDISPONIBILIDAD_ACTIVA"),true); });
probar("28 Extra con certificación no resucita", () => { const e=crearEscenario(); e.estado.certificaciones.push(licencia(e.personas[0])); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.extrasRegistrados.cantidad,1); assert.equal(r.extrasQueAportan.cantidad,0); });
probar("29 baseDisponible tiene cantidad correcta", () => { const e=crearEscenario(); e.estado.licencias.push(licencia(e.personas[0])); assert.equal(proyectar(e).baseDisponible.cantidad,2); });
probar("30 dotación usa unión de identidades", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"},{id:"e1",nombre:"E1",categoria:"enfermero"}]; assert.equal(proyectar(e).dotacionPrevistaOperativa.cantidad,4); });
probar("31 ninguna persona aparece dos veces", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const ids=proyectar(e).dotacionPrevistaOperativa.personas.map(p=>p.personaId); assert.equal(new Set(ids).size,ids.length); });
probar("32 baja legacy por nombre resuelve", () => { const e=crearEscenario(); e.estado.licencias.push({nombre:e.personas[0].nombre,desde:"2026-08-10",hasta:"2026-08-10"}); assert.equal(proyectar(e).bajasConocidas.cantidad,1); });
probar("33 referencia ambigua no baja arbitrariamente", () => { const e=crearEscenario(); e.estado.personal.push(persona("p4","enfermero",{nombre:e.personas[0].nombre})); e.estado.licencias.push({nombre:e.personas[0].nombre,desde:"2026-08-10",hasta:"2026-08-10"}); assert.equal(proyectar(e).bajasConocidas.cantidad,0); });
probar("34 Extra manual externo con identidad cuenta", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{funcionario:"900",nombre:"Manual",categoria:"enfermero",temporal:true,origenExtra:"manual"}]; assert.equal(proyectar(e).extrasRegistrados.cantidad,1); });
probar("35 Extra sin identidad advierte", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{}]; assert.equal(proyectar(e).advertencias.some(a=>a.codigo==="EXTRA_SIN_IDENTIDAD"),true); });
probar("36 categorías son independientes", () => assert.equal(proyectar(crearEscenario({categoria:"licenciado"})).categoria,"licenciado"));
probar("37 conserva turno correcto", () => assert.equal(proyectar(crearEscenario({turno:"manana"})).turno,"manana"));
probar("38 conserva fecha correcta", () => assert.equal(proyectar(crearEscenario()).fecha,"2026-08-10"));
probar("39 estado null conserva métricas null", () => { const r=proyectarDotacionDiaSupervision({estadoMensual:null,fecha:"2026-08-10",turno:"tarde",categoria:"enfermero",mes:"2026-08"}); assert.equal(r.dotacionPrevistaOperativa,null); });
probar("40 período faltante conserva métricas null", () => { const e=crearEscenario(); delete e.planilla.semana3; assert.equal(proyectar(e).bajasConocidas,null); });
probar("41 período vacío devuelve cero real", () => { const e=crearEscenario(); e.planilla.semana3={}; const r=proyectar(e); assert.equal(r.ok,true); assert.equal(r.dotacionPrevistaOperativa.cantidad,0); });
probar("42 no aplica asistencia manual", () => { const e=crearEscenario(); e.calendarioCategoria.asistenciaDia["2026-08-10"]={"id:p1":{estado:"ausente"}}; assert.equal(proyectar(e).dotacionPrevistaOperativa.cantidad,3); });
probar("43 no ejecuta motor de coberturas", () => { const fuente=fs.readFileSync(new URL("../src/utils/proyeccionDotacionSupervision.js",import.meta.url),"utf8"); assert.doesNotMatch(fuente,/resolverTurnantesYCoberturasOperativas|aplicarCoberturaParejas/); });
probar("44 no calcula semáforo", () => { const r=proyectar(crearEscenario()); assert.equal(Object.hasOwn(r,"estadoDotacion"),false); });
probar("45 no muta entradas", () => { const e=crearEscenario(); const novedades=[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]; const antesEstado=copiar(e.estado); const antesNovedades=copiar(novedades); proyectar(e,novedades); assert.deepEqual(e.estado,antesEstado); assert.deepEqual(novedades,antesNovedades); });
probar("46 Extras repetidos por funcionario cuentan una identidad", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{funcionario:"900",nombre:"Nombre A",categoria:"enfermero",temporal:true},{funcionario:"900",nombre:"Nombre B",categoria:"enfermero",temporal:true}]; assert.equal(proyectar(e).extrasRegistrados.cantidad,1); });
probar("47 licencia ambigua conserva advertencia", () => { const e=crearEscenario(); e.estado.personal.push(persona("p4","enfermero",{nombre:e.personas[0].nombre})); e.estado.licencias.push({nombre:e.personas[0].nombre,desde:"2026-08-10",hasta:"2026-08-10"}); assert.equal(proyectar(e).advertencias.some(a=>a.codigo==="LICENCIA_PERSONA_NO_RESUELTA"),true); });
probar("48 certificación irresoluble conserva advertencia", () => { const e=crearEscenario(); e.estado.certificaciones.push({personaId:"fantasma",nombre:"Fantasma",desde:"2026-08-10",hasta:"2026-08-10"}); assert.equal(proyectar(e).advertencias.some(a=>a.codigo==="CERTIFICACION_PERSONA_NO_RESUELTA"),true); });
probar("49 Extra nuevo queda registrado y aporta", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{id:"e1",nombre:"E1",categoria:"enfermero"}]; const r=proyectar(e); assert.equal(r.extrasRegistrados.cantidad,1); assert.equal(r.extrasQueAportan.cantidad,1); assert.equal(r.dotacionPrevistaOperativa.cantidad,4); });
probar("50 Extra ya disponible se registra pero no aporta", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.extrasRegistrados.cantidad,1); assert.equal(r.extrasQueAportan.cantidad,0); assert.equal(r.dotacionPrevistaOperativa.cantidad,3); });
probar("51 Extra en libre se registra y aporta", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1",origenExtra:"libre"}]; const r=proyectar(e); assert.equal(r.libresProgramados.cantidad,1); assert.equal(r.extrasRegistrados.cantidad,1); assert.equal(r.extrasQueAportan.cantidad,1); });
probar("52 Extra con baja queda registrado sin aportar", () => { const e=crearEscenario(); e.estado.licencias.push(licencia(e.personas[0])); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.extrasRegistrados.cantidad,1); assert.equal(r.extrasQueAportan.cantidad,0); assert.equal(r.advertencias.some(a=>a.codigo==="EXTRA_CON_INDISPONIBILIDAD_ACTIVA"),true); });
probar("53 Extra inválido no queda registrado ni aporta", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{}]; const r=proyectar(e); assert.equal(r.extrasRegistrados.cantidad,0); assert.equal(r.extrasQueAportan.cantidad,0); });
probar("54 dos Extras con uno ya en base separan registro de aporte", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"},{id:"e1",nombre:"E1",categoria:"enfermero"}]; const r=proyectar(e); assert.equal(r.extrasRegistrados.cantidad,2); assert.equal(r.extrasQueAportan.cantidad,1); });
probar("55 base disponible más aportes explica la dotación", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"},{id:"e1",nombre:"E1",categoria:"enfermero"}]; const r=proyectar(e); assert.equal(r.baseDisponible.cantidad+r.extrasQueAportan.cantidad,r.dotacionPrevistaOperativa.cantidad); });
probar("56 registrados puede superar aportes", () => { const e=crearEscenario(); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.ok(r.extrasRegistrados.cantidad>r.extrasQueAportan.cantidad); });
probar("57 libre más Extra sin indisponibilidad aporta", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.bajasConocidas.cantidad,0); assert.equal(r.extrasQueAportan.cantidad,1); });
probar("58 libre más certificación no es baja conocida", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.estado.certificaciones.push(licencia(e.personas[0])); assert.equal(proyectar(e).bajasConocidas.cantidad,0); });
probar("59 libre certificado con Extra queda bloqueado", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.estado.certificaciones.push(licencia(e.personas[0])); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.bajasConocidas.cantidad,0); assert.equal(r.extrasRegistrados.cantidad,1); assert.equal(r.extrasQueAportan.cantidad,0); assert.equal(r.dotacionPrevistaOperativa.personas.some(p=>p.personaId==="p1"),false); });
probar("60 libre licenciado con Extra queda bloqueado", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.estado.licencias.push(licencia(e.personas[0])); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.bajasConocidas.cantidad,0); assert.equal(r.extrasRegistrados.cantidad,1); assert.equal(r.extrasQueAportan.cantidad,0); });
probar("61 libre suspendido con Extra queda bloqueado", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]); assert.equal(r.bajasConocidas.cantidad,0); assert.equal(r.extrasQueAportan.cantidad,0); });
probar("62 libre adherido a paro con Extra queda bloqueado", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO)]); assert.equal(r.bajasConocidas.cantidad,0); assert.equal(r.extrasQueAportan.cantidad,0); });
probar("63 libre No disponible con Extra queda bloqueado", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.noDisponibles["2026-08-10"]=[{...ref(e.personas[0]),motivo:MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO}]; e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.bajasConocidas.cantidad,0); assert.equal(r.extrasQueAportan.cantidad,0); });
probar("64 cambio horario informativo no bloquea Extra de libre", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO,{afectaDisponibilidad:false})]); assert.equal(r.extrasQueAportan.cantidad,1); });
probar("65 olvido de tarjeta no bloquea Extra de libre", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA,{afectaDisponibilidad:false,estado:"pendiente"})]); assert.equal(r.extrasQueAportan.cantidad,1); });
probar("66 prevista certificada con Extra conserva baja y bloqueo", () => { const e=crearEscenario(); e.estado.certificaciones.push(licencia(e.personas[0])); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e); assert.equal(r.bajasConocidas.cantidad,1); assert.equal(r.extrasRegistrados.cantidad,1); assert.equal(r.extrasQueAportan.cantidad,0); });
probar("67 indisponibilidad múltiple conserva causas en advertencia", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.estado.certificaciones.push(licencia(e.personas[0])); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"}]; const r=proyectar(e,[novedad(e.personas[0],TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]); const alerta=r.advertencias.find(a=>a.codigo==="EXTRA_CON_INDISPONIBILIDAD_ACTIVA"); assert.deepEqual(alerta.causas,["certificacion","suspension"]); });
probar("68 ningún aporte tiene indisponibilidad activa", () => { const e=crearEscenario(); marcarLibre(e.personas[0]); e.estado.licencias.push(licencia(e.personas[0])); e.calendarioCategoria.extras["2026-08-10"]=[{...e.personas[0],personaId:"p1"},{id:"e1",nombre:"E1",categoria:"enfermero"}]; const r=proyectar(e); assert.equal(r.extrasQueAportan.personas.some(p=>p.personaId==="p1"),false); assert.equal(r.dotacionPrevistaOperativa.personas.some(p=>p.personaId==="p1"),false); });

console.log(`\n${total} pruebas de proyección de dotación de Supervisión superadas.`);
