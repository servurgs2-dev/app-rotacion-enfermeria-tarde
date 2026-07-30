import assert from "node:assert/strict";
import fs from "node:fs";
import {
  aplicarAsignacionesParcialesDia,
  detectarDisponiblesPorReintegro,
  eliminarAsignacionParcial,
  evaluarAsignacionesParcialesDia,
  filtrarReintegradosSinSectorDia,
  guardarAsignacionParcial,
  obtenerAsignacionesParcialesPeriodo,
  obtenerFechasPeriodoEnMes,
  validarAsignacionParcial
} from "../src/utils/asignacionesParcialesPlanilla.js";
import {
  estaDeLicencia,
  esDiaLibre,
  obtenerSemanasDelMes,
  parsearFechaLocal
} from "../src/utils/fechas.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";
import { vaciarPlanillaMensual } from "../src/utils/limpiezaSegura.js";
import { limpiarReferenciasDePersona } from "../src/utils/integridadPersonas.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { obtenerIdentidadesTurnantes } from "../src/utils/etiquetaTurnante.js";
import { obtenerOpcionesSelectorPlanilla } from "../src/utils/opcionesSelectorPlanilla.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const persona = (id, nombre, categoria = "enfermero") => ({
  id,
  nombre,
  categoria,
  turno: "tarde",
  funcionario: id
});
const maria = persona("p21", "María Reintegro");
const base = Array.from({ length: 20 }, (_, indice) =>
  persona(`p${indice + 1}`, `Persona ${indice + 1}`)
);
const personal = [...base, maria, persona("l1", "Licenciada", "licenciado")];
const filas = Array.from({ length: 20 }, (_, indice) =>
  indice < 15 ? `Sector ${indice + 1}` : `T${indice - 14}`
);
const distribucion = Object.fromEntries(
  filas.map((fila, indice) => [
    fila,
    { personaId: base[indice].id, nombre: base[indice].nombre }
  ])
);
const periodo = obtenerSemanasDelMes("2026-08").find(
  (semana) => semana.clave === "semana2"
);
const licenciaMaria = {
  personaId: maria.id,
  nombre: maria.nombre,
  desde: "2026-07-15",
  hasta: "2026-08-05"
};
const detectar = (opciones = {}) => detectarDisponiblesPorReintegro({
  personal,
  licencias: [licenciaMaria],
  distribucionBase: distribucion,
  asignacionesParciales: [],
  periodo,
  mesActivo: "2026-08",
  categoria: "enfermero",
  ...opciones
});

probar("1 persona sin licencia no aparece como reintegro", () => {
  assert.deepEqual(detectar({ licencias: [] }), []);
});
probar("2 licencia a mitad de semana habilita desde el día siguiente", () => {
  assert.deepEqual(detectar()[0].fechasDisponibles, [
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09"
  ]);
});
probar("3 detecta una licencia iniciada el mes anterior", () => {
  assert.equal(detectar()[0].persona.id, maria.id);
});
probar("4 licencia que cubre todo el mes no genera disponibilidad", () => {
  assert.deepEqual(detectar({
    licencias: [{ ...licenciaMaria, hasta: "2026-08-31" }]
  }), []);
});
probar("5 no incluye días todavía cubiertos por licencia", () => {
  assert.equal(detectar()[0].fechasDisponibles.includes("2026-08-05"), false);
});
probar("6 el primer día posterior queda sin sector", () => {
  assert.equal(detectar()[0].fechasSinSector[0], "2026-08-06");
});
probar("7 permite 20 asignaciones base más un reintegro", () => {
  assert.equal(Object.values(distribucion).length + detectar().length, 21);
});
probar("8 no elimina ninguna asignación base", () => {
  const copia = structuredClone(distribucion);
  detectar();
  assert.deepEqual(distribucion, copia);
});
probar("9 el reintegro no desplaza automáticamente a nadie", () => {
  assert.equal(Object.values(distribucion).some((ref) => ref.personaId === maria.id), false);
});
probar("10 no utiliza la colección Extras", () => {
  const fuente = fs.readFileSync(
    new URL("../src/utils/asignacionesParcialesPlanilla.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(fuente, /extras/i);
});
probar("11 puede permanecer varios días en SIN ASIGNAR", () => {
  assert.equal(detectar()[0].fechasSinSector.length, 4);
});

const licenciaTitular = {
  personaId: base[0].id,
  nombre: base[0].nombre,
  desde: "2026-08-08",
  hasta: "2026-08-31"
};
const borrador = {
  id: "a1",
  personaId: maria.id,
  sector: filas[0],
  desde: "2026-08-08",
  hasta: "2026-08-09",
  creadoEn: "2026-08-01T00:00:00.000Z"
};
const validar = (cambios = {}) => validarAsignacionParcial({
  asignacion: { ...borrador, ...(cambios.asignacion || {}) },
  periodo,
  mesActivo: "2026-08",
  filas,
  distribucionBase: distribucion,
  asignacionesExistentes: cambios.asignacionesExistentes || [],
  personal,
  licencias: cambios.licencias || [licenciaMaria, licenciaTitular],
  categoria: cambios.categoria || "enfermero"
});
const valida = validar();

probar("12 permite asignación parcial sobre un hueco real", () => {
  assert.equal(valida.ok, true);
});
probar("13 cubre a la persona base desde que inicia su licencia", () => {
  assert.deepEqual(valida.fechas, ["2026-08-08", "2026-08-09"]);
});
probar("14 bloquea días donde la persona base está disponible", () => {
  const resultado = validar({
    asignacion: { desde: "2026-08-06", hasta: "2026-08-09" }
  });
  assert.equal(resultado.ok, false);
  assert.match(resultado.mensaje, /06\/08.*07\/08/);
});
probar("15 informa las fechas concretas en conflicto", () => {
  assert.match(
    validar({ asignacion: { desde: "2026-08-07", hasta: "2026-08-08" } }).mensaje,
    /07\/08/
  );
});
probar("16 aplicar no modifica días anteriores", () => {
  assert.deepEqual(
    aplicarAsignacionesParcialesDia({
      distribucionBase: distribucion,
      asignacionesParciales: [valida.asignacion],
      fecha: "2026-08-07",
      personal
    }),
    distribucion
  );
});
probar("17 aplicar no modifica días posteriores", () => {
  assert.deepEqual(
    aplicarAsignacionesParcialesDia({
      distribucionBase: distribucion,
      asignacionesParciales: [valida.asignacion],
      fecha: "2026-08-10",
      personal
    }),
    distribucion
  );
});
probar("18 bloquea la misma persona en dos sectores", () => {
  const resultado = validar({
    asignacion: { sector: filas[1] },
    asignacionesExistentes: [{ ...valida.asignacion, sector: filas[2] }]
  });
  assert.equal(resultado.ok, false);
});
probar("19 bloquea dos personas en la misma posición", () => {
  const otra = persona("p22", "Otra Reintegrada");
  const resultado = validarAsignacionParcial({
    asignacion: { ...borrador, personaId: otra.id },
    periodo,
    mesActivo: "2026-08",
    filas,
    distribucionBase: { ...distribucion, [filas[0]]: "" },
    asignacionesExistentes: [{ ...borrador, id: "otra-asignacion", personaId: maria.id }],
    personal: [...personal, otra],
    licencias: [],
    categoria: "enfermero"
  });
  assert.equal(resultado.ok, false);
});
probar("20 guarda y edita inmutablemente", () => {
  const inicial = {};
  const guardada = guardarAsignacionParcial({
    planilla: inicial,
    periodoClave: periodo.clave,
    asignacion: valida.asignacion
  });
  const editada = guardarAsignacionParcial({
    planilla: guardada,
    periodoClave: periodo.clave,
    asignacion: { ...valida.asignacion, sector: filas[1] }
  });
  assert.equal(obtenerAsignacionesParcialesPeriodo(editada, periodo.clave)[0].sector, filas[1]);
  assert.deepEqual(inicial, {});
});
probar("21 eliminar devuelve a la persona al conjunto sin sector", () => {
  const planilla = guardarAsignacionParcial({
    planilla: {},
    periodoClave: periodo.clave,
    asignacion: valida.asignacion
  });
  const limpia = eliminarAsignacionParcial({
    planilla,
    periodoClave: periodo.clave,
    asignacionId: valida.asignacion.id
  });
  assert.deepEqual(obtenerAsignacionesParcialesPeriodo(limpia, periodo.clave), []);
});
probar("22 funciona para Enfermeros", () => assert.equal(valida.ok, true));
probar("23 funciona para Licenciados", () => {
  const licenciada = personal.find((actual) => actual.id === "l1");
  const resultado = detectar({
    categoria: "licenciado",
    distribucionBase: {},
    licencias: [{
      personaId: licenciada.id,
      nombre: licenciada.nombre,
      desde: "2026-07-01",
      hasta: "2026-08-05"
    }]
  });
  assert.equal(resultado[0].persona.id, licenciada.id);
});
probar("24 funciona en Mañana, Tarde y Vespertino con períodos semanales", () => {
  for (const mes of ["2026-08", "2026-09", "2026-10"]) {
    assert.ok(obtenerFechasPeriodoEnMes({
      periodo: obtenerSemanasDelMes(mes)[0],
      mesActivo: mes
    }).length > 0);
  }
});
probar("25 funciona en Noche semanal histórica", () => {
  assert.ok(obtenerFechasPeriodoEnMes({
    periodo: obtenerSemanasDelMes("2026-06")[0],
    mesActivo: "2026-06"
  }).length > 0);
});
probar("26 funciona en Noche con bloques de tres días", () => {
  const bloque = obtenerBloquesQueIntersectanMes({
    mesActivo: "2026-08",
    fechaBase: "2026-07-02",
    duracionDias: 3
  })[1];
  assert.ok(obtenerFechasPeriodoEnMes({ periodo: bloque, mesActivo: "2026-08" }).length > 0);
});
probar("27 una asignación parcial T conserva origen Turnante", () => {
  const efectiva = aplicarAsignacionesParcialesDia({
    distribucionBase: { T1: "" },
    asignacionesParciales: [{ ...valida.asignacion, sector: "T1" }],
    fecha: "2026-08-08",
    personal
  });
  assert.equal(obtenerIdentidadesTurnantes({
    distribucion: efectiva,
    posicionesTurnantes: ["T1"],
    personal
  }).has(`id:${maria.id}`), true);
});
probar("28 vaciar planilla elimina asignaciones parciales", () => {
  const resultado = vaciarPlanillaMensual({
    planilla: {
      semana1: {},
      asignacionesParciales: { semana1: [valida.asignacion] }
    },
    tipo: "enfermero"
  });
  assert.equal(Object.hasOwn(resultado, "asignacionesParciales"), false);
});
probar("29 eliminar Personal limpia por personaId", () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [maria];
  estado.planillas.enfermeros.asignacionesParciales = {
    semana2: [valida.asignacion]
  };
  const limpio = limpiarReferenciasDePersona(estado, maria);
  assert.deepEqual(limpio.planillas.enfermeros.asignacionesParciales.semana2, []);
});
probar("30 Calendario integra parciales sin guardarlos como cambios diarios", () => {
  const fuente = fs.readFileSync(
    new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
    "utf8"
  );
  assert.match(fuente, /evaluarAsignacionesParcialesDia/);
  assert.match(fuente, /reintegradosSinSectorHoy/);
});
probar("31 el panel permite crear, editar y confirmar eliminación", () => {
  const fuente = fs.readFileSync(
    new URL("../src/components/planilla/PanelReintegrosPlanilla.jsx", import.meta.url),
    "utf8"
  );
  assert.match(fuente, /Disponibles por reintegro/);
  assert.match(fuente, /Asignar por fechas/);
  assert.match(fuente, /Editar/);
  assert.match(fuente, /¿Eliminar esta asignación parcial\?/);
});
probar("32 no existe SQL nuevo", () => {
  assert.equal(
    fs.readdirSync(new URL("../supabase/migrations/", import.meta.url))
      .some((archivo) => archivo.includes("reintegro")),
    false
  );
});

const grupoLibreOchoAgosto = [1, 2, 3, 4, 5].find((libre) =>
  esDiaLibre({ libre }, parsearFechaLocal("2026-08-08"))
);
const evaluarDia = ({
  disponible = true,
  titularLicenciado = true,
  baseDia = distribucion,
  parciales = [valida.asignacion]
} = {}) => evaluarAsignacionesParcialesDia({
  distribucionBase: baseDia,
  asignacionesParciales: parciales,
  fecha: "2026-08-08",
  personal,
  esPersonaDisponible: () => disponible,
  estaPersonaBaseDeLicencia: () => titularLicenciado
});

probar("33 reintegrado libre se excluye de la disponibilidad diaria", () => {
  const libre = { ...maria, libre: grupoLibreOchoAgosto };
  const reintegro = { ...detectar()[0], persona: libre };
  assert.deepEqual(filtrarReintegradosSinSectorDia({
    reintegros: [reintegro],
    fecha: "2026-08-08",
    categoria: "enfermero",
    esPersonaDisponible: (actual) =>
      !esDiaLibre(actual, parsearFechaLocal("2026-08-08"))
  }), []);
});
probar("34 al terminar el libre vuelve a estar disponible", () => {
  const libre = { ...maria, libre: grupoLibreOchoAgosto };
  const reintegro = { ...detectar()[0], persona: libre };
  assert.equal(filtrarReintegradosSinSectorDia({
    reintegros: [reintegro],
    fecha: "2026-08-09",
    categoria: "enfermero",
    esPersonaDisponible: (actual) =>
      !esDiaLibre(actual, parsearFechaLocal("2026-08-09"))
  })[0].id, maria.id);
});
probar("35 reintegrado certificado no se aplica ni se asigna", () => {
  assert.deepEqual(filtrarReintegradosSinSectorDia({
    reintegros: detectar(),
    fecha: "2026-08-08",
    categoria: "enfermero",
    esPersonaDisponible: () => false
  }), []);
});
probar("36 reintegrado No disponible no se aplica", () => {
  assert.equal(evaluarDia({ disponible: false }).conflictos[0].motivo, "persona_no_disponible");
});
probar("37 reintegrado Ausente no se aplica", () => {
  assert.deepEqual(evaluarDia({ disponible: false }).distribucion, distribucion);
});
probar("38 parcial libre no sobrescribe la base", () => {
  assert.deepEqual(evaluarDia({ disponible: false }).distribucion, distribucion);
});
probar("39 parcial certificada o No disponible conserva el registro guardado", () => {
  const resultado = evaluarDia({ disponible: false });
  assert.equal(resultado.conflictos[0].asignacion.id, valida.asignacion.id);
});
probar("40 parcial Ausente no se duplica", () => {
  const resultado = evaluarDia({ disponible: false });
  assert.equal(resultado.aplicadas.length, 0);
  assert.equal(Object.values(resultado.distribucion).length, 20);
});
probar("41 no desplaza al titular si su licencia fue eliminada o acortada", () => {
  const resultado = evaluarDia({ titularLicenciado: false });
  assert.equal(resultado.conflictos[0].motivo, "titular_disponible");
  assert.equal(resultado.distribucion[filas[0]].personaId, base[0].id);
});
probar("42 dos licencias no ocultan el primer reintegro", () => {
  const resultado = detectar({
    licencias: [
      licenciaMaria,
      { ...licenciaMaria, desde: "2026-08-20", hasta: "2026-08-25" }
    ]
  });
  assert.deepEqual(resultado[0].fechasDisponibles, [
    "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"
  ]);
});
probar("43 una licencia posterior vuelve a excluir sus días", () => {
  const periodoAmplio = {
    desde: parsearFechaLocal("2026-08-03"),
    hasta: parsearFechaLocal("2026-08-30")
  };
  const resultado = detectar({
    periodo: periodoAmplio,
    licencias: [
      licenciaMaria,
      { ...licenciaMaria, desde: "2026-08-20", hasta: "2026-08-25" }
    ]
  })[0];
  assert.equal(resultado.fechasDisponibles.includes("2026-08-20"), false);
  assert.equal(resultado.fechasDisponibles.includes("2026-08-25"), false);
  assert.equal(resultado.fechasDisponibles.includes("2026-08-26"), true);
});
probar("44 admite tramos de disponibilidad separados", () => {
  const resultado = detectar({
    periodo: {
      desde: parsearFechaLocal("2026-08-03"),
      hasta: parsearFechaLocal("2026-08-30")
    },
    licencias: [
      licenciaMaria,
      { ...licenciaMaria, desde: "2026-08-20", hasta: "2026-08-25" }
    ]
  })[0];
  assert.deepEqual(
    resultado.tramosDisponibles.map(({ desde, hasta }) => ({ desde, hasta })),
    [
      { desde: "2026-08-06", hasta: "2026-08-19" },
      { desde: "2026-08-26", hasta: "2026-08-30" }
    ]
  );
});
probar("45 reintegrado No disponible no entra en SIN ASIGNAR", () => {
  assert.deepEqual(filtrarReintegradosSinSectorDia({
    reintegros: detectar(),
    fecha: "2026-08-08",
    categoria: "enfermero",
    esPersonaDisponible: () => false
  }), []);
});
probar("46 reintegrado Ausente no entra en SIN ASIGNAR", () => {
  assert.deepEqual(filtrarReintegradosSinSectorDia({
    reintegros: detectar(),
    fecha: "2026-08-08",
    categoria: "enfermero",
    esPersonaDisponible: () => false
  }), []);
});

const evelyn = persona("evelyn", "Evelyn Palma");
const semanaTres = obtenerSemanasDelMes("2026-08").find(
  (semana) => semana.clave === "semana3"
);
const licenciaEvelyn = {
  personaId: evelyn.id,
  nombre: evelyn.nombre,
  desde: "2026-08-01",
  hasta: "2026-08-11"
};
const referenciaEvelyn = { personaId: evelyn.id, nombre: evelyn.nombre };
const distribucionEvelyn = { "EXPLORA 1": referenciaEvelyn };
const opcionesEvelyn = obtenerOpcionesSelectorPlanilla({
  personalCategoria: [evelyn],
  personal: [evelyn],
  distribucion: distribucionEvelyn,
  sector: "EXPLORA 1",
  referenciaActual: referenciaEvelyn,
  licencias: [licenciaEvelyn],
  periodo: semanaTres
});

probar("47 conserva la referencia real de Evelyn en EXPLORA 1", () => {
  assert.deepEqual(distribucionEvelyn["EXPLORA 1"], referenciaEvelyn);
});
probar("48 muestra el valor actual aunque esté licenciada", () => {
  assert.equal(opcionesEvelyn.opciones[0].persona.nombre, "Evelyn Palma");
  assert.equal(opcionesEvelyn.opciones[0].etiquetaEstado, "licencia hasta 11/08");
});
probar("49 la opción conserva personaId", () => {
  assert.equal(opcionesEvelyn.opciones[0].persona.id, evelyn.id);
});
probar("50 no crea una opción duplicada", () => {
  assert.equal(
    opcionesEvelyn.opciones.filter(({ persona: actual }) => actual.id === evelyn.id).length,
    1
  );
});
probar("51 agregar una licencia no borra la asignación", () => {
  assert.equal(distribucionEvelyn["EXPLORA 1"].personaId, evelyn.id);
});
probar("52 eliminar la licencia no duplica la opción", () => {
  const resultado = obtenerOpcionesSelectorPlanilla({
    personalCategoria: [evelyn],
    personal: [evelyn],
    distribucion: distribucionEvelyn,
    sector: "EXPLORA 1",
    referenciaActual: referenciaEvelyn,
    licencias: [],
    periodo: semanaTres
  });
  assert.equal(resultado.opciones.length, 1);
});
probar("53 una persona con asignación base no aparece como reintegro", () => {
  assert.deepEqual(detectarDisponiblesPorReintegro({
    personal: [evelyn],
    licencias: [licenciaEvelyn],
    distribucionBase: distribucionEvelyn,
    periodo: semanaTres,
    mesActivo: "2026-08",
    categoria: "enfermero"
  }), []);
});
probar("54 Calendario excluye 10 y 11 e incluye 12 por la licencia inclusiva", () => {
  assert.equal(estaDeLicencia([licenciaEvelyn], evelyn, parsearFechaLocal("2026-08-10"), [evelyn]), true);
  assert.equal(estaDeLicencia([licenciaEvelyn], evelyn, parsearFechaLocal("2026-08-11"), [evelyn]), true);
  assert.equal(estaDeLicencia([licenciaEvelyn], evelyn, parsearFechaLocal("2026-08-12"), [evelyn]), false);
});
probar("55 funciona para Enfermeros y posiciones Turnantes", () => {
  const resultado = obtenerOpcionesSelectorPlanilla({
    personalCategoria: [evelyn],
    personal: [evelyn],
    distribucion: { T1: referenciaEvelyn },
    sector: "T1",
    referenciaActual: referenciaEvelyn,
    licencias: [licenciaEvelyn],
    periodo: semanaTres
  });
  assert.equal(resultado.opciones[0].persona.id, evelyn.id);
});
probar("56 funciona para Licenciados", () => {
  const licenciada = { ...evelyn, categoria: "licenciado" };
  const resultado = obtenerOpcionesSelectorPlanilla({
    personalCategoria: [licenciada],
    personal: [licenciada],
    distribucion: { T1: { personaId: licenciada.id, nombre: licenciada.nombre } },
    sector: "T1",
    referenciaActual: { personaId: licenciada.id, nombre: licenciada.nombre },
    licencias: [{ ...licenciaEvelyn }],
    periodo: semanaTres
  });
  assert.equal(resultado.opciones[0].persona.id, licenciada.id);
});
probar("57 funciona en bloques nocturnos", () => {
  const bloque = obtenerBloquesQueIntersectanMes({
    mesActivo: "2026-08",
    fechaBase: "2026-07-02",
    duracionDias: 3
  }).find((actual) => actual.fechaInicio <= "2026-08-11" && actual.fechaFin >= "2026-08-11");
  const resultado = obtenerOpcionesSelectorPlanilla({
    personalCategoria: [evelyn],
    personal: [evelyn],
    distribucion: { "EXPLORA 1": referenciaEvelyn },
    sector: "EXPLORA 1",
    referenciaActual: referenciaEvelyn,
    licencias: [licenciaEvelyn],
    periodo: bloque
  });
  assert.equal(resultado.opciones[0].persona.id, evelyn.id);
});
probar("58 no modifica asignaciones parciales ni Extras", () => {
  const parcial = { ...borrador };
  const extras = [{ id: "extra-1", nombre: "Extra" }];
  obtenerOpcionesSelectorPlanilla({
    personalCategoria: [evelyn],
    personal: [evelyn],
    distribucion: distribucionEvelyn,
    sector: "EXPLORA 1",
    referenciaActual: referenciaEvelyn,
    licencias: [licenciaEvelyn],
    periodo: semanaTres
  });
  assert.deepEqual(parcial, borrador);
  assert.deepEqual(extras, [{ id: "extra-1", nombre: "Extra" }]);
});

console.log(`\n${total} pruebas de reintegros y asignaciones parciales pasaron.`);
