import assert from "node:assert/strict";
import fs from "node:fs";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  copiarSnapshotConfiguracionPlanilla,
  crearConfiguracionPlanillaLicenciadosV2,
  crearSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanillaLicenciadosV2,
  obtenerConfiguracionLegacyPlanilla,
  obtenerConfiguracionPlanillaEfectiva,
  obtenerEtiquetaSector,
  obtenerFilasActivas,
  obtenerFilasConfiguracionEfectivas,
  obtenerSectorIdPorNombreHistorico,
  obtenerTurnantesBase,
  resolverEtiquetaSectorPorTurno,
  TIPOS_FILA_PLANILLA
} from "../src/utils/configuracionPlanilla.js";
import { CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 } from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";
import {
  FILAS_PLANILLA_LICENCIADOS_V2,
  TRANSICION_FILAS_LICENCIADOS_V1_A_V2,
  TRANSICION_TURNANTES_ADICIONALES_LICENCIADOS_V1_A_V2
} from "../src/utils/estructuraLicenciadosDinamica.js";
import {
  habilitarTurnanteMensual,
  obtenerFilasBasePlanilla,
  obtenerFilasEfectivasPlanilla,
  obtenerPosicionTurnanteMensual
} from "../src/utils/turnanteMensual.js";
import { obtenerFilasPlanilla } from "../src/utils/preparacionMesNuevo.js";
import {
  generarRotacionMensual,
  generarRotacionMensualDesdeConfiguracion
} from "../src/utils/rotacionPlanilla.js";
import { prepararTransicionLicenciadosV1aV2 } from "../src/utils/transicionLicenciadosV1aV2.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const ordenEnfermeros = [
  "REA 1", "EXPLORA 1", "1-3 + 21", "T1", "PRE INT 1", "DX 25-30",
  "8-13", "T2", "4-7", "SILLÓN 1", "T3", "14-19", "REA 2",
  "SILLON 2", "20-22+24", "T4", "PRE INT 2", "EXPLORA 2", "SM", "T5"
];
const ordenLicenciados = [
  "Triage 1", "Estabiliza", "T1", "Reanimación + Sillones", "Observación 1",
  "Explora", "Triage 2", "Diagnostico", "Observación 2", "T2",
  "Preinternación", "Salud Mental"
];
const etiquetas = (filas) => filas.map((fila) => fila.etiqueta);
const sectores = (filas) => filas.filter((fila) => fila.tipo === TIPOS_FILA_PLANILLA.SECTOR);

const enfermeros = obtenerConfiguracionLegacyPlanilla("enfermero").filas;
const licenciados = obtenerConfiguracionLegacyPlanilla("licenciado").filas;

probar("Enfermeros conserva 15 sectores", () => assert.equal(sectores(enfermeros).length, 15));
probar("Enfermeros conserva T1-T5 base", () =>
  assert.deepEqual(obtenerTurnantesBase("enfermero").map((fila) => fila.etiqueta), ["T1", "T2", "T3", "T4", "T5"]));
probar("Enfermeros conserva el orden exacto", () => assert.deepEqual(etiquetas(enfermeros), ordenEnfermeros));
probar("T6 está ausente por defecto", () => assert.equal(etiquetas(enfermeros).includes("T6"), false));
probar("T6 aparece solo habilitado y al final", () => {
  const filas = obtenerFilasConfiguracionEfectivas("enfermero", { posicionesMensualesAdicionales: ["T6"] });
  assert.equal(filas.at(-1).etiqueta, "T6");
  assert.equal(filas.at(-1).turnanteId, "turnante_6");
});

probar("Licenciados conserva 10 sectores", () => assert.equal(sectores(licenciados).length, 10));
probar("Licenciados tiene únicamente T1 y T2 base", () =>
  assert.deepEqual(obtenerTurnantesBase("licenciado").map((fila) => fila.etiqueta), ["T1", "T2"]));
probar("Licenciados conserva el orden exacto", () => assert.deepEqual(etiquetas(licenciados), ordenLicenciados));
probar("T3 está ausente por defecto", () => assert.equal(etiquetas(licenciados).includes("T3"), false));
probar("T3 aparece una sola vez al habilitarlo", () => {
  const filas = obtenerFilasConfiguracionEfectivas("licenciado", { posicionesMensualesAdicionales: ["T3"] });
  assert.equal(filas.filter((fila) => fila.etiqueta === "T3").length, 1);
  assert.equal(filas.at(-1).filaId, "licenciado.turnante.3");
});

probar("Diagnostico y Diagnóstico comparten sectorId", () =>
  assert.equal(obtenerSectorIdPorNombreHistorico("Diagnostico"), obtenerSectorIdPorNombreHistorico("Diagnóstico")));
probar("SILLON 1 y SILLÓN 1 comparten sectorId", () =>
  assert.equal(obtenerSectorIdPorNombreHistorico("SILLON 1"), obtenerSectorIdPorNombreHistorico("SILLÓN 1")));
probar("SILLON 2 y SILLÓN 2 comparten sectorId", () =>
  assert.equal(obtenerSectorIdPorNombreHistorico("SILLON 2"), obtenerSectorIdPorNombreHistorico("SILLÓN 2")));
probar("aliases sin tilde conservan identidad", () => {
  assert.equal(obtenerSectorIdPorNombreHistorico("Observacion 1"), "observacion_1");
  assert.equal(obtenerSectorIdPorNombreHistorico("Preinternacion"), "preinternacion");
});
probar("las tres etiquetas de boxes 20/22/24 conservan una identidad", () => {
  assert.equal(obtenerSectorIdPorNombreHistorico("20-22-24"), "boxes_20_22_24");
  assert.equal(obtenerSectorIdPorNombreHistorico("20-22+24"), "boxes_20_22_24");
  assert.equal(obtenerSectorIdPorNombreHistorico("19-22+24"), "boxes_20_22_24");
});
probar("14-19 y 14-18 conservan la identidad boxes_14_19", () => {
  assert.equal(obtenerSectorIdPorNombreHistorico("14-19"), "boxes_14_19");
  assert.equal(obtenerSectorIdPorNombreHistorico("14-18"), "boxes_14_19");
});
probar("boxes 14/19 resuelve su etiqueta canónica por turno", () => {
  assert.equal(resolverEtiquetaSectorPorTurno({ sectorId: "boxes_14_19", turnoId: "manana" }), "14-18");
  for (const turnoId of ["tarde", "vespertino", "noche"]) {
    assert.equal(resolverEtiquetaSectorPorTurno({ sectorId: "boxes_14_19", turnoId }), "14-19");
  }
});
probar("boxes 20/22/24 resuelve su etiqueta canónica por turno", () => {
  assert.equal(resolverEtiquetaSectorPorTurno({ sectorId: "boxes_20_22_24", turnoId: "manana" }), "19-22+24");
  for (const turnoId of ["tarde", "vespertino", "noche"]) {
    assert.equal(resolverEtiquetaSectorPorTurno({ sectorId: "boxes_20_22_24", turnoId }), "20-22+24");
  }
});
probar("la configuración efectiva por turno conserva filaId y sectorId", () => {
  for (const [turnoId, etiqueta14, etiqueta20] of [
    ["manana", "14-18", "19-22+24"],
    ["tarde", "14-19", "20-22+24"],
    ["vespertino", "14-19", "20-22+24"],
    ["noche", "14-19", "20-22+24"]
  ]) {
    const filas = obtenerConfiguracionLegacyPlanilla("enfermero", { turnoId }).filas;
    const boxes14 = filas.filter(({ sectorId }) => sectorId === "boxes_14_19");
    const boxes20 = filas.filter(({ sectorId }) => sectorId === "boxes_20_22_24");
    assert.equal(boxes14.length, 1);
    assert.equal(boxes14[0].filaId, "enfermero.sector.boxes_14_19");
    assert.equal(boxes14[0].etiqueta, etiqueta14);
    assert.equal(boxes20.length, 1);
    assert.equal(boxes20[0].filaId, "enfermero.sector.boxes_20_22_24");
    assert.equal(boxes20[0].etiqueta, etiqueta20);
  }
});
probar("etiqueta visible permanece separada del sectorId", () => {
  assert.equal(obtenerEtiquetaSector("diagnostico"), "Diagnostico");
  assert.equal(obtenerEtiquetaSector("salud_mental", { tipo: "enfermero" }), "SM");
});

probar("todas las filas tienen filaId único y estado activo", () => {
  const filas = [...enfermeros, ...licenciados];
  assert.equal(new Set(filas.map((fila) => fila.filaId)).size, filas.length);
  assert.equal(filas.every((fila) => fila.activo === true), true);
});
probar("obtenerFilasActivas prepara desactivación futura", () =>
  assert.deepEqual(obtenerFilasActivas([{ filaId: "a", activo: true }, { filaId: "b", activo: false }]).map((fila) => fila.filaId), ["a"]));
probar("helper legacy público conserva etiquetas de Enfermeros", () =>
  assert.deepEqual(obtenerFilasBasePlanilla(configuracionSectores.enfermero), ordenEnfermeros));
probar("helper legacy público conserva etiquetas de Licenciados", () =>
  assert.deepEqual(obtenerFilasBasePlanilla(configuracionSectores.licenciado), ordenLicenciados));
probar("preparación de mes usa el mismo adaptador", () => {
  assert.deepEqual(obtenerFilasPlanilla(configuracionSectores.enfermero), ordenEnfermeros);
  assert.deepEqual(obtenerFilasPlanilla(configuracionSectores.licenciado), ordenLicenciados);
});
probar("filas efectivas legacy agregan T3 sin duplicarlo", () => {
  const filas = obtenerFilasEfectivasPlanilla(ordenLicenciados, { posicionesMensualesAdicionales: ["T3"] }, "licenciado");
  assert.equal(filas.filter((fila) => fila === "T3").length, 1);
  assert.equal(filas.at(-1), "T3");
});
probar("generación mantiene el orden y las claves actuales", () => {
  const semana1 = Object.fromEntries(ordenLicenciados.map((fila, indice) => [fila, `p${indice}`]));
  const resultado = generarRotacionMensual({
    planilla: { semana1 }, filas: ordenLicenciados,
    semanas: [{ clave: "semana1" }, { clave: "semana2" }],
    filaFija: "Salud Mental", personal: []
  });
  assert.deepEqual(Object.keys(resultado.semana2), ordenLicenciados);
  assert.equal(resultado.semana2["Salud Mental"], semana1["Salud Mental"]);
});

const prioridadLicenciadosV2 = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2.map(({ id }) => id);
const crearLicenciadosV2 = (cambios = {}) => crearConfiguracionPlanillaLicenciadosV2({ prioridadCoberturaSectorIds: prioridadLicenciadosV2, ...cambios });
probar("configuración explícita Licenciados v2 define doce filas base", () => {
  const resultado = crearLicenciadosV2();
  const ids = resultado.configuracion.filas.map((fila) => fila.sectorId || fila.turnanteId);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.configuracion.estructuraLicenciadosVersion, 2);
  assert.equal(ids.length, 12);
  ["reanimacion", "diagnostico", "turnante_1", "turnante_2", "turnante_3"].forEach((id) => assert.equal(ids.includes(id), true));
  ["reanimacion_sillones", "explora", "sillones", "diagnostico_explora", "rea_1", "sillon_1"].forEach((id) => assert.equal(ids.includes(id), false));
  assert.equal(ids.filter((id) => id === "turnante_3").length, 1);
  assert.equal(resultado.configuracion.filas.find((fila) => fila.turnanteId === "turnante_3").tipo, "turnante");
});
probar("configuración normal Licenciados conserva contrato v1", () => {
  const snapshot = crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "licenciado", mes: "2026-09" });
  const ids = snapshot.filas.map((fila) => fila.sectorId || fila.turnanteId);
  assert.equal(Object.hasOwn(snapshot, "estructuraLicenciadosVersion"), false);
  assert.equal(ids.includes("reanimacion_sillones"), true);
  assert.equal(ids.includes("explora"), true);
});
probar("prioridad v2 respeta filas activas y exige Sillones y Explora", () => {
  const filas = FILAS_PLANILLA_LICENCIADOS_V2.map((fila) => fila.sectorId === "observacion_2" ? { ...fila, activo: false } : fila);
  const prioridad = prioridadLicenciadosV2.filter((id) => id !== "observacion_2");
  assert.equal(crearLicenciadosV2({ filas, prioridadCoberturaSectorIds: prioridad }).ok, true);
  for (const id of ["sillones", "explora"]) assert.equal(crearLicenciadosV2({ filas, prioridadCoberturaSectorIds: prioridad.filter((actual) => actual !== id) }).ok, false);
  for (const id of ["reanimacion_sillones", "turnante_3"]) assert.equal(crearLicenciadosV2({ prioridadCoberturaSectorIds: [...prioridadLicenciadosV2, id] }).ok, false);
});
probar("fijas v2 conservan sectores base y diagnostican legacy sin convertir", () => {
  assert.deepEqual(crearLicenciadosV2({ asignacionesFijas: [{ sectorId: "diagnostico", personaId: "P" }] }).configuracion.asignacionesFijas, [{ sectorId: "diagnostico", personaId: "P" }]);
  for (const sectorId of ["reanimacion_sillones", "explora"]) {
    const resultado = crearLicenciadosV2({ asignacionesFijas: [{ sectorId, personaId: "P" }] });
    assert.equal(resultado.ok, false);
    assert.deepEqual(resultado.configuracion.asignacionesFijas, []);
    assert.equal(resultado.errores.some(({ codigo }) => codigo === "ASIGNACION_FIJA_LICENCIADOS_V2_REQUIERE_REVISION"), true);
  }
});
probar("snapshot y copia v2 conservan versión sin mutar filas", () => {
  const filas = FILAS_PLANILLA_LICENCIADOS_V2.map((fila) => ({ ...fila }));
  const antes = structuredClone(filas);
  const resultado = crearSnapshotConfiguracionPlanillaLicenciadosV2({ turno: "tarde", mes: "2026-10", filas, prioridadCoberturaSectorIds: prioridadLicenciadosV2 });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.snapshot.estructuraLicenciadosVersion, 2);
  assert.equal(copiarSnapshotConfiguracionPlanilla(resultado.snapshot).estructuraLicenciadosVersion, 2);
  assert.deepEqual(filas, antes);
});
probar("T3 v2 es base, T4 es adicional y T3 legacy sigue vigente", () => {
  const v2 = crearSnapshotConfiguracionPlanillaLicenciadosV2({ turno: "tarde", mes: "2026-10", prioridadCoberturaSectorIds: prioridadLicenciadosV2 }).snapshot;
  const efectivaV2 = obtenerConfiguracionPlanillaEfectiva({ estadoMensual: { configuracionPlanilla: { licenciado: v2 }, planillas: { licenciados: { posicionesMensualesAdicionales: [] } } }, turno: "tarde", categoria: "licenciado", mes: "2026-10" });
  assert.equal(efectivaV2.filas.filter((fila) => fila.turnanteId === "turnante_3").length, 1);
  assert.equal(efectivaV2.filas.some((fila) => fila.turnanteId === "turnante_4"), false);
  const planillaV2ConT4 = habilitarTurnanteMensual({}, "licenciado", v2);
  const efectivaV2ConT4 = obtenerConfiguracionPlanillaEfectiva({ estadoMensual: { configuracionPlanilla: { licenciado: v2 }, planillas: { licenciados: planillaV2ConT4 } }, turno: "tarde", categoria: "licenciado", mes: "2026-10" });
  assert.deepEqual(planillaV2ConT4.posicionesMensualesAdicionales, ["T4"]);
  assert.equal(efectivaV2ConT4.filas.filter((fila) => fila.turnanteId === "turnante_3").length, 1);
  assert.equal(efectivaV2ConT4.filas.filter((fila) => fila.turnanteId === "turnante_4").length, 1);
  assert.equal(obtenerPosicionTurnanteMensual("licenciado", v2), "T4");
  const v1 = crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "licenciado", mes: "2026-10" });
  const efectivaV1 = obtenerConfiguracionPlanillaEfectiva({ estadoMensual: { configuracionPlanilla: { licenciado: v1 }, planillas: { licenciados: { posicionesMensualesAdicionales: ["T3"] } } }, turno: "tarde", categoria: "licenciado", mes: "2026-10" });
  assert.equal(efectivaV1.filas.filter((fila) => fila.turnanteId === "turnante_3").length, 1);
  assert.equal(Object.hasOwn(efectivaV1, "estructuraLicenciadosVersion"), false);
});
probar("contrato futuro conserva Explora en T3 y adicional T3 en T4", () => {
  assert.equal(TRANSICION_FILAS_LICENCIADOS_V1_A_V2.explora, "turnante_3");
  assert.equal(TRANSICION_TURNANTES_ADICIONALES_LICENCIADOS_V1_A_V2.turnante_3, "turnante_4");
});
probar("motor v2 genera T4 una vez cuando el adicional está activo", () => {
  const snapshot = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "tarde", mes: "2026-10", prioridadCoberturaSectorIds: prioridadLicenciadosV2
  }).snapshot;
  const planilla = habilitarTurnanteMensual({}, "licenciado", snapshot);
  const configuracion = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: { configuracionPlanilla: { licenciado: snapshot }, planillas: { licenciados: planilla } },
    turno: "tarde", categoria: "licenciado", mes: "2026-10"
  });
  const personal = configuracion.filas.map((fila, indice) => ({
    id: `T4-${indice}`, nombre: `Persona ${indice}`, categoria: "licenciado"
  }));
  const semana1 = Object.fromEntries(configuracion.filas.map((fila, indice) => [
    fila.etiqueta, { personaId: personal[indice].id, nombre: personal[indice].nombre }
  ]));
  const generada = generarRotacionMensualDesdeConfiguracion({
    configuracion,
    planilla: { ...planilla, semana1 },
    semanas: [{ clave: "semana1" }, { clave: "semana2" }],
    personal
  });
  assert.equal(Object.keys(generada.semana2).filter((fila) => fila === "T3").length, 1);
  assert.equal(Object.keys(generada.semana2).filter((fila) => fila === "T4").length, 1);
});
probar("fijas v2 rechazan T3 y T4 por ser Turnantes", () => {
  for (const sectorId of ["turnante_3", "turnante_4"]) {
    const resultado = crearSnapshotConfiguracionPlanillaLicenciadosV2({
      turno: "tarde",
      mes: "2026-10",
      prioridadCoberturaSectorIds: prioridadLicenciadosV2,
      asignacionesFijas: [{ sectorId, personaId: "P" }]
    });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.snapshot, null);
  }
});

probar("snapshot v2 conserva prioridad dinámica exacta y configuración efectiva", () => {
  const prioridad = [
    "explora", "triage_1", "estabiliza", "reanimacion", "sillones",
    "observacion_1", "triage_2", "diagnostico", "observacion_2",
    "preinternacion", "salud_mental"
  ];
  const resultado = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "manana",
    mes: "2026-11",
    prioridadCoberturaSectorIds: prioridad
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.snapshot.estructuraLicenciadosVersion, 2);
  assert.deepEqual(resultado.snapshot.prioridadCoberturaSectorIds, prioridad);
  assert.equal(resultado.snapshot.prioridadCoberturaSectorIds.includes("sillones"), true);
  assert.equal(resultado.snapshot.prioridadCoberturaSectorIds.includes("explora"), true);
  assert.equal(resultado.snapshot.prioridadCoberturaSectorIds.includes("reanimacion_sillones"), false);
  assert.equal(resultado.snapshot.prioridadCoberturaSectorIds.includes("diagnostico_explora"), false);
  const efectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: { configuracionPlanilla: { licenciado: resultado.snapshot } },
    turno: "manana",
    categoria: "licenciado",
    mes: "2026-11"
  });
  assert.equal(efectiva.estructuraLicenciadosVersion, 2);
  assert.deepEqual(efectiva.prioridadCoberturaSectorIds, prioridad);
});
probar("snapshot v2 no reintroduce sector base desactivado", () => {
  const filas = FILAS_PLANILLA_LICENCIADOS_V2.map((fila) =>
    fila.sectorId === "observacion_2" ? { ...fila, activo: false } : fila
  );
  const prioridad = prioridadLicenciadosV2.filter((id) => id !== "observacion_2");
  const resultado = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "tarde", mes: "2026-11", filas, prioridadCoberturaSectorIds: prioridad
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.snapshot.prioridadCoberturaSectorIds, prioridad);
  assert.equal(resultado.snapshot.prioridadCoberturaSectorIds.includes("observacion_2"), false);
  assert.equal(resultado.snapshot.prioridadCoberturaSectorIds.includes("sillones"), true);
  assert.equal(resultado.snapshot.prioridadCoberturaSectorIds.includes("explora"), true);
});
probar("prioridad v2 inválida no crea snapshot y v1 permanece legacy", () => {
  for (const id of ["sillones", "explora"]) {
    const resultado = crearSnapshotConfiguracionPlanillaLicenciadosV2({
      turno: "tarde",
      mes: "2026-11",
      prioridadCoberturaSectorIds: prioridadLicenciadosV2.filter((actual) => actual !== id)
    });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.snapshot, null);
  }
  const licenciado = crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "licenciado", mes: "2026-11" });
  const enfermero = crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "enfermero", mes: "2026-11" });
  assert.equal(Object.hasOwn(licenciado, "estructuraLicenciadosVersion"), false);
  assert.equal(licenciado.prioridadCoberturaSectorIds.includes("reanimacion_sillones"), true);
  assert.equal(licenciado.prioridadCoberturaSectorIds.includes("sillones"), false);
  assert.equal(Object.hasOwn(enfermero, "estructuraLicenciadosVersion"), false);
});
probar("motor genera exclusivamente sobre filas activas Licenciados v2", () => {
  const configuracion = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "tarde", mes: "2026-12", prioridadCoberturaSectorIds: prioridadLicenciadosV2
  }).snapshot;
  const personal = configuracion.filas.map((fila, indice) => ({ id: `P${indice + 1}`, nombre: `Persona ${indice + 1}`, categoria: "licenciado" }));
  const semana1 = Object.fromEntries(configuracion.filas.map((fila, indice) => [
    fila.etiqueta,
    { personaId: personal[indice].id, nombre: personal[indice].nombre }
  ]));
  const antes = structuredClone(configuracion);
  const generada = generarRotacionMensualDesdeConfiguracion({
    configuracion,
    planilla: { semana1, posicionesMensualesAdicionales: ["T3"] },
    semanas: [{ clave: "semana1" }, { clave: "semana2" }],
    personal
  });
  const claves = Object.keys(generada.semana2);
  assert.equal(claves.length, 12);
  ["Reanimación", "Diagnóstico", "T1", "T2", "T3"].forEach((etiqueta) => assert.equal(claves.includes(etiqueta), true));
  ["Reanimación + Sillones", "Explora", "Sillones", "Diagnóstico + Explora"].forEach((etiqueta) => assert.equal(claves.includes(etiqueta), false));
  assert.equal(claves.filter((etiqueta) => etiqueta === "T3").length, 1);
  const ids = Object.values(generada.semana2).map((referencia) => referencia?.personaId).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(configuracion, antes);
});
probar("motor v2 respeta fijas compatibles sin afinidad Explora T3", () => {
  const personaDiagnostico = { id: "DX", nombre: "Explora Legacy", categoria: "licenciado" };
  const otras = Array.from({ length: 11 }, (_, indice) => ({ id: `Q${indice}`, nombre: `Q${indice}`, categoria: "licenciado" }));
  const personal = [personaDiagnostico, ...otras];
  const resultadoConfig = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "tarde", mes: "2026-12", prioridadCoberturaSectorIds: prioridadLicenciadosV2,
    asignacionesFijas: [{ sectorId: "diagnostico", personaId: "DX" }]
  });
  const semana1 = Object.fromEntries(resultadoConfig.snapshot.filas.map((fila, indice) => [
    fila.etiqueta,
    { personaId: personal[indice].id, nombre: personal[indice].nombre }
  ]));
  const generada = generarRotacionMensualDesdeConfiguracion({
    configuracion: resultadoConfig.snapshot,
    planilla: { semana1 },
    semanas: [{ clave: "semana1" }, { clave: "semana2" }],
    personal
  });
  assert.equal(generada.semana1["Diagnóstico"].personaId, "DX");
  assert.notEqual(generada.semana1.T3?.personaId, "DX");
  assert.equal(JSON.stringify(generada).includes("Reanimación + Sillones"), false);
});
probar("motor v2 conserva vacantes sobrantes y desactivación sin inventar cuerpos", () => {
  const filas = FILAS_PLANILLA_LICENCIADOS_V2.map((fila) =>
    ["observacion_2", "turnante_3"].includes(fila.sectorId || fila.turnanteId)
      ? { ...fila, activo: false }
      : fila
  );
  const prioridad = prioridadLicenciadosV2.filter((id) => id !== "observacion_2");
  const configuracion = crearSnapshotConfiguracionPlanillaLicenciadosV2({ turno: "tarde", mes: "2026-12", filas, prioridadCoberturaSectorIds: prioridad }).snapshot;
  const personal = Array.from({ length: 12 }, (_, indice) => ({ id: `R${indice}`, nombre: `R${indice}`, categoria: "licenciado" }));
  const semana1 = Object.fromEntries(configuracion.filas.filter((fila) => fila.activo !== false).map((fila, indice) => [
    fila.etiqueta,
    indice < 8 ? { personaId: personal[indice].id, nombre: personal[indice].nombre } : ""
  ]));
  const generada = generarRotacionMensualDesdeConfiguracion({ configuracion, planilla: { semana1, posicionesMensualesAdicionales: ["T3"] }, semanas: [{ clave: "semana1" }, { clave: "semana2" }], personal });
  assert.equal(Object.hasOwn(generada.semana2, "Observación 2"), false);
  assert.equal(Object.hasOwn(generada.semana2, "T3"), false);
  assert.equal(Object.values(generada.semana2).filter(Boolean).length, 8);
  assert.equal(personal.slice(8).some((persona) => Object.values(generada.semana2).some((referencia) => referencia?.personaId === persona.id)), false);
});
probar("adaptador mantiene generación v1 Licenciados y Enfermeros", () => {
  for (const categoria of ["licenciado", "enfermero"]) {
    const configuracion = crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria, mes: "2026-12" });
    const filas = configuracion.filas.filter((fila) => fila.activo !== false).map((fila) => fila.etiqueta);
    const semana1 = Object.fromEntries(filas.map((fila, indice) => [fila, `p${indice}`]));
    const argumentos = { planilla: { semana1 }, semanas: [{ clave: "semana1" }, { clave: "semana2" }], personal: [] };
    assert.deepEqual(
      generarRotacionMensualDesdeConfiguracion({ configuracion, ...argumentos }),
      generarRotacionMensual({ ...argumentos, filas, filasConfiguracion: configuracion.filas, categoria })
    );
  }
});
probar("PlanillaMensual renderiza filas v2 activas en orden congelado", () => {
  const filas = FILAS_PLANILLA_LICENCIADOS_V2.map((fila) => ({ ...fila }));
  const snapshot = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "tarde", mes: "2027-01", filas, prioridadCoberturaSectorIds: prioridadLicenciadosV2
  }).snapshot;
  const efectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: { configuracionPlanilla: { licenciado: snapshot } },
    turno: "tarde", categoria: "licenciado", mes: "2027-01"
  });
  assert.deepEqual(efectiva.filas.map((fila) => fila.etiqueta), [
    "Triage 1", "Estabiliza", "T1", "Reanimación", "Observación 1", "T3",
    "Triage 2", "Diagnóstico", "Observación 2", "T2", "Preinternación", "Salud Mental"
  ]);
  assert.equal(efectiva.filas.filter((fila) => fila.turnanteId === "turnante_3").length, 1);
  ["Reanimación + Sillones", "Explora", "Sillones", "Diagnóstico + Explora"]
    .forEach((etiqueta) => assert.equal(efectiva.filas.some((fila) => fila.etiqueta === etiqueta), false));
});
probar("PlanillaMensual v2 excluye filas desactivadas incluido T3", () => {
  const filas = FILAS_PLANILLA_LICENCIADOS_V2.map((fila) =>
    ["observacion_2", "turnante_3"].includes(fila.sectorId || fila.turnanteId)
      ? { ...fila, activo: false }
      : fila
  );
  const prioridad = prioridadLicenciadosV2.filter((id) => id !== "observacion_2");
  const snapshot = crearSnapshotConfiguracionPlanillaLicenciadosV2({ turno: "tarde", mes: "2027-01", filas, prioridadCoberturaSectorIds: prioridad }).snapshot;
  const efectiva = obtenerConfiguracionPlanillaEfectiva({ estadoMensual: { configuracionPlanilla: { licenciado: snapshot }, planillas: { licenciados: { posicionesMensualesAdicionales: ["T3"] } } }, turno: "tarde", categoria: "licenciado", mes: "2027-01" });
  const activas = efectiva.filas.filter((fila) => fila.activo !== false);
  assert.equal(activas.some((fila) => fila.sectorId === "observacion_2"), false);
  assert.equal(activas.some((fila) => fila.turnanteId === "turnante_3"), false);
});
probar("PlanillaMensual gatea generación v2 y ofrece adicional versionado", () => {
  const fuente = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  assert.match(fuente, /resolverVersionEstructuraLicenciados\(configuracionEfectiva\)/);
  assert.match(fuente, /generarRotacionMensualDesdeConfiguracion\(/);
  assert.match(fuente, /obtenerPosicionTurnanteMensual\(tipo, configuracionEfectiva\)/);
  assert.match(fuente, /filasActivas\.map\(\(fila\)/);
  assert.match(fuente, /<tr key=\{fila\.filaId\}/);
  assert.match(fuente, /\[sector\]: valor/);
  assert.match(fuente, /habilitarTurnanteMensual\(prev, tipo, configuracionEfectiva\)/);
  assert.equal(/reanimacion_sillones[^\n]*reanimacion|reanimacion[^\n]*reanimacion_sillones/i.test(fuente), false);
  assert.equal(fuente.includes("estructuraLicenciadosVersion: 2"), false);
});
probar("PlanillaMensual conserva Sin asignar y fija Diagnóstico en v2", () => {
  const resultado = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "tarde", mes: "2027-01", prioridadCoberturaSectorIds: prioridadLicenciadosV2,
    asignacionesFijas: [{ sectorId: "diagnostico", personaId: "P" }]
  });
  assert.deepEqual(resultado.snapshot.asignacionesFijas, [{ sectorId: "diagnostico", personaId: "P" }]);
  const fuente = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  assert.match(fuente, /obtenerPersonasSinAsignarPlanillaSemanal\(/);
  assert.match(fuente, /actualizarCelda\(periodo\.clave, sector/);
});

const crearFixtureTransicion = ({ adicional = true, filasDestinoV2, prioridad = prioridadLicenciadosV2, fijas = [] } = {}) => {
  const snapshot = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "licenciado", mes: "2026-09"
  });
  const configuracionOrigen = adicional
    ? obtenerConfiguracionPlanillaEfectiva({
        estadoMensual: {
          configuracionPlanilla: { licenciado: snapshot },
          planillas: { licenciados: { posicionesMensualesAdicionales: ["T3"] } }
        },
        turno: "tarde", categoria: "licenciado", mes: "2026-09"
      })
    : snapshot;
  const fila = (id) => configuracionOrigen.filas.find((actual) =>
    actual.sectorId === id || actual.turnanteId === id
  );
  const baseSemanalOrigen = {};
  const ids = ["triage_1", "diagnostico", "salud_mental", "turnante_1", "turnante_2", "explora", "reanimacion_sillones"];
  if (adicional) ids.push("turnante_3");
  ids.forEach((id, indice) => {
    baseSemanalOrigen[fila(id).etiqueta] = { personaId: `M${indice + 1}`, nombre: `Migrada ${indice + 1}` };
  });
  const personalDestino = [
    ...ids.map((_, indice) => ({ id: `M${indice + 1}`, nombre: `Migrada ${indice + 1}`, categoria: "licenciado" })),
    { id: "SOBRANTE", nombre: "Sobrante", categoria: "licenciado" }
  ];
  const entrada = {
    configuracionOrigen,
    baseSemanalOrigen,
    filasDestinoV2,
    prioridadDestinoV2: prioridad,
    asignacionesFijasOrigen: fijas,
    personalDestino
  };
  return { entrada, fila, resultado: prepararTransicionLicenciadosV1aV2(entrada) };
};
const referenciaTransicion = (resultado, id) => {
  const fila = resultado.configuracionDestino.filas.find((actual) =>
    actual.sectorId === id || actual.turnanteId === id
  );
  return fila ? resultado.baseSemanalDestino[fila.etiqueta] : undefined;
};

probar("transición pura v1 a v2 conserva matching exacto y reglas especiales", () => {
  const { resultado } = crearFixtureTransicion();
  assert.equal(resultado.ok, true);
  assert.equal(resultado.aplicar, true);
  assert.equal(resultado.configuracionDestino.estructuraLicenciadosVersion, 2);
  for (const [id, personaId] of [
    ["triage_1", "M1"], ["diagnostico", "M2"], ["salud_mental", "M3"],
    ["turnante_1", "M4"], ["turnante_2", "M5"], ["turnante_3", "M6"]
  ]) assert.equal(referenciaTransicion(resultado, id).personaId, personaId);
  assert.deepEqual(resultado.posicionesMensualesAdicionalesDestino, ["T4"]);
  assert.equal(resultado.baseSemanalDestino.T4.personaId, "M8");
  assert.equal(referenciaTransicion(resultado, "reanimacion"), "");
  assert.equal(resultado.personasSinAsignar.some(({ id }) => id === "M7"), true);
  assert.equal(resultado.personasSinAsignar.some(({ id }) => ["M6", "M8"].includes(id)), false);
  assert.equal(resultado.referenciasTransformadas.some(({ motivo }) => motivo === "TRANSICION_EXPLORA_A_T3"), true);
  assert.equal(resultado.referenciasTransformadas.some(({ motivo }) => motivo === "TRANSICION_T3_ADICIONAL_A_T4"), true);
  const clavesLegacy = ["Explora", "Reanimación + Sillones", "reanimacion_sillones", "Diagnóstico + Explora", "diagnostico_explora"];
  assert.equal(Object.keys(resultado.baseSemanalDestino).some((clave) => clavesLegacy.includes(clave)), false);
  const idsAsignados = Object.values(resultado.baseSemanalDestino).map((valor) => valor?.personaId).filter(Boolean);
  assert.equal(new Set(idsAsignados).size, idsAsignados.length);
});

probar("transición limita matching y Sin asignar a la cohorte Licenciados", () => {
  const fixture = crearFixtureTransicion();
  fixture.entrada.personalDestino.push(
    { id: "E1", nombre: "Enfermero sobrante", categoria: "enfermero" },
    { id: "E2", nombre: "Enfermero referenciado", categoria: "enfermero" }
  );
  const filaObservacion = fixture.fila("observacion_1");
  fixture.entrada.baseSemanalOrigen[filaObservacion.etiqueta] = {
    personaId: "E2",
    nombre: "Enfermero referenciado"
  };
  const resultado = prepararTransicionLicenciadosV1aV2(fixture.entrada);
  assert.equal(resultado.personasSinAsignar.every(({ categoria }) => categoria === "licenciado"), true);
  assert.equal(resultado.personasSinAsignar.some(({ id }) => ["E1", "E2"].includes(id)), false);
  assert.equal(resultado.personasSinAsignar.some(({ id }) => id === "SOBRANTE"), true);
  assert.equal(resultado.personasSinAsignar.some(({ id }) => id === "M7"), true);
  assert.equal(referenciaTransicion(resultado, "observacion_1"), "");
  assert.equal(resultado.referenciasOmitidas.some(({ personaId, motivo }) =>
    personaId === "E2" && motivo === "PERSONA_FUERA_PADRON_DESTINO"), true);
  assert.equal(referenciaTransicion(resultado, "turnante_3").personaId, "M6");
  assert.equal(resultado.personasSinAsignar.some(({ id }) => id === "M6"), false);
  assert.equal(resultado.baseSemanalDestino.T4.personaId, "M8");
  assert.equal(new Set(resultado.personasSinAsignar.map(({ id }) => id)).size,
    resultado.personasSinAsignar.length);
});

probar("origen v2 no se migra y sin adicional legacy no aparece T4", () => {
  assert.equal(prepararTransicionLicenciadosV1aV2({
    configuracionOrigen: { estructuraLicenciadosVersion: 2 }
  }).motivo, "ORIGEN_LICENCIADOS_YA_V2");
  const { resultado } = crearFixtureTransicion({ adicional: false });
  assert.deepEqual(resultado.posicionesMensualesAdicionalesDestino, []);
  assert.equal(Object.hasOwn(resultado.baseSemanalDestino, "T4"), false);
});

probar("Explora vacía deja T3 vacío y T3 inactivo deja su persona Sin asignar", () => {
  const vacia = crearFixtureTransicion();
  vacia.entrada.baseSemanalOrigen[vacia.fila("explora").etiqueta] = "";
  assert.equal(referenciaTransicion(prepararTransicionLicenciadosV1aV2(vacia.entrada), "turnante_3"), "");
  const filas = FILAS_PLANILLA_LICENCIADOS_V2.map((fila) =>
    fila.turnanteId === "turnante_3" ? { ...fila, activo: false } : fila
  );
  const inactiva = crearFixtureTransicion({ filasDestinoV2: filas }).resultado;
  assert.equal(Object.hasOwn(inactiva.baseSemanalDestino, "T3"), false);
  assert.equal(inactiva.personasSinAsignar.some(({ id }) => id === "M6"), true);
  assert.equal(inactiva.referenciasOmitidas.some(({ motivo, personaId }) =>
    motivo === "FILA_DESTINO_INACTIVA" && personaId === "M6"), true);
});

probar("transición exige prioridad v2 explícita completa", () => {
  for (const prioridad of [
    null,
    prioridadLicenciadosV2.filter((id) => id !== "sillones"),
    prioridadLicenciadosV2.filter((id) => id !== "explora"),
    ["reanimacion_sillones", "explora"]
  ]) {
    const resultado = crearFixtureTransicion({ prioridad }).resultado;
    assert.equal(resultado.ok, false);
    assert.equal(resultado.aplicar, false);
    assert.equal(resultado.requierePrioridadV2, true);
  }
});

probar("transición separa fijas compatibles e incompatibles sin convertirlas", () => {
  const fijas = [
    { sectorId: "diagnostico", personaId: "M2" },
    { sectorId: "explora", personaId: "M6" },
    { sectorId: "reanimacion_sillones", personaId: "M7" },
    { sectorId: "turnante_3", personaId: "M6" },
    { sectorId: "turnante_4", personaId: "M8" }
  ];
  const resultado = crearFixtureTransicion({ fijas }).resultado;
  assert.deepEqual(resultado.asignacionesFijasCompatibles, [fijas[0]]);
  assert.deepEqual(resultado.asignacionesFijasIncompatibles, fijas.slice(1));
  assert.deepEqual(resultado.configuracionDestino.asignacionesFijas, [fijas[0]]);
  assert.equal(resultado.requiereRevisionFijas, true);
  assert.equal(resultado.finalizable, false);
});

probar("transición usa personaId, diagnostica duplicados y no muta inputs", () => {
  const fixture = crearFixtureTransicion();
  const antes = structuredClone(fixture.entrada);
  const filaDiagnostico = fixture.fila("diagnostico").etiqueta;
  fixture.entrada.baseSemanalOrigen[filaDiagnostico] = { personaId: "M1", nombre: "Otro nombre" };
  const resultadoDuplicado = prepararTransicionLicenciadosV1aV2(fixture.entrada);
  assert.equal(resultadoDuplicado.referenciasOmitidas.some(({ motivo }) =>
    motivo === "IDENTIDAD_DUPLICADA_EN_ORIGEN"), true);
  assert.equal(new Set(resultadoDuplicado.personasSinAsignar.map(({ id }) => id)).size, resultadoDuplicado.personasSinAsignar.length);
  const fuera = crearFixtureTransicion();
  fuera.entrada.personalDestino.push({ id: "OTRA", nombre: "Mismo nombre", categoria: "licenciado" });
  fuera.entrada.baseSemanalOrigen[fuera.fila("diagnostico").etiqueta] = { personaId: "FUERA", nombre: "Mismo nombre" };
  const resultadoFuera = prepararTransicionLicenciadosV1aV2(fuera.entrada);
  assert.equal(referenciaTransicion(resultadoFuera, "diagnostico"), "");
  assert.equal(resultadoFuera.referenciasOmitidas.some(({ motivo }) => motivo === "PERSONA_FUERA_PADRON_DESTINO"), true);
  const inmutable = crearFixtureTransicion();
  const copia = structuredClone(inmutable.entrada);
  prepararTransicionLicenciadosV1aV2(inmutable.entrada);
  assert.deepEqual(inmutable.entrada, copia);
  assert.notDeepEqual(fixture.entrada, antes);
});

probar("dominio C7B se integra en Preparar mes y su preflight sin persistencia", () => {
  const fuente = fs.readFileSync("src/utils/transicionLicenciadosV1aV2.js", "utf8");
  const fuentePreparacion = fs.readFileSync("src/utils/preparacionMesNuevo.js", "utf8");
  assert.equal(/supabase|persistir|setEstado|onCambiar/i.test(fuente), false);
  assert.equal(fuentePreparacion.includes("prepararTransicionLicenciadosV1aV2"), true);
  assert.equal(fuentePreparacion.includes("transicionLicenciadosV2?.activar === true"), false);
  assert.equal(fuentePreparacion.includes("CONFIGURACION_LICENCIADOS_V2_REQUERIDA"), true);
  assert.equal(fuentePreparacion.includes("DESTINO_CONFIGURACION_LICENCIADOS_LEGACY"), true);
  assert.equal(fs.readFileSync("src/components/mes/PanelPrepararMes.jsx", "utf8").includes("prepararTransicionLicenciadosV1aV2"), true);
  assert.equal(fs.readFileSync("src/App.jsx", "utf8").includes("transicionLicenciadosV1aV2"), false);
});
console.log(`\nEtapa 34A: ${total} pruebas de configuración aprobadas.`);
