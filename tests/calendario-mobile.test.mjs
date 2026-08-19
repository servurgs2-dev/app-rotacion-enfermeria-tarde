import assert from "node:assert/strict";
import fs from "node:fs";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

const app = fs.readFileSync("src/App.jsx", "utf8");
const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
const mobile = fs.readFileSync(
  "src/components/calendario/mobile/VistaDistribucionMobile.jsx",
  "utf8"
);
const bloques = fs.readFileSync(
  "src/components/calendario/mobile/BloquesOperativosMobile.jsx",
  "utf8"
);

probar("existe una vista específica para la distribución mobile", () => {
  assert.match(calendario, /<VistaDistribucionMobile/);
  assert.match(mobile, /md:hidden/);
});

probar("desktop conserva la distribución actual desde md", () => {
  assert.match(calendario, /hidden rounded-2xl border border-slate-100 bg-white md:block/);
  assert.match(calendario, /asignacionesMostradas\.map/);
});

probar("selector mobile mantiene Enfermeros y Licenciados montados", () => {
  assert.match(app, /Categoría del Calendario/);
  assert.match(app, /grid grid-cols-2[^"]*md:hidden/);
  assert.match(app, /aria-pressed=\{tabCalendario === "enfermeros"\}/);
  assert.match(app, /aria-pressed=\{tabCalendario === "licenciados"\}/);
  assert.equal((app.match(/<CalendarioDiario/g) || []).length, 2);
});

probar("consume asignaciones finales sin asumir una cantidad de sectores", () => {
  assert.match(calendario, /asignacionesMostradas\.map\(\(item, indice\)/);
  assert.match(calendario, /asignaciones=\{asignacionesPresentacionMobile\}/);
  assert.doesNotMatch(mobile, /slice\(|length\s*[<>=]|SILLON 3|EXPLORA 1/);
});

probar("el componente mobile no contiene reglas de distribución", () => {
  assert.doesNotMatch(mobile, /redistrib|prioridad|coberturaPareja|dividirReanimacion|sobrantes|turnantesEfectivos/);
  assert.doesNotMatch(mobile, /useEffect|useMemo|useState|setCalendario/);
});

probar("la proyección mobile se construye después de asistenciaMostrada", () => {
  const inicializacionAsistencia = calendario.indexOf("const asistenciaMostrada =");
  const proyeccionMobile = calendario.indexOf("const asignacionesPresentacionMobile =");
  const lecturaAsistencia = calendario.indexOf(
    "obtenerEstadoAsistencia(asistenciaMostrada",
    proyeccionMobile
  );
  assert.ok(inicializacionAsistencia >= 0);
  assert.ok(proyeccionMobile > inicializacionAsistencia);
  assert.ok(lecturaAsistencia > proyeccionMobile);
});

probar("representa sector cubierto, sin cobertura y Turnante", () => {
  assert.match(mobile, /fila\.textoPersona/);
  assert.match(calendario, /obtenerNombreConMarcaTurnante\(item\.enfermero\)/);
  assert.match(calendario, /"Sin cobertura"/);
});

probar("SIN ASIGNAR y destinos sintéticos llegan sin reinterpretación", () => {
  assert.match(calendario, /original: item/);
  assert.match(calendario, /syntheticId: item\.syntheticId/);
  assert.match(mobile, /data-synthetic-id/);
  assert.doesNotMatch(mobile, /REANIMACIÓN \+ SILLONES|REANIMACION \+ SILLONES/);
});

probar("sector crítico usa el resultado productivo ya calculado", () => {
  assert.match(calendario, /sectoresCriticosSinCobertura\.map/);
  assert.match(calendario, /criticoSinCobertura:/);
  assert.match(mobile, /fila\.criticoSinCobertura/);
  assert.match(mobile, />\s*Crítico\s*</);
});

probar("histórico respeta soloLectura y conserva controles manuales", () => {
  assert.match(calendario, /soloLectura=\{soloLecturaEfectiva\}/);
  assert.match(mobile, /disabled=\{soloLectura\}/);
  assert.match(calendario, /onSeleccionar=\{handleClick\}/);
  assert.match(calendario, /onCambiarAsistencia=\{cambiarAsistencia\}/);
});

probar("la lista mobile evita ancho fijo y scroll horizontal", () => {
  assert.match(mobile, /min-w-0/);
  assert.doesNotMatch(mobile, /overflow-x|min-w-\[|w-\[\d/);
});

probar("existen acordeones mobile para los bloques operativos reales", () => {
  assert.match(calendario, /<BloquesOperativosMobile/);
  assert.match(bloques, /<details/);
  for (const titulo of ["Ausentes", "No disponibles", "Extras", "Libres", "Certificados"]) {
    assert.match(bloques, new RegExp(`titulo="${titulo}"`));
  }
});

probar("los acordeones presentan Ausentes al final del orden operativo", () => {
  const titulos = ["No disponibles", "Extras", "Libres", "Certificados", "Ausentes"];
  const posiciones = titulos.map((titulo) => bloques.indexOf(`titulo="${titulo}"`));
  assert.ok(posiciones.every((posicion) => posicion >= 0));
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones);
});

probar("los contadores derivan de los arrays mostrados", () => {
  assert.match(bloques, /cantidad=\{ausentes\.length\}/);
  assert.match(bloques, /cantidad=\{noDisponibles\.length\}/);
  assert.match(bloques, /cantidad=\{extras\.length\}/);
  assert.match(bloques, /cantidad=\{libres\.length\}/);
  assert.match(bloques, /cantidad=\{certificados\.length\}/);
});

probar("reutiliza callbacks operativos y permisos históricos", () => {
  assert.match(calendario, /onCambiarAsistencia=\{cambiarAsistencia\}/);
  assert.match(calendario, /abrirFormularioNoDisponible/);
  assert.match(calendario, /quitarCertificacionRapida/);
  assert.match(calendario, /abrirFormularioExtra/);
  assert.match(calendario, /borrarExtra/);
  assert.match(calendario, /abrirFormularioExtraLibre/);
  assert.match(bloques, /disabled=\{soloLectura/);
  assert.doesNotMatch(bloques, /Gestionar personal|candidatosNoDisponibles/);
});

probar("no duplica formularios ni crea estado o lógica operativa mobile", () => {
  assert.equal((calendario.match(/<PanelNoDisponible/g) || []).length, 1);
  assert.equal((calendario.match(/<PanelAgregarExtra/g) || []).length, 1);
  assert.equal((calendario.match(/<PanelExtraLibre/g) || []).length, 1);
  assert.doesNotMatch(bloques, /useState|useEffect|useMemo|setCalendario|redistrib|sobrantes|prioridad/);
});

probar("SIN ASIGNAR permanece sólo en la distribución y desktop se conserva", () => {
  assert.doesNotMatch(bloques, /SIN ASIGNAR|Disponibles \/ sin asignar/);
  assert.match(calendario, /<div className="hidden md:block">[\s\S]*No disponibles del d/);
  assert.match(bloques, /md:hidden/);
});

probar("los bloques compactos no introducen ancho fijo ni scroll horizontal", () => {
  assert.match(bloques, /min-h-11/);
  assert.match(bloques, /min-w-0/);
  assert.doesNotMatch(bloques, /overflow-x|min-w-\[|w-\[\d/);
});

probar("Calendario usa scroll natural y conserva su contenedor de exportación", () => {
  const inicio = app.indexOf('<div id="calendario-pdf"');
  const fin = app.indexOf("<NavegacionPrincipal", inicio);
  const vistaCalendario = app.slice(inicio, fin);
  assert.ok(inicio >= 0 && fin > inicio);
  assert.match(vistaCalendario, /<h2[^>]*>📅 Calendario diario<\/h2>/);
  assert.equal((vistaCalendario.match(/<CalendarioDiario/g) || []).length, 2);
  assert.doesNotMatch(vistaCalendario, /<Seccion|max-h-\[75vh\]|overflow-y-auto|overscroll-contain/);
});

console.log(`\n${aprobadas} pruebas estructurales del Calendario mobile pasaron.`);
