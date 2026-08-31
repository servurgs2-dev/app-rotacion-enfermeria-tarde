import assert from "node:assert/strict";
import fs from "node:fs";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

const app = fs.readFileSync("src/App.jsx", "utf8");
const hub = fs.readFileSync("src/components/layout/HubMas.jsx", "utf8");
const navegacion = fs.readFileSync("src/components/layout/NavegacionPrincipal.jsx", "utf8");
const extraerEntre = (inicio, fin) => {
  const posicionInicio = app.indexOf(inicio);
  const posicionFin = app.indexOf(fin, posicionInicio);
  assert.ok(posicionInicio >= 0 && posicionFin > posicionInicio);
  return app.slice(posicionInicio, posicionFin);
};
const vistaPersonal = extraerEntre('subvistaMas === "personal"', '<div id="planilla-principal"');
const vistaGestionMes = extraerEntre('subvistaMas === "gestionMes"', 'subvistaMas === "estadisticas"');
const vistaEstadisticas = extraerEntre('subvistaMas === "estadisticas"', '{esPerfilSupervision(perfil) && (');
const vistaHistorial = extraerEntre('subvistaMas === "historial"', '<div id="calendario-pdf"');

probar("Más tiene un hub con las cuatro herramientas conocidas", () => {
  assert.match(app, /<HubMas/);
  for (const titulo of ["Personal", "Gestión del mes", "Estadísticas", "Historial"]) {
    assert.match(hub, new RegExp(`titulo: "${titulo}"`));
  }
});

probar("las opciones del hub son botones táctiles reales", () => {
  assert.match(hub, /opcionesVisibles\.map/);
  assert.match(hub, /<button[\s\S]*?type="button"[\s\S]*?onClick=\{\(\) => onAbrir\(opcion\.id\)\}/);
  assert.match(hub, /min-h-20 w-full/);
  assert.doesNotMatch(hub, /<div[^>]*onClick=/);
});

probar("Historial conserva el permiso real de Supervisión", () => {
  assert.match(hub, /requiereSupervision: true/);
  assert.match(hub, /!opcion\.requiereSupervision \|\| esSupervision/);
  assert.match(app, /esSupervision=\{esPerfilSupervision\(perfil\)\}/);
  assert.match(app, /\{esPerfilSupervision\(perfil\) && \(/);
});

probar("cada tarjeta abre exclusivamente su subvista", () => {
  for (const id of ["personal", "gestionMes", "estadisticas", "historial"]) {
    assert.match(app, new RegExp(`subvistaMas === "${id}"`));
  }
  assert.match(app, /const \[subvistaMas, setSubvistaMas\] = useState\(null\)/);
});

probar("cada herramienta permite volver al hub Más", () => {
  assert.equal((app.match(/<BotonVolverMas/g) || []).length, 4);
  assert.match(hub, /<button[\s\S]*?onClick=\{onVolver\}[\s\S]*?← Más/);
  assert.match(app, /onVolver=\{\(\) => setSubvistaMas\(null\)\}/);
});

probar("las cuatro subviews son pantallas completas sin Seccion principal", () => {
  for (const [vista, titulo] of [
    [vistaPersonal, "Personal"],
    [vistaGestionMes, "Gestión del mes"],
    [vistaEstadisticas, "Estadísticas"],
    [vistaHistorial, "Historial"]
  ]) {
    assert.doesNotMatch(vista, /<Seccion/);
    assert.doesNotMatch(vista, /max-h-\[|overflow-y-auto|overscroll-contain/);
    assert.match(vista, new RegExp(`<h2[^>]*>[^<]*${titulo}</h2>`));
  }
});

probar("Historial recibe visibilidad de la navegación y no de un acordeón", () => {
  assert.match(vistaHistorial, /seccionVisible=\{vistaActiva === "mas" && subvistaMas === "historial"\}/);
  assert.doesNotMatch(app, /historialAbierto|setHistorialAbierto|onCambioAbierto=\{setHistorialAbierto\}/);
});

probar("tocar Más en la barra inferior siempre vuelve al hub", () => {
  assert.match(app, /if \(nuevaVista === "mas"\) setSubvistaMas\(null\)/);
  assert.match(app, /onCambiarVista=\{cambiarVistaPrincipal\}/);
  assert.match(navegacion, /vistaActiva === destino\.id/);
  assert.match(navegacion, /aria-current=\{activo \? "page" : undefined\}/);
});

probar("las herramientas permanecen montadas y no se duplican", () => {
  assert.equal((app.match(/<ListaPersonal/g) || []).length, 1);
  assert.equal((app.match(/<Estadisticas/g) || []).length, 1);
  assert.equal((app.match(/<HistorialCambios/g) || []).length, 1);
  assert.match(app, /subvistaMas === "personal" && !mesActivoSinInformacion \? "" : "hidden"/);
  assert.match(app, /subvistaMas === "estadisticas" \? "" : "hidden"/);
});

probar("no incorpora Router ni persistencia de la subvista", () => {
  assert.doesNotMatch(app, /react-router|BrowserRouter|useNavigate/);
  assert.doesNotMatch(app, /localStorage[^\n]*subvistaMas|subvistaMas[^\n]*localStorage/);
  assert.doesNotMatch(hub, /localStorage|useState|useEffect/);
});

probar("Novedades conserva su vista independiente y la navegación sus cinco accesos", () => {
  assert.equal((app.match(/<Novedades/g) || []).length, 1);
  assert.match(app, /vistaActiva === "novedades"/);
  assert.deepEqual(
    [...navegacion.matchAll(/\{ id: "([^"]+)"/g)].map((coincidencia) => coincidencia[1]),
    ["inicio", "calendario", "planilla", "novedades", "mas"]
  );
});

console.log(`\n${aprobadas} pruebas del hub Más mobile pasaron.`);
