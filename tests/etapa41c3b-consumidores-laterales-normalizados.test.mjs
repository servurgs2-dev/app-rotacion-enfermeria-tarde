import assert from "node:assert/strict";
import fs from "node:fs";
import {
  compararDisponibilidadCalendario,
  crearPredicadosDisponibilidadNormalizada,
  prepararContextoOperativoDisponibilidad
} from "../src/utils/comparacionDisponibilidadCalendario.js";
import {
  crearValidadorExtrasOrigenDia,
  ESTADOS_VALIDACION_EXTRA_ORIGEN,
  resolverIndisponibilidadesDia
} from "../src/utils/indisponibilidadesSupervision.js";

let aprobadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  aprobadas += 1;
  console.log(`OK ${nombre}`);
};

const disponible = { id: "p-disponible", nombre: "Disponible", categoria: "enfermero", turno: "tarde" };
const bloqueada = { id: "p-bloqueada", nombre: "Bloqueada", categoria: "enfermero", turno: "tarde" };
const cambio = { id: "p-cambio", nombre: "Cambio", categoria: "enfermero", turno: "tarde" };
const extra = {
  id: "extra-cambio",
  nombre: "Extra cambio",
  categoria: "enfermero",
  tipoExtra: "cobertura",
  personaCubiertaId: cambio.id
};
const diagnostico = compararDisponibilidadCalendario({
  personas: [disponible, bloqueada, cambio],
  contextoOperativo: prepararContextoOperativoDisponibilidad({
    noDisponiblesDiaTurno: [
      { personaId: bloqueada.id, motivo: "pap" },
      { personaId: cambio.id, motivo: "cambio_otro_turno", personaCoberturaId: extra.id }
    ],
    extrasDiaTurno: [extra]
  }),
  contextoAdministrativo: {
    personal: [disponible, bloqueada, cambio],
    fecha: "2026-10-25",
    turnoConsultado: "tarde"
  },
  esPersonaDisponibleActual: (persona) => persona.id === disponible.id,
  esPersonaDisponibleParaCoberturaActual: (persona) => persona.id !== bloqueada.id
});
const predicados = crearPredicadosDisponibilidadNormalizada(
  diagnostico.disponibilidadNormalizadaPorPersonaId
);

probar("1 sobrante disponible puede entrar en Sin asignar", () => {
  assert.equal(predicados.esPersonaDisponibleNormalizada(disponible), true);
});

probar("2 persona bloqueada no puede entrar en Sin asignar", () => {
  assert.equal(predicados.esPersonaDisponibleNormalizada(bloqueada), false);
});

probar("3 asignados y Sin asignar conservan interseccion vacia", () => {
  const asignados = new Set([disponible.id]);
  const sinAsignar = [disponible, bloqueada].filter((persona) =>
    predicados.esPersonaDisponibleNormalizada(persona) && !asignados.has(persona.id)
  );
  assert.deepEqual(sinAsignar, []);
});

probar("4 Cambio con otro turno conserva cobertura diferenciada", () => {
  assert.equal(predicados.esPersonaDisponibleNormalizada(cambio), false);
  assert.equal(predicados.esPersonaDisponibleParaCoberturaNormalizada(cambio), true);
});

probar("5 el diferencial legacy permanece sin diferencias en el fixture", () => {
  assert.deepEqual(diagnostico.diferencias, []);
});

const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);

probar("6 asignaciones parciales usan disponibilidad normalizada", () => {
  assert.match(calendarioFuente, /evaluarAsignacionesParcialesDia\(\{[\s\S]*?esPersonaDisponible:\s*esPersonaDisponibleNormalizada/);
});

probar("7 reintegros sin sector usan disponibilidad normalizada", () => {
  assert.match(calendarioFuente, /filtrarReintegradosSinSectorDia\(\{[\s\S]*?esPersonaDisponible:\s*esPersonaDisponibleNormalizada/);
});

probar("8 sobrantes y retornos no consultan estaAusente", () => {
  assert.match(calendarioFuente, /const sobrantes =[\s\S]*?!esPersonaDisponibleNormalizada\(e\)/);
  assert.match(calendarioFuente, /personasParaSinAsignar\.forEach[\s\S]*?!esPersonaDisponibleNormalizada\(persona\)/);
});

probar("9 candidatos Extra usan disponibilidad para cobertura", () => {
  assert.match(calendarioFuente, /obtenerOpcionesCoberturaExtra\(\{[\s\S]*?esPersonaDisponible:\s*esPersonaDisponibleParaCoberturaNormalizada/);
});

probar("10 movimientos manuales consultan disponibilidad normalizada", () => {
  assert.match(calendarioFuente, /if \(!esPersonaDisponibleNormalizada\(item\.enfermero\)\) return/);
});

probar("11 estaAusente queda acotada al baseline legacy", () => {
  assert.equal((calendarioFuente.match(/estaAusente\(/g) || []).length, 2);
  assert.match(calendarioFuente, /esPersonaDisponibleActual:\s*\(persona\)\s*=>\s*!estaAusente\(persona\)/);
});

const estadoOrigen = {
  personal: [{ id: "origen", nombre: "Origen", funcionario: "1", categoria: "enfermero", turno: "manana" }],
  licencias: [{ personaId: "origen", desde: "2026-10-25", hasta: "2026-10-25" }],
  certificaciones: [],
  calendario: {
    enfermeros: { noDisponibles: {}, extras: {}, asistenciaDia: {} },
    licenciados: { noDisponibles: {}, extras: {}, asistenciaDia: {} }
  }
};

probar("12 Supervisión deriva indisponibilidad del normalizador canónico", () => {
  const resultado = resolverIndisponibilidadesDia({
    estadoMensual: estadoOrigen,
    fecha: "2026-10-25",
    turno: "manana",
    categoria: "enfermero"
  });
  assert.deepEqual([...resultado.porIdentidad.get("id:origen").causas], ["licencia"]);
});

probar("13 Extra de origen indisponible continúa rechazado", () => {
  const validar = crearValidadorExtrasOrigenDia({
    estadosPorTurno: { manana: estadoOrigen },
    fecha: "2026-10-25"
  });
  const resultado = validar({
    categoria: "enfermero",
    extra: {
      id: "origen",
      personaId: "origen",
      nombre: "Origen",
      funcionario: "1",
      categoria: "enfermero",
      origenExtra: "personal_otro_turno",
      turnoOrigen: "manana"
    }
  });
  assert.equal(resultado.estado, ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_INDISPONIBLE);
});

probar("14 una identidad de origen irresoluble no se presume disponible", () => {
  const validar = crearValidadorExtrasOrigenDia({
    estadosPorTurno: { manana: estadoOrigen },
    fecha: "2026-10-25"
  });
  const resultado = validar({
    categoria: "enfermero",
    extra: { personaId: "fantasma", origenExtra: "personal_otro_turno", turnoOrigen: "manana" }
  });
  assert.equal(resultado.estado, ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_VERIFICABLE);
});

probar("15 Supervisión no reconstruye licencias ni Novedades directamente", () => {
  const fuente = fs.readFileSync(
    new URL("../src/utils/indisponibilidadesSupervision.js", import.meta.url),
    "utf8"
  );
  assert.match(fuente, /resolverDisponibilidadPersonalPorFecha/);
  assert.doesNotMatch(fuente, /estaDeLicencia\(|estaCertificado\(|novedadAfectaDisponibilidadEnFecha\(/);
});

probar("16 motores 40H permanecen intactos", () => {
  for (const archivo of [
    "../src/utils/resolverDistribucionDiaria.js",
    "../src/utils/resolverDistribucionLicenciadosLegacy.js",
    "../src/utils/redistribucionEnfermeros.js"
  ]) {
    const fuente = fs.readFileSync(new URL(archivo, import.meta.url), "utf8");
    assert.doesNotMatch(fuente, /indisponibilidadesSupervision|comparacionDisponibilidadCalendario/);
  }
});

probar("17 snapshot y Salud Mental conservan sus fronteras", () => {
  assert.match(calendarioFuente, /resolverDatosPresentacionCierreTurno/);
  assert.match(calendarioFuente, /resolverCoberturaSaludMental/);
});

console.log(`\n${aprobadas} comprobaciones de consumidores laterales normalizados pasaron.`);
