import assert from "node:assert/strict";
import fs from "node:fs";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva
} from "../src/utils/configuracionPlanilla.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { aplicarPrioridadGeneralPorSectorId } from "../src/utils/prioridadesSectores.js";
import { obtenerPrioridadCoberturaEfectiva } from "../src/utils/prioridadCoberturaMensual.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const persona = (id) => ({ id, nombre: `Persona ${id}` });
const contexto = (turno, categoria) => ({ turno, categoria, mes: "2026-09" });
const crearSnapshot = (turno, categoria, prioridad) => {
  const snapshot = crearSnapshotConfiguracionPlanilla(contexto(turno, categoria));
  if (prioridad !== undefined) snapshot.prioridadCoberturaSectorIds = [...prioridad];
  return snapshot;
};
const obtenerPrioridad = ({ turno, categoria, snapshot }) => {
  const configuracionEfectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual: { configuracionPlanilla: { [categoria]: snapshot } },
    ...contexto(turno, categoria)
  });
  return obtenerPrioridadCoberturaEfectiva({
    prioridadConfigurada: configuracionEfectiva.prioridadCoberturaSectorIds,
    filas: configuracionEfectiva.filas,
    prioridadFallback: configuracionSectores[categoria].prioridadSectoresIds
  }).prioridadSectorIds;
};
const moverAntes = (orden, primero, segundo) => [
  ...orden.filter((sectorId) => ![primero, segundo].includes(sectorId)),
  primero,
  segundo
];
const ordenarDestinosYDonante = (orden, primero, segundo, donante) => [
  ...orden.filter((sectorId) => ![primero, segundo, donante].includes(sectorId)),
  primero,
  segundo,
  donante
];
const resolverEnfermeros = (prioridadSectorIds) => {
  const turnante = persona("turnante-enfermero");
  const asignaciones = [
    { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: turnante },
    { tipo: "sector", sectorId: "rea_2", nombre: "REA 2", enfermero: null },
    { tipo: "sector", sectorId: "explora_2", nombre: "EXPLORA 2", enfermero: null },
    { tipo: "sector", sectorId: "sillon_2", nombre: "SILLÓN 2", enfermero: null }
  ];
  return resolverTurnantesYCoberturasOperativas({
    asignaciones,
    extras: [],
    personal: [turnante],
    esPersonaDisponible: () => true,
    prioridadSectorIds,
    sectorIdsDonantes: configuracionSectores.enfermero.sectoresDonantesIds
  }).asignaciones;
};
const destinoDe = (asignaciones, personaId) =>
  asignaciones.find((fila) => fila.enfermero?.id === personaId)?.sectorId;
const resolverLicenciados = (prioridadSectorIds) => {
  const donante = persona("donante-licenciado");
  return aplicarPrioridadGeneralPorSectorId({
    asignaciones: [
      { tipo: "sector", sectorId: "triage_1", nombre: "Triage renombrado", enfermero: null },
      { tipo: "sector", sectorId: "estabiliza", nombre: "ESTABILIZA", enfermero: null },
      { tipo: "sector", sectorId: "explora", nombre: "Exploración histórica", enfermero: donante }
    ],
    prioridadSectorIds,
    esPersonaDisponible: () => true
  });
};

probar("Calendario calcula la prioridad mensual con el utilitario central", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /obtenerPrioridadCoberturaEfectiva\(\{/);
  assert.match(fuente, /prioridadConfigurada: configuracionEfectiva\?\.prioridadCoberturaSectorIds/);
  assert.match(fuente, /filas: configuracionEfectiva\?\.filas/);
  assert.match(fuente, /prioridadFallback: prioridadSectoresIdsFallback/);
});

probar("mañana prioriza operativamente REA 2 antes que Explora 2", () => {
  const prioridad = ordenarDestinosYDonante(
    configuracionSectores.enfermero.prioridadSectoresIds,
    "rea_2",
    "explora_2",
    "sillon_2"
  );
  const snapshot = crearSnapshot("manana", "enfermero", prioridad);
  const resultado = resolverEnfermeros(obtenerPrioridad({ turno: "manana", categoria: "enfermero", snapshot }));
  assert.equal(destinoDe(resultado, "turnante-enfermero"), "rea_2");
});

probar("tarde prioriza operativamente Explora 2 antes que REA 2", () => {
  const prioridad = ordenarDestinosYDonante(
    configuracionSectores.enfermero.prioridadSectoresIds,
    "explora_2",
    "rea_2",
    "sillon_2"
  );
  const snapshot = crearSnapshot("tarde", "enfermero", prioridad);
  const resultado = resolverEnfermeros(obtenerPrioridad({ turno: "tarde", categoria: "enfermero", snapshot }));
  assert.equal(destinoDe(resultado, "turnante-enfermero"), "explora_2");
});

probar("la misma distribución produce decisiones opuestas según el turno mensual", () => {
  const fallback = configuracionSectores.enfermero.prioridadSectoresIds;
  const manana = obtenerPrioridad({
    turno: "manana", categoria: "enfermero",
    snapshot: crearSnapshot("manana", "enfermero", ordenarDestinosYDonante(fallback, "rea_2", "explora_2", "sillon_2"))
  });
  const tarde = obtenerPrioridad({
    turno: "tarde", categoria: "enfermero",
    snapshot: crearSnapshot("tarde", "enfermero", ordenarDestinosYDonante(fallback, "explora_2", "rea_2", "sillon_2"))
  });
  assert.equal(destinoDe(resolverEnfermeros(manana), "turnante-enfermero"), "rea_2");
  assert.equal(destinoDe(resolverEnfermeros(tarde), "turnante-enfermero"), "explora_2");
});

probar("snapshot legacy conserva una resolución concreta del fallback global", () => {
  const snapshot = crearSnapshot("tarde", "enfermero");
  delete snapshot.prioridadCoberturaSectorIds;
  const prioridad = obtenerPrioridad({ turno: "tarde", categoria: "enfermero", snapshot });
  assert.deepEqual(prioridad, configuracionSectores.enfermero.prioridadSectoresIds);
  const turnante = persona("turnante-legacy");
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: turnante },
      { tipo: "sector", sectorId: "sillon_2", nombre: "SILLÓN 2", enfermero: null },
      { tipo: "sector", sectorId: "explora_2", nombre: "EXPLORA 2", enfermero: null },
      { tipo: "sector", sectorId: "rea_2", nombre: "REA 2", enfermero: null }
    ],
    extras: [], personal: [turnante], esPersonaDisponible: () => true,
    prioridadSectorIds: prioridad,
    sectorIdsDonantes: configuracionSectores.enfermero.sectoresDonantesIds
  }).asignaciones;
  assert.equal(destinoDe(resultado, "turnante-legacy"), "sillon_2");
});

probar("Enfermeros pasa la prioridad efectiva al resolver operativo", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /prioridadSectorIds: tipo === "enfermero" && !esDiaParo\s*\? prioridadCoberturaEfectivaIds/);
});

probar("Licenciados usa su prioridad mensual en su fase existente", () => {
  const fallback = configuracionSectores.licenciado.prioridadSectoresIds;
  const personalizada = ordenarDestinosYDonante(fallback, "estabiliza", "triage_1", "explora");
  const snapshot = crearSnapshot("manana", "licenciado", personalizada);
  const prioridad = obtenerPrioridad({ turno: "manana", categoria: "licenciado", snapshot });
  assert.equal(destinoDe(resolverLicenciados(prioridad), "donante-licenciado"), "estabiliza");
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /prioridadSectorIds: prioridadCoberturaEfectivaIds/);
});

probar("modificar Enfermeros no altera Licenciados", () => {
  const prioridadEnfermeros = moverAntes(
    configuracionSectores.enfermero.prioridadSectoresIds,
    "rea_2",
    "explora_2"
  );
  const snapshotEnfermeros = crearSnapshot("manana", "enfermero", prioridadEnfermeros);
  const snapshotLicenciados = crearSnapshot("manana", "licenciado");
  assert.deepEqual(
    obtenerPrioridad({ turno: "manana", categoria: "licenciado", snapshot: snapshotLicenciados }),
    configuracionSectores.licenciado.prioridadSectoresIds
  );
  assert.notDeepEqual(snapshotEnfermeros.prioridadCoberturaSectorIds, snapshotLicenciados.prioridadCoberturaSectorIds);
});

probar("sector desactivado queda fuera de la prioridad usada por Calendario", () => {
  const snapshot = crearSnapshot("manana", "enfermero");
  snapshot.filas = snapshot.filas.map((fila) =>
    fila.sectorId === "explora_2" ? { ...fila, activo: false } : fila
  );
  assert.equal(
    obtenerPrioridad({ turno: "manana", categoria: "enfermero", snapshot }).includes("explora_2"),
    false
  );
});

probar("renombrar etiquetas no cambia la decisión por sectorId", () => {
  const prioridad = ordenarDestinosYDonante(
    configuracionSectores.enfermero.prioridadSectoresIds,
    "rea_2",
    "explora_2",
    "sillon_2"
  );
  const snapshot = crearSnapshot("manana", "enfermero", prioridad);
  snapshot.filas = snapshot.filas.map((fila) => ({ ...fila, etiqueta: `Renombrado ${fila.sectorId || fila.turnanteId}` }));
  const resultado = resolverEnfermeros(obtenerPrioridad({ turno: "manana", categoria: "enfermero", snapshot }));
  assert.equal(destinoDe(resultado, "turnante-enfermero"), "rea_2");
});

probar("Enfermeros conserva parejas y no configura donantes generales", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /sectorIdsDonantes: tipo === "enfermero" && !esDiaParo\s*\? sectoresDonantesIds/);
  assert.match(fuente, /aplicarPrioridadCoberturaParejas\(\{/);
  assert.doesNotMatch(fuente, /prioridadCoberturaSectorIds.*sectoresDonantesIds/);
  assert.deepEqual(configuracionSectores.enfermero.sectoresDonantesIds, []);
  assert.equal(fs.readFileSync("src/utils/distribucionTurnantesCoberturas.js", "utf8").includes("cedidoAPareja"), true);
});

probar("Paro conserva su rama independiente", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /tipo === "enfermero" && !esDiaParo/);
  assert.match(fuente, /if \(esDiaParo\)/);
});

console.log(`\nEtapa 37C3: ${total} pruebas de prioridad mensual en Calendario aprobadas.`);
