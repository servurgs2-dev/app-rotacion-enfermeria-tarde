import assert from "node:assert/strict";
import fs from "node:fs";
import { crearSnapshotConfiguracionPlanilla, obtenerFilasActivas } from "../src/utils/configuracionPlanilla.js";
import { obtenerSemanasDelMes } from "../src/utils/fechas.js";
import { proyectarSupervisionDia } from "../src/utils/agregadoSupervisionDia.js";
import {
  crearValidadorExtrasOrigenDia,
  ESTADOS_VALIDACION_EXTRA_ORIGEN,
  resolverIndisponibilidadesDia
} from "../src/utils/indisponibilidadesSupervision.js";
import { TIPOS_NOVEDAD_PERSONAL } from "../src/utils/novedadesPersonal.js";
import { MOTIVOS_NO_DISPONIBLE } from "../src/utils/noDisponiblesMotivos.js";

const MES = "2026-06";
const FECHA = "2026-06-10";
let total = 0;
const probar = (nombre, fn) => { fn(); total += 1; console.log(`✓ ${total} ${nombre}`); };
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const persona = (id, categoria = "enfermero", extra = {}) => ({
  id, funcionario: `f-${id}`, nombre: `Persona ${id}`, categoria, ...extra
});
const referencia = (p) => ({ personaId: p.id, nombre: p.nombre });

const crearEstado = (turno, personas = []) => {
  const estado = {
    personal: personas,
    licencias: [],
    certificaciones: [],
    configuracionPlanilla: {},
    planillas: { enfermeros: {}, licenciados: {} },
    calendario: {
      enfermeros: { extras: {}, noDisponibles: {}, asistenciaDia: {} },
      licenciados: { extras: {}, noDisponibles: {}, asistenciaDia: {} }
    }
  };
  ["enfermero", "licenciado"].forEach((categoria) => {
    const deCategoria = personas.filter((p) => p.categoria === categoria);
    const snapshot = crearSnapshotConfiguracionPlanilla({ turno, categoria, mes: MES });
    const filas = obtenerFilasActivas(snapshot.filas);
    const distribucion = Object.fromEntries(
      deCategoria.map((p, indice) => [filas[indice].etiqueta, referencia(p)])
    );
    const planilla = { semana1:{}, semana2:{}, semana3:{}, semana4:{}, semana5:{}, semana6:{}, coberturaLibreSM:{}, asignacionesParciales:{} };
    obtenerSemanasDelMes(MES).forEach(({ clave }) => { planilla[clave] = copiar(distribucion); });
    estado.configuracionPlanilla[categoria] = snapshot;
    estado.planillas[categoria === "enfermero" ? "enfermeros" : "licenciados"] = planilla;
  });
  return estado;
};

const origen = persona("origen");
const destino = persona("destino");
const crearEstados = () => ({
  noche: crearEstado("noche", [persona("noche")]),
  manana: crearEstado("manana", [origen]),
  tarde: crearEstado("tarde", [destino]),
  vespertino: crearEstado("vespertino", [persona("vespertino")])
});
const extraOtroTurno = (extra = {}) => ({
  id: origen.id,
  personaId: origen.id,
  funcionario: origen.funcionario,
  nombre: origen.nombre,
  categoria: origen.categoria,
  origenExtra: "personal_otro_turno",
  turnoOrigen: "manana",
  ...extra
});
const agregarExtra = (estados, extra, turno = "tarde", categoria = "enfermero") => {
  estados[turno].calendario[categoria === "enfermero" ? "enfermeros" : "licenciados"].extras[FECHA] = [extra];
};
const agregar = (estados = crearEstados(), novedadesModernas = []) =>
  proyectarSupervisionDia({ estadosPorTurno: estados, novedadesModernas, fecha: FECHA, mes: MES });
const destinoResultado = (resultado, turno = "tarde", categoria = "enfermero") =>
  resultado.turnos[turno][categoria].proyeccion;
const validar = (estados, extra, categoria = "enfermero", novedadesModernas = []) =>
  crearValidadorExtrasOrigenDia({ estadosPorTurno: estados, novedadesModernas, fecha: FECHA })({ extra, categoria });
const licencia = (p) => ({ ...referencia(p), desde: FECHA, hasta: FECHA });
const novedad = (p, tipo, extra = {}) => ({
  id: `n-${tipo}`, personaId: p.id, personaNombre: p.nombre, tipo,
  fechaDesde: FECHA, fechaHasta: FECHA, turno: "manana", categoria: p.categoria,
  afectaDisponibilidad: true, estado: "activa", ...extra
});

probar("Extra canónico disponible aporta", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno()); assert.equal(destinoResultado(agregar(e)).extrasQueAportan.cantidad,1); });
probar("conserva turnoOrigen", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno()); assert.equal(destinoResultado(agregar(e)).extrasRegistrados.personas[0].turnoOrigen,"manana"); });
probar("personaId exacto resuelve", () => assert.equal(validar(crearEstados(),extraOtroTurno()).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE));
probar("licencia activa origen bloquea", () => { const e=crearEstados(); e.manana.licencias=[licencia(origen)]; agregarExtra(e,extraOtroTurno()); assert.equal(destinoResultado(agregar(e)).extrasQueAportan.cantidad,0); });
probar("certificación origen bloquea", () => { const e=crearEstados(); e.manana.certificaciones=[licencia(origen)]; assert.equal(validar(e,extraOtroTurno()).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_INDISPONIBLE); });
probar("No disponible origen bloquea", () => { const e=crearEstados(); e.manana.calendario.enfermeros.noDisponibles[FECHA]=[{...referencia(origen),motivo:MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO}]; assert.deepEqual(validar(e,extraOtroTurno()).causas,["no_disponible"]); });
probar("suspensión moderna origen bloquea", () => assert.equal(validar(crearEstados(),extraOtroTurno(),"enfermero",[novedad(origen,TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_INDISPONIBLE));
probar("adhesión a paro origen bloquea", () => assert.deepEqual(validar(crearEstados(),extraOtroTurno(),"enfermero",[novedad(origen,TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO)]).causas,["adhesion_paro"]));
probar("libre origen no bloquea", () => { const e=crearEstados(); e.manana.personal[0].libre=1; assert.equal(validar(e,extraOtroTurno()).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE); });
probar("cambio horario origen no bloquea", () => assert.equal(validar(crearEstados(),extraOtroTurno(),"enfermero",[novedad(origen,TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO,{afectaDisponibilidad:false})]).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE));
probar("olvido tarjeta origen no bloquea", () => assert.equal(validar(crearEstados(),extraOtroTurno(),"enfermero",[novedad(origen,TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA,{afectaDisponibilidad:false,estado:"pendiente"})]).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE));
probar("Extra indisponible sigue registrado", () => { const e=crearEstados(); e.manana.licencias=[licencia(origen)]; agregarExtra(e,extraOtroTurno()); assert.equal(destinoResultado(agregar(e)).extrasRegistrados.cantidad,1); });
probar("Extra indisponible no aporta", () => { const e=crearEstados(); e.manana.certificaciones=[licencia(origen)]; agregarExtra(e,extraOtroTurno()); assert.equal(destinoResultado(agregar(e)).extrasQueAportan.cantidad,0); });
probar("semáforo destino refleja bloqueo", () => { const e=crearEstados(); e.manana.licencias=[licencia(origen)]; agregarExtra(e,extraOtroTurno()); const r=agregar(e).turnos.tarde.enfermero; assert.equal(r.estadoDotacion.cantidad,1); });
probar("asistencia destino no incluye bloqueado", () => { const e=crearEstados(); e.manana.licencias=[licencia(origen)]; agregarExtra(e,extraOtroTurno()); assert.equal(destinoResultado(agregar(e)).asistenciaRegistrada.personasConsideradas.cantidad,1); });
probar("persona cubierta no identifica al Extra", () => { const e=crearEstados(); e.manana.personal.push(persona("cubierta")); const x=extraOtroTurno({personaId:"fantasma",personaCubiertaId:"cubierta"}); assert.equal(validar(e,x).motivo,"PERSONA_ID_NO_ENCONTRADA"); });
probar("categoría incorrecta no resuelve", () => assert.equal(validar(crearEstados(),extraOtroTurno(),"licenciado").estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_VERIFICABLE));
probar("personaId inexistente no es verificable", () => assert.equal(validar(crearEstados(),extraOtroTurno({personaId:"fantasma"})).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_VERIFICABLE));
probar("personaId inexistente no cae a nombre", () => assert.equal(validar(crearEstados(),extraOtroTurno({personaId:"fantasma"})).motivo,"PERSONA_ID_NO_ENCONTRADA"));
probar("funcionario único legacy resuelve", () => assert.equal(validar(crearEstados(),extraOtroTurno({personaId:null,id:"legacy"})).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE));
probar("funcionario duplicado no es verificable", () => { const e=crearEstados(); e.manana.personal.push(persona("otro", "enfermero",{funcionario:origen.funcionario})); assert.equal(validar(e,extraOtroTurno({personaId:null,id:"legacy"})).motivo,"FUNCIONARIO_AMBIGUO"); });
probar("nombre único legacy resuelve", () => assert.equal(validar(crearEstados(),extraOtroTurno({personaId:null,id:"legacy",funcionario:""})).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE));
probar("nombre ambiguo no es verificable", () => { const e=crearEstados(); e.manana.personal.push(persona("otro","enfermero",{nombre:origen.nombre})); assert.equal(validar(e,extraOtroTurno({personaId:null,id:"legacy",funcionario:""})).motivo,"NOMBRE_AMBIGUO"); });
probar("turnoOrigen faltante no es verificable", () => assert.equal(validar(crearEstados(),extraOtroTurno({turnoOrigen:""})).motivo,"TURNO_ORIGEN_FALTANTE"));
probar("turnoOrigen inválido no es verificable", () => assert.equal(validar(crearEstados(),extraOtroTurno({turnoOrigen:"otro"})).motivo,"TURNO_ORIGEN_INVALIDO"));
probar("estado origen null no es verificable", () => { const e=crearEstados(); e.manana=null; assert.equal(validar(e,extraOtroTurno()).motivo,"ESTADO_ORIGEN_NO_DISPONIBLE"); });
probar("no verificable conserva aporte", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno({personaId:"fantasma"})); assert.equal(destinoResultado(agregar(e)).extrasQueAportan.cantidad,1); });
probar("no verificable genera advertencia", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno({personaId:"fantasma"})); assert.ok(destinoResultado(agregar(e)).advertencias.some(a=>a.codigo==="EXTRA_ORIGEN_NO_VERIFICABLE")); });
probar("Extra manual no requiere origen", () => { const e=crearEstados(); agregarExtra(e,{id:"manual",nombre:"Manual",categoria:"enfermero",temporal:true,origenExtra:"manual"}); assert.equal(destinoResultado(agregar(e)).extrasQueAportan.cantidad,1); });
probar("Extra en libre local no requiere cruce", () => { const e=crearEstados(); agregarExtra(e,{...destino,personaId:destino.id,origenExtra:"libre"}); assert.equal(destinoResultado(agregar(e)).advertencias.some(a=>a.codigo==="EXTRA_ORIGEN_NO_VERIFICABLE"),false); });
probar("histórico sin afirmación de otro turno conserva compatibilidad", () => { const e=crearEstados(); agregarExtra(e,{id:"h",nombre:"Histórico",categoria:"enfermero",origenExtra:"historico"}); assert.equal(destinoResultado(agregar(e)).extrasQueAportan.cantidad,1); });
probar("dos Extras se validan independientemente", () => { const e=crearEstados(); const segundo=persona("segundo"); e.manana.personal.push(segundo); e.tarde.calendario.enfermeros.extras[FECHA]=[extraOtroTurno(),extraOtroTurno({id:segundo.id,personaId:segundo.id,nombre:segundo.nombre,funcionario:segundo.funcionario})]; e.manana.licencias=[licencia(origen)]; assert.equal(destinoResultado(agregar(e)).extrasQueAportan.cantidad,1); });
probar("Extra duplicado no duplica headcount", () => { const e=crearEstados(); e.tarde.calendario.enfermeros.extras[FECHA]=[extraOtroTurno(),extraOtroTurno()]; assert.equal(destinoResultado(agregar(e)).extrasQueAportan.cantidad,1); });
probar("Extra duplicado no duplica advertencia", () => { const e=crearEstados(); e.manana.licencias=[licencia(origen)]; e.tarde.calendario.enfermeros.extras[FECHA]=[extraOtroTurno(),extraOtroTurno()]; assert.equal(destinoResultado(agregar(e)).advertencias.filter(a=>a.codigo==="EXTRA_INDISPONIBLE_EN_TURNO_ORIGEN").length,1); });
probar("múltiples causas origen se conservan", () => { const e=crearEstados(); e.manana.licencias=[licencia(origen)]; e.manana.certificaciones=[licencia(origen)]; assert.deepEqual(validar(e,extraOtroTurno()).causas,["licencia","certificacion"]); });
probar("libre más certificación bloquea", () => { const e=crearEstados(); e.manana.personal[0].libre=1; e.manana.certificaciones=[licencia(origen)]; assert.equal(validar(e,extraOtroTurno()).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_INDISPONIBLE); });
probar("certificación más suspensión es una identidad", () => { const e=crearEstados(); e.manana.certificaciones=[licencia(origen)]; assert.deepEqual(validar(e,extraOtroTurno(),"enfermero",[novedad(origen,TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]).causas,["certificacion","suspension"]); });
probar("Enfermeros son independientes", () => assert.equal(validar(crearEstados(),extraOtroTurno(),"enfermero").estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE));
probar("Licenciados son independientes", () => { const p=persona("lic","licenciado"); const e=crearEstados(); e.manana=crearEstado("manana",[p]); assert.equal(validar(e,extraOtroTurno({id:p.id,personaId:p.id,nombre:p.nombre,funcionario:p.funcionario,categoria:"licenciado"}),"licenciado").estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE); });
probar("Mañana a Tarde", () => assert.equal(validar(crearEstados(),extraOtroTurno()).turnoOrigen,"manana"));
probar("Noche a Mañana", () => { const e=crearEstados(); const p=e.noche.personal[0]; const x=extraOtroTurno({id:p.id,personaId:p.id,nombre:p.nombre,funcionario:p.funcionario,turnoOrigen:"noche"}); assert.equal(validar(e,x).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE); });
probar("Vespertino a Noche", () => { const e=crearEstados(); const p=e.vespertino.personal[0]; const x=extraOtroTurno({id:p.id,personaId:p.id,nombre:p.nombre,funcionario:p.funcionario,turnoOrigen:"vespertino"}); assert.equal(validar(e,x).estado,ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_DISPONIBLE); });
probar("no resta headcount origen", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno()); const r=agregar(e); assert.equal(r.turnos.manana.enfermero.proyeccion.dotacionPrevistaOperativa.cantidad,1); });
probar("no modifica Planilla origen", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno()); const antes=copiar(e.manana.planillas); agregar(e); assert.deepEqual(e.manana.planillas,antes); });
probar("no modifica Calendario origen", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno()); const antes=copiar(e.manana.calendario); agregar(e); assert.deepEqual(e.manana.calendario,antes); });
probar("no muta estadosPorTurno", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno()); const antes=copiar(e); agregar(e); assert.deepEqual(e,antes); });
probar("no muta novedades", () => { const e=crearEstados(); const n=[novedad(origen,TIPOS_NOVEDAD_PERSONAL.SUSPENSION)]; const antes=copiar(n); agregar(e,n); assert.deepEqual(n,antes); });
probar("sin consultas Supabase", () => assert.doesNotMatch(fs.readFileSync(new URL("../src/utils/indisponibilidadesSupervision.js",import.meta.url),"utf8"),/supabase|rpc\(/i));
probar("sin React", () => assert.doesNotMatch(fs.readFileSync(new URL("../src/utils/indisponibilidadesSupervision.js",import.meta.url),"utf8"),/react|use[A-Z]/));
probar("resultado determinístico", () => { const e=crearEstados(); agregarExtra(e,extraOtroTurno()); assert.deepEqual(agregar(e),agregar(e)); });

const crearEstadoMixto = () => {
  const enfermero = persona("mixto-enf", "enfermero");
  const licenciado = persona("mixto-lic", "licenciado");
  return { estado: crearEstado("tarde", [enfermero, licenciado]), enfermero, licenciado };
};
const resolverMixto = ({ estado, categoria, novedadesModernas = [] }) =>
  resolverIndisponibilidadesDia({
    estadoMensual: estado,
    novedadesModernas,
    fecha: FECHA,
    turno: "tarde",
    categoria
  });

probar("51 estado mixto conserva ambas categorías", () => { const e=crearEstadoMixto(); assert.equal(e.estado.personal.length,2); });
probar("52 licencia de Enfermero no baja Licenciados", () => { const e=crearEstadoMixto(); e.estado.licencias=[licencia(e.enfermero)]; assert.equal(resolverMixto({estado:e.estado,categoria:"licenciado"}).porIdentidad.size,0); });
probar("53 licencia de otra categoría no genera warning falso", () => { const e=crearEstadoMixto(); e.estado.licencias=[licencia(e.enfermero)]; assert.equal(resolverMixto({estado:e.estado,categoria:"licenciado"}).advertencias.some(a=>a.codigo==="LICENCIA_PERSONA_NO_RESUELTA"),false); });
probar("54 licencia se detecta en Enfermeros", () => { const e=crearEstadoMixto(); e.estado.licencias=[licencia(e.enfermero)]; assert.equal(resolverMixto({estado:e.estado,categoria:"enfermero"}).porIdentidad.size,1); });
probar("55 certificación de otra categoría no genera warning falso", () => { const e=crearEstadoMixto(); e.estado.certificaciones=[licencia(e.enfermero)]; assert.equal(resolverMixto({estado:e.estado,categoria:"licenciado"}).advertencias.some(a=>a.codigo==="CERTIFICACION_PERSONA_NO_RESUELTA"),false); });
probar("56 certificación se detecta en Enfermeros", () => { const e=crearEstadoMixto(); e.estado.certificaciones=[licencia(e.enfermero)]; assert.equal(resolverMixto({estado:e.estado,categoria:"enfermero"}).porIdentidad.size,1); });
probar("57 novedad explícita ajena no genera warning", () => { const e=crearEstadoMixto(); const n=novedad(e.enfermero,TIPOS_NOVEDAD_PERSONAL.SUSPENSION,{turno:"tarde"}); assert.equal(resolverMixto({estado:e.estado,categoria:"licenciado",novedadesModernas:[n]}).advertencias.length,0); });
probar("58 novedad sin categoría resuelta no contamina Licenciados", () => { const e=crearEstadoMixto(); const n=novedad(e.enfermero,TIPOS_NOVEDAD_PERSONAL.SUSPENSION,{turno:"tarde",categoria:null}); const r=resolverMixto({estado:e.estado,categoria:"licenciado",novedadesModernas:[n]}); assert.equal(r.porIdentidad.size,0); assert.equal(r.advertencias.length,0); });
probar("59 personaId de otra categoría informa categoría", () => { const e=crearEstados(); const lic=persona("lic-origen","licenciado"); e.manana.personal.push(lic); const r=validar(e,extraOtroTurno({personaId:lic.id,id:lic.id,nombre:lic.nombre,funcionario:lic.funcionario})); assert.equal(r.motivo,"CATEGORIA_NO_COINCIDE"); });
probar("60 personaId realmente inexistente conserva diagnóstico", () => assert.equal(validar(crearEstados(),extraOtroTurno({personaId:"no-existe"})).motivo,"PERSONA_ID_NO_ENCONTRADA"));
probar("61 personaId de otra categoría no cae a funcionario", () => { const e=crearEstados(); const lic=persona("lic-origen","licenciado",{funcionario:origen.funcionario}); e.manana.personal.push(lic); assert.equal(validar(e,extraOtroTurno({personaId:lic.id})).motivo,"CATEGORIA_NO_COINCIDE"); });
probar("62 personaId de otra categoría no cae a nombre", () => { const e=crearEstados(); const lic=persona("lic-origen","licenciado",{nombre:origen.nombre}); e.manana.personal.push(lic); assert.equal(validar(e,extraOtroTurno({personaId:lic.id})).motivo,"CATEGORIA_NO_COINCIDE"); });
probar("63 No disponibles siguen aislados por categoría", () => { const e=crearEstadoMixto(); e.estado.calendario.enfermeros.noDisponibles[FECHA]=[{...referencia(e.enfermero),motivo:MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO}]; assert.equal(resolverMixto({estado:e.estado,categoria:"licenciado"}).porIdentidad.size,0); });
probar("64 dotaciones mixtas permanecen independientes", () => { const e=crearEstados(); const lic=persona("lic-destino","licenciado"); e.tarde=crearEstado("tarde",[destino,lic]); e.tarde.licencias=[licencia(destino)]; const r=agregar(e).turnos.tarde; assert.equal(r.enfermero.proyeccion.bajasConocidas.cantidad,1); assert.equal(r.licenciado.proyeccion.bajasConocidas.cantidad,0); });
probar("65 resolución categorial no muta estado", () => { const e=crearEstadoMixto(); e.estado.licencias=[licencia(e.enfermero)]; const antes=copiar(e.estado); resolverMixto({estado:e.estado,categoria:"licenciado"}); assert.deepEqual(e.estado,antes); });

console.log(`\nExtras Supervisión entre turnos: ${total}/${total} pruebas OK`);
