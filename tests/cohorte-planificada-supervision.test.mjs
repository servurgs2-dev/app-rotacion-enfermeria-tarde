import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerFilasActivas
} from "../src/utils/configuracionPlanilla.js";
import { esDiaLibre, obtenerSemanasDelMes } from "../src/utils/fechas.js";
import { obtenerBloqueParaFecha } from "../src/utils/periodosRotacionPlanilla.js";
import { resolverPeriodoPlanillaDia } from "../src/utils/periodoPlanillaDia.js";
import { resolverCohortePlanillaDia } from "../src/utils/proyeccionDotacionSupervision.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const ref = (persona) => ({ personaId: persona.id, nombre: persona.nombre });
const persona = (id, categoria = "enfermero", extra = {}) => ({
  id,
  funcionario: id,
  nombre: `Persona ${id}`,
  categoria,
  ...extra
});

const crearEscenario = ({ turno = "tarde", categoria = "enfermero", mes = "2026-08" } = {}) => {
  const snapshot = crearSnapshotConfiguracionPlanilla({ turno, categoria, mes });
  const filas = obtenerFilasActivas(snapshot.filas);
  const personas = [persona("p1", categoria), persona("p2", categoria), persona("p3", categoria)];
  const distribucion = {
    [filas[0].etiqueta]: ref(personas[0]),
    [filas[1].etiqueta]: ref(personas[1])
  };
  const planilla = {
    semana1: {}, semana2: {}, semana3: {}, semana4: {}, semana5: {}, semana6: {},
    coberturaLibreSM: {}, asignacionesParciales: {}
  };
  obtenerSemanasDelMes(mes).forEach(({ clave }) => { planilla[clave] = copiar(distribucion); });
  const estado = {
    turnoId: turno,
    mes,
    personal: personas,
    licencias: [],
    certificaciones: [],
    configuracionPlanilla: { [categoria]: snapshot },
    planillas: {
      enfermeros: categoria === "enfermero" ? planilla : {},
      licenciados: categoria === "licenciado" ? planilla : {}
    },
    calendario: {
      enfermeros: { extras: {}, noDisponibles: {}, asistenciaDia: {} },
      licenciados: { extras: {}, noDisponibles: {}, asistenciaDia: {} }
    }
  };
  return { estado, snapshot, filas, personas, distribucion, planilla, turno, categoria, mes };
};
const resolver = (escenario, fecha = `${escenario.mes}-10`) => resolverCohortePlanillaDia({
  estadoMensual: escenario.estado,
  fecha,
  turno: escenario.turno,
  categoria: escenario.categoria,
  mes: escenario.mes
});

probar("1 resuelve la semana correcta", () => {
  const e = crearEscenario();
  assert.equal(resolver(e, "2026-08-10").periodo.clave, "semana3");
});
probar("2 resuelve semana 6 cuando el mes la contiene", () => {
  const e = crearEscenario({ mes: "2026-08" });
  assert.equal(obtenerSemanasDelMes(e.mes).length, 6);
  assert.equal(resolver(e, "2026-08-31").periodo.clave, "semana6");
});
probar("3 selecciona rotación de tres días para enfermeros de Noche", () => {
  const e = crearEscenario({ turno: "noche" });
  const bloque = obtenerBloqueParaFecha({ fecha: "2026-08-10", fechaBase: "2026-07-02", duracionDias: 3 });
  e.planilla.rotacion3Dias = { bloques: { [bloque.clave]: copiar(e.distribucion) }, coberturaLibreSM: {} };
  assert.equal(resolver(e, "2026-08-10").periodo.tipo, "cada_3_dias");
});
probar("4 selecciona la clave exacta del bloque", () => {
  const e = crearEscenario({ turno: "noche" });
  const bloque = obtenerBloqueParaFecha({ fecha: "2026-08-11", fechaBase: "2026-07-02", duracionDias: 3 });
  e.planilla.rotacion3Dias = { bloques: { [bloque.clave]: copiar(e.distribucion) }, coberturaLibreSM: {} };
  assert.equal(resolver(e, "2026-08-11").periodo.clave, bloque.clave);
});
probar("5 acepta turno y categoría válidos", () => assert.equal(resolver(crearEscenario()).ok, true));
probar("6 estado null no devuelve cero engañoso", () => {
  const r = resolverCohortePlanillaDia({ estadoMensual: null, fecha: "2026-08-10", turno: "tarde", categoria: "enfermero", mes: "2026-08" });
  assert.equal(r.ok, false); assert.equal(r.cohortePlanilla, null);
});
probar("7 Planilla no preparada no devuelve cero engañoso", () => {
  const e = crearEscenario(); delete e.estado.planillas.enfermeros.semana3;
  const r = resolver(e); assert.equal(r.ok, false); assert.equal(r.previstosBase, null);
});
probar("8 rechaza fecha fuera del mes", () => assert.equal(resolver(crearEscenario(), "2026-09-01").errores[0].codigo, "FECHA_FUERA_DEL_MES"));
probar("9 una persona simple cuenta una", () => assert.equal(resolver(crearEscenario()).cohortePlanilla.cantidad, 2));
probar("10 misma persona en dos filas cuenta una", () => {
  const e = crearEscenario(); e.planilla.semana3[e.filas[1].etiqueta] = ref(e.personas[0]);
  assert.equal(resolver(e).cohortePlanilla.cantidad, 1);
});
probar("11 Turnante cuenta una", () => {
  const e = crearEscenario(); const fila = e.filas.find((actual) => actual.tipo === "turnante");
  e.planilla.semana3[fila.etiqueta] = ref(e.personas[2]);
  assert.equal(resolver(e).cohortePlanilla.cantidad, 3);
});
probar("12 Turnante duplicado con sector cuenta una", () => {
  const e = crearEscenario(); const fila = e.filas.find((actual) => actual.tipo === "turnante");
  e.planilla.semana3[fila.etiqueta] = ref(e.personas[0]);
  assert.equal(resolver(e).cohortePlanilla.cantidad, 2);
});
probar("13 asignación fija no se suma aparte", () => {
  const e = crearEscenario(); e.snapshot.asignacionesFijas = [{ sectorId: e.filas[0].sectorId, personaId: e.personas[0].id }];
  assert.equal(resolver(e).cohortePlanilla.cantidad, 2);
});
probar("14 sector desactivado no aporta", () => {
  const e = crearEscenario(); e.snapshot.filas[0].activo = false;
  assert.equal(resolver(e).cohortePlanilla.cantidad, 1);
});
probar("15 reintegro parcial no aparece antes de su fecha", () => {
  const e = crearEscenario(); const nueva = persona("p4"); e.estado.personal.push(nueva);
  e.estado.licencias.push({ personaId: e.personas[0].id, desde: "2026-08-01", hasta: "2026-08-12" });
  e.planilla.asignacionesParciales.semana3 = [{ id: "a1", personaId: nueva.id, sector: e.filas[0].etiqueta, desde: "2026-08-12", hasta: "2026-08-16" }];
  assert.equal(resolver(e, "2026-08-10").cohortePlanilla.personas.some((p) => p.personaId === nueva.id), false);
});
probar("16 reintegro parcial aparece desde su fecha efectiva", () => {
  const e = crearEscenario(); const nueva = persona("p4"); e.estado.personal.push(nueva);
  e.estado.licencias.push({ personaId: e.personas[0].id, desde: "2026-08-01", hasta: "2026-08-12" });
  e.planilla.asignacionesParciales.semana3 = [{ id: "a1", personaId: nueva.id, sector: e.filas[0].etiqueta, desde: "2026-08-12", hasta: "2026-08-16" }];
  assert.equal(resolver(e, "2026-08-12").cohortePlanilla.personas.some((p) => p.personaId === nueva.id), true);
});
probar("17 reintegrado sin sector integra la cohorte desde su retorno", () => {
  const e = crearEscenario(); const nueva = persona("p4"); e.estado.personal.push(nueva);
  e.estado.licencias.push({ personaId: nueva.id, desde: "2026-07-20", hasta: "2026-08-09" });
  assert.equal(resolver(e, "2026-08-10").cohortePlanilla.personas.some((p) => p.personaId === nueva.id), true);
});
probar("18 libre permanece en cohortePlanilla", () => {
  const e = crearEscenario(); e.personas[0].libre = [1,2,3,4,5].find((fase) => esDiaLibre({ libre: fase }, new Date(2026,7,10,12)));
  assert.equal(resolver(e).cohortePlanilla.personas.some((p) => p.personaId === "p1"), true);
});
probar("19 libre aparece en libresProgramados", () => {
  const e = crearEscenario(); e.personas[0].libre = [1,2,3,4,5].find((fase) => esDiaLibre({ libre: fase }, new Date(2026,7,10,12)));
  assert.equal(resolver(e).libresProgramados.personas[0].personaId, "p1");
});
probar("20 libre no aparece en previstosBase", () => {
  const e = crearEscenario(); e.personas[0].libre = [1,2,3,4,5].find((fase) => esDiaLibre({ libre: fase }, new Date(2026,7,10,12)));
  assert.equal(resolver(e).previstosBase.personas.some((p) => p.personaId === "p1"), false);
});
probar("21 persona no libre aparece en previstosBase", () => assert.equal(resolver(crearEscenario()).previstosBase.cantidad, 2));
probar("22 varios libres se separan", () => {
  const e = crearEscenario(); const fase = [1,2,3,4,5].find((n) => esDiaLibre({ libre:n }, new Date(2026,7,10,12)));
  e.personas[0].libre = fase; e.personas[1].libre = fase;
  assert.equal(resolver(e).libresProgramados.cantidad, 2);
});
probar("23 cantidad de cohorte correcta", () => assert.equal(resolver(crearEscenario()).cohortePlanilla.cantidad, 2));
probar("24 cantidad de libres correcta", () => assert.equal(resolver(crearEscenario()).libresProgramados.cantidad, 0));
probar("25 cantidad de previstos correcta", () => assert.equal(resolver(crearEscenario()).previstosBase.cantidad, 2));
probar("26 Enfermeros y Licenciados permanecen independientes", () => assert.equal(resolver(crearEscenario({ categoria:"licenciado" })).previstosBase.personas.every((p) => p.personaId), true));
probar("27 deduplica por personaId", () => {
  const e = crearEscenario(); e.planilla.semana3[e.filas[1].etiqueta] = { personaId:"p1", nombre:"Renombrada" };
  assert.equal(resolver(e).cohortePlanilla.cantidad, 1);
});
probar("28 usa funcionario como fallback legacy de identidad", () => {
  const e = crearEscenario(); e.personas[0].funcionario = "77";
  e.planilla.semana3[e.filas[0].etiqueta] = { funcionario:"77", nombre:"Nombre anterior" };
  e.planilla.semana3[e.filas[1].etiqueta] = { funcionario:"77", nombre:"Otro nombre anterior" };
  assert.equal(resolver(e).cohortePlanilla.cantidad, 1);
  assert.equal(resolver(e).cohortePlanilla.personas[0].personaId, "p1");
});
probar("29 usa nombre legacy cuando la coincidencia es inequívoca", () => {
  const e = crearEscenario(); e.planilla.semana3[e.filas[0].etiqueta] = e.personas[0].nombre;
  assert.equal(resolver(e).cohortePlanilla.personas.some((p) => p.personaId === "p1"), true);
});
probar("30 identidad ambigua produce advertencia", () => {
  const e = crearEscenario(); e.estado.personal.push(persona("p4", "enfermero", { nombre:e.personas[0].nombre })); e.planilla.semana3[e.filas[0].etiqueta] = e.personas[0].nombre;
  assert.equal(resolver(e).advertencias.some((a) => a.codigo === "IDENTIDAD_AMBIGUA"), true);
});
probar("31 no descuenta licencias", () => {
  const e = crearEscenario(); e.estado.licencias.push({ personaId:"p1", desde:"2026-08-01", hasta:"2026-08-20" });
  assert.equal(resolver(e).previstosBase.personas.some((p) => p.personaId === "p1"), true);
});
probar("32 no descuenta certificaciones", () => {
  const e = crearEscenario(); e.estado.certificaciones.push({ personaId:"p1", desde:"2026-08-01", hasta:"2026-08-20" });
  assert.equal(resolver(e).previstosBase.cantidad, 2);
});
probar("33 no descuenta No disponibles", () => {
  const e = crearEscenario(); e.estado.calendario.enfermeros.noDisponibles["2026-08-10"] = [ref(e.personas[0])];
  assert.equal(resolver(e).previstosBase.cantidad, 2);
});
probar("34 no incorpora Extras", () => {
  const e = crearEscenario(); e.estado.calendario.enfermeros.extras["2026-08-10"] = [persona("extra")];
  assert.equal(resolver(e).cohortePlanilla.cantidad, 2);
});
probar("35 no aplica asistencia", () => {
  const e = crearEscenario(); e.estado.calendario.enfermeros.asistenciaDia["2026-08-10"] = { "id:p1": { estado:"ausente" } };
  assert.equal(resolver(e).previstosBase.cantidad, 2);
});
probar("36 no ejecuta coberturas", () => {
  const e = crearEscenario(); e.planilla.coberturaLibreSM.semana3 = ref(e.personas[2]);
  assert.equal(resolver(e).cohortePlanilla.cantidad, 2);
});
probar("37 no muta entradas", () => {
  const e = crearEscenario(); const antes = copiar(e.estado); resolver(e); assert.deepEqual(e.estado, antes);
});
probar("38 Calendario consume el mismo selector de período extraído", () => {
  const fuente = fs.readFileSync(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8");
  assert.match(fuente, /resolverPeriodoPlanillaDia\(\{/);
  assert.doesNotMatch(fuente, /semanaKeyFromDate\(fecha, mesActivo\)/);
  const e = crearEscenario();
  assert.equal(resolverPeriodoPlanillaDia({ estadoMensual:e.estado, fecha:"2026-08-10", turno:e.turno, categoria:e.categoria, mes:e.mes }).clavePeriodo, "semana3");
});
probar("39 mes realmente inexistente permanece sin datos", () => {
  const r = resolverCohortePlanillaDia({ estadoMensual:null, fecha:"2026-08-10", turno:"tarde", categoria:"enfermero", mes:"2026-08" });
  assert.equal(r.disponible, false); assert.equal(r.previstosBase, null);
});
probar("40 período semanal existente y explícitamente vacío es válido", () => {
  const e = crearEscenario(); e.planilla.semana3 = {};
  const r = resolver(e); assert.equal(r.disponible, true); assert.equal(r.cohortePlanilla.cantidad, 0);
});
probar("41 semana vaciada con filas vacías es válida y tiene cohorte cero", () => {
  const e = crearEscenario(); e.planilla.semana3 = Object.fromEntries(e.filas.map((fila) => [fila.etiqueta, ""]));
  const r = resolver(e); assert.equal(r.ok, true); assert.equal(r.previstosBase.cantidad, 0);
});
probar("42 bloque de tres días existente y vacío es válido", () => {
  const e = crearEscenario({ turno:"noche" });
  const bloque = obtenerBloqueParaFecha({ fecha:"2026-08-10", fechaBase:"2026-07-02", duracionDias:3 });
  e.planilla.rotacion3Dias = { bloques:{ [bloque.clave]:{} }, coberturaLibreSM:{} };
  const r = resolver(e); assert.equal(r.ok, true); assert.equal(r.cohortePlanilla.cantidad, 0);
});
probar("43 personaId obsoleto no suma", () => {
  const e = crearEscenario(); e.planilla.semana3[e.filas[0].etiqueta] = { personaId:"fantasma", nombre:"Persona fantasma" };
  const r = resolver(e); assert.equal(r.cohortePlanilla.personas.some((p) => p.personaId === "fantasma"), false);
  assert.equal(r.advertencias.some((a) => a.codigo === "REFERENCIA_NO_RESUELTA"), true);
});
probar("44 funcionario inexistente no suma", () => {
  const e = crearEscenario(); e.planilla.semana3[e.filas[0].etiqueta] = { funcionario:"999999", nombre:"Viejo" };
  const r = resolver(e); assert.equal(r.cohortePlanilla.cantidad, 1);
  assert.equal(r.advertencias.some((a) => a.codigo === "REFERENCIA_NO_RESUELTA"), true);
});
probar("45 funcionario existente resuelve la persona mensual real", () => {
  const e = crearEscenario(); e.personas[0].funcionario = "123";
  e.planilla.semana3[e.filas[0].etiqueta] = { funcionario:"123", nombre:"Nombre Viejo" };
  const encontrada = resolver(e).cohortePlanilla.personas.find((p) => p.personaId === "p1");
  assert.equal(encontrada.nombre, e.personas[0].nombre);
});
probar("46 nombre inequívoco sigue resolviendo contra Personal", () => {
  const e = crearEscenario(); e.planilla.semana3[e.filas[0].etiqueta] = e.personas[0].nombre;
  assert.equal(resolver(e).cohortePlanilla.personas.some((p) => p.personaId === "p1"), true);
});
probar("47 nombre ambiguo no suma arbitrariamente", () => {
  const e = crearEscenario(); e.estado.personal.push(persona("p4", "enfermero", { nombre:e.personas[0].nombre })); e.planilla.semana3[e.filas[0].etiqueta] = e.personas[0].nombre;
  const r = resolver(e); assert.equal(r.cohortePlanilla.personas.some((p) => p.personaId === "p1" || p.personaId === "p4"), false);
});
probar("48 referencia desconocida advierte y no crea persona sintética", () => {
  const e = crearEscenario(); e.planilla.semana3[e.filas[0].etiqueta] = { nombre:"Nadie conocido" };
  const r = resolver(e); assert.equal(r.advertencias[0].codigo, "REFERENCIA_NO_RESUELTA"); assert.equal(r.cohortePlanilla.cantidad, 1);
});
probar("49 ningún objeto no resuelto se acepta por identidad propia", () => {
  const e = crearEscenario(); e.planilla.semana3[e.filas[0].etiqueta] = { id:"inventado", funcionario:"888", nombre:"Inventada" };
  assert.equal(resolver(e).cohortePlanilla.personas.some((p) => p.personaId === "inventado"), false);
});
probar("50 Calendario conserva período vacío y fallback visual anterior", () => {
  const e = crearEscenario(); e.planilla.semana3 = {};
  const periodo = resolverPeriodoPlanillaDia({ estadoMensual:e.estado, planilla:e.planilla, fecha:"2026-08-10", turno:e.turno, categoria:e.categoria, mes:e.mes });
  assert.equal(periodo.ok, true); assert.deepEqual(periodo.distribucion, {}); assert.equal(periodo.clavePeriodo, "semana3");
  const fuente = fs.readFileSync(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8");
  assert.match(fuente, /planillaPeriodo: resultado\.distribucion \|\| \{\}/);
});

console.log(`\n${total} pruebas de cohorte planificada de Supervisión superadas.`);
