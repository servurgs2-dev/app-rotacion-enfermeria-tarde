import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { configuracionSectores } from "../src/data/sectores.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { obtenerSectoresCriticosSinCobertura } from "../src/utils/alertaSectoresCriticos.js";
import { aplicarPrioridadGeneralPorSectorId, obtenerFilasActivasPorSectorIds } from "../src/utils/prioridadesSectores.js";
import {
  obtenerFilaActivaPorSectorId,
  resolverClaveDistribucionParaFila,
  resolverClaveNormalizadaParaFila
} from "../src/utils/resolucionIdentidadesPlanilla.js";
import { aplicarCoberturaLibreSaludMental, obtenerTitularSaludMental, SECTOR_ID_SALUD_MENTAL } from "../src/utils/coberturaSaludMental.js";

const persona = { id: "p1", nombre: "Persona" };
const contexto = { turno: "tarde", mes: "2026-09" };
const crearEstado = (categoria = "enfermero") => {
  const estado = crearEstadoMensualVacio();
  estado.configuracionPlanilla = { [categoria]: crearSnapshotConfiguracionPlanilla({ ...contexto, categoria }) };
  return estado;
};
const firma = JSON.stringify;
let total = 0;
const probar = (nombre, fn) => { fn(); total++; console.log(`✓ ${total} ${nombre}`); };

probar("crítico activo vacío alerta y cubierto no alerta", () => {
  const vacia = [{ tipo: "sector", sectorId: "rea_1", etiqueta: "REA 1", enfermero: null }];
  assert.deepEqual(obtenerSectoresCriticosSinCobertura({ asignaciones: vacia, sectoresCriticosIds: ["rea_1"] }), ["REA 1"]);
  assert.deepEqual(obtenerSectoresCriticosSinCobertura({ asignaciones: [{ ...vacia[0], enfermero: persona }], sectoresCriticosIds: ["rea_1"] }), []);
});
probar("crítico inactivo no se incorpora al catálogo operativo", () => {
  const estado = crearEstado(); const filas = estado.configuracionPlanilla.enfermero.filas;
  filas.find((fila) => fila.sectorId === "rea_1").activo = false;
  const activos = obtenerFilasActivasPorSectorIds(filas, ["rea_1"]);
  assert.deepEqual(activos, []);
  assert.deepEqual(obtenerSectoresCriticosSinCobertura({ asignaciones: activos, sectoresCriticosIds: ["rea_1"] }), []);
});
probar("etiqueta renombrada alerta mostrando etiqueta efectiva", () => {
  const asignaciones = [{ tipo: "sector", sectorId: "rea_1", etiqueta: "Reanimación Principal", enfermero: null }];
  assert.deepEqual(obtenerSectoresCriticosSinCobertura({ asignaciones, sectoresCriticosIds: ["rea_1"] }), ["Reanimación Principal"]);
});
probar("prioridad general usa IDs e ignora orden visual", () => {
  const base = [
    { tipo: "sector", sectorId: "rea_2", etiqueta: "Apoyo", enfermero: persona },
    { tipo: "sector", sectorId: "rea_1", etiqueta: "Principal", enfermero: null }
  ];
  for (const asignaciones of [base, [...base].reverse()]) {
    const resultado = aplicarPrioridadGeneralPorSectorId({ asignaciones, prioridadSectorIds: ["rea_1", "rea_2"] });
    assert.equal(resultado.find((fila) => fila.sectorId === "rea_1").enfermero, persona);
  }
});
probar("prioridad excluye inactivos/inexistentes y no sobrescribe destino", () => {
  const filas = crearEstado().configuracionPlanilla.enfermero.filas;
  filas.find((fila) => fila.sectorId === "rea_2").activo = false;
  assert.deepEqual(obtenerFilasActivasPorSectorIds(filas, ["rea_1", "rea_2", "no_existe"]).map((fila) => fila.sectorId), ["rea_1"]);
  const titular = { id: "titular" };
  const resultado = aplicarPrioridadGeneralPorSectorId({ asignaciones: [
    { sectorId: "rea_1", enfermero: titular }, { sectorId: "rea_2", enfermero: persona }
  ], prioridadSectorIds: ["rea_1", "rea_2"] });
  assert.equal(resultado[0].enfermero, titular); assert.equal(resultado[1].enfermero, persona);
});
for (const categoria of ["enfermero", "licenciado"]) {
  probar(`Salud Mental ${categoria} resuelve salud_mental y alias histórico`, () => {
    const estado = crearEstado(categoria);
    const fila = obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...contexto, categoria, sectorId: SECTOR_ID_SALUD_MENTAL });
    const clave = categoria === "enfermero" ? "SM" : "Salud Mental";
    assert.equal(resolverClaveDistribucionParaFila({ distribucion: { [clave]: persona }, fila }), clave);
    assert.equal(obtenerTitularSaludMental({ planillaSemana: { [clave]: persona }, personal: [persona], fila }).id, "p1");
  });
}
probar("cambio diario normalizado de Salud Mental conserva alias e identidad", () => {
  const estado = crearEstado("licenciado");
  const fila = obtenerFilaActivaPorSectorId({
    estadoMensual: estado,
    ...contexto,
    categoria: "licenciado",
    sectorId: SECTOR_ID_SALUD_MENTAL
  });
  fila.etiqueta = "Área de Salud Mental";
  assert.equal(
    resolverClaveNormalizadaParaFila({ distribucion: { "SALUD MENTAL": persona }, fila }),
    "SALUD MENTAL"
  );
});
probar("Salud Mental renombrada conserva cobertura por ID", () => {
  const asignaciones = [
    { tipo: "sector", sectorId: "salud_mental", etiqueta: "Área de Salud Mental", enfermero: persona },
    { tipo: "sector", sectorId: "rea_1", enfermero: { id: "cobertura" } }
  ];
  const cobertura = asignaciones[1].enfermero;
  const resultado = aplicarCoberturaLibreSaludMental({ asignaciones, titular: persona, cobertura,
    titularLibre: true, coberturaDisponible: true, existeCambioManual: false });
  assert.equal(resultado[0].enfermero, cobertura); assert.equal(resultado[1].enfermero, null);
});
probar("Salud Mental inactiva no aplica", () => {
  const estado = crearEstado(); estado.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === "salud_mental").activo = false;
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...contexto, categoria: "enfermero", sectorId: "salud_mental" }), null);
  assert.equal(aplicarCoberturaLibreSaludMental({ asignaciones: [], titular: persona, cobertura: { id: "c" }, titularLibre: true, coberturaDisponible: true }).length, 0);
});
probar("agosto legacy resuelve IDs sin snapshot", () => {
  const estado = crearEstadoMensualVacio(); const antes = firma(estado);
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, turno: "tarde", categoria: "enfermero", mes: "2026-08", sectorId: "salud_mental" }).sectorId, "salud_mental");
  assert.equal(firma(estado), antes); assert.equal(estado.configuracionPlanilla, undefined);
});
probar("helpers son puros y no alteran datos persistidos", () => {
  const estado = crearEstado(); const distribucion = { SM: persona }; const antes = [firma(estado), firma(distribucion), firma(configuracionSectores)];
  const fila = obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...contexto, categoria: "enfermero", sectorId: "salud_mental" });
  resolverClaveDistribucionParaFila({ distribucion, fila });
  assert.deepEqual([firma(estado), firma(distribucion), firma(configuracionSectores)], antes);
  assert.equal(Object.hasOwn(distribucion, "sectorId"), false);
});
probar("contextos de categoría turno y mes permanecen independientes", () => {
  const estado = crearEstado(); estado.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === "rea_1").etiqueta = "Nueva";
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...contexto, categoria: "enfermero", sectorId: "rea_1" }).etiqueta, "Nueva");
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...contexto, turno: "mañana", categoria: "enfermero", sectorId: "rea_1" }).etiqueta, "REA 1");
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...contexto, mes: "2026-10", categoria: "enfermero", sectorId: "rea_1" }).etiqueta, "REA 1");
  assert.equal(obtenerFilaActivaPorSectorId({ estadoMensual: estado, ...contexto, categoria: "licenciado", sectorId: "rea_1" }), null);
});
probar("paro, generación, rotación y parejas quedan fuera", async () => {
  const [calendario, prioridades, parejas] = await Promise.all([
    readFile(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/utils/prioridadesSectores.js", import.meta.url), "utf8"),
    readFile(new URL("../src/utils/coberturaParejasEnfermeros.js", import.meta.url), "utf8")
  ]);
  assert.match(calendario, /prioridadesParo\[sector\]/);
  assert.doesNotMatch(prioridades, /prioridadesParo|redistribucion|rotacion|generacion/iu);
  assert.match(parejas, /origenSectorId/);
});

console.log(`\n${total} pruebas de críticos, prioridades y Salud Mental por IDs superadas.`);
