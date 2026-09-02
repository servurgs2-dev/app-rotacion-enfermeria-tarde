import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const leer = (ruta) => fs.readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
const shell = leer("src/components/ui/ModalMobileShell.jsx");
const componentes = [
  ["src/components/correo/ModalEnviarPDF.jsx", "../ui/ModalMobileShell.jsx"],
  ["src/components/planilla/PanelIntercambioPlanilla.jsx", "../ui/ModalMobileShell.jsx"],
  ["src/components/planilla/SelectorPosicionesNoAplicables.jsx", "../ui/ModalMobileShell.jsx"],
  ["src/components/ui/PanelConfirmacionLimpieza.jsx", "./ModalMobileShell.jsx"],
  ["src/components/mes/PanelPrepararMes.jsx", "../ui/ModalMobileShell.jsx"],
  ["src/components/mes/PanelReiniciarMes.jsx", "../ui/ModalMobileShell.jsx"]
].map(([ruta, importacion]) => ({ ruta, importacion, fuente: leer(ruta) }));

test("los seis overlays M3 importan y renderizan ModalMobileShell", () => {
  for (const { ruta, importacion, fuente } of componentes) {
    assert.match(fuente, new RegExp(`import ModalMobileShell from "${importacion.replaceAll(".", "\\.")}";`), ruta);
    assert.match(fuente, /<ModalMobileShell/, ruta);
  }
});

test("M3 no conserva overlays ni alturas globales anteriores", () => {
  for (const { ruta, fuente } of componentes) {
    assert.doesNotMatch(fuente, /fixed inset-0|\bz-50\b/, ruta);
    assert.doesNotMatch(fuente, /100vh|90vh|92vh/, ruta);
  }
});

test("las clases mobile M3 no pisan el padding inferior seguro", () => {
  for (const { ruta, fuente } of componentes) {
    const panelClassName = fuente.match(/panelClassName="([^"]+)"/)?.[1] || "";
    assert.doesNotMatch(panelClassName, /(?:^|\s)p-[^\s]+/, ruta);
    assert.doesNotMatch(panelClassName, /(?:^|\s)pb-[^\s]+/, ruta);
  }
});

test("el shell conserva el contrato mobile aprobado", () => {
  assert.match(shell, /fixed inset-0 z-\[60\]/);
  assert.match(shell, /100dvh/);
  assert.match(shell, /env\(safe-area-inset-bottom\)/);
  assert.match(shell, /overflow-y-auto overscroll-contain/);
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
});

test("ModalEnviarPDF conserva información, mensaje y acciones", () => {
  const fuente = leer("src/components/correo/ModalEnviarPDF.jsx");
  assert.match(fuente, /Destinatario:/);
  assert.match(fuente, /Asunto:/);
  assert.match(fuente, /Mensaje opcional/);
  assert.match(fuente, /onClick=\{enviar\}/);
  assert.match(fuente, /"Enviar"/);
});

test("Intercambio conserva períodos, posiciones y confirmación", () => {
  const fuente = leer("src/components/planilla/PanelIntercambioPlanilla.jsx");
  assert.match(fuente, /onCambiarPeriodo/);
  assert.match(fuente, /onCambiarOrigen/);
  assert.match(fuente, /onCambiarDestino/);
  assert.match(fuente, /Confirmar intercambio/);
});

test("Selector de posiciones conserva lista y acciones", () => {
  const fuente = leer("src/components/planilla/SelectorPosicionesNoAplicables.jsx");
  assert.match(fuente, /filas\.map/);
  assert.match(fuente, /onAlternar/);
  assert.match(fuente, /Confirmar y generar/);
  assert.match(fuente, /maxWidthClassName="max-w-2xl"/);
});

test("Confirmación de limpieza mantiene usos en Personal y Planilla", () => {
  const personal = leer("src/components/personal/ListaPersonal.jsx");
  const planilla = leer("src/components/planilla/PlanillaMensual.jsx");
  assert.match(personal, /<PanelConfirmacionLimpieza/);
  assert.match(planilla, /<PanelConfirmacionLimpieza/);
  assert.match(leer("src/components/ui/PanelConfirmacionLimpieza.jsx"), /textoConfirmar/);
});

test("Preparar mes conserva configuración y acciones estructurales", () => {
  const fuente = leer("src/components/mes/PanelPrepararMes.jsx");
  assert.match(fuente, /Preparar mes siguiente/);
  assert.match(fuente, /ConfiguracionPlanilla/);
  assert.match(fuente, /PrioridadCoberturaMes/);
  assert.match(fuente, /AsignacionesFijasMes/);
  assert.match(fuente, /Confirmar preparación/);
  assert.match(fuente, /maxWidthClassName="max-w-4xl"/);
});

test("Reiniciar mes conserva confirmación destructiva", () => {
  const fuente = leer("src/components/mes/PanelReiniciarMes.jsx");
  assert.match(fuente, /textoConfirmacion\.trim\(\) === "REINICIAR"/);
  assert.match(fuente, /Sí, reiniciar mes completo/);
  assert.match(fuente, /disabled=\{!confirmacionValida\}/);
});

test("M1 continúa usando el shell común", () => {
  for (const archivo of [
    "MoverTurnoBaseSupervision.jsx",
    "EditorVigenciasSupervision.jsx",
    "EditorVigenciasTurnoPropio.jsx"
  ]) {
    assert.match(leer(`src/components/personal/${archivo}`), /<ModalMobileShell/, archivo);
  }
});

test("M2 continúa usando el shell común", () => {
  for (const archivo of [
    "PanelNoDisponible.jsx",
    "PanelExtraLibre.jsx",
    "PanelAgregarExtra.jsx",
    "PanelConfirmacionRedistribucion.jsx"
  ]) {
    assert.match(leer(`src/components/calendario/${archivo}`), /<ModalMobileShell/, archivo);
  }
});
