import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  crearPreflightRestauracion,
  debeMantenerBloqueoRestauracion,
  evaluarDisponibilidadRestauracion,
  seleccionarEstadoCargaVersionada,
  validarConfirmacionRestauracion,
  validarContextoAdopcionRestauracion,
  validarRespuestaRestaurada
} from "../src/utils/restauracionHistorial.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8");
const app = leer("src/App.jsx");
const historial = leer("src/components/historial/HistorialCambios.jsx");
const detalle = leer("src/components/historial/DetalleHistorial.jsx");
const panel = leer("src/components/historial/PanelRestauracionHistorial.jsx");
const helper = leer("src/utils/restauracionHistorial.js");
const servicio = leer("src/services/historialEstadoTurnos.js");
const repositorio = leer("src/services/repositorioHistorialEstadoTurnoMes.js");
const panelConflicto = leer("src/components/concurrencia/PanelConflictoEdicion.jsx");
const packageJson = JSON.parse(leer("package.json"));
const fuentesUi = `${historial}\n${detalle}\n${panel}`;

let cantidad = 0;
const prueba = (nombre, ejecutar) => {
  ejecutar();
  cantidad += 1;
  console.log(`✓ ${cantidad}. ${nombre}`);
};

const metadatosDisponibles = {
  revisionConfirmada: "9007199254740993",
  estado: "guardado",
  conflicto: null
};
const evaluar = (cambios = {}) => evaluarDisponibilidadRestauracion({
  esSupervision: true,
  coincideContexto: true,
  metadatos: metadatosDisponibles,
  estadoCargado: true,
  hayCambiosLocales: false,
  restauracionEnCurso: false,
  ...cambios
});

prueba("Supervisión puede preparar restauración", () => assert.equal(evaluar().permitida, true));
prueba("Licenciado queda bloqueado por permiso", () => assert.equal(evaluar({ esSupervision: false }).codigo, "sin_permiso"));
prueba("Enfermería queda bloqueada por permiso", () => assert.equal(evaluar({ esSupervision: false }).permitida, false));
prueba("restauración se muestra dentro del detalle", () => assert.match(detalle, /PanelRestauracionHistorial/));
prueba("otro turno queda bloqueado", () => assert.equal(evaluar({ coincideContexto: false }).codigo, "otro_contexto"));
prueba("otro mes queda bloqueado", () => assert.match(evaluar({ coincideContexto: false }).mensaje, /primero abrí/));
prueba("UI no cambia automáticamente de contexto", () => assert.doesNotMatch(panel, /setTurnoActivo|setMesActivo/));

prueba("guardado pendiente bloquea", () => assert.equal(evaluar({ metadatos: { ...metadatosDisponibles, estado: "pendiente" } }).codigo, "guardado_pendiente"));
prueba("guardado en curso bloquea", () => assert.equal(evaluar({ metadatos: { ...metadatosDisponibles, estado: "guardando" } }).codigo, "guardado_pendiente"));
prueba("conflicto bloquea", () => assert.equal(evaluar({ metadatos: { ...metadatosDisponibles, conflicto: {} } }).codigo, "conflicto"));
prueba("error de guardado bloquea", () => assert.equal(evaluar({ metadatos: { ...metadatosDisponibles, estado: "error" } }).codigo, "error_guardado"));
prueba("revisión desconocida bloquea", () => assert.equal(evaluar({ metadatos: { ...metadatosDisponibles, revisionConfirmada: "" } }).codigo, "revision_desconocida"));
prueba("revisión cero bloquea", () => assert.equal(evaluar({ metadatos: { ...metadatosDisponibles, revisionConfirmada: "0" } }).permitida, false));
prueba("estado no cargado bloquea", () => assert.equal(evaluar({ estadoCargado: false }).codigo, "no_cargado"));
prueba("cambios locales divergentes bloquean", () => assert.equal(evaluar({ hayCambiosLocales: true }).codigo, "guardado_pendiente"));
prueba("otra restauración en curso bloquea", () => assert.equal(evaluar({ restauracionEnCurso: true }).codigo, "restaurando"));
prueba("App usa detector completo de pendientes", () => assert.match(app, /hayCambiosLocalesPendientes\(\{/));
prueba("App revalida al iniciar", () => assert.match(app, /iniciarRestauracionHistorial[\s\S]*obtenerDisponibilidadRestauracion/));

const anterior = { personal: [{ id: "a", nombre: "Persona A" }] };
const historico = { personal: [{ id: "a", nombre: "Persona B" }] };
const comparar = (a, b) => ({
  seccionesCambiadas: ["personal"],
  resumen: [],
  totales: { agregados: 0, eliminados: 0, modificados: a === b ? 0 : 1 },
  detalle: { personal: [{ tipo: "modificado", descripcion: "Se modificó Personal" }] },
  truncado: false,
  analisisIncompleto: false
});
const preflight = crearPreflightRestauracion({
  revisionHistorica: { data: historico },
  estadoOperativo: {
    existeRemoto: true,
    estado: anterior,
    revision: "9007199254740993",
    updatedAt: "2026-07-24T10:00:00.000Z"
  },
  comparar
});
prueba("preflight usa estado operativo remoto", () => assert.equal(preflight.revisionEsperada, "9007199254740993"));
prueba("preflight conserva updated_at remoto", () => assert.equal(preflight.updatedAt, "2026-07-24T10:00:00.000Z"));
prueba("preflight compara actual contra histórico", () => assert.equal(preflight.impacto.totales.modificados, 1));
prueba("preflight no convierte bigint a Number", () => assert.equal(typeof preflight.revisionEsperada, "string"));
prueba("preflight rechaza fila operativa inexistente", () => assert.throws(() => crearPreflightRestauracion({
  revisionHistorica: { data: historico },
  estadoOperativo: { existeRemoto: false, estado: anterior, revision: "0" },
  comparar
})));
prueba("snapshot idéntico se detecta", () => assert.equal(crearPreflightRestauracion({
  revisionHistorica: { data: historico },
  estadoOperativo: { existeRemoto: true, estado: historico, revision: "4" },
  comparar: () => ({
    seccionesCambiadas: [],
    totales: { agregados: 0, eliminados: 0, modificados: 0 },
    analisisIncompleto: false
  })
}).sinCambios, true));
prueba("análisis incompleto nunca se declara idéntico", () => assert.equal(crearPreflightRestauracion({
  revisionHistorica: { data: historico },
  estadoOperativo: { existeRemoto: true, estado: historico, revision: "4" },
  comparar: () => ({
    seccionesCambiadas: [],
    totales: { agregados: 0, eliminados: 0, modificados: 0 },
    analisisIncompleto: true
  })
}).sinCambios, false));
prueba("preflight llama carga versionada desde App", () => assert.match(app, /cargarEstadoOperativoHistorial[\s\S]*cargarEstadoTurnoMesConRevision/));
prueba("preflight no modifica estado principal", () => {
  const bloque = app.slice(app.indexOf("const cargarEstadoOperativoHistorial"), app.indexOf("const iniciarRestauracionHistorial"));
  assert.doesNotMatch(bloque, /setEstadoPorTurnoMes/);
});
prueba("respuestas de preflight tienen secuencia", () => assert.match(historial, /solicitudRestauracionRef/));

prueba("confirmación requiere casilla principal", () => assert.equal(validarConfirmacionRestauracion({ aceptaReemplazo: false, texto: "RESTAURAR" }), false));
prueba("confirmación requiere texto exacto", () => assert.equal(validarConfirmacionRestauracion({ aceptaReemplazo: true, texto: "RESTAURAR" }), true));
prueba("confirmación admite espacios exteriores", () => assert.equal(validarConfirmacionRestauracion({ aceptaReemplazo: true, texto: " RESTAURAR " }), true));
prueba("confirmación rechaza texto parcial", () => assert.equal(validarConfirmacionRestauracion({ aceptaReemplazo: true, texto: "RESTA" }), false));
prueba("confirmación rechaza minúsculas", () => assert.equal(validarConfirmacionRestauracion({ aceptaReemplazo: true, texto: "restaurar" }), false));
prueba("análisis incompleto exige casilla adicional", () => assert.equal(validarConfirmacionRestauracion({
  aceptaReemplazo: true, texto: "RESTAURAR", analisisIncompleto: true, aceptaAnalisisParcial: false
}), false));
prueba("casilla adicional habilita análisis incompleto", () => assert.equal(validarConfirmacionRestauracion({
  aceptaReemplazo: true, texto: "RESTAURAR", analisisIncompleto: true, aceptaAnalisisParcial: true
}), true));
prueba("UI explica revisión nueva", () => assert.match(panel, /crea una revisión nueva/));
prueba("UI explica que no borra versiones", () => assert.match(panel, /no borra versiones posteriores/));
prueba("UI muestra revisión actual", () => assert.match(panel, /Revisión operativa actual/));
prueba("UI muestra revisión de origen", () => assert.match(panel, /Revisión de origen/));
prueba("UI muestra impacto parcial fuerte", () => assert.match(panel, /El análisis del impacto es parcial/));
prueba("UI muestra truncado con totales completos", () => assert.match(panel, /totales del impacto están completos/));

prueba("componente usa restaurarRevision", () => assert.match(historial, /await restaurarRevision\(\{/));
prueba("envía historialId", () => assert.match(historial, /historialId: revision\.id/));
prueba("envía revisionEsperada", () => assert.match(historial, /revisionEsperada: preflight\.revisionEsperada/));
for (const campo of ["data:", "turno:", "mes:", "autor:", "accion:"]) {
  prueba(`llamada no envía ${campo}`, () => {
    const inicio = historial.indexOf("await restaurarRevision({");
    const llamada = historial.slice(inicio, historial.indexOf("});", inicio) + 3);
    assert.doesNotMatch(llamada, new RegExp(`\\b${campo}`));
  });
}
prueba("componente no llama rpc directamente", () => assert.doesNotMatch(fuentesUi, /\.rpc\s*\(/));
prueba("controles evitan doble ejecución", () => assert.match(panel, /disabled=\{[\s\S]{0,180}ocupada/));
prueba("no existe reintento automático", () => assert.doesNotMatch(historial, /setInterval|reintentoAutomatico/));
prueba("RPC permanece encapsulada en repositorio", () => assert.match(repositorio, /clienteSupabase\.rpc\(/));

prueba("éxito recarga desde servidor", () => assert.match(app, /adoptarRestauracionHistorial[\s\S]*cargarEstadoTurnoMesConRevision/));
prueba("éxito no aplica snapshot histórico directo", () => assert.doesNotMatch(app, /resultadoRestauracion\.data/));
prueba("verifica turno restaurado", () => assert.match(helper, /resultadoRestauracion\.turno !== turnoEsperado/));
prueba("verifica mes restaurado", () => assert.match(helper, /resultadoRestauracion\.mes !== mesEsperado/));
prueba("verifica revisión restaurada", () => assert.match(helper, /revision !== String\(resultadoRestauracion\.revision\)/));
prueba("reutiliza adopción de servidor", () => assert.match(app, /adoptarCargaServidorClave\(clave, cargaValidada\)/));
prueba("adopción actualiza metadatos con carga normalizada", () =>
  assert.match(app, /prepararMetadatosUsarServidor\(carga\)/));
prueba("adopción actualiza referencia base", () => assert.match(app, /referenciasEstadoRef\.current\.set\(clave, estadoServidor\)/));
prueba("adopción marca carga para evitar autosave", () => assert.match(app, /mesesCargadosRef\.current\.add\(clave\)/));
prueba("adopción limpia pendientes", () => assert.match(app, /adoptarCargaServidorClave[\s\S]*limpiarPendientesClave\(clave\)/));
prueba("historial se refresca desde servidor", () => assert.match(historial, /cargarPagina\(\{[\s\S]*reiniciar: true/));
prueba("no inventa fila histórica", () => assert.doesNotMatch(historial, /setItems\([^)]*restaur/));
prueba("muestra éxito luego de adopción", () => assert.match(historial, /tipo === "adoptado"[\s\S]*Revisión restaurada correctamente/));
prueba("fallo de recarga no repite restauración", () => assert.match(historial, /error_post_exito/));
prueba("fallo de recarga muestra instrucción", () => assert.match(historial, /se completó en el servidor[\s\S]*Recargá la aplicación/));
prueba("fallo de recarga bloquea clave", () => assert.match(app, /erroresCargaRef\.current\.add\(clave\)/));

prueba("conflicto no adopta estado", () => {
  const bloque = historial.slice(historial.indexOf('resultado?.tipo === "conflicto"'));
  assert.doesNotMatch(bloque.slice(0, 700), /adoptarRestauracion/);
});
prueba("conflicto no muestra éxito", () => assert.match(historial, /No se aplicó ninguna restauración/));
prueba("conflicto no reintenta", () => assert.match(panel, /Actualizar estado actual/));
prueba("conflicto muestra revisión remota", () => assert.match(historial, /Revisión remota/));
prueba("nuevo intento exige preflight explícito", () => assert.match(panel, /onClick=\{onPreparar\}/));
prueba("conflicto no usa PanelConflictoEdicion", () => assert.doesNotMatch(fuentesUi, /PanelConflictoEdicion/));

for (const [tipo, texto] of [
  ["sin_permiso", "No tenés permiso"],
  ["no_encontrado", "ya no está disponible"]
]) {
  prueba(`maneja ${tipo}`, () => assert.match(historial, new RegExp(texto)));
}
prueba("error genérico es seguro", () => assert.match(historial, /No fue posible restaurar la revisión/));
prueba("errores no incluyen snapshots", () => assert.doesNotMatch(historial, /error\.(data|snapshot|response)/));
prueba("UI no registra datos sensibles", () => assert.doesNotMatch(fuentesUi, /console\.(log|error)/));

prueba("cambio de filtros invalida restauración", () => assert.match(historial, /const aplicarFiltros[\s\S]*invalidarRestauracion/));
prueba("cambio de turno invalida restauración", () => assert.match(historial, /mesActivo, seccionVisible, sesionId, turnoActivo/));
prueba("cambio de mes invalida restauración", () => assert.match(historial, /invalidarRestauracion[\s\S]*mesActivo/));
prueba("cerrar detalle invalida preflight", () => assert.match(historial, /const cerrarDetalle[\s\S]*invalidarRestauracion/));
prueba("la subvista informa visibilidad real", () =>
  assert.match(app, /seccionVisible=\{vistaActiva === "mas" && subvistaMas === "historial"\}/));
prueba("desmontar invalida respuestas", () => assert.match(historial, /montadoRef\.current = false[\s\S]*solicitudRestauracionRef\.current \+= 1/));
prueba("cambiar sesión invalida restauración visual", () => assert.match(historial, /sesionId/));
prueba("respuesta tardía se valida por secuencia", () => assert.match(historial, /solicitud !== solicitudRestauracionRef\.current/));

for (const texto of [
  'type="button"',
  'htmlFor="confirmacion-restaurar"',
  'type="checkbox"',
  'role="alert"',
  'aria-live="polite"',
  "!confirmacionValida",
  "sm:grid-cols-2",
  "overflow-y-auto"
]) {
  prueba(`accesibilidad contiene ${texto}`, () => assert.ok(panel.includes(texto)));
}

prueba("script test:etapa24d2 existe", () => assert.equal(packageJson.scripts["test:etapa24d2"], "node tests/etapa24d2-restauracion-historial.test.mjs"));
prueba("servicio expone restaurarRevision", () => assert.match(servicio, /restaurarRevision/));
prueba("repositorio envía solo dos parámetros RPC", () => {
  const inicio = repositorio.indexOf('"restaurar_estado_turno_mes_desde_historial"');
  const llamada = repositorio.slice(inicio, repositorio.indexOf(");", inicio));
  assert.match(llamada, /p_historial_id/);
  assert.match(llamada, /p_revision_esperada/);
  assert.doesNotMatch(llamada, /p_data|p_turno|p_mes|p_autor|p_accion/);
});
prueba("PanelConflictoEdicion no fue integrado a restauración", () => assert.doesNotMatch(panelConflicto, /historial|restaurarRevision/));
prueba("guardado CAS normal permanece en App", () => assert.match(app, /guardarEstadoTurnoMesConRevision/));
prueba("no hay Supabase directo en componentes", () => assert.doesNotMatch(fuentesUi, /supabase|\.from\(/i));
prueba("fixtures usan datos sintéticos", () => assert.ok(historico.personal[0].nombre === "Persona B"));
prueba("resultado helper es serializable", () => assert.doesNotThrow(() => JSON.stringify(preflight)));
prueba("no se agregaron dependencias de diff", () => assert.equal(packageJson.dependencies["deep-diff"], undefined));
prueba("revisión alta permanece exacta", () => assert.equal(evaluar().revisionConfirmada, "9007199254740993"));
prueba("validación de recarga acepta resultado exacto", () => assert.equal(validarRespuestaRestaurada({
  resultadoRestauracion: { tipo: "restaurado", turno: "noche", mes: "2026-08", revision: "5" },
  cargaServidor: { existeRemoto: true, estado: historico, revision: "5" },
  turnoEsperado: "noche",
  mesEsperado: "2026-08"
}).revision, "5"));
prueba("validación de recarga rechaza revisión distinta", () => assert.throws(() => validarRespuestaRestaurada({
  resultadoRestauracion: { tipo: "restaurado", turno: "noche", mes: "2026-08", revision: "6" },
  cargaServidor: { existeRemoto: true, estado: historico, revision: "5" },
  turnoEsperado: "noche",
  mesEsperado: "2026-08"
})));

const estadoRemotoReal = {
  personal: [{ id: "p1", nombre: "Persona A" }]
};
const seleccionCarga = seleccionarEstadoCargaVersionada({
  existeRemoto: true,
  estado: estadoRemotoReal,
  revision: "11",
  updatedAt: "2026-07-24T10:00:00.000Z"
}, () => ({ personal: [] }));
prueba("existeRemoto adopta exactamente el estado remoto", () =>
  assert.equal(seleccionCarga.estado, estadoRemotoReal));
prueba("existeRemoto no cae en el estado mensual vacío", () =>
  assert.deepEqual(seleccionCarga.estado.personal, [{ id: "p1", nombre: "Persona A" }]));
prueba("normalización conserva revisión once como string", () =>
  assert.equal(seleccionCarga.carga.revision, "11"));
prueba("adopción de App no decide con resultado.existe", () => {
  const inicio = app.indexOf("const adoptarCargaServidorClave");
  const fin = app.indexOf("const obtenerDisponibilidadRestauracion", inicio);
  assert.doesNotMatch(app.slice(inicio, fin), /resultado\.existe/);
});
prueba("éxito y adopción verificada liberan bloqueo", () =>
  assert.equal(debeMantenerBloqueoRestauracion({
    rpcConfirmada: true,
    adopcionVerificada: true
  }), false));
prueba("conflicto previo al éxito libera bloqueo", () =>
  assert.equal(debeMantenerBloqueoRestauracion({
    rpcConfirmada: false,
    adopcionVerificada: false
  }), false));
prueba("error previo al éxito libera bloqueo", () =>
  assert.equal(debeMantenerBloqueoRestauracion({
    rpcConfirmada: false,
    adopcionVerificada: false
  }), false));
prueba("éxito RPC con fallo de recarga conserva bloqueo", () =>
  assert.equal(debeMantenerBloqueoRestauracion({
    rpcConfirmada: true,
    adopcionVerificada: false
  }), true));
prueba("clave bloqueada queda en modo de solo lectura", () =>
  assert.match(app, /modoSoloLecturaEfectiva[\s\S]*clavesBloqueadasTrasRestauracion\.has\(claveActiva\)/));
prueba("clave bloqueada no entra en nuevos guardados", () =>
  assert.match(app, /encolarGuardado[\s\S]{0,900}clavesBloqueadasTrasRestauracionRef\.current\.has\(clave\)/));
prueba("sesión distinta impide adopción", () =>
  assert.equal(validarContextoAdopcionRestauracion({
    inicio: { clave: "noche|2026-08", sesionId: "cuenta-a" },
    clave: "noche|2026-08",
    sesionActual: "cuenta-b",
    turnoActual: "noche",
    mesActual: "2026-08",
    turnoEsperado: "noche",
    mesEsperado: "2026-08"
  }), false));
prueba("cambio de sesión después del éxito conserva bloqueo", () => {
  const sesionValida = validarContextoAdopcionRestauracion({
    inicio: { clave: "noche|2026-08", sesionId: "cuenta-a" },
    clave: "noche|2026-08",
    sesionActual: "cuenta-b",
    turnoActual: "noche",
    mesActual: "2026-08",
    turnoEsperado: "noche",
    mesEsperado: "2026-08"
  });
  assert.equal(debeMantenerBloqueoRestauracion({
    rpcConfirmada: true,
    adopcionVerificada: sesionValida
  }), true);
});
prueba("bloqueo por cambio de sesión pide recargar la aplicación", () =>
  assert.match(app, /clavesBloqueadasTrasRestauracion\.has\(claveActiva\)[\s\S]*Recargá la aplicación/));
prueba("cerrar Historial no invalida sesión ni contexto de adopción", () =>
  assert.equal(validarContextoAdopcionRestauracion({
    inicio: { clave: "noche|2026-08", sesionId: "cuenta-a" },
    clave: "noche|2026-08",
    sesionActual: "cuenta-a",
    turnoActual: "noche",
    mesActual: "2026-08",
    turnoEsperado: "noche",
    mesEsperado: "2026-08"
  }), true));
prueba("no existe liberación incondicional en finally", () => {
  const inicio = app.indexOf("const adoptarRestauracionHistorial");
  const fin = app.indexOf("const descargarCopiaConflicto", inicio);
  assert.doesNotMatch(app.slice(inicio, fin), /finally/);
});
prueba("fallo de recarga no repite la RPC", () => {
  const inicio = historial.indexOf('estado: "error_post_exito"');
  assert.doesNotMatch(historial.slice(inicio, inicio + 600), /restaurarRevision\(/);
});
prueba("la carga con remoto existente exige estado válido", () =>
  assert.throws(() => seleccionarEstadoCargaVersionada({
    existeRemoto: true,
    estado: null,
    revision: "11"
  }, () => ({ personal: [] }))));

const crearPreflightConImpacto = (impacto) => crearPreflightRestauracion({
  revisionHistorica: { data: historico },
  estadoOperativo: {
    existeRemoto: true,
    estado: anterior,
    revision: "12",
    updatedAt: "2026-07-24T11:00:00.000Z"
  },
  comparar: () => impacto
});
prueba("idénticos sin secciones cambiadas producen sinCambios true", () =>
  assert.equal(crearPreflightConImpacto({
    seccionesCambiadas: [],
    totales: { agregados: 0, eliminados: 0, modificados: 0 },
    analisisIncompleto: false
  }).sinCambios, true));
prueba("sección futura con totales cero no se declara idéntica", () =>
  assert.equal(crearPreflightConImpacto({
    seccionesCambiadas: ["seccion_futura"],
    totales: { agregados: 0, eliminados: 0, modificados: 0 },
    analisisIncompleto: false
  }).sinCambios, false));
prueba("seccionesCambiadas ausente usa criterio conservador", () =>
  assert.equal(crearPreflightConImpacto({
    totales: { agregados: 0, eliminados: 0, modificados: 0 },
    analisisIncompleto: false
  }).sinCambios, false));
prueba("análisis incompleto con cero cambios nunca se declara idéntico", () =>
  assert.equal(crearPreflightConImpacto({
    seccionesCambiadas: [],
    totales: { agregados: 0, eliminados: 0, modificados: 0 },
    analisisIncompleto: true
  }).sinCambios, false));
prueba("UI informa cambios generales sin desglose", () =>
  assert.match(panel, /Se detectaron cambios generales en secciones que no admiten un desglose más específico/));
prueba("migraciones siguen fuera del alcance de la corrección", () =>
  assert.doesNotMatch(helper, /supabase\/migrations|create\s+(table|function)/i));
prueba("package-lock sigue sin script 24D2", () =>
  assert.doesNotMatch(leer("package-lock.json"), /test:etapa24d2/));
prueba("PanelConflictoEdicion sigue ajeno al preflight", () =>
  assert.doesNotMatch(panelConflicto, /crearPreflightRestauracion|sinCambios|seccionesCambiadas/));

console.log(`\n${cantidad} pruebas permanentes de Etapa 24D2 superadas.`);
