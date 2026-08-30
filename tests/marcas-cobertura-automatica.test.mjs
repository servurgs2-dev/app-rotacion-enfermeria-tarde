import assert from "node:assert/strict";
import fs from "node:fs";
import { aplicarPrioridadCoberturaParejas } from "../src/utils/coberturaParejasEnfermeros.js";
import { aplicarPrioridadGeneralPorSectorId } from "../src/utils/prioridadesSectores.js";
import {
  aplicarProcedenciaCoberturaAutomaticaPersistida,
  obtenerMarcaOrigenCoberturaAutomatica,
  obtenerNombreAsignacionCalendario,
  obtenerProcedenciasCoberturaAutomaticaActivas
} from "../src/utils/procedenciaCoberturaAutomatica.js";
import { prepararFilasCalendarioPDF } from "../src/utils/exportPDF.js";
import { crearEstadoMensualVacio, normalizarEstadoMensual } from "../src/utils/estadoMensual.js";

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const persona = (id, extras = {}) => ({ id, nombre: `Persona ${id}`, categoria: "enfermero", ...extras });
const fila = (sectorId, enfermero = null) => ({
  nombre: sectorId, etiqueta: sectorId, sectorId, tipo: "sector", enfermero
});

const cubrirPorPareja = (origenSectorId, destinoSectorId) => {
  const titular = persona(origenSectorId);
  return aplicarPrioridadCoberturaParejas({
    asignaciones: [fila(destinoSectorId), fila(origenSectorId, titular)],
    categoria: "enfermero",
    esPersonaDisponible: () => true
  });
};

const cubrirPorPrioridad = (origenSectorId) => {
  const titular = persona(origenSectorId);
  return aplicarPrioridadGeneralPorSectorId({
    asignaciones: [fila("destino_prioritario"), fila(origenSectorId, titular)],
    prioridadSectorIds: ["destino_prioritario", origenSectorId],
    donanteSectorIds: [origenSectorId]
  });
};

for (const [sectorId, destinoSectorId, marca] of [
  ["rea_2", "rea_1", "RT"],
  ["explora_2", "explora_1", "ET"],
  ["sillon_2", "sillon_1", "ST"]
]) {
  probar(`${sectorId} permanece en origen sin ${marca}`, () => {
    const asignacion = fila(sectorId, persona(sectorId));
    assert.equal(obtenerMarcaOrigenCoberturaAutomatica(asignacion), null);
    assert.equal(obtenerNombreAsignacionCalendario(asignacion), `Persona ${sectorId}`);
  });
  probar(`${sectorId} cedido por pareja recibe ${marca} una sola vez`, () => {
    const resultado = cubrirPorPareja(sectorId, destinoSectorId);
    const destino = resultado.find((item) => item.sectorId === destinoSectorId);
    const origen = resultado.find((item) => item.sectorId === sectorId);
    assert.equal(destino.origenCoberturaAutomaticaSectorId, sectorId);
    assert.equal(obtenerNombreAsignacionCalendario(destino), `Persona ${sectorId} (${marca})`);
    assert.equal(origen.enfermero, null);
    assert.equal(resultado.filter((item) => item.enfermero?.id === sectorId).length, 1);
  });
  probar(`${sectorId} cedido por prioridad general recibe ${marca}`, () => {
    const resultado = cubrirPorPrioridad(sectorId);
    const destino = resultado.find((item) => item.sectorId === "destino_prioritario");
    assert.equal(destino.origenCoberturaAutomaticaSectorId, sectorId);
    assert.equal(obtenerNombreAsignacionCalendario(destino), `Persona ${sectorId} (${marca})`);
  });
}

probar("PRE INT 2 cedido no obtiene marca visual", () => {
  const destino = cubrirPorPrioridad("pre_int_2")[0];
  assert.equal(destino.origenCoberturaAutomaticaSectorId, "pre_int_2");
  assert.equal(obtenerMarcaOrigenCoberturaAutomatica(destino), null);
  assert.equal(obtenerNombreAsignacionCalendario(destino), "Persona pre_int_2");
});

probar("Turnante que repone origen conserva sólo T", () => {
  const asignacion = {
    ...fila("rea_2", persona("turnante", { esTurnante: true })),
    origenCoberturaAutomaticaSectorId: "rea_2"
  };
  assert.equal(obtenerNombreAsignacionCalendario(asignacion), "Persona turnante (T)");
});

probar("Extra que repone origen conserva sólo E", () => {
  const asignacion = {
    ...fila("rea_2", persona("extra", { esExtra: true })),
    origenCoberturaAutomaticaSectorId: "rea_2"
  };
  assert.equal(obtenerNombreAsignacionCalendario(asignacion), "Persona extra (E)");
});

for (const [sectorId, marca] of [["rea_2", "RT"], ["explora_2", "ET"], ["sillon_2", "ST"]]) {
  probar(`movimiento posterior conserva ${marca} por personaId`, () => {
    const original = { ...fila("destino_a", persona(sectorId)), origenCoberturaAutomaticaSectorId: sectorId };
    const mapa = obtenerProcedenciasCoberturaAutomaticaActivas([original]);
    const reconstruida = aplicarProcedenciaCoberturaAutomaticaPersistida({
      asignaciones: [fila("destino_b", persona(sectorId))],
      procedenciasPorPersonaId: mapa,
      cambiosDia: { destino_b: { personaId: sectorId } }
    });
    assert.equal(obtenerNombreAsignacionCalendario(reconstruida[0]), `Persona ${sectorId} (${marca})`);
  });
}

probar("movimiento manual ordinario desde REA 2 no fabrica RT", () => {
  const reconstruida = aplicarProcedenciaCoberturaAutomaticaPersistida({
    asignaciones: [fila("otro_destino", persona("manual"))],
    procedenciasPorPersonaId: {}
  });
  assert.equal(obtenerNombreAsignacionCalendario(reconstruida[0]), "Persona manual");
});

for (const [sectorId, marca] of [["rea_2", "RT"], ["explora_2", "ET"], ["sillon_2", "ST"]]) {
  probar(`${marca} persistido desaparece al volver a ${sectorId}`, () => {
    const reconstruida = aplicarProcedenciaCoberturaAutomaticaPersistida({
      asignaciones: [fila(sectorId, persona(sectorId))],
      procedenciasPorPersonaId: { [sectorId]: sectorId },
      cambiosDia: { [sectorId]: { personaId: sectorId } }
    });
    assert.equal(obtenerNombreAsignacionCalendario(reconstruida[0]), `Persona ${sectorId}`);
    assert.equal(reconstruida[0].origenCoberturaAutomaticaSectorId, undefined);
  });
}

probar("movimiento revertido sin override pierde la marca persistida", () => {
  const reconstruida = aplicarProcedenciaCoberturaAutomaticaPersistida({
    asignaciones: [fila("otro_destino", persona("revertido"))],
    procedenciasPorPersonaId: { revertido: "rea_2" },
    cambiosDia: {}
  });
  assert.equal(obtenerNombreAsignacionCalendario(reconstruida[0]), "Persona revertido");
});

probar("procedencia actual del pipeline prevalece aunque no haya movimiento persistido", () => {
  const actual = {
    ...fila("rea_1", persona("actual")),
    origenCoberturaAutomaticaSectorId: "rea_2"
  };
  const reconstruida = aplicarProcedenciaCoberturaAutomaticaPersistida({
    asignaciones: [actual],
    procedenciasPorPersonaId: {},
    cambiosDia: {}
  });
  assert.equal(obtenerNombreAsignacionCalendario(reconstruida[0]), "Persona actual (RT)");
});

probar("persona ausente o No disponible no deja marca huérfana", () => {
  const resultado = aplicarProcedenciaCoberturaAutomaticaPersistida({
    asignaciones: [fila("rea_1", null)],
    procedenciasPorPersonaId: { ausente: "rea_2" }
  });
  assert.equal(resultado[0].enfermero, null);
  assert.equal(obtenerMarcaOrigenCoberturaAutomatica(resultado[0]), null);
});

for (const [sectorId, marca] of [["rea_2", "RT"], ["explora_2", "ET"], ["sillon_2", "ST"]]) {
  probar(`PDF diario presenta ${marca} desde la asignación final`, () => {
    const asignacion = { ...fila("destino", persona(sectorId)), origenCoberturaAutomaticaSectorId: sectorId };
    assert.equal(prepararFilasCalendarioPDF([asignacion])[0][1], `PERSONA ${sectorId.toUpperCase()} (${marca})`);
  });
}

probar("los nombres reales permanecen intactos", () => {
  const titular = persona("intacto");
  const asignacion = { ...fila("rea_1", titular), origenCoberturaAutomaticaSectorId: "rea_2" };
  obtenerNombreAsignacionCalendario(asignacion);
  prepararFilasCalendarioPDF([asignacion]);
  assert.equal(titular.nombre, "Persona intacto");
});

probar("Planilla mensual y Licenciados no consumen marcas operativas", () => {
  const planilla = fs.readFileSync("src/components/planilla/PlanillaMensual.jsx", "utf8");
  const configuracionLicenciados = fs.readFileSync("src/utils/estructuraLicenciadosDinamica.js", "utf8");
  assert.doesNotMatch(planilla, /origenCoberturaAutomaticaSectorId|obtenerNombreAsignacionCalendario/);
  assert.doesNotMatch(configuracionLicenciados, /origenCoberturaAutomaticaSectorId/);
});

probar("Calendario persiste procedencia diaria separada y PDF usa el helper común", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const pdf = fs.readFileSync("src/utils/exportPDF.js", "utf8");
  assert.match(calendario, /procedenciaCoberturaAutomaticaDia/);
  assert.match(calendario, /obtenerProcedenciasCoberturaAutomaticaActivas/);
  assert.match(pdf, /obtenerNombreAsignacionCalendario\(item\)/);
});

probar("la persistencia diaria sobrevive JSON/F5 por personaId", () => {
  const estado = crearEstadoMensualVacio();
  estado.calendario.enfermeros.procedenciaCoberturaAutomaticaDia = {
    "2026-08-29": { "persona-rea": "rea_2" }
  };
  const rehidratado = normalizarEstadoMensual(JSON.parse(JSON.stringify(estado)));
  assert.deepEqual(
    rehidratado.calendario.enfermeros.procedenciaCoberturaAutomaticaDia,
    estado.calendario.enfermeros.procedenciaCoberturaAutomaticaDia
  );
});

console.log(`\n${total} pruebas de marcas RT/ET/ST aprobadas.`);
