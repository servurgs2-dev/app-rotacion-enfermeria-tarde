import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearSnapshotConfiguracionPlanilla,
  SECTORES_PLANILLA
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { obtenerConfiguracionPlanillaEfectiva } from "../src/utils/configuracionPlanilla.js";
import { crearReferenciaPersona } from "../src/utils/referenciasPersonas.js";
import { VACANTE_OPERATIVA } from "../src/utils/cambiosCalendario.js";
import {
  DESTINOS_SINTETICOS_REANIMACION_SILLONES,
  dividirReanimacionSillones,
  esDestinoSinteticoReanimacionSillones,
  obtenerClaveHistoricaDestinoSintetico,
  resolverDestinoSinteticoReanimacionSillones,
  SECTOR_ID_REANIMACION_SILLONES,
  SYNTHETIC_IDS_REANIMACION_SILLONES
} from "../src/utils/reanimacionSillones.js";

const firma = (valor) => JSON.stringify(valor);
const titular = { id: "titular", nombre: "Persona Titular" };
const sobrante1 = { id: "sobrante-1", nombre: "Persona Sobrante 1" };
const sobrante2 = { id: "sobrante-2", nombre: "Persona Sobrante 2" };
let total = 0;
const probar = (nombre, prueba) => { prueba(); total += 1; console.log(`✓ ${total} ${nombre}`); };

const crearEstado = () => {
  const estado = crearEstadoMensualVacio();
  estado.configuracionPlanilla = {
    licenciado: crearSnapshotConfiguracionPlanilla({
      turno: "tarde", categoria: "licenciado", mes: "2026-09"
    })
  };
  return estado;
};
const contexto = { turno: "tarde", categoria: "licenciado", mes: "2026-09" };
const preparar = ({ estado = crearEstado(), etiqueta, activo = true, orden = null } = {}) => {
  const snapshot = estado.configuracionPlanilla?.licenciado;
  if (snapshot) {
    const fila = snapshot.filas.find((actual) => actual.sectorId === SECTOR_ID_REANIMACION_SILLONES);
    if (etiqueta) fila.etiqueta = etiqueta;
    fila.activo = activo;
    if (orden !== null) {
      snapshot.filas.splice(snapshot.filas.indexOf(fila), 1);
      snapshot.filas.splice(orden, 0, fila);
      snapshot.filas.forEach((actual, indice) => { actual.orden = indice; });
    }
  }
  const configuracion = obtenerConfiguracionPlanillaEfectiva({ estadoMensual: estado, ...contexto });
  const activas = configuracion.filas.filter((fila) => fila.activo !== false).sort((a, b) => a.orden - b.orden);
  const asignaciones = activas.filter((fila) => fila.tipo === "sector").map((fila, indice) => ({
    nombre: fila.etiqueta,
    etiqueta: fila.etiqueta,
    sectorId: fila.sectorId,
    filaId: fila.filaId,
    enfermero: fila.sectorId === SECTOR_ID_REANIMACION_SILLONES
      ? titular
      : { id: `base-${indice}`, nombre: `Base ${indice}` },
    tipo: "sector"
  }));
  return { estado, activas, asignaciones, ordenVisual: activas.map((fila) => fila.etiqueta) };
};
const dividir = ({ sobrantes = [sobrante1], ...opciones } = {}) => {
  const base = preparar(opciones);
  return {
    ...base,
    resultado: dividirReanimacionSillones({
      asignaciones: base.asignaciones,
      sobrantes,
      categoria: "licenciado",
      esDiaParo: false,
      cambiosDia: opciones.cambiosDia || {},
      personalDisponible: [titular, sobrante1, sobrante2, ...base.asignaciones.map((fila) => fila.enfermero)],
      ordenVisual: base.ordenVisual
    })
  };
};

probar("reanimacion_sillones existe como sector real", () => {
  assert.equal(SECTORES_PLANILLA.some((sector) => sector.sectorId === SECTOR_ID_REANIMACION_SILLONES), true);
});
probar("destinos sintéticos tienen syntheticId y no sectorId ni filaId", () => {
  for (const destino of DESTINOS_SINTETICOS_REANIMACION_SILLONES) {
    assert.ok(destino.syntheticId);
    assert.equal(Object.hasOwn(destino, "sectorId"), false);
    assert.equal(Object.hasOwn(destino, "filaId"), false);
  }
});
probar("destinos sintéticos no entran a sectores ni snapshots", () => {
  const ids = new Set(Object.values(SYNTHETIC_IDS_REANIMACION_SILLONES));
  assert.equal(SECTORES_PLANILLA.some((sector) => ids.has(sector.sectorId)), false);
  assert.equal(crearEstado().configuracionPlanilla.licenciado.filas.some((fila) => ids.has(fila.sectorId)), false);
});
probar("fila base se resuelve por sectorId y se divide", () => {
  const { resultado } = dividir();
  assert.equal(resultado.seDivide, true);
  assert.equal(resultado.asignaciones.some((fila) => fila.sectorId === SECTOR_ID_REANIMACION_SILLONES), false);
});
probar("renombrar fila base no rompe división y conserva textos sintéticos", () => {
  const { resultado } = dividir({ etiqueta: "Área crítica combinada" });
  assert.equal(resultado.seDivide, true);
  assert.deepEqual(resultado.asignaciones.filter(esDestinoSinteticoReanimacionSillones).map((fila) => fila.nombre), ["Reanimación", "Sillones"]);
  assert.equal(resultado.ordenVisual.includes("Área crítica combinada"), false);
});
probar("Drag & Drop no cambia titular ni primer sobrante", () => {
  const { resultado } = dividir({ orden: 0 });
  assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION).enfermero, titular);
  assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES).enfermero, sobrante1);
  assert.deepEqual(resultado.ordenVisual.slice(0, 2), ["Reanimación", "Sillones"]);
});
probar("fila inactiva impide división", () => {
  const { resultado } = dividir({ activo: false });
  assert.equal(resultado.seDivide, false);
  assert.equal(resultado.asignaciones.some(esDestinoSinteticoReanimacionSillones), false);
});
probar("sin sobrante no divide", () => assert.equal(dividir({ sobrantes: [] }).resultado.seDivide, false));
probar("con un hueco pendiente no divide", () => {
  const base = preparar(); base.asignaciones[0].enfermero = null;
  assert.equal(dividirReanimacionSillones({ asignaciones: base.asignaciones, sobrantes: [sobrante1], categoria: "licenciado", ordenVisual: base.ordenVisual }).seDivide, false);
});
probar("no divide otra categoría ni día legacy de paro", () => {
  const base = preparar();
  assert.equal(dividirReanimacionSillones({ asignaciones: base.asignaciones, sobrantes: [sobrante1], categoria: "enfermero", ordenVisual: base.ordenVisual }).seDivide, false);
  assert.equal(dividirReanimacionSillones({ asignaciones: base.asignaciones, sobrantes: [sobrante1], categoria: "licenciado", esDiaParo: true, ordenVisual: base.ordenVisual }).seDivide, false);
});
probar("titular, primer sobrante y segundo sobrante conservan destinos", () => {
  const { resultado } = dividir({ sobrantes: [sobrante1, sobrante2] });
  assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION).enfermero, titular);
  assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES).enfermero, sobrante1);
  assert.equal(resultado.asignaciones.find((fila) => fila.nombre === "SIN ASIGNAR").enfermero, sobrante2);
  const ids = resultado.asignaciones.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});
probar("REANIMACION y SILLONES resuelven identidades sintéticas exactas", () => {
  assert.equal(resolverDestinoSinteticoReanimacionSillones("REANIMACION").syntheticId, SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION);
  assert.equal(resolverDestinoSinteticoReanimacionSillones("SILLONES").syntheticId, SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES);
  assert.equal(resolverDestinoSinteticoReanimacionSillones("REANIMACION parcial"), null);
});
probar("syntheticId vuelve a claves históricas sin persistir identidad", () => {
  assert.equal(obtenerClaveHistoricaDestinoSintetico(SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION), "REANIMACION");
  assert.equal(obtenerClaveHistoricaDestinoSintetico(SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES), "SILLONES");
});
probar("cambio manual de Reanimación se respeta sin duplicar", () => {
  const { resultado } = dividir({ cambiosDia: { REANIMACION: crearReferenciaPersona(sobrante1) } });
  assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION).enfermero, sobrante1);
  assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES).enfermero, titular);
});
probar("cambio manual de Sillones se respeta sin duplicar", () => {
  const { resultado } = dividir({ cambiosDia: { SILLONES: crearReferenciaPersona(titular) } });
  assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES).enfermero, titular);
  assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION).enfermero, sobrante1);
});
probar("__EMPTY__ y VACANTE_OPERATIVA no inventan personas ni syntheticId persistido", () => {
  for (const valor of ["__EMPTY__", VACANTE_OPERATIVA]) {
    const { resultado } = dividir({ cambiosDia: { REANIMACION: valor } });
    assert.equal(resultado.asignaciones.find((fila) => fila.syntheticId === SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION).enfermero, titular);
  }
});
probar("fallback legacy divide sin crear snapshot ni mutar estado", () => {
  const estado = crearEstadoMensualVacio(); const antes = firma(estado);
  const config = obtenerConfiguracionPlanillaEfectiva({ estadoMensual: estado, turno: "tarde", categoria: "licenciado", mes: "2026-08" });
  const filas = config.filas.filter((fila) => fila.tipo === "sector").map((fila, indice) => ({ ...fila, nombre: fila.etiqueta, enfermero: fila.sectorId === SECTOR_ID_REANIMACION_SILLONES ? titular : { id: `l-${indice}` } }));
  assert.equal(dividirReanimacionSillones({ asignaciones: filas, sobrantes: [sobrante1], categoria: "licenciado", ordenVisual: config.filas.map((fila) => fila.etiqueta) }).seDivide, true);
  assert.equal(firma(estado), antes);
  assert.equal(estado.configuracionPlanilla, undefined);
});
probar("Calendario usa sectorId y syntheticId; paro, opciones y PDF quedan fuera", () => {
  const calendario = fs.readFileSync(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8");
  const helper = fs.readFileSync(new URL("../src/utils/reanimacionSillones.js", import.meta.url), "utf8");
  assert.match(calendario, /dividirReanimacionSillones/);
  assert.match(calendario, /esDestinoSinteticoReanimacionSillones/);
  assert.doesNotMatch(helper, /diasParo|cambiosParoDia|sectoresParo|prioridadesParo|redistribuirCritica|redistribuirPorBoxes|exportPDF/);
});

console.log(`\n${total} pruebas de Reanimación + Sillones por identidades estables pasaron.`);
