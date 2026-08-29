import assert from "node:assert/strict";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanillaLicenciadosV2
} from "../src/utils/configuracionPlanilla.js";
import { CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 } from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";
import { crearEstadoMensualVacio, normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import {
  analizarPreparacionMesNuevo,
  construirEstadoMesNuevo,
  obtenerFilasPlanilla
} from "../src/utils/preparacionMesNuevo.js";

const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const filasEnfermeros = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
const filasLicenciados = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
const prioridadLicenciadosV2 = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2.map(({ id }) => id);
const filasLicenciadosV2 = crearSnapshotConfiguracionPlanillaLicenciadosV2({
  turno: "tarde", mes: "2026-09", prioridadCoberturaSectorIds: prioridadLicenciadosV2
}).snapshot.filas;
const personas = [
  ...filasEnfermeros.map((_, indice) => ({
    id: `enf-${indice}`, nombre: `Enfermero ${indice}`, categoria: "enfermero", turno: "tarde"
  })),
  ...filasLicenciados.map((_, indice) => ({
    id: `lic-${indice}`, nombre: `Licenciado ${indice}`, categoria: "licenciado", turno: "tarde"
  }))
];
const distribuir = (filas, categoria) => Object.fromEntries(filas.map((fila, indice) => {
  const persona = personas.filter((item) => item.categoria === categoria)[indice];
  return [fila, { personaId: persona.id, nombre: persona.nombre }];
}));

const crearAgostoLegacy = () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = clonar(personas);
  estado.planillas.enfermeros.semana5 = distribuir(filasEnfermeros, "enfermero");
  estado.planillas.licenciados.semana5 = distribuir(filasLicenciados, "licenciado");
  return estado;
};

const prepararSeptiembre = ({
  destino = crearEstadoMensualVacio(),
  configurarOrigen,
  configuracionLicenciadosV2 = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "tarde",
    mes: "2026-09",
    prioridadCoberturaSectorIds: prioridadLicenciadosV2
  }).snapshot
} = {}) => {
  const origen = crearAgostoLegacy();
  configurarOrigen?.(origen);
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "tarde",
    mesOrigen: "2026-08",
    mesDestino: "2026-09",
    estadoOrigen: origen,
    estadoDestino: destino
  });
  assert.equal(analisis.ok, true, analisis.mensaje);
  return {
    origen,
    analisis,
    resultado: construirEstadoMesNuevo({ analisis, configuracionLicenciadosV2 })
  };
};

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const base = prepararSeptiembre();
const snapshots = base.resultado.estado.configuracionPlanilla;

probar("1 preparar mes nuevo crea configuracionPlanilla", () => assert.ok(snapshots));
probar("2 contiene snapshot de Enfermeros", () => assert.ok(snapshots.enfermero));
probar("3 contiene snapshot de Licenciados", () => assert.ok(snapshots.licenciado));
probar("4 usa el turno real", () => {
  assert.equal(snapshots.enfermero.turnoId, "tarde");
  assert.equal(snapshots.licenciado.turnoId, "tarde");
});
probar("5 usa el mes destino", () => {
  assert.equal(snapshots.enfermero.mes, "2026-09");
  assert.equal(snapshots.licenciado.mes, "2026-09");
});
probar("6 usa las categorías correctas", () => {
  assert.equal(snapshots.enfermero.categoria, "enfermero");
  assert.equal(snapshots.licenciado.categoria, "licenciado");
});
probar("7 T6 se refleja cuando está habilitado", () => {
  const snapshot = prepararSeptiembre({ configurarOrigen: (origen) => {
    origen.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  } }).resultado.estado.configuracionPlanilla.enfermero;
  assert.equal(snapshot.filas.some((fila) => fila.etiqueta === "T6"), true);
});
probar("8 T3 adicional legacy se convierte en T4", () => {
  const snapshot = prepararSeptiembre({ configurarOrigen: (origen) => {
    origen.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  } }).resultado.estado.configuracionPlanilla.licenciado;
  assert.equal(snapshot.filas.some((fila) => fila.etiqueta === "T3"), true);
  assert.equal(snapshot.filas.some((fila) => fila.etiqueta === "T4"), false);
});
probar("9 sin adicionales T3 permanece como base v2", () => {
  assert.equal(snapshots.enfermero.filas.some((fila) => fila.etiqueta === "T6"), false);
  assert.equal(snapshots.licenciado.filas.some((fila) => fila.etiqueta === "T3"), true);
  assert.equal(snapshots.licenciado.filas.some((fila) => fila.etiqueta === "T4"), false);
});
probar("10 el origen legacy continúa sin configuracionPlanilla", () => {
  assert.equal(Object.hasOwn(base.origen, "configuracionPlanilla"), false);
});
probar("11 preparar septiembre no muta agosto", () => {
  const agosto = crearAgostoLegacy();
  const antes = clonar(agosto);
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "tarde", mesOrigen: "2026-08", mesDestino: "2026-09",
    estadoOrigen: agosto, estadoDestino: crearEstadoMensualVacio()
  });
  construirEstadoMesNuevo({ analisis });
  assert.deepEqual(agosto, antes);
});
probar("12 snapshots de categorías son independientes", () => {
  snapshots.enfermero.filas[0].etiqueta = "CAMBIO ENFERMERO";
  assert.notEqual(snapshots.licenciado.filas[0].etiqueta, "CAMBIO ENFERMERO");
});
probar("13 modificar snapshot no muta configuracionSectores", () => {
  const original = configuracionSectores.enfermero.sectoresFijos[0];
  snapshots.enfermero.filas[0].etiqueta = "OTRO CAMBIO";
  assert.equal(configuracionSectores.enfermero.sectoresFijos[0], original);
});
probar("14 normalizar agosto no agrega snapshot", () => {
  assert.equal(Object.hasOwn(normalizarEstadoMensual(crearAgostoLegacy()), "configuracionPlanilla"), false);
});
probar("15 preserva configuración válida ya existente en destino", () => {
  const destino = crearEstadoMensualVacio();
  const existente = crearSnapshotConfiguracionPlanilla({
    turno: "tarde", categoria: "enfermero", mes: "2026-09",
    posicionesMensualesAdicionales: ["T6"]
  });
  existente.filas[0].etiqueta = "ETIQUETA CONSERVADA";
  destino.configuracionPlanilla = { enfermero: existente };
  const resultado = prepararSeptiembre({ destino }).resultado;
  assert.equal(resultado.estado.configuracionPlanilla.enfermero.filas[0].etiqueta, "ETIQUETA CONSERVADA");
  assert.notEqual(resultado.estado.configuracionPlanilla.enfermero, existente);
  assert.ok(resultado.estado.configuracionPlanilla.licenciado);
});

const prepararTransicionV2 = ({ prioridad = prioridadLicenciadosV2, fijas, sinAdicional = false } = {}) =>
  prepararSeptiembre({
    configurarOrigen: (origen) => {
      const explora = filasLicenciados.indexOf("Explora");
      const reanimacion = filasLicenciados.indexOf("Reanimación + Sillones");
      assert.ok(explora >= 0);
      assert.ok(reanimacion >= 0);
      origen.licencias = [{ personaId: `lic-${explora}`, desde: "2026-09-02", hasta: "2026-09-03" }];
      origen.certificaciones = [{ personaId: `lic-${reanimacion}`, desde: "2026-09-04", hasta: "2026-09-04" }];
      if (!sinAdicional) {
        const adicional = { id: "lic-t3-adicional", nombre: "T3 adicional", categoria: "licenciado", turno: "tarde" };
        origen.personal.push(adicional);
        origen.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
        origen.planillas.licenciados.semana5.T3 = { personaId: adicional.id, nombre: adicional.nombre };
      }
    },
    configuracionLicenciadosV2: {
      estructuraLicenciadosVersion: 2,
      filas: filasLicenciadosV2,
      prioridadCoberturaSectorIds: prioridad,
      ...(fijas !== undefined ? { asignacionesFijas: fijas } : {})
    }
  });

probar("16 transición explícita crea snapshot y semana1 Licenciados v2", () => {
  const preparado = prepararTransicionV2();
  assert.equal(preparado.resultado.ok, true, preparado.resultado.mensaje);
  const snapshot = preparado.resultado.estado.configuracionPlanilla.licenciado;
  const planilla = preparado.resultado.estado.planillas.licenciados;
  assert.equal(snapshot.estructuraLicenciadosVersion, 2);
  assert.equal(snapshot.filas.length, 12);
  assert.deepEqual(snapshot.prioridadCoberturaSectorIds, prioridadLicenciadosV2);
  assert.equal(snapshot.filas.some((fila) => fila.sectorId === "explora"), false);
  assert.equal(snapshot.filas.some((fila) => fila.sectorId === "reanimacion_sillones"), false);
  assert.equal(snapshot.filas.filter((fila) => fila.turnanteId === "turnante_3").length, 1);
  assert.equal(snapshot.filas.some((fila) => fila.turnanteId === "turnante_4"), false);
  assert.equal(planilla.semana1.T3.personaId, `lic-${filasLicenciados.indexOf("Explora")}`);
  assert.equal(planilla.semana1.T4.personaId, "lic-t3-adicional");
  assert.deepEqual(planilla.posicionesMensualesAdicionales, ["T4"]);
  assert.equal(planilla.semana1["Reanimación"], "");
  for (const clave of ["Explora", "Reanimación + Sillones", "Diagnóstico + Explora"])
    assert.equal(Object.hasOwn(planilla.semana1, clave), false);
  for (let semana = 2; semana <= 6; semana += 1)
    assert.deepEqual(planilla[`semana${semana}`], {});
  const personaReanimacionId = `lic-${filasLicenciados.indexOf("Reanimación + Sillones")}`;
  assert.equal(preparado.resultado.estado.personal.some(({ id }) => id === personaReanimacionId), true);
  assert.equal(preparado.resultado.transicionLicenciadosV2.personasSinAsignar.some(({ id }) => id === personaReanimacionId), true);
  assert.deepEqual(
    preparado.resultado.estado.licencias.map(({ personaId, desde, hasta }) => ({ personaId, desde, hasta })),
    preparado.analisis.licencias
  );
  assert.deepEqual(
    preparado.resultado.estado.certificaciones.map(({ personaId, desde, hasta }) => ({ personaId, desde, hasta })),
    preparado.analisis.certificaciones
  );
});

probar("17 transición sin T3 adicional conserva T3 base y no crea T4", () => {
  const preparado = prepararTransicionV2({ sinAdicional: true });
  const planilla = preparado.resultado.estado.planillas.licenciados;
  assert.equal(Object.hasOwn(planilla.semana1, "T3"), true);
  assert.equal(Object.hasOwn(planilla.semana1, "T4"), false);
  assert.equal(planilla.posicionesMensualesAdicionales, undefined);
});

probar("18 transición requiere prioridad v2 válida", () => {
  for (const prioridad of [
    [],
    prioridadLicenciadosV2.filter((id) => id !== "sillones"),
    prioridadLicenciadosV2.filter((id) => id !== "explora")
  ]) {
    const resultado = prepararTransicionV2({ prioridad }).resultado;
    assert.equal(resultado.ok, false);
    assert.equal(resultado.codigo, "CONFIGURACION_DESTINO_LICENCIADOS_V2_INVALIDA");
  }
});

probar("19 fijas incompatibles bloquean y selección revisada conserva Diagnóstico", () => {
  const fijaDiagnostico = { sectorId: "diagnostico", personaId: "lic-7" };
  const incompatibles = [
    fijaDiagnostico,
    { sectorId: "explora", personaId: "lic-5" },
    { sectorId: "reanimacion_sillones", personaId: "lic-3" }
  ];
  const bloqueada = prepararTransicionV2({ fijas: incompatibles }).resultado;
  assert.equal(bloqueada.ok, false);
  assert.equal(bloqueada.codigo, "ASIGNACIONES_FIJAS_LICENCIADOS_V2_REQUIEREN_REVISION");
  assert.equal(bloqueada.transicionLicenciadosV2.asignacionesFijasIncompatibles.length, 2);
  const revisada = prepararTransicionV2({ fijas: [fijaDiagnostico] }).resultado;
  assert.equal(revisada.ok, true);
  assert.deepEqual(revisada.estado.configuracionPlanilla.licenciado.asignacionesFijas, [fijaDiagnostico]);
  assert.equal(revisada.estado.configuracionPlanilla.licenciado.asignacionesFijas.some(({ sectorId }) =>
    ["explora", "reanimacion_sillones", "turnante_3"].includes(sectorId)), false);
});

probar("20 origen v1 sin configuración v2 bloquea y no muta origen", () => {
  const normal = prepararSeptiembre();
  const antes = clonar(normal.origen);
  const resultado = construirEstadoMesNuevo({ analisis: normal.analisis });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "CONFIGURACION_LICENCIADOS_V2_REQUERIDA");
  assert.deepEqual(normal.origen, antes);
});

probar("21 flujo normal v2 a v2 conserva versión sin ejecutar C7B", () => {
  const origen = crearAgostoLegacy();
  const snapshotV2 = crearSnapshotConfiguracionPlanillaLicenciadosV2({
    turno: "tarde", mes: "2026-08", prioridadCoberturaSectorIds: prioridadLicenciadosV2
  }).snapshot;
  origen.configuracionPlanilla = { licenciado: snapshotV2 };
  const licenciados = personas.filter((persona) => persona.categoria === "licenciado");
  origen.planillas.licenciados.semana5 = Object.fromEntries(snapshotV2.filas.map((fila, indice) => [
    fila.etiqueta,
    { personaId: licenciados[indice].id, nombre: licenciados[indice].nombre }
  ]));
  const personaT4 = { id: "lic-t4", nombre: "T4 vigente", categoria: "licenciado", turno: "tarde" };
  origen.personal.push(personaT4);
  origen.planillas.licenciados.posicionesMensualesAdicionales = ["T4"];
  origen.planillas.licenciados.semana5.T4 = {
    personaId: personaT4.id,
    nombre: personaT4.nombre
  };
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "tarde", mesOrigen: "2026-08", mesDestino: "2026-09",
    estadoOrigen: origen, estadoDestino: crearEstadoMensualVacio()
  });
  assert.equal(analisis.ok, true, analisis.mensaje);
  const resultado = construirEstadoMesNuevo({ analisis });
  assert.equal(resultado.ok, true, resultado.mensaje);
  assert.equal(resultado.estado.configuracionPlanilla.licenciado.estructuraLicenciadosVersion, 2);
  assert.equal(Object.hasOwn(resultado, "transicionLicenciadosV2"), false);
  assert.deepEqual(resultado.estado.planillas.licenciados.posicionesMensualesAdicionales, ["T4"]);
});

probar("22 destino vacío con snapshot Licenciados v1 se bloquea", () => {
  const destino = crearEstadoMensualVacio();
  destino.configuracionPlanilla = {
    licenciado: crearSnapshotConfiguracionPlanilla({
      turno: "tarde", categoria: "licenciado", mes: "2026-09"
    })
  };
  const resultado = prepararSeptiembre({ destino }).resultado;
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "DESTINO_CONFIGURACION_LICENCIADOS_LEGACY");
});

probar("23 destino vacío con snapshot Licenciados v2 válido no se degrada", () => {
  const destino = crearEstadoMensualVacio();
  destino.configuracionPlanilla = {
    licenciado: crearSnapshotConfiguracionPlanillaLicenciadosV2({
      turno: "tarde", mes: "2026-09",
      prioridadCoberturaSectorIds: prioridadLicenciadosV2
    }).snapshot
  };
  const resultado = prepararSeptiembre({ destino }).resultado;
  assert.equal(resultado.ok, true, resultado.mensaje);
  assert.equal(resultado.estado.configuracionPlanilla.licenciado.estructuraLicenciadosVersion, 2);
  assert.equal(resultado.estado.configuracionPlanilla.licenciado.filas.length, 12);
});

console.log(`\nEtapa 34B2: ${total} pruebas de preparación con snapshots aprobadas.`);
