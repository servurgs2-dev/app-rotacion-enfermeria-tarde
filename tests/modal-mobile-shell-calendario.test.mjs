import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const leer = (ruta) => fs.readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
const shell = leer("src/components/ui/ModalMobileShell.jsx");
const componentes = [
  "PanelNoDisponible.jsx",
  "PanelExtraLibre.jsx",
  "PanelAgregarExtra.jsx",
  "PanelConfirmacionRedistribucion.jsx"
].map((archivo) => ({
  archivo,
  fuente: leer(`src/components/calendario/${archivo}`)
}));

test("los cuatro paneles de Calendario usan ModalMobileShell", () => {
  for (const { archivo, fuente } of componentes) {
    assert.match(fuente, /import ModalMobileShell from "\.\.\/ui\/ModalMobileShell\.jsx";/, archivo);
    assert.match(fuente, /<ModalMobileShell/, archivo);
  }
});

test("los consumidores no duplican overlay ni geometría global antigua", () => {
  for (const { archivo, fuente } of componentes) {
    assert.doesNotMatch(fuente, /fixed inset-0|\bz-50\b/, archivo);
    assert.doesNotMatch(fuente, /100vh|90vh|92vh/, archivo);
  }
});

test("las clases mobile de M2 no anulan el padding inferior seguro", () => {
  for (const { archivo, fuente } of componentes) {
    const panelClassName = fuente.match(/panelClassName="([^"]+)"/)?.[1] || "";
    assert.doesNotMatch(panelClassName, /(?:^|\s)p-[^\s]+/, archivo);
    assert.doesNotMatch(panelClassName, /(?:^|\s)pb-[^\s]+/, archivo);
  }
});

test("No disponible conserva el footer sticky dentro del shell", () => {
  const fuente = componentes.find(({ archivo }) => archivo === "PanelNoDisponible.jsx").fuente;
  assert.match(fuente, /sticky bottom-0/);
  assert.match(fuente, /ariaLabelledby="titulo-no-disponible"/);
});

test("Extra libre conserva su presentación diferenciada", () => {
  const fuente = componentes.find(({ archivo }) => archivo === "PanelExtraLibre.jsx").fuente;
  assert.match(fuente, /backdropClassName="bg-slate-950\/55"/);
  assert.match(fuente, /border-blue-200 bg-blue-50/);
});

test("Agregar Extra conserva su título accesible", () => {
  const fuente = componentes.find(({ archivo }) => archivo === "PanelAgregarExtra.jsx").fuente;
  assert.match(fuente, /ariaLabelledby="titulo-agregar-extra"/);
  assert.match(fuente, /id="titulo-agregar-extra"/);
});

test("Redistribución hereda límite y scroll del shell", () => {
  const fuente = componentes.find(({ archivo }) => archivo === "PanelConfirmacionRedistribucion.jsx").fuente;
  assert.match(fuente, /ariaLabelledby="titulo-redistribucion"/);
  assert.match(shell, /max-h-\[calc\(100dvh-/);
  assert.match(shell, /overflow-y-auto/);
});

test("el shell mantiene jerarquía, viewport dinámico y safe-area", () => {
  assert.match(shell, /fixed inset-0 z-\[60\]/);
  assert.match(shell, /100dvh/);
  assert.match(shell, /env\(safe-area-inset-bottom\)/);
  assert.match(shell, /items-end/);
  assert.match(shell, /sm:items-center/);
});

test("los tres consumidores aprobados de Personal permanecen en el shell", () => {
  for (const archivo of [
    "MoverTurnoBaseSupervision.jsx",
    "EditorVigenciasSupervision.jsx",
    "EditorVigenciasTurnoPropio.jsx"
  ]) {
    const fuente = leer(`src/components/personal/${archivo}`);
    assert.match(fuente, /<ModalMobileShell/, archivo);
  }
});
