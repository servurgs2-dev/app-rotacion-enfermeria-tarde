import assert from "node:assert/strict";
import {
  agruparCierresPorCuenta,
  agruparCierresPorResponsable,
  calcularEstadisticasCierres,
  calcularPorcentajeAsistencia,
  crearSerieTemporalEstadisticas,
  esRangoFechasInvalido,
  filtrarCierresPorFecha,
  obtenerCierresEstadisticos
} from "../src/utils/estadisticasCierres.js";
import {
  combinarEstadoActivoComparacion,
  crearClaveCacheComparacion,
  crearComparacionTurnos,
  debeConsultarComparacion,
  esSolicitudComparacionVigente
} from "../src/utils/comparacionTurnos.js";
import {
  cerrarFechaCategoria,
  obtenerUltimaVersionCierre,
  reabrirFechaCategoria
} from "../src/utils/cierreTurno.js";

let cantidadPruebas = 0;
const probar = (nombre, comprobacion) => {
  comprobacion();
  cantidadPruebas += 1;
  process.stdout.write(`✓ ${nombre}\n`);
};
const clonar = (valor) => structuredClone(valor);
const referencia = (personaId, nombre = personaId) => ({ personaId, nombre });
const crearSnapshot = ({
  previstos = 0,
  presentes = 0,
  ausentes = 0,
  pendientes = 0,
  extras = 0,
  sinCobertura = 0,
  criticas = 0,
  coberturaSM = 0,
  propiedades = {}
} = {}) => ({
  fecha: "2026-07-01",
  tipo: "enfermero",
  resumen: {
    conteos: { previstos, presentes, ausentes, pendientes },
    alertas: [
      ...Array.from({ length: criticas }, (_, indice) => ({
        id: `critica-${indice}`,
        nivel: "critica",
        mensaje: "Crítica"
      })),
      { id: "info", nivel: "informacion", mensaje: "Información" }
    ]
  },
  asignaciones: Array.from({ length: coberturaSM }, (_, indice) => ({
    sector: "SM",
    persona: referencia(`sm-${indice}`),
    coberturaLibreSM: true
  })),
  extrasRegistrados: Array.from({ length: extras }, (_, indice) => referencia(`extra-${indice}`)),
  sectoresSinCobertura: Array.from({ length: sinCobertura }, (_, indice) => `Sector ${indice}`),
  ...propiedades
});
const snapshotA = crearSnapshot({
  previstos: 10,
  presentes: 8,
  ausentes: 1,
  pendientes: 1,
  extras: 2,
  sinCobertura: 1,
  criticas: 1,
  coberturaSM: 1
});
const snapshotB = crearSnapshot({
  previstos: 5,
  presentes: 4,
  ausentes: 1,
  pendientes: 0,
  extras: 1,
  sinCobertura: 2,
  criticas: 2
});
const version = ({ revision, snapshot, cerradoPor = "lic_tarde", responsable = "Rafael" }) => ({
  revision,
  cerradoEn: `2026-07-0${Math.min(revision, 9)}T18:00:00.000Z`,
  cerradoPor,
  ...(responsable ? { responsableCierre: referencia(`responsable-${revision}`, responsable) } : {}),
  snapshot
});
const calendarioBase = {
  enfermeros: {
    cierresDia: {
      "2026-07-01": { estado: "cerrado", revisionActual: 1, versiones: [version({ revision: 1, snapshot: snapshotA })] },
      "2026-07-02": { estado: "reabierto", revisionActual: 1, versiones: [version({ revision: 1, snapshot: snapshotA })] },
      "2026-07-03": { estado: "abierto", revisionActual: 1, versiones: [version({ revision: 1, snapshot: snapshotA })] },
      "2026-07-04": {
        estado: "cerrado",
        revisionActual: 2,
        versiones: [version({ revision: 1, snapshot: snapshotB }), version({ revision: 2, snapshot: snapshotA, responsable: "Andrea" })]
      },
      "2026-07-05": {
        estado: "cerrado",
        revisionActual: 99,
        versiones: [version({ revision: 1, snapshot: snapshotB }), version({ revision: 2, snapshot: snapshotA })]
      },
      "2026-07-06": { estado: "cerrado", revisionActual: 1, versiones: [null] },
      "2026-07-07": { estado: "cerrado", revisionActual: 1, versiones: [version({ revision: 1, snapshot: {} })] }
    }
  },
  licenciados: {
    cierresDia: {
      "2026-07-01": {
        estado: "cerrado",
        revisionActual: 1,
        versiones: [version({ revision: 1, snapshot: snapshotB, cerradoPor: "", responsable: "" })]
      }
    }
  }
};

probar("incluye un cierre cerrado", () => {
  assert.ok(obtenerCierresEstadisticos({ calendario: calendarioBase, categoria: "enfermero" }).some((fila) => fila.fecha === "2026-07-01"));
});
probar("excluye un cierre reabierto", () => {
  assert.ok(!obtenerCierresEstadisticos({ calendario: calendarioBase }).some((fila) => fila.fecha === "2026-07-02"));
});
probar("excluye un cierre que no está cerrado", () => {
  assert.ok(!obtenerCierresEstadisticos({ calendario: calendarioBase }).some((fila) => fila.fecha === "2026-07-03"));
});
probar("revisionActual selecciona la revisión correcta", () => {
  assert.equal(obtenerCierresEstadisticos({ calendario: calendarioBase, categoria: "enfermero" }).find((fila) => fila.fecha === "2026-07-04").responsable, "Andrea");
});
probar("una revisionActual ausente usa la última versión", () => {
  assert.equal(obtenerCierresEstadisticos({ calendario: calendarioBase, categoria: "enfermero" }).find((fila) => fila.fecha === "2026-07-05").revision, 2);
});
probar("las revisiones anteriores no se duplican", () => {
  assert.equal(obtenerCierresEstadisticos({ calendario: calendarioBase, categoria: "enfermero" }).filter((fila) => fila.fecha === "2026-07-04").length, 1);
});
probar("un cierre sin versiones válidas se omite sin error", () => {
  assert.ok(!obtenerCierresEstadisticos({ calendario: calendarioBase }).some((fila) => fila.fecha === "2026-07-06"));
});
probar("un snapshot incompleto usa valores seguros", () => {
  const fila = obtenerCierresEstadisticos({ calendario: calendarioBase, categoria: "enfermero" }).find((item) => item.fecha === "2026-07-07");
  assert.deepEqual(fila.conteos, { previstos: 0, presentes: 0, ausentes: 0, pendientes: 0 });
  assert.equal(fila.porcentajeAsistencia, 0);
});
probar("la selección no muta el calendario", () => {
  const original = clonar(calendarioBase);
  obtenerCierresEstadisticos({ calendario: calendarioBase });
  assert.deepEqual(calendarioBase, original);
});
probar("el resultado estadístico es serializable", () => {
  assert.doesNotThrow(() => JSON.stringify(obtenerCierresEstadisticos({ calendario: calendarioBase })));
});
probar("obtenerUltimaVersionCierre respeta revisionActual", () => {
  assert.equal(obtenerUltimaVersionCierre(calendarioBase.enfermeros.cierresDia, "2026-07-04").revision, 2);
});

const enfermeros = obtenerCierresEstadisticos({ calendario: calendarioBase, categoria: "enfermero" });
const licenciados = obtenerCierresEstadisticos({ calendario: calendarioBase, categoria: "licenciado" });
const ambas = obtenerCierresEstadisticos({ calendario: calendarioBase, categoria: "ambas" });
probar("filtra Enfermeros", () => assert.ok(enfermeros.every((fila) => fila.tipo === "enfermero")));
probar("filtra Licenciados", () => assert.ok(licenciados.every((fila) => fila.tipo === "licenciado")));
probar("ambas categorías incluye las dos", () => assert.deepEqual(new Set(ambas.map((fila) => fila.tipo)), new Set(["enfermero", "licenciado"])));
probar("fechaDesde es inclusiva", () => assert.ok(filtrarCierresPorFecha(enfermeros, { fechaDesde: "2026-07-04" }).some((fila) => fila.fecha === "2026-07-04")));
probar("fechaHasta es inclusiva", () => assert.ok(filtrarCierresPorFecha(enfermeros, { fechaHasta: "2026-07-04" }).some((fila) => fila.fecha === "2026-07-04")));
probar("un rango sin filas produce totales cero", () => {
  const resultado = calcularEstadisticasCierres(filtrarCierresPorFecha(enfermeros, { fechaDesde: "2027-01-01" }));
  assert.equal(resultado.totales.cierres, 0);
  assert.equal(resultado.totales.porcentajeAsistencia, 0);
});
probar("detecta un rango invertido", () => assert.equal(esRangoFechasInvalido({ fechaDesde: "2026-07-05", fechaHasta: "2026-07-01" }), true));
probar("un rango invertido devuelve una lista vacía", () => assert.deepEqual(filtrarCierresPorFecha(enfermeros, { fechaDesde: "2026-07-05", fechaHasta: "2026-07-01" }), []));
probar("excluye cierres fuera del rango", () => assert.ok(filtrarCierresPorFecha(enfermeros, { fechaDesde: "2026-07-04", fechaHasta: "2026-07-05" }).every((fila) => fila.fecha >= "2026-07-04" && fila.fecha <= "2026-07-05")));
probar("la serie queda en orden cronológico", () => {
  const serie = crearSerieTemporalEstadisticas(enfermeros);
  assert.deepEqual(serie.map((fila) => fila.fecha), [...serie.map((fila) => fila.fecha)].sort());
});
probar("la tabla queda de fecha reciente a antigua", () => {
  assert.deepEqual(enfermeros.map((fila) => fila.fecha), [...enfermeros.map((fila) => fila.fecha)].sort().reverse());
});

const filaA = ambas.find((fila) => fila.fecha === "2026-07-01" && fila.tipo === "enfermero");
const filaB = ambas.find((fila) => fila.fecha === "2026-07-01" && fila.tipo === "licenciado");
const acumuladas = calcularEstadisticasCierres([filaA, filaB]);
const totalesEsperados = {
  cierres: 2,
  previstos: 15,
  presentes: 12,
  ausentes: 2,
  pendientes: 1,
  extras: 3,
  sectoresSinCobertura: 3,
  alertasCriticas: 3,
  cierresConAlertasCriticas: 2,
  coberturasSaludMental: 1,
  cierresConCoberturaSaludMental: 1,
  porcentajeAsistencia: 80
};
for (const [campo, esperado] of Object.entries(totalesEsperados)) {
  probar(`calcula el total ${campo}`, () => assert.equal(acumuladas.totales[campo], esperado));
}
probar("porcentaje cero con previstos cero", () => assert.equal(calcularPorcentajeAsistencia(4, 0), 0));

probar("agrupa por responsable histórico", () => {
  assert.ok(agruparCierresPorResponsable(ambas).some((grupo) => grupo.nombre === "Rafael" && grupo.cantidad > 0));
});
probar("agrupa por cuenta compartida", () => {
  assert.ok(agruparCierresPorCuenta(ambas).some((grupo) => grupo.nombre === "lic_tarde" && grupo.cantidad > 0));
});
probar("representa responsable ausente con el texto real", () => assert.equal(filaB.responsable, "No registrado"));
probar("representa cuenta ausente con el texto real", () => assert.equal(filaB.cerradoPor, "No registrada"));
probar("las agrupaciones suman la cantidad de cierres", () => {
  assert.equal(agruparCierresPorResponsable(ambas).reduce((suma, grupo) => suma + grupo.cantidad, 0), ambas.length);
  assert.equal(agruparCierresPorCuenta(ambas).reduce((suma, grupo) => suma + grupo.cantidad, 0), ambas.length);
});

const turnos = [
  { id: "noche", nombre: "Noche" },
  { id: "manana", nombre: "Mañana" },
  { id: "tarde", nombre: "Tarde" },
  { id: "vespertino", nombre: "Vespertino" }
];
const estadosPorTurno = {
  noche: { calendario: { enfermeros: { cierresDia: { "2026-07-01": calendarioBase.enfermeros.cierresDia["2026-07-01"] } }, licenciados: { cierresDia: {} } } },
  manana: { calendario: { enfermeros: { cierresDia: {} }, licenciados: { cierresDia: {} } } },
  vespertino: { calendario: { enfermeros: { cierresDia: {} }, licenciados: { cierresDia: { "2026-07-01": calendarioBase.licenciados.cierresDia["2026-07-01"] } } } }
};
const fuenteComparacion = clonar(estadosPorTurno);
const comparar = (categoria = "ambas", fechas = {}) => crearComparacionTurnos({
  estadosPorTurno,
  turnos,
  turnoActivo: "noche",
  categoria,
  ...fechas
});
const comparacion = comparar();
probar("produce cuatro turnos en orden fijo", () => assert.deepEqual(comparacion.filas.map((fila) => fila.turnoId), ["noche", "manana", "tarde", "vespertino"]));
probar("marca el turno activo", () => assert.equal(comparacion.filas.find((fila) => fila.turnoId === "noche").esTurnoActivo, true));
probar("un turno con cierres queda identificado", () => assert.equal(comparacion.filas.find((fila) => fila.turnoId === "noche").tieneCierres, true));
probar("un turno con estado y sin cierres queda identificado", () => {
  const fila = comparacion.filas.find((item) => item.turnoId === "manana");
  assert.equal(fila.tieneEstado, true);
  assert.equal(fila.tieneCierres, false);
});
probar("un turno sin estado queda como sin datos", () => assert.equal(comparacion.filas.find((fila) => fila.turnoId === "tarde").tieneEstado, false));
probar("los totales por turno son independientes", () => {
  assert.equal(comparacion.filas.find((fila) => fila.turnoId === "noche").previstos, 10);
  assert.equal(comparacion.filas.find((fila) => fila.turnoId === "vespertino").previstos, 5);
});
probar("la categoría se aplica a todos los turnos", () => {
  const resultado = comparar("enfermero");
  assert.equal(resultado.filas.find((fila) => fila.turnoId === "vespertino").cierres, 0);
});
probar("el rango se aplica a todos los turnos", () => {
  const resultado = comparar("ambas", { fechaDesde: "2026-07-02" });
  assert.ok(resultado.filas.every((fila) => fila.cierres === 0));
});
probar("calcula máximos para los gráficos", () => {
  assert.equal(comparacion.maximos.previstos, 10);
  assert.equal(comparacion.maximos.alertasCriticas, 2);
});
probar("un turno vacío no rompe la comparación", () => assert.doesNotThrow(() => crearComparacionTurnos({ estadosPorTurno: {}, turnos, categoria: "ambas" })));
probar("la comparación es inmutable", () => assert.deepEqual(estadosPorTurno, fuenteComparacion));
probar("la comparación es serializable", () => assert.doesNotThrow(() => JSON.stringify(comparacion)));

probar("un cierre reabierto desaparece y una nueva revisión cuenta una vez", () => {
  let cierres = cerrarFechaCategoria({
    cierresDia: {}, fecha: "2026-07-20", usuario: "lic_tarde",
    responsableCierre: referencia("lic-1", "Rafael"), snapshot: snapshotA,
    fechaHora: "2026-07-20T18:00:00.000Z"
  });
  cierres = reabrirFechaCategoria({ cierresDia: cierres, fecha: "2026-07-20", usuario: "supervision" });
  assert.equal(obtenerCierresEstadisticos({ calendario: { enfermeros: { cierresDia: cierres } }, categoria: "enfermero" }).length, 0);
  cierres = cerrarFechaCategoria({
    cierresDia: cierres, fecha: "2026-07-20", usuario: "supervision",
    responsableCierre: referencia("lic-2", "Andrea"), snapshot: snapshotB,
    fechaHora: "2026-07-20T19:00:00.000Z"
  });
  const filas = obtenerCierresEstadisticos({ calendario: { enfermeros: { cierresDia: cierres } }, categoria: "enfermero" });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].revision, 2);
  assert.equal(filas[0].conteos.previstos, 5);
});

probar("un snapshot nocturno de tres días se procesa de forma genérica", () => {
  const snapshotTresDias = crearSnapshot({
    previstos: 7, presentes: 5, ausentes: 1, pendientes: 1,
    extras: 2, sinCobertura: 1, criticas: 1, coberturaSM: 1,
    propiedades: { periodoOrigen: { tipo: "cada_3_dias", clave: "2026-08-01" } }
  });
  const calendario = { enfermeros: { cierresDia: {
    "2026-08-01": { estado: "cerrado", revisionActual: 1, versiones: [version({ revision: 1, snapshot: snapshotTresDias })] }
  } } };
  const resultado = calcularEstadisticasCierres(obtenerCierresEstadisticos({ calendario, categoria: "enfermero" }));
  assert.equal(resultado.totales.previstos, 7);
  assert.equal(resultado.totales.extras, 2);
  assert.equal(resultado.totales.coberturasSaludMental, 1);
  assert.ok(!JSON.stringify(resultado).includes("semana1"));
  assert.ok(!JSON.stringify(resultado).includes("semana5"));
  assert.ok(!JSON.stringify(resultado).includes("semana6"));
});

probar("crea una clave de caché determinista", () => assert.equal(crearClaveCacheComparacion("2026-07", 2), "2026-07|2"));
probar("consulta cuando la clave no está resuelta", () => assert.equal(debeConsultarComparacion({ habilitado: true, cache: new Map(), claveSolicitud: "2026-07|0" }), true));
probar("reutiliza una clave ya resuelta", () => assert.equal(debeConsultarComparacion({ habilitado: true, cache: new Map([["2026-07|0", { estado: "exito" }]]), claveSolicitud: "2026-07|0" }), false));
probar("no consulta si la comparación está deshabilitada", () => assert.equal(debeConsultarComparacion({ habilitado: false, cache: new Map(), claveSolicitud: "2026-07|0" }), false));
probar("el estado activo prevalece sobre el remoto", () => {
  const remoto = { marca: "remoto" };
  const activo = { marca: "activo" };
  assert.equal(combinarEstadoActivoComparacion({ estadosRecuperados: { noche: remoto, tarde: remoto }, turnoActivo: "noche", estadoActivo: activo }).noche, activo);
});
probar("conserva los otros turnos remotos", () => {
  const tarde = { marca: "remoto" };
  assert.equal(combinarEstadoActivoComparacion({ estadosRecuperados: { tarde }, turnoActivo: "noche", estadoActivo: {} }).tarde, tarde);
});
probar("acepta la respuesta vigente", () => assert.equal(esSolicitudComparacionVigente(3, 3), true));
probar("descarta lógicamente una respuesta obsoleta", () => assert.equal(esSolicitudComparacionVigente(4, 3), false));

process.stdout.write(`\nEtapa 20C: ${cantidadPruebas} pruebas permanentes superadas.\n`);
