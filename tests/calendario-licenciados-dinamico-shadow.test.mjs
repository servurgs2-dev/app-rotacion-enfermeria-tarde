import assert from "node:assert/strict";
import fs from "node:fs";
import { resolverPerfilEstructuraLicenciadosDia } from "../src/utils/dotacionEfectivaLicenciadosDia.js";
import {
  debeUsarCalendarioLicenciadosDinamicoVisible,
  resolverCalendarioLicenciadosDinamico,
  resolverOrdenVisibleCalendarioLicenciadosDinamico
} from "../src/utils/calendarioLicenciadosDinamico.js";
import { CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 } from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";
import {
  aplicarMovimientosCalendario,
  aplicarMovimientosOperativosCalendarioV2,
  crearMovimientosEntreFilasCalendario,
  resolverClaveMovimientoCalendario
} from "../src/utils/cambiosCalendario.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const persona = (id) => ({ id, nombre: `Persona ${id}`, categoria: "licenciado" });
const prioridadCompleta = [
  "triage_1", "estabiliza", "reanimacion", "sillones", "observacion_1",
  "triage_2", "diagnostico", "explora", "observacion_2", "preinternacion", "salud_mental"
];
const crearBase = ({ turnantes = [persona("t1"), persona("t2"), persona("t3")], vaciar = [] } = {}) => [
  ...[
    ["triage_1", "triage"], ["estabiliza", "estabiliza"], ["reanimacion", "rea"],
    ["observacion_1", "obs1"], ["triage_2", "triage2"], ["diagnostico", "dx"],
    ["observacion_2", "obs2"], ["preinternacion", "pre"], ["salud_mental", "sm"]
  ].map(([sectorId, titular]) => ({
    filaId: `licenciado.sector.${sectorId}`,
    sectorId,
    tipo: "sector",
    enfermero: vaciar.includes(sectorId) ? null : persona(titular)
  })),
  ...[1, 3, 2].map((ordinal) => ({
    filaId: `licenciado.turnante.${ordinal}`,
    turnanteId: `turnante_${ordinal}`,
    tipo: "turnante",
    enfermero: turnantes[{ 1: 0, 2: 1, 3: 2 }[ordinal]] || null
  }))
];
const crearPerfil = (dotacion, prioridad = prioridadCompleta) => resolverPerfilEstructuraLicenciadosDia({
  personalBase: Array.from({ length: dotacion }, (_, indice) => persona(`dot-${indice}`)),
  prioridadTurno: prioridad
});
const resolver = ({
  versionEstructura = 2,
  dotacion = 10,
  prioridad = prioridadCompleta,
  candidatosPrioridad = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2,
  base = crearBase(),
  perfil = crearPerfil(dotacion, prioridad),
  cambiosDia = {},
  extras = [],
  esPersonaDisponible = () => true
} = {}) => resolverCalendarioLicenciadosDinamico({
  versionEstructura,
  perfil,
  asignacionesBase: base,
  prioridadTurno: prioridad,
  candidatosPrioridad,
  personal: [...base.map((fila) => fila.enfermero), ...extras].filter(Boolean),
  extras,
  cambiosDia,
  esPersonaDisponible,
  esPersonaDisponibleParaCobertura: esPersonaDisponible
});
const destino = (resultado, id) => resultado.asignacionesOperativas?.find((fila) =>
  (fila.destinoId || fila.sectorId) === id
);

probar("v1 y versión ausente no ejecutan pipeline", () => {
  assert.equal(resolver({ versionEstructura: 1 }).motivo, "ESTRUCTURA_LICENCIADOS_LEGACY");
  assert.equal(resolverCalendarioLicenciadosDinamico({
    perfil: crearPerfil(10),
    asignacionesBase: crearBase(),
    prioridadTurno: prioridadCompleta,
    candidatosPrioridad: CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2
  }).aplicar, false);
});
probar("base v2 contaminada con fila legacy no aplica", () => {
  const base = [...crearBase(), { tipo: "sector", sectorId: "reanimacion_sillones", enfermero: persona("legacy") }];
  assert.equal(resolver({ base }).motivo, "ASIGNACIONES_BASE_LICENCIADOS_NO_COMPATIBLES_V2");
});
probar("prioridad incompleta propaga diagnóstico", () => {
  const resultado = resolver({ prioridad: ["explora"], perfil: crearPerfil(10, ["explora"]) });
  assert.equal(resultado.aplicar, false);
  assert.equal(resultado.diagnostico, "PRIORIDAD_COBERTURA_LICENCIADOS_V2_INVALIDA");
});
probar("prioridad inválida bloquea dotaciones nueve, diez y once", () => {
  for (const dotacion of [9, 10, 11]) {
    for (const prioridad of [
      prioridadCompleta.filter((id) => id !== "sillones"),
      prioridadCompleta.filter((id) => id !== "explora"),
      [...prioridadCompleta, "sillones"],
      [...prioridadCompleta, "turnante_1"],
      [...prioridadCompleta, "reanimacion_sillones"]
    ]) {
      const resultado = resolver({ dotacion, prioridad, perfil: crearPerfil(dotacion, prioridad) });
      assert.equal(resultado.ok, false);
      assert.equal(resultado.aplicar, false);
      assert.equal(resultado.diagnostico, "PRIORIDAD_COBERTURA_LICENCIADOS_V2_INVALIDA");
      assert.equal(Object.hasOwn(resultado, "proyeccion"), false);
    }
  }
});
probar("prioridad legacy bloquea dotaciones nueve y once", () => {
  const prioridad = prioridadCompleta.map((id) => id === "reanimacion" ? "reanimacion_sillones" : id);
  for (const dotacion of [9, 11]) {
    assert.equal(resolver({ dotacion, prioridad, perfil: crearPerfil(dotacion, prioridad) }).aplicar, false);
  }
});
probar("dotaciones ocho, siete y seis aplican estructura combinada v2", () => {
  for (const dotacion of [8, 7, 6]) {
    const resultado = resolver({ dotacion, perfil: crearPerfil(dotacion) });
    assert.equal(resultado.aplicar, true);
    assert.equal(resultado.perfil.resultado.modo, "combinados");
    assert.equal(Boolean(destino(resultado, "reanimacion_sillones")), true);
    assert.equal(Boolean(destino(resultado, "diagnostico_explora")), true);
    assert.equal(Boolean(destino(resultado, "sillones")), false);
    assert.equal(Boolean(destino(resultado, "explora")), false);
  }
});
probar("dotación ocho con prioridad inválida diagnostica configuración", () => {
  const prioridad = prioridadCompleta.filter((id) => id !== "sillones");
  const resultado = resolver({ dotacion: 8, prioridad, perfil: crearPerfil(8, prioridad) });
  assert.equal(resultado.delegarEscasez, false);
  assert.equal(resultado.diagnostico, "PRIORIDAD_COBERTURA_LICENCIADOS_V2_INVALIDA");
});
probar("dotación nueve genera dos combinados sin consumir Turnantes", () => {
  const resultado = resolver({ dotacion: 9, perfil: crearPerfil(9) });
  assert.equal(destino(resultado, "reanimacion_sillones").enfermero.id, "rea");
  assert.equal(destino(resultado, "diagnostico_explora").enfermero.id, "dx");
  assert.equal(resultado.turnantesUtilizados.length, 0);
});
for (const idTurnante of ["t1", "t3"]) {
  probar(`dotación diez permite cubrir Sillones con ${idTurnante}`, () => {
    const turnantes = idTurnante === "t1" ? [persona("t1")] : [null, null, persona("t3")];
    const resultado = resolver({ base: crearBase({ turnantes }) });
    assert.equal(destino(resultado, "sillones").enfermero.id, idTurnante);
  });
}
probar("dotación diez separa Explora y cualquier Turnante puede cubrirla", () => {
  const prioridad = prioridadCompleta.map((id) => id).sort((a, b) =>
    a === "explora" ? -1 : b === "explora" ? 1 : a === "sillones" ? -1 : b === "sillones" ? 1 : 0
  );
  const resultado = resolver({ prioridad, perfil: crearPerfil(10, prioridad), base: crearBase({ turnantes: [null, persona("t2")] }) });
  assert.equal(destino(resultado, "explora").enfermero.id, "t2");
  assert.equal(Boolean(destino(resultado, "reanimacion_sillones")), true);
});
probar("dotación once abre y cubre Sillones y Explora con dos Turnantes", () => {
  const resultado = resolver({ dotacion: 11, perfil: crearPerfil(11), base: crearBase({ turnantes: [persona("t1"), persona("t2")] }) });
  assert.equal(destino(resultado, "sillones").enfermero.id, "t1");
  assert.equal(destino(resultado, "explora").enfermero.id, "t2");
  assert.equal(resultado.turnantesUtilizados.length, 2);
});
probar("prioridad general cubre primero otra vacante superior", () => {
  const resultado = resolver({ base: crearBase({ turnantes: [persona("t1")], vaciar: ["estabiliza"] }) });
  assert.equal(destino(resultado, "estabiliza").enfermero.id, "t1");
  assert.notEqual(destino(resultado, "sillones").enfermero?.id, "t1");
});
probar("orden relativo de Sillones y Explora gobierna dos vacantes", () => {
  for (const prioridad of [prioridadCompleta, [...prioridadCompleta].map((id) => id === "sillones" ? "explora" : id === "explora" ? "sillones" : id)]) {
    const resultado = resolver({ dotacion: 11, prioridad, perfil: crearPerfil(11, prioridad), base: crearBase({ turnantes: [persona("t1")] }) });
    const primero = prioridad.indexOf("sillones") < prioridad.indexOf("explora") ? "sillones" : "explora";
    assert.equal(destino(resultado, primero).enfermero.id, "t1");
  }
});
probar("sector base desactivado no reaparece", () => {
  const prioridad = prioridadCompleta.filter((id) => id !== "observacion_2");
  const candidatosPrioridad = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2
    .filter(({ id }) => id !== "observacion_2");
  const resultado = resolver({ prioridad, candidatosPrioridad, perfil: crearPerfil(10, prioridad) });
  assert.equal(Boolean(destino(resultado, "observacion_2")), false);
  assert.equal(resultado.aplicar, true);
});
probar("identidades no se duplican y un Turnante no se usa dos veces", () => {
  const resultado = resolver({ dotacion: 11, perfil: crearPerfil(11), base: crearBase({ turnantes: [persona("t1")] }) });
  const ids = resultado.asignacionesOperativas.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(resultado.turnantesUtilizados.length, 1);
});
probar("T4 adicional cubre como cualquier Turnante y no queda restante", () => {
  const base = [
    ...crearBase({ turnantes: [null, null, null] }),
    {
      filaId: "licenciado.turnante.4",
      turnanteId: "turnante_4",
      tipo: "turnante",
      etiqueta: "T4",
      enfermero: persona("t4")
    }
  ];
  const resultado = resolver({ base });
  assert.equal(destino(resultado, "sillones").enfermero.id, "t4");
  assert.deepEqual(resultado.turnantesUtilizados.map(({ turnanteId }) => turnanteId), ["turnante_4"]);
  assert.equal(resultado.turnantesRestantes.some(({ turnanteId }) => turnanteId === "turnante_4"), false);
});
probar("gate visible aplica sólo a resultado v2 aplicable fuera de paro", () => {
  const nueve = resolver({ dotacion: 9, perfil: crearPerfil(9) });
  assert.equal(debeUsarCalendarioLicenciadosDinamicoVisible({ resultado: nueve }), true);
  assert.equal(debeUsarCalendarioLicenciadosDinamicoVisible({ resultado: nueve, esDiaParo: true }), false);
  assert.equal(debeUsarCalendarioLicenciadosDinamicoVisible({
    resultado: resolver({ dotacion: 8, perfil: crearPerfil(8) })
  }), true);
  assert.equal(debeUsarCalendarioLicenciadosDinamicoVisible({ resultado: resolver({ versionEstructura: 1 }) }), false);
});
probar("clave de movimiento conserva legacy en v1 y usa destinoId exacto en v2", () => {
  const fila = { nombre: "Reanimación + Sillones", destinoId: "reanimacion_sillones" };
  assert.equal(resolverClaveMovimientoCalendario({ fila, categoria: "licenciado", versionEstructura: 1 }), "REANIMACION + SILLONES");
  assert.equal(resolverClaveMovimientoCalendario({ fila, categoria: "licenciado", versionEstructura: 2 }), "reanimacion_sillones");
});
probar("escritura v2 usa IDs y mantiene intercambio sin duplicados", () => {
  const base = crearBase({ turnantes: [persona("t1")] });
  const cambiosDia = aplicarMovimientosCalendario({
    cambios: {},
    movimientos: crearMovimientosEntreFilasCalendario({
      seleccionado: { nombre: "Reanimación", destinoId: "reanimacion", enfermero: persona("rea") },
      destino: { nombre: "Sillones", destinoId: "sillones", enfermero: persona("t1") },
      resolverClave: (fila) => resolverClaveMovimientoCalendario({ fila, categoria: "licenciado", versionEstructura: 2 })
    })
  });
  assert.deepEqual(Object.keys(cambiosDia), ["sillones", "reanimacion"]);
  const resultado = resolver({ dotacion: 11, perfil: crearPerfil(11), base, cambiosDia });
  assert.equal(destino(resultado, "reanimacion").enfermero.id, "t1");
  assert.equal(destino(resultado, "sillones").enfermero.id, "rea");
  const ids = resultado.asignacionesOperativas.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});
probar("overrides individuales y combinados no se transforman al cambiar 11↔9", () => {
  const individual = resolver({ dotacion: 9, perfil: crearPerfil(9), cambiosDia: { sillones: { personaId: "triage" } } });
  assert.equal(destino(individual, "reanimacion_sillones").enfermero.id, "rea");
  const combinado = resolver({ dotacion: 11, perfil: crearPerfil(11), cambiosDia: { reanimacion_sillones: { personaId: "triage" } } });
  assert.equal(destino(combinado, "reanimacion").enfermero.id, "rea");
  const exploraIndividual = resolver({ dotacion: 9, perfil: crearPerfil(9), cambiosDia: { explora: { personaId: "triage" } } });
  assert.equal(destino(exploraIndividual, "diagnostico_explora").enfermero.id, "dx");
  const exploraCombinado = resolver({ dotacion: 11, perfil: crearPerfil(11), cambiosDia: { diagnostico_explora: { personaId: "triage" } } });
  assert.equal(destino(exploraCombinado, "diagnostico").enfermero.id, "dx");
});
probar("movimiento combinado intercambia con otro sector y preserva identidades", () => {
  const cambiosDia = {
    reanimacion_sillones: { personaId: "triage" },
    triage_1: { personaId: "rea" }
  };
  const resultado = resolver({ dotacion: 8, perfil: crearPerfil(8), cambiosDia });
  assert.equal(destino(resultado, "reanimacion_sillones").enfermero.id, "triage");
  assert.equal(destino(resultado, "triage_1").enfermero.id, "rea");
  const ids = resultado.asignacionesOperativas.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});
probar("Diagnóstico y Explora intercambian por IDs exactos", () => {
  const base = crearBase({ turnantes: [persona("t1")] });
  const resultado = resolver({
    dotacion: 11,
    perfil: crearPerfil(11),
    base,
    cambiosDia: {
      diagnostico: { personaId: "t1" },
      explora: { personaId: "dx" }
    }
  });
  assert.equal(destino(resultado, "diagnostico").enfermero.id, "t1");
  assert.equal(destino(resultado, "explora").enfermero.id, "dx");
});
probar("Diagnóstico+Explora intercambia con un sector estable", () => {
  const resultado = resolver({
    dotacion: 9,
    perfil: crearPerfil(9),
    cambiosDia: {
      diagnostico_explora: { personaId: "obs1" },
      observacion_1: { personaId: "dx" }
    }
  });
  assert.equal(destino(resultado, "diagnostico_explora").enfermero.id, "obs1");
  assert.equal(destino(resultado, "observacion_1").enfermero.id, "dx");
});
probar("mover a destino vacío libera el origen sin perder la persona", () => {
  const resultado = resolver({
    dotacion: 11,
    perfil: crearPerfil(11),
    base: crearBase({ turnantes: [] }),
    cambiosDia: {
      sillones: { personaId: "rea" },
      reanimacion: "__EMPTY__"
    }
  });
  assert.equal(destino(resultado, "sillones").enfermero.id, "rea");
  assert.equal(destino(resultado, "reanimacion").enfermero, null);
  assert.equal(resultado.asignacionesOperativas.filter((fila) => fila.enfermero?.id === "rea").length, 1);
});
probar("override stale y cambios de otra fecha se ignoran", () => {
  const cambiosPorFecha = {
    "2026-08-01": { destino_inexistente: { personaId: "triage" } },
    "2026-08-02": { reanimacion_sillones: { personaId: "triage" } }
  };
  const diaA = resolver({ dotacion: 9, perfil: crearPerfil(9), cambiosDia: cambiosPorFecha["2026-08-01"] });
  assert.equal(destino(diaA, "reanimacion_sillones").enfermero.id, "rea");
  const diaB = resolver({ dotacion: 9, perfil: crearPerfil(9), cambiosDia: cambiosPorFecha["2026-08-02"] });
  assert.equal(destino(diaB, "reanimacion_sillones").enfermero.id, "triage");
});
probar("vacío manual queda ligado al destino exacto", () => {
  const vacioIndividual = resolver({ dotacion: 11, perfil: crearPerfil(11), cambiosDia: { sillones: "__EMPTY__" } });
  assert.equal(destino(vacioIndividual, "sillones").enfermero, null);
  assert.equal(destino(vacioIndividual, "sillones").vacioManual, true);
  const perfilCombinado = resolver({ dotacion: 9, perfil: crearPerfil(9), cambiosDia: { sillones: "__EMPTY__" } });
  assert.equal(destino(perfilCombinado, "reanimacion_sillones").enfermero.id, "rea");
});
probar("No disponible prevalece sobre override v2", () => {
  const resultado = resolver({
    dotacion: 11,
    perfil: crearPerfil(11),
    cambiosDia: { sillones: { personaId: "t1" } },
    esPersonaDisponible: (actual) => actual?.id !== "t1"
  });
  assert.notEqual(destino(resultado, "sillones").enfermero?.id, "t1");
});
probar("T4 y Extra movidos conservan identidad única", () => {
  const extra = persona("extra");
  const base = [
    ...crearBase({ turnantes: [null, null, null] }),
    { filaId: "licenciado.turnante.4", turnanteId: "turnante_4", tipo: "turnante", enfermero: persona("t4") }
  ];
  const conT4 = resolver({ dotacion: 11, perfil: crearPerfil(11), base, cambiosDia: { sillones: { personaId: "t4" } } });
  assert.equal(conT4.asignacionesOperativas.filter((fila) => fila.enfermero?.id === "t4").length, 1);
  assert.equal(conT4.turnantesRestantes.some((turnante) => turnante.referencia?.id === "t4"), false);
  const conExtra = resolver({ dotacion: 11, perfil: crearPerfil(11), base, extras: [extra], cambiosDia: { explora: { personaId: "extra" } } });
  assert.equal(conExtra.asignacionesOperativas.filter((fila) => fila.enfermero?.id === "extra").length, 1);
});
probar("regresión Tania: movimientos ajenos no eliminan Sillones ni el combinado", () => {
  const tania = persona("tania");
  const individuales = aplicarMovimientosOperativosCalendarioV2({
    asignaciones: [
      { destinoId: "sillones", enfermero: tania },
      { destinoId: "triage_1", enfermero: persona("b") },
      { destinoId: "observacion_1", enfermero: persona("c") }
    ],
    cambios: { triage_1: { personaId: "c" }, observacion_1: { personaId: "b" } },
    personalDisponible: [tania, persona("b"), persona("c")]
  });
  const combinados = aplicarMovimientosOperativosCalendarioV2({
    asignaciones: [
      { destinoId: "reanimacion_sillones", enfermero: tania },
      { destinoId: "triage_1", enfermero: persona("b") },
      { destinoId: "observacion_1", enfermero: persona("c") }
    ],
    cambios: { triage_1: { personaId: "c" }, observacion_1: { personaId: "b" } },
    personalDisponible: [tania, persona("b"), persona("c")]
  });
  assert.equal(individuales.filter((fila) => fila.enfermero?.id === "tania").length, 1);
  assert.equal(combinados.filter((fila) => fila.enfermero?.id === "tania").length, 1);
});
probar("orden visible sustituye sólo zonas Reanimación y Diagnóstico", () => {
  const resultado = resolver({ dotacion: 11, perfil: crearPerfil(11) });
  const orden = resolverOrdenVisibleCalendarioLicenciadosDinamico({
    ordenVisual: ["Triage 1", "Reanimación", "Observación 1", "Diagnóstico", "Salud Mental", "SIN ASIGNAR"],
    filasConfiguracion: [
      { tipo: "sector", sectorId: "reanimacion", etiqueta: "Reanimación" },
      { tipo: "sector", sectorId: "diagnostico", etiqueta: "Diagnóstico" }
    ],
    asignacionesOperativas: resultado.asignacionesOperativas
  });
  assert.deepEqual(orden, [
    "Triage 1", "Reanimación", "Sillones", "Observación 1",
    "Diagnóstico", "Explora", "Salud Mental", "SIN ASIGNAR"
  ]);
});
probar("pipeline no muta sus entradas", () => {
  const base = crearBase();
  const antes = structuredClone(base);
  resolver({ base });
  assert.deepEqual(base, antes);
});
probar("Calendario consume v2 visible sin doble motor ni splitter legacy", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /resolverVersionEstructuraLicenciados\(configuracionEfectiva\)/);
  assert.match(fuente, /resolverCalendarioLicenciadosDinamico\(/);
  assert.match(fuente, /cambiosDia: cambiosDia\[keyDia\]/);
  assert.match(fuente, /resolverClaveMovimientoCalendario\(/);
  assert.doesNotMatch(fuente, /void calendarioLicenciadosDinamico/);
  assert.match(fuente, /if \(usarCalendarioLicenciadosDinamico\) \{\s*asignacionBase = calendarioLicenciadosDinamico\.asignacionesOperativas/);
  assert.match(fuente, /else \{\s*const resolucionOperativa = resolverTurnantesYCoberturasOperativas/);
  assert.match(fuente, /usarCalendarioLicenciadosDinamico\s*\? \{ seDivide: false/);
  assert.match(fuente, /item\.destinoId \|\| item\.syntheticId/);
  assert.match(fuente, /const sobrantes = \[\.\.\.personalFiltrado, \.\.\.extrasDia\]\.filter/);
  assert.match(fuente, /onDataReady\(datosParaPDF\)/);
});

console.log(`calendario-licenciados-dinamico-shadow: ${total} pruebas OK`);
