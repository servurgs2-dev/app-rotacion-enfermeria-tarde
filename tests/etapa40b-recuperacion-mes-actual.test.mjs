import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  analizarRecuperacionMesActual,
  MODO_PREPARACION_MES
} from "../src/utils/recuperacionMesActual.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const fechaReferencia = new Date(2026, 8, 2, 12);
const padronNoche = {
  porPersonaId: {
    p1: { vigencias: [{ desde: "2026-09-01", hasta: "2026-09-30", turno: "noche" }] }
  }
};
const analizar = (cambios = {}) => analizarRecuperacionMesActual({
  mes: "2026-09",
  mesReferencia: "2026-09",
  fechaReferencia,
  turno: "noche",
  existeRemoto: false,
  estado: crearEstadoMensualVacio(),
  novedadesExternas: [],
  padronVigencias: padronNoche,
  auditoriaExternaDisponible: true,
  ...cambios
});
const novedad = (cambios = {}) => ({
  id: "n1",
  personaId: "p1",
  tipo: "suspension",
  estado: "activa",
  fechaDesde: "2026-09-01",
  fechaHasta: "2026-09-01",
  turno: "noche",
  ...cambios
});

await probar("R inexistente puede recuperarse", () => {
  const resultado = analizar();
  assert.equal(resultado.permitida, true);
  assert.equal(resultado.codigo, "MES_ACTUAL_INEXISTENTE");
});

await probar("R remoto vacío puede recuperarse", () => {
  const resultado = analizar({ existeRemoto: true });
  assert.equal(resultado.permitida, true);
  assert.equal(resultado.codigo, "MES_ACTUAL_VACIO");
});

for (const [nombre, preparar] of [
  ["Personal", (estado) => { estado.personal = [{ id: "p1" }]; }],
  ["Planilla", (estado) => { estado.planillas.enfermeros.semana1 = [{ REA1: { personaId: "p1" } }]; }],
  ["cambiosDia", (estado) => { estado.calendario.enfermeros.cambiosDia = { "2026-09-01": { REA1: "p1" } }; }],
  ["No disponible", (estado) => { estado.calendario.enfermeros.noDisponibles = { "2026-09-01": [{ personaId: "p1" }] }; }],
  ["Extra", (estado) => { estado.calendario.enfermeros.extras = { "2026-09-01": [{ personaId: "p1" }] }; }],
  ["asistencia", (estado) => { estado.calendario.enfermeros.asistenciaDia = { "2026-09-01": { p1: true } }; }],
  ["cierre", (estado) => { estado.calendario.enfermeros.cierresDia = { "2026-09-01": { cerrado: true } }; }]
]) {
  await probar(`R con ${nombre} se bloquea`, () => {
    const estado = crearEstadoMensualVacio();
    preparar(estado);
    const resultado = analizar({ estado });
    assert.equal(resultado.permitida, false);
    assert.equal(resultado.codigo, "ESTADO_MENSUAL_CON_CONTENIDO");
  });
}

await probar("R-1 no entra en recuperación", () => {
  assert.equal(analizar({ mes: "2026-08" }).codigo, "PERIODO_NO_ACTUAL");
});

await probar("R+1 conserva un modo separado", () => {
  assert.equal(analizar({ mes: "2026-10" }).permitida, false);
  assert.equal(MODO_PREPARACION_MES.SIGUIENTE, "siguiente");
});

await probar("R+2 no entra en recuperación", () => {
  assert.equal(analizar({ mes: "2026-11" }).codigo, "PERIODO_NO_ACTUAL");
});

await probar("el origen mensual de R es R-1", () => {
  assert.equal(analizar().mesOrigen, "2026-08");
});

await probar("una novedad iniciada bloquea la recuperación", () => {
  const resultado = analizar({ novedadesExternas: [novedad()] });
  assert.equal(resultado.codigo, "ACTIVIDAD_EXTERNA_DETECTADA");
  assert.deepEqual(resultado.actividadDetectada.map(({ id }) => id), ["n1"]);
});

for (const tipo of [
  "licencia",
  "certificacion",
  "suspension",
  "adhesion_paro",
  "cambio_horario",
  "olvido_tarjeta",
  "otra"
]) {
  await probar(`${tipo} ya iniciada acredita actividad externa`, () => {
    assert.equal(
      analizar({ novedadesExternas: [novedad({ tipo })] }).codigo,
      "ACTIVIDAD_EXTERNA_DETECTADA"
    );
  });
}

await probar("una novedad futura meramente programada no bloquea", () => {
  const resultado = analizar({
    novedadesExternas: [novedad({ fechaDesde: "2026-09-10", fechaHasta: "2026-09-10" })]
  });
  assert.equal(resultado.permitida, true);
});

await probar("una novedad cancelada no bloquea", () => {
  assert.equal(analizar({ novedadesExternas: [novedad({ estado: "cancelada" })] }).permitida, true);
});

await probar("una novedad de otro turno no bloquea Noche", () => {
  const padron = {
    porPersonaId: {
      p1: { vigencias: [{ desde: "2026-09-01", hasta: "2026-09-30", turno: "tarde" }] }
    }
  };
  assert.equal(analizar({ novedadesExternas: [novedad({ turno: "tarde" })], padronVigencias: padron }).permitida, true);
});

await probar("la atribución externa usa personaId y vigencia efectiva", () => {
  const resultado = analizar({ novedadesExternas: [novedad({ turno: "tarde" })] });
  assert.equal(resultado.permitida, false);
});

await probar("sin carga de novedades el preflight es conservador", () => {
  assert.equal(analizar({ auditoriaExternaDisponible: false }).codigo, "AUDITORIA_EXTERNA_NO_DISPONIBLE");
});

await probar("sin padrón de vigencias no se declara limpio", () => {
  assert.equal(analizar({ padronVigencias: null }).permitida, false);
});

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/mes/PanelPrepararMes.jsx", import.meta.url), "utf8");

await probar("la UI ofrece una acción explícita para R", () => {
  assert.match(app, />\s*Preparar mes actual\s*</);
  assert.match(app, /MODO_PREPARACION_MES\.RECUPERACION_ACTUAL/);
});

await probar("R+1 mantiene Preparar mes siguiente", () => {
  assert.match(app, />\s*Preparar mes siguiente\s*</);
  assert.match(app, /MODO_PREPARACION_MES\.SIGUIENTE/);
});

await probar("el panel reutilizado distingue ambos modos", () => {
  assert.match(panel, /esRecuperacionActual \? "Preparar mes actual" : "Preparar mes siguiente"/);
});

await probar("inicio y confirmación revalidan la recuperación", () => {
  assert.equal((app.match(/analizarRecuperacionMesActual\(\{/g) || []).length >= 3, true);
  assert.match(app, /recuperacionActual && !recuperacionActual\.permitida/);
});

await probar("la recuperación usa el constructor mensual existente", () => {
  assert.match(app, /const construccion = construirEstadoMesNuevo\(/);
  assert.doesNotMatch(app, /preparacionesPorVigencia|preparaciones\s*:/);
});

await probar("Gestión carga el padrón transversal para auditar novedades", () => {
  assert.match(app, /subvistaMas === "gestionMes"/);
  assert.match(app, /padronVigencias: vigenciasPersonal\.padron/);
});

await probar("estado parcial explica la futura preparación desde fecha", () => {
  assert.match(app, /será necesario crear una nueva preparación desde una fecha/);
});

await probar("CAS y autorización explícita de creación permanecen", () => {
  assert.match(app, /revisionDestino/);
  assert.match(app, /hayPendientesEnClave\(claveActiva\)/);
  assert.match(app, /creacionesMensualesAutorizadasRef\.current\.add\(claveActiva\)/);
});

await probar("Noche sigue pasando por el análisis y constructor comunes", () => {
  assert.match(app, /analizarPreparacionMesNuevo\(\{/);
  assert.doesNotMatch(app, /modo === MODO_PREPARACION_MES\.RECUPERACION_ACTUAL[\s\S]{0,200}fechaBase\s*=/);
});

console.log(`\n${total} comprobaciones de Etapa 40B superadas.`);
