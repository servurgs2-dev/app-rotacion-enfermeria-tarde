import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  convertirFechaLocalAIso,
  crearFiltrosConsultaHistorial,
  crearNombreSnapshotHistorial,
  crearSnapshotDescargable,
  formatearAccionHistorial,
  formatearAutorHistorial,
  formatearSeccionHistorial,
  unirRegistrosHistorial
} from "../src/components/historial/historialPresentacion.js";
import { esPerfilSupervision } from "../src/utils/permisos.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8");
const app = leer("src/App.jsx");
const historial = leer("src/components/historial/HistorialCambios.jsx");
const detalle = leer("src/components/historial/DetalleHistorial.jsx");
const presentacion = leer("src/components/historial/historialPresentacion.js");
const repositorio = leer("src/services/repositorioHistorialEstadoTurnoMes.js");
const servicio = leer("src/services/historialEstadoTurnos.js");
const panel = leer("src/components/concurrencia/PanelConflictoEdicion.jsx");
const packageJson = JSON.parse(leer("package.json"));
const componentesHistorial = `${historial}\n${detalle}\n${presentacion}`;

let cantidad = 0;
const prueba = (nombre, ejecutar) => {
  ejecutar();
  cantidad += 1;
  console.log(`✓ ${cantidad}. ${nombre}`);
};

const perfilSupervision = {
  usuario: "supervision",
  rol: "supervision",
  turno: null,
  activo: true
};
const perfilLicenciado = {
  usuario: "licenciado-prueba",
  rol: "licenciado",
  turno: "noche",
  activo: true
};
const perfilEnfermeria = {
  usuario: "enfermeria-prueba",
  rol: "enfermeria",
  turno: null,
  activo: true
};

prueba("Historial aparece condicionado por Supervisión", () =>
  assert.match(app, /\{esPerfilSupervision\(perfil\) && \([\s\S]*titulo="🕘 Historial"/));
prueba("perfil Supervisión obtiene acceso", () =>
  assert.equal(esPerfilSupervision(perfilSupervision), true));
prueba("Licenciado no obtiene acceso", () =>
  assert.equal(esPerfilSupervision(perfilLicenciado), false));
prueba("Enfermería no obtiene acceso", () =>
  assert.equal(esPerfilSupervision(perfilEnfermeria), false));
prueba("sección inicia cerrada", () => {
  const bloque = app.slice(app.indexOf('titulo="🕘 Historial"'));
  assert.doesNotMatch(bloque.slice(0, 300), /defaultAbierto/);
});
prueba("usa componente Seccion actual", () =>
  assert.match(app, /<Seccion[\s\S]*titulo="🕘 Historial"/));
prueba("no altera títulos de secciones existentes", () => {
  for (const titulo of ["Personal", "Planilla mensual", "Licencias", "Certificaciones médicas", "Estadísticas", "Calendario diario"]) {
    assert.ok(app.includes(titulo));
  }
});
prueba("Historial queda junto a Estadísticas", () =>
  assert.ok(app.indexOf('titulo="🕘 Historial"') > app.indexOf('titulo="📈 Estadísticas"')));
prueba("usa scroll interno", () =>
  assert.match(app, /titulo="🕘 Historial"[\s\S]{0,200}max-h-\[75vh\][\s\S]{0,100}overflow-y-auto/));
prueba("mantiene patrón montado del acordeón", () =>
  assert.match(leer("src/components/ui/Seccion.jsx"), /abierto \? "block" : "hidden"/));

for (const filtro of ["Turno", "Mes", "Acción", "Cuenta", "Desde", "Hasta"]) {
  prueba(`incluye filtro ${filtro}`, () => assert.ok(historial.includes(filtro)));
}
prueba("incluye Aplicar filtros", () => assert.match(historial, />\s*Aplicar filtros\s*</));
prueba("incluye Limpiar filtros", () => assert.match(historial, />\s*Limpiar filtros\s*</));
prueba("aplicar reinicia detalle y lista", () => {
  assert.match(historial, /const aplicarFiltros[\s\S]*solicitudListaRef\.current \+= 1/);
  assert.match(historial, /setDetalle\(\{[\s\S]*estado: "inactivo"/);
});
prueba("limpiar reinicia filtros", () =>
  assert.match(historial, /const limpiarFiltros[\s\S]*crearFiltrosIniciales\("", ""\)/));
prueba("fecha local se convierte a ISO", () =>
  assert.match(convertirFechaLocalAIso("2026-08-01"), /^\d{4}-\d{2}-\d{2}T.*Z$/));
prueba("fecha final cubre fin del día local", () => {
  const iso = convertirFechaLocalAIso("2026-08-01", { finDelDia: true });
  const fechaLocal = new Date(iso);
  assert.equal(fechaLocal.getHours(), 23);
  assert.equal(fechaLocal.getMinutes(), 59);
  assert.equal(fechaLocal.getSeconds(), 59);
  assert.equal(fechaLocal.getMilliseconds(), 999);
});
prueba("fecha ambigua se rechaza", () =>
  assert.throws(() => convertirFechaLocalAIso("01/08/2026"), /YYYY-MM-DD/));
prueba("rango invertido se rechaza", () =>
  assert.throws(() => crearFiltrosConsultaHistorial({
    turno: "",
    mes: "",
    accion: "",
    usuarioId: "",
    fechaDesde: "2026-08-02",
    fechaHasta: "2026-08-01"
  }), /posterior/));
prueba("turnos usan ids reales", () =>
  assert.match(historial, /Object\.values\(TURNOS\)[\s\S]*value=\{turno\.id\}/));
prueba("acciones incluyen las cuatro traducciones", () => {
  for (const accion of ["linea_base", "creacion", "actualizacion_cas", "restauracion"]) {
    assert.notEqual(formatearAccionHistorial(accion), accion);
  }
});
prueba("usuario se limita a autores cargados", () =>
  assert.match(historial, /autoresDisponibles[\s\S]*items\.forEach/));

prueba("listado usa listarHistorial", () =>
  assert.match(historial, /await listarHistorial\(/));
prueba("listado del repositorio excluye data", () => {
  const campos = repositorio.slice(
    repositorio.indexOf("const CAMPOS_LISTADO"),
    repositorio.indexOf("const CAMPOS_DETALLE")
  );
  assert.doesNotMatch(campos, /["']data["']/);
});
prueba("muestra fecha", () => assert.match(historial, /formatearFechaHistorial\(item\.createdAt\)/));
prueba("muestra autor", () => assert.match(historial, /formatearAutorHistorial\(item\)/));
prueba("muestra revisión anterior y nueva", () =>
  assert.match(historial, /item\.revisionAnterior[\s\S]*→ \{item\.revision\}/));
prueba("traduce acciones", () => assert.equal(formatearAccionHistorial("actualizacion_cas"), "Actualización"));
prueba("traduce secciones", () => assert.equal(formatearSeccionHistorial("planillas"), "Planillas"));
prueba("línea base sin autor muestra Sistema", () =>
  assert.equal(formatearAutorHistorial({ accion: "linea_base" }), "Sistema"));
prueba("autor ausente no inventa persona", () =>
  assert.equal(formatearAutorHistorial({ accion: "creacion" }), "Cuenta no identificada"));
prueba("tiene Ver detalles", () => assert.match(historial, />\s*Ver detalles\s*</));
prueba("usa id como key", () => assert.match(historial, /<article key=\{item\.id\}/));
prueba("maneja lista vacía", () =>
  assert.match(historial, /No hay cambios históricos para los filtros seleccionados/));
prueba("maneja sin permiso", () =>
  assert.match(historial, /No tenés permiso para consultar el historial/));
prueba("maneja error seguro", () =>
  assert.match(historial, /No se pudo cargar el historial\. Intentá nuevamente\./));
prueba("no muestra respuestas completas", () =>
  assert.doesNotMatch(componentesHistorial, /console\./));

prueba("usa siguienteCursor", () => assert.match(historial, /siguienteCursor/));
prueba("Cargar más conserva resultados", () =>
  assert.match(historial, /reiniciar\s*\?\s*unirRegistrosHistorial\(\[\]/));
prueba("evita duplicados por id", () => {
  const unidos = unirRegistrosHistorial(
    [{ id: "1", revision: "1" }],
    [{ id: "1", revision: "1" }, { id: "2", revision: "2" }]
  );
  assert.deepEqual(unidos.map((item) => item.id), ["1", "2"]);
});
prueba("deshabilita Cargar más durante carga", () =>
  assert.match(historial, /disabled=\{estadoLista === "cargando_mas"\}/));
prueba("paginación no usa offset", () =>
  assert.doesNotMatch(historial, /\boffset\b/i));
prueba("filtros invalidan solicitud anterior", () =>
  assert.match(historial, /solicitudListaRef\.current \+= 1/));

prueba("detalle usa cargarRevisionHistorial", () =>
  assert.match(historial, /await cargarRevisionHistorial\(id\)/));
prueba("consulta individual usa maybeSingle", () =>
  assert.match(repositorio, /const cargarRevisionHistorial[\s\S]*maybeSingle\(\)/));
prueba("servicio expone cargarRevisionAnterior", () =>
  assert.match(servicio, /cargarRevisionAnterior/));
prueba("revisión anterior usa turno mes y revisión", () =>
  assert.match(historial, /cargarRevisionAnterior\(\{[\s\S]*turno:[\s\S]*mes:[\s\S]*revision:/));
prueba("consulta anterior solicita una fila", () =>
  assert.match(repositorio, /cargarRevisionHistorialPorContexto[\s\S]*maybeSingle\(\)/));
prueba("maneja ausencia de revisión anterior", () =>
  assert.match(detalle, /La versión anterior no está disponible/));
prueba("maneja primera versión", () =>
  assert.match(detalle, /Esta es la primera versión registrada/));
prueba("usa comparador", () =>
  assert.match(historial, /compararRevisiones\(revisionAnterior\.data, revision\.data\)/));
prueba("muestra tres totales", () => {
  for (const total of ["agregados", "eliminados", "modificados"]) assert.ok(detalle.includes(total));
});
prueba("muestra detalle por sección", () =>
  assert.match(detalle, /Object\.entries\(diferencias\.detalle\)/));
prueba("muestra advertencia truncado", () =>
  assert.match(detalle, /Se limitaron algunos detalles/));
prueba("muestra advertencia de análisis incompleto", () =>
  assert.match(detalle, /Las secciones y cantidades mostradas pueden ser parciales/));
prueba("no renderiza snapshot completo al abrir", () =>
  assert.match(detalle, /useState\(false\)/));
prueba("previas se muestran en bloques colapsables", () =>
  assert.match(detalle, /const VistaValor[\s\S]*<details/));

prueba("existe Opciones avanzadas", () => assert.match(detalle, /Opciones avanzadas/));
prueba("Opciones avanzadas usa details cerrado", () => {
  assert.match(detalle, /<details className="mt-5/);
  assert.doesNotMatch(detalle, /<details[^>]*\sopen/);
});
prueba("puede ver snapshot técnico sin JSON automático", () =>
  assert.match(detalle, /Ver snapshot técnico/));
prueba("puede descargar snapshot técnico", () =>
  assert.match(detalle, /Descargar snapshot técnico/));
prueba("advierte datos personales", () =>
  assert.match(detalle, /puede contener datos personales/));
prueba("nombre de descarga es seguro", () =>
  assert.equal(
    crearNombreSnapshotHistorial({ turno: "noche", mes: "2026-08", revision: "3" }),
    "app-urgencias-historial-noche-2026-08-revision-3.json"
  ));
prueba("snapshot descargable conserva datos sintéticos", () => {
  const data = { personal: [{ id: "p1", nombre: "Persona A" }] };
  assert.equal(crearSnapshotDescargable({
    turno: "noche",
    mes: "2026-08",
    revision: "3",
    revisionAnterior: "2",
    accion: "actualizacion_cas",
    createdAt: "2026-08-01T00:00:00Z",
    data
  }).data, data);
});
prueba("descarga no llama Supabase", () =>
  assert.doesNotMatch(presentacion, /supabase|\.rpc\(/i));

prueba("listado usa secuencia de solicitud", () =>
  assert.match(historial, /solicitudListaRef/));
prueba("detalle usa secuencia independiente", () =>
  assert.match(historial, /solicitudDetalleRef/));
prueba("respuesta vieja de lista se descarta", () =>
  assert.match(historial, /solicitud !== solicitudListaRef\.current/));
prueba("respuesta vieja de detalle se descarta", () =>
  assert.match(historial, /solicitud !== solicitudDetalleRef\.current/));
prueba("cierre invalida detalle en carga", () =>
  assert.match(historial, /const cerrarDetalle[\s\S]*solicitudDetalleRef\.current \+= 1/));
prueba("desmontaje evita actualizaciones", () =>
  assert.match(historial, /montadoRef\.current = false/));

prueba("todos los botones declaran type button", () => {
  const botones = componentesHistorial.match(/<button\b[^>]*>/g) ?? [];
  assert.ok(botones.length > 0);
  assert.ok(botones.every((boton) => /type="button"/.test(boton)));
});
prueba("inputs están asociados mediante label envolvente", () => {
  assert.match(historial, /<label[\s\S]*<input/);
  assert.match(historial, /<label[\s\S]*<select/);
});
prueba("errores usan role alert", () => assert.match(componentesHistorial, /role="alert"/));
prueba("cargas usan aria-live", () => assert.match(componentesHistorial, /aria-live="polite"/));
prueba("layout es responsive", () =>
  assert.match(historial, /sm:grid-cols-2[\s\S]*lg:grid-cols-3/));
prueba("botones se deshabilitan durante carga", () =>
  assert.match(historial, /disabled=\{estadoLista === "cargando"\}/));

prueba("no existe botón Restaurar", () =>
  assert.doesNotMatch(componentesHistorial, />\s*Restaurar(?:\s|<)/));
prueba("UI no importa restaurarRevision", () =>
  assert.doesNotMatch(componentesHistorial, /restaurarRevision/));
prueba("UI no llama RPC", () =>
  assert.doesNotMatch(componentesHistorial, /\.rpc\(/));
prueba("UI no modifica estadoPorTurnoMes", () =>
  assert.doesNotMatch(componentesHistorial, /setEstadoPorTurnoMes/));
prueba("UI no toca cola CAS", () =>
  assert.doesNotMatch(componentesHistorial, /colaGuardado|guardarEstadoTurnoMesConRevision/));
prueba("PanelConflictoEdicion permanece ajeno", () =>
  assert.doesNotMatch(panel, /HistorialCambios|restaurarRevision/));

prueba("migraciones de historial permanecen presentes", () => {
  assert.ok(fs.existsSync(path.join(raiz, "supabase/migrations/20260724_crear_historial_estado_turno_mes.sql")));
  assert.ok(fs.existsSync(path.join(raiz, "supabase/migrations/20260725_agregar_consulta_y_restauracion_historial.sql")));
});
prueba("App conserva guardado versionado", () =>
  assert.match(app, /guardarEstadoTurnoMesConRevision/));
prueba("pruebas anteriores permanecen", () => {
  for (const script of ["test:etapa20", "test:etapa23b", "test:etapa23c", "test:etapa23d", "test:etapa24b", "test:etapa24c"]) {
    assert.ok(packageJson.scripts[script]);
  }
});
prueba("package-lock no cambia por script", () =>
  assert.doesNotMatch(leer("package-lock.json"), /test:etapa24d1/));
prueba("no se agregan dependencias", () => {
  assert.equal(packageJson.dependencies["@testing-library/react"], undefined);
  assert.equal(packageJson.devDependencies?.vitest, undefined);
});
prueba("tests no crean conexión externa", () =>
  assert.doesNotMatch(leer("tests/etapa24d1-interfaz-historial.test.mjs"), /createClient\(/));
prueba("fixtures usan nombres sintéticos", () => {
  assert.match(leer("tests/etapa24d1-interfaz-historial.test.mjs"), /Persona A/);
  assert.match(leer("tests/etapa24d1-interfaz-historial.test.mjs"), /supervision/);
});
prueba("script 24D1 queda configurado", () =>
  assert.equal(packageJson.scripts["test:etapa24d1"], "node tests/etapa24d1-interfaz-historial.test.mjs"));

console.log(`\n${cantidad} pruebas permanentes de Etapa 24D1 superadas.`);
