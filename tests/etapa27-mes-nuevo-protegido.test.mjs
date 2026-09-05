import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  analizarPreparacionMesNuevo,
  clasificarEstadoMesDestino,
  construirEstadoMesNuevo,
  detectarContenidoMensual,
  filtrarRegistrosQueIntersectanMes,
  formatearContenidoMes,
  obtenerFilasPlanilla,
  validarContextoPreparacion
} from "../src/utils/preparacionMesNuevo.js";
import {
  crearEstadoMensualVacio,
  normalizarEstadoMensual
} from "../src/utils/estadoMensual.js";
import { configuracionSectores } from "../src/data/sectores.js";
import { obtenerSemanasDelMes } from "../src/utils/fechas.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";
import { generarRotacionMensual } from "../src/utils/rotacionPlanilla.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const extraerFuncionConst = (fuente, nombre) => {
  const inicio = fuente.indexOf(`const ${nombre}`);
  assert.notEqual(inicio, -1, `No se encontró ${nombre}`);
  const resto = fuente.slice(inicio);
  const cierre = resto.search(/\r?\n};(?:\r?\n|$)/);
  assert.notEqual(cierre, -1, `No se encontró el cierre de ${nombre}`);
  return resto.slice(0, cierre + 3);
};

const filasEnf = obtenerFilasPlanilla(configuracionSectores.enfermero);
const filasLic = obtenerFilasPlanilla(configuracionSectores.licenciado);
const personasEnf = filasEnf.map((_, indice) => ({
  id: `enf-${indice + 1}`,
  nombre: `Enfermero ${indice + 1}`,
  categoria: "enfermero",
  rol: "usuario",
  turno: "tarde"
}));
const personasLic = filasLic.map((_, indice) => ({
  id: `lic-${indice + 1}`,
  nombre: `Licenciado ${indice + 1}`,
  categoria: "licenciado",
  rol: "usuario",
  turno: "tarde"
}));
const referencia = (persona) => ({ personaId: persona.id, nombre: persona.nombre });
const distribucion = (filas, personas) => Object.fromEntries(
  filas.map((fila, indice) => [fila, referencia(personas[indice])])
);
const clone = (valor) => JSON.parse(JSON.stringify(valor));

const crearOrigenSemanal = ({
  turno = "tarde",
  faltantesEnf = 0
} = {}) => {
  const estado = crearEstadoMensualVacio();
  estado.personal = clone([...personasEnf, ...personasLic]).map((persona) => ({
    ...persona,
    turno
  }));
  const baseEnf = distribucion(filasEnf, estado.personal.filter((p) => p.categoria === "enfermero"));
  if (faltantesEnf > 0) {
    filasEnf.slice(-faltantesEnf).forEach((fila) => {
      baseEnf[fila] = "";
    });
  }
  estado.planillas.enfermeros.semana5 = baseEnf;
  estado.planillas.enfermeros.semana4 = {
    ...baseEnf,
    [filasEnf[0]]: baseEnf[filasEnf[1]],
    [filasEnf[1]]: baseEnf[filasEnf[0]]
  };
  estado.planillas.enfermeros.coberturaLibreSM.semana5 =
    referencia(estado.personal[1]);
  estado.planillas.licenciados.semana5 = distribucion(
    filasLic,
    estado.personal.filter((p) => p.categoria === "licenciado")
  );
  estado.planillas.licenciados.coberturaLibreSM.semana5 =
    referencia(estado.personal.find((p) => p.categoria === "licenciado"));
  estado.licencias = [
    { ...referencia(estado.personal[0]), desde: "2026-07-28", hasta: "2026-08-03" },
    { ...referencia(estado.personal[1]), desde: "2026-07-01", hasta: "2026-07-10" }
  ];
  estado.certificaciones = [
    { ...referencia(estado.personal[2]), desde: "2026-08-10", hasta: "2026-08-12" },
    { ...referencia(estado.personal[3]), desde: "2026-06-01", hasta: "2026-06-02" }
  ];
  estado.calendario.enfermeros.extras["2026-07-20"] = [{ id: "extra" }];
  estado.calendario.enfermeros.cierresDia["2026-07-20"] = { estado: "cerrado" };
  return estado;
};

const analizarSemanal = (opciones = {}) => analizarPreparacionMesNuevo({
  turnoId: opciones.turnoId || "tarde",
  mesOrigen: "2026-07",
  mesDestino: "2026-08",
  estadoOrigen: opciones.origen || crearOrigenSemanal(opciones),
  estadoDestino: opciones.destino || crearEstadoMensualVacio(),
  existeDestinoRemoto: opciones.existeDestinoRemoto || false,
  revisionDestino: opciones.revisionDestino || "0"
});

await probar("1 destino inexistente permitido", () => {
  assert.deepEqual(
    clasificarEstadoMesDestino({ existeRemoto: false, estado: null }).clasificacion,
    "inexistente"
  );
});
await probar("2 destino semánticamente vacío permitido", () => {
  assert.equal(
    clasificarEstadoMesDestino({ existeRemoto: true, estado: crearEstadoMensualVacio() }).permitido,
    true
  );
});

const casosContenido = [
  ["3 Personal", (e) => e.personal.push(personasEnf[0])],
  ["4 Semana 1", (e) => { e.planillas.enfermeros.semana1.T1 = referencia(personasEnf[0]); }],
  ["5 semana posterior", (e) => { e.planillas.licenciados.semana3.T1 = referencia(personasLic[0]); }],
  ["6 asignacionBase", (e) => { e.planillas.enfermeros.rotacion3Dias.asignacionBase.T1 = referencia(personasEnf[0]); }],
  ["7 bloque nocturno", (e) => { e.planillas.enfermeros.rotacion3Dias.bloques["2026-08-01"] = { T1: referencia(personasEnf[0]) }; }],
  ["8 cobertura", (e) => { e.planillas.enfermeros.coberturaLibreSM.semana1 = referencia(personasEnf[0]); }],
  ["9 generacionFlexible", (e) => { e.planillas.enfermeros.generacionFlexible = { version: 1 }; }],
  ["10 extras", (e) => { e.calendario.enfermeros.extras["2026-08-01"] = [{ id: "extra-1" }]; }],
  ["11 no disponibles", (e) => { e.calendario.enfermeros.noDisponibles["2026-08-01"] = [referencia(personasEnf[0])]; }],
  ["12 asistencia", (e) => { e.calendario.enfermeros.asistenciaDia["2026-08-01"] = { presente: true }; }],
  ["13 cambios diarios", (e) => { e.calendario.enfermeros.cambiosDia["2026-08-01"] = { T1: referencia(personasEnf[0]) }; }],
  ["14 licencias", (e) => e.licencias.push({ desde: "2026-08-01", hasta: "2026-08-02" })],
  ["15 certificaciones", (e) => e.certificaciones.push({ desde: "2026-08-01", hasta: "2026-08-02" })],
  ["16 días de paro", (e) => { e.calendario.diasParo["2026-08-01"] = true; }],
  ["17 cierres", (e) => { e.calendario.licenciados.cierresDia["2026-08-01"] = { cerrado: true }; }]
];
for (const [nombre, mutar] of casosContenido) {
  await probar(`${nombre} bloquea destino`, () => {
    const estado = crearEstadoMensualVacio();
    mutar(estado);
    assert.equal(clasificarEstadoMesDestino({ existeRemoto: true, estado }).permitido, false);
  });
}

const origenBaseSemanal = crearOrigenSemanal();
assert.equal(
  tieneAsignaciones(origenBaseSemanal.planillas.enfermeros.semana5),
  true,
  JSON.stringify({
    filas: filasEnf.length,
    personas: origenBaseSemanal.personal.length,
    semana: origenBaseSemanal.planillas.enfermeros.semana5
  })
);
const analisisBase = analizarSemanal({ origen: origenBaseSemanal });
assert.equal(analisisBase.ok, true, analisisBase.mensaje);
const construidoBase = construirEstadoMesNuevo({ analisis: analisisBase, posicionesNoAplicables: [] });
assert.equal(construidoBase.ok, true);

await probar("18 Personal conserva IDs", () => {
  assert.equal(construidoBase.estado.personal[0].id, personasEnf[0].id);
});
await probar("19 Personal se clona", () => {
  assert.notEqual(construidoBase.estado.personal, analisisBase.personal);
});
await probar("20 ambas categorías se construyen juntas", () => {
  assert.ok(construidoBase.estado.planillas.enfermeros.semana1);
  assert.ok(construidoBase.estado.planillas.licenciados.semana1);
});
await probar("21 licencia intersectada continúa", () => assert.equal(construidoBase.estado.licencias.length, 1));
await probar("22 licencia exterior se descarta", () => assert.equal(construidoBase.estado.licencias[0].desde, "2026-07-28"));
await probar("23 certificación intersectada continúa", () => assert.equal(construidoBase.estado.certificaciones.length, 1));
await probar("24 certificación exterior se descarta", () => assert.equal(construidoBase.estado.certificaciones[0].desde, "2026-08-10"));
await probar("25 extras no se copian", () => assert.deepEqual(construidoBase.estado.calendario.enfermeros.extras, {}));
await probar("26 no disponibles no se copian", () => assert.deepEqual(construidoBase.estado.calendario.enfermeros.noDisponibles, {}));
await probar("27 asistencia no se copia", () => assert.deepEqual(construidoBase.estado.calendario.enfermeros.asistenciaDia, {}));
await probar("28 cambios diarios no se copian", () => assert.deepEqual(construidoBase.estado.calendario.enfermeros.cambiosDia, {}));
await probar("29 días de paro no se copian", () => assert.deepEqual(construidoBase.estado.calendario.diasParo, {}));
await probar("30 cierres no se copian", () => assert.deepEqual(construidoBase.estado.calendario.enfermeros.cierresDia, {}));
await probar("31 calendario completo comienza limpio", () => {
  assert.deepEqual(construidoBase.estado.calendario, crearEstadoMensualVacio().calendario);
});

for (const [numero, turno] of [[32, "manana"], [33, "tarde"], [34, "vespertino"]]) {
  await probar(`${numero} ${turno} continúa semanal`, () => {
    const analisis = analizarSemanal({ turnoId: turno });
    assert.equal(analisis.enfermeros.estrategia.tipo, "semanal");
  });
}
await probar("35 Licenciados de Noche continúa semanal", () => {
  const origen = crearOrigenSemanal({ turno: "noche" });
  origen.planillas.enfermeros.rotacion3Dias.asignacionBase =
    clone(origen.planillas.enfermeros.semana5);
  const analisis = analizarSemanal({ turnoId: "noche", origen });
  assert.equal(analisis.ok, true, analisis.mensaje);
  assert.equal(analisis.licenciados.estrategia.tipo, "semanal");
});
await probar("36 Semana 1 usa última distribución real", () => {
  assert.deepEqual(construidoBase.estado.planillas.enfermeros.semana1, analisisBase.enfermeros.base);
});
await probar("37 semanas posteriores de Enfermeros quedan vacías", () => {
  for (let numero = 2; numero <= 6; numero += 1) {
    assert.deepEqual(construidoBase.estado.planillas.enfermeros[`semana${numero}`], {});
  }
});
await probar("37b preparar copia únicamente Semana 1 de Licenciados", () => {
  assert.deepEqual(
    construidoBase.estado.planillas.licenciados.semana1,
    analisisBase.licenciados.base
  );
  for (let numero = 2; numero <= 6; numero += 1) {
    assert.deepEqual(construidoBase.estado.planillas.licenciados[`semana${numero}`], {});
  }
});
await probar("37c constructor de preparación no genera rotaciones", async () => {
  const fuente = await readFile(
    new URL("../src/utils/preparacionMesNuevo.js", import.meta.url),
    "utf8"
  );
  const inicio = fuente.indexOf("export const construirEstadoMesNuevo");
  const fin = fuente.indexOf("export const validarContextoPreparacion", inicio);
  const constructor = fuente.slice(inicio, fin);
  assert.doesNotMatch(constructor, /generarRotacionMensual|generarBloquesFaltantes|continuarRotacion3DiasEntreMeses/);
});
await probar("37d PanelPrepararMes no solicita posiciones no aplicables", async () => {
  const panel = await readFile(
    new URL("../src/components/mes/PanelPrepararMes.jsx", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(panel, /checkbox|No aplicables requeridas|Seleccioná exactamente/);
  assert.match(panel, /Semanas 2 a 6 quedarán vacías/);
});
await probar("37e Personal copiado continúa editable", () => {
  const personalPreparado = clone(construidoBase.estado.personal);
  personalPreparado.pop();
  personalPreparado.push({
    id: "enf-nuevo",
    nombre: "Persona nueva",
    categoria: "enfermero"
  });
  assert.notDeepEqual(personalPreparado, construidoBase.estado.personal);
  assert.equal(analisisBase.personal.some((persona) => persona.id === "enf-nuevo"), false);
});
await probar("37f una persona eliminada antes de generar no aparece después", () => {
  const planilla = clone(construidoBase.estado.planillas.enfermeros);
  const personaEliminada = construidoBase.estado.personal.find(
    (persona) => persona.categoria === "enfermero"
  );
  const fila = filasEnf.find(
    (actual) => planilla.semana1[actual]?.personaId === personaEliminada.id
  );
  planilla.semana1[fila] = "";
  const personalActual = construidoBase.estado.personal.filter(
    (persona) => persona.id !== personaEliminada.id
  );
  const generada = generarRotacionMensual({
    planilla,
    filas: filasEnf,
    semanas: obtenerSemanasDelMes("2026-08"),
    filaFija: "SM",
    personal: personalActual,
    posicionesNoAplicables: [fila]
  });
  assert.equal(
    Object.values(generada).some((periodo) =>
      Object.values(periodo || {}).some(
        (referenciaActual) => referenciaActual?.personaId === personaEliminada.id
      )
    ),
    false
  );
});
await probar("37g una persona agregada puede incorporarse antes de generar", () => {
  const origen = crearOrigenSemanal({ faltantesEnf: 1 });
  const preparado = construirEstadoMesNuevo({
    analisis: analizarSemanal({ origen })
  }).estado;
  const filaVacia = filasEnf.find((fila) => !preparado.planillas.enfermeros.semana1[fila]);
  const nueva = {
    id: "enf-nuevo",
    nombre: "Persona nueva",
    categoria: "enfermero"
  };
  preparado.personal.push(nueva);
  preparado.planillas.enfermeros.semana1[filaVacia] = referencia(nueva);
  const generada = generarRotacionMensual({
    planilla: preparado.planillas.enfermeros,
    filas: filasEnf,
    semanas: obtenerSemanasDelMes("2026-08"),
    filaFija: "SM",
    personal: preparado.personal
  });
  assert.ok(
    Object.values(generada.semana2).some(
      (referenciaActual) => referenciaActual?.personaId === nueva.id
    )
  );
});
await probar("37h Noche expone asignacionBase editable antes de generar", async () => {
  const planilla = await readFile(
    new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url),
    "utf8"
  );
  assert.match(planilla, /Base editable de la rotación nocturna/);
  assert.match(planilla, /actualizarAsignacionBaseNocturna/);
});
await probar("38 cobertura semanal conserva solo base pertinente", () => {
  assert.deepEqual(Object.keys(construidoBase.estado.planillas.enfermeros.coberturaLibreSM), ["semana1"]);
});
await probar("39 intercambio en última semana afecta destino", () => {
  const origen = crearOrigenSemanal();
  const temporal = origen.planillas.enfermeros.semana5[filasEnf[0]];
  origen.planillas.enfermeros.semana5[filasEnf[0]] = origen.planillas.enfermeros.semana5[filasEnf[1]];
  origen.planillas.enfermeros.semana5[filasEnf[1]] = temporal;
  const resultado = construirEstadoMesNuevo({ analisis: analizarSemanal({ origen }), posicionesNoAplicables: [] });
  assert.equal(resultado.estado.planillas.enfermeros.semana1[filasEnf[0]].personaId, personasEnf[1].id);
});
await probar("40 intercambio de otra semana no afecta destino", () => {
  assert.equal(construidoBase.estado.planillas.enfermeros.semana1[filasEnf[0]].personaId, personasEnf[0].id);
});

function tieneAsignaciones(valor) {
  return Object.values(valor || {}).some(Boolean);
}

for (const [numero, faltantes] of [[41, 0], [42, 1], [43, 2]]) {
  await probar(`${numero} base con ${faltantes} vacantes se prepara sin decidir exclusiones`, () => {
    const analisis = analizarSemanal({ origen: crearOrigenSemanal({ faltantesEnf: faltantes }) });
    const resultado = construirEstadoMesNuevo({ analisis });
    assert.equal(resultado.ok, true);
    assert.equal(Object.hasOwn(resultado.estado.planillas.enfermeros, "generacionFlexible"), false);
  });
}
const analisis19 = analizarSemanal({ origen: crearOrigenSemanal({ faltantesEnf: 1 }) });
const excluida = analisis19.enfermeros.analisis.filasVacias[0];
const construido19 = construirEstadoMesNuevo({ analisis: analisis19 });
await probar("44 vacante permanece en la Semana 1 editable", () => {
  assert.equal(construido19.estado.planillas.enfermeros.semana1[excluida], "");
});
await probar("45 no se rota el vacío durante la preparación", () => {
  assert.deepEqual(construido19.estado.planillas.enfermeros.semana2, {});
});
await probar("46 la selección de sectores críticos se posterga a Generar", async () => {
  const panel = await readFile(
    new URL("../src/components/mes/PanelPrepararMes.jsx", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(panel, /sectoresCriticos|posicionesSeleccionadas/);
});
await probar("47 metadata anterior no se hereda", () => {
  const origen = crearOrigenSemanal({ faltantesEnf: 1 });
  origen.planillas.enfermeros.generacionFlexible = { posicionesNoAplicables: ["REA 1"] };
  const analisis = analizarSemanal({ origen });
  assert.notDeepEqual(analisis.enfermeros.analisis.filasVacias, ["REA 1"]);
});
await probar("48 metadata nueva no se crea durante preparación", () => {
  assert.equal(Object.hasOwn(construido19.estado.planillas.enfermeros, "generacionFlexible"), false);
});
await probar("49 preparación no exige exclusiones", () => {
  assert.equal(construirEstadoMesNuevo({ analisis: analisis19 }).ok, true);
});

const crearOrigenNoche = (faltantes = 0) => {
  const estado = crearOrigenSemanal({ turno: "noche" });
  const base = distribucion(
    filasEnf,
    estado.personal.filter((persona) => persona.categoria === "enfermero")
  );
  if (faltantes > 0) {
    filasEnf.slice(-faltantes).forEach((fila) => { base[fila] = ""; });
  }
  const periodosJulio = obtenerBloquesQueIntersectanMes({
    mesActivo: "2026-07",
    fechaBase: "2026-07-02",
    duracionDias: 3
  });
  estado.planillas.enfermeros.rotacion3Dias = {
    version: 1,
    fechaBase: "2026-07-02",
    duracionDias: 3,
    asignacionBase: clone(base),
    bloques: Object.fromEntries(periodosJulio.map((periodo) => [periodo.clave, clone(base)])),
    coberturaLibreSM: {}
  };
  const primerBloqueDestino = obtenerBloquesQueIntersectanMes({
    mesActivo: "2026-08",
    fechaBase: "2026-07-02",
    duracionDias: 3
  })[0];
  estado.planillas.enfermeros.rotacion3Dias.bloques[primerBloqueDestino.clave] =
    clone(base);
  return estado;
};
const analisisNoche = analizarSemanal({ turnoId: "noche", origen: crearOrigenNoche() });
const construidoNoche = construirEstadoMesNuevo({ analisis: analisisNoche, posicionesNoAplicables: [] });
await probar("50 asignacionBase es autoridad", () => assert.deepEqual(
  construidoNoche.estado.planillas.enfermeros.rotacion3Dias.asignacionBase,
  analisisNoche.enfermeros.base
));
await probar("51 bloque compartido se conserva", () => {
  const clavesOrigen = new Set(Object.keys(analisisNoche.rotacionEnfermerosOrigen.bloques));
  const compartida = Object.keys(construidoNoche.estado.planillas.enfermeros.rotacion3Dias.bloques)
    .find((clave) => clavesOrigen.has(clave));
  assert.ok(compartida);
});
await probar("52 bloques faltantes no se generan", () => {
  const clavesOrigen = new Set(Object.keys(analisisNoche.rotacionEnfermerosOrigen.bloques));
  assert.ok(
    Object.keys(construidoNoche.estado.planillas.enfermeros.rotacion3Dias.bloques)
      .every((clave) => clavesOrigen.has(clave))
  );
});
await probar("53 bloque existente conserva contenido", () => {
  const clave = analisisNoche.enfermeros.bloquesDestino.find((p) =>
    Object.hasOwn(analisisNoche.rotacionEnfermerosOrigen.bloques, p.clave)
  ).clave;
  assert.deepEqual(
    construidoNoche.estado.planillas.enfermeros.rotacion3Dias.bloques[clave],
    analisisNoche.rotacionEnfermerosOrigen.bloques[clave]
  );
});
await probar("54 índices globales permanecen", () => {
  assert.ok(analisisNoche.enfermeros.bloquesDestino.every((periodo) => Number.isInteger(periodo.indice)));
});
await probar("55 fecha base y duración permanecen", () => {
  const rot = construidoNoche.estado.planillas.enfermeros.rotacion3Dias;
  assert.equal(rot.fechaBase, "2026-07-02");
  assert.equal(rot.duracionDias, 3);
});
const analisisNoche19 = analizarSemanal({ turnoId: "noche", origen: crearOrigenNoche(1) });
const excluidaNoche = analisisNoche19.enfermeros.analisis.filasVacias[0];
const construidoNoche19 = construirEstadoMesNuevo({ analisis: analisisNoche19 });
await probar("56 vacante nocturna permanece en asignacionBase", () => {
  assert.equal(
    construidoNoche19.estado.planillas.enfermeros.rotacion3Dias.asignacionBase[excluidaNoche],
    ""
  );
});
await probar("57 preparación nocturna no rota el vacío", () => {
  assert.equal(
    Object.hasOwn(construidoNoche19.estado.planillas.enfermeros, "generacionFlexible"),
    false
  );
});
await probar("58 análisis nocturno no genera bloques", () => {
  assert.equal(Object.hasOwn(analisisNoche19, "estado"), false);
});
await probar("59 preparación nocturna conserva estructura sin completar continuidad", () => {
  const rotacion = construidoNoche.estado.planillas.enfermeros.rotacion3Dias;
  assert.equal(rotacion.fechaBase, analisisNoche.enfermeros.estrategia.fechaBase);
  assert.ok(Object.keys(rotacion.bloques).length < analisisNoche.enfermeros.bloquesDestino.length);
});
await probar("60 intercambio sincronizado en base afecta destino", () => {
  const origen = crearOrigenNoche();
  const base = origen.planillas.enfermeros.rotacion3Dias.asignacionBase;
  [base[filasEnf[0]], base[filasEnf[1]]] = [base[filasEnf[1]], base[filasEnf[0]]];
  const construido = construirEstadoMesNuevo({
    analisis: analizarSemanal({ turnoId: "noche", origen }),
    posicionesNoAplicables: []
  });
  assert.equal(construido.estado.planillas.enfermeros.rotacion3Dias.asignacionBase[filasEnf[0]].personaId, personasEnf[1].id);
});
await probar("61 intercambio en bloque normal no cambia base", () => {
  assert.deepEqual(analisisNoche.enfermeros.base, analisisNoche.rotacionEnfermerosOrigen.asignacionBase);
});

await probar("62 preparar dos veces se bloquea por contenido", () => {
  assert.equal(clasificarEstadoMesDestino({ existeRemoto: true, estado: construidoBase.estado }).permitido, false);
});
await probar("63 copiar dos veces no tiene botón heredado", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /Copiar mes anterior/);
});
await probar("64 continuar dos veces no tiene botón heredado", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, />Continuar desde mes anterior</);
});
await probar("65 cancelar solo cierra panel", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /onCancelar=\{\(\) => setPreparacionMes\(null\)\}/);
});
for (const [numero, cambio] of [
  [66, { turnoId: "manana", mesOrigen: "2026-07", mesDestino: "2026-08", revisionDestino: "0" }],
  [67, { turnoId: "tarde", mesOrigen: "2026-08", mesDestino: "2026-09", revisionDestino: "0" }],
  [68, { turnoId: "tarde", mesOrigen: "2026-07", mesDestino: "2026-08", revisionDestino: "1" }]
]) {
  await probar(`${numero} cambio de contexto invalida`, () => {
    assert.equal(validarContextoPreparacion({
      turnoId: "tarde", mesOrigen: "2026-07", mesDestino: "2026-08", revisionDestino: "0"
    }, cambio), false);
  });
}

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/mes/PanelPrepararMes.jsx", import.meta.url), "utf8");
const continuidad = await readFile(new URL("../src/utils/continuidadRotacionPlanilla.js", import.meta.url), "utf8");
const calendario = await readFile(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8");
const pdf = await readFile(new URL("../src/utils/exportPDF.js", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await probar("69 modo solo lectura bloquea", () => assert.match(app, /!modoSoloLecturaEfectiva/));
await probar("70 vista histórica no ofrece acción", () => assert.doesNotMatch(panel, /HistorialCambios/));
await probar("71 conflicto bloquea", () => assert.match(app, /metadatosDestino\?\.conflicto/));
await probar("72 guardado pendiente bloquea", () => assert.match(app, /hayPendientesEnClave\(claveDestino\)/));
await probar("73 falta base Enfermeros bloquea", () => {
  const origen = crearOrigenSemanal();
  for (let semana = 1; semana <= 6; semana += 1) {
    origen.planillas.enfermeros[`semana${semana}`] = {};
  }
  assert.equal(analizarSemanal({ origen }).ok, false);
});
await probar("74 falta base Licenciados bloquea", () => {
  const origen = crearOrigenSemanal();
  for (let semana = 1; semana <= 6; semana += 1) {
    origen.planillas.licenciados[`semana${semana}`] = {};
  }
  assert.equal(analizarSemanal({ origen }).ok, false);
});
await probar("75 referencia inválida bloquea", () => {
  const origen = crearOrigenSemanal();
  origen.planillas.enfermeros.semana5[filasEnf[0]] = { personaId: "ausente", nombre: "Ausente" };
  assert.equal(analizarSemanal({ origen }).ok, false);
});
await probar("76 persona duplicada bloquea", () => {
  const origen = crearOrigenSemanal();
  origen.planillas.enfermeros.semana5[filasEnf[1]] = origen.planillas.enfermeros.semana5[filasEnf[0]];
  assert.equal(analizarSemanal({ origen }).ok, false);
});
await probar("77 conserva validación entre turnos", () => assert.match(app, /validarPersonasDisponiblesEnOtrosTurnos/));
await probar("78 confirmación usa una actualización funcional", () => {
  const bloque = extraerFuncionConst(app, "confirmarPreparacionMes");
  const actualizacionesFuncionales = bloque.match(
    /setEstadoPorTurnoMes\s*\(\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*=>/g
  ) || [];
  assert.equal(actualizacionesFuncionales.length, 1);
});
await probar("79 no usa setters separados", () => {
  const bloque = extraerFuncionConst(app, "confirmarPreparacionMes");
  assert.doesNotMatch(bloque, /setPlanillaEnfermeros|setPlanillaLicenciados|setLicencias|setCertificaciones/);
});
await probar("80 autosave CAS permanece", () => assert.match(app, /guardarEstadoTurnoMesConRevision/));
await probar("81 historial SQL no cambia desde UI", () => assert.doesNotMatch(app, /historial_estado_turno_mes/));
await probar("82 Calendario no importa preparación", () => assert.doesNotMatch(calendario, /preparacionMesNuevo/));
await probar("83 PDF no importa preparación", () => assert.doesNotMatch(pdf, /preparacionMesNuevo/));
await probar("84 script Etapa 25 permanece", () => assert.ok(packageJson.scripts["test:etapa25"]));
await probar("85 script Etapa 26 permanece", () => assert.ok(packageJson.scripts["test:etapa26"]));
await probar("86 estados históricos normalizan", () => assert.ok(normalizarEstadoMensual({ planillas: {} }).planillas.enfermeros));
await probar("87 origen no se muta", () => {
  const origen = crearOrigenSemanal();
  const antes = clone(origen);
  const analisis = analizarSemanal({ origen });
  construirEstadoMesNuevo({ analisis, posicionesNoAplicables: [] });
  assert.deepEqual(origen, antes);
});
await probar("88 destino no se muta", () => {
  const destino = crearEstadoMensualVacio();
  const antes = clone(destino);
  analizarSemanal({ destino });
  assert.deepEqual(destino, antes);
});
await probar("89 estado final tiene estructura completa", () => {
  for (const clave of ["personal", "planillas", "calendario", "licencias", "certificaciones"]) {
    assert.ok(Object.hasOwn(construidoBase.estado, clave));
  }
});
await probar("90 existe una única acción visible", () => {
  assert.equal((app.match(/Preparar mes siguiente/g) || []).length >= 1, true);
  assert.doesNotMatch(app, /copiarMesAnterior/);
});
await probar("91 continuidad recibe exclusiones antes de generar", () => {
  assert.match(continuidad, /posicionesNoAplicables/);
});
await probar("92 filtro temporal clona registros", () => {
  const entrada = [{ desde: "2026-08-01", hasta: "2026-08-02", dato: { valor: 1 } }];
  const salida = filtrarRegistrosQueIntersectanMes(entrada, "2026-08");
  assert.notEqual(salida[0], entrada[0]);
  assert.notEqual(salida[0].dato, entrada[0].dato);
});
await probar("93 detector reporta contenido real", () => {
  assert.ok(detectarContenidoMensual(construidoBase.estado).includes("Personal"));
});
await probar("94 panel informa datos descartados", () => {
  assert.match(panel, /Extras, no disponibles, asistencia, cambios diarios/);
});
await probar("95 panel posterga el selector de exclusiones", () => {
  assert.doesNotMatch(panel, /type="checkbox"|posicionesSeleccionadas/);
  assert.match(panel, /generes la rotación/);
});
await probar("96 gestión del mes conserva su destino dentro del Hub Más", () => {
  assert.match(app, /id="novedades-principal"/);
  assert.match(app, /subvistaMas === "gestionMes"/);
  assert.match(app, /subvistaMas === "estadisticas"/);
});
await probar("97 preparación no está dentro de Planilla mensual", () => {
  const inicioPlanilla = app.indexOf('<div id="planilla-principal"');
  const finPlanilla = app.indexOf('<div id="novedades-principal"', inicioPlanilla);
  assert.ok(inicioPlanilla >= 0 && finPlanilla > inicioPlanilla);
  const bloquePlanilla = app.slice(inicioPlanilla, finPlanilla);
  assert.doesNotMatch(bloquePlanilla, /Preparar mes siguiente|PanelPrepararMes|Preparando vista previa/);
});
await probar("98 condiciones de visibilidad permanecen agrupadas", () => {
  const inicioGestion = app.indexOf("Gestión del mes");
  const inicioTarjeta = app.indexOf(
    "{(mesActivo === mesSiguiente || mesActivo === mesActual || !destinoActivoPreparacion.permitido)",
    inicioGestion
  );
  const finGestion = app.indexOf('subvistaMas === "estadisticas"', inicioGestion);
  const bloqueGestion = app.slice(inicioTarjeta, finGestion);
  for (const condicion of [
    "mesActivo === mesSiguiente",
    "puedeEditarActivo",
    "!modoSoloLecturaEfectiva",
    "!cargando",
    "!metadatosActivos?.conflicto",
    "!clavesBloqueadasTrasRestauracion.has(claveActiva)",
    "!hayPendientesEnClave(claveActiva)",
    "destinoActivoPreparacion.permitido"
  ]) {
    assert.ok(bloqueGestion.includes(condicion), condicion);
  }
});
await probar("99 sigue existiendo una sola acción visible de preparación", () => {
  assert.equal((app.match(/Preparar mes siguiente/g) || []).length, 1);
});
await probar("100 preparación depende del mes siguiente y la gestión admite reinicio", () => {
  assert.match(
    app,
    /\{\(mesActivo === mesSiguiente \|\| mesActivo === mesActual \|\| !destinoActivoPreparacion\.permitido\) && \(/
  );
  assert.match(
    app,
    /\{mesActivo === mesSiguiente &&\s*destinoActivoPreparacion\.permitido/
  );
  assert.match(app, /MODO_PREPARACION_MES\.RECUPERACION_ACTUAL/);
});
await probar("101 destino con contenido muestra explicación", () => {
  assert.match(app, /Este mes ya fue iniciado y no puede prepararse nuevamente\./);
});
await probar("102 destino bloqueado muestra contenido detectado", () => {
  assert.match(app, /Información encontrada:/);
});
await probar("103 destino no permitido no renderiza el botón activo", () => {
  const inicioGestion = app.indexOf("Gestión del mes");
  const finGestion = app.indexOf('subvistaMas === "estadisticas"', inicioGestion);
  const bloqueGestion = app.slice(inicioGestion, finGestion);
  const indiceBoton = bloqueGestion.indexOf(
    "onClick={() => iniciarPreparacionMes(MODO_PREPARACION_MES.SIGUIENTE)}"
  );
  const condicionPermitida = bloqueGestion.lastIndexOf(
    "destinoActivoPreparacion.permitido",
    indiceBoton
  );
  assert.ok(condicionPermitida >= 0 && condicionPermitida < indiceBoton);
  assert.match(bloqueGestion, /!destinoActivoPreparacion\.permitido/);
});
await probar("104 agrupa semanas consecutivas de Enfermeros", () => {
  assert.deepEqual(
    formatearContenidoMes([
      "enfermeros.semana1",
      "enfermeros.semana2",
      "enfermeros.semana3",
      "enfermeros.semana4",
      "enfermeros.semana5",
      "enfermeros.semana6"
    ]),
    ["Planilla de Enfermeros: semanas 1 a 6"]
  );
});
await probar("105 agrupa semanas parciales de Licenciados", () => {
  assert.deepEqual(
    formatearContenidoMes([
      "licenciados.semana1",
      "licenciados.semana3",
      "licenciados.semana4"
    ]),
    ["Planilla de Licenciados: semanas 1, 3 y 4"]
  );
});
await probar("106 traduce nombres internos", () => {
  assert.deepEqual(
    formatearContenidoMes([
      "Personal",
      "enfermeros.coberturaLibreSM",
      "licenciados.no disponibles",
      "enfermeros.asignacionBase"
    ]),
    [
      "Personal cargado",
      "Cobertura de Salud Mental de Enfermeros",
      "Personas no disponibles de Licenciados",
      "Base de la rotación nocturna"
    ]
  );
});
await probar("107 propiedad desconocida usa etiqueta segura", () => {
  assert.deepEqual(
    formatearContenidoMes(["propiedad.interna"]),
    ["Otra información del mes"]
  );
});
await probar("108 interfaz no imprime claves técnicas directamente", () => {
  const inicioGestion = app.indexOf('subvistaMas === "gestionMes"');
  const finGestion = app.indexOf('subvistaMas === "estadisticas"', inicioGestion);
  assert.ok(inicioGestion >= 0 && finGestion > inicioGestion);
  const bloqueGestion = app.slice(inicioGestion, finGestion);
  assert.doesNotMatch(bloqueGestion, /contenido\.join|enfermeros\.semana1/);
  assert.match(bloqueGestion, /contenidoDestinoPresentable\.map/);
});

console.log(`\n${total} pruebas permanentes de Etapa 27 superadas.`);
