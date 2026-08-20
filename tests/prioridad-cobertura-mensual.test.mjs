import assert from "node:assert/strict";
import fs from "node:fs";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  copiarSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanillaDesdeFilas,
  obtenerConfiguracionPlanillaEfectiva
} from "../src/utils/configuracionPlanilla.js";
import { normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import { crearBorradoresConfiguracionPlanilla } from "../src/utils/plantillasConfiguracionPlanilla.js";
import {
  CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA,
  copiarPrioridadCoberturaMensual,
  normalizarPrioridadCoberturaConfigurada,
  obtenerPrioridadCoberturaEfectiva
} from "../src/utils/prioridadCoberturaMensual.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const fallbackEnfermeros = configuracionSectores.enfermero.prioridadSectoresIds;
const fallbackLicenciados = configuracionSectores.licenciado.prioridadSectoresIds;
const snapshotEnfermeros = () => crearSnapshotConfiguracionPlanilla({
  turno: "manana", categoria: "enfermero", mes: "2026-09"
});
const filasEnfermeros = snapshotEnfermeros().filas;
const efectiva = (prioridadConfigurada, filas = filasEnfermeros, prioridadFallback = fallbackEnfermeros) =>
  obtenerPrioridadCoberturaEfectiva({ prioridadConfigurada, filas, prioridadFallback });

probar("1 undefined usa fallback", () => assert.deepEqual(
  efectiva(undefined).prioridadSectorIds, fallbackEnfermeros
));
probar("2 null usa fallback", () => assert.deepEqual(
  efectiva(null).prioridadSectorIds, fallbackEnfermeros
));
probar("3 array vacío usa fallback", () => assert.deepEqual(
  efectiva([]).prioridadSectorIds, fallbackEnfermeros
));
probar("4 snapshot legacy sin campo expone fallback en memoria", () => {
  const snapshot = snapshotEnfermeros();
  delete snapshot.prioridadCoberturaSectorIds;
  const resultado = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: { configuracionPlanilla: { enfermero: snapshot } },
    turno: "manana", categoria: "enfermero", mes: "2026-09"
  });
  assert.deepEqual(resultado.prioridadCoberturaSectorIds, fallbackEnfermeros);
  assert.equal(Object.hasOwn(snapshot, "prioridadCoberturaSectorIds"), false);
});
probar("5 prioridad válida conserva orden", () => {
  const personalizada = [...fallbackEnfermeros.slice(0, -3), "sillon_2", "rea_2", "explora_2"];
  assert.deepEqual(efectiva(personalizada).prioridadSectorIds, personalizada);
});
probar("6 normalización persiste sólo sectorId de texto", () => assert.deepEqual(
  normalizarPrioridadCoberturaConfigurada([" rea_1 ", { sectorId: "rea_2" }, 4, ""]),
  ["rea_1"]
));
probar("7 duplicados se eliminan y advierten", () => {
  const resultado = efectiva(["rea_1", "rea_1"]);
  assert.equal(resultado.prioridadSectorIds.filter((id) => id === "rea_1").length, 1);
  assert.ok(resultado.advertencias.some((item) =>
    item.codigo === CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_DUPLICADO
  ));
});
probar("8 sector inexistente se excluye y advierte", () => {
  const resultado = efectiva(["fantasma", "rea_1"]);
  assert.equal(resultado.prioridadSectorIds.includes("fantasma"), false);
  assert.ok(resultado.advertencias.some((item) =>
    item.codigo === CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_INEXISTENTE &&
    item.sectorId === "fantasma"
  ));
});
probar("9 sector desactivado se excluye y advierte sin borrar configuración", () => {
  const configurada = ["explora_2", "rea_1"];
  const filas = filasEnfermeros.map((fila) =>
    fila.sectorId === "explora_2" ? { ...fila, activo: false } : fila
  );
  const resultado = efectiva(configurada, filas);
  assert.equal(resultado.prioridadSectorIds.includes("explora_2"), false);
  assert.deepEqual(configurada, ["explora_2", "rea_1"]);
  assert.ok(resultado.advertencias.some((item) =>
    item.codigo === CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_DESACTIVADO
  ));
});
probar("10 Turnante queda excluido", () => {
  const turnante = filasEnfermeros.find((fila) => fila.tipo === "turnante");
  assert.equal(efectiva([turnante.turnanteId]).prioridadSectorIds.includes(turnante.turnanteId), false);
});
probar("11 fila sin sectorId queda excluida", () => {
  const filas = [...filasEnfermeros, { tipo: "sector", activo: true, sectorId: "" }];
  assert.deepEqual(efectiva(undefined, filas).prioridadSectorIds, fallbackEnfermeros);
});
probar("12 renombrar etiqueta no cambia prioridad", () => {
  const filas = filasEnfermeros.map((fila) => ({ ...fila, etiqueta: `RENOMBRADA ${fila.etiqueta}` }));
  assert.deepEqual(efectiva(undefined, filas).prioridadSectorIds, fallbackEnfermeros);
});
probar("13 reordenar filas de Planilla no cambia prioridad", () => {
  const filas = [...filasEnfermeros].reverse().map((fila, orden) => ({ ...fila, orden }));
  assert.deepEqual(efectiva(undefined, filas).prioridadSectorIds, fallbackEnfermeros);
});
probar("14 ordenVisual de Calendario no interviene", () => {
  const antes = clonar(configuracionSectores.enfermero.ordenVisual);
  const resultado = efectiva(undefined);
  assert.deepEqual(resultado.prioridadSectorIds, fallbackEnfermeros);
  assert.deepEqual(configuracionSectores.enfermero.ordenVisual, antes);
});
probar("15 sector omitido se incorpora según fallback", () => {
  const configurada = fallbackEnfermeros.filter((id) => id !== "boxes_4_7");
  const resultado = efectiva(configurada);
  assert.equal(resultado.prioridadSectorIds.indexOf("boxes_4_7"), fallbackEnfermeros.indexOf("boxes_4_7"));
  assert.ok(resultado.advertencias.some((item) =>
    item.codigo === CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_AGREGADO_DESDE_FALLBACK
  ));
});
probar("16 sector nuevo fuera del fallback va al final determinísticamente", () => {
  const filas = [
    ...filasEnfermeros,
    { tipo: "sector", activo: true, sectorId: "sector_z", orden: 0 },
    { tipo: "sector", activo: true, sectorId: "sector_a", orden: 999 }
  ];
  const resultado = efectiva(undefined, filas);
  assert.deepEqual(resultado.prioridadSectorIds.slice(-2), ["sector_a", "sector_z"]);
  assert.equal(resultado.advertencias.filter((item) =>
    item.codigo === CODIGOS_ADVERTENCIA_PRIORIDAD_COBERTURA.SECTOR_NUEVO_AGREGADO_AL_FINAL
  ).length, 2);
});
probar("17 Enfermeros usa su fallback", () => assert.deepEqual(
  snapshotEnfermeros().prioridadCoberturaSectorIds, fallbackEnfermeros
));
probar("18 Licenciados usa su fallback", () => {
  const snapshot = crearSnapshotConfiguracionPlanilla({
    turno: "manana", categoria: "licenciado", mes: "2026-09"
  });
  assert.deepEqual(snapshot.prioridadCoberturaSectorIds, fallbackLicenciados);
});
probar("19 mañana conserva REA 2 antes que Explora 2", () => {
  const manana = [...fallbackEnfermeros.filter((id) => !["rea_2", "explora_2"].includes(id)), "rea_2", "explora_2"];
  assert.ok(efectiva(manana).prioridadSectorIds.indexOf("rea_2") < efectiva(manana).prioridadSectorIds.indexOf("explora_2"));
});
probar("20 tarde conserva Explora 2 antes que REA 2", () => {
  assert.ok(efectiva(fallbackEnfermeros).prioridadSectorIds.indexOf("explora_2") < efectiva(fallbackEnfermeros).prioridadSectorIds.indexOf("rea_2"));
});
probar("21 mañana y tarde son snapshots independientes", () => {
  const manana = snapshotEnfermeros();
  const tarde = crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "enfermero", mes: "2026-09" });
  manana.prioridadCoberturaSectorIds = [...fallbackEnfermeros].reverse();
  assert.deepEqual(tarde.prioridadCoberturaSectorIds, fallbackEnfermeros);
});
probar("22 septiembre y octubre son independientes", () => {
  const septiembre = snapshotEnfermeros();
  const octubre = crearSnapshotConfiguracionPlanilla({ turno: "manana", categoria: "enfermero", mes: "2026-10" });
  septiembre.prioridadCoberturaSectorIds.pop();
  assert.deepEqual(octubre.prioridadCoberturaSectorIds, fallbackEnfermeros);
});
probar("23 copiar snapshot no muta origen", () => {
  const origen = snapshotEnfermeros();
  const copia = copiarSnapshotConfiguracionPlanilla(origen);
  copia.prioridadCoberturaSectorIds.reverse();
  assert.deepEqual(origen.prioridadCoberturaSectorIds, fallbackEnfermeros);
});
probar("24 snapshot legacy sigue siendo válido", () => {
  const legacy = snapshotEnfermeros();
  delete legacy.prioridadCoberturaSectorIds;
  const normalizado = normalizarEstadoMensual({ configuracionPlanilla: { enfermero: legacy } });
  assert.deepEqual(normalizado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds, []);
});
probar("25 snapshot nuevo congela default explícito", () => {
  const snapshot = snapshotEnfermeros();
  assert.notEqual(snapshot.prioridadCoberturaSectorIds, fallbackEnfermeros);
  assert.deepEqual(snapshot.prioridadCoberturaSectorIds, fallbackEnfermeros);
});
probar("26 serialización conserva el orden", () => {
  const snapshot = snapshotEnfermeros();
  snapshot.prioridadCoberturaSectorIds = [...fallbackEnfermeros].reverse();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)).prioridadCoberturaSectorIds, [...fallbackEnfermeros].reverse());
});
probar("27 normalizarEstadoMensual preserva una copia del campo", () => {
  const snapshot = snapshotEnfermeros();
  snapshot.prioridadCoberturaSectorIds = [...fallbackEnfermeros].reverse();
  const estado = { configuracionPlanilla: { enfermero: snapshot } };
  const normalizado = normalizarEstadoMensual(estado);
  assert.deepEqual(normalizado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds, [...fallbackEnfermeros].reverse());
  assert.notEqual(normalizado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds, snapshot.prioridadCoberturaSectorIds);
});
probar("28 asignacionesFijas permanece intacto", () => {
  const snapshot = crearSnapshotConfiguracionPlanillaDesdeFilas({
    turno: "manana", categoria: "enfermero", mes: "2026-09", filas: filasEnfermeros,
    asignacionesFijas: [{ sectorId: "sillon_2", personaId: "persona-a" }]
  });
  assert.deepEqual(snapshot.asignacionesFijas, [{ sectorId: "sillon_2", personaId: "persona-a" }]);
});
probar("29 filas permanecen intactas", () => {
  const antes = clonar(filasEnfermeros);
  efectiva([...fallbackEnfermeros].reverse(), filasEnfermeros);
  assert.deepEqual(filasEnfermeros, antes);
});
probar("30 no modifica Planilla", () => {
  const estado = { planillas: { enfermeros: { semana1: { "REA 1": "persona" } } } };
  const antes = clonar(estado.planillas);
  obtenerPrioridadCoberturaEfectiva({ filas: filasEnfermeros, prioridadFallback: fallbackEnfermeros });
  assert.deepEqual(estado.planillas, antes);
});
probar("31 no modifica Calendario", () => {
  const estado = { calendario: { enfermeros: { cambiosDia: { "2026-09-01": {} } } } };
  const antes = clonar(estado.calendario);
  obtenerPrioridadCoberturaEfectiva({ filas: filasEnfermeros, prioridadFallback: fallbackEnfermeros });
  assert.deepEqual(estado.calendario, antes);
});
probar("32 sectoresDonantesIds no interviene", () => {
  const antes = clonar(configuracionSectores.enfermero.sectoresDonantesIds);
  efectiva([...fallbackEnfermeros].reverse());
  assert.deepEqual(configuracionSectores.enfermero.sectoresDonantesIds, antes);
});
probar("33 parejas 2→1 no intervienen", () => {
  const fuente = fs.readFileSync("src/utils/prioridadCoberturaMensual.js", "utf8");
  assert.doesNotMatch(fuente, /PAREJAS_COBERTURA|aplicarPrioridadCoberturaParejas/);
});
probar("34 reposición cedidoAPareja no interviene", () => {
  const fuente = fs.readFileSync("src/utils/prioridadCoberturaMensual.js", "utf8");
  assert.doesNotMatch(fuente, /cedidoAPareja|sectoresDonantesIds/);
});
probar("35 borrador de preparación preserva una copia de la prioridad", () => {
  const snapshot = snapshotEnfermeros();
  snapshot.prioridadCoberturaSectorIds = [...fallbackEnfermeros].reverse();
  const borrador = crearBorradoresConfiguracionPlanilla({
    estadoMensual: { configuracionPlanilla: { enfermero: snapshot } },
    turno: "manana", mes: "2026-09"
  }).enfermero;
  assert.deepEqual(borrador.prioridadCoberturaSectorIds, [...fallbackEnfermeros].reverse());
  borrador.prioridadCoberturaSectorIds.pop();
  assert.deepEqual(snapshot.prioridadCoberturaSectorIds, [...fallbackEnfermeros].reverse());
});
probar("36 copiar prioridad crea una referencia independiente", () => {
  const origen = [...fallbackEnfermeros];
  const copia = copiarPrioridadCoberturaMensual(origen);
  copia.pop();
  assert.deepEqual(origen, fallbackEnfermeros);
});

console.log(`\nEtapa 37C2: ${total} pruebas de prioridad de cobertura mensual aprobadas.`);
