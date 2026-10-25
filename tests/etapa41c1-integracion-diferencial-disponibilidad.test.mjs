import assert from "node:assert/strict";
import fs from "node:fs";
import {
  compararDisponibilidadCalendario,
  prepararContextoOperativoDisponibilidad
} from "../src/utils/comparacionDisponibilidadCalendario.js";

const FECHA = "2026-10-24";
const persona = {
  id: "p-1",
  nombre: "Ana",
  categoria: "enfermero",
  turno: "tarde",
  horario: "normal"
};
const contextoOperativo = prepararContextoOperativoDisponibilidad({
  noDisponiblesDiaTurno: [],
  asistenciaDia: {},
  libresTurno: [],
  extrasDiaTurno: []
});
const contextoAdministrativo = {
  personal: [persona],
  fecha: FECHA,
  turnoConsultado: "tarde",
  padronVigencias: [],
  novedadesModernas: [],
  licenciasLegacy: [],
  certificacionesLegacy: [],
  cambiosHorario: []
};
const comparar = (cambios = {}) => compararDisponibilidadCalendario({
  personas: [persona],
  contextoOperativo,
  contextoAdministrativo,
  esPersonaDisponibleActual: () => true,
  esPersonaDisponibleParaCoberturaActual: () => true,
  ...cambios
});

let aprobadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  aprobadas += 1;
  console.log(`OK ${nombre}`);
};

probar("1 prepara una sola estructura con las cuatro colecciones operativas", () => {
  assert.deepEqual(Object.keys(contextoOperativo).sort(), [
    "asistenciaDia",
    "extrasDiaTurno",
    "libresTurno",
    "noDisponiblesDiaTurno"
  ]);
});

probar("2 construye un mapa normalizado por personaId", () => {
  const resultado = comparar();
  assert.equal(resultado.disponibilidadNormalizadaPorPersonaId.size, 1);
  assert.equal(resultado.disponibilidadNormalizadaPorPersonaId.get(persona.id).personaId, persona.id);
});

probar("3 disponibilidad actual y normalizada coinciden en el caso normal", () => {
  assert.deepEqual(comparar().diferencias, []);
});

probar("4 cobertura actual y normalizada coinciden en el caso normal", () => {
  const resultado = comparar();
  assert.equal(
    resultado.disponibilidadNormalizadaPorPersonaId.get(persona.id).disponibleParaCobertura,
    true
  );
  assert.deepEqual(resultado.diferencias, []);
});

probar("5 una diferencia queda representada sin alterar el resultado normalizado", () => {
  const resultado = comparar({ esPersonaDisponibleActual: () => false });
  assert.deepEqual(resultado.diferencias, [{
    personaId: persona.id,
    campo: "disponibleEnTurno",
    actual: false,
    normalizado: true
  }]);
  assert.equal(resultado.disponibilidadNormalizadaPorPersonaId.get(persona.id).disponibleEnTurno, true);
});

probar("6 Cambio con otro turno conserva ambos predicados diferenciados", () => {
  const extra = {
    id: "extra-1",
    nombre: "Extra",
    categoria: "enfermero",
    tipoExtra: "cobertura",
    personaCubiertaId: persona.id
  };
  const resultado = compararDisponibilidadCalendario({
    personas: [persona],
    contextoOperativo: prepararContextoOperativoDisponibilidad({
      noDisponiblesDiaTurno: [{
        personaId: persona.id,
        nombre: persona.nombre,
        motivo: "cambio_otro_turno",
        personaCoberturaId: extra.id
      }],
      extrasDiaTurno: [extra]
    }),
    contextoAdministrativo,
    esPersonaDisponibleActual: () => false,
    esPersonaDisponibleParaCoberturaActual: () => true
  });
  assert.deepEqual(resultado.diferencias, []);
});

probar("7 una indisponibilidad equivalente coincide y conserva causas", () => {
  const resultado = compararDisponibilidadCalendario({
    personas: [persona],
    contextoOperativo: prepararContextoOperativoDisponibilidad({
      noDisponiblesDiaTurno: [{ personaId: persona.id, motivo: "pap" }]
    }),
    contextoAdministrativo,
    esPersonaDisponibleActual: () => false,
    esPersonaDisponibleParaCoberturaActual: () => false
  });
  assert.deepEqual(resultado.diferencias, []);
  assert.equal(
    resultado.disponibilidadNormalizadaPorPersonaId.get(persona.id).causasBloqueantes[0].codigo,
    "pap"
  );
});

probar("8 un snapshot cerrado omite comparación viva sin reemplazar el mapa", () => {
  const resultado = comparar({
    comparar: false,
    esPersonaDisponibleActual: () => false,
    esPersonaDisponibleParaCoberturaActual: () => false
  });
  assert.equal(resultado.comparacionOmitida, true);
  assert.deepEqual(resultado.diferencias, []);
  assert.equal(resultado.disponibilidadNormalizadaPorPersonaId.size, 1);
});

const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);

probar("9 Calendario usa la integración paralela y conserva predicados productivos", () => {
  assert.match(calendarioFuente, /compararDisponibilidadCalendario/);
  assert.match(calendarioFuente, /resolverDistribucionDiaria\(\{[\s\S]*?esPersonaDisponible:\s*\(persona\)\s*=>\s*!estaAusente\(persona\)/);
  assert.match(calendarioFuente, /esPersonaDisponibleParaCobertura:\s*puedeAplicarseCoberturaDirecta/);
  assert.doesNotMatch(calendarioFuente, /disponibilidadNormalizadaPorPersonaId\.get[\s\S]*?resolverDistribucionDiaria/);
});

probar("10 Paro y las fronteras 40H no dependen del diagnóstico", () => {
  assert.doesNotMatch(calendarioFuente, /cambiosParoDia|sectoresParo|prioridadesParo/);
  for (const archivo of [
    "../src/utils/resolverDistribucionDiaria.js",
    "../src/utils/resolverDistribucionLicenciadosLegacy.js",
    "../src/utils/redistribucionEnfermeros.js"
  ]) {
    const fuente = fs.readFileSync(new URL(archivo, import.meta.url), "utf8");
    assert.doesNotMatch(fuente, /comparacionDisponibilidadCalendario|resolverDisponibilidadPersonalPorFecha/);
  }
});

probar("11 el mapa y el diagnóstico no tienen consumidores productivos", () => {
  assert.doesNotMatch(calendarioFuente, /disponibilidadNormalizadaPorPersonaId/);
  assert.equal((calendarioFuente.match(/diagnosticoDisponibilidad/g) || []).length, 2);
  assert.match(calendarioFuente, /void diagnosticoDisponibilidad/);
  assert.doesNotMatch(calendarioFuente, /setDiagnosticoDisponibilidad|useState\([^)]*diagnostico/i);
});

probar("12 los libres del diagnóstico no sustituyen la colección productiva", () => {
  assert.equal((calendarioFuente.match(/libresTurnoDiagnostico/g) || []).length, 2);
  assert.match(calendarioFuente, /const libres = personalFiltrado\.filter/);
  assert.doesNotMatch(calendarioFuente, /const libres\s*=\s*libresTurnoDiagnostico/);
});

probar("13 la comparación usa los mismos predicados entregados a los motores", () => {
  assert.match(
    calendarioFuente,
    /esPersonaDisponibleActual:\s*\(persona\)\s*=>\s*!estaAusente\(persona\)/
  );
  assert.match(
    calendarioFuente,
    /esPersonaDisponibleParaCoberturaActual:\s*puedeAplicarseCoberturaDirecta/
  );
  assert.ok(
    (calendarioFuente.match(/esPersonaDisponible:\s*\(persona\)\s*=>\s*!estaAusente\(persona\)/g) || []).length >= 3
  );
  assert.ok(
    (calendarioFuente.match(/esPersonaDisponibleParaCobertura:\s*puedeAplicarseCoberturaDirecta/g) || []).length >= 3
  );
});

const casosEquivalentes = [
  ["persona de otro turno", {
    contextoAdministrativo: { ...contextoAdministrativo, turnoConsultado: "manana" },
    disponible: false,
    cobertura: false
  }],
  ["vigencia activa", {
    contextoAdministrativo: {
      ...contextoAdministrativo,
      turnoConsultado: "manana",
      padronVigencias: [{
        personaId: persona.id,
        mes: "2026-10",
        turno: "manana",
        desde: "2026-10-01",
        hasta: "2026-10-31"
      }]
    },
    disponible: true,
    cobertura: true
  }],
  ...["licencia", "certificacion", "suspension", "adhesion_paro"].map((tipo) => [
    tipo,
    {
      contextoAdministrativo: {
        ...contextoAdministrativo,
        novedadesModernas: [{
          id: `n-${tipo}`,
          personaId: persona.id,
          tipo,
          fechaDesde: FECHA,
          fechaHasta: FECHA,
          turno: "tarde",
          afectaDisponibilidad: true,
          estado: "activa"
        }]
      },
      disponible: false,
      cobertura: false
    }
  ]),
  ...[
    "adhesion_paro",
    "falta_sin_aviso",
    "supervision_autorizo_inasistencia",
    "donacion_sangre",
    "pap",
    "mamografia",
    "libre_feriado",
    "otro",
    "supervision_solicito_otro_turno"
  ].map((motivo) => [
    `No Disponible ${motivo}`,
    {
      contextoOperativo: prepararContextoOperativoDisponibilidad({
        noDisponiblesDiaTurno: [{ personaId: persona.id, motivo }]
      }),
      disponible: false,
      cobertura: false
    }
  ]),
  ["certificación rápida", {
    contextoAdministrativo: {
      ...contextoAdministrativo,
      certificacionesLegacy: [{
        id: "cert-rapida",
        origen: "no_disponibles_dia",
        personaId: persona.id,
        desde: FECHA,
        hasta: FECHA
      }]
    },
    disponible: false,
    cobertura: false
  }],
  ["Ausente de asistencia", {
    contextoOperativo: prepararContextoOperativoDisponibilidad({
      asistenciaDia: { "id:p-1": "ausente" }
    }),
    disponible: false,
    cobertura: false
  }],
  ...["presente", "pendiente"].map((estado) => [
    `asistencia ${estado}`,
    {
      contextoOperativo: prepararContextoOperativoDisponibilidad({
        asistenciaDia: { "id:p-1": estado }
      }),
      disponible: true,
      cobertura: true
    }
  ]),
  ["Libre ordinario", {
    contextoOperativo: prepararContextoOperativoDisponibilidad({ libresTurno: [persona] }),
    disponible: false,
    cobertura: false
  }],
  ["cambio excepcional de horario", {
    contextoAdministrativo: {
      ...contextoAdministrativo,
      novedadesModernas: [{
        id: "horario-1",
        personaId: persona.id,
        tipo: "cambio_horario",
        fechaDesde: FECHA,
        fechaHasta: FECHA,
        turno: "tarde",
        afectaDisponibilidad: false,
        estado: "activa",
        datos: { horaEntrada: "10:00", horaSalida: "16:00" }
      }]
    },
    disponible: true,
    cobertura: true
  }],
  ["reintegro sin causa administrativa propia", {
    disponible: true,
    cobertura: true
  }],
  ["persona Sin asignar disponible", {
    disponible: true,
    cobertura: true
  }]
];

casosEquivalentes.forEach(([nombre, caso]) => {
  probar(`equivalencia: ${nombre}`, () => {
    const resultado = compararDisponibilidadCalendario({
      personas: [persona],
      contextoOperativo: caso.contextoOperativo || contextoOperativo,
      contextoAdministrativo: caso.contextoAdministrativo || contextoAdministrativo,
      esPersonaDisponibleActual: () => caso.disponible,
      esPersonaDisponibleParaCoberturaActual: () => caso.cobertura
    });
    assert.deepEqual(resultado.diferencias, []);
  });
});

console.log(`\n${aprobadas} comprobaciones de integración diferencial pasaron.`);
