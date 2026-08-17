import assert from "node:assert/strict";
import fs from "node:fs";
import {
  TIPOS_EXTRA,
  aplicarCoberturasDirectasExtras,
  configurarTipoExtra,
  crearExtraTemporal,
  eliminarExtraDelDia,
  esExtraCobertura,
  normalizarExtraCompatible,
  obtenerDescripcionExtra,
  obtenerIdentidadesPersonasCubiertas,
  obtenerOpcionesCoberturaExtra
} from "../src/utils/extrasPersonas.js";
import { obtenerNombreConMarcaTurnante } from "../src/utils/etiquetaTurnante.js";
import { obtenerDocumentoCalendarioPDF } from "../src/utils/exportPDF.js";

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const calendarioFuente = leer("src/components/calendario/CalendarioDiario.jsx");
const panelFuente = leer("src/components/calendario/PanelAgregarExtra.jsx");
const pdfFuente = leer("src/utils/exportPDF.js");
const estadoFuente = leer("src/utils/estadoMensual.js");
const distribucionFuente = leer("src/utils/distribucionTurnantesCoberturas.js");

const milton = {
  id: "milton",
  nombre: "Milton",
  categoria: "enfermero",
  funcionario: "100"
};
const ana = {
  id: "ana",
  nombre: "Ana",
  categoria: "enfermero",
  funcionario: "101"
};
const rosaBase = crearExtraTemporal({
  nombre: "Rosa",
  categoria: "enfermero",
  crearId: () => "rosa-extra"
}).extra;
const crearCobertura = (extrasDia = [], personaCubierta = milton, sector = "EXPLORA") =>
  configurarTipoExtra({
    extra: rosaBase,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta,
    sectorCubierto: sector,
    extrasDia,
    personal: [milton, ana]
  });
const cobertura = crearCobertura().extra;
const distribucionBase = [
  { nombre: "EXPLORA", enfermero: milton, tipo: "sector" },
  { nombre: "REA 1", enfermero: ana, tipo: "sector" },
  { nombre: "T1", enfermero: null, tipo: "turnante" }
];
const aplicar = (asignaciones = distribucionBase, extras = [cobertura]) =>
  aplicarCoberturasDirectasExtras({
    asignaciones,
    extras,
    personal: [milton, ana]
  }).asignaciones;

probar("1 Milton está originalmente en EXPLORA", () =>
  assert.equal(distribucionBase[0].enfermero, milton));
probar("2 Rosa se registra cubriendo a Milton", () => {
  assert.equal(cobertura.personaCubiertaId, "milton");
  assert.equal(cobertura.personaCubiertaNombre, "Milton");
});
probar("3 Rosa termina en EXPLORA", () =>
  assert.equal(aplicar()[0].enfermero.id, "rosa-extra"));
probar("4 Milton no aparece en ningún sector", () =>
  assert.equal(aplicar().some((fila) => fila.enfermero?.id === "milton"), false));
probar("5 Milton no aparece en SIN ASIGNAR", () => {
  assert.match(calendarioFuente, /identidadesCubiertas\.has\(identidad\)/);
  assert.equal(aplicar().some((fila) => fila.nombre === "SIN ASIGNAR" && fila.enfermero?.id === "milton"), false);
});
probar("6 Rosa aparece una sola vez", () =>
  assert.equal(aplicar().filter((fila) => fila.enfermero?.id === "rosa-extra").length, 1));
probar("7 EXPLORA no queda disponible para un turnante", () =>
  assert.ok(aplicar()[0].enfermero));
probar("8 la cobertura se aplica después de resolver los Turnantes", () => {
  const turnantesIndice = distribucionFuente.indexOf("const turnantes");
  const coberturaIndice = distribucionFuente.indexOf("const conCoberturas = aplicarCoberturasDirectasExtras");
  assert.ok(turnantesIndice >= 0 && coberturaIndice > turnantesIndice);
  assert.match(calendarioFuente, /resolverTurnantesYCoberturasOperativas/);
});
probar("9 la lista describe Rosa cubriendo a Milton", () =>
  assert.equal(obtenerDescripcionExtra(cobertura), "Cubre a Milton — EXPLORA"));
probar("10 la cobertura vive únicamente en la fecha registrada", () => {
  const calendario = { extras: { "2026-08-01": [cobertura], "2026-08-02": [] } };
  assert.equal(calendario.extras["2026-08-01"].length, 1);
  assert.equal(calendario.extras["2026-08-02"].length, 0);
});
probar("11 al día siguiente Milton aparece normalmente", () =>
  assert.equal(aplicar(distribucionBase, [])[0].enfermero.id, "milton"));
probar("12 eliminar cobertura restaura a Milton al recalcular", () => {
  const limpio = eliminarExtraDelDia({
    calendarioCategoria: {
      extras: { "2026-08-01": [cobertura] },
      cambiosDia: {},
      cambiosParoDia: {}
    },
    fecha: "2026-08-01",
    extra: cobertura,
    personal: [milton, ana]
  });
  assert.equal(aplicar(distribucionBase, limpio.extras["2026-08-01"])[0].enfermero.id, "milton");
});
probar("13 eliminar cobertura elimina a Rosa", () => {
  const limpio = eliminarExtraDelDia({
    calendarioCategoria: { extras: { dia: [cobertura] }, cambiosDia: {}, cambiosParoDia: {} },
    fecha: "dia",
    extra: cobertura
  });
  assert.deepEqual(limpio.extras.dia, []);
});
probar("14 refuerzo conserva la distribución anterior", () => {
  const refuerzo = configurarTipoExtra({ extra: rosaBase, tipoExtra: TIPOS_EXTRA.REFUERZO }).extra;
  assert.equal(aplicar(distribucionBase, [refuerzo])[0].enfermero.id, "milton");
});
probar("15 extra histórico sin tipo es refuerzo", () => {
  const historico = normalizarExtraCompatible("Rosa", { fecha: "2026-08-01", categoria: "enfermero" });
  assert.equal(historico.tipoExtra, TIPOS_EXTRA.REFUERZO);
  assert.equal(esExtraCobertura(historico), false);
});
probar("16 un funcionario no puede cubrirse dos veces", () => {
  const segunda = configurarTipoExtra({
    extra: { ...rosaBase, id: "otra", nombre: "Otra" },
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA",
    extrasDia: [cobertura],
    personal: [milton]
  });
  assert.equal(segunda.extra, null);
  assert.match(segunda.error, /ya está cubierto/);
});
probar("17 un extra no puede agregarse dos veces", () =>
  assert.match(calendarioFuente, /agregarExtraAlCalendario/));
probar("18 una persona no puede cubrirse a sí misma", () => {
  const resultado = configurarTipoExtra({
    extra: { ...milton },
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "EXPLORA",
    personal: [milton]
  });
  assert.equal(resultado.extra, null);
  assert.match(resultado.error, /sí mismo/);
});
const opciones = (disponible = () => true) => obtenerOpcionesCoberturaExtra({
  asignaciones: distribucionBase,
  extras: [],
  categoria: "enfermero",
  esPersonaDisponible: disponible
});
probar("19 una persona libre no aparece como opción", () => assert.equal(opciones(() => false).length, 0));
probar("20 una persona licenciada no aparece como opción", () => assert.equal(opciones(() => false).length, 0));
probar("21 una persona certificada no aparece como opción", () => assert.equal(opciones(() => false).length, 0));
probar("22 una persona No disponible no aparece como opción", () => assert.equal(opciones(() => false).length, 0));
probar("23 un funcionario cubierto no aparece nuevamente", () => {
  const final = aplicar();
  assert.equal(obtenerOpcionesCoberturaExtra({
    asignaciones: final,
    extras: [cobertura],
    categoria: "enfermero"
  }).some((opcion) => opcion.persona.id === "milton"), false);
});
probar("24 selector muestra nombre y sector", () =>
  assert.equal(opciones()[0].etiqueta, "Milton — EXPLORA"));
probar("25 cambio manual previo de sector es respetado", () => {
  const movida = [
    { nombre: "EXPLORA", enfermero: null, tipo: "sector" },
    { nombre: "REA 2", enfermero: milton, tipo: "sector" }
  ];
  const coberturaHistorica = crearCobertura([], milton, "EXPLORA").extra;
  const final = aplicar(movida, [coberturaHistorica]);
  assert.equal(coberturaHistorica.sectorCubiertoNombre, "EXPLORA");
  assert.equal(final[0].enfermero, null);
  assert.equal(final[1].enfermero.id, "rosa-extra");
  assert.equal(final.some((fila) => fila.enfermero?.id === "milton"), false);
  assert.equal(final.filter((fila) => fila.enfermero?.id === "rosa-extra").length, 1);
});
probar("26 cambio manual posterior del extra conserva cubierto fuera", () => {
  const movida = [
    { nombre: "EXPLORA", enfermero: milton, tipo: "sector" },
    { nombre: "REA 2", enfermero: cobertura, tipo: "sector" }
  ];
  const final = aplicar(movida);
  assert.equal(final[0].enfermero, null);
  assert.equal(final[1].enfermero.id, "rosa-extra");
});
probar("27 cobertura no crea certificaciones", () =>
  assert.doesNotMatch(calendarioFuente.slice(calendarioFuente.indexOf("const confirmarExtra"), calendarioFuente.indexOf("const asignacionOrdenada")), /certificaciones/));
probar("28 cobertura no crea No disponibles", () =>
  assert.doesNotMatch(calendarioFuente.slice(calendarioFuente.indexOf("const confirmarExtra"), calendarioFuente.indexOf("const asignacionOrdenada")), /noDisponibles/));
probar("29 cobertura persiste dentro de extras mensuales", () => {
  const copia = JSON.parse(JSON.stringify({ extras: { dia: [cobertura] } }));
  assert.equal(copia.extras.dia[0].personaCubiertaId, "milton");
});
probar("30 Historial conserva la información por usar el JSON mensual", () =>
  assert.match(estadoFuente, /normalizarExtrasPorDia/));
probar("31 PDF diario recibe al extra final", () => {
  assert.match(calendarioFuente, /onDataReady\(datosParaPDF\)/);
  assert.match(pdfFuente, /obtenerNombreConMarcaTurnante/);
});
probar("32 PDF no recibe al cubierto trabajando", () =>
  assert.equal(aplicar().some((fila) => fila.enfermero?.nombre === "Milton"), false));
probar("33 PDF diario mantiene contrato de una página", () =>
  assert.match(pdfFuente, /crearCalendarioDiarioPDF/));
probar("34 funciona para Enfermeros", () => assert.equal(cobertura.categoria, "enfermero"));
probar("35 funciona para Licenciados", () => {
  const titular = { ...milton, id: "lic", categoria: "licenciado" };
  const extra = { ...rosaBase, id: "extra-lic", categoria: "licenciado" };
  assert.ok(configurarTipoExtra({
    extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: titular,
    sectorCubierto: "Salud Mental",
    personal: [titular]
  }).extra);
});
probar("36 funciona en Mañana sin depender del turno", () => assert.doesNotMatch(calendarioFuente, /tipoExtra.*manana/));
probar("37 funciona en Vespertino sin depender del turno", () => assert.doesNotMatch(calendarioFuente, /tipoExtra.*vespertino/));
probar("38 funciona en Noche semanal", () => assert.match(calendarioFuente, /periodoPlanilla/));
probar("39 funciona en Noche cada tres días", () => assert.match(calendarioFuente, /obtenerBloqueParaFecha/));
probar("40 no hay SQL en la implementación", () =>
  assert.doesNotMatch(calendarioFuente + panelFuente + leer("src/utils/extrasPersonas.js"), /supabase|\bSQL\b/i));
probar("41 formulario usa cobertura por defecto", () => {
  assert.match(calendarioFuente, /tipoExtra: "cobertura"/);
  assert.match(panelFuente, /Cubre a un funcionario/);
});
probar("42 formulario mantiene Refuerzo sin reemplazo", () =>
  assert.match(panelFuente, /Refuerzo sin reemplazo/));
probar("43 identidades cubiertas se centralizan", () =>
  assert.ok(obtenerIdentidadesPersonasCubiertas([cobertura], [milton]).has("id:milton")));
probar("44 la presentación final conserva la marca de Extra", () =>
  assert.equal(
    obtenerNombreConMarcaTurnante({ ...cobertura, esExtra: true }),
    "Rosa (E)"
  ));
probar("45 Calendario centraliza las marcas y no agrega Extra por separado", () => {
  assert.match(calendarioFuente, /obtenerNombreConMarcaTurnante\(item\.enfermero\)/);
  assert.doesNotMatch(calendarioFuente, />\s*\(E\)\s*</);
  assert.doesNotMatch(calendarioFuente, /item\.enfermero\.esExtra\s*&&/);
});
probar("46 las marcas normal, Turnante, Extra y combinada no se duplican", () => {
  assert.equal(obtenerNombreConMarcaTurnante({ nombre: "Rosa" }), "Rosa");
  assert.equal(obtenerNombreConMarcaTurnante({ nombre: "Rosa", esTurnante: true }), "Rosa (T)");
  assert.equal(obtenerNombreConMarcaTurnante({ nombre: "Rosa", esExtra: true }), "Rosa (E)");
  assert.equal(
    obtenerNombreConMarcaTurnante({ nombre: "Rosa", esTurnante: true, esExtra: true }),
    "Rosa (T) (E)"
  );
  assert.doesNotMatch(
    obtenerNombreConMarcaTurnante({ nombre: "Rosa", esExtra: true }),
    /\(E\) \(E\)/
  );
});
probar("47 el PDF sintético con cobertura continúa en una página y una marca Extra", () => {
  const documento = obtenerDocumentoCalendarioPDF({
    fecha: new Date(2026, 7, 1, 12),
    enfermeros: {
      asignaciones: aplicar().map((fila) => ({
        ...fila,
        enfermero: fila.enfermero ? { ...fila.enfermero, esExtra: true } : null
      })),
      libres: []
    },
    licenciados: { asignaciones: [], libres: [] },
    certificaciones: [],
    personal: [milton, ana],
    turnoId: "tarde",
    mesActivo: "2026-08"
  });
  assert.equal(documento.pdf.getNumberOfPages(), 1);
  assert.match(pdfFuente, /obtenerNombreConMarcaTurnante/);
  assert.equal(obtenerNombreConMarcaTurnante({ nombre: "Rosa", esExtra: true }), "Rosa (E)");
});
probar("48 una cobertura persistida no se aplica si el titular dejó de estar disponible", () => {
  const resultado = aplicarCoberturasDirectasExtras({
    asignaciones: distribucionBase,
    extras: [cobertura],
    personal: [milton, ana],
    esPersonaDisponible: () => false
  }).asignaciones;
  assert.equal(resultado[0].enfermero.id, "milton");
});

console.log(`\n${total} pruebas de coberturas de Extras pasaron.`);
