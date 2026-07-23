import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  crearNombreRespaldoConflicto,
  crearRespaldoConflicto,
  existeCopiaLocalConflicto,
  formatearFechaRemota,
  interpretarClaveConflicto,
  listarConflictosPendientes,
  prepararMetadatosUsarServidor,
  prepararResolucionConservarLocal
} from "../src/utils/resolucionConflicto.js";
import {
  aplicarConflictoConcurrencia,
  aplicarErrorResolucionConflicto,
  aplicarExitoConcurrencia,
  claveBloqueadaPorConflicto
} from "../src/utils/concurrenciaGuardado.js";

let cantidad = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  cantidad += 1;
  process.stdout.write(`✓ ${nombre}\n`);
};
const local = {
  personal: [{ id: "p1", nombre: "Ana" }],
  planillas: { enfermeros: {}, licenciados: {} }
};
const conflicto = {
  revisionRemota: "5",
  updatedAtRemoto: "2026-07-23T14:30:00.000Z",
  existeRemoto: true,
  estadoLocal: structuredClone(local),
  estadoRemoto: { remoto: true }
};
const respaldo = crearRespaldoConflicto({
  turnoId: "noche",
  mes: "2026-08",
  conflicto,
  creadoEn: "2026-07-23T14:30:00.000Z"
});
const nombre = crearNombreRespaldoConflicto({
  turnoId: "noche",
  mes: "2026-08",
  creadoEn: "2026-07-23T14:30:00.000Z"
});
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = await readFile(
  new URL("../src/components/concurrencia/PanelConflictoEdicion.jsx", import.meta.url),
  "utf8"
);
const helper = await readFile(
  new URL("../src/utils/resolucionConflicto.js", import.meta.url),
  "utf8"
);
const inicioUsarServidor = app.indexOf("const usarVersionServidor");
const finUsarServidor = app.indexOf("const conservarVersionLocal");
const bloqueUsarServidor = app.slice(inicioUsarServidor, finUsarServidor);
const bloqueErrorUsarServidor = bloqueUsarServidor.slice(
  bloqueUsarServidor.indexOf("} catch (error)")
);

const casos = [
  ["1. respaldo tiene tipo correcto", () => assert.equal(respaldo.tipo, "respaldo_conflicto_app_urgencias")],
  ["2. respaldo incluye turno", () => assert.equal(respaldo.turno, "noche")],
  ["3. respaldo incluye mes", () => assert.equal(respaldo.mes, "2026-08")],
  ["4. respaldo incluye revisión remota", () => assert.equal(respaldo.revisionRemotaDetectada, "5")],
  ["5. respaldo incluye updatedAt remoto", () => assert.equal(respaldo.updatedAtRemoto, conflicto.updatedAtRemoto)],
  ["6. respaldo incluye última copia local", () => assert.deepEqual(respaldo.estadoLocal, local)],
  ["7. respaldo elimina sesión y tokens", () => {
    const seguro = crearRespaldoConflicto({
      turnoId: "noche", mes: "2026-08",
      conflicto: { ...conflicto, estadoLocal: { dato: 1, session: "x", access_token: "x", anidado: { contraseña: "x" } } }
    });
    assert.equal(JSON.stringify(seguro).includes('"session"'), false);
    assert.equal(JSON.stringify(seguro).includes("access_token"), false);
    assert.equal(JSON.stringify(seguro).includes("contraseña"), false);
  }],
  ["8. respaldo no muta local", () => assert.deepEqual(conflicto.estadoLocal, local)],
  ["9. respaldo es serializable", () => assert.doesNotThrow(() => JSON.stringify(respaldo))],
  ["10. nombre de archivo es válido", () => assert.equal(nombre, "app-urgencias-conflicto-noche-2026-08-20260723143000.json")],
  ["11. nombre no contiene caracteres peligrosos", () => assert.doesNotMatch(nombre, /[\\/:*?"<>|]/)],
  ["12. usar servidor requiere confirmación", () => assert.match(app, /window\.confirm\([\s\S]*Se descartarán/)],
  ["13. usar servidor vuelve a cargar", () => assert.match(app, /const resultado = await cargarEstadoTurnoMesConRevision/)],
  ["14. no usa solo remoto almacenado", () => assert.match(app, /usarVersionServidor = async/)],
  ["15. reemplaza solo clave afectada", () => assert.match(app, /\{ \.\.\.prev, \[clave\]: estadoServidor \}/)],
  ["16. servidor actualiza revisión", () => assert.equal(prepararMetadatosUsarServidor({ revision: "8" }).revisionConfirmada, "8")],
  ["17. servidor limpia conflicto", () => assert.equal(prepararMetadatosUsarServidor({ revision: "8" }).conflicto, null)],
  ["18. servidor cancela debounce", () => assert.match(app, /clearTimeout\(debouncesGuardadoRef\.current\.get\(clave\)\)/)],
  ["19. servidor retira cola", () => assert.match(app, /colaGuardadoRef\.current\.delete\(clave\)/)],
  ["20. servidor no afecta otra clave", () => assert.doesNotMatch(app, /colaGuardadoRef\.current\.clear/)],
  ["21. recarga evita autosave", () => assert.match(app, /mesesCargadosRef\.current\.add\(clave\)/)],
  ["22. error de carga conserva conflicto", () => assert.doesNotMatch(bloqueErrorUsarServidor, /actualizarMetadatosClave/)],
  ["23. error conserva copia local", () => assert.match(app, /actualizarResolucionClave\([\s\S]*\"error\"/)],
  ["24. fallback histórico conserva cero", () => assert.equal(prepararMetadatosUsarServidor({ revision: "0", existeRemoto: false, origen: "historico" }).revisionConfirmada, "0")],
  ["25. mes inexistente conserva cero", () => assert.equal(prepararMetadatosUsarServidor({ revision: "0", existeRemoto: false }).revisionConfirmada, "0")],
  ["26. conservar usa última copia local", () => assert.deepEqual(prepararResolucionConservarLocal({ conflicto }).estadoLocal, local)],
  ["27. conservar usa revisionRemota", () => assert.equal(prepararResolucionConservarLocal({ conflicto }).revisionEsperada, "5")],
  ["28. conflicto sin fila usa cero", () => assert.equal(prepararResolucionConservarLocal({ conflicto: { ...conflicto, existeRemoto: false } }).revisionEsperada, "0")],
  ["29. nunca usa upsert heredado", () => assert.doesNotMatch(app, /\bguardarEstadoTurnoMes\b/)],
  ["30. éxito actualiza revisión por cola CAS", () => assert.match(app, /aplicarExitoConcurrencia/)],
  ["31. preparación conserva conflicto hasta el éxito", () => assert.deepEqual(prepararResolucionConservarLocal({ revisionConfirmada: "4", conflicto }).metadatos.conflicto, conflicto)],
  ["32. nuevo conflicto conserva local", () => assert.match(app, /aplicarConflictoConcurrencia\(actuales, resultado, estadoLocal\)/)],
  ["33. nuevo conflicto actualiza remoto", () => assert.match(app, /resultado\?\.tipo === "conflicto"/)],
  ["34. error no avanza revisión", () => assert.match(app, /aplicarErrorConcurrencia/)],
  ["35. error conserva local en cola", () => assert.match(app, /colaGuardadoRef\.current\.set\(clave, pendiente\)/)],
  ["36. no hay reintento infinito", () => assert.match(app, /mesesConErrorGuardadoRef\.current\.add\(clave\)/)],
  ["37. resolver una clave no modifica otra", () => assert.doesNotMatch(app, /metadatosPorClaveRef\.current\.clear/)],
  ["38. clave sigue bloqueada sin resolver", () => assert.match(app, /claveBloqueadaPorConflicto/)],
  ["39. otra clave puede seguir guardando", () => assert.match(app, /\.find\(\s*\(\[clave, pendiente\]\)/)],
  ["40. sin conflictos no bloquea cierre", () => assert.match(app, /cantidadConflictos/)],
  ["41. conflicto restante bloquea cierre", () => assert.match(app, /cantidadErroresGuardado:[\s\S]*cantidadConflictos/)],
  ["42. clave válida se interpreta", () => assert.deepEqual(interpretarClaveConflicto("noche|2026-08"), { turnoId: "noche", mes: "2026-08" })],
  ["43. clave inválida se rechaza", () => assert.equal(interpretarClaveConflicto("noche|2026-99"), null)],
  ["44. ir cambia turno y mes", () => {
    assert.match(app, /setTurnoActivo\(contexto\.turnoId\)/);
    assert.match(app, /setMesActivo\(contexto\.mes\)/);
  }],
  ["45. ir no resuelve automáticamente", () => assert.doesNotMatch(app, /irAlConflicto[\s\S]{0,400}actualizarMetadatosClave/)],
  ["46. lista todos los conflictos", () => assert.equal(listarConflictosPendientes({ "noche|2026-08": { estado: "resolviendo_conflicto", conflicto }, "tarde|2026-09": { estado: "error", conflicto } }, { noche: { nombre: "Noche" }, tarde: { nombre: "Tarde" } }).length, 2)],
  ["47. editor dispone de acciones principales y respaldo avanzado", () => {
    assert.match(panel, /Descargar respaldo técnico/);
    assert.match(panel, /Usar versión del servidor/);
    assert.match(panel, /Conservar mi versión y guardar/);
  }],
  ["48. solo lectura no ve acciones de escritura", () => assert.match(panel, /\{puedeResolver &&/)],
  ["49. solo lectura puede descargar", () => assert.match(panel, /onClick=\{onDescargar\}/)],
  ["50. otro turno sin permiso no usa servidor", () => assert.match(app, /!puedeEditarTurno\(perfil, contexto\.turnoId\)/)],
  ["51. otro turno sin permiso no guarda local", () => assert.ok((app.match(/!puedeEditarTurno\(perfil, contexto\.turnoId\)/g) || []).length >= 2)],
  ["52. App carga versionado al usar servidor", () => assert.match(app, /cargarEstadoTurnoMesConRevision/)],
  ["53. App conserva local por cola CAS", () => assert.match(app, /encolarGuardado\(\{[\s\S]*data: preparacion\.estadoLocal/)],
  ["54. App no usa guardado heredado", () => assert.doesNotMatch(app, /\bguardarEstadoTurnoMes\b/)],
  ["55. existe aviso global", () => assert.match(app, /Hay \{conflictosPendientes\.length\} conflicto/)],
  ["56. existe PanelConflictoEdicion", () => assert.match(app, /<PanelConflictoEdicion/)],
  ["57. helpers no ejecutan SQL ni Supabase", () => assert.doesNotMatch(helper, /\b(supabase|select|insert|update|delete)\b/i)],
  ["58. resultado de preparación es serializable", () => assert.doesNotThrow(() => JSON.stringify(prepararResolucionConservarLocal({ conflicto })))],
  ["59. copia local válida se reconoce", () => assert.equal(existeCopiaLocalConflicto(conflicto), true)],
  ["60. fecha remota inválida es segura", () => assert.equal(formatearFechaRemota("incorrecta"), "No registrada")],
  ["61. preparar conservación no limpia conflicto", () => {
    const preparado = prepararResolucionConservarLocal({ revisionConfirmada: "4", conflicto });
    assert.ok(preparado.metadatos.conflicto);
    assert.equal(preparado.metadatos.estado, "resolviendo_conflicto");
  }],
  ["62. copia remota permanece durante intento", () => assert.deepEqual(
    prepararResolucionConservarLocal({ revisionConfirmada: "4", conflicto }).metadatos.conflicto.estadoRemoto,
    conflicto.estadoRemoto
  )],
  ["63. copia local permanece durante intento", () => assert.deepEqual(
    prepararResolucionConservarLocal({ revisionConfirmada: "4", conflicto }).metadatos.conflicto.estadoLocal,
    conflicto.estadoLocal
  )],
  ["64. revisión confirmada no avanza antes del éxito", () => assert.equal(
    prepararResolucionConservarLocal({ revisionConfirmada: "4", conflicto }).metadatos.revisionConfirmada,
    "4"
  )],
  ["65. entrada explícita lleva revisión remota", () => {
    assert.match(app, /esResolucionConflicto: true/);
    assert.match(app, /revisionEsperadaResolucion: preparacion\.revisionEsperada/);
  }],
  ["66. cola normal bloquea conflicto", () => assert.equal(claveBloqueadaPorConflicto({ conflicto }), true)],
  ["67. cola permite solo resolución explícita", () => assert.match(
    app,
    /claveBloqueadaPorConflicto\(metadatos\) && !esResolucionConflicto/
  )],
  ["68. panel visible durante guardando local", () => assert.match(
    app,
    /\{Boolean\(metadatosActivos\?\.conflicto\) && \(\s*<PanelConflictoEdicion/
  )],
  ["69. panel visible ante error técnico", () => {
    const conError = aplicarErrorResolucionConflicto(
      { revisionConfirmada: "4", estado: "resolviendo_conflicto", conflicto },
      new Error("red")
    );
    assert.ok(conError.conflicto);
    assert.equal(conError.estado, "conflicto");
  }],
  ["70. error técnico conserva conflicto", () => assert.ok(
    aplicarErrorResolucionConflicto({ conflicto }, new Error("red")).conflicto
  )],
  ["71. error técnico conserva local y remoto", () => {
    const resultado = aplicarErrorResolucionConflicto({ conflicto }, new Error("red"));
    assert.deepEqual(resultado.conflicto.estadoLocal, conflicto.estadoLocal);
    assert.deepEqual(resultado.conflicto.estadoRemoto, conflicto.estadoRemoto);
  }],
  ["72. segundo conflicto sustituye remoto y conserva local enviado", () => {
    const nuevoLocal = { ultima: true };
    const nuevoRemoto = { revision: 6 };
    const resultado = aplicarConflictoConcurrencia(
      { revisionConfirmada: "4", conflicto },
      { revision: "6", updatedAt: "2026-07-23T15:00:00Z", existeRemoto: true, estadoRemoto: nuevoRemoto },
      nuevoLocal
    );
    assert.deepEqual(resultado.conflicto.estadoLocal, nuevoLocal);
    assert.deepEqual(resultado.conflicto.estadoRemoto, nuevoRemoto);
    assert.equal(resultado.conflicto.revisionRemota, "6");
  }],
  ["73. éxito es el evento que limpia conflicto", () => assert.equal(
    aplicarExitoConcurrencia(
      { revisionConfirmada: "4", conflicto },
      { revision: "6", updatedAt: "2026-07-23T15:00:00Z" }
    ).conflicto,
    null
  )],
  ["74. antes del éxito permanece en lista global", () => assert.equal(
    listarConflictosPendientes({ "noche|2026-08": { estado: "resolviendo_conflicto", conflicto } }, {}).length,
    1
  )],
  ["75. antes del éxito bloquea cierre", () => assert.match(
    app,
    /\(metadatos\) => Boolean\(metadatos\.conflicto\)/
  )],
  ["76. después del éxito sale de lista", () => {
    const exito = aplicarExitoConcurrencia({ conflicto }, { revision: "6" });
    assert.equal(listarConflictosPendientes({ "noche|2026-08": exito }, {}).length, 0);
  }],
  ["77. después del último éxito habilita cierre", () => assert.equal(
    Boolean(aplicarExitoConcurrencia({ conflicto }, { revision: "6" }).conflicto),
    false
  )],
  ["78. listado filtra por conflicto existente", () => {
    const listado = listarConflictosPendientes({
      "noche|2026-08": { estado: "error", conflicto },
      "tarde|2026-08": { estado: "conflicto", conflicto: null }
    }, {});
    assert.deepEqual(listado.map((item) => item.clave), ["noche|2026-08"]);
  }],
  ["79. aviso aparece sin turno", () => assert.match(
    app,
    /if \(!turnoActivo\)[\s\S]*\{avisoGlobalConflictos\}[\s\S]*<SelectorTurno/
  )],
  ["80. aviso aparece con turno activo", () => assert.match(
    app,
    /return \(\s*<div className="min-h-screen[\s\S]*\{avisoGlobalConflictos\}[\s\S]*<PanelConflictoEdicion/
  )],
  ["81. aviso no se duplica en una misma vista", () => assert.equal(
    (app.match(/\{avisoGlobalConflictos\}/g) || []).length,
    2
  )],
  ["82. ir al conflicto no limpia metadatos", () => assert.doesNotMatch(
    app.slice(app.indexOf("const irAlConflicto"), app.indexOf("const avisoGlobalConflictos")),
    /actualizarMetadatosClave|conflicto:\s*null/
  )],
  ["83. App sigue sin guardado heredado", () => assert.doesNotMatch(app, /\bguardarEstadoTurnoMes\b/)],
  ["84. tests no contienen cliente externo", () => assert.doesNotMatch(helper, /\bsupabase\b/i)],
  ["85. existe Opciones avanzadas", () => assert.match(panel, /Opciones avanzadas/)],
  ["86. opciones avanzadas usa details y summary", () => {
    assert.match(panel, /<details/);
    assert.match(panel, /<summary/);
  }],
  ["87. opciones avanzadas está cerrada por defecto", () => assert.doesNotMatch(panel, /<details[^>]*\sopen(?:=|\s|>)/)],
  ["88. texto anterior de descarga fue eliminado", () => assert.doesNotMatch(panel, /Descargar mi copia/)],
  ["89. aparece Descargar respaldo técnico", () => assert.match(panel, /Descargar respaldo técnico/)],
  ["90. explica el uso administrativo", () => assert.match(panel, /Utilizala solamente si te lo solicita el administrador/)],
  ["91. advierte sobre datos personales", () => assert.match(panel, /El archivo puede contener datos personales/)],
  ["92. callback de descarga permanece conectado una sola vez", () => assert.equal(
    (panel.match(/onClick=\{onDescargar\}/g) || []).length,
    1
  )],
  ["93. acciones principales aparecen antes de opciones avanzadas", () => {
    assert.ok(panel.indexOf("Usar versión del servidor") < panel.indexOf("Opciones avanzadas"));
    assert.ok(panel.indexOf("Conservar mi versión y guardar") < panel.indexOf("Opciones avanzadas"));
  }],
  ["94. solo los editores ven acciones de escritura", () => {
    const inicioPermisos = panel.indexOf("{puedeResolver &&");
    const finPermisos = panel.indexOf("<details");
    const bloquePermisos = panel.slice(inicioPermisos, finPermisos);
    assert.match(bloquePermisos, /onUsarServidor/);
    assert.match(bloquePermisos, /onConservarLocal/);
    assert.doesNotMatch(bloquePermisos, /onDescargar/);
  }],
  ["95. solo lectura conserva descarga fuera del permiso de escritura", () => {
    assert.ok(panel.indexOf("<details") > panel.indexOf("{puedeResolver &&"));
    assert.match(panel.slice(panel.indexOf("<details")), /onClick=\{onDescargar\}/);
  }],
  ["96. todos los botones mantienen type button", () => assert.equal(
    (panel.match(/<button/g) || []).length,
    (panel.match(/type="button"/g) || []).length
  )],
  ["97. opciones avanzadas no agrega llamadas externas", () => assert.doesNotMatch(panel, /\b(supabase|rpc|fetch)\b/i)],
  ["98. lógica de resolución permanece en App", () => {
    assert.match(app, /cargarEstadoTurnoMesConRevision/);
    assert.match(app, /esResolucionConflicto: true/);
  }]
];

for (const [nombreCaso, prueba] of casos) await probar(nombreCaso, prueba);
process.stdout.write(`\n${cantidad} pruebas permanentes de Etapa 23D superadas.\n`);
