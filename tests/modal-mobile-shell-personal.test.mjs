import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const shell = leer("src/components/ui/ModalMobileShell.jsx");
const consumidores = Object.freeze({
  mover: leer("src/components/personal/MoverTurnoBaseSupervision.jsx"),
  supervision: leer("src/components/personal/EditorVigenciasSupervision.jsx"),
  propio: leer("src/components/personal/EditorVigenciasTurnoPropio.jsx")
});

test("shell queda por encima de la navegación z-50", () => {
  assert.match(shell, /fixed inset-0 z-\[60\]/);
});

test("shell limita el panel con viewport dinámico", () => {
  assert.match(shell, /100dvh/);
  assert.doesNotMatch(shell, /100vh|92vh/);
});

test("shell reserva área segura inferior con fallback", () => {
  assert.match(shell, /padding-bottom:max\(1rem,env\(safe-area-inset-bottom\)\)/);
});

test("shell concentra el scroll interno y evita rebote al fondo", () => {
  assert.match(shell, /overflow-y-auto/);
  assert.match(shell, /overscroll-contain/);
});

test("shell es bottom-sheet mobile y modal centrado desde sm", () => {
  assert.match(shell, /items-end[\s\S]+sm:items-center/);
  assert.match(shell, /rounded-t-2xl[\s\S]+sm:rounded-2xl/);
  assert.match(shell, /sm:p-4/);
});

test("shell conserva contrato accesible de diálogo", () => {
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /aria-labelledby=\{ariaLabelledby\}/);
});

for (const [nombre, fuente] of Object.entries(consumidores)) {
  test(`${nombre} usa el shell común sin overlay ni altura duplicados`, () => {
    assert.match(fuente, /import ModalMobileShell/);
    assert.match(fuente, /<ModalMobileShell/);
    assert.doesNotMatch(fuente, /fixed inset-0|\bz-50\b|max-h-\[92vh\]/);
  });
}

test("los tres consumidores conservan títulos accesibles propios", () => {
  assert.match(consumidores.mover, /ariaLabelledby="titulo-mover-turno-base"/);
  assert.match(consumidores.supervision, /ariaLabelledby="titulo-vigencias-supervision"/);
  assert.match(consumidores.propio, /ariaLabelledby="titulo-vigencias-turno-propio"/);
});

test("Mover turno conserva ancho y padding desktop configurables", () => {
  assert.match(consumidores.mover, /panelClassName="sm:px-6 sm:pt-6 sm:pb-6"/);
  assert.match(shell, /maxWidthClassName = "max-w-lg"/);
});
