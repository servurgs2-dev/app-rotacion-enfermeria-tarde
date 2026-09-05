import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { reiniciarMesEnEstado } from "../src/utils/limpiezaSegura.js";
import { analizarRecuperacionMesActual } from "../src/utils/recuperacionMesActual.js";
import { clasificarEstadoMesDestino } from "../src/utils/preparacionMesNuevo.js";
import { obtenerPreparacionesMes } from "../src/utils/preparacionesMes.js";
import { obtenerMesAnterior } from "../src/utils/periodosMensuales.js";
import { ejecutarReinicioMesCompleto } from "../src/services/reinicioMes.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/mes/PanelReiniciarMes.jsx", import.meta.url), "utf8");
const bloqueReinicio = app.slice(
  app.indexOf("const abrirReinicioMes"),
  app.indexOf("const iniciarPreparacionMes")
);
const bloqueGestion = app.slice(
  app.indexOf("preparacionesMesActual?.ok"),
  app.indexOf("edicionPrioridadCobertura?.clave")
);

const categoria = (marca) => ({
  configuracion: { marca, filas: [{ filaId: `fila-${marca}`, sectorId: `sector-${marca}`, activa: true }] },
  planilla: { semana1: { [marca]: { personaId: `persona-${marca}` } } }
});
const preparacion = (id, desde, hasta) => ({
  id,
  desde,
  hasta,
  creadaEn: "2026-09-04T10:00:00.000Z",
  creadaPor: "supervision",
  origen: "nueva_preparacion_desde_fecha",
  categorias: { enfermero: categoria(`${id}-e`), licenciado: categoria(`${id}-l`) }
});
const estadoVersionado = (cantidad = 3) => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "p1", nombre: "Persona" }];
  estado.planillas.enfermeros.semana1 = { REA: { personaId: "p1" } };
  estado.configuracionPlanilla = { enfermero: { filas: [{ filaId: "legacy" }] } };
  estado.calendario.enfermeros.cambiosDia["2026-09-02"] = { REA: { personaId: "p1" } };
  estado.licencias = [{ id: "lic-1" }];
  estado.certificaciones = [{ id: "cert-1" }];
  estado.calendario.enfermeros.cierresDia["2026-09-02"] = { snapshot: { cerrado: true } };
  const rangos = cantidad === 2
    ? [["a", "2026-09-01", "2026-09-03"], ["b", "2026-09-04", "2026-09-30"]]
    : cantidad === 3
      ? [["a", "2026-09-01", "2026-09-03"], ["b", "2026-09-04", "2026-09-16"], ["c", "2026-09-17", "2026-09-30"]]
      : [["a", "2026-09-01", "2026-09-03"], ["b", "2026-09-04", "2026-09-10"], ["c", "2026-09-11", "2026-09-20"], ["d", "2026-09-21", "2026-09-30"]];
  estado.preparaciones = rangos.map(([id, desde, hasta]) => preparacion(id, desde, hasta));
  return estado;
};
const reiniciar = (estado) => reiniciarMesEnEstado({
  estadoPorTurnoMes: { "noche|2026-09": estado, "tarde|2026-09": { conservar: true } },
  clave: "noche|2026-09",
  crearEstadoVacio: crearEstadoMensualVacio
});

probar("reinicio legacy converge exactamente a crearEstadoMensualVacio", () => {
  assert.deepEqual(reiniciar({ personal: [{ id: "p" }], planillas: { dato: true } })["noche|2026-09"], crearEstadoMensualVacio());
});
probar("contrato legacy elimina Personal local", () => assert.deepEqual(reiniciar(estadoVersionado())["noche|2026-09"].personal, []));
probar("contrato legacy limpia Planillas", () => assert.deepEqual(reiniciar(estadoVersionado())["noche|2026-09"].planillas, crearEstadoMensualVacio().planillas));
probar("contrato legacy limpia configuración", () => assert.deepEqual(reiniciar(estadoVersionado())["noche|2026-09"].configuracionPlanilla, crearEstadoMensualVacio().configuracionPlanilla));
probar("contrato legacy limpia Calendario y operaciones locales", () => assert.deepEqual(reiniciar(estadoVersionado())["noche|2026-09"].calendario, crearEstadoMensualVacio().calendario));
probar("contrato legacy limpia Licencias locales", () => assert.deepEqual(reiniciar(estadoVersionado())["noche|2026-09"].licencias, []));
probar("contrato legacy limpia Certificaciones locales", () => assert.deepEqual(reiniciar(estadoVersionado())["noche|2026-09"].certificaciones, []));
probar("contrato legacy limpia cierres y snapshots locales", () => assert.deepEqual(reiniciar(estadoVersionado())["noche|2026-09"].calendario.enfermeros.cierresDia, {}));
probar("reinicio no afecta otro turno", () => assert.deepEqual(reiniciar(estadoVersionado())["tarde|2026-09"], { conservar: true }));

for (const cantidad of [2, 3, 4]) {
  probar(`estado con ${cantidad} preparaciones se reinicia en una sola transformación`, () => {
    const resultado = reiniciar(estadoVersionado(cantidad))["noche|2026-09"];
    assert.deepEqual(resultado, crearEstadoMensualVacio());
  });
}
probar("el estado fuente A/B/C no se muta", () => {
  const fuente = estadoVersionado();
  const copia = structuredClone(fuente);
  reiniciar(fuente);
  assert.deepEqual(fuente, copia);
});
probar("la autoridad preparaciones se elimina por ausencia de propiedad", () => {
  assert.equal(Object.hasOwn(reiniciar(estadoVersionado())["noche|2026-09"], "preparaciones"), false);
});
probar("nunca queda preparaciones vacío", () => assert.notDeepEqual(reiniciar(estadoVersionado())["noche|2026-09"].preparaciones, []));
probar("no quedan preparaciones detectables", () => {
  assert.equal(obtenerPreparacionesMes({ estado: reiniciar(estadoVersionado())["noche|2026-09"], mes: "2026-09" }).codigo, "SIN_PREPARACION");
});
probar("top-level legacy residual queda saneado", () => {
  const estado = reiniciar(estadoVersionado())["noche|2026-09"];
  assert.deepEqual(estado.planillas, crearEstadoMensualVacio().planillas);
  assert.deepEqual(estado.configuracionPlanilla, crearEstadoMensualVacio().configuracionPlanilla);
});
probar("resultado se clasifica como mes no preparado", () => {
  assert.equal(clasificarEstadoMesDestino({ existeRemoto: true, estado: reiniciar(estadoVersionado())["noche|2026-09"] }).permitido, true);
});
probar("40B vuelve a permitir recuperar R cuando la auditoría externa está limpia", () => {
  const analisis = analizarRecuperacionMesActual({
    mes: "2026-09",
    mesReferencia: "2026-09",
    fechaReferencia: new Date("2026-09-04T12:00:00"),
    turno: "noche",
    existeRemoto: true,
    estado: reiniciar(estadoVersionado())["noche|2026-09"],
    novedadesExternas: [],
    padronVigencias: []
  });
  assert.equal(analisis.permitida, true);
  assert.equal(analisis.mesOrigen, "2026-08");
});
probar("la fuente normal de Setiembre continúa siendo Agosto", () => assert.equal(obtenerMesAnterior("2026-09"), "2026-08"));

probar("Gestión versionada muestra Reiniciar mes completo", () => assert.match(bloqueGestion, />\s*Reiniciar mes completo\s*</));
probar("reinicio está separado de Nueva preparación", () => {
  assert.match(app, />\s*Nueva preparación desde una fecha\s*</);
  assert.match(bloqueGestion, /border-t[\s\S]*Reiniciar mes completo/);
});
probar("click versionado abre la confirmación existente", () => assert.match(bloqueGestion, /onClick=\{abrirReinicioMes\}/));
probar("confirmación describe el alcance destructivo real", () => {
  for (const texto of ["Personal", "Planilla de Enfermeros", "Calendario Diario", "licencias", "certificaciones", "cierres", "rotación nocturna"]) {
    assert.ok(panel.includes(texto), texto);
  }
});
probar("cancelar sólo cierra el modal", () => assert.match(app, /onCancelar=\{\(\) => setReinicioMes\(null\)\}/));
probar("confirmación exige REINICIAR", () => assert.match(panel, /textoConfirmacion\.trim\(\) === "REINICIAR"/));
probar("confirmación actualiza React una sola vez después del CAS", () => {
  assert.equal((bloqueReinicio.match(/setEstadoPorTurnoMes\(/g) || []).length, 1);
  assert.match(bloqueReinicio, /await ejecutarReinicioMesCompleto/);
  assert.match(bloqueReinicio, /if \(!resultado\.aplicado\)/);
});
probar("reinicio revalida revisión e identidad del estado", () => {
  assert.match(bloqueReinicio, /revisionConfirmada/);
  assert.match(bloqueReinicio, /estadoEsperado === estadoActual/);
});
probar("permisos usan puedeMutarClaveMensual", () => assert.match(bloqueReinicio, /puedeMutarClaveMensual/));
probar("conflicto bloquea apertura y confirmación", () => assert.ok((bloqueReinicio.match(/metadatos\?\.conflicto/g) || []).length >= 2));
probar("guardados pendientes bloquean apertura y confirmación", () => assert.ok((bloqueReinicio.match(/hayPendientesEnClave/g) || []).length >= 2));
probar("sólo lectura oculta la acción versionada", () => assert.match(bloqueGestion, /puedeEditarActivo && !modoSoloLecturaEfectiva/));
probar("autosave conserva la vía mensual única", () => {
  assert.match(bloqueReinicio, /guardarMes\(turnoId, mes, estado, revisionEsperada\)/);
  assert.match(bloqueReinicio, /setEstadoGuardado\("saved"\)/);
  assert.doesNotMatch(bloqueReinicio, /encolarGuardado|setEstadoGuardado\("pending"\)/);
});
probar("no se borran preparaciones una por una", () => assert.doesNotMatch(bloqueReinicio, /splice|filter\(|pop\(|shift\(/));
probar("modal usa ModalMobileShell", () => assert.match(panel, /ModalMobileShell/));
probar("modal mantiene Cancelar y acción destructiva accesibles", () => {
  assert.match(panel, />\s*Cancelar\s*</);
  assert.match(panel, /Sí, reiniciar mes completo/);
});
probar("reinicio no contiene SQL RPC ni Supabase", () => assert.doesNotMatch(bloqueReinicio, /supabase|rpc\(|sql/i));

await (async () => {
  let llamadas = 0;
  let recibido;
  const fuente = estadoVersionado();
  const resultado = await ejecutarReinicioMesCompleto({
    turnoId: "noche",
    mes: "2026-09",
    revisionEsperada: "7",
    crearEstadoVacio: crearEstadoMensualVacio,
    guardar: async (argumentos) => {
      llamadas += 1;
      recibido = argumentos;
      return { tipo: "guardado", revision: "8" };
    }
  });
  assert.equal(llamadas, 1);
  assert.deepEqual(recibido.estado, crearEstadoMensualVacio());
  assert.equal(recibido.revisionEsperada, "7");
  assert.equal(resultado.aplicado, true);
  assert.deepEqual(fuente, estadoVersionado());
  total += 1;
  console.log("✓ servicio persiste una vez el documento vacío completo con revisión esperada");
})();

await (async () => {
  const resultado = await ejecutarReinicioMesCompleto({
    turnoId: "noche",
    mes: "2026-09",
    revisionEsperada: "7",
    crearEstadoVacio: crearEstadoMensualVacio,
    guardar: async () => ({ tipo: "conflicto", revisionActual: "8" })
  });
  assert.equal(resultado.aplicado, false);
  assert.equal(resultado.persistencia.tipo, "conflicto");
  total += 1;
  console.log("✓ conflicto CAS no se informa como reinicio aplicado");
})();

await (async () => {
  await assert.rejects(
    ejecutarReinicioMesCompleto({
      turnoId: "noche",
      mes: "2026-09",
      revisionEsperada: "7",
      crearEstadoVacio: crearEstadoMensualVacio,
      guardar: async () => { throw new Error("fallo remoto"); }
    }),
    /fallo remoto/
  );
  total += 1;
  console.log("✓ error remoto impide aplicar el resultado local");
})();

console.log(`\n${total} comprobaciones de Etapa 40E.3.2 superadas.`);
