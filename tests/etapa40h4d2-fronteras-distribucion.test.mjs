import assert from "node:assert/strict";
import fs from "node:fs";
import { resolverDatosPresentacionCierreTurno } from "../src/utils/cierreTurno.js";
import { redistribuirCritica } from "../src/utils/redistribucionEnfermeros.js";
import { resolverDistribucionDiaria } from "../src/utils/resolverDistribucionDiaria.js";
import { resolverDistribucionLicenciadosLegacy } from "../src/utils/resolverDistribucionLicenciadosLegacy.js";

const leer = (ruta) => fs.readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
const calendario = leer("src/components/calendario/CalendarioDiario.jsx");
const motorComun = leer("src/utils/resolverDistribucionDiaria.js");
const motorLegacy = leer("src/utils/resolverDistribucionLicenciadosLegacy.js");
const redistribucion = leer("src/utils/redistribucionEnfermeros.js");
const licenciadosV2 = leer("src/utils/calendarioLicenciadosDinamico.js");
const coberturaV2 = leer("src/utils/coberturaDinamicaLicenciados.js");

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const identidad = (persona) => String(persona?.id || "");
const validarUnicidad = ({ asignaciones = [], sinAsignar = [] }) => {
  const asignadas = asignaciones.map((fila) => identidad(fila.enfermero)).filter(Boolean);
  const libres = sinAsignar.map((fila) => identidad(fila.enfermero)).filter(Boolean);
  assert.equal(asignadas.length, new Set(asignadas).size);
  assert.equal(libres.length, new Set(libres).size);
  assert.equal(libres.some((id) => asignadas.includes(id)), false);
};

probar("Enfermeros usa resolverDistribucionDiaria como frontera única", () => {
  assert.match(calendario, /tipo === "enfermero"[\s\S]{0,300}resolverDistribucionDiaria\(\{/);
  for (const llamada of [
    "aplicarPrioridadCoberturaParejas",
    "resolverTurnantesYCoberturasOperativas",
    "aplicarPrioridadGeneralPorSectorId"
  ]) {
    assert.doesNotMatch(calendario, new RegExp(`${llamada}\\(`));
  }
});

probar("opción 1 y opción 2 entran por el orquestador común", () => {
  assert.match(calendario, /MODOS_REDISTRIBUCION_DIARIA\.OPCION_1/);
  assert.match(calendario, /MODOS_REDISTRIBUCION_DIARIA\.OPCION_2/);
  for (const llamada of [
    "redistribuirCritica",
    "redistribuirPorBoxes",
    "recalcularRedistribucionOpcion1Automatica",
    "recalcularRedistribucionOpcion2Automatica"
  ]) {
    assert.doesNotMatch(calendario, new RegExp(`${llamada}\\(`));
    assert.match(motorComun, new RegExp(llamada));
  }
});

probar("Licenciados legacy tiene una sola frontera distributiva", () => {
  assert.equal((calendario.match(/resolverDistribucionLicenciadosLegacy\(\{/g) || []).length, 1);
  assert.match(motorLegacy, /resolverTurnantesYCoberturasOperativas\(\{/);
  assert.match(motorLegacy, /aplicarPrioridadGeneralPorSectorId\(\{/);
  assert.ok(motorLegacy.indexOf("resolverTurnantesYCoberturasOperativas({") <
    motorLegacy.indexOf("aplicarPrioridadGeneralPorSectorId({"));
});

probar("Licenciados v2 conserva su pipeline específico", () => {
  assert.match(calendario, /resolverCalendarioLicenciadosDinamico\(\{/);
  assert.match(licenciadosV2, /resolverCoberturaDinamicaLicenciados\(\{/);
  assert.match(coberturaV2, /resolverTurnantesYCoberturasOperativas\(\{/);
  assert.doesNotMatch(licenciadosV2 + coberturaV2, /resolverDistribucionLicenciadosLegacy/);
});

probar("Salud Mental permanece como adaptación previa de dominio", () => {
  const saludMental = calendario.indexOf("aplicarCoberturaLibreSaludMental({");
  const motor = calendario.indexOf("resolverDistribucionDiaria({", saludMental);
  assert.ok(saludMental >= 0 && motor > saludMental);
});

probar("Paro no selecciona ni configura un motor distributivo", () => {
  for (const concepto of ["esDiaParo", "sectoresParo", "prioridadesParo", "cambiosParoDia"]) {
    assert.doesNotMatch(calendario, new RegExp(concepto));
  }
  assert.match(calendario, /confirmacionRedistribucion\.tipo === "boxes"/);
  assert.match(calendario, /confirmacionRedistribucion\.tipo === "comun"/);
});

probar("snapshot cerrado es autoridad aunque exista reconstrucción viva", () => {
  const snapshot = {
    versionSnapshot: 2,
    asignaciones: [{ sector: "Cerrado", tipo: "sector", persona: {
      personaId: "cerrada", nombre: "Persona cerrada"
    }}],
    asistencia: { cerrada: "presente" },
    personasPrevistas: [{ personaId: "cerrada" }],
    libres: [{ personaId: "libre-cerrado" }],
    licencias: [{ personaId: "licencia-cerrada" }],
    certificaciones: [{ personaId: "certificada-cerrada" }],
    noDisponibles: [{ personaId: "no-disponible-cerrada" }],
    extrasRegistrados: [{ personaId: "extra-cerrado" }],
    sectoresSinCobertura: ["Sector cerrado"],
    resumen: { origen: "snapshot" }
  };
  const resultado = resolverDatosPresentacionCierreTurno({
    snapshot,
    reconstruccion: {
      asignaciones: [{ nombre: "Vivo", enfermero: { id: "viva" } }],
      asistencia: { viva: "ausente" },
      personasPrevistas: [{ personaId: "viva" }],
      libres: [], licencias: [], certificaciones: [], noDisponibles: [],
      extrasRegistrados: [], resumen: { origen: "vivo" }
    }
  });
  assert.equal(resultado.fuente, "snapshot_cierre");
  assert.equal(resultado.asignaciones[0].enfermero.id, "cerrada");
  assert.deepEqual(resultado.resumen, { origen: "snapshot" });
  assert.deepEqual(resultado.extrasRegistrados, snapshot.extrasRegistrados);
  assert.deepEqual(resultado.libres, snapshot.libres);
});

probar("fallback legacy de redistribución permanece determinista y acotado", () => {
  assert.match(redistribucion, /if \(!tienePoolTurnantes\)[\s\S]{0,120}crearRedistribucionPorIdentidades/);
  assert.match(redistribucion, /if \(!tieneOrigenEstructural\)[\s\S]{0,120}crearRedistribucionPorIdentidades/);
  const entrada = {
    asignaciones: [
      { nombre: "REA 1", sectorId: "rea_1", tipo: "sector", enfermero: { id: "a" } },
      { nombre: "REA 2", sectorId: "rea_2", tipo: "sector", enfermero: { id: "b" } }
    ],
    ordenVisual: ["REA 1", "REA 2"],
    filasConfiguracion: [],
    prioridadSectorIds: ["rea_1", "rea_2"]
  };
  assert.deepEqual(redistribuirCritica(entrada), redistribuirCritica(entrada));
});

probar("Sin asignar conserva identidad global en las dos fronteras generales", () => {
  const titular = { id: "titular" };
  const libre = { id: "libre" };
  const comun = resolverDistribucionDiaria({
    asignacionBase: [{ nombre: "A", sectorId: "a", tipo: "sector", enfermero: titular }],
    personalEfectivo: [titular, libre],
    personasSinAsignar: [titular, libre, libre]
  });
  validarUnicidad(comun);
  const legacy = resolverDistribucionLicenciadosLegacy({
    asignaciones: [{ nombre: "A", sectorId: "a", tipo: "sector", enfermero: titular }],
    personal: [titular, libre, libre]
  });
  validarUnicidad({
    asignaciones: legacy.asignaciones,
    sinAsignar: legacy.sobrantes.map((enfermero) => ({ enfermero }))
  });
});

probar("procedencias funcionales permanecen separadas de trazas derivadas", () => {
  assert.match(calendario, /procedenciaCambiosDia\[keyDia\]/);
  assert.match(calendario, /procedenciaCoberturaAutomaticaDia\[keyDia\]/);
  assert.doesNotMatch(calendario, /trazas\s*:/);
  assert.doesNotMatch(motorComun, /trazas\s*=|trazasEntrada|usarTrazas/);
});

probar("los resolvers centrales no dependen de infraestructura administrativa", () => {
  const imports = `${motorComun}\n${motorLegacy}`
    .split(/\r?\n/)
    .filter((linea) => /^import\s/.test(linea));
  const prohibidos = /react|supabase|localStorage|sessionStorage|novedadesPersonal|components\//i;
  assert.equal(imports.some((linea) => prohibidos.test(linea)), false);
});

probar("la disponibilidad llega normalizada y los roles quedan fuera de su contrato", () => {
  for (const resolver of [motorComun, motorLegacy]) {
    assert.match(resolver, /esPersonaDisponible\s*=\s*\(\)\s*=>\s*true/);
    assert.match(resolver, /esPersonaDisponibleParaCobertura\s*=\s*esPersonaDisponible/);
  }
  const firmaComun = motorComun.slice(
    motorComun.indexOf("export const resolverDistribucionDiaria"),
    motorComun.indexOf("} = {}) =>", motorComun.indexOf("export const resolverDistribucionDiaria"))
  );
  assert.doesNotMatch(firmaComun, /licencia|certificacion|suspension|adhesion|Supabase|esLibre/iu);
});

console.log(`\n${total} comprobaciones de fronteras finales 40H aprobadas.`);
