import assert from "node:assert/strict";
import {
  CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2,
  CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2,
  diagnosticarPrioridadCoberturaLicenciados,
  resolverDestinoPrioritarioEstructuraDiez,
  validarPrioridadCoberturaLicenciadosV2
} from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";
import { configuracionSectores } from "../src/data/sectores.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { FILAS_PLANILLA_LICENCIADOS_V2 } from "../src/utils/estructuraLicenciadosDinamica.js";
import {
  actualizarPrioridadCoberturaEnEstadoMensual,
  obtenerCandidatosPrioridadCoberturaMes,
  obtenerPrioridadCoberturaEfectiva
} from "../src/utils/prioridadCoberturaMensual.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const idsCandidatos = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2.map((candidato) => candidato.id);
const prioridadCompleta = [...idsCandidatos];
const sin = (id) => prioridadCompleta.filter((actual) => actual !== id);
const codigos = (resultado) => resultado.errores.map((error) => error.codigo);

for (const id of ["reanimacion", "sillones", "diagnostico", "explora"]) {
  probar(`catálogo incluye ${id}`, () => assert.equal(idsCandidatos.includes(id), true));
}
probar("catálogo excluye reanimacion_sillones", () => assert.equal(idsCandidatos.includes("reanimacion_sillones"), false));
probar("catálogo excluye diagnostico_explora", () => assert.equal(idsCandidatos.includes("diagnostico_explora"), false));
for (const id of ["turnante_1", "turnante_2", "turnante_3", "turnante_4"]) {
  probar(`catálogo excluye ${id}`, () => assert.equal(idsCandidatos.includes(id), false));
}
probar("Sillones aparece exactamente una vez", () => assert.equal(idsCandidatos.filter((id) => id === "sillones").length, 1));
probar("Explora aparece exactamente una vez", () => assert.equal(idsCandidatos.filter((id) => id === "explora").length, 1));

probar("prioridad completa es válida", () => assert.equal(validarPrioridadCoberturaLicenciadosV2({ prioridad: prioridadCompleta }).ok, true));
probar("validación conserva orden exacto", () => {
  const elegida = ["explora", "triage_1", ...prioridadCompleta.filter((id) => !["explora", "triage_1"].includes(id))];
  assert.deepEqual(validarPrioridadCoberturaLicenciadosV2({ prioridad: elegida }).prioridadNormalizada, elegida);
});
probar("Sillones antes que Explora es válido", () => {
  const elegida = ["sillones", "explora", ...prioridadCompleta.filter((id) => !["sillones", "explora"].includes(id))];
  assert.equal(validarPrioridadCoberturaLicenciadosV2({ prioridad: elegida }).ok, true);
});
probar("Explora antes que Sillones es válido", () => {
  const elegida = ["explora", "sillones", ...prioridadCompleta.filter((id) => !["sillones", "explora"].includes(id))];
  assert.equal(validarPrioridadCoberturaLicenciadosV2({ prioridad: elegida }).ok, true);
});
probar("falta Sillones es inválida", () => {
  const resultado = validarPrioridadCoberturaLicenciadosV2({ prioridad: sin("sillones") });
  assert.equal(resultado.ok, false);
  assert.equal(codigos(resultado).includes(CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.SILLONES_AUSENTE), true);
});
probar("falta Explora es inválida", () => {
  const resultado = validarPrioridadCoberturaLicenciadosV2({ prioridad: sin("explora") });
  assert.equal(codigos(resultado).includes(CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.EXPLORA_AUSENTE), true);
});
probar("duplicado es inválido", () => {
  const resultado = validarPrioridadCoberturaLicenciadosV2({ prioridad: [...prioridadCompleta, "sillones"] });
  assert.equal(codigos(resultado).includes(CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.ID_DUPLICADO), true);
});
probar("ID desconocido es inválido", () => {
  const resultado = validarPrioridadCoberturaLicenciadosV2({ prioridad: [...prioridadCompleta, "sector_desconocido"] });
  assert.equal(codigos(resultado).includes(CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.ID_DESCONOCIDO), true);
});
probar("Turnante incluido es inválido", () => {
  const resultado = validarPrioridadCoberturaLicenciadosV2({ prioridad: [...prioridadCompleta, "turnante_3"] });
  assert.equal(codigos(resultado).includes(CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.TURNANTE_NO_PERMITIDO), true);
});
probar("destino combinado incluido es inválido", () => {
  const resultado = validarPrioridadCoberturaLicenciadosV2({ prioridad: [...prioridadCompleta, "diagnostico_explora"] });
  assert.equal(codigos(resultado).includes(CODIGOS_ERROR_PRIORIDAD_LICENCIADOS_V2.DESTINO_COMBINADO_NO_PERMITIDO), true);
});

const prioridadLegacy = ["triage_1", "reanimacion_sillones", "explora", "diagnostico"];
probar("legacy no se convierte automáticamente", () => {
  const resultado = diagnosticarPrioridadCoberturaLicenciados({ versionEstructura: 1, prioridad: prioridadLegacy });
  assert.deepEqual(resultado.prioridad, prioridadLegacy);
  assert.equal(resultado.usaPrioridadLegacy, true);
});
probar("legacy bajo v2 indica que requiere configuración", () => {
  const resultado = diagnosticarPrioridadCoberturaLicenciados({ versionEstructura: 2, prioridad: prioridadLegacy });
  assert.equal(resultado.requiereConfiguracionV2, true);
  assert.equal(resultado.ok, false);
});
probar("comparación devuelve Sillones", () =>
  assert.equal(resolverDestinoPrioritarioEstructuraDiez(["triage_1", "sillones", "explora"]), "sillones"));
probar("comparación devuelve Explora", () =>
  assert.equal(resolverDestinoPrioritarioEstructuraDiez(["explora", "triage_1", "sillones"]), "explora"));
probar("comparación inválida es conservadora", () =>
  assert.equal(resolverDestinoPrioritarioEstructuraDiez(["explora"]), null));
probar("comparación no depende de nombres visibles", () =>
  assert.equal(resolverDestinoPrioritarioEstructuraDiez(["Sillones", "Explora"]), null));
probar("validación no muta input", () => {
  const prioridad = [...prioridadCompleta];
  const antes = JSON.stringify(prioridad);
  validarPrioridadCoberturaLicenciadosV2({ prioridad });
  assert.equal(JSON.stringify(prioridad), antes);
});

const crearSnapshot = (categoria, turno = "manana", mes = "2026-09") =>
  crearSnapshotConfiguracionPlanilla({ turno, categoria, mes });
const convertirV2 = (base = crearSnapshot("licenciado")) => ({
  ...base,
  estructuraLicenciadosVersion: 2,
  filas: FILAS_PLANILLA_LICENCIADOS_V2.map((fila) => ({ ...fila })),
  prioridadCoberturaSectorIds: [...prioridadCompleta]
});
const candidatosEditor = (categoria, snapshot) => obtenerCandidatosPrioridadCoberturaMes({
  categoria,
  filas: snapshot.filas,
  versionEstructura: snapshot
}).map((item) => item.id);

probar("editor conserva Enfermeros y Licenciados v1", () => {
  const enfermeros = crearSnapshot("enfermero");
  const licenciados = crearSnapshot("licenciado");
  assert.deepEqual(candidatosEditor("enfermero", enfermeros), enfermeros.filas.filter((fila) => fila.tipo === "sector").map((fila) => fila.sectorId));
  assert.equal(candidatosEditor("licenciado", licenciados).includes("reanimacion_sillones"), true);
  assert.equal(candidatosEditor("licenciado", licenciados).includes("sillones"), false);
});
probar("editor v2 incluye individuales y excluye combinados y Turnantes", () => {
  const ids = candidatosEditor("licenciado", convertirV2());
  ["reanimacion", "sillones", "diagnostico", "explora"].forEach((id) => assert.equal(ids.includes(id), true));
  ["reanimacion_sillones", "diagnostico_explora", "turnante_1", "turnante_2", "turnante_3", "turnante_4"].forEach((id) => assert.equal(ids.includes(id), false));
});
probar("lectura v2 conserva ambos órdenes y destinos sin fila", () => {
  const actual = convertirV2();
  for (const prioridad of [
    ["sillones", "explora", ...prioridadCompleta.filter((id) => !["sillones", "explora"].includes(id))],
    ["explora", "sillones", ...prioridadCompleta.filter((id) => !["sillones", "explora"].includes(id))]
  ]) {
    assert.deepEqual(obtenerPrioridadCoberturaEfectiva({ prioridadConfigurada: prioridad, filas: actual.filas, categoria: "licenciado", versionEstructura: actual }).prioridadSectorIds, prioridad);
  }
});
probar("guardado v2 válido conserva orden exacto sin mutar input", () => {
  const actual = convertirV2();
  const estado = { configuracionPlanilla: { licenciado: actual } };
  const antes = structuredClone(estado);
  const prioridad = [...prioridadCompleta].reverse();
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({ estadoMensual: estado, categoria: "licenciado", prioridadCoberturaSectorIds: prioridad });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.estado.configuracionPlanilla.licenciado.prioridadCoberturaSectorIds, prioridad);
  assert.deepEqual(estado, antes);
});
probar("guardado v2 inválido no modifica snapshot", () => {
  const actual = convertirV2();
  for (const prioridad of [
    prioridadCompleta.filter((id) => id !== "sillones"),
    prioridadCompleta.filter((id) => id !== "explora"),
    [...prioridadCompleta, "sillones"]
  ]) {
    const estado = { configuracionPlanilla: { licenciado: actual } };
    const resultado = actualizarPrioridadCoberturaEnEstadoMensual({ estadoMensual: estado, categoria: "licenciado", prioridadCoberturaSectorIds: prioridad });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.estado, estado);
  }
});
probar("prioridad legacy bajo v2 se diagnostica sin convertir", () => {
  const legacy = configuracionSectores.licenciado.prioridadSectoresIds;
  const actual = convertirV2();
  const resultado = obtenerPrioridadCoberturaEfectiva({ prioridadConfigurada: legacy, filas: actual.filas, categoria: "licenciado", versionEstructura: actual });
  assert.equal(resultado.requiereConfiguracionV2, true);
  assert.equal(resultado.prioridadSectorIds.includes("reanimacion_sillones"), false);
  assert.equal(resultado.prioridadSectorIds.includes("reanimacion"), false);
});
probar("candidatos v2 respetan sectores base activos y conservan destinos operativos", () => {
  const actual = convertirV2();
  actual.filas = actual.filas.map((fila) =>
    ["observacion_2", "reanimacion"].includes(fila.sectorId) ? { ...fila, activo: false } : fila
  );
  const ids = candidatosEditor("licenciado", actual);
  assert.equal(ids.includes("observacion_2"), false);
  assert.equal(ids.includes("reanimacion"), false);
  assert.equal(ids.includes("sillones"), true);
  assert.equal(ids.includes("explora"), true);
  ["turnante_1", "turnante_2", "turnante_3", "turnante_4", "reanimacion_sillones", "diagnostico_explora"]
    .forEach((id) => assert.equal(ids.includes(id), false));
});
probar("validaciÃ³n y guardado v2 no exigen sectores base desactivados", () => {
  const actual = convertirV2();
  actual.filas = actual.filas.map((fila) =>
    fila.sectorId === "observacion_2" ? { ...fila, activo: false } : fila
  );
  const prioridad = prioridadCompleta.filter((id) => id !== "observacion_2");
  const estado = { configuracionPlanilla: { licenciado: actual } };
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: estado,
    categoria: "licenciado",
    prioridadCoberturaSectorIds: prioridad
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.estado.configuracionPlanilla.licenciado.prioridadCoberturaSectorIds, prioridad);
});
probar("Sillones y Explora siguen obligatorios con sectores base desactivados", () => {
  const actual = convertirV2();
  actual.filas = actual.filas.map((fila) =>
    fila.sectorId === "observacion_2" ? { ...fila, activo: false } : fila
  );
  for (const id of ["sillones", "explora"]) {
    const estado = { configuracionPlanilla: { licenciado: actual } };
    const prioridad = prioridadCompleta.filter((actualId) => actualId !== "observacion_2" && actualId !== id);
    assert.equal(actualizarPrioridadCoberturaEnEstadoMensual({ estadoMensual: estado, categoria: "licenciado", prioridadCoberturaSectorIds: prioridad }).ok, false);
  }
});
probar("lectura v2 excluye sector desactivado sin perder Sillones ni Explora", () => {
  const actual = convertirV2();
  actual.filas = actual.filas.map((fila) =>
    fila.sectorId === "observacion_2" ? { ...fila, activo: false } : fila
  );
  const resultado = obtenerPrioridadCoberturaEfectiva({
    prioridadConfigurada: prioridadCompleta,
    filas: actual.filas,
    categoria: "licenciado",
    versionEstructura: actual
  });
  assert.equal(resultado.prioridadSectorIds.includes("observacion_2"), false);
  assert.equal(resultado.prioridadSectorIds.includes("sillones"), true);
  assert.equal(resultado.prioridadSectorIds.includes("explora"), true);
});
probar("turnos y meses pueden conservar órdenes distintos", () => {
  const ordenA = ["sillones", "explora", ...prioridadCompleta.filter((id) => !["sillones", "explora"].includes(id))];
  const ordenB = ["explora", "sillones", ...prioridadCompleta.filter((id) => !["sillones", "explora"].includes(id))];
  assert.notDeepEqual(ordenA, ordenB);
  assert.notEqual(crearSnapshot("licenciado", "manana", "2026-09").versionId, crearSnapshot("licenciado", "tarde", "2026-10").versionId);
});
probar("snapshots v1 e históricos no activan v2", () => {
  const actual = crearSnapshot("licenciado");
  const antes = structuredClone(actual);
  obtenerPrioridadCoberturaEfectiva({ prioridadConfigurada: actual.prioridadCoberturaSectorIds, filas: actual.filas, prioridadFallback: configuracionSectores.licenciado.prioridadSectoresIds });
  assert.equal(Object.hasOwn(actual, "estructuraLicenciadosVersion"), false);
  assert.deepEqual(actual, antes);
});

console.log(`prioridad-cobertura-licenciados-dinamica: ${total} pruebas OK`);
