import assert from "node:assert/strict";
import fs from "node:fs";
import { configuracionSectores } from "../src/data/sectores.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import {
  aplicarPrioridadCoberturaParejas,
  PAREJAS_COBERTURA_ENFERMEROS
} from "../src/utils/coberturaParejasEnfermeros.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { TIPOS_EXTRA } from "../src/utils/extrasPersonas.js";

const persona = (id, extras = {}) => ({ id, nombre: `Persona ${id}`, ...extras });
const prioridadEnfermeros = configuracionSectores.enfermero.prioridadSectoresIds;
const donantesEnfermeros = configuracionSectores.enfermero.sectoresDonantesIds;
const calendarioFuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
const filasConfiguracion = crearSnapshotConfiguracionPlanilla({
  turno: "tarde",
  categoria: "enfermero",
  mes: "2026-08"
}).filas.sort((a, b) => a.orden - b.orden);
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const crearEscenario = ({
  renombrar = false,
  disponible = () => true,
  extras = [],
  prioridadSectorIds = prioridadEnfermeros,
  sectorIdsDonantes = donantesEnfermeros,
  ajustarSectores
} = {}) => {
  const explora2 = persona("persona-explora-2");
  const turnante = persona("persona-turnante");
  const personal = [explora2, turnante];
  const asignaciones = prioridadEnfermeros.map((sectorId) => ({
    tipo: "sector",
    sectorId,
    nombre: renombrar ? `Sector ${sectorId}` : sectorId,
    enfermero: sectorId === "explora_2"
      ? explora2
      : ["sillon_2", "rea_2"].includes(sectorId)
        ? null
        : persona(`titular-${sectorId}`)
  }));
  asignaciones.unshift({
    tipo: "turnante",
    turnanteId: "turnante_1",
    nombre: renombrar ? "Apoyo móvil" : "T1",
    enfermero: turnante
  });
  const original = JSON.stringify(asignaciones);
  const personalOriginal = JSON.stringify(personal);
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones,
    extras,
    personal,
    esPersonaDisponible: disponible,
    esPersonaDisponibleParaCobertura: disponible,
    prioridadSectorIds,
    sectorIdsDonantes,
    ajustarSectores
  }).asignaciones;
  return { asignaciones, explora2, original, personal, personalOriginal, resultado, turnante };
};

const resolverEscenarioConfigurado = ({ crearTitular, turnantes = [persona("turnante-configurado")] }) => {
  const asignaciones = filasConfiguracion.map((fila) => {
    const enfermero = fila.tipo === "turnante"
      ? turnantes[fila.ordinalTurnante - 1] || null
      : crearTitular(fila);
    return {
      ...fila,
      nombre: fila.etiqueta,
      enfermero,
      cambioManualProtegido: Boolean(enfermero?.cambioManualProtegido)
    };
  });
  return resolverTurnantesYCoberturasOperativas({
    asignaciones,
    extras: [],
    personal: asignaciones.map((fila) => fila.enfermero).filter(Boolean),
    esPersonaDisponible: () => true,
    esPersonaDisponibleParaCobertura: () => true,
    prioridadSectorIds: prioridadEnfermeros,
    sectorIdsDonantes: donantesEnfermeros,
    ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({ asignaciones: sectores })
  }).asignaciones;
};

probar("caso real: explora_2 cubre sillon_2 antes del Turnante explícito", () => {
  const flujo = crearEscenario();
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "sillon_2")?.enfermero, flujo.explora2);
  assert.equal(flujo.resultado.some((fila) => fila.enfermero === flujo.turnante), true);
});

probar("Salud Mental queda cubierta antes de reponer REA 2 con un Turnante", () => {
  const titularRea2 = persona("titular-rea-2");
  const resultado = resolverEscenarioConfigurado({
    crearTitular: (fila) => {
      if (["rea_1", "salud_mental", "pre_int_2", "sillon_2", "explora_2"].includes(fila.sectorId)) return null;
      if (fila.sectorId === "rea_2") return titularRea2;
      return persona(`titular-${fila.sectorId}`);
    }
  });
  assert.equal(resultado.find((fila) => fila.sectorId === "salud_mental")?.enfermero?.id, "turnante-configurado");
  assert.equal(resultado.find((fila) => fila.sectorId === "rea_2")?.enfermero, null);
  assert.equal(resultado.find((fila) => fila.sectorId === "rea_1")?.enfermero, titularRea2);
});

probar("un Turnante cubre 20-22-24 sin desplazar al titular de Pre Int 2", () => {
  const titularPreInt2 = persona("titular-pre-int-2");
  const resultado = resolverEscenarioConfigurado({
    crearTitular: (fila) => {
      if (fila.sectorId === "boxes_20_22_24") return null;
      if (fila.sectorId === "pre_int_2") return titularPreInt2;
      return {
        ...persona(`titular-${fila.sectorId}`),
        ...(prioridadEnfermeros.indexOf(fila.sectorId) > prioridadEnfermeros.indexOf("pre_int_2")
          ? { cambioManualProtegido: true }
          : {})
      };
    }
  });
  assert.equal(resultado.find((fila) => fila.sectorId === "pre_int_2")?.enfermero, titularPreInt2);
  assert.equal(resultado.find((fila) => fila.sectorId === "boxes_20_22_24")?.enfermero?.id, "turnante-configurado");
});

probar("Salud Mental usa un donante configurado si no queda cobertura directa", () => {
  const titularRea2 = persona("donante-rea-2");
  const resultado = resolverEscenarioConfigurado({
    turnantes: [],
    crearTitular: (fila) => {
      if (fila.sectorId === "salud_mental") return null;
      if (fila.sectorId === "rea_2") return titularRea2;
      return persona(`titular-${fila.sectorId}`);
    }
  });
  assert.equal(resultado.find((fila) => fila.sectorId === "salud_mental")?.enfermero, titularRea2);
  assert.equal(resultado.filter((fila) => fila.enfermero === titularRea2).length, 1);
});

probar("una vacante de reemplazo en REA 2 no consume el Turnante antes que Salud Mental", () => {
  const turnante = persona("turnante-prioridad-sm");
  const asignaciones = filasConfiguracion.map((fila) => ({
    ...fila,
    nombre: fila.etiqueta,
    enfermero: fila.tipo === "turnante"
      ? (fila.ordinalTurnante === 1 ? turnante : null)
      : ["rea_2", "salud_mental"].includes(fila.sectorId)
        ? null
        : persona(`titular-${fila.sectorId}`),
    reemplazo: fila.sectorId === "rea_2"
  }));
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones,
    extras: [],
    personal: [turnante],
    esPersonaDisponible: () => true,
    prioridadSectorIds: prioridadEnfermeros,
    sectorIdsDonantes: donantesEnfermeros,
    ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({ asignaciones: sectores })
  }).asignaciones;
  assert.equal(resultado.find((fila) => fila.sectorId === "salud_mental")?.enfermero, turnante);
  assert.equal(resultado.find((fila) => fila.sectorId === "rea_2")?.enfermero, null);
});

probar("el catálogo de donantes no incluye sectores prioritarios", () => {
  assert.deepEqual(new Set(donantesEnfermeros), new Set(["rea_2", "pre_int_2", "explora_2", "sillon_2"]));
  assert.equal(donantesEnfermeros.includes("salud_mental"), false);
  assert.equal(donantesEnfermeros.includes("boxes_20_22_24"), false);
});

probar("un Turnante sin vacante permanece sin consumir", () => {
  const turnante = persona("turnante-sin-usar");
  const asignaciones = prioridadEnfermeros.map((sectorId) => ({
    tipo: "sector",
    sectorId,
    nombre: sectorId,
    enfermero: persona(`titular-${sectorId}`)
  }));
  asignaciones.unshift({ tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: turnante });
  const resolucion = resolverTurnantesYCoberturasOperativas({
    asignaciones,
    extras: [],
    personal: [turnante],
    esPersonaDisponible: () => true,
    prioridadSectorIds: prioridadEnfermeros,
    sectorIdsDonantes: donantesEnfermeros
  });
  assert.equal(resolucion.asignaciones.some((fila) => fila.enfermero === turnante), false);
  assert.equal([...resolucion.usados].some((clave) => clave.includes("turnante-sin-usar")), false);
});

probar("la persona cedida conserva identidad y aparece una sola vez", () => {
  const flujo = crearEscenario();
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "sillon_2")?.enfermero.id, "persona-explora-2");
  assert.equal(flujo.resultado.filter((fila) => fila.enfermero?.id === "persona-explora-2").length, 1);
});

probar("la resolución diaria no muta Planilla ni Personal", () => {
  const flujo = crearEscenario();
  assert.equal(JSON.stringify(flujo.asignaciones), flujo.original);
  assert.equal(JSON.stringify(flujo.personal), flujo.personalOriginal);
  assert.equal(flujo.personal.some((actual) => actual.id === flujo.explora2.id), true);
});

probar("la prioridad usa sectorId aunque cambien todas las etiquetas", () => {
  const flujo = crearEscenario({ renombrar: true });
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "sillon_2")?.enfermero, flujo.explora2);
});

probar("un Extra externo no desplaza al donante configurado", () => {
  const extra = persona("extra-externo", { tipoExtra: TIPOS_EXTRA.REFUERZO, origenExtra: "externo" });
  const flujo = crearEscenario({ extras: [extra] });
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "sillon_2")?.enfermero, flujo.explora2);
  assert.notEqual(flujo.resultado.find((fila) => fila.sectorId === "sillon_2")?.enfermero, extra);
});

probar("una persona ausente o no disponible no puede ceder cobertura", () => {
  const flujo = crearEscenario({ disponible: (actual) => actual?.id !== "persona-explora-2" });
  assert.equal(flujo.resultado.some((fila) => fila.enfermero?.id === "persona-explora-2"), false);
});

probar("una asignación diaria protegida no se usa como donante", () => {
  const flujo = crearEscenario({
    ajustarSectores: (sectores) => sectores.map((fila) =>
      fila.sectorId === "explora_2" ? { ...fila, cambioManualProtegido: true } : fila
    )
  });
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "explora_2")?.enfermero, flujo.explora2);
});

probar("una vacante manual protegida no se completa automáticamente", () => {
  const flujo = crearEscenario({
    ajustarSectores: (sectores) => sectores.map((fila) =>
      fila.sectorId === "sillon_2" ? { ...fila, vacioManual: true } : fila
    )
  });
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "sillon_2")?.enfermero, null);
});

probar("el flujo histórico sigue protegido por soloLectura y el resolver permanece puro", () => {
  const flujo = crearEscenario();
  assert.equal(JSON.stringify(flujo.asignaciones), flujo.original);
  assert.match(calendarioFuente, /disabled=\{soloLecturaEfectiva\}/);
  assert.match(calendarioFuente, /if \(soloLecturaEfectiva\) return/);
});

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`${pareja.origenSectorId} mantiene prioridad sobre ${pareja.destinoSectorId}`, () => {
    const origen = persona(`persona-${pareja.origenSectorId}`);
    const turnante = persona(`turnante-${pareja.origenSectorId}`);
    const asignaciones = [
      { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: turnante },
      { tipo: "sector", sectorId: pareja.destinoSectorId, nombre: `Destino ${pareja.destinoSectorId}`, enfermero: null },
      { tipo: "sector", sectorId: pareja.origenSectorId, nombre: `Origen ${pareja.origenSectorId}`, enfermero: origen }
    ];
    const resultado = resolverTurnantesYCoberturasOperativas({
      asignaciones,
      extras: [],
      personal: [origen, turnante],
      esPersonaDisponible: () => true,
      prioridadSectorIds: prioridadEnfermeros,
      sectorIdsDonantes: donantesEnfermeros,
      ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({ asignaciones: sectores })
    }).asignaciones;
    assert.equal(resultado.find((fila) => fila.sectorId === pareja.destinoSectorId)?.enfermero, origen);
    assert.equal(resultado.filter((fila) => fila.enfermero === origen).length, 1);
  });
}

const donanteCruzadoPara = (origenSectorId) =>
  [...donantesEnfermeros].reverse().find((sectorId) =>
    sectorId !== origenSectorId &&
    prioridadEnfermeros.indexOf(sectorId) > prioridadEnfermeros.indexOf(origenSectorId)
  ) || donantesEnfermeros.find((sectorId) => sectorId !== origenSectorId);

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`Turnante repone ${pareja.origenSectorId} sin cascada tras promoverlo`, () => {
    const promovido = persona(`promovido-${pareja.origenSectorId}`);
    const turnante = persona(`turnante-${pareja.origenSectorId}`);
    const donanteSectorId = donanteCruzadoPara(pareja.origenSectorId);
    const titularDonante = persona(`titular-${donanteSectorId}`);
    const resultado = resolverTurnantesYCoberturasOperativas({
      asignaciones: [
        { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: turnante },
        { tipo: "sector", sectorId: pareja.destinoSectorId, nombre: pareja.destinoSectorId, enfermero: null },
        { tipo: "sector", sectorId: pareja.origenSectorId, nombre: pareja.origenSectorId, enfermero: promovido },
        { tipo: "sector", sectorId: donanteSectorId, nombre: donanteSectorId, enfermero: titularDonante }
      ],
      extras: [],
      personal: [promovido, turnante, titularDonante],
      esPersonaDisponible: () => true,
      prioridadSectorIds: prioridadEnfermeros,
      sectorIdsDonantes: donantesEnfermeros,
      ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({ asignaciones: sectores })
    }).asignaciones;
    assert.equal(resultado.find((fila) => fila.sectorId === pareja.destinoSectorId)?.enfermero, promovido);
    assert.equal(resultado.find((fila) => fila.sectorId === pareja.origenSectorId)?.enfermero, turnante);
    assert.equal(resultado.find((fila) => fila.sectorId === donanteSectorId)?.enfermero, titularDonante);
    for (const actual of [promovido, turnante, titularDonante]) {
      assert.equal(resultado.filter((fila) => fila.enfermero === actual).length, 1);
    }
  });
}

probar("sin Turnante ni Extra la reposición continúa con un donante válido", () => {
  const pareja = PAREJAS_COBERTURA_ENFERMEROS.find(
    ({ origenSectorId }) => origenSectorId === "sillon_2"
  );
  const promovido = persona("promovido-sillon-2");
  const titularRea2 = persona("titular-rea-2-reposicion");
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      { tipo: "sector", sectorId: pareja.destinoSectorId, nombre: "Sillón 1", enfermero: null },
      { tipo: "sector", sectorId: pareja.origenSectorId, nombre: "Sillón 2", enfermero: promovido },
      { tipo: "sector", sectorId: "rea_2", nombre: "REA 2", enfermero: titularRea2 }
    ],
    extras: [],
    personal: [promovido, titularRea2],
    esPersonaDisponible: () => true,
    prioridadSectorIds: prioridadEnfermeros,
    sectorIdsDonantes: donantesEnfermeros,
    ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({ asignaciones: sectores })
  }).asignaciones;
  assert.equal(resultado.find((fila) => fila.sectorId === "sillon_1")?.enfermero, promovido);
  assert.equal(resultado.find((fila) => fila.sectorId === "sillon_2")?.enfermero, titularRea2);
  assert.equal(resultado.find((fila) => fila.sectorId === "rea_2")?.enfermero, null);
});

probar("un Extra repone directamente el sector 2 antes de mover otro donante", () => {
  const pareja = PAREJAS_COBERTURA_ENFERMEROS.find(
    ({ origenSectorId }) => origenSectorId === "sillon_2"
  );
  const promovido = persona("promovido-sillon-extra");
  const titularRea2 = persona("titular-rea-2-extra");
  const extra = persona("extra-reposicion", {
    tipoExtra: TIPOS_EXTRA.REFUERZO,
    origenExtra: "externo"
  });
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      { tipo: "sector", sectorId: pareja.destinoSectorId, nombre: "Sillón 1", enfermero: null },
      { tipo: "sector", sectorId: pareja.origenSectorId, nombre: "Sillón 2", enfermero: promovido },
      { tipo: "sector", sectorId: "rea_2", nombre: "REA 2", enfermero: titularRea2 }
    ],
    extras: [extra],
    personal: [promovido, titularRea2],
    esPersonaDisponible: () => true,
    prioridadSectorIds: prioridadEnfermeros,
    sectorIdsDonantes: donantesEnfermeros,
    ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({ asignaciones: sectores })
  }).asignaciones;
  assert.equal(resultado.find((fila) => fila.sectorId === "sillon_1")?.enfermero, promovido);
  assert.equal(resultado.find((fila) => fila.sectorId === "sillon_2")?.enfermero, extra);
  assert.equal(resultado.find((fila) => fila.sectorId === "rea_2")?.enfermero, titularRea2);
});

probar("Licenciados conservan el orden vigente cuando no reciben prioridad de Enfermeros", () => {
  const titular = persona("licenciado-explora");
  const turnante = persona("licenciado-turnante");
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      { tipo: "turnante", turnanteId: "turnante_1", nombre: "T1", enfermero: turnante },
      { tipo: "sector", sectorId: "triage_1", nombre: "Triage 1", enfermero: null },
      { tipo: "sector", sectorId: "explora", nombre: "Explora", enfermero: titular }
    ],
    extras: [],
    personal: [titular, turnante],
    esPersonaDisponible: () => true
  }).asignaciones;
  assert.equal(resultado.find((fila) => fila.sectorId === "triage_1")?.enfermero, turnante);
  assert.equal(resultado.find((fila) => fila.sectorId === "explora")?.enfermero, titular);
});

probar("Calendario activa la prioridad previa sólo para Enfermeros fuera de paro", () => {
  assert.match(calendarioFuente, /prioridadSectorIds: tipo === "enfermero" && !esDiaParo/);
  assert.match(calendarioFuente, /sectorIdsDonantes: tipo === "enfermero" && !esDiaParo/);
  assert.match(
    calendarioFuente,
    /else if \(tipo !== "enfermero" && !usarCalendarioLicenciadosDinamico\)/
  );
});

console.log(`\n${total} pruebas de Turnantes y vacantes por sectorId aprobadas.`);
