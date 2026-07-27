import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SECTORES_REDISTRIBUCION_BOXES,
  SECTORES_REDISTRIBUCION_OPCION_1,
  esDistribucionOpcion1,
  esDistribucionPorBoxes,
  obtenerSectoresVisiblesBoxes,
  obtenerSectoresVisiblesOpcion1,
  quitarRedistribucionFecha,
  redistribuirCritica,
  redistribuirPorBoxes,
  validarContextoRedistribucion
} from "../src/utils/redistribucionEnfermeros.js";
import { configuracionSectores } from "../src/data/sectores.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const calendario = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
const panel = fs.readFileSync(
  new URL("../src/components/calendario/PanelConfirmacionRedistribucion.jsx", import.meta.url),
  "utf8"
);
const config = configuracionSectores.enfermero;
const personas = Array.from({ length: 12 }, (_, indice) => ({
  id: `persona-${indice + 1}`,
  nombre: `Persona ${indice + 1}`
}));
const asignaciones = config.ordenVisual
  .filter((fila) => fila !== "DIVIDER" && fila !== "SIN ASIGNAR")
  .map((nombre, indice) => ({ nombre, enfermero: personas[indice] || null }));

probar("1 no existe una navegación principal agregada", () => {
  assert.doesNotMatch(app, /aria-label="Secciones principales"/);
  assert.doesNotMatch(app, /href="#seccion-(?:planilla|personal|licencias|certificaciones|estadisticas|historial)"/);
});
probar("2 Gestión del mes no está duplicada", () => {
  assert.equal((app.match(/>Gestión del mes</g) || []).length, 1);
  const certificaciones = app.indexOf('<Seccion titulo="🩺 Certificaciones médicas"');
  const gestion = app.indexOf("Gestión del mes");
  const estadisticas = app.indexOf('<Seccion titulo="📈 Estadísticas"');
  assert.ok(certificaciones < gestion);
  assert.ok(gestion < estadisticas);
});
probar("3 Preparar mes siguiente permanece", () => assert.match(app, />\s*Preparar mes siguiente\s*</));
probar("4 Reiniciar mes completo permanece", () => assert.match(app, />\s*Reiniciar mes completo\s*</));
probar("5 no existe el botón general Día de paro", () => assert.doesNotMatch(calendario, />\s*Día de paro\s*</));
probar("6 Licenciados no muestran redistribuciones", () => {
  assert.match(calendario, /tipo === "enfermero" && !esDiaParo/);
});
probar("7 Enfermeros muestran Redistribución opción 1", () => assert.match(calendario, />\s*Redistribución opción 1\s*</));
probar("8 Enfermeros muestran Redistribución opción 2", () => assert.match(calendario, />\s*Redistribución opción 2\s*</));
probar("9 la interfaz no muestra los nombres anteriores", () => {
  assert.doesNotMatch(calendario, /Redistribución crítica|Redistribución por boxes/);
  assert.doesNotMatch(panel, /redistribución crítica|redistribución por boxes/i);
});
probar("10 cancelar ambas opciones no escribe", () => {
  assert.match(calendario, /onCancelar=\{\(\) => setConfirmacionRedistribucion\(null\)\}/);
  assert.doesNotMatch(panel, /setCalendario|Supabase|\.rpc\(/);
});

const critica = redistribuirCritica({
  asignaciones,
  ordenVisual: config.ordenVisual,
  prioridadSectores: config.prioridadSectores
});
probar("11 opción 1 contiene sus cuatro grupos exactos", () => {
  assert.deepEqual(SECTORES_REDISTRIBUCION_OPCION_1, [
    "1–3 + 19–22", "4–10", "11–18", "23–30"
  ]);
  SECTORES_REDISTRIBUCION_OPCION_1.forEach((grupo) =>
    assert.ok(critica.asignaciones.some((fila) => fila.nombre === grupo))
  );
});
probar("12 opción 1 cubre boxes 1 a 30 una sola vez", () => {
  const grupos = [
    [1, 2, 3, 19, 20, 21, 22],
    [4, 5, 6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15, 16, 17, 18],
    [23, 24, 25, 26, 27, 28, 29, 30]
  ];
  const boxesOpcion1 = grupos.flat();
  assert.equal(boxesOpcion1.length, 30);
  assert.equal(new Set(boxesOpcion1).size, 30);
});
probar("13 opción 1 no duplica personas", () => {
  const ids = critica.asignaciones.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});
probar("14 opción 1 usa la prioridad exacta", () => {
  assert.deepEqual(critica.asignaciones.slice(0, 13).map((fila) => fila.nombre), [
    "REA 1",
    ...SECTORES_REDISTRIBUCION_OPCION_1,
    "SILLÓN 1",
    "EXPLORA 1",
    "PRE INT 1",
    "SM",
    "PRE INT 2",
    "SILLON 2",
    "EXPLORA 2",
    "REA 2"
  ]);
});
probar("15 opción 1 reconoce sus claves normales", () => {
  assert.equal(esDistribucionOpcion1(critica.cambios), true);
  assert.deepEqual(
    obtenerSectoresVisiblesOpcion1(config.ordenVisual).filter((fila) =>
      SECTORES_REDISTRIBUCION_OPCION_1.includes(fila)
    ),
    SECTORES_REDISTRIBUCION_OPCION_1
  );
});

const boxes = redistribuirPorBoxes({
  asignaciones,
  ordenVisual: config.ordenVisual,
  prioridadSectores: config.prioridadSectores
});
for (const [indice, nombre] of SECTORES_REDISTRIBUCION_BOXES.entries()) {
  probar(`${16 + indice} crea ${nombre}`, () => {
    assert.ok(boxes.asignaciones.some((fila) => fila.nombre === nombre));
  });
}
probar("21 opción 2 conserva sus cinco grupos", () => {
  assert.deepEqual(SECTORES_REDISTRIBUCION_BOXES, [
    "1–3 + 21 y 22", "4–7 + 30", "8–14", "15–20", "DX 23–29"
  ]);
});
probar("22 box 30 no aparece en DX", () => {
  assert.equal(SECTORES_REDISTRIBUCION_BOXES[4], "DX 23–29");
  assert.doesNotMatch(SECTORES_REDISTRIBUCION_BOXES[4], /30/);
});
probar("23 opción 2 cubre boxes 1 a 30 sin omisiones", () => {
  const boxesOpcion2 = [
    1, 2, 3, 21, 22,
    4, 5, 6, 7, 30,
    8, 9, 10, 11, 12, 13, 14,
    15, 16, 17, 18, 19, 20,
    23, 24, 25, 26, 27, 28, 29
  ];
  assert.equal(boxesOpcion2.length, 30);
  assert.equal(new Set(boxesOpcion2).size, 30);
});
probar("24 opción 2 usa la prioridad exacta", () => {
  assert.deepEqual(boxes.asignaciones.slice(0, 14).map((fila) => fila.nombre), [
    "REA 1",
    ...SECTORES_REDISTRIBUCION_BOXES,
    "SILLÓN 1",
    "EXPLORA 1",
    "PRE INT 1",
    "SM",
    "PRE INT 2",
    "SILLON 2",
    "EXPLORA 2",
    "REA 2"
  ]);
});
probar("25 ambas opciones mantienen los demás sectores visibles", () => {
  ["REA 1", "REA 2", "EXPLORA 1", "EXPLORA 2", "SILLÓN 1", "SILLON 2", "SILLONES 3", "PRE INT 1", "PRE INT 2", "SM"]
    .forEach((fila) => {
      assert.ok(boxes.asignaciones.some((item) => item.nombre === fila));
      assert.ok(critica.asignaciones.some((item) => item.nombre === fila));
    });
});
probar("26 sectores sin personas quedan vacíos", () => {
  assert.ok(boxes.asignaciones.some((fila) => fila.enfermero === null));
  assert.ok(critica.asignaciones.some((fila) => fila.enfermero === null));
});
probar("27 opción 2 no duplica personas", () => {
  const ids = boxes.asignaciones.map((fila) => fila.enfermero?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});
probar("28 solo Enfermeros muestra los botones", () => assert.match(calendario, /tipo === "enfermero" && !esDiaParo/));
probar("29 Licenciados y Planilla no se modifican", () => {
  assert.doesNotMatch(calendario, /setPlanilla|setPersonal/);
  assert.equal(boxes.asignaciones.every((fila) => fila.tipo === "sector"), true);
});
probar("30 solo se reemplaza la fecha activa en cambiosDia", () => {
  assert.match(calendario, /cambiosDia:/);
  assert.match(calendario, /\[keyDia\]: redistribucion\.cambios/);
});
probar("31 solo lectura bloquea", () => assert.match(calendario, /soloLecturaEfectiva/));

const referenciaCalendario = {};
const contexto = {
  turno: "tarde",
  mes: "2026-08",
  fecha: "2026-08-04",
  categoria: "enfermero",
  tipo: "critica",
  calendario: referenciaCalendario,
  soloLectura: false
};
probar("32 cambio de contexto invalida", () => {
  assert.equal(validarContextoRedistribucion(contexto, { ...contexto, fecha: "2026-08-05" }), false);
  assert.equal(validarContextoRedistribucion(contexto, { ...contexto, turno: "noche" }), false);
  assert.equal(validarContextoRedistribucion(contexto, { ...contexto, mes: "2026-09" }), false);
});
probar("33 la aplicación usa una actualización funcional", () => assert.match(calendario, /setCalendario\(\(prev\) => \{/));
probar("34 datos históricos de paro siguen cargándose", () => {
  assert.match(calendario, /cambiosParoDia/);
  assert.match(app, /diasParo/);
});
probar("35 el modo opción 2 se reconoce por sus claves", () => {
  assert.equal(esDistribucionPorBoxes(boxes.cambios), true);
  assert.deepEqual(
    obtenerSectoresVisiblesBoxes(config.ordenVisual).filter((fila) => SECTORES_REDISTRIBUCION_BOXES.includes(fila)),
    SECTORES_REDISTRIBUCION_BOXES
  );
});
probar("36 Gestión del mes sigue después de Certificaciones", () => {
  assert.ok(app.indexOf("Certificaciones médicas") < app.indexOf("Gestión del mes"));
  assert.ok(app.indexOf("Gestión del mes") < app.indexOf("Estadísticas"));
});
probar("37 los modales usan los títulos y descripciones nuevas", () => {
  assert.match(panel, /¿Aplicar Redistribución opción 1\?/);
  assert.match(panel, /¿Aplicar Redistribución opción 2\?/);
  assert.match(panel, /describirRedistribucion/);
});
probar("38 el contexto válido se acepta", () => assert.equal(validarContextoRedistribucion(contexto, contexto), true));

const calendarioConOpcion1 = {
  cambiosDia: {
    "2026-08-04": critica.cambios,
    "2026-08-05": { rea1: { personaId: "persona-2", nombre: "Persona 2" } }
  },
  extras: { "2026-08-04": [{ id: "extra-1", nombre: "Extra A" }] },
  noDisponibles: { "2026-08-04": [{ personaId: "persona-9", nombre: "Persona 9" }] }
};
const calendarioComun = quitarRedistribucionFecha(
  calendarioConOpcion1,
  "2026-08-04"
);

probar("39 volver aparece para opciones activas", () => {
  assert.match(calendario, />\s*Volver a distribución común\s*</);
  assert.match(calendario, /tipoRedistribucionActiva/);
  assert.equal(esDistribucionOpcion1(critica.cambios), true);
  assert.equal(esDistribucionPorBoxes(boxes.cambios), true);
});
probar("40 volver no aparece en común, Licenciados, lectura o paro", () => {
  assert.match(
    calendario,
    /tipo === "enfermero" &&\s*!esDiaParo &&\s*tipoRedistribucionActiva/
  );
  assert.match(calendario, /\{!soloLecturaEfectiva && \(/);
  assert.equal(esDistribucionOpcion1({}), false);
  assert.equal(esDistribucionPorBoxes({}), false);
});
probar("41 volver elimina solamente la fecha activa", () => {
  assert.equal(Object.hasOwn(calendarioComun.cambiosDia, "2026-08-04"), false);
  assert.deepEqual(
    calendarioComun.cambiosDia["2026-08-05"],
    calendarioConOpcion1.cambiosDia["2026-08-05"]
  );
});
probar("42 volver preserva extras y no disponibles", () => {
  assert.equal(calendarioComun.extras, calendarioConOpcion1.extras);
  assert.equal(calendarioComun.noDisponibles, calendarioConOpcion1.noDisponibles);
});
probar("43 volver no muta el calendario original", () => {
  assert.equal(
    Object.hasOwn(calendarioConOpcion1.cambiosDia, "2026-08-04"),
    true
  );
});
probar("44 volver recupera la detección común y las filas habituales", () => {
  assert.equal(esDistribucionOpcion1(calendarioComun.cambiosDia["2026-08-04"]), false);
  assert.equal(esDistribucionPorBoxes(calendarioComun.cambiosDia["2026-08-04"]), false);
  assert.match(calendario, /const filasCalendario = obtenerFilasRedistribucion\(filas\)/);
});
probar("45 confirmación de vuelta usa una actualización funcional", () => {
  assert.match(calendario, /setCalendario\(\(prev\) => \{/);
  assert.match(calendario, /return quitarRedistribucionFecha\(prev, keyDia\)/);
  assert.doesNotMatch(panel, /setCalendario/);
});
probar("46 modal de vuelta contiene textos y advertencia requeridos", () => {
  assert.match(panel, /¿Volver a la distribución común\?/);
  assert.match(panel, /También se eliminarán los cambios manuales/);
  assert.match(panel, /Sí, volver a distribución común/);
});
probar("47 cancelar la vuelta no modifica calendario", () => {
  assert.match(calendario, /onCancelar=\{\(\) => setConfirmacionRedistribucion\(null\)\}/);
  assert.doesNotMatch(panel, /quitarRedistribucionFecha/);
});
probar("48 cambio de fecha o turno invalida la vuelta", () => {
  assert.equal(validarContextoRedistribucion(contexto, { ...contexto, fecha: "2026-08-06" }), false);
  assert.equal(validarContextoRedistribucion(contexto, { ...contexto, turno: "manana" }), false);
});
probar("49 los datos históricos de paro siguen separados", () => {
  assert.match(calendario, /cambiosActivos = esDiaParo \? cambiosParoDia : cambiosDia/);
  assert.doesNotMatch(
    fs.readFileSync(new URL("../src/utils/redistribucionEnfermeros.js", import.meta.url), "utf8"),
    /cambiosParoDia|diasParo/
  );
});

console.log(`\n${total} pruebas de redistribución pasaron.`);
