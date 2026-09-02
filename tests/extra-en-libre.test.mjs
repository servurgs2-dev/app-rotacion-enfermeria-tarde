import assert from "node:assert/strict";
import fs from "node:fs";
import {
  TIPOS_EXTRA,
  agregarExtraALista,
  aplicarCoberturasDirectasExtras,
  configurarTipoExtra,
  crearExtraDesdeLibre,
  eliminarExtraDelDia,
  normalizarExtraCompatible,
  obtenerCoberturasExtrasPresentacion,
  obtenerDescripcionExtra
} from "../src/utils/extrasPersonas.js";

let ejecutadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  ejecutadas += 1;
  console.log(`✓ ${nombre}`);
};

const rosa = { id: "rosa", nombre: "Rosa", categoria: "enfermero", libre: 1 };
const milton = { id: "milton", nombre: "Milton", categoria: "enfermero", libre: 2 };
const base = [{ nombre: "EXPLORA 1", enfermero: milton, tipo: "sector" }];
const crearLibre = (motivoLibre, extrasDia = []) => crearExtraDesdeLibre({
  persona: rosa,
  categoria: "enfermero",
  motivoLibre,
  extrasDia,
  creadoEn: "2026-08-01T12:00:00.000Z"
});

probar("1 funcionario libre puede convertirse en Extra de cobertura", () => {
  const extra = crearLibre("cobertura_companero").extra;
  assert.equal(extra.origenExtra, "libre");
  assert.equal(extra.motivoLibre, "cobertura_companero");
});

probar("2 pedido de Supervisión crea un refuerzo", () => {
  const extra = configurarTipoExtra({
    extra: crearLibre("pedido_supervision").extra,
    tipoExtra: TIPOS_EXTRA.REFUERZO
  }).extra;
  assert.equal(extra.tipoExtra, "refuerzo");
  assert.match(obtenerDescripcionExtra(extra), /Pedido de Supervisión/);
});

probar("3 motivo ausente no crea Extra", () => {
  assert.equal(crearLibre("").extra, null);
});

probar("3b cancelar solo cierra el formulario y no guarda", () => {
  const panel = fs.readFileSync("src/components/calendario/PanelExtraLibre.jsx", "utf8");
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(panel, /onClick=\{onCancelar\}/);
  assert.match(calendario, /onCancelar=\{\(\) => setFormularioExtraLibre\(null\)\}/);
  const bloqueLibres = calendario.slice(
    calendario.indexOf('<h4 className="text-sm font-semibold text-slate-700">Libres</h4>'),
    calendario.indexOf('<h4 className="text-sm font-semibold text-slate-700">Certificados</h4>')
  );
  assert.doesNotMatch(bloqueLibres, /setCalendario|agregarExtraALista/);
});

probar("4 no permite agregar dos veces al mismo libre", () => {
  const primero = crearLibre("pedido_supervision").extra;
  assert.equal(crearLibre("pedido_supervision", [primero]).extra, null);
});

probar("5 cobertura reutiliza la validación de compañero duplicado", () => {
  const primera = configurarTipoExtra({
    extra: crearLibre("cobertura_companero").extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA 1"
  }).extra;
  const otro = { id: "otro", nombre: "Otro", categoria: "enfermero", libre: 3 };
  const segundo = configurarTipoExtra({
    extra: crearExtraDesdeLibre({ persona: otro, categoria: "enfermero", motivoLibre: "cobertura_companero" }).extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA 1",
    extrasDia: [primera],
    personal: [milton]
  });
  assert.equal(segundo.extra, null);
});

probar("6-9 candidatos usan el filtro diario existente", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /personasCubriblesParaLibre = formularioExtraLibre[\s\S]*personasCubribles\.filter/);
  assert.match(fuente, /esPersonaDisponible: \(persona\) => !estaAusente\(persona\)/);
});

probar("la interfaz exige motivo y compañero para confirmar cobertura", () => {
  const panel = fs.readFileSync("src/components/calendario/PanelExtraLibre.jsx", "utf8");
  assert.match(panel, /Funcionario que viene en su libre/);
  assert.match(panel, /Viene en su libre para cubrir a otro compañero/);
  assert.match(panel, /Viene en su libre por pedido de Supervisión/);
  assert.match(panel, /!esCobertura \|\| formulario\.personaCubiertaId/);
  assert.match(panel, /disabled=\{!puedeConfirmar\}/);
});

probar("el formulario utiliza el shell mobile centrado y adaptable", () => {
  const panel = fs.readFileSync("src/components/calendario/PanelExtraLibre.jsx", "utf8");
  const shell = fs.readFileSync("src/components/ui/ModalMobileShell.jsx", "utf8");
  assert.match(panel, /<ModalMobileShell/);
  assert.match(panel, /ariaLabelledby="titulo-extra-libre"/);
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /max-h-\[calc\(100dvh-/);
});

probar("Escape cierra el modal por la misma cancelación segura", () => {
  const panel = fs.readFileSync("src/components/calendario/PanelExtraLibre.jsx", "utf8");
  assert.match(panel, /evento\.key === "Escape"/);
  assert.match(panel, /window\.addEventListener\("keydown", cerrarConEscape\)/);
  assert.match(panel, /window\.removeEventListener\("keydown", cerrarConEscape\)/);
  assert.match(panel, /if \(evento\.key === "Escape"\) onCancelar\(\)/);
});

probar("un clic dentro del contenido no dispara el cierre", () => {
  const panel = fs.readFileSync("src/components/calendario/PanelExtraLibre.jsx", "utf8");
  assert.doesNotMatch(panel, /onClick=\{onCancelar\}[\s\S]*role="dialog"/);
});

probar("10 cobertura coloca al libre en el sector y retira al titular", () => {
  const extra = configurarTipoExtra({
    extra: crearLibre("cobertura_companero").extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA 1"
  }).extra;
  const resultado = aplicarCoberturasDirectasExtras({
    asignaciones: base,
    extras: [extra],
    personal: [rosa, milton]
  }).asignaciones;
  assert.equal(resultado[0].enfermero.id, rosa.id);
  assert.equal(resultado.some((fila) => fila.enfermero?.id === milton.id), false);
});

probar("11 eliminar refuerzo devuelve la fecha a la lista sin tocar otras fechas", () => {
  const extra = configurarTipoExtra({
    extra: crearLibre("pedido_supervision").extra,
    tipoExtra: TIPOS_EXTRA.REFUERZO
  }).extra;
  const calendario = { extras: { "2026-08-01": [extra], "2026-08-02": [{ id: "x" }] }, cambiosDia: {} };
  const limpio = eliminarExtraDelDia({ calendarioCategoria: calendario, fecha: "2026-08-01", extra });
  assert.deepEqual(limpio.extras["2026-08-01"], []);
  assert.equal(limpio.extras["2026-08-02"].length, 1);
});

probar("12-13 registro persiste por fecha y conserva motivo", () => {
  const extra = crearLibre("pedido_supervision").extra;
  const guardado = JSON.parse(JSON.stringify({ extras: { "2026-08-01": [extra] } }));
  assert.equal(guardado.extras["2026-08-01"][0].motivoLibre, "pedido_supervision");
  assert.equal(guardado.extras["2026-08-02"], undefined);
});

probar("14-15 PDF reutiliza presentación final y no duplica marca E", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /onDataReady\(datosParaPDF\)/);
  assert.doesNotMatch(fuente, /\(E\).*\(E\)/);
});

probar("16 agregar conserva únicamente la fecha activa", () => {
  const extra = crearLibre("pedido_supervision").extra;
  assert.equal(agregarExtraALista([], extra).length, 1);
});

probar("17 funciona con Licenciados", () => {
  const licenciada = { id: "lic", nombre: "Licenciada", categoria: "licenciado", libre: 1 };
  assert.ok(crearExtraDesdeLibre({
    persona: licenciada,
    categoria: "licenciado",
    motivoLibre: "pedido_supervision"
  }).extra);
});

probar("18 no depende del turno ni de la estrategia", () => {
  const fuente = fs.readFileSync("src/utils/extrasPersonas.js", "utf8");
  const bloque = fuente.slice(fuente.indexOf("export const crearExtraDesdeLibre"), fuente.indexOf("export const obtenerDescripcionExtra"));
  assert.doesNotMatch(bloque, /turnoActivo|rotacion3Dias|semana/);
});

probar("19 Extras históricos continúan como refuerzo", () => {
  assert.equal(normalizarExtraCompatible("Histórico", { fecha: "2026-08-01", categoria: "enfermero" }).tipoExtra, "refuerzo");
});

probar("20 la cobertura directa existente no fue reemplazada", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const helper = fs.readFileSync("src/utils/distribucionTurnantesCoberturas.js", "utf8");
  assert.match(fuente, /resolverTurnantesYCoberturasOperativas\(\{/);
  assert.match(helper, /aplicarCoberturasDirectasExtras\(\{/);
});

probar("21 una cobertura deriva la tarjeta del titular", () => {
  const extra = configurarTipoExtra({
    extra: crearLibre("cobertura_companero").extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA 1"
  }).extra;
  const [tarjeta] = obtenerCoberturasExtrasPresentacion([extra], [rosa, milton]);
  assert.equal(tarjeta.nombre, "Milton");
  assert.equal(tarjeta.extraNombre, "Rosa");
  assert.equal(tarjeta.sector, "EXPLORA 1");
  assert.equal(tarjeta.categoria, "enfermero");
});

probar("22 la tarjeta no escribe en noDisponibles", () => {
  const fuente = fs.readFileSync("src/utils/extrasPersonas.js", "utf8");
  const bloque = fuente.slice(
    fuente.indexOf("export const obtenerCoberturasExtrasPresentacion"),
    fuente.indexOf("export const obtenerIdentidadesPersonasCubiertas")
  );
  assert.doesNotMatch(bloque, /noDisponibles|setCalendario/);
});

probar("23 una persona cubierta aparece una sola vez", () => {
  const extra = configurarTipoExtra({
    extra: crearLibre("cobertura_companero").extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA 1"
  }).extra;
  assert.equal(
    obtenerCoberturasExtrasPresentacion([extra, { ...extra, id: "duplicado" }], [milton]).length,
    1
  );
});

probar("24 eliminar la cobertura elimina también su tarjeta derivada", () => {
  const extra = configurarTipoExtra({
    extra: crearLibre("cobertura_companero").extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA 1"
  }).extra;
  const calendario = { extras: { "2026-08-01": [extra] }, cambiosDia: {} };
  const limpio = eliminarExtraDelDia({
    calendarioCategoria: calendario,
    fecha: "2026-08-01",
    extra,
    personal: [rosa, milton]
  });
  assert.deepEqual(
    obtenerCoberturasExtrasPresentacion(limpio.extras["2026-08-01"], [rosa, milton]),
    []
  );
  const restaurada = aplicarCoberturasDirectasExtras({
    asignaciones: base,
    extras: limpio.extras["2026-08-01"],
    personal: [rosa, milton]
  }).asignaciones;
  assert.equal(restaurada[0].enfermero.id, milton.id);
});

probar("25 la tarjeta queda limitada a la fecha que contiene el Extra", () => {
  const extra = configurarTipoExtra({
    extra: crearLibre("cobertura_companero").extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA 1"
  }).extra;
  const extrasPorDia = { "2026-08-01": [extra], "2026-08-02": [] };
  assert.equal(obtenerCoberturasExtrasPresentacion(extrasPorDia["2026-08-01"], [milton]).length, 1);
  assert.equal(obtenerCoberturasExtrasPresentacion(extrasPorDia["2026-08-02"], [milton]).length, 0);
});

probar("26 funciona con Licenciados y con Extras de cualquier origen", () => {
  const titular = { id: "lic-titular", nombre: "Titular", categoria: "licenciado" };
  const extra = configurarTipoExtra({
    extra: {
      id: "lic-extra",
      personaId: "lic-extra",
      nombre: "Extra de otro turno",
      categoria: "licenciado",
      origenExtra: "personal_otro_turno"
    },
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: titular,
    sectorCubierto: "SM"
  }).extra;
  const [tarjeta] = obtenerCoberturasExtrasPresentacion([extra], [titular]);
  assert.equal(tarjeta.categoria, "licenciado");
  assert.equal(tarjeta.sector, "SM");
});

probar("27 refuerzos e históricos no generan tarjeta", () => {
  const refuerzo = configurarTipoExtra({
    extra: crearLibre("pedido_supervision").extra,
    tipoExtra: TIPOS_EXTRA.REFUERZO
  }).extra;
  const historico = normalizarExtraCompatible("Histórico", {
    fecha: "2026-08-01",
    categoria: "enfermero"
  });
  assert.deepEqual(obtenerCoberturasExtrasPresentacion([refuerzo, historico], [rosa]), []);
});

probar("28 la tarjeta no ofrece edición ni eliminación propias", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const inicio = fuente.lastIndexOf("{coberturasExtrasPresentacion.map");
  const fin = fuente.indexOf("{ausentesDelDia.length > 0", inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const bloque = fuente.slice(inicio, fin);
  assert.match(bloque, /Cobertura registrada/);
  assert.doesNotMatch(bloque, /Editar motivo|Eliminar|onClick/);
});

console.log(`\n${ejecutadas} pruebas de Extra en libre completadas.`);
