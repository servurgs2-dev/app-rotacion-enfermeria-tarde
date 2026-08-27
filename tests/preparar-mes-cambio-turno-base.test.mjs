import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  analizarPreparacionMesNuevo,
  aplicarOmisionesPersonalEstadoPreparado,
  construirEstadoMesNuevo,
  obtenerFilasPlanilla,
  reconciliarPersonalPreparacionMes
} from "../src/utils/preparacionMesNuevo.js";
import { configuracionSectores } from "../src/data/sectores.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";
import {
  derivarAsignacionBaseDesdeBloque,
  resolverAsignacionBaseRotacion3DiasEfectiva
} from "../src/utils/rotacionPlanilla.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const persona = (id, nombre, turno = "noche") => ({
  id,
  nombre,
  funcionario: id,
  categoria: "enfermero",
  rol: "usuario",
  turno
});
const referencia = (p) => ({ personaId: p.id, nombre: p.nombre });
const estadoConPersonal = (...personas) => {
  const estado = crearEstadoMensualVacio();
  estado.personal = personas;
  return estado;
};
const contienePersonaId = (valor, personaId) => {
  if (Array.isArray(valor)) return valor.some((item) => contienePersonaId(item, personaId));
  if (!valor || typeof valor !== "object") return false;
  if (String(valor.personaId ?? "") === personaId) return true;
  return Object.values(valor).some((item) => contienePersonaId(item, personaId));
};
const rutasConPersonaId = (valor, personaId, ruta = "estado") => {
  if (Array.isArray(valor)) {
    return valor.flatMap((item, indice) => rutasConPersonaId(item, personaId, `${ruta}[${indice}]`));
  }
  if (!valor || typeof valor !== "object") return [];
  const propias = String(valor.personaId ?? "") === personaId ? [ruta] : [];
  return propias.concat(
    Object.entries(valor).flatMap(([clave, item]) =>
      rutasConPersonaId(item, personaId, `${ruta}.${clave}`)
    )
  );
};

const mariaNoche = persona("P", "Maria Noel Rosano");
const mariaManana = { ...mariaNoche, turno: "manana" };
const crearOrigenMaria = () => {
  const estado = estadoConPersonal(
    mariaNoche,
    persona("C", "Carla Noche"),
    persona("D", "Diana Noche")
  );
  estado.planillas.enfermeros.rotacion3Dias.asignacionBase.T1 = referencia(mariaNoche);
  estado.planillas.enfermeros.rotacion3Dias.bloques["2026-08-31"] = {
    T1: referencia(mariaNoche),
    T2: referencia(estado.personal[1])
  };
  estado.planillas.enfermeros.semana5.T1 = referencia(mariaNoche);
  estado.planillas.enfermeros.coberturaLibreSM.semana5 = referencia(mariaNoche);
  estado.configuracionPlanilla = {
    ...(estado.configuracionPlanilla || {}),
    enfermero: {
    asignacionesFijas: [{ ...referencia(mariaNoche), fila: "T1" }]
    }
  };
  estado.calendario.enfermeros.noDisponibles["2026-08-31"] = [referencia(mariaNoche)];
  estado.licencias = [{ ...referencia(mariaNoche), desde: "2026-08-01", hasta: "2026-08-05" }];
  return estado;
};

await probar("1 Maria Agosto Noche ya presente en Septiembre Mañana no bloquea", () => {
  const resultado = reconciliarPersonalPreparacionMes({
    estadoOrigen: crearOrigenMaria(),
    turnoDestino: "noche",
    estadosDestinoPorTurno: { manana: estadoConPersonal(mariaManana) }
  });
  assert.equal(resultado.ok, true, JSON.stringify(resultado));
  assert.deepEqual(resultado.personasOmitidas, [{
    personaId: "P",
    nombre: "Maria Noel Rosano",
    turnoId: "manana",
    turnoNombre: "Mañana"
  }]);
});

await probar("2 Maria se omite de Noche y conserva el mismo ID en Mañana", () => {
  const origen = crearOrigenMaria();
  const destinoManana = estadoConPersonal(mariaManana);
  const resultado = reconciliarPersonalPreparacionMes({
    estadoOrigen: origen,
    turnoDestino: "noche",
    estadosDestinoPorTurno: { manana: destinoManana }
  });
  assert.deepEqual(resultado.personaIdsOmitidos, ["P"]);
  assert.equal(origen.personal.some((p) => p.id === "P"), true);
  assert.equal(destinoManana.personal[0].id, "P");
});

await probar("3 se limpian todas las referencias de Planilla y estado de la omitida", () => {
  const fuente = crearOrigenMaria();
  const fuenteAntes = clonar(fuente);
  const estadoPreparado = aplicarOmisionesPersonalEstadoPreparado({
    estadoPreparado: fuente,
    personaIdsOmitidos: ["P"]
  });
  assert.deepEqual(rutasConPersonaId(estadoPreparado, "P"), []);
  assert.equal(contienePersonaId(estadoPreparado, "C"), true);
  assert.deepEqual(fuente, fuenteAntes);
});

await probar("4 varias personas cambiadas se omiten y el resto se copia", () => {
  const origen = estadoConPersonal(
    persona("A", "Ana"), persona("B", "Beatriz"), persona("C", "Carla"), persona("D", "Diana")
  );
  const resultado = reconciliarPersonalPreparacionMes({
    estadoOrigen: origen,
    turnoDestino: "noche",
    estadosDestinoPorTurno: {
      manana: estadoConPersonal(persona("A", "Ana", "manana")),
      tarde: estadoConPersonal(persona("B", "Beatriz", "tarde")),
      vespertino: estadoConPersonal()
    }
  });
  assert.equal(resultado.ok, true);
  const preparado = aplicarOmisionesPersonalEstadoPreparado({
    estadoPreparado: origen,
    personaIdsOmitidos: resultado.personaIdsOmitidos
  });
  assert.deepEqual(preparado.personal.map((p) => p.id), ["C", "D"]);
  assert.deepEqual(resultado.personasOmitidas.map((p) => [p.personaId, p.turnoId]), [
    ["A", "manana"], ["B", "tarde"]
  ]);
});

await probar("5 homónimos con IDs distintos no se omiten", () => {
  const resultado = reconciliarPersonalPreparacionMes({
    estadoOrigen: estadoConPersonal(persona("P2", "Maria Noel Rosano")),
    turnoDestino: "noche",
    estadosDestinoPorTurno: { manana: estadoConPersonal(persona("P1", "Maria Noel Rosano", "manana")) }
  });
  assert.deepEqual(resultado.personaIdsOmitidos, []);
  assert.deepEqual(resultado.personasOmitidas, []);
});

await probar("6 identidad duplicada en origen sigue bloqueando", () => {
  const resultado = reconciliarPersonalPreparacionMes({
    estadoOrigen: estadoConPersonal(persona("P", "Maria"), persona("P", "Maria duplicada")),
    turnoDestino: "noche",
    estadosDestinoPorTurno: {}
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "PERSONA_DUPLICADA_EN_ORIGEN");
});

await probar("7 identidad ambigua en cualquier turno destino sigue bloqueando", () => {
  const resultado = reconciliarPersonalPreparacionMes({
    estadoOrigen: estadoConPersonal(persona("P", "Maria")),
    turnoDestino: "noche",
    estadosDestinoPorTurno: {
      manana: estadoConPersonal(persona("P", "Maria", "manana")),
      tarde: estadoConPersonal(persona("P", "Maria", "tarde"))
    }
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "PERSONA_DUPLICADA_EN_DESTINO");
});

await probar("8 no hay omitidos y el contenido se conserva", () => {
  const origen = crearOrigenMaria();
  const resultado = reconciliarPersonalPreparacionMes({
    estadoOrigen: origen,
    turnoDestino: "noche",
    estadosDestinoPorTurno: { manana: estadoConPersonal() }
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.personaIdsOmitidos, []);
  assert.deepEqual(resultado.personasOmitidas, []);
});

await probar("9 no muta el origen ni los estados de otros turnos", () => {
  const origen = crearOrigenMaria();
  const destinoManana = estadoConPersonal(mariaManana);
  const origenAntes = clonar(origen);
  const destinoAntes = clonar(destinoManana);
  reconciliarPersonalPreparacionMes({
    estadoOrigen: origen,
    turnoDestino: "noche",
    estadosDestinoPorTurno: { manana: destinoManana }
  });
  assert.deepEqual(origen, origenAntes);
  assert.deepEqual(destinoManana, destinoAntes);
});

const filasEnfermeros = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
const filasLicenciados = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
const crearFuenteNocturnaValida = () => {
  const estado = crearEstadoMensualVacio();
  const enfermeros = filasEnfermeros.map((_, indice) => persona(
    indice === 0 ? "P" : `ENF-${indice + 1}`,
    indice === 0 ? "Maria Noel Rosano" : `Enfermero Noche ${indice + 1}`
  ));
  const licenciados = filasLicenciados.map((_, indice) => ({
    ...persona(`LIC-${indice + 1}`, `Licenciado Noche ${indice + 1}`),
    categoria: "licenciado"
  }));
  estado.personal = [...enfermeros, ...licenciados];
  estado.planillas.enfermeros.rotacion3Dias.asignacionBase = Object.fromEntries(
    filasEnfermeros.map((fila, indice) => [fila, referencia(enfermeros[indice])])
  );
  estado.planillas.licenciados.semana5 = Object.fromEntries(
    filasLicenciados.map((fila, indice) => [fila, referencia(licenciados[indice])])
  );
  return estado;
};
const convertirEnFuenteLegacyConBloque = (estado, { referencias = 2 } = {}) => {
  const copia = clonar(estado);
  const base = copia.planillas.enfermeros.rotacion3Dias.asignacionBase;
  copia.planillas.enfermeros.rotacion3Dias.asignacionBase = {};
  copia.planillas.enfermeros.rotacion3Dias.bloques = {
    "2026-08-01": Object.fromEntries(
      Object.entries(base).map(([fila, ref], indice) => [
        fila,
        indice < referencias ? ref : ""
      ])
    )
  };
  return copia;
};
const crearFuenteLegacyReal = () => {
  const fuente = crearFuenteNocturnaValida();
  const baseValida = clonar(fuente.planillas.enfermeros.rotacion3Dias.asignacionBase);
  fuente.planillas.enfermeros.rotacion3Dias.asignacionBase = {};
  const bloqueStale = {
    [filasEnfermeros[0]]: { personaId: "JUAN-LEGACY", nombre: "Juan" },
    [filasEnfermeros[1]]: { personaId: "MARCO-LEGACY", nombre: "Marco" }
  };
  fuente.planillas.enfermeros.rotacion3Dias.bloques = Object.fromEntries([
    "2026-08-01", "2026-08-04", "2026-08-07", "2026-08-10",
    "2026-08-13", "2026-08-16", "2026-08-19", "2026-08-22"
  ].map((fecha) => [fecha, clonar(bloqueStale)]));
  for (const fecha of ["2026-08-25", "2026-08-28", "2026-08-31"]) {
    fuente.planillas.enfermeros.rotacion3Dias.bloques[fecha] = clonar(baseValida);
  }
  return fuente;
};
const periodosAgostoNoche = obtenerBloquesQueIntersectanMes({
  mesActivo: "2026-08",
  fechaBase: "2026-07-02",
  duracionDias: 3
});
const resolverBaseFuente = (fuente, adicionales = {}) =>
  resolverAsignacionBaseRotacion3DiasEfectiva({
    rotacion3Dias: fuente.planillas.enfermeros.rotacion3Dias,
    periodos: periodosAgostoNoche,
    filas: filasEnfermeros,
    personal: fuente.personal,
    categoria: "enfermero",
    ...adicionales
  });
const analizarFuenteNocturna = (estadoOrigen) => analizarPreparacionMesNuevo({
  turnoId: "noche",
  mesOrigen: "2026-08",
  mesDestino: "2026-09",
  estadoOrigen,
  estadoDestino: crearEstadoMensualVacio(),
  existeDestinoRemoto: false,
  revisionDestino: "0"
});

await probar("10 caso real analiza Agosto completo y limpia sÃ³lo Septiembre construido", () => {
  const fuenteAgosto = crearFuenteLegacyReal();
  const fuenteAntes = clonar(fuenteAgosto);
  const destinoManana = estadoConPersonal(mariaManana);
  const destinoAntes = clonar(destinoManana);
  const reconciliacion = reconciliarPersonalPreparacionMes({
    estadoOrigen: fuenteAgosto,
    turnoDestino: "noche",
    estadosDestinoPorTurno: { manana: destinoManana }
  });
  const analisis = analizarFuenteNocturna(fuenteAgosto);
  assert.equal(analisis.ok, true, analisis.mensaje);
  assert.equal(Object.keys(fuenteAgosto.planillas.enfermeros.rotacion3Dias.asignacionBase).length, 0);
  assert.equal(analisis.enfermeros.analisis.cantidadPersonas, filasEnfermeros.length);
  const construccion = construirEstadoMesNuevo({ analisis });
  assert.equal(construccion.ok, true, construccion.mensaje);
  const resultado = aplicarOmisionesPersonalEstadoPreparado({
    estadoPreparado: construccion.estado,
    personaIdsOmitidos: reconciliacion.personaIdsOmitidos
  });
  assert.equal(resultado.personal.some((p) => p.id === "P"), false);
  assert.deepEqual(rutasConPersonaId(resultado, "P"), []);
  assert.equal(resultado.personal.some((p) => p.id === "ENF-2"), true);
  assert.ok(Object.values(
    resultado.planillas.enfermeros.rotacion3Dias.asignacionBase
  ).some((referenciaActual) => referenciaActual === ""));
  assert.deepEqual(fuenteAgosto, fuenteAntes);
  assert.deepEqual(destinoManana, destinoAntes);
});

await probar("11 dos cambios dejan vacantes sin redistribuir el resto", () => {
  const fuente = convertirEnFuenteLegacyConBloque(crearFuenteNocturnaValida(), {
    referencias: 4
  });
  const segunda = fuente.personal.find((p) => p.id === "ENF-2");
  const reconciliacion = reconciliarPersonalPreparacionMes({
    estadoOrigen: fuente,
    turnoDestino: "noche",
    estadosDestinoPorTurno: {
      manana: estadoConPersonal(mariaManana),
      tarde: estadoConPersonal({ ...segunda, turno: "tarde" })
    }
  });
  const analisis = analizarFuenteNocturna(fuente);
  assert.equal(analisis.ok, true, analisis.mensaje);
  const construccion = construirEstadoMesNuevo({ analisis });
  const resultado = aplicarOmisionesPersonalEstadoPreparado({
    estadoPreparado: construccion.estado,
    personaIdsOmitidos: reconciliacion.personaIdsOmitidos
  });
  assert.ok(Object.values(
    resultado.planillas.enfermeros.rotacion3Dias.asignacionBase
  ).filter((referenciaActual) => referenciaActual === "").length >= 2);
  assert.deepEqual(rutasConPersonaId(resultado, "P"), []);
  assert.deepEqual(rutasConPersonaId(resultado, "ENF-2"), []);
  assert.equal(resultado.personal.some((p) => p.id === "ENF-3"), true);
});

await probar("12 una fuente nocturna realmente sin base continÃºa bloqueada", () => {
  const fuente = crearFuenteNocturnaValida();
  fuente.planillas.enfermeros.rotacion3Dias.asignacionBase = {};
  const analisis = analizarFuenteNocturna(fuente);
  assert.equal(analisis.ok, false);
  assert.equal(analisis.codigo, "BASE_ENFERMEROS");
  assert.match(analisis.mensaje, /Falta la asignaci.n base de Enfermeros/);
});

await probar("13 bloque legacy con referencia corrupta no se prepara", () => {
  const fuente = convertirEnFuenteLegacyConBloque(crearFuenteNocturnaValida());
  fuente.planillas.enfermeros.rotacion3Dias.bloques["2026-08-01"][filasEnfermeros[0]] = {
    personaId: "NO-EXISTE",
    nombre: "Referencia invÃ¡lida"
  };
  const analisis = analizarFuenteNocturna(fuente);
  assert.equal(analisis.ok, false);
  assert.equal(analisis.codigo, "BASE_ENFERMEROS");
  assert.match(analisis.mensaje, /Falta la asignaci.n base de Enfermeros/);
});

await probar("14 asignacionBase Ãºtil conserva prioridad frente a bloques", () => {
  const fuente = crearFuenteNocturnaValida();
  const referenciaBase = fuente.planillas.enfermeros.rotacion3Dias.asignacionBase[filasEnfermeros[0]];
  fuente.planillas.enfermeros.rotacion3Dias.bloques["2026-08-01"] = {
    [filasEnfermeros[0]]: referencia(fuente.personal.find((p) => p.id === "ENF-4"))
  };
  const fuenteAntes = clonar(fuente);
  const analisis = analizarFuenteNocturna(fuente);
  assert.equal(analisis.ok, true, analisis.mensaje);
  assert.deepEqual(analisis.enfermeros.base[filasEnfermeros[0]], referenciaBase);
  assert.deepEqual(fuente, fuenteAntes);
});

await probar("15 primer bloque stale y segundo resoluble selecciona el segundo", () => {
  const fuente = convertirEnFuenteLegacyConBloque(crearFuenteNocturnaValida());
  const bloqueValido = fuente.planillas.enfermeros.rotacion3Dias.bloques["2026-08-01"];
  fuente.planillas.enfermeros.rotacion3Dias.bloques = {
    "2026-08-01": {
      [filasEnfermeros[0]]: { personaId: "AUSENTE", nombre: "Legacy" }
    },
    "2026-08-04": bloqueValido
  };
  const resultado = resolverBaseFuente(fuente);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.bloqueReferencia.periodo.clave, "2026-08-04");
});

await probar("16 fixture real elige 25 de agosto y usa su Ã­ndice global", () => {
  const fuente = crearFuenteLegacyReal();
  const fuenteAntes = clonar(fuente);
  const resultado = resolverBaseFuente(fuente);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.origen, "bloque_legacy");
  assert.equal(resultado.bloqueReferencia.periodo.clave, "2026-08-25");
  const esperado = derivarAsignacionBaseDesdeBloque({
    bloqueReferencia: resultado.bloqueReferencia.bloque,
    indiceReferencia: resultado.bloqueReferencia.periodo.indice,
    filas: filasEnfermeros
  });
  assert.deepEqual(resultado.asignacionBase, esperado);
  assert.notEqual(resultado.bloqueReferencia.periodo.indice, 0);
  assert.deepEqual(fuente, fuenteAntes);
});

await probar("17 todos los bloques stale fallan sin producir base vacÃ­a", () => {
  const fuente = crearFuenteLegacyReal();
  fuente.planillas.enfermeros.rotacion3Dias.bloques = Object.fromEntries(
    Object.entries(fuente.planillas.enfermeros.rotacion3Dias.bloques)
      .filter(([fecha]) => fecha < "2026-08-25")
  );
  const resultado = resolverBaseFuente(fuente);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "REFERENCIAS_BLOQUES_NO_RESOLUBLES");
  assert.equal(resultado.candidatos.length, 8);
});

await probar("18 primer bloque resoluble conserva comportamiento anterior", () => {
  const fuente = convertirEnFuenteLegacyConBloque(crearFuenteNocturnaValida());
  const resultado = resolverBaseFuente(fuente);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.bloqueReferencia.periodo.clave, "2026-08-01");
});

await probar("19 error de asignaciÃ³n fija bloquea y no prueba otro candidato", () => {
  const fuente = crearFuenteLegacyReal();
  const resultado = resolverBaseFuente(fuente, {
    asignacionesFijas: [{ sectorId: "rea_1", personaId: "AUSENTE" }],
    filasConfiguracion: [{
      filaId: "sector:rea_1",
      tipo: "sector",
      sectorId: "rea_1",
      etiqueta: filasEnfermeros[0],
      orden: 0,
      activo: true
    }]
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "ASIGNACIONES_FIJAS_INVALIDAS");
});

await probar("20 asignaciones fijas se preservan al derivar candidato tardÃ­o", () => {
  const personalMini = [persona("FIJA", "Persona fija"), persona("MOVIL", "Persona mÃ³vil")];
  const filasMini = ["Sector A", "Sector B"];
  const configuracionMini = filasMini.map((etiqueta, indice) => ({
    filaId: `sector:s${indice + 1}`,
    tipo: "sector",
    sectorId: `s${indice + 1}`,
    etiqueta,
    orden: indice,
    activo: true
  }));
  const resultado = resolverAsignacionBaseRotacion3DiasEfectiva({
    rotacion3Dias: {
      asignacionBase: {},
      bloques: {
        "2026-08-25": {
          "Sector A": referencia(personalMini[0]),
          "Sector B": referencia(personalMini[1])
        }
      }
    },
    periodos: [{ clave: "2026-08-25", indice: 8 }],
    filas: filasMini,
    filasFijas: ["Sector A"],
    asignacionesFijas: [{ sectorId: "s1", personaId: "FIJA" }],
    filasConfiguracion: configuracionMini,
    personal: personalMini,
    categoria: "enfermero"
  });
  assert.equal(resultado.ok, true, JSON.stringify(resultado));
  assert.equal(resultado.bloqueReferencia.periodo.clave, "2026-08-25");
  assert.equal(resultado.asignacionBase["Sector A"].personaId, "FIJA");
});

await probar("21 las vigencias no intervienen ni se crean al preparar", async () => {
  const fuente = await readFile(new URL("../src/utils/preparacionMesNuevo.js", import.meta.url), "utf8");
  const inicio = fuente.indexOf("export const reconciliarPersonalPreparacionMes");
  const fin = fuente.indexOf("export const obtenerFilasPlanilla", inicio);
  const reconciliacion = fuente.slice(inicio, fin);
  assert.doesNotMatch(reconciliacion, /vigencias_turno_personal|guardarVigencias|eliminarVigencias/);
});

await probar("22 App analiza la fuente y limpia solamente el resultado construido", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const inicio = app.indexOf("const iniciarPreparacionMes = async");
  const fin = app.indexOf("const confirmarPreparacionMes", inicio);
  const preparacion = app.slice(inicio, fin);
  assert.match(preparacion, /obtenerEstadosDeOtrosTurnos/);
  assert.match(preparacion, /Object\.keys\(TURNOS\)/);
  assert.match(preparacion, /reconciliarPersonalPreparacionMes/);
  assert.match(app, /aplicarOmisionesPersonalEstadoPreparado/);
  assert.match(app, /estadoOrigen: origen\.estado/);
});

await probar("23 el resultado informa omisiones sin tratarlas como error", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /Mes preparado correctamente\./);
  assert.match(app, /personasOmitidas/);
  assert.match(app, /→ \{persona\.turnoNombre\}/);
});

console.log(`\n${total} pruebas de preparación con cambio de turno base superadas.`);
