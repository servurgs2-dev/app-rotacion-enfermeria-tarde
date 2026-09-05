import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  CODIGOS_PREPARACIONES_MES,
  analizarOrganizacionLegacy,
  crearNuevaPreparacionDesdeFecha,
  materializarPreparacionLegacy,
  obtenerPreparacionesMes,
  resolverPreparacionMesPorFecha
} from "../src/utils/preparacionesMes.js";
import { analizarRecuperacionMesActual } from "../src/utils/recuperacionMesActual.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const mes = "2026-09";
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const categorias = {
  enfermero: { planilla: { semana1: { REA1: { personaId: "p1" } } }, configuracion: {} },
  licenciado: { planilla: { semana1: {} }, configuracion: {} }
};
const versionada = [{
  id: "A",
  desde: "2026-09-01",
  hasta: "2026-09-30",
  creadaEn: null,
  creadaPor: null,
  origen: "prueba",
  categorias
}];
const estadoSemanal = () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros.semana1 = { REA1: { personaId: "p1" } };
  estado.planillas.licenciados.semana1 = { Lic1: { personaId: "l1" } };
  return estado;
};

await probar("estado vacío devuelve SIN_PREPARACION", () => {
  const resultado = obtenerPreparacionesMes({ estado: crearEstadoMensualVacio(), mes });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, CODIGOS_PREPARACIONES_MES.SIN_PREPARACION);
  assert.deepEqual(resultado.preparaciones, []);
  assert.equal(resultado.virtual, false);
});

await probar("leer estado vacío no lo muta", () => {
  const estado = crearEstadoMensualVacio();
  const antes = clonar(estado);
  obtenerPreparacionesMes({ estado, mes });
  assert.deepEqual(estado, antes);
  assert.equal(Object.hasOwn(estado, "preparaciones"), false);
});

await probar("fila inexistente y fila remota vacía comparten SIN_PREPARACION", () => {
  assert.equal(obtenerPreparacionesMes({ estado: {}, mes }).codigo, CODIGOS_PREPARACIONES_MES.SIN_PREPARACION);
  assert.equal(obtenerPreparacionesMes({ estado: crearEstadoMensualVacio(), mes }).codigo, CODIGOS_PREPARACIONES_MES.SIN_PREPARACION);
});

await probar("Personal sin Planilla no materializa", () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "p1", nombre: "Persona" }];
  assert.equal(obtenerPreparacionesMes({ estado, mes }).codigo, CODIGOS_PREPARACIONES_MES.LEGACY_NO_MATERIALIZABLE);
});

for (const [nombre, agregar] of [
  ["cambiosDia", (estado) => { estado.calendario.enfermeros.cambiosDia = { "2026-09-01": { REA1: "p1" } }; }],
  ["Extra", (estado) => { estado.calendario.enfermeros.extras = { "2026-09-01": [{ id: "e1" }] }; }],
  ["No disponible", (estado) => { estado.calendario.enfermeros.noDisponibles = { "2026-09-01": [{ personaId: "p1" }] }; }],
  ["asistencia", (estado) => { estado.calendario.enfermeros.asistenciaDia = { "2026-09-01": { p1: true } }; }]
]) {
  await probar(`${nombre} sin organización no materializa`, () => {
    const estado = crearEstadoMensualVacio();
    agregar(estado);
    assert.equal(obtenerPreparacionesMes({ estado, mes }).codigo, CODIGOS_PREPARACIONES_MES.LEGACY_NO_MATERIALIZABLE);
  });
}

await probar("legacy semanal real materializa una preparación virtual", () => {
  const resultado = obtenerPreparacionesMes({ estado: estadoSemanal(), mes });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.virtual, true);
  assert.deepEqual([resultado.preparaciones[0].desde, resultado.preparaciones[0].hasta], ["2026-09-01", "2026-09-30"]);
});

await probar("legacy Noche con rotacion3Dias materializa sin contar sólo fechaBase", () => {
  const vacio = crearEstadoMensualVacio();
  assert.equal(analizarOrganizacionLegacy(vacio).materializable, false);
  vacio.planillas.enfermeros.rotacion3Dias.asignacionBase = { REA1: { personaId: "p1" } };
  const resultado = obtenerPreparacionesMes({ estado: vacio, mes });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.preparaciones[0].categorias.enfermero.planilla.rotacion3Dias.fechaBase, "2026-07-02");
});

await probar("configuración estructural real acredita preparación", () => {
  const estado = crearEstadoMensualVacio();
  estado.configuracionPlanilla = {
    enfermero: { version: 1, filas: [{ id: "rea1", sectorId: "rea1" }] },
    licenciado: { version: 1, filas: [{ id: "lic1", sectorId: "lic1" }] }
  };
  const diagnostico = analizarOrganizacionLegacy(estado);
  assert.equal(diagnostico.materializable, true);
  assert.equal(diagnostico.senales.includes("enfermero.configuracionPlanilla"), true);
});

await probar("legacy con una sola categoría organizada sigue materializable", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros.semana1 = { REA1: { personaId: "p1" } };
  const resultado = obtenerPreparacionesMes({ estado, mes });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.preparaciones[0].categorias.licenciado.planilla.semana1, {});
});

await probar("materializador valida internamente y rechaza vacío", () => {
  assert.equal(materializarPreparacionLegacy({ estado: crearEstadoMensualVacio(), mes }).codigo, CODIGOS_PREPARACIONES_MES.SIN_PREPARACION);
});

await probar("resolver fecha funciona para legacy preparado", () => {
  assert.equal(resolverPreparacionMesPorFecha({ estado: estadoSemanal(), mes, fecha: "2026-09-15" }).preparacion.id, `preparacion-legacy-${mes}`);
});

await probar("resolver fecha en vacío no inventa payload", () => {
  const resultado = resolverPreparacionMesPorFecha({ estado: crearEstadoMensualVacio(), mes, fecha: "2026-09-15" });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, CODIGOS_PREPARACIONES_MES.SIN_PREPARACION);
  assert.equal(resultado.preparacion, null);
});

await probar("colección versionada válida sigue resolviendo", () => {
  const estado = { preparaciones: versionada };
  const resultado = resolverPreparacionMesPorFecha({ estado, mes, fecha: "2026-09-15" });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.preparacion.id, "A");
});

await probar("colección versionada corrupta no cae a legacy aunque haya Planilla", () => {
  const estado = estadoSemanal();
  estado.preparaciones = [{ id: "rota", desde: "2026-09-20", hasta: "2026-09-10" }];
  const resultado = obtenerPreparacionesMes({ estado, mes });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.origen, "versionado");
  assert.equal(resultado.virtual, false);
});

await probar("40B mantiene recuperable un estado mensual vacío", () => {
  const resultado = analizarRecuperacionMesActual({
    mes,
    mesReferencia: mes,
    fechaReferencia: new Date(2026, 8, 2, 12),
    turno: "noche",
    estado: crearEstadoMensualVacio(),
    novedadesExternas: [],
    padronVigencias: { personas: [] },
    auditoriaExternaDisponible: true
  });
  assert.equal(resultado.permitida, true);
});

await probar("40C.1 permite hoy sin actividad y bloquea hoy con actividad", () => {
  const base = { preparaciones: versionada, mes, desde: "2026-09-13", fechaReferencia: "2026-09-13", id: "B" };
  assert.equal(crearNuevaPreparacionDesdeFecha(base).ok, true);
  assert.equal(crearNuevaPreparacionDesdeFecha({ ...base, actividadDetectada: true }).codigo, CODIGOS_PREPARACIONES_MES.ACTIVIDAD_DETECTADA);
});

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const estadoMensual = await readFile(new URL("../src/utils/estadoMensual.js", import.meta.url), "utf8");

await probar("R+1 no escribe preparaciones y conserva el flujo legacy", () => {
  assert.doesNotMatch(estadoMensual.slice(estadoMensual.indexOf("export const crearEstadoMensualVacio"), estadoMensual.indexOf("const normalizarReferenciaLigera")), /preparaciones/);
  assert.doesNotMatch(app, /resolverPreparacionMesPorFecha/);
});

console.log(`\n${total} comprobaciones de Etapa 40C.2 superadas.`);
