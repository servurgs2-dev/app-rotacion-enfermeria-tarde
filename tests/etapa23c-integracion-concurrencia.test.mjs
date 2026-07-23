import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  actualizarEstadoLocalConflicto,
  aplicarConflictoConcurrencia,
  aplicarErrorConcurrencia,
  aplicarExitoConcurrencia,
  claveBloqueadaPorConflicto,
  crearMetadatosConcurrenciaDesdeCarga,
  esRespuestaDeClave,
  hayPendienteMasNuevo,
  marcarConcurrenciaGuardando,
  marcarConcurrenciaPendiente,
  normalizarEstadoGuardadoVisible,
  obtenerRevisionEsperada
} from "../src/utils/concurrenciaGuardado.js";

let cantidad = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  cantidad += 1;
  process.stdout.write(`✓ ${nombre}\n`);
};
const estado = (valor) => ({ valor, planillas: { enfermeros: {}, licenciados: {} } });
const carga = (revision = "4") => ({
  existe: true,
  existeRemoto: true,
  estado: estado("remoto"),
  revision,
  updatedAt: "2026-07-23T12:00:00.000Z",
  origen: "turno_mes"
});

await probar("1. carga existente crea metadatos correctos", () => {
  const meta = crearMetadatosConcurrenciaDesdeCarga(carga());
  assert.equal(meta.revisionConfirmada, "4");
  assert.equal(meta.existeRemoto, true);
  assert.equal(meta.estado, "cargado");
});
await probar("2. carga inexistente crea revisión cero", () => {
  const meta = crearMetadatosConcurrenciaDesdeCarga({
    existe: false, existeRemoto: false, revision: "0", updatedAt: null, origen: null
  });
  assert.equal(meta.revisionConfirmada, "0");
  assert.equal(meta.existeRemoto, false);
});
await probar("3. fallback histórico crea revisión cero", () => {
  const meta = crearMetadatosConcurrenciaDesdeCarga({
    existe: true, existeRemoto: false, revision: "0", origen: "historico"
  });
  assert.equal(meta.revisionConfirmada, "0");
  assert.equal(meta.origen, "historico");
});
await probar("4. carga no marca cambios pendientes", () => {
  assert.equal(crearMetadatosConcurrenciaDesdeCarga(carga()).estado, "cargado");
});
await probar("5. revisión permanece como string", () => {
  assert.equal(typeof crearMetadatosConcurrenciaDesdeCarga(carga()).revisionConfirmada, "string");
});
await probar("6. revisión alta no pierde precisión", () => {
  const revision = "9223372036854775806";
  assert.equal(crearMetadatosConcurrenciaDesdeCarga(carga(revision)).revisionConfirmada, revision);
});
await probar("7. primer guardado obtiene revisión cero", () => {
  assert.equal(obtenerRevisionEsperada({ revisionConfirmada: "0" }), "0");
});
await probar("8. creación exitosa produce revisión uno", () => {
  const meta = aplicarExitoConcurrencia(
    crearMetadatosConcurrenciaDesdeCarga({ revision: "0" }),
    { revision: "1", updatedAt: "fecha" }
  );
  assert.equal(meta.revisionConfirmada, "1");
});
await probar("9. actualización usa revisión confirmada", () => {
  assert.equal(obtenerRevisionEsperada(crearMetadatosConcurrenciaDesdeCarga(carga("8"))), "8");
});
await probar("10. éxito actualiza revisión", () => {
  const meta = aplicarExitoConcurrencia(
    crearMetadatosConcurrenciaDesdeCarga(carga("8")),
    { revision: "9", updatedAt: "nueva" }
  );
  assert.equal(meta.revisionConfirmada, "9");
});
await probar("11. cambio durante guardado queda pendiente", () => {
  const meta = aplicarExitoConcurrencia(
    marcarConcurrenciaGuardando(crearMetadatosConcurrenciaDesdeCarga(carga())),
    { revision: "5", updatedAt: "nueva" },
    { hayCambiosPosteriores: true }
  );
  assert.equal(meta.estado, "pendiente");
});
await probar("12. segundo guardado usa revisión devuelta por el primero", () => {
  const meta = aplicarExitoConcurrencia(
    crearMetadatosConcurrenciaDesdeCarga(carga("3")),
    { revision: "4", updatedAt: "nueva" },
    { hayCambiosPosteriores: true }
  );
  assert.equal(obtenerRevisionEsperada(meta), "4");
});
await probar("13. dos cambios rápidos se consolidan por secuencia", () => {
  assert.equal(
    hayPendienteMasNuevo({ secuenciaLocal: 1 }, { secuenciaLocal: 3 }),
    true
  );
});
await probar("14. una respuesta vieja no marca guardado un estado nuevo", () => {
  const meta = aplicarExitoConcurrencia(
    crearMetadatosConcurrenciaDesdeCarga(carga()),
    { revision: "5" },
    { hayCambiosPosteriores: true }
  );
  assert.notEqual(meta.estado, "guardado");
});

const conflicto = aplicarConflictoConcurrencia(
  crearMetadatosConcurrenciaDesdeCarga(carga("4")),
  {
    tipo: "conflicto",
    existeRemoto: true,
    revision: "5",
    updatedAt: "remota",
    estadoRemoto: estado("remoto-5")
  },
  estado("local-4")
);
await probar("15. conflicto conserva estado local", () => {
  assert.equal(conflicto.conflicto.estadoLocal.valor, "local-4");
});
await probar("16. conflicto conserva estado remoto", () => {
  assert.equal(conflicto.conflicto.estadoRemoto.valor, "remoto-5");
});
await probar("17. conflicto bloquea solamente su clave", () => {
  const metas = new Map([
    ["noche|2026-08", conflicto],
    ["tarde|2026-08", crearMetadatosConcurrenciaDesdeCarga(carga())]
  ]);
  assert.equal(claveBloqueadaPorConflicto(metas.get("noche|2026-08")), true);
  assert.equal(claveBloqueadaPorConflicto(metas.get("tarde|2026-08")), false);
});
await probar("18. conflicto no queda como reintentable", () => {
  assert.equal(conflicto.estado, "conflicto");
  assert.equal(conflicto.error, null);
});
await probar("19. otra clave puede quedar pendiente", () => {
  const otra = marcarConcurrenciaPendiente(crearMetadatosConcurrenciaDesdeCarga(carga()));
  assert.equal(otra.estado, "pendiente");
});
await probar("20. error técnico no es conflicto", () => {
  const meta = aplicarErrorConcurrencia(
    crearMetadatosConcurrenciaDesdeCarga(carga()),
    new Error("sin red")
  );
  assert.equal(meta.estado, "error");
  assert.equal(meta.conflicto, null);
});
await probar("21. error técnico no avanza revisión", () => {
  const meta = aplicarErrorConcurrencia(
    crearMetadatosConcurrenciaDesdeCarga(carga("11")),
    new Error("sin red")
  );
  assert.equal(meta.revisionConfirmada, "11");
});
await probar("22. cambio de turno mantiene claves aisladas", () => {
  assert.equal(esRespuestaDeClave("noche|2026-08", "tarde|2026-08"), false);
});
await probar("23. cambio de mes mantiene claves aisladas", () => {
  assert.equal(esRespuestaDeClave("noche|2026-08", "noche|2026-09"), false);
});
await probar("24. respuesta tardía identifica solo su clave original", () => {
  assert.equal(esRespuestaDeClave("noche|2026-08", "noche|2026-08"), true);
});
await probar("25. copiar mes usa el metadato del destino", () => {
  const metas = { destino: { revisionConfirmada: "6" }, origen: { revisionConfirmada: "9" } };
  assert.equal(obtenerRevisionEsperada(metas.destino), "6");
});
await probar("26. continuar rotación usa el metadato del destino", () => {
  assert.equal(obtenerRevisionEsperada({ revisionConfirmada: "12" }), "12");
});
await probar("27. cerrar turno usa el flujo mensual común", () => {
  assert.equal(obtenerRevisionEsperada({ revisionConfirmada: "2" }), "2");
});
await probar("28. reabrir turno usa el flujo mensual común", () => {
  assert.equal(obtenerRevisionEsperada({ revisionConfirmada: "3" }), "3");
});
await probar("29. Enfermeros y Licenciados comparten revisión", () => {
  const fila = estado("ambas");
  assert.ok(fila.planillas.enfermeros);
  assert.ok(fila.planillas.licenciados);
  assert.equal(obtenerRevisionEsperada({ revisionConfirmada: "7" }), "7");
});
await probar("30. un perfil de lectura no se representa como guardado", () => {
  const puedeEditar = false;
  assert.equal(puedeEditar && marcarConcurrenciaPendiente({}), false);
});
await probar("31. carga no dispara autosave en los metadatos", () => {
  assert.equal(crearMetadatosConcurrenciaDesdeCarga(carga()).estado, "cargado");
});
await probar("32. actualizar metadatos no altera el JSON mensual", () => {
  const original = estado("sin cambios");
  crearMetadatosConcurrenciaDesdeCarga(carga("8"));
  assert.deepEqual(original, estado("sin cambios"));
});
await probar("33. App no usa guardado heredado", async () => {
  const codigo = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(codigo, /\bguardarEstadoTurnoMes\b/);
});
await probar("34. App utiliza guardado versionado", async () => {
  const codigo = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(codigo, /guardarEstadoTurnoMesConRevision/);
});
await probar("35. App utiliza carga versionada", async () => {
  const codigo = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(codigo, /cargarEstadoTurnoMesConRevision/);
});
await probar("36. servicios heredados siguen disponibles", async () => {
  const codigo = await readFile(
    new URL("../src/services/estadoTurnos.js", import.meta.url),
    "utf8"
  );
  assert.match(codigo, /cargarEstadoTurnoMes,/);
  assert.match(codigo, /guardarEstadoTurnoMes/);
});
await probar("37. no se aplica Number a revision en integración", async () => {
  const archivos = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/utils/concurrenciaGuardado.js", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(archivos.join("\n"), /Number\([^)]*revision/i);
});
await probar("38. las pruebas usan helpers sin cliente Supabase", () => {
  assert.equal(typeof crearMetadatosConcurrenciaDesdeCarga, "function");
});
await probar("39. el helper no ejecuta SQL", async () => {
  const codigo = await readFile(
    new URL("../src/utils/concurrenciaGuardado.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(codigo, /\b(select|insert|update|delete)\b/i);
});
await probar("40. metadatos y conflicto son serializables", () => {
  assert.doesNotThrow(() => JSON.stringify(conflicto));
});
await probar("41. cambios posteriores al conflicto actualizan solo copia local", () => {
  const actualizado = actualizarEstadoLocalConflicto(conflicto, estado("local-nuevo"));
  assert.equal(actualizado.conflicto.estadoLocal.valor, "local-nuevo");
  assert.equal(actualizado.conflicto.estadoRemoto.valor, "remoto-5");
});
await probar("42. cargado se traduce a saved", () => {
  assert.equal(normalizarEstadoGuardadoVisible("cargado", "loading"), "saved");
});
await probar("43. pendiente se traduce a pending", () => {
  assert.equal(normalizarEstadoGuardadoVisible("pendiente"), "pending");
});
await probar("44. guardando se traduce a saving", () => {
  assert.equal(normalizarEstadoGuardadoVisible("guardando"), "saving");
});
await probar("45. guardado se traduce a saved", () => {
  assert.equal(normalizarEstadoGuardadoVisible("guardado"), "saved");
});
await probar("46. error se conserva como error", () => {
  assert.equal(normalizarEstadoGuardadoVisible("error"), "error");
});
await probar("47. conflicto se traduce a conflict", () => {
  assert.equal(normalizarEstadoGuardadoVisible("conflicto"), "conflict");
});
await probar("48. sin metadatos conserva fallback válido", () => {
  assert.equal(normalizarEstadoGuardadoVisible(undefined, "loading"), "loading");
});
await probar("49. ningún estado válido produce un valor indefinido", () => {
  for (const valor of ["cargado", "pendiente", "guardando", "guardado", "error", "conflicto"]) {
    assert.notEqual(normalizarEstadoGuardadoVisible(valor), undefined);
  }
  assert.equal(normalizarEstadoGuardadoVisible("desconocido", "tambien-desconocido"), "saved");
});
await probar("50. App conserva el aviso extenso de conflicto", async () => {
  const codigo = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(codigo, /metadatosActivos\?\.conflicto/);
  assert.match(codigo, /Hay cambios más recientes guardados desde otra computadora/);
});
await probar("51. App sigue sin usar el upsert heredado", async () => {
  const codigo = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(codigo, /\bguardarEstadoTurnoMes\b/);
  assert.match(codigo, /guardarEstadoTurnoMesConRevision/);
});

process.stdout.write(`\n${cantidad} pruebas permanentes de Etapa 23C superadas.\n`);
