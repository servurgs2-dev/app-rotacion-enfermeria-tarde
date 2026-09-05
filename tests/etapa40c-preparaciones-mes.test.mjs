import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio, normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import {
  CODIGOS_PREPARACIONES_MES,
  ESTADO_TEMPORAL_PREPARACION,
  clasificarPreparacion,
  crearNuevaPreparacionDesdeFecha,
  eliminarPreparacionFutura,
  extraerSnapshotOrganizativo,
  materializarPreparacionLegacy,
  normalizarPreparacionesMes,
  obtenerPreparacionesMes,
  puedeEditarPreparacion,
  reemplazarPreparacionFutura,
  resolverPreparacionMesPorFecha
} from "../src/utils/preparacionesMes.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const estadoOrganizado = () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "p1", nombre: "Persona Uno", categoria: "enfermero" }];
  estado.planillas.enfermeros.semana1 = { REA1: { personaId: "p1", nombre: "Persona Uno" } };
  estado.planillas.enfermeros.rotacion3Dias = {
    version: 1,
    fechaBase: "2026-07-02",
    duracionDias: 3,
    asignacionBase: { REA1: { personaId: "p1" } },
    bloques: { "2026-09-01": { REA1: { personaId: "p1" } } },
    coberturaLibreSM: { "2026-09-01": { personaId: "p1" } }
  };
  estado.planillas.licenciados.semana1 = { Lic1: { personaId: "l1" } };
  estado.configuracionPlanilla = {
    enfermero: { filas: [{ id: "rea1", sectorId: "rea1", orden: 1 }], prioridadCoberturaSectorIds: ["rea1"] },
    licenciado: { estructuraLicenciadosVersion: 2, filas: [{ id: "lic1", sectorId: "lic1", orden: 1 }] }
  };
  estado.licencias = [{ personaId: "p1", desde: "2026-09-02", hasta: "2026-09-03" }];
  estado.certificaciones = [{ personaId: "p1", desde: "2026-09-04", hasta: "2026-09-04" }];
  estado.calendario.diasParo = { "2026-09-05": true };
  estado.calendario.enfermeros.cambiosDia = { "2026-09-01": { REA1: { personaId: "p1" } } };
  estado.calendario.enfermeros.procedenciaCambiosDia = { "2026-09-01": { REA1: "manual" } };
  estado.calendario.enfermeros.procedenciaCoberturaAutomaticaDia = { "2026-09-01": { REA1: "rea2" } };
  estado.calendario.enfermeros.cambiosParoDia = { "2026-09-05": { REA1: { personaId: "p1" } } };
  estado.calendario.enfermeros.asistenciaDia = { "2026-09-01": { p1: true } };
  estado.calendario.enfermeros.noDisponibles = { "2026-09-01": [{ personaId: "p1" }] };
  estado.calendario.enfermeros.extras = { "2026-09-01": [{ id: "extra1" }] };
  estado.calendario.enfermeros.cierresDia = { "2026-09-01": { versionSnapshot: 2 } };
  estado.responsables = { "2026-09-01": "supervision" };
  estado.revision = 8;
  return estado;
};
const categorias = (marca) => ({
  enfermero: { planilla: { semana1: { REA1: { personaId: `p-${marca}` } } }, configuracion: { filas: [{ id: `e-${marca}` }] } },
  licenciado: { planilla: { semana1: { Lic1: { personaId: `l-${marca}` } } }, configuracion: { filas: [{ id: `l-${marca}` }] } }
});
const preparacion = (id, desde, hasta, marca = id) => ({
  id,
  desde,
  hasta,
  creadaEn: "2026-08-20T12:00:00.000Z",
  creadaPor: "supervision",
  origen: "prueba",
  categorias: categorias(marca)
});
const mes = "2026-09";

await probar("legacy se interpreta como preparación virtual", () => {
  const resultado = obtenerPreparacionesMes({ estado: estadoOrganizado(), mes });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.virtual, true);
  assert.equal(resultado.preparaciones[0].desde, "2026-09-01");
  assert.equal(resultado.preparaciones[0].hasta, "2026-09-30");
});

await probar("leer legacy no modifica el estado", () => {
  const estado = estadoOrganizado();
  const antes = clonar(estado);
  obtenerPreparacionesMes({ estado, mes });
  assert.deepEqual(estado, antes);
  assert.equal(Object.hasOwn(estado, "preparaciones"), false);
});

await probar("snapshot excluye Personal y operaciones", () => {
  const snapshot = extraerSnapshotOrganizativo(estadoOrganizado());
  for (const clave of ["personal", "licencias", "certificaciones", "calendario", "responsables", "revision"]) {
    assert.equal(Object.hasOwn(snapshot, clave), false, clave);
  }
});

await probar("snapshot preserva configuración de ambas categorías", () => {
  const snapshot = extraerSnapshotOrganizativo(estadoOrganizado());
  assert.equal(snapshot.categorias.enfermero.configuracion.filas[0].sectorId, "rea1");
  assert.equal(snapshot.categorias.licenciado.configuracion.estructuraLicenciadosVersion, 2);
});

await probar("snapshot preserva Planilla y personaId como referencia", () => {
  const snapshot = extraerSnapshotOrganizativo(estadoOrganizado());
  assert.equal(snapshot.categorias.enfermero.planilla.semana1.REA1.personaId, "p1");
  assert.equal(Object.hasOwn(snapshot, "personal"), false);
});

await probar("snapshot preserva rotación nocturna completa", () => {
  const rotacion = extraerSnapshotOrganizativo(estadoOrganizado()).categorias.enfermero.planilla.rotacion3Dias;
  assert.equal(rotacion.fechaBase, "2026-07-02");
  assert.equal(rotacion.duracionDias, 3);
  assert.ok(rotacion.asignacionBase.REA1);
  assert.ok(rotacion.bloques["2026-09-01"]);
  assert.ok(rotacion.coberturaLibreSM["2026-09-01"]);
});

await probar("snapshot no comparte referencias con el estado", () => {
  const estado = estadoOrganizado();
  const snapshot = extraerSnapshotOrganizativo(estado);
  estado.planillas.enfermeros.semana1.REA1.personaId = "cambiada";
  assert.equal(snapshot.categorias.enfermero.planilla.semana1.REA1.personaId, "p1");
  snapshot.categorias.licenciado.configuracion.filas[0].id = "otra";
  assert.equal(estado.configuracionPlanilla.licenciado.filas[0].id, "lic1");
});

await probar("una preparación válida se clona y normaliza", () => {
  const original = preparacion("A", "2026-09-01", "2026-09-30");
  const resultado = normalizarPreparacionesMes({ preparaciones: [original], mes, exigirCoberturaCompleta: true });
  assert.equal(resultado.ok, true);
  assert.notEqual(resultado.preparaciones[0], original);
});

await probar("los extremos son inclusivos", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-12"), preparacion("B", "2026-09-13", "2026-09-30")];
  assert.equal(resolverPreparacionMesPorFecha({ preparaciones: lista, mes, fecha: "2026-09-12" }).preparacion.id, "A");
  assert.equal(resolverPreparacionMesPorFecha({ preparaciones: lista, mes, fecha: "2026-09-13" }).preparacion.id, "B");
});

await probar("A 01-12 y B 13-30 forman colección confirmada", () => {
  assert.equal(normalizarPreparacionesMes({ preparaciones: [preparacion("B", "2026-09-13", "2026-09-30"), preparacion("A", "2026-09-01", "2026-09-12")], mes, exigirCoberturaCompleta: true }).ok, true);
});

await probar("solapamiento se rechaza con código estable", () => {
  const resultado = normalizarPreparacionesMes({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-15"), preparacion("B", "2026-09-10", "2026-09-30")], mes });
  assert.equal(resultado.codigo, CODIGOS_PREPARACIONES_MES.SOLAPADAS);
});

await probar("borrador informa hueco sin inventar cobertura", () => {
  const resultado = normalizarPreparacionesMes({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-10"), preparacion("B", "2026-09-13", "2026-09-30")], mes });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.huecos, [{ desde: "2026-09-11", hasta: "2026-09-12" }]);
});

await probar("colección confirmada rechaza huecos", () => {
  const resultado = normalizarPreparacionesMes({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-10"), preparacion("B", "2026-09-13", "2026-09-30")], mes, exigirCoberturaCompleta: true });
  assert.equal(resultado.codigo, CODIGOS_PREPARACIONES_MES.HUECOS);
});

await probar("fecha fuera del mes se rechaza", () => {
  const resultado = normalizarPreparacionesMes({ preparaciones: [preparacion("A", "2026-08-31", "2026-09-30")], mes });
  assert.equal(resultado.codigo, CODIGOS_PREPARACIONES_MES.FECHA_FUERA_MES);
});

await probar("resolver 10/09 devuelve A", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-12"), preparacion("B", "2026-09-13", "2026-09-30")];
  assert.equal(resolverPreparacionMesPorFecha({ preparaciones: lista, mes, fecha: "2026-09-10" }).preparacion.id, "A");
});

await probar("resolver 30/09 devuelve B", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-12"), preparacion("B", "2026-09-13", "2026-09-30")];
  assert.equal(resolverPreparacionMesPorFecha({ preparaciones: lista, mes, fecha: "2026-09-30" }).preparacion.id, "B");
});

await probar("resolver un hueco devuelve resultado explícito", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-10"), preparacion("B", "2026-09-13", "2026-09-30")];
  assert.equal(resolverPreparacionMesPorFecha({ preparaciones: lista, mes, fecha: "2026-09-11" }).codigo, CODIGOS_PREPARACIONES_MES.NO_ENCONTRADA);
});

await probar("resolver legacy devuelve su preparación virtual", () => {
  const resultado = resolverPreparacionMesPorFecha({ estado: estadoOrganizado(), mes, fecha: "2026-09-20" });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.origen, "legacy");
});

await probar("clasifica pasada vigente y futura", () => {
  assert.equal(clasificarPreparacion(preparacion("A", "2026-09-01", "2026-09-09"), "2026-09-10"), ESTADO_TEMPORAL_PREPARACION.PASADA);
  assert.equal(clasificarPreparacion(preparacion("B", "2026-09-10", "2026-09-14"), "2026-09-10"), ESTADO_TEMPORAL_PREPARACION.VIGENTE);
  assert.equal(clasificarPreparacion(preparacion("C", "2026-09-15", "2026-09-30"), "2026-09-10"), ESTADO_TEMPORAL_PREPARACION.FUTURA);
});

await probar("pasada y vigente no son editables", () => {
  assert.equal(puedeEditarPreparacion({ preparacion: preparacion("A", "2026-09-01", "2026-09-09"), fechaReferencia: "2026-09-10" }).permitida, false);
  assert.equal(puedeEditarPreparacion({ preparacion: preparacion("B", "2026-09-10", "2026-09-14"), fechaReferencia: "2026-09-10" }).permitida, false);
});

await probar("futura es editable salvo actividad", () => {
  const futura = preparacion("C", "2026-09-15", "2026-09-30");
  assert.equal(puedeEditarPreparacion({ preparacion: futura, fechaReferencia: "2026-09-10" }).permitida, true);
  assert.equal(puedeEditarPreparacion({ preparacion: futura, fechaReferencia: "2026-09-10", actividadDetectada: true }).codigo, CODIGOS_PREPARACIONES_MES.ACTIVIDAD_DETECTADA);
});

await probar("A 01-30 y nueva desde 13 genera A+B", () => {
  const resultado = crearNuevaPreparacionDesdeFecha({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-30")], mes, desde: "2026-09-13", fechaReferencia: "2026-09-10", id: "B" });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.preparaciones.map(({ id, desde, hasta }) => ({ id, desde, hasta })), [
    { id: "A", desde: "2026-09-01", hasta: "2026-09-12" },
    { id: "B", desde: "2026-09-13", hasta: "2026-09-30" }
  ]);
});

await probar("crear B no cambia payload ni entrada de A", () => {
  const fuente = preparacion("A", "2026-09-01", "2026-09-30");
  const antes = clonar(fuente);
  const resultado = crearNuevaPreparacionDesdeFecha({ preparaciones: [fuente], mes, desde: "2026-09-13", fechaReferencia: "2026-09-10", id: "B" });
  assert.deepEqual(fuente, antes);
  assert.deepEqual(resultado.preparaciones[0].categorias, antes.categorias);
});

await probar("B recibe clon profundo independiente", () => {
  const resultado = crearNuevaPreparacionDesdeFecha({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-30")], mes, desde: "2026-09-13", fechaReferencia: "2026-09-10", id: "B" });
  resultado.preparaciones[1].categorias.enfermero.planilla.semana1.REA1.personaId = "otra";
  assert.equal(resultado.preparaciones[0].categorias.enfermero.planilla.semana1.REA1.personaId, "p-A");
});

await probar("crear desde ayer se rechaza por retroactividad", () => {
  assert.equal(crearNuevaPreparacionDesdeFecha({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-30")], mes, desde: "2026-09-12", fechaReferencia: "2026-09-13" }).codigo, CODIGOS_PREPARACIONES_MES.NO_EDITABLE);
});

await probar("crear desde hoy sin actividad genera A hasta ayer y B desde hoy", () => {
  const resultado = crearNuevaPreparacionDesdeFecha({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-30")], mes, desde: "2026-09-13", fechaReferencia: "2026-09-13", id: "B" });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.preparaciones.map(({ id, desde, hasta }) => ({ id, desde, hasta })), [
    { id: "A", desde: "2026-09-01", hasta: "2026-09-12" },
    { id: "B", desde: "2026-09-13", hasta: "2026-09-30" }
  ]);
});

await probar("crear desde hoy con actividad devuelve el código preciso", () => {
  assert.equal(crearNuevaPreparacionDesdeFecha({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-30")], mes, desde: "2026-09-13", fechaReferencia: "2026-09-13", actividadDetectada: true }).codigo, CODIGOS_PREPARACIONES_MES.ACTIVIDAD_DETECTADA);
});

await probar("crear desde mañana continúa permitido", () => {
  assert.equal(crearNuevaPreparacionDesdeFecha({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-30")], mes, desde: "2026-09-14", fechaReferencia: "2026-09-13", id: "B" }).ok, true);
});

await probar("crear B desde hoy conserva payload A y clona profundamente B", () => {
  const fuente = preparacion("A", "2026-09-01", "2026-09-30");
  const payloadOriginal = clonar(fuente.categorias);
  const resultado = crearNuevaPreparacionDesdeFecha({ preparaciones: [fuente], mes, desde: "2026-09-13", fechaReferencia: "2026-09-13", id: "B" });
  assert.deepEqual(resultado.preparaciones[0].categorias, payloadOriginal);
  resultado.preparaciones[1].categorias.enfermero.planilla.semana1.REA1.personaId = "otra";
  assert.deepEqual(resultado.preparaciones[0].categorias, payloadOriginal);
  assert.deepEqual(fuente.categorias, payloadOriginal);
});

await probar("varias preparaciones A/B/C resuelven cronológicamente", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-10"), preparacion("B", "2026-09-11", "2026-09-20"), preparacion("C", "2026-09-21", "2026-09-30")];
  assert.equal(normalizarPreparacionesMes({ preparaciones: lista, mes, exigirCoberturaCompleta: true }).ok, true);
  assert.equal(resolverPreparacionMesPorFecha({ preparaciones: lista, mes, fecha: "2026-09-25" }).preparacion.id, "C");
});

await probar("reemplazar futura conserva su ID y rango", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-10"), preparacion("B", "2026-09-11", "2026-09-30")];
  const resultado = reemplazarPreparacionFutura({ preparaciones: lista, mes, id: "B", categorias: categorias("nueva"), fechaReferencia: "2026-09-05" });
  assert.equal(resultado.ok, true);
  assert.deepEqual([resultado.preparaciones[1].id, resultado.preparaciones[1].desde, resultado.preparaciones[1].hasta], ["B", "2026-09-11", "2026-09-30"]);
});

await probar("reemplazar vigente se rechaza", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-10"), preparacion("B", "2026-09-11", "2026-09-30")];
  assert.equal(reemplazarPreparacionFutura({ preparaciones: lista, mes, id: "B", categorias: categorias("nueva"), fechaReferencia: "2026-09-11" }).codigo, CODIGOS_PREPARACIONES_MES.NO_EDITABLE);
});

await probar("eliminar B futura recompone el rango anterior", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-10"), preparacion("B", "2026-09-11", "2026-09-20"), preparacion("C", "2026-09-21", "2026-09-30")];
  const resultado = eliminarPreparacionFutura({ preparaciones: lista, mes, id: "B", fechaReferencia: "2026-09-05" });
  assert.deepEqual(resultado.preparaciones.map(({ id, desde, hasta }) => ({ id, desde, hasta })), [
    { id: "A", desde: "2026-09-01", hasta: "2026-09-20" },
    { id: "C", desde: "2026-09-21", hasta: "2026-09-30" }
  ]);
});

await probar("eliminar vigente se rechaza", () => {
  const lista = [preparacion("A", "2026-09-01", "2026-09-10"), preparacion("B", "2026-09-11", "2026-09-30")];
  assert.equal(eliminarPreparacionFutura({ preparaciones: lista, mes, id: "B", fechaReferencia: "2026-09-11" }).codigo, CODIGOS_PREPARACIONES_MES.NO_EDITABLE);
});

await probar("categorías son atómicas y obligatorias", () => {
  const invalida = preparacion("A", "2026-09-01", "2026-09-30");
  delete invalida.categorias.licenciado;
  assert.equal(normalizarPreparacionesMes({ preparaciones: [invalida], mes }).codigo, CODIGOS_PREPARACIONES_MES.CATEGORIAS_INVALIDAS);
});

await probar("materialización legacy es pura", () => {
  const estado = estadoOrganizado();
  const antes = clonar(estado);
  const resultado = materializarPreparacionLegacy({ estado, mes });
  assert.equal(resultado.ok, true);
  assert.deepEqual(estado, antes);
});

await probar("modelo materializado es JSON serializable", () => {
  const resultado = materializarPreparacionLegacy({ estado: estadoOrganizado(), mes });
  assert.deepEqual(JSON.parse(JSON.stringify(resultado.preparaciones)), resultado.preparaciones);
});

await probar("colección corrupta no cae a legacy", () => {
  const estado = estadoOrganizado();
  estado.preparaciones = [{ id: "rota", desde: "2026-09-20", hasta: "2026-09-10" }];
  const resultado = obtenerPreparacionesMes({ estado, mes });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.virtual, false);
  assert.notEqual(resultado.origen, "legacy");
});

await probar("normalizador mensual preserva una colección futura sin activarla", () => {
  const estado = estadoOrganizado();
  estado.preparaciones = [preparacion("A", "2026-09-01", "2026-09-30")];
  assert.deepEqual(normalizarEstadoMensual(estado).preparaciones, estado.preparaciones);
});

await probar("Noche no reinicia fechaBase al crear B", () => {
  const legacy = materializarPreparacionLegacy({ estado: estadoOrganizado(), mes }).preparaciones;
  const resultado = crearNuevaPreparacionDesdeFecha({ preparaciones: legacy, mes, desde: "2026-09-13", fechaReferencia: "2026-09-10", id: "B" });
  assert.equal(resultado.preparaciones[0].categorias.enfermero.planilla.rotacion3Dias.fechaBase, "2026-07-02");
  assert.equal(resultado.preparaciones[1].categorias.enfermero.planilla.rotacion3Dias.fechaBase, "2026-07-02");
});

const estadoMensualFuente = await readFile(new URL("../src/utils/estadoMensual.js", import.meta.url), "utf8");
const preparacionNuevaFuente = await readFile(new URL("../src/utils/preparacionMesNuevo.js", import.meta.url), "utf8");
const appFuente = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

await probar("40B no escribe preparaciones automáticamente", () => {
  assert.doesNotMatch(appFuente, /preparaciones\s*:/);
  assert.doesNotMatch(preparacionNuevaFuente, /preparaciones\s*:/);
});

await probar("estado mensual vacío y R+1 siguen en formato legacy", () => {
  assert.doesNotMatch(estadoMensualFuente.slice(estadoMensualFuente.indexOf("export const crearEstadoMensualVacio"), estadoMensualFuente.indexOf("const normalizarReferenciaLigera")), /preparaciones/);
  assert.equal(Object.hasOwn(crearEstadoMensualVacio(), "preparaciones"), false);
});

await probar("40C no activa por sí mismo la interfaz productiva", () => {
  assert.doesNotMatch(preparacionNuevaFuente, /Nueva preparaci[oó]n desde/);
});

console.log(`\n${total} comprobaciones de Etapa 40C superadas.`);
