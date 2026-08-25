import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva,
  obtenerEtiquetasFilasPlanilla,
  obtenerTurnantesBase
} from "../src/utils/configuracionPlanilla.js";
import { normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import {
  eliminarTurnanteMensual,
  habilitarTurnanteMensual
} from "../src/utils/turnanteMensual.js";

const TURNOS_BASE = Object.freeze({
  enfermero: obtenerTurnantesBase("enfermero").length,
  licenciado: obtenerTurnantesBase("licenciado").length
});
const clavePlanilla = (categoria) => categoria === "enfermero" ? "enfermeros" : "licenciados";
const adicional = (categoria) => categoria === "enfermero" ? "T6" : "T3";
const etiquetas = ({ estado, turno, categoria, mes }) => obtenerEtiquetasFilasPlanilla(
  obtenerConfiguracionPlanillaEfectiva({ estadoMensual: estado, turno, categoria, mes }).filas
);
const crearMes = ({ mes, preparado = false } = {}) => ({
  planillas: { enfermeros: {}, licenciados: {} },
  ...(preparado ? {
    configuracionPlanilla: {
      enfermero: crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "enfermero", mes }),
      licenciado: crearSnapshotConfiguracionPlanilla({ turno: "tarde", categoria: "licenciado", mes })
    }
  } : {})
});
const activar = (estado, categoria) => ({
  ...estado,
  planillas: {
    ...estado.planillas,
    [clavePlanilla(categoria)]: habilitarTurnanteMensual(
      estado.planillas[clavePlanilla(categoria)],
      categoria
    )
  }
});
const desactivar = (estado, categoria) => {
  const resultado = eliminarTurnanteMensual(
    estado.planillas[clavePlanilla(categoria)],
    categoria
  );
  assert.equal(resultado.ok, true);
  return {
    ...estado,
    planillas: { ...estado.planillas, [clavePlanilla(categoria)]: resultado.planilla }
  };
};

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

probar("mes actual legacy conserva activación de T6", () => {
  const estado = activar(crearMes({ mes: "2026-08" }), "enfermero");
  assert.equal(etiquetas({ estado, turno: "tarde", categoria: "enfermero", mes: "2026-08" }).includes("T6"), true);
});

probar("mes preparado puede activar T6 Enfermeros", () => {
  const estado = activar(crearMes({ mes: "2026-09", preparado: true }), "enfermero");
  assert.equal(etiquetas({ estado, turno: "tarde", categoria: "enfermero", mes: "2026-09" }).at(-1), "T6");
});

probar("mes preparado puede activar T3 Licenciados", () => {
  const estado = activar(crearMes({ mes: "2026-09", preparado: true }), "licenciado");
  assert.equal(etiquetas({ estado, turno: "tarde", categoria: "licenciado", mes: "2026-09" }).at(-1), "T3");
});

probar("T6 persiste después de normalizar una recarga", () => {
  const guardado = normalizarEstadoMensual(activar(
    crearMes({ mes: "2026-09", preparado: true }),
    "enfermero"
  ));
  assert.equal(etiquetas({ estado: guardado, turno: "tarde", categoria: "enfermero", mes: "2026-09" }).includes("T6"), true);
});

probar("T3 persiste después de normalizar una recarga", () => {
  const guardado = normalizarEstadoMensual(activar(
    crearMes({ mes: "2026-09", preparado: true }),
    "licenciado"
  ));
  assert.equal(etiquetas({ estado: guardado, turno: "tarde", categoria: "licenciado", mes: "2026-09" }).includes("T3"), true);
});

probar("mes actual y futuro mantienen configuraciones independientes", () => {
  const agosto = activar(crearMes({ mes: "2026-08" }), "enfermero");
  const septiembre = crearMes({ mes: "2026-09", preparado: true });
  assert.equal(etiquetas({ estado: agosto, turno: "tarde", categoria: "enfermero", mes: "2026-08" }).includes("T6"), true);
  assert.equal(etiquetas({ estado: septiembre, turno: "tarde", categoria: "enfermero", mes: "2026-09" }).includes("T6"), false);
});

probar("desactivar en mes preparado no modifica el mes anterior", () => {
  const agosto = activar(crearMes({ mes: "2026-08" }), "licenciado");
  const septiembre = desactivar(activar(
    crearMes({ mes: "2026-09", preparado: true }),
    "licenciado"
  ), "licenciado");
  assert.equal(etiquetas({ estado: agosto, turno: "tarde", categoria: "licenciado", mes: "2026-08" }).includes("T3"), true);
  assert.equal(etiquetas({ estado: septiembre, turno: "tarde", categoria: "licenciado", mes: "2026-09" }).includes("T3"), false);
});

probar("mes preparado con snapshot adicional permite desactivarlo", () => {
  const mes = "2027-01";
  const preparado = crearMes({ mes, preparado: true });
  preparado.planillas.enfermeros.semana1 = {};
  const estadoActivo = activar(preparado, "enfermero");
  estadoActivo.configuracionPlanilla.enfermero = crearSnapshotConfiguracionPlanilla({
    turno: "tarde",
    categoria: "enfermero",
    mes,
    posicionesMensualesAdicionales: ["T6"]
  });
  const estado = desactivar(estadoActivo, "enfermero");
  assert.equal(etiquetas({ estado, turno: "tarde", categoria: "enfermero", mes }).includes("T6"), false);
});

for (const categoria of ["enfermero", "licenciado"]) {
  const etiqueta = adicional(categoria);
  const clave = clavePlanilla(categoria);
  const mes = "2027-03";

  probar(`snapshot ${etiqueta} y marcador ausente conserva el adicional`, () => {
    const estado = crearMes({ mes, preparado: true });
    estado.configuracionPlanilla[categoria] = crearSnapshotConfiguracionPlanilla({
      turno: "tarde",
      categoria,
      mes,
      posicionesMensualesAdicionales: [etiqueta]
    });
    assert.equal(etiquetas({ estado, turno: "tarde", categoria, mes }).includes(etiqueta), true);
  });

  probar(`snapshot ${etiqueta} y desactivación explícita elimina el adicional`, () => {
    const estado = crearMes({ mes, preparado: true });
    estado.configuracionPlanilla[categoria] = crearSnapshotConfiguracionPlanilla({
      turno: "tarde",
      categoria,
      mes,
      posicionesMensualesAdicionales: [etiqueta]
    });
    estado.planillas[clave].posicionesMensualesAdicionales = [];
    assert.equal(etiquetas({ estado, turno: "tarde", categoria, mes }).includes(etiqueta), false);
  });

  probar(`snapshot sin ${etiqueta} y activación explícita agrega el adicional`, () => {
    const estado = crearMes({ mes, preparado: true });
    estado.planillas[clave].posicionesMensualesAdicionales = [etiqueta];
    assert.equal(etiquetas({ estado, turno: "tarde", categoria, mes }).includes(etiqueta), true);
  });

  probar(`snapshot sin ${etiqueta} y marcador ausente permanece sin adicional`, () => {
    const estado = crearMes({ mes, preparado: true });
    assert.equal(etiquetas({ estado, turno: "tarde", categoria, mes }).includes(etiqueta), false);
  });
}

probar("normalizar y recargar conserva ausencia de decisión legacy", () => {
  const mes = "2027-03";
  const estado = crearMes({ mes, preparado: true });
  estado.configuracionPlanilla.enfermero = crearSnapshotConfiguracionPlanilla({
    turno: "tarde",
    categoria: "enfermero",
    mes,
    posicionesMensualesAdicionales: ["T6"]
  });
  const recargado = normalizarEstadoMensual(estado);
  assert.equal(Object.hasOwn(
    recargado.planillas.enfermeros,
    "posicionesMensualesAdicionales"
  ), false);
  assert.equal(etiquetas({
    estado: recargado,
    turno: "tarde",
    categoria: "enfermero",
    mes
  }).includes("T6"), true);
});

probar("normalizar y recargar conserva desactivación explícita", () => {
  const mes = "2027-03";
  const estado = crearMes({ mes, preparado: true });
  estado.configuracionPlanilla.licenciado = crearSnapshotConfiguracionPlanilla({
    turno: "tarde",
    categoria: "licenciado",
    mes,
    posicionesMensualesAdicionales: ["T3"]
  });
  estado.planillas.licenciados.posicionesMensualesAdicionales = [];
  const recargado = normalizarEstadoMensual(estado);
  assert.deepEqual(recargado.planillas.licenciados.posicionesMensualesAdicionales, []);
  assert.equal(etiquetas({
    estado: recargado,
    turno: "tarde",
    categoria: "licenciado",
    mes
  }).includes("T3"), false);
});

probar("un mes futuro genérico reconoce ambos adicionales", () => {
  let estado = crearMes({ mes: "2027-02", preparado: true });
  estado = activar(activar(estado, "enfermero"), "licenciado");
  assert.equal(etiquetas({ estado, turno: "tarde", categoria: "enfermero", mes: "2027-02" }).includes("T6"), true);
  assert.equal(etiquetas({ estado, turno: "tarde", categoria: "licenciado", mes: "2027-02" }).includes("T3"), true);
});

probar("sin adicional conserva cantidad histórica de Turnantes", () => {
  const estado = crearMes({ mes: "2027-02", preparado: true });
  for (const categoria of ["enfermero", "licenciado"]) {
    const filas = obtenerConfiguracionPlanillaEfectiva({ estadoMensual: estado, turno: "tarde", categoria, mes: "2027-02" }).filas;
    assert.equal(filas.filter((fila) => fila.tipo === "turnante").length, TURNOS_BASE[categoria]);
    assert.equal(etiquetas({ estado, turno: "tarde", categoria, mes: "2027-02" }).includes(adicional(categoria)), false);
  }
});

probar("Planilla efectiva recibe el slot adicional sin regenerar snapshot", () => {
  const preparado = crearMes({ mes: "2026-09", preparado: true });
  const firmaSnapshot = JSON.stringify(preparado.configuracionPlanilla);
  const estado = activar(preparado, "enfermero");
  const efectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: estado,
    turno: "tarde",
    categoria: "enfermero",
    mes: "2026-09"
  });
  assert.equal(efectiva.filas.some((fila) => fila.filaId === "enfermero.turnante.6"), true);
  assert.equal(JSON.stringify(preparado.configuracionPlanilla), firmaSnapshot);
});

probar("compatibilidad preserva sectores del mes preparado", () => {
  const preparado = crearMes({ mes: "2026-09", preparado: true });
  const sectoresAntes = preparado.configuracionPlanilla.enfermero.filas
    .filter((fila) => fila.tipo === "sector").map((fila) => fila.filaId);
  const estado = activar(preparado, "enfermero");
  const sectoresDespues = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: estado, turno: "tarde", categoria: "enfermero", mes: "2026-09"
  }).filas.filter((fila) => fila.tipo === "sector").map((fila) => fila.filaId);
  assert.deepEqual(sectoresDespues, sectoresAntes);
});

probar("implementación no hardcodea septiembre", () => {
  const fuente = fs.readFileSync("src/utils/configuracionPlanilla.js", "utf8");
  assert.doesNotMatch(fuente, /2026-09|septiembre/i);
});

console.log(`Turnantes en mes preparado: ${total}/${total} comprobaciones OK.`);
