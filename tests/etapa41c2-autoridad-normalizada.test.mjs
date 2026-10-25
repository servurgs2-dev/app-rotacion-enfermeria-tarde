import assert from "node:assert/strict";
import fs from "node:fs";
import {
  compararDisponibilidadCalendario,
  crearPredicadosDisponibilidadNormalizada,
  prepararContextoOperativoDisponibilidad,
  prepararPersonasDisponibilidadCalendario
} from "../src/utils/comparacionDisponibilidadCalendario.js";

let aprobadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  aprobadas += 1;
  console.log(`OK ${nombre}`);
};

const titular = { id: "p-1", nombre: "Ana", categoria: "enfermero", turno: "tarde" };
const extra = { id: "e-1", nombre: "Eva", categoria: "enfermero", turno: "manana" };
const personas = prepararPersonasDisponibilidadCalendario([titular], [extra, titular]);
const diagnostico = compararDisponibilidadCalendario({
  personas,
  contextoOperativo: prepararContextoOperativoDisponibilidad({ extrasDiaTurno: [extra] }),
  contextoAdministrativo: {
    personal: [titular, extra],
    fecha: "2026-10-24",
    turnoConsultado: "tarde"
  },
  esPersonaDisponibleActual: () => true,
  esPersonaDisponibleParaCoberturaActual: () => true
});
const predicados = crearPredicadosDisponibilidadNormalizada(
  diagnostico.disponibilidadNormalizadaPorPersonaId
);

probar("1 la cohorte incluye personal y Extras sin duplicar identidad", () => {
  assert.deepEqual(personas.map((persona) => persona.id), ["p-1", "e-1"]);
  assert.deepEqual(diagnostico.identidadesEvaluadas, ["p-1", "e-1"]);
});

probar("2 los callbacks leen exclusivamente el mapa normalizado", () => {
  assert.equal(predicados.esPersonaDisponibleNormalizada(titular), true);
  assert.equal(predicados.esPersonaDisponibleNormalizada(extra), true);
  assert.equal(predicados.esPersonaDisponibleParaCoberturaNormalizada(extra), true);
});

probar("3 una identidad ausente no usa fallback legacy", () => {
  const desconocida = { id: "sin-normalizar" };
  assert.equal(predicados.esPersonaDisponibleNormalizada(desconocida), false);
  assert.equal(predicados.esPersonaDisponibleParaCoberturaNormalizada(desconocida), false);
});

probar("4 el diferencial legacy permanece activo y no altera el mapa", () => {
  assert.deepEqual(diagnostico.diferencias, []);
  const discrepancia = compararDisponibilidadCalendario({
    personas: [titular],
    contextoOperativo: prepararContextoOperativoDisponibilidad(),
    contextoAdministrativo: { personal: [titular], fecha: "2026-10-24", turnoConsultado: "tarde" },
    esPersonaDisponibleActual: () => false,
    esPersonaDisponibleParaCoberturaActual: () => true
  });
  assert.equal(discrepancia.diferencias.length, 1);
  assert.equal(discrepancia.disponibilidadNormalizadaPorPersonaId.get("p-1").disponibleEnTurno, true);
});

const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);

probar("5 motor comun y opciones 1/2 reciben autoridad normalizada", () => {
  assert.match(calendarioFuente, /resolverDistribucionDiaria\(\{[\s\S]*?esPersonaDisponible:\s*esPersonaDisponibleNormalizada[\s\S]*?esPersonaDisponibleParaCobertura:\s*esPersonaDisponibleParaCoberturaNormalizada/);
  assert.match(calendarioFuente, /modoRedistribucion:\s*distribucionOpcion1Activa/);
});

probar("6 Licenciados legacy recibe ambos predicados sin intercambiarlos", () => {
  assert.match(calendarioFuente, /resolverDistribucionLicenciadosLegacy\(\{[\s\S]*?esPersonaDisponible:\s*esPersonaDisponibleNormalizada[\s\S]*?esPersonaDisponibleParaCobertura:\s*esPersonaDisponibleParaCoberturaNormalizada/);
});

probar("7 Licenciados v2 conserva su pipeline con autoridad normalizada", () => {
  assert.match(calendarioFuente, /resolverCalendarioLicenciadosDinamico\(\{[\s\S]*?esPersonaDisponible:\s*esPersonaDisponibleNormalizada[\s\S]*?esPersonaDisponibleParaCobertura:\s*esPersonaDisponibleParaCoberturaNormalizada/);
  assert.match(calendarioFuente, /resolverPerfilEstructuraLicenciadosDia\(\{[\s\S]*?esPersonaUtilizable:\s*esPersonaDisponibleNormalizada/);
});

probar("8 baseline legacy queda en diferencial y composiciones externas", () => {
  assert.match(calendarioFuente, /esPersonaDisponibleActual:\s*\(persona\)\s*=>\s*!estaAusente\(persona\)/);
  assert.match(calendarioFuente, /esPersonaDisponibleParaCoberturaActual:\s*puedeAplicarseCoberturaDirecta/);
});

probar("9 snapshot cerrado sigue omitiendo el diferencial vivo", () => {
  assert.match(calendarioFuente, /comparar:\s*!\(bloqueadoPorCierre\s*&&\s*snapshotCierre\)/);
});

probar("10 libres productivos y Salud Mental conservan su adaptacion", () => {
  assert.match(calendarioFuente, /const libres = personalFiltrado\.filter/);
  assert.match(calendarioFuente, /resolverCoberturaSaludMental/);
  assert.doesNotMatch(calendarioFuente, /const libres\s*=\s*libresTurnoDiagnostico/);
});

probar("11 Paro no vuelve a seleccionar un motor", () => {
  assert.doesNotMatch(calendarioFuente, /cambiosParoDia|sectoresParo|prioridadesParo/);
});

probar("12 los motores 40H no importan fuentes administrativas", () => {
  for (const archivo of [
    "../src/utils/resolverDistribucionDiaria.js",
    "../src/utils/resolverDistribucionLicenciadosLegacy.js",
    "../src/utils/redistribucionEnfermeros.js"
  ]) {
    const fuente = fs.readFileSync(new URL(archivo, import.meta.url), "utf8");
    assert.doesNotMatch(
      fuente,
      /from\s+["'][^"']*(?:novedadesPersonal|supabase|components\/calendario|resolverDisponibilidadPersonalPorFecha)[^"']*["']/i
    );
  }
});

console.log(`\n${aprobadas} comprobaciones de autoridad normalizada pasaron.`);
