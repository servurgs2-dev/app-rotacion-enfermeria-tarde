import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla
} from "../src/utils/configuracionPlanilla.js";
import {
  aplicarPrioridadCoberturaParejas,
  PAREJAS_COBERTURA_ENFERMEROS
} from "../src/utils/coberturaParejasEnfermeros.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { configurarTipoExtra, TIPOS_EXTRA } from "../src/utils/extrasPersonas.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";

const contexto = { turno: "tarde", categoria: "enfermero", mes: "2026-09" };
const persona = (id) => ({ id, nombre: id });
const nombres = {
  rea_1: "REA 1", rea_2: "REA 2", explora_1: "EXPLORA 1", explora_2: "EXPLORA 2",
  sillon_1: "SILLÓN 1", sillon_2: "SILLON 2", pre_int_1: "PRE INT 1", pre_int_2: "PRE INT 2"
};
const estado = () => {
  const valor = crearEstadoMensualVacio();
  valor.configuracionPlanilla = { enfermero: crearSnapshotConfiguracionPlanilla({ ...contexto }) };
  return valor;
};
const asignacionesPareja = ({ destinoSectorId, origenSectorId }, etiquetas = nombres) => [
  { nombre: etiquetas[destinoSectorId], enfermero: null, tipo: "sector" },
  { nombre: etiquetas[origenSectorId], enfermero: persona(origenSectorId), tipo: "sector" }
];
const aplicar = (pareja, opciones = {}) => aplicarPrioridadCoberturaParejas({
  asignaciones: asignacionesPareja(pareja, opciones.etiquetas),
  estadoMensual: opciones.estadoMensual ?? estado(), ...contexto, ...opciones
});
let total = 0;
const probar = (nombre, fn) => { fn(); total++; console.log(`✓ ${total} ${nombre}`); };

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`${pareja.origenSectorId} cubre ${pareja.destinoSectorId} por IDs`, () => {
    const resultado = aplicar(pareja);
    assert.equal(resultado[0].enfermero.id, pareja.origenSectorId);
    assert.equal(resultado[1].enfermero, null);
  });
}

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`etiquetas renombradas no rompen ${pareja.destinoSectorId}`, () => {
    const mensual = estado();
    const etiquetas = { ...nombres };
    for (const sectorId of [pareja.destinoSectorId, pareja.origenSectorId]) {
      const nueva = `Nombre nuevo ${sectorId}`;
      mensual.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === sectorId).etiqueta = nueva;
      etiquetas[sectorId] = nombres[sectorId];
    }
    const resultado = aplicar(pareja, { estadoMensual: mensual, etiquetas });
    assert.equal(resultado[0].enfermero.id, pareja.origenSectorId);
  });
}

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`fila inactiva omite ${pareja.origenSectorId} → ${pareja.destinoSectorId}`, () => {
    for (const inactivo of [pareja.origenSectorId, pareja.destinoSectorId]) {
      const mensual = estado();
      mensual.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === inactivo).activo = false;
      const resultado = aplicar(pareja, { estadoMensual: mensual });
      assert.equal(resultado[0].enfermero, null);
      assert.equal(resultado[1].enfermero.id, pareja.origenSectorId);
    }
  });
}

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`orden invertido no altera ${pareja.destinoSectorId}`, () => {
    const mensual = estado();
    mensual.configuracionPlanilla.enfermero.filas.reverse().forEach((fila, orden) => { fila.orden = orden; });
    assert.equal(aplicar(pareja, { estadoMensual: mensual })[0].enfermero.id, pareja.origenSectorId);
  });
}

probar("destino cubierto no se sobrescribe", () => {
  const asignaciones = asignacionesPareja(PAREJAS_COBERTURA_ENFERMEROS[0]);
  asignaciones[0].enfermero = persona("titular");
  const resultado = aplicarPrioridadCoberturaParejas({ asignaciones, estadoMensual: estado(), ...contexto });
  assert.equal(resultado[0].enfermero.id, "titular"); assert.equal(resultado[1].enfermero.id, "rea_2");
});
probar("origen vacío o no disponible no aplica", () => {
  const pareja = PAREJAS_COBERTURA_ENFERMEROS[0]; const asignaciones = asignacionesPareja(pareja);
  asignaciones[1].enfermero = null;
  assert.equal(aplicarPrioridadCoberturaParejas({ asignaciones, estadoMensual: estado(), ...contexto })[0].enfermero, null);
  assert.equal(aplicar(pareja, { esPersonaDisponible: () => false })[0].enfermero, null);
});
probar("cambio manual en cualquiera de ambas filas bloquea", () => {
  const pareja = PAREJAS_COBERTURA_ENFERMEROS[0];
  for (const clave of ["rea 1", "REA 2"]) assert.equal(
    aplicar(pareja, { cambiosDia: { [clave]: "__EMPTY__" } })[0].enfermero, null
  );
});
probar("agosto legacy funciona y no crea snapshot", () => {
  const legacy = crearEstadoMensualVacio(); const antes = JSON.stringify(legacy);
  const resultado = aplicar(PAREJAS_COBERTURA_ENFERMEROS[0], { estadoMensual: legacy, mes: "2026-08" });
  assert.equal(resultado[0].enfermero.id, "rea_2"); assert.equal(JSON.stringify(legacy), antes);
});
probar("Licenciados no recibe las reglas", () => {
  const resultado = aplicarPrioridadCoberturaParejas({
    asignaciones: asignacionesPareja(PAREJAS_COBERTURA_ENFERMEROS[0]),
    estadoMensual: crearEstadoMensualVacio(), turno: "tarde", categoria: "licenciado", mes: "2026-09"
  });
  assert.equal(resultado[0].enfermero, null); assert.equal(resultado[1].enfermero.id, "rea_2");
});
for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`${pareja.origenSectorId} gana al Turnante para cubrir ${pareja.destinoSectorId}`, () => {
    const resultado = resolverTurnantesYCoberturasOperativas({
      asignaciones: [
        { nombre: "T1", enfermero: persona("turnante"), tipo: "turnante" },
        ...asignacionesPareja(pareja).map((fila, indice) =>
          indice === 0 ? { ...fila, reemplazo: true } : fila
        ),
        { nombre: "14-19", enfermero: null, tipo: "sector" }
      ], extras: [], personal: [], esPersonaDisponible: () => true,
      ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({
        asignaciones: sectores, estadoMensual: estado(), ...contexto
      })
    }).asignaciones;
    assert.equal(resultado.find((fila) => fila.nombre === nombres[pareja.destinoSectorId]).enfermero.id,
      pareja.origenSectorId);
    assert.equal(resultado.find((fila) => fila.nombre === nombres[pareja.origenSectorId]).enfermero.id,
      "turnante");
  });
}
probar("la pareja no consume Turnante y el refuerzo precede al Turnante restante", () => {
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      { nombre: "T1", enfermero: persona("turnante-1"), tipo: "turnante" },
      { nombre: "REA 1", enfermero: null, tipo: "sector", reemplazo: true },
      { nombre: "REA 2", enfermero: persona("rea2"), tipo: "sector" },
      { nombre: "EXPLORA 1", enfermero: null, tipo: "sector" },
      { nombre: "EXPLORA 2", enfermero: null, tipo: "sector" }
    ], extras: [{ ...persona("refuerzo"), tipoExtra: TIPOS_EXTRA.REFUERZO }],
    personal: [], esPersonaDisponible: () => true,
    ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({
      asignaciones: sectores, estadoMensual: estado(), ...contexto
    })
  }).asignaciones;
  assert.equal(resultado.find((fila) => fila.nombre === "REA 1").enfermero.id, "rea2");
  assert.equal(resultado.find((fila) => fila.nombre === "REA 2").enfermero.id, "refuerzo");
  assert.equal(resultado.find((fila) => fila.nombre === "EXPLORA 1").enfermero.id, "turnante-1");
  assert.equal(resultado.find((fila) => fila.nombre === "EXPLORA 2").enfermero, null);
});
probar("cobertura directa posterior continúa funcionando", () => {
  const titular = persona("titular");
  const extra = configurarTipoExtra({
    extra: persona("extra"), tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: titular, sectorCubierto: "REA 1", personal: [titular]
  }).extra;
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [{ nombre: "REA 1", enfermero: titular, tipo: "sector" }],
    extras: [extra], personal: [titular], esPersonaDisponible: () => false,
    esPersonaDisponibleParaCobertura: () => true
  }).asignaciones;
  assert.equal(resultado[0].enfermero.id, "extra");
});
probar("no cambia formato persistido ni muta configuración", () => {
  const mensual = estado(); const configAntes = JSON.stringify(mensual);
  const sectoresAntes = JSON.stringify(configuracionSectores);
  const distribucion = { "REA 1": null, "REA 2": persona("rea2") };
  aplicarPrioridadCoberturaParejas({
    asignaciones: Object.entries(distribucion).map(([nombre, enfermero]) => ({ nombre, enfermero, tipo: "sector" })),
    estadoMensual: mensual, ...contexto
  });
  assert.deepEqual(Object.keys(distribucion), ["REA 1", "REA 2"]);
  assert.equal(JSON.stringify(mensual), configAntes);
  assert.equal(JSON.stringify(configuracionSectores), sectoresAntes);
  assert.equal(Object.values(distribucion).some((valor) => valor?.sectorId), false);
});
probar("catálogo no contiene etiquetas como identidad", async () => {
  const fuente = await readFile(new URL("../src/utils/coberturaParejasEnfermeros.js", import.meta.url), "utf8");
  assert.doesNotMatch(fuente, /principal|secundario|"REA 1"|"EXPLORA 1"|"SILL[ÓO]N 1"|"PRE INT 1"/);
  assert.match(fuente, /resolverAsignacionPorSectorId/);
});

console.log(`\n${total} pruebas de prioridades por sectorId superadas.`);
