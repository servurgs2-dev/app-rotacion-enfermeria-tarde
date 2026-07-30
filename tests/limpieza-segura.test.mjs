import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  estaPlanillaVacia,
  reiniciarMesEnEstado,
  tieneContenidoSignificativo,
  vaciarPlanillaDesdeSemana2,
  vaciarPlanillaMensual,
  validarContextoLimpieza
} from "../src/utils/limpiezaSegura.js";
import {
  clasificarEstadoMesDestino,
  detectarContenidoMensual
} from "../src/utils/preparacionMesNuevo.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8");
let pruebas = 0;
const probar = (nombre, prueba) => {
  prueba();
  pruebas += 1;
  console.log(`✓ ${nombre}`);
};

const referencia = (id) => ({ personaId: id, nombre: `Persona ${id}` });
const planillaSemanal = {
  semana1: { A: referencia("1") },
  semana2: { A: referencia("2") },
  semana3: { A: referencia("3") },
  semana4: { A: referencia("4") },
  semana5: { A: referencia("5") },
  semana6: { A: referencia("6") },
  coberturaLibreSM: { semana1: referencia("7") },
  generacionFlexible: { version: 1, posicionesNoAplicables: ["T5"] },
  configuracionFutura: { conservar: true }
};

probar("vacía Semana 1 a Semana 6 de Enfermeros", () => {
  const resultado = vaciarPlanillaMensual({
    planilla: planillaSemanal,
    tipo: "enfermero"
  });
  for (let numero = 1; numero <= 6; numero += 1) {
    assert.deepEqual(resultado[`semana${numero}`], {});
  }
});
probar("vacía coberturaLibreSM de Enfermeros", () => {
  assert.deepEqual(vaciarPlanillaMensual({
    planilla: planillaSemanal,
    tipo: "enfermero"
  }).coberturaLibreSM, {});
});
probar("elimina generacionFlexible", () => {
  assert.equal(Object.hasOwn(vaciarPlanillaMensual({
    planilla: planillaSemanal,
    tipo: "enfermero"
  }), "generacionFlexible"), false);
});
probar("preserva configuración futura", () => {
  assert.deepEqual(vaciarPlanillaMensual({
    planilla: planillaSemanal,
    tipo: "enfermero"
  }).configuracionFutura, { conservar: true });
});
probar("vacía Licenciados sin aplicar reglas de Enfermeros", () => {
  const resultado = vaciarPlanillaMensual({
    planilla: { ...planillaSemanal, metadataLicenciados: true },
    tipo: "licenciado"
  });
  assert.deepEqual(resultado.semana1, {});
  assert.equal(resultado.metadataLicenciados, true);
});
probar("vacía coberturaLibreSM de Licenciados", () => {
  assert.deepEqual(vaciarPlanillaMensual({
    planilla: planillaSemanal,
    tipo: "licenciado"
  }).coberturaLibreSM, {});
});

const nocturna = {
  semana1: {},
  rotacion3Dias: {
    version: 3,
    fechaBase: "2026-07-02",
    duracionDias: 3,
    asignacionBase: { A: referencia("1") },
    bloques: { "2026-07-02": { A: referencia("1") } },
    coberturaLibreSM: { "2026-07-02": referencia("2") },
    estructuraFutura: "conservar"
  },
  generacionFlexible: { version: 1 }
};
const nocturnaVacia = vaciarPlanillaMensual({
  planilla: nocturna,
  tipo: "enfermero",
  usaRotacionTresDias: true
});
probar("Noche vacía asignacionBase", () => assert.deepEqual(nocturnaVacia.rotacion3Dias.asignacionBase, {}));
probar("Noche vacía bloques", () => assert.deepEqual(nocturnaVacia.rotacion3Dias.bloques, {}));
probar("Noche vacía cobertura nocturna", () => assert.deepEqual(nocturnaVacia.rotacion3Dias.coberturaLibreSM, {}));
probar("Noche conserva version", () => assert.equal(nocturnaVacia.rotacion3Dias.version, 3));
probar("Noche conserva fechaBase", () => assert.equal(nocturnaVacia.rotacion3Dias.fechaBase, "2026-07-02"));
probar("Noche conserva duracionDias", () => assert.equal(nocturnaVacia.rotacion3Dias.duracionDias, 3));
probar("Noche conserva configuración estructural futura", () => assert.equal(nocturnaVacia.rotacion3Dias.estructuraFutura, "conservar"));
probar("Noche elimina generacionFlexible", () => assert.equal(Object.hasOwn(nocturnaVacia, "generacionFlexible"), false));

probar("detecta planilla semanal ocupada", () => {
  assert.equal(estaPlanillaVacia({ planilla: planillaSemanal, tipo: "enfermero" }), false);
});
probar("detecta planilla semanal vacía", () => {
  assert.equal(estaPlanillaVacia({
    planilla: vaciarPlanillaMensual({ planilla: planillaSemanal, tipo: "enfermero" }),
    tipo: "enfermero"
  }), true);
});
probar("detecta planilla nocturna ocupada", () => {
  assert.equal(estaPlanillaVacia({
    planilla: nocturna,
    tipo: "enfermero",
    usaRotacionTresDias: true
  }), false);
});
probar("detecta planilla nocturna vacía", () => {
  assert.equal(estaPlanillaVacia({
    planilla: nocturnaVacia,
    tipo: "enfermero",
    usaRotacionTresDias: true
  }), true);
});
probar("mapa con fecha y array vacío se considera vacío", () => {
  assert.equal(tieneContenidoSignificativo({ "2026-08-01": [] }), false);
});
probar("mapa con fecha y objeto vacío se considera vacío", () => {
  assert.equal(tieneContenidoSignificativo({ "2026-08-01": {} }), false);
});
probar("semana con todas las filas vacías se considera vacía", () => {
  assert.equal(tieneContenidoSignificativo({ A: "", B: "" }), false);
});
probar("cobertura con valores vacíos se considera vacía", () => {
  assert.equal(tieneContenidoSignificativo({ semana1: "", semana2: "" }), false);
});
probar("bloque nocturno con filas vacías se considera vacío", () => {
  assert.equal(tieneContenidoSignificativo({
    "2026-08-01": { A: "", T1: "" }
  }), false);
});
probar("día de paro falso no cuenta como información", () => {
  assert.equal(tieneContenidoSignificativo({ "2026-08-01": false }), false);
});
probar("referencia real cuenta como contenido", () => {
  assert.equal(tieneContenidoSignificativo(referencia("1")), true);
});
probar("extra real cuenta como contenido", () => {
  assert.equal(tieneContenidoSignificativo([{ id: "extra-1", nombre: "Persona A" }]), true);
});
probar("licencia real cuenta como contenido", () => {
  assert.equal(tieneContenidoSignificativo([{ personaId: "1", desde: "2026-08-01" }]), true);
});
probar("detector ignora todos los contenedores operativos vacíos", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros.semana1 = { A: "", B: "" };
  estado.planillas.enfermeros.coberturaLibreSM = { semana1: "" };
  estado.planillas.enfermeros.rotacion3Dias.bloques = {
    "2026-08-01": { A: "", T1: "" }
  };
  estado.calendario.enfermeros.cambiosDia = { "2026-08-01": {} };
  estado.calendario.enfermeros.cambiosParoDia = { "2026-08-01": [] };
  estado.calendario.enfermeros.extras = { "2026-08-01": [] };
  estado.calendario.enfermeros.noDisponibles = { "2026-08-01": [] };
  estado.calendario.enfermeros.asistenciaDia = { "2026-08-01": {} };
  estado.calendario.enfermeros.cierresDia = { "2026-08-01": {} };
  estado.calendario.diasParo = { "2026-08-01": {} };
  assert.deepEqual(detectarContenidoMensual(estado), []);
  assert.equal(clasificarEstadoMesDestino({
    existeRemoto: true,
    estado
  }).permitido, true);
});
probar("detector conserva extras reales", () => {
  const estado = crearEstadoMensualVacio();
  estado.calendario.enfermeros.extras = {
    "2026-08-01": [{ id: "extra-1", nombre: "Persona A" }]
  };
  assert.ok(detectarContenidoMensual(estado).includes("enfermeros.extras"));
});
probar("detector conserva licencias reales", () => {
  const estado = crearEstadoMensualVacio();
  estado.licencias = [{ personaId: "1", desde: "2026-08-01" }];
  assert.ok(detectarContenidoMensual(estado).includes("Licencias"));
});

const contexto = {
  turnoId: "tarde",
  mesActivo: "2026-08",
  tipo: "enfermero",
  estrategia: "semanal",
  soloLectura: false,
  versionHistoricaActiva: false
};
probar("contexto idéntico valida", () => assert.equal(validarContextoLimpieza(contexto, { ...contexto }), true));
for (const campo of ["turnoId", "mesActivo", "tipo", "estrategia", "soloLectura", "versionHistoricaActiva"]) {
  probar(`cambio de ${campo} invalida`, () => {
    assert.equal(validarContextoLimpieza(contexto, {
      ...contexto,
      [campo]: typeof contexto[campo] === "boolean" ? !contexto[campo] : "otro"
    }), false);
  });
}

const planillaFuente = leer("src/components/planilla/PlanillaMensual.jsx");
const personalFuente = leer("src/components/personal/ListaPersonal.jsx");
const appFuente = leer("src/App.jsx");
probar("reiniciar mes crea exactamente el estado mensual vacío", () => {
  const anterior = {
    "tarde|2026-08": { personal: [{ id: "1" }] },
    "tarde|2026-07": { conservar: true },
    "noche|2026-08": { conservar: true }
  };
  const resultado = reiniciarMesEnEstado({
    estadoPorTurnoMes: anterior,
    clave: "tarde|2026-08",
    crearEstadoVacio: crearEstadoMensualVacio
  });
  assert.deepEqual(resultado["tarde|2026-08"], crearEstadoMensualVacio());
  assert.deepEqual(resultado["tarde|2026-07"], anterior["tarde|2026-07"]);
  assert.deepEqual(resultado["noche|2026-08"], anterior["noche|2026-08"]);
});
probar("reiniciar mes no muta el mapa anterior", () => {
  const anterior = { "tarde|2026-08": { personal: [{ id: "1" }] } };
  reiniciarMesEnEstado({
    estadoPorTurnoMes: anterior,
    clave: "tarde|2026-08",
    crearEstadoVacio: crearEstadoMensualVacio
  });
  assert.equal(anterior["tarde|2026-08"].personal.length, 1);
});
probar("existe botón Vaciar planilla", () => assert.match(planillaFuente, />\s*Vaciar planilla\s*</));
probar("modo solo lectura bloquea la limpieza de planilla", () => assert.match(planillaFuente, /if \(soloLectura \|\| versionHistoricaActiva \|\| planillaEstaVacia\) return/));
probar("historial bloquea la limpieza de planilla", () => assert.match(planillaFuente, /!soloLectura && !versionHistoricaActiva/));
probar("planilla vacía deshabilita el botón", () => assert.match(planillaFuente, /disabled=\{planillaEstaVacia\}/));
probar("confirmar usa una única llamada funcional", () => {
  const inicio = planillaFuente.indexOf("const confirmarLimpiezaPlanilla");
  const funcion = planillaFuente.slice(
    inicio,
    planillaFuente.indexOf("const abrirIntercambio", inicio)
  );
  assert.equal((funcion.match(/setPlanilla\(/g) || []).length, 1);
  assert.match(funcion, /setPlanilla\(\(prev\) =>/);
});
probar("cancelar no modifica la planilla", () => assert.match(planillaFuente, /onCancelar=\{\(\) => setLimpiezaPlanilla\(null\)\}/));
probar("limpieza de Personal exige confirmación", () => assert.match(personalFuente, /PanelConfirmacionLimpieza/));
probar("Personal vacío deshabilita su limpieza", () => assert.match(personalFuente, /disabled=\{soloLectura \|\| personal\.length === 0\}/));
probar("cancelar Personal no ejecuta el borrado", () => assert.match(personalFuente, /onCancelar=\{\(\) => setLimpiezaPersonal\(null\)\}/));
probar("confirmar Personal llama una sola vez a la función existente", () => {
  const funcion = personalFuente.slice(
    personalFuente.indexOf("const confirmarLimpiezaPersonal"),
    personalFuente.indexOf("const iniciarEdicionNombre")
  );
  assert.equal((funcion.match(/onLimpiarPersonal\(\)/g) || []).length, 1);
});
probar("App conserva el alcance existente de limpiarPersonal", () => {
  assert.match(appFuente, /const limpiarPersonal = \(\) =>/);
  assert.match(appFuente, /limpiarReferenciasDePersona\(mes, persona\)/);
});
probar("no se modifica la cola de autosave ni CAS", () => assert.doesNotMatch(planillaFuente + personalFuente, /guardarEstadoTurnoMesConRevision|colaGuardadoRef/));
probar("no se integra limpieza con Calendario Diario ni PDF", () => assert.doesNotMatch(planillaFuente + personalFuente, /exportarPlanillaPDF|CalendarioDiario/));
probar("existe acción global Reiniciar mes completo", () => {
  assert.match(appFuente, />\s*Reiniciar mes completo\s*</);
  assert.match(appFuente, /PanelReiniciarMes/);
});
probar("reinicio exige escribir REINICIAR", () => {
  const panel = leer("src/components/mes/PanelReiniciarMes.jsx");
  assert.match(panel, /textoConfirmacion\.trim\(\) === "REINICIAR"/);
  assert.match(panel, /disabled=\{!confirmacionValida\}/);
});
probar("cancelar reinicio no modifica estado", () => {
  assert.match(appFuente, /onCancelar=\{\(\) => setReinicioMes\(null\)\}/);
});
probar("confirmar reinicio usa una única actualización funcional", () => {
  const inicio = appFuente.indexOf("const confirmarReinicioMes");
  const fin = appFuente.indexOf("const iniciarPreparacionMes", inicio);
  const bloque = appFuente.slice(inicio, fin);
  assert.equal((bloque.match(/setEstadoPorTurnoMes\(/g) || []).length, 1);
  assert.match(bloque, /setEstadoPorTurnoMes\(\(prev\) =>/);
});
probar("reinicio revalida turno, mes, permiso, conflicto y revisión", () => {
  const inicio = appFuente.indexOf("const confirmarReinicioMes");
  const fin = appFuente.indexOf("const iniciarPreparacionMes", inicio);
  const bloque = appFuente.slice(inicio, fin);
  for (const patron of [
    "turnoActivo",
    "mesActivo",
    "revisionConfirmada",
    "puedeEditarActivo",
    "modoSoloLecturaEfectiva",
    "metadatos?.conflicto"
  ]) assert.ok(bloque.includes(patron), patron);
});

const semanalDesdeDos = {
  posicionesMensualesAdicionales: ["T6"],
  semana1: {
    "REA 1": referencia("1"),
    T1: "Persona histórica",
    T6: referencia("6"),
    SM: referencia("sm")
  },
  semana2: {
    "REA 1": referencia("2"),
    T1: referencia("t2"),
    T6: referencia("t6-2"),
    SM: referencia("sm2")
  },
  semana3: { "REA 1": referencia("3"), T6: referencia("t6-3") },
  semana4: { "REA 1": referencia("4") },
  semana5: { "REA 1": referencia("5") },
  semana6: { "REA 1": referencia("6") },
  asignacionesParciales: {
    semana1: [{ id: "p1", sector: "T6" }],
    semana2: [{ id: "p2", sector: "REA 1" }],
    semana6: [{ id: "p6", sector: "SM" }],
    "2026-07-02": [{ id: "n1", sector: "T6" }]
  },
  rotacion3Dias: {
    version: 1,
    fechaBase: "2026-07-02",
    duracionDias: 3,
    asignacionBase: { T6: referencia("base") },
    bloques: { "2026-07-02": { T6: referencia("bloque") } }
  },
  generacionFlexible: { version: 1 },
  metadataFutura: { conservar: true }
};
const limpiaDesdeDos = vaciarPlanillaDesdeSemana2({
  planilla: semanalDesdeDos,
  tipo: "enfermero"
});

probar("desde Semana 2 conserva íntegramente Semana 1", () =>
  assert.deepEqual(limpiaDesdeDos.semana1, semanalDesdeDos.semana1));
probar("desde Semana 2 conserva la referencia de Semana 1", () =>
  assert.equal(limpiaDesdeDos.semana1, semanalDesdeDos.semana1));
for (let numero = 2; numero <= 6; numero += 1) {
  probar(`desde Semana 2 vacía Semana ${numero}`, () =>
    assert.ok(Object.values(limpiaDesdeDos[`semana${numero}`]).every(
      (valor) => valor === ""
    )));
}
probar("no crea Semana 6 cuando no existía", () => {
  const resultado = vaciarPlanillaDesdeSemana2({
    planilla: { semana1: {}, semana2: { A: referencia("1") } }
  });
  assert.equal(Object.hasOwn(resultado, "semana6"), false);
});
probar("conserva SM de Semana 1", () =>
  assert.equal(limpiaDesdeDos.semana1.SM, semanalDesdeDos.semana1.SM));
probar("vacía SM desde Semana 2", () =>
  assert.equal(limpiaDesdeDos.semana2.SM, ""));
probar("conserva Turnantes normales de Semana 1", () =>
  assert.equal(limpiaDesdeDos.semana1.T1, "Persona histórica"));
probar("vacía Turnantes normales desde Semana 2", () =>
  assert.equal(limpiaDesdeDos.semana2.T1, ""));
probar("conserva T6 habilitado", () =>
  assert.deepEqual(limpiaDesdeDos.posicionesMensualesAdicionales, ["T6"]));
probar("conserva T6 asignado en Semana 1", () =>
  assert.equal(limpiaDesdeDos.semana1.T6, semanalDesdeDos.semana1.T6));
probar("vacía T6 desde Semana 2", () =>
  assert.equal(limpiaDesdeDos.semana2.T6, ""));
probar("conserva T3 habilitado y asignado en Semana 1", () => {
  const semana1 = { T3: referencia("l1") };
  const resultado = vaciarPlanillaDesdeSemana2({
    planilla: {
      posicionesMensualesAdicionales: ["T3"],
      semana1,
      semana2: { T3: referencia("l2") }
    },
    tipo: "licenciado"
  });
  assert.deepEqual(resultado.posicionesMensualesAdicionales, ["T3"]);
  assert.equal(resultado.semana1, semana1);
});
probar("vacía T3 desde Semana 2", () =>
  assert.equal(vaciarPlanillaDesdeSemana2({
    planilla: { semana1: {}, semana2: { T3: referencia("l2") } }
  }).semana2.T3, ""));
probar("conserva parciales de Semana 1", () =>
  assert.equal(
    limpiaDesdeDos.asignacionesParciales.semana1,
    semanalDesdeDos.asignacionesParciales.semana1
  ));
probar("elimina parciales de Semana 2", () =>
  assert.equal(Object.hasOwn(limpiaDesdeDos.asignacionesParciales, "semana2"), false));
probar("elimina parciales de todas las semanas posteriores", () =>
  assert.equal(Object.keys(limpiaDesdeDos.asignacionesParciales).some(
    (clave) => /^semana\d+$/.test(clave) && clave !== "semana1"
  ), false));
probar("no modifica parciales nocturnas", () =>
  assert.equal(
    limpiaDesdeDos.asignacionesParciales["2026-07-02"],
    semanalDesdeDos.asignacionesParciales["2026-07-02"]
  ));
probar("no modifica rotacion3Dias ni asignacionBase", () => {
  assert.equal(limpiaDesdeDos.rotacion3Dias, semanalDesdeDos.rotacion3Dias);
  assert.equal(
    limpiaDesdeDos.rotacion3Dias.asignacionBase,
    semanalDesdeDos.rotacion3Dias.asignacionBase
  );
});
probar("no muta la planilla original", () =>
  assert.equal(semanalDesdeDos.semana2.T6.personaId, "t6-2"));
probar("funciona con Enfermeros", () =>
  assert.equal(limpiaDesdeDos.semana2["REA 1"], ""));
probar("funciona con Licenciados", () =>
  assert.equal(vaciarPlanillaDesdeSemana2({
    planilla: { semana1: {}, semana2: { "Triage 1": referencia("l") } },
    tipo: "licenciado"
  }).semana2["Triage 1"], ""));
probar("conserva referencias personaId de Semana 1", () =>
  assert.equal(limpiaDesdeDos.semana1["REA 1"].personaId, "1"));
probar("conserva referencias históricas por nombre", () =>
  assert.equal(limpiaDesdeDos.semana1.T1, "Persona histórica"));
probar("funciona sin posicionesMensualesAdicionales", () =>
  assert.equal(vaciarPlanillaDesdeSemana2({
    planilla: { semana1: {}, semana2: { A: referencia("1") } }
  }).semana2.A, ""));
probar("repetir sobre semanas vacías es seguro", () =>
  assert.deepEqual(
    vaciarPlanillaDesdeSemana2({ planilla: limpiaDesdeDos }),
    limpiaDesdeDos
  ));
probar("conserva metadata mensual", () => {
  assert.equal(limpiaDesdeDos.generacionFlexible, semanalDesdeDos.generacionFlexible);
  assert.equal(limpiaDesdeDos.metadataFutura, semanalDesdeDos.metadataFutura);
});
probar("el botón se oculta en rotación nocturna de tres días", () =>
  assert.match(
    planillaFuente,
    /\{!usaRotacionTresDias && \(\s*<button[\s\S]*Vaciar desde Semana 2/
  ));
probar("el botón aparece en planificación nocturna histórica semanal", () =>
  assert.doesNotMatch(planillaFuente, /turnoId\s*!==\s*["']noche/));
probar("el botón no aparece en solo lectura ni versión histórica", () =>
  assert.match(planillaFuente, /\{!soloLectura && !versionHistoricaActiva && \(/));
probar("cancelar confirmación no llama setPlanilla", () => {
  const inicio = planillaFuente.indexOf("const vaciarDesdeSemana2");
  const fin = planillaFuente.indexOf("function actualizarCelda", inicio);
  const bloque = planillaFuente.slice(inicio, fin);
  assert.match(bloque, /if \(!confirmado\) return;\s*setPlanilla/);
});
probar("Vaciar planilla existente conserva su helper", () =>
  assert.match(planillaFuente, /vaciarPlanillaMensual\(\{/));
probar("PDF y grupos de libres no se integran a esta acción", () => {
  assert.doesNotMatch(planillaFuente, /crearPlanillaSemanalPDF/);
  assert.doesNotMatch(planillaFuente, /renderizarGruposLibresPDF/);
});
probar("no existe SQL nuevo en la limpieza", () =>
  assert.doesNotMatch(
    leer("src/utils/limpiezaSegura.js"),
    /\b(select|insert|update|delete from|create table|alter table)\b/i
  ));

console.log(`\n${pruebas} pruebas de limpieza segura pasaron.`);
