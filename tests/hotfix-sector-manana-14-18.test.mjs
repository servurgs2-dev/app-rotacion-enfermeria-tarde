import assert from "node:assert/strict";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva
} from "../src/utils/configuracionPlanilla.js";
import { resolverOrganizacionMesPorFecha } from "../src/utils/preparacionesMes.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const fila = (configuracion, sectorId) =>
  configuracion.filas.find((item) => item.sectorId === sectorId);
const crearConfiguracionPersistida = (turno = "manana") => {
  const configuracion = crearSnapshotConfiguracionPlanilla({
    turno,
    categoria: "enfermero",
    mes: "2026-09"
  });
  fila(configuracion, "boxes_14_19").etiqueta = "14-19";
  fila(configuracion, "boxes_20_22_24").etiqueta = "19-20+22-24";
  return configuracion;
};
const efectiva = ({ configuracion, turno = "manana", mes = "2026-09", mesReferencia = "2026-08" }) =>
  obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: {
      configuracionPlanilla: { enfermero: configuracion },
      planillas: { enfermeros: {} }
    },
    turno,
    categoria: "enfermero",
    mes,
    mesReferencia
  });
const categoria = (configuracion) => ({ planilla: {}, configuracion });
const preparacion = (id, desde, hasta) => ({
  id,
  desde,
  hasta,
  origen: "prueba",
  creadaEn: null,
  creadaPor: null,
  categorias: {
    enfermero: categoria(crearConfiguracionPersistida()),
    licenciado: categoria(crearSnapshotConfiguracionPlanilla({
      turno: "manana", categoria: "licenciado", mes: "2026-09"
    }))
  }
});

probar("1 Enfermeros Mañana usa 14-18", () => {
  const resultado = efectiva({ configuracion: crearConfiguracionPersistida() });
  assert.equal(fila(resultado, "boxes_14_19").etiqueta, "14-18");
});

probar("2 el sector siguiente comienza en 19", () => {
  const resultado = efectiva({ configuracion: crearConfiguracionPersistida() });
  assert.equal(fila(resultado, "boxes_20_22_24").etiqueta, "19-20+22-24");
});

probar("3 la configuración efectiva no solapa el 19", () => {
  const resultado = efectiva({ configuracion: crearConfiguracionPersistida() });
  assert.deepEqual([
    fila(resultado, "boxes_14_19").etiqueta,
    fila(resultado, "boxes_20_22_24").etiqueta
  ], ["14-18", "19-20+22-24"]);
});

probar("4 Agosto cerrado conserva su snapshot histórico", () => {
  const configuracion = crearSnapshotConfiguracionPlanilla({
    turno: "manana", categoria: "enfermero", mes: "2026-08"
  });
  fila(configuracion, "boxes_14_19").etiqueta = "14-18";
  const resultado = efectiva({ configuracion, mes: "2026-08", mesReferencia: "2026-09" });
  assert.equal(fila(resultado, "boxes_14_19").etiqueta, "14-18");
});

probar("5 Setiembre corrige la etiqueta antigua sin mutar lo persistido", () => {
  const configuracion = crearConfiguracionPersistida();
  const resultado = efectiva({ configuracion });
  assert.equal(fila(resultado, "boxes_14_19").etiqueta, "14-18");
  assert.equal(fila(configuracion, "boxes_14_19").etiqueta, "14-19");
});

probar("6 un mes nuevo materializa la sectorización de Mañana", () => {
  const configuracion = crearSnapshotConfiguracionPlanilla({
    turno: "manana", categoria: "enfermero", mes: "2026-10"
  });
  assert.deepEqual([
    fila(configuracion, "boxes_14_19").etiqueta,
    fila(configuracion, "boxes_20_22_24").etiqueta
  ], ["14-18", "19-20+22-24"]);
});

probar("7 otros turnos conservan 14-19", () => {
  for (const turno of ["tarde", "vespertino", "noche"]) {
    const configuracion = crearSnapshotConfiguracionPlanilla({
      turno, categoria: "enfermero", mes: "2026-10"
    });
    assert.equal(fila(configuracion, "boxes_14_19").etiqueta, "14-19");
  }
});

probar("8 cada preparación A/B/C entrega la etiqueta correcta por fecha", () => {
  const estado = {
    preparaciones: [
      preparacion("A", "2026-09-01", "2026-09-03"),
      preparacion("B", "2026-09-04", "2026-09-16"),
      preparacion("C", "2026-09-17", "2026-09-30")
    ]
  };
  for (const fecha of ["2026-09-02", "2026-09-10", "2026-09-20"]) {
    const organizacion = resolverOrganizacionMesPorFecha({ estado, mes: "2026-09", fecha });
    assert.equal(organizacion.ok, true);
    const resultado = obtenerConfiguracionPlanillaEfectiva({
      estadoMensual: organizacion,
      turno: "manana",
      categoria: "enfermero",
      mes: "2026-09",
      mesReferencia: "2026-08"
    });
    assert.equal(fila(resultado, "boxes_14_19").etiqueta, "14-18");
  }
});

probar("9 Calendario recibe la configuración efectiva común", () => {
  const resultado = efectiva({ configuracion: crearConfiguracionPersistida() });
  assert.equal(fila(resultado, "boxes_14_19").filaId, "enfermero.sector.boxes_14_19");
  assert.equal(fila(resultado, "boxes_14_19").etiqueta, "14-18");
});

probar("10 Planilla recibe la misma configuración efectiva común", () => {
  const resultado = efectiva({ configuracion: crearConfiguracionPersistida() });
  assert.equal(fila(resultado, "boxes_20_22_24").filaId, "enfermero.sector.boxes_20_22_24");
  assert.equal(fila(resultado, "boxes_20_22_24").etiqueta, "19-20+22-24");
});

console.log(`\nHotfix sector Mañana: ${total} pruebas aprobadas.`);
