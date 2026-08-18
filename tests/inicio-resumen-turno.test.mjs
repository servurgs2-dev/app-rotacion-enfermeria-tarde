import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearResumenCategoriaInicio,
  crearResumenInicioTurno
} from "../src/utils/resumenInicioTurno.js";
import {
  desplazarFechaDentroMes,
  fechaPerteneceAlMes,
  obtenerLimitesFechaMes
} from "../src/utils/navegacionFechaResumen.js";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

const persona = (id, nombre, categoria) => ({ id, personaId: id, nombre, categoria });
const ana = persona("e-1", "Ana", "enfermero");
const beto = persona("e-2", "Beto", "enfermero");
const carla = persona("l-1", "Carla", "licenciado");
const extra = persona("extra-1", "Extra", "enfermero");

const datosEnfermeros = {
  asignaciones: [
    { nombre: "REA 1", enfermero: ana },
    { nombre: "SIN ASIGNAR", enfermero: beto },
    { nombre: "SIN ASIGNAR", enfermero: beto }
  ],
  ausentes: [ana, ana],
  libres: [beto, beto],
  extras: [extra, extra],
  sectoresCriticosSinCobertura: ["REA 1", "REA 1"]
};

const datosLicenciados = {
  asignaciones: [{ nombre: "Salud Mental", enfermero: carla }],
  ausentes: [carla],
  libres: [],
  extras: [],
  sectoresCriticosSinCobertura: ["Salud Mental"]
};

const novedad = ({ tipo, personaId = "e-1", turno = "tarde", estado = "activa", afecta = true }) => ({
  id: `${tipo}-${personaId}-${turno}-${estado}`,
  personaId,
  personaNombre: personaId,
  categoria: personaId.startsWith("l-") ? "licenciado" : "enfermero",
  tipo,
  turno,
  estado,
  afectaDisponibilidad: afecta,
  fechaDesde: "2026-08-20",
  fechaHasta: "2026-08-20"
});

const novedades = [
  novedad({ tipo: "licencia" }),
  novedad({ tipo: "certificacion", personaId: "e-2" }),
  novedad({ tipo: "suspension", personaId: "l-1" }),
  novedad({ tipo: "adhesion_paro", personaId: "e-3" }),
  novedad({ tipo: "olvido_tarjeta", afecta: false }),
  novedad({ tipo: "cambio_horario", afecta: false }),
  novedad({ tipo: "suspension", personaId: "cancelada", estado: "cancelada" }),
  novedad({ tipo: "suspension", personaId: "otro-turno", turno: "manana" })
];

probar("resume Enfermeros sin duplicar identidades", () => {
  const resumen = crearResumenCategoriaInicio(datosEnfermeros);
  assert.deepEqual({
    previstos: resumen.previstos,
    ausentes: resumen.ausentes,
    libres: resumen.libres,
    extras: resumen.extras,
    sinAsignar: resumen.sinAsignar
  }, { previstos: 2, ausentes: 1, libres: 1, extras: 1, sinAsignar: 1 });
});

probar("resume Licenciados de forma independiente", () => {
  const resumen = crearResumenCategoriaInicio(datosLicenciados);
  assert.equal(resumen.previstos, 1);
  assert.equal(resumen.ausentes, 1);
  assert.equal(resumen.sinAsignar, 0);
});

probar("consolida libres, ausentes, Extras y sin asignar", () => {
  const resumen = crearResumenInicioTurno({
    enfermeros: datosEnfermeros,
    licenciados: datosLicenciados,
    novedades,
    fecha: "2026-08-20",
    turnoActivo: "tarde"
  });
  assert.deepEqual(resumen.general, {
    previstos: 3,
    ausentes: 2,
    libres: 1,
    extras: 1,
    sinAsignar: 1
  });
});

probar("Licencia, Certificación, Suspensión y Paro cuentan ese día", () => {
  const resumen = crearResumenInicioTurno({ novedades, fecha: "2026-08-20", turnoActivo: "tarde" });
  assert.equal(resumen.novedadesDia.licencia, 1);
  assert.equal(resumen.novedadesDia.certificacion, 1);
  assert.equal(resumen.novedadesDia.suspension, 1);
  assert.equal(resumen.novedadesDia.adhesion_paro, 1);
});

probar("Olvido y Cambio horario se informan pero no se convierten en ausencias", () => {
  const resumen = crearResumenInicioTurno({ novedades, fecha: "2026-08-20", turnoActivo: "tarde" });
  assert.equal(resumen.novedadesDia.olvido_tarjeta, 1);
  assert.equal(resumen.novedadesDia.cambio_horario, 1);
  assert.equal(resumen.general.ausentes, 0, "las ausencias operativas vienen del Calendario, no de un recálculo del tablero");
});

probar("canceladas y otros turnos quedan fuera", () => {
  const resumen = crearResumenInicioTurno({ novedades, fecha: "2026-08-20", turnoActivo: "tarde" });
  assert.equal(resumen.novedadesDia.suspension, 1);
});

probar("sectores críticos reutilizados se consolidan sin duplicados", () => {
  const resumen = crearResumenInicioTurno({ enfermeros: datosEnfermeros, licenciados: datosLicenciados });
  assert.deepEqual(resumen.sectoresCriticos, ["REA 1", "Salud Mental"]);
});

probar("un cambio de estado de entrada produce un resumen actualizado", () => {
  const inicial = crearResumenInicioTurno({ enfermeros: datosEnfermeros });
  const actualizado = crearResumenInicioTurno({
    enfermeros: { ...datosEnfermeros, ausentes: [], extras: [] }
  });
  assert.equal(inicial.general.ausentes, 1);
  assert.equal(actualizado.general.ausentes, 0);
  assert.equal(actualizado.general.extras, 0);
});

probar("Inicio usa fecha global, modo histórico y salidas productivas del Calendario", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const vista = fs.readFileSync("src/components/layout/VistaInicio.jsx", "utf8");
  assert.match(app, /fecha=\{keyDiaActual\}/);
  assert.match(app, /modoHistorico=\{mesActivo < mesActual\}/);
  assert.match(app, /dataPDFEnf\.resumenInicio/);
  assert.match(app, /dataPDFLic\.resumenInicio/);
  assert.doesNotMatch(app, /setResumenInicioEnfermeros|setResumenInicioLicenciados/);
  assert.match(calendario, /sectoresCriticosSinCobertura/);
  assert.match(vista, /Modo histórico/);
  assert.match(vista, /Ver Novedades/);
});

probar("Inicio comparte el setter global de fecha con Calendario", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const vista = fs.readFileSync("src/components/layout/VistaInicio.jsx", "utf8");
  assert.match(app, /onCambiarFecha=\{\(nuevaFecha\)/);
  assert.match(app, /setFecha\(parsearFechaLocal\(nuevaFecha\)\)/);
  assert.match(calendario, /setFecha/);
  assert.doesNotMatch(vista, /useState|useEffect/);
});

probar("anterior y siguiente no salen del mes activo", () => {
  assert.equal(desplazarFechaDentroMes({ fecha: "2026-08-20", mes: "2026-08", dias: -1 }), "2026-08-19");
  assert.equal(desplazarFechaDentroMes({ fecha: "2026-08-20", mes: "2026-08", dias: 1 }), "2026-08-21");
  assert.equal(desplazarFechaDentroMes({ fecha: "2026-08-01", mes: "2026-08", dias: -1 }), "2026-08-01");
  assert.equal(desplazarFechaDentroMes({ fecha: "2026-08-31", mes: "2026-08", dias: 1 }), "2026-08-31");
});

probar("selector directo valida los limites exactos del mes", () => {
  assert.deepEqual(obtenerLimitesFechaMes("2026-02"), {
    minima: "2026-02-01",
    maxima: "2026-02-28"
  });
  assert.equal(fechaPerteneceAlMes("2026-07-15", "2026-07"), true);
  assert.equal(fechaPerteneceAlMes("2026-08-01", "2026-07"), false);
});

probar("la navegacion diaria sigue habilitada en modo historico", () => {
  const vista = fs.readFileSync("src/components/layout/VistaInicio.jsx", "utf8");
  assert.match(vista, /type="date"/);
  assert.doesNotMatch(vista, /soloLectura[^\n]*disabled|modoHistorico[^\n]*disabled/);
  assert.match(vista, /min=\{fechaMinima\}/);
  assert.match(vista, /max=\{fechaMaxima\}/);
});

console.log(`\n${aprobadas} pruebas del resumen real de Inicio pasaron.`);
