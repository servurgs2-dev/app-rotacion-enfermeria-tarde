import assert from "node:assert/strict";
import fs from "node:fs";
import { resolverPerfilEstructuraLicenciadosDia } from "../src/utils/dotacionEfectivaLicenciadosDia.js";
import { proyectarAsignacionesOperativasLicenciados } from "../src/utils/proyeccionOperativaLicenciados.js";
import {
  resolverCoberturaDinamicaLicenciados,
  resolverPrioridadDestinosOperativosLicenciados
} from "../src/utils/coberturaDinamicaLicenciados.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const persona = (id) => ({ id, nombre: `Persona ${id}`, categoria: "licenciado" });
const crearBase = ({ turnantes = [persona("t1"), persona("t2"), persona("t3")], turnante4 = null, vaciar = [] } = {}) => {
  const filas = [
    ["triage_1", "triage"], ["estabiliza", "estabiliza"],
    ["reanimacion", "rea"], ["observacion_1", "obs1"],
    ["triage_2", "triage2"], ["diagnostico", "dx"],
    ["observacion_2", "obs2"], ["preinternacion", "pre"],
    ["salud_mental", "sm"]
  ].map(([sectorId, titular]) => ({
    filaId: `licenciado.sector.${sectorId}`,
    sectorId,
    tipo: "sector",
    enfermero: vaciar.includes(sectorId) ? null : persona(titular)
  }));
  const filasTurnantes = [1, 3, 2].map((ordinal) => ({
    filaId: `licenciado.turnante.${ordinal}`,
    turnanteId: `turnante_${ordinal}`,
    tipo: "turnante",
    enfermero: turnantes[{ 1: 0, 2: 1, 3: 2 }[ordinal]] || null
  }));
  return [
    ...filas,
    ...filasTurnantes,
    ...(turnante4 ? [{
      filaId: "licenciado.turnante.4",
      turnanteId: "turnante_4",
      tipo: "turnante",
      enfermero: turnante4
    }] : [])
  ];
};
const crearProyeccion = ({ dotacion, prioridadEstructural, turnantes, turnante4, vaciar = [] }) => {
  const perfil = resolverPerfilEstructuraLicenciadosDia({
    personalBase: Array.from({ length: dotacion }, (_, indice) => persona(`dot-${indice}`)),
    prioridadTurno: prioridadEstructural
  });
  return proyectarAsignacionesOperativasLicenciados({
    perfil,
    asignacionesBase: crearBase({ turnantes, turnante4, vaciar }),
    versionEstructura: 2
  });
};
const resolver = ({
  dotacion = 10,
  prioridadEstructural = ["sillones", "explora"],
  prioridadCobertura = ["estabiliza", "reanimacion", "sillones", "diagnostico", "explora"],
  turnantes,
  turnante4,
  vaciar = []
} = {}) => {
  const proyeccion = crearProyeccion({ dotacion, prioridadEstructural, turnantes, turnante4, vaciar });
  const personal = [
    ...proyeccion.asignacionesOperativas.map((fila) => fila.enfermero),
    ...proyeccion.turnantesDisponibles.map((turnante) => turnante.referencia)
  ].filter(Boolean);
  return {
    proyeccion,
    resultado: resolverCoberturaDinamicaLicenciados({
      proyeccion,
      prioridadTurno: prioridadCobertura,
      personal,
      extras: [],
      esPersonaDisponible: () => true
    })
  };
};
const destino = (resultado, destinoId) =>
  resultado.asignacionesOperativas.find((fila) => fila.destinoId === destinoId);

probar("dotación 9 sin demanda dinámica no consume Turnante por esa causa", () => {
  const { resultado } = resolver({ dotacion: 9 });
  assert.equal(resultado.coberturasDinamicas.length, 0);
  assert.equal(resultado.turnantesUtilizados.length, 0);
});
probar("dotación 8 no consume Turnante sólo por mantener combinados", () => {
  const { resultado } = resolver({ dotacion: 8 });
  assert.equal(resultado.turnantesUtilizados.length, 0);
  assert.deepEqual(
    resultado.asignacionesOperativas.filter((fila) => fila.combinado).map((fila) => fila.destinoId),
    ["reanimacion_sillones", "diagnostico_explora"]
  );
});
probar("cada combinado hereda la mayor prioridad de sus componentes", () => {
  const proyeccion = crearProyeccion({ dotacion: 8, prioridadEstructural: ["sillones", "explora"] });
  assert.deepEqual(resolverPrioridadDestinosOperativosLicenciados({
    prioridadTurno: ["sillones", "triage_1", "diagnostico", "reanimacion", "explora"],
    asignacionesOperativas: proyeccion.asignacionesOperativas
  }).slice(0, 3), ["reanimacion_sillones", "triage_1", "diagnostico_explora"]);
});
probar("invertir componentes cambia la precedencia de los combinados", () => {
  const proyeccion = crearProyeccion({ dotacion: 7, prioridadEstructural: ["sillones", "explora"] });
  const prioridad = resolverPrioridadDestinosOperativosLicenciados({
    prioridadTurno: ["explora", "reanimacion", "sillones", "diagnostico"],
    asignacionesOperativas: proyeccion.asignacionesOperativas
  });
  assert.deepEqual(prioridad.slice(0, 2), ["diagnostico_explora", "reanimacion_sillones"]);
});
for (const [turnanteId, idPersona] of [["T1", "t1"], ["T2", "t2"], ["T3", "t3"]]) {
  probar(`Sillones puede ser cubierto sólo por ${turnanteId}`, () => {
    const turnantes = turnanteId === "T1"
      ? [persona(idPersona)]
      : turnanteId === "T2"
        ? [null, persona(idPersona)]
        : [null, null, persona(idPersona)];
    const { resultado } = resolver({ turnantes });
    assert.equal(destino(resultado, "sillones").enfermero?.id, idPersona);
  });
}
probar("Explora puede ser cubierta por T1", () => {
  const { resultado } = resolver({ prioridadEstructural: ["explora", "sillones"], turnantes: [persona("t1")] });
  assert.equal(destino(resultado, "explora").enfermero?.id, "t1");
});
probar("Explora puede ser cubierta por T3", () => {
  const { resultado } = resolver({ prioridadEstructural: ["explora", "sillones"], turnantes: [null, null, persona("t3")] });
  assert.equal(destino(resultado, "explora").enfermero?.id, "t3");
});
probar("T3 no tiene afinidad especial con Explora", () => {
  const { resultado } = resolver({ dotacion: 11, prioridadCobertura: ["sillones", "explora"], turnantes: [null, null, persona("t3")] });
  assert.equal(destino(resultado, "sillones").enfermero?.id, "t3");
  assert.equal(destino(resultado, "explora").enfermero, null);
});
probar("T4 v2 puede cubrir Sillones como cualquier Turnante", () => {
  const { resultado } = resolver({ turnantes: [], turnante4: persona("t4") });
  assert.equal(destino(resultado, "sillones").enfermero?.id, "t4");
});
probar("T4 v2 puede cubrir Explora sin afinidad reservada", () => {
  const { resultado } = resolver({
    prioridadEstructural: ["explora", "sillones"],
    prioridadCobertura: ["explora", "sillones"],
    turnantes: [],
    turnante4: persona("t4")
  });
  assert.equal(destino(resultado, "explora").enfermero?.id, "t4");
});
probar("Sillones y Explora se cubren con dos Turnantes", () => {
  const { resultado } = resolver({ dotacion: 11, turnantes: [persona("t1"), persona("t2")] });
  assert.equal(resultado.coberturasDinamicas.length, 2);
  assert.deepEqual(resultado.vacantesSinCobertura, []);
});
probar("prioridad Sillones antes que Explora ordena cobertura", () => {
  const { resultado } = resolver({ dotacion: 11, prioridadCobertura: ["sillones", "explora"], turnantes: [persona("t1")] });
  assert.equal(destino(resultado, "sillones").enfermero?.id, "t1");
});
probar("prioridad Explora antes que Sillones invierte cobertura", () => {
  const { resultado } = resolver({ dotacion: 11, prioridadCobertura: ["explora", "sillones"], turnantes: [persona("t1")] });
  assert.equal(destino(resultado, "explora").enfermero?.id, "t1");
});
probar("vacante general superior se cubre antes que dinámica", () => {
  const { resultado } = resolver({ vaciar: ["estabiliza"], turnantes: [persona("t1")] });
  assert.equal(resultado.asignacionesOperativas.find((fila) => fila.sectorId === "estabiliza").enfermero?.id, "t1");
  assert.notEqual(destino(resultado, "sillones").enfermero?.id, "t1");
});
probar("vacante dinámica superior se cubre antes que general inferior", () => {
  const { resultado } = resolver({
    vaciar: ["observacion_1"],
    prioridadCobertura: ["sillones", "observacion_1"],
    turnantes: [persona("t1")]
  });
  assert.equal(destino(resultado, "sillones").enfermero?.id, "t1");
});
probar("un Turnante no se usa dos veces", () => {
  const { resultado } = resolver({ dotacion: 11, turnantes: [persona("t1")] });
  assert.equal(resultado.asignacionesOperativas.filter((fila) => fila.enfermero?.id === "t1").length, 1);
});
probar("una persona no queda simultáneamente como Turnante y cobertura", () => {
  const { resultado } = resolver({ turnantes: [persona("t1")] });
  assert.equal(resultado.turnantesUtilizados[0].referencia.id, "t1");
  assert.equal(resultado.turnantesRestantes.some((turnante) => turnante.referencia?.id === "t1"), false);
});
probar("falta de Turnantes conserva vacante explícita", () => {
  const { resultado } = resolver({ turnantes: [] });
  assert.deepEqual(resultado.vacantesSinCobertura, ["sillones"]);
  assert.equal(destino(resultado, "sillones").requiereCobertura, true);
});
probar("sin cobertura no inventa persona", () => {
  const { resultado } = resolver({ turnantes: [] });
  assert.equal(destino(resultado, "sillones").enfermero, null);
});
probar("input no se muta", () => {
  const proyeccion = crearProyeccion({ dotacion: 11, prioridadEstructural: ["sillones", "explora"] });
  const antes = JSON.stringify(proyeccion);
  resolverCoberturaDinamicaLicenciados({ proyeccion, prioridadTurno: ["sillones", "explora"] });
  assert.equal(JSON.stringify(proyeccion), antes);
});
probar("prioridad e identidad operativa usan IDs y no etiquetas", () => {
  const fuente = fs.readFileSync("src/utils/coberturaDinamicaLicenciados.js", "utf8");
  assert.match(fuente, /prioridadSectorIds/);
  assert.match(fuente, /destinoId/);
  assert.equal(fuente.includes("Sillones"), false);
  assert.equal(fuente.includes("Explora"), false);
});
probar("C3B permanece libre de elección de Turnantes", () => {
  const fuente = fs.readFileSync("src/utils/proyeccionOperativaLicenciados.js", "utf8");
  assert.equal(fuente.includes("resolverTurnantesYCoberturasOperativas"), false);
});
probar("T1 T2 y T3 conservan contrato equivalente", () => {
  const { proyeccion } = resolver({ dotacion: 11 });
  assert.equal(proyeccion.turnantesDisponibles.every((turnante) => Object.hasOwn(turnante, "referencia")), true);
  assert.deepEqual(new Set(proyeccion.turnantesDisponibles.map((turnante) => turnante.turnanteId)), new Set(["turnante_1", "turnante_2", "turnante_3"]));
});

console.log(`cobertura-dinamica-licenciados: ${total} pruebas OK`);
