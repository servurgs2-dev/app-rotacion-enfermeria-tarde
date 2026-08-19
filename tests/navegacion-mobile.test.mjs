import assert from "node:assert/strict";
import fs from "node:fs";

const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const app = leer("src/App.jsx");
const navegacion = leer("src/components/layout/NavegacionPrincipal.jsx");
const inicio = leer("src/components/layout/VistaInicio.jsx");
const hubMas = leer("src/components/layout/HubMas.jsx");

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

probar("existen cinco destinos en el orden mobile requerido", () => {
  const destinos = ["inicio", "calendario", "planilla", "novedades", "mas"];
  let posicion = -1;
  destinos.forEach((destino) => {
    const siguiente = navegacion.indexOf(`id: "${destino}"`, posicion + 1);
    assert.ok(siguiente > posicion, `${destino} debe existir y conservar el orden`);
    posicion = siguiente;
  });
  assert.equal((navegacion.match(/id: "/g) || []).length, 5);
});

probar("la navegación es fija, táctil, accesible y respeta safe-area", () => {
  assert.match(navegacion, /<nav[\s\S]*aria-label="Navegación principal"/);
  assert.match(navegacion, /fixed inset-x-0 bottom-0/);
  assert.match(navegacion, /env\(safe-area-inset-bottom\)/);
  assert.match(navegacion, /<button/);
  assert.match(navegacion, /aria-current=\{activo \? "page"/);
  assert.match(navegacion, /min-h-14/);
});

probar("App conserva una sola arquitectura de navegación con Inicio inicial", () => {
  assert.match(app, /const \[vistaActiva, setVistaActiva\] = useState\("inicio"\)/);
  assert.match(app, /<NavegacionPrincipal vistaActiva=\{vistaActiva\}/);
  assert.equal((app.match(/<NavegacionPrincipal/g) || []).length, 1);
  assert.match(app, /vistaActiva === "inicio" &&/);
  assert.match(app, /overflow-x-hidden[\s\S]*pb-28/);
});

probar("Calendario, Planilla y Novedades tienen vistas exclusivas", () => {
  assert.match(app, /vistaActiva === "calendario" \? "" : "hidden"/);
  assert.match(app, /vistaActiva === "planilla" \? "" : "hidden"/);
  assert.match(app, /vistaActiva === "novedades" \? "" : "hidden"/);
  assert.equal((app.match(/<CalendarioDiario/g) || []).length, 2, "conserva ambas categorías del Calendario");
  assert.equal((app.match(/<PlanillaMensual/g) || []).length, 2, "conserva ambas categorías de Planilla");
  assert.equal((app.match(/<Novedades/g) || []).length, 1);
});

probar("Más conserva Personal, Gestión del mes, Estadísticas e Historial", () => {
  assert.match(app, /vistaActiva === "mas" && subvistaMas === null/);
  assert.match(app, /<HubMas/);
  assert.match(app, /<ListaPersonal/);
  assert.match(hubMas, /Gestión del mes/);
  assert.match(app, /<Estadisticas/);
  assert.match(app, /<HistorialCambios/);
});

probar("Inicio ofrece accesos rápidos sin duplicar módulos", () => {
  ["calendario", "planilla", "novedades"].forEach((destino) => {
    assert.match(inicio, new RegExp(`id: "${destino}"`));
  });
  assert.match(inicio, /Turno \{turno\}/);
  assert.match(inicio, /onNavegar\(acceso\.id\)/);
});

probar("turno, mes, histórico y paneles globales conservan sus conexiones", () => {
  assert.match(app, /value=\{mesActivo\}/);
  assert.match(app, /onClick=\{cambiarTurno\}/);
  assert.match(app, /soloLectura=\{modoSoloLecturaEfectiva\}/);
  assert.match(app, /<PanelConflictoEdicion/);
  assert.match(app, /<PanelReiniciarMes/);
});

console.log(`\n${aprobadas} pruebas de navegación mobile-first pasaron.`);
