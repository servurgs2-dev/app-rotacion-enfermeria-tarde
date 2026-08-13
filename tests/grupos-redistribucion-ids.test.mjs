import assert from "node:assert/strict";
import fs from "node:fs";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  SECTORES_PLANILLA
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { construirAsignacionesDiariasCalendario } from "../src/utils/pipelineCalendarioDiario.js";
import {
  crearRegistroNoDisponible,
  excluirAusenciasOperativasNoDisponiblesDeAsignaciones,
  MOTIVOS_NO_DISPONIBLE
} from "../src/utils/noDisponiblesMotivos.js";
import {
  esClavePersistidaGrupoRedistribucion,
  gruposRedistribucionEstanFueraDeSectoresPlanilla,
  MODE_IDS_REDISTRIBUCION,
  MODOS_REDISTRIBUCION,
  obtenerClaveHistoricaGrupoRedistribucion,
  obtenerEtiquetaGrupoRedistribucion,
  obtenerGrupoRedistribucionPorEtiquetaHistorica,
  obtenerGrupoRedistribucionPorId,
  obtenerModoRedistribucionPorId,
  resolverGrupoRedistribucion,
  resolverSectoresReemplazadosRedistribucion,
  SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION
} from "../src/utils/gruposRedistribucion.js";
import {
  esDistribucionOpcion1,
  obtenerDestinosVisiblesOpcion1,
  obtenerSectoresVisiblesOpcion1,
  PRIORIDAD_REDISTRIBUCION_OPCION_1,
  quitarRedistribucionFecha,
  recalcularRedistribucionOpcion1Automatica,
  redistribuirCritica,
  redistribuirPorBoxes,
  SECTORES_REDISTRIBUCION_BOXES,
  SECTORES_REDISTRIBUCION_OPCION_1
} from "../src/utils/redistribucionEnfermeros.js";
import { normalizar } from "../src/utils/texto.js";

const firma = (valor) => JSON.stringify(valor);
const contexto = { turno: "tarde", mes: "2026-09" };
let total = 0;
const probar = (nombre, prueba) => { prueba(); total += 1; console.log(`✓ ${total} ${nombre}`); };
const crearEstadoSnapshot = () => {
  const estado = crearEstadoMensualVacio();
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({
      turno: contexto.turno,
      categoria: "enfermero",
      mes: contexto.mes
    })
  };
  return estado;
};

probar("existen dos modeId estables y únicos", () => {
  assert.deepEqual(Object.values(MODE_IDS_REDISTRIBUCION), ["redistribucion_opcion_1", "redistribucion_opcion_2"]);
  assert.equal(new Set(MODOS_REDISTRIBUCION.map((modo) => modo.modeId)).size, 2);
});
probar("opción 1 tiene cuatro grupos y opción 2 cinco", () => {
  assert.equal(obtenerModoRedistribucionPorId(MODE_IDS_REDISTRIBUCION.OPCION_1).groups.length, 4);
  assert.equal(obtenerModoRedistribucionPorId(MODE_IDS_REDISTRIBUCION.OPCION_2).groups.length, 5);
});
probar("todos los groupId son únicos y no son sectorId", () => {
  const ids = MODOS_REDISTRIBUCION.flatMap((modo) => modo.groups.map((grupo) => grupo.groupId));
  const sectorIds = new Set(SECTORES_PLANILLA.map((sector) => sector.sectorId));
  assert.equal(new Set(ids).size, 9);
  assert.equal(ids.some((id) => sectorIds.has(id)), false);
  assert.equal(gruposRedistribucionEstanFueraDeSectoresPlanilla(), true);
});
probar("ningún grupo expone sectorId ni filaId ni membresía inventada", () => {
  for (const grupo of MODOS_REDISTRIBUCION.flatMap((modo) => modo.groups)) {
    assert.equal(Object.hasOwn(grupo, "sectorId"), false);
    assert.equal(Object.hasOwn(grupo, "filaId"), false);
    assert.equal(Object.hasOwn(grupo, "memberSectorIds"), false);
  }
});
probar("ambos modos comparten exactamente seis sectorId reemplazados", () => {
  const esperados = ["boxes_1_3_21", "boxes_4_7", "boxes_8_13", "boxes_14_19", "boxes_20_22_24", "dx_25_30"];
  assert.deepEqual(SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION, esperados);
  for (const modo of MODOS_REDISTRIBUCION) assert.deepEqual(modo.replacedSectorIds, esperados);
});
probar("los seis sectorId existen en Enfermeros", () => {
  const ids = new Set(SECTORES_PLANILLA.map((sector) => sector.sectorId));
  assert.equal(SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION.every((id) => ids.has(id)), true);
});
probar("etiquetas históricas de opción 1 resuelven sus groupId", () => {
  for (const grupo of MODOS_REDISTRIBUCION[0].groups) {
    assert.equal(obtenerGrupoRedistribucionPorEtiquetaHistorica(grupo.etiqueta).groupId, grupo.groupId);
    assert.equal(esClavePersistidaGrupoRedistribucion(normalizar(grupo.etiqueta)), true);
  }
});
probar("etiquetas históricas de opción 2 resuelven sus groupId", () => {
  for (const grupo of MODOS_REDISTRIBUCION[1].groups) {
    assert.equal(resolverGrupoRedistribucion(grupo.etiqueta).groupId, grupo.groupId);
    assert.equal(resolverGrupoRedistribucion(grupo.groupId).groupId, grupo.groupId);
  }
});
probar("groupId resuelve etiqueta y clave histórica normalizada", () => {
  const grupo = MODOS_REDISTRIBUCION[0].groups[0];
  assert.equal(obtenerEtiquetaGrupoRedistribucion(grupo.groupId), grupo.etiqueta);
  assert.equal(obtenerClaveHistoricaGrupoRedistribucion(grupo.groupId), normalizar(grupo.etiqueta));
});
probar("clave desconocida y coincidencia parcial devuelven null", () => {
  assert.equal(obtenerGrupoRedistribucionPorId("desconocido"), null);
  assert.equal(obtenerGrupoRedistribucionPorEtiquetaHistorica("4–10 extra"), null);
  assert.equal(obtenerGrupoRedistribucionPorEtiquetaHistorica("4–"), null);
});
probar("snapshot renombrado resuelve sectores por ID", () => {
  const estado = crearEstadoSnapshot();
  estado.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === "boxes_4_7").etiqueta = "Boxes centrales";
  const resultado = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_1, estadoMensual: estado, ...contexto });
  assert.equal(resultado.sectoresConfigurados.find((fila) => fila.sectorId === "boxes_4_7").etiqueta, "Boxes centrales");
});
probar("Drag & Drop no modifica identidad ni orden canónico reportado", () => {
  const estado = crearEstadoSnapshot();
  estado.configuracionPlanilla.enfermero.filas.reverse().forEach((fila, orden) => { fila.orden = orden; });
  const resultado = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_2, estadoMensual: estado, ...contexto });
  assert.deepEqual(resultado.sectoresConfigurados.map((fila) => fila.sectorId), SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION);
});
probar("fila inactiva se informa sin crear otro grupo", () => {
  const estado = crearEstadoSnapshot();
  estado.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === "boxes_8_13").activo = false;
  const resultado = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_1, estadoMensual: estado, ...contexto });
  assert.deepEqual(resultado.sectoresInactivos.map((fila) => fila.sectorId), ["boxes_8_13"]);
  assert.equal(resultado.sectoresActivos.length, 5);
  assert.equal(obtenerModoRedistribucionPorId(resultado.modeId).groups.length, 4);
});
probar("agosto legacy resuelve seis sectores sin crear snapshot ni mutar estado", () => {
  const estado = crearEstadoMensualVacio(); const antes = firma(estado);
  const resultado = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_1, estadoMensual: estado, turno: "tarde", mes: "2026-08" });
  assert.equal(resultado.sectoresConfigurados.length, 6);
  assert.deepEqual(resultado.sectorIdsFaltantes, []);
  assert.equal(firma(estado), antes);
  assert.equal(estado.configuracionPlanilla, undefined);
});
probar("helpers no mutan configuración, snapshot ni cambiosDia", () => {
  const estado = crearEstadoSnapshot(); const cambiosDia = { dia: { "4–10": "persona" } };
  const antes = [firma(configuracionSectores), firma(estado), firma(cambiosDia)];
  resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_2, estadoMensual: estado, ...contexto });
  resolverGrupoRedistribucion("4–10");
  assert.deepEqual([firma(configuracionSectores), firma(estado), firma(cambiosDia)], antes);
});
probar("grupos no se agregan a SECTORES_PLANILLA ni a snapshots", () => {
  const groupIds = new Set(MODOS_REDISTRIBUCION.flatMap((modo) => modo.groups.map((grupo) => grupo.groupId)));
  assert.equal(SECTORES_PLANILLA.some((sector) => groupIds.has(sector.sectorId)), false);
  assert.equal(crearEstadoSnapshot().configuracionPlanilla.enfermero.filas.some((fila) => groupIds.has(fila.sectorId)), false);
});
probar("catálogos legacy conservan exactamente etiquetas y orden", () => {
  assert.deepEqual(SECTORES_REDISTRIBUCION_OPCION_1, MODOS_REDISTRIBUCION[0].groups.map((grupo) => grupo.etiqueta));
  assert.deepEqual(SECTORES_REDISTRIBUCION_BOXES, MODOS_REDISTRIBUCION[1].groups.map((grupo) => grupo.etiqueta));
});
probar("modo desconocido no altera configuración", () => {
  assert.equal(obtenerModoRedistribucionPorId("otro"), null);
  assert.equal(resolverSectoresReemplazadosRedistribucion({ modeId: "otro" }), null);
});
probar("algoritmos, paro y Reanimación + Sillones permanecen fuera del catálogo", () => {
  const catalogo = fs.readFileSync(new URL("../src/utils/gruposRedistribucion.js", import.meta.url), "utf8");
  const redistribucion = fs.readFileSync(new URL("../src/utils/redistribucionEnfermeros.js", import.meta.url), "utf8");
  assert.doesNotMatch(catalogo, /crearRedistribucion|redistribuirCritica|redistribuirPorBoxes|sectoresParo|prioridadesParo|cambiosParoDia|Reanimaci[oó]n \+ Sillones/);
  assert.match(redistribucion, /const crearRedistribucion/);
  assert.match(redistribucion, /export const redistribuirCritica/);
  assert.match(redistribucion, /export const redistribuirPorBoxes/);
});

probar("prioridad de opción 1 distingue cuatro groupId y nueve sectorId", () => {
  assert.deepEqual(
    PRIORIDAD_REDISTRIBUCION_OPCION_1.slice(0, 5),
    [
      { tipo: "sector", sectorId: "rea_1" },
      ...MODOS_REDISTRIBUCION[0].groups.map((grupo) => ({ tipo: "grupo", groupId: grupo.groupId }))
    ]
  );
  assert.deepEqual(
    PRIORIDAD_REDISTRIBUCION_OPCION_1.slice(5).map((item) => item.sectorId),
    ["sillon_1", "explora_1", "pre_int_1", "salud_mental", "pre_int_2", "sillon_2", "explora_2", "rea_2"]
  );
  assert.equal(PRIORIDAD_REDISTRIBUCION_OPCION_1.some((item) => Object.hasOwn(item, "etiqueta")), false);
});
probar("las seis filas reemplazadas se reconocen por sectorId aunque se renombren", () => {
  const estado = crearEstadoSnapshot();
  const filas = estado.configuracionPlanilla.enfermero.filas;
  SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION.forEach((sectorId, indice) => {
    filas.find((fila) => fila.sectorId === sectorId).etiqueta = `Boxes renombrado ${indice + 1}`;
  });
  const ordenVisual = filas.filter((fila) => fila.activo).sort((a, b) => a.orden - b.orden).map((fila) => fila.etiqueta);
  const destinos = obtenerDestinosVisiblesOpcion1({ ordenVisual, filasConfiguracion: filas });
  assert.equal(destinos.filter((destino) => destino.tipo === "grupo").length, 4);
  assert.equal(destinos.some((destino) => SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION.includes(destino.sectorId)), false);
  assert.equal(destinos.some((destino) => String(destino.etiqueta).startsWith("Boxes renombrado")), false);
});
probar("renombrar sectores prioritarios no altera la prioridad de negocio", () => {
  const estado = crearEstadoSnapshot();
  const filas = estado.configuracionPlanilla.enfermero.filas;
  const prioritarios = PRIORIDAD_REDISTRIBUCION_OPCION_1.filter((item) => item.tipo === "sector");
  prioritarios.forEach((item, indice) => {
    filas.find((fila) => fila.sectorId === item.sectorId).etiqueta = `Prioridad ${indice + 1}`;
  });
  const ordenVisual = [...filas].reverse().map((fila) => fila.etiqueta);
  const asignaciones = ordenVisual.map((nombre, indice) => ({
    nombre,
    enfermero: { id: `p-${indice}`, nombre: `Persona ${indice}` }
  }));
  const resultado = redistribuirCritica({ asignaciones, ordenVisual, filasConfiguracion: filas });
  assert.deepEqual(
    resultado.asignaciones.slice(0, 13).map((fila) => fila.nombre),
    [
      "Prioridad 1",
      ...SECTORES_REDISTRIBUCION_OPCION_1,
      ...Array.from({ length: 8 }, (_, indice) => `Prioridad ${indice + 2}`)
    ]
  );
});
probar("Drag & Drop conserva prioridad y deja el resto en su orden efectivo", () => {
  const estado = crearEstadoSnapshot();
  const filas = estado.configuracionPlanilla.enfermero.filas;
  const resto = filas.filter((fila) => fila.tipo === "turnante").reverse();
  const ordenVisual = [
    ...resto.map((fila) => fila.etiqueta),
    ...filas.filter((fila) => fila.tipo === "sector").reverse().map((fila) => fila.etiqueta)
  ];
  const resultado = redistribuirCritica({ asignaciones: [], ordenVisual, filasConfiguracion: filas });
  assert.deepEqual(resultado.asignaciones.slice(-resto.length).map((fila) => fila.nombre), resto.map((fila) => fila.etiqueta));
  assert.equal(resultado.asignaciones[0].nombre, "REA 1");
});
probar("inactivos no reaparecen y permanecen informados por configuración", () => {
  const estado = crearEstadoSnapshot();
  const filas = estado.configuracionPlanilla.enfermero.filas;
  filas.find((fila) => fila.sectorId === "boxes_14_19").activo = false;
  const activas = filas.filter((fila) => fila.activo !== false);
  const visibles = obtenerSectoresVisiblesOpcion1(activas.map((fila) => fila.etiqueta), activas);
  assert.equal(visibles.includes("14-19"), false);
  assert.equal(visibles.filter((fila) => SECTORES_REDISTRIBUCION_OPCION_1.includes(fila)).length, 4);
  const resueltos = resolverSectoresReemplazadosRedistribucion({ modeId: MODE_IDS_REDISTRIBUCION.OPCION_1, estadoMensual: estado, ...contexto });
  assert.deepEqual(resueltos.sectoresInactivos.map((fila) => fila.sectorId), ["boxes_14_19"]);
});
probar("redistribución conserva personas, deduplicación, vacíos y claves legacy", () => {
  const estado = crearEstadoSnapshot();
  const filas = estado.configuracionPlanilla.enfermero.filas;
  const ordenVisual = filas.map((fila) => fila.etiqueta);
  const persona = { id: "p-1", nombre: "Persona única" };
  const resultado = redistribuirCritica({
    asignaciones: [{ nombre: "REA 1", enfermero: persona }, { nombre: "T1", enfermero: persona }],
    ordenVisual,
    filasConfiguracion: filas
  });
  assert.equal(resultado.personasConsideradas, 1);
  assert.equal(resultado.asignaciones.filter((fila) => fila.enfermero === persona).length, 1);
  assert.equal(Object.values(resultado.cambios).filter((valor) => valor === "__EMPTY__").length, resultado.asignaciones.length - 1);
  assert.equal(Object.keys(resultado.cambios).some((clave) => clave.startsWith("OPCION_1_")), false);
  for (const etiqueta of SECTORES_REDISTRIBUCION_OPCION_1) assert.ok(Object.hasOwn(resultado.cambios, normalizar(etiqueta)));
});
probar("detección resuelve claves legacy a modeId sin coincidencia parcial", () => {
  assert.equal(esDistribucionOpcion1({ [normalizar("4–10")]: "__EMPTY__" }), true);
  assert.equal(esDistribucionOpcion1({ "4-10 parcial": "__EMPTY__" }), false);
  assert.equal(esDistribucionOpcion1({ desconocida: "__EMPTY__" }), false);
});
probar("volver a común limpia fecha y procedencia sin tocar datos asociados", () => {
  const calendario = {
    cambiosDia: { dia: { [normalizar("4–10")]: "__EMPTY__" }, otra: { rea: "x" } },
    procedenciaCambiosDia: { dia: { [normalizar("4–10")]: "redistribucion_automatica" }, otra: { rea: "manual" } },
    extras: { dia: [{ id: "e" }] },
    noDisponibles: { dia: [{ id: "n" }] },
    asistenciaDia: { dia: { p: "presente" } }
  };
  const resultado = quitarRedistribucionFecha(calendario, "dia");
  assert.equal(Object.hasOwn(resultado.cambiosDia, "dia"), false);
  assert.equal(Object.hasOwn(resultado.procedenciaCambiosDia, "dia"), false);
  assert.deepEqual(resultado.cambiosDia.otra, calendario.cambiosDia.otra);
  assert.equal(resultado.extras, calendario.extras);
  assert.equal(resultado.noDisponibles, calendario.noDisponibles);
  assert.equal(resultado.asistenciaDia, calendario.asistenciaDia);
});
probar("opción 2 conserva su salida histórica exacta", () => {
  const personas = Array.from({ length: 3 }, (_, indice) => ({ id: `b-${indice}`, nombre: `B ${indice}` }));
  const ordenVisual = configuracionSectores.enfermero.ordenVisual;
  const resultado = redistribuirPorBoxes({
    asignaciones: personas.map((enfermero, indice) => ({ nombre: `Fila ${indice}`, enfermero })),
    ordenVisual
  });
  assert.deepEqual(resultado.asignaciones.slice(0, 6).map((fila) => fila.nombre), ["REA 1", ...SECTORES_REDISTRIBUCION_BOXES]);
});
probar("Calendario conserva procedencia automática y no conecta paro", () => {
  const calendario = fs.readFileSync(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8");
  assert.match(calendario, /PROCEDENCIA_REDISTRIBUCION_AUTOMATICA/);
  assert.match(calendario, /procedenciaCambiosDia/);
  assert.match(calendario, /cambiosActivos = esDiaParo \? cambiosParoDia : cambiosDia/);
  assert.doesNotMatch(fs.readFileSync(new URL("../src/utils/gruposRedistribucion.js", import.meta.url), "utf8"), /sectoresParo|prioridadesParo|cambiosParoDia/);
});

const ejecutarAusenciaPosteriorOpcion1 = ({ groupId, motivo, cantidad = 13 }) => {
  const estado = crearEstadoSnapshot();
  const filasConfiguracion = estado.configuracionPlanilla.enfermero.filas;
  const ordenVisual = filasConfiguracion.map((fila) => fila.etiqueta);
  const personas = Array.from({ length: cantidad }, (_, indice) => ({
    id: `persona-${indice + 1}`,
    nombre: `Persona ${indice + 1}`,
    categoria: "enfermero"
  }));
  const inicial = redistribuirCritica({
    asignaciones: personas.map((enfermero, indice) => ({ nombre: `Origen ${indice}`, enfermero })),
    ordenVisual,
    filasConfiguracion
  });
  const procedencia = Object.fromEntries(Object.keys(inicial.cambios).map((clave) => [
    clave,
    "redistribucion_automatica"
  ]));
  const filasCalendario = obtenerSectoresVisiblesOpcion1(ordenVisual, filasConfiguracion);
  let asignaciones = construirAsignacionesDiariasCalendario({
    filasCalendario,
    filasConfiguracion,
    planillaPeriodoEfectiva: {},
    cambiosDia: inicial.cambios,
    procedenciaCambiosDia: procedencia,
    personal: personas,
    turnantes: []
  });
  const etiquetaGrupo = obtenerEtiquetaGrupoRedistribucion(groupId);
  const ausente = asignaciones.find((fila) => fila.nombre === etiquetaGrupo).enfermero;
  const { registro, error } = crearRegistroNoDisponible({
    persona: ausente,
    motivo,
    detalle: motivo === MOTIVOS_NO_DISPONIBLE.OTRO ? "Informado" : "",
    turnoDestino: motivo === MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO ? "manana" : ""
  });
  assert.equal(error, "");
  asignaciones = excluirAusenciasOperativasNoDisponiblesDeAsignaciones({
    asignaciones,
    registros: [registro],
    personal: personas
  });
  const antes = asignaciones.map((fila) => ({ ...fila }));
  const resultado = recalcularRedistribucionOpcion1Automatica({
    asignaciones,
    cambiosDia: inicial.cambios,
    procedenciaCambiosDia: procedencia,
    ordenVisual,
    filasConfiguracion
  });
  return { resultado, antes, ausente, inicial, procedencia, filasConfiguracion, ordenVisual };
};

probar("flujo productivo recalcula 10 personas y 11–18 gana a SILLÓN 2", () => {
  const flujo = ejecutarAusenciaPosteriorOpcion1({
    groupId: "opcion_1_boxes_11_18",
    motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO,
    cantidad: 11
  });
  const cubiertas = flujo.resultado.filter((fila) => fila.enfermero);
  assert.equal(cubiertas.length, 10);
  assert.ok(flujo.resultado.find((fila) => fila.nombre === "11–18").enfermero);
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "sillon_2").enfermero, null);
  assert.equal(flujo.resultado.some((fila) => fila.enfermero?.id === flujo.ausente.id), false);
  assert.equal(new Set(cubiertas.map((fila) => fila.enfermero.id)).size, 10);
});

for (const [indice, grupo] of MODOS_REDISTRIBUCION[0].groups.entries()) {
  probar(`ausencia posterior en ${grupo.etiqueta} recalcula prioridad automática`, () => {
    const flujo = ejecutarAusenciaPosteriorOpcion1({
      groupId: grupo.groupId,
      motivo: indice % 2 === 0
        ? MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO
        : MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO
    });
    assert.ok(flujo.resultado.find((fila) => fila.nombre === grupo.etiqueta).enfermero);
    assert.equal(flujo.resultado.some((fila) => fila.enfermero?.id === flujo.ausente.id), false);
  });
}

probar("destinos manuales quedan fuera del recálculo automático", () => {
  const flujo = ejecutarAusenciaPosteriorOpcion1({
    groupId: "opcion_1_boxes_11_18",
    motivo: MOTIVOS_NO_DISPONIBLE.OTRO
  });
  const claveManual = normalizar("SILLON 2");
  const manual = flujo.antes.find((fila) => fila.sectorId === "sillon_2").enfermero;
  const procedencia = { ...flujo.procedencia };
  delete procedencia[claveManual];
  const resultado = recalcularRedistribucionOpcion1Automatica({
    asignaciones: flujo.antes,
    cambiosDia: flujo.inicial.cambios,
    procedenciaCambiosDia: procedencia,
    ordenVisual: flujo.ordenVisual,
    filasConfiguracion: flujo.filasConfiguracion
  });
  assert.equal(resultado.find((fila) => fila.sectorId === "sillon_2").enfermero, manual);
});

console.log(`\n${total} pruebas de grupos de redistribución por identidad pasaron.`);
