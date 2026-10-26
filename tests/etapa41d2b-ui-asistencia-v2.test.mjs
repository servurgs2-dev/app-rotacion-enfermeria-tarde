import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ESTADOS_ASISTENCIA,
  obtenerEstadoAsistencia
} from "../src/utils/asistenciaPersonas.js";
import {
  cambiarPresenciaV2,
  obtenerCohorteConfirmable
} from "../src/utils/asistenciaV2.js";

let aprobadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  aprobadas += 1;
  console.log(`✓ ${nombre}`);
};

const leer = (ruta) => fs.readFileSync(new URL(ruta, import.meta.url), "utf8");
const calendario = leer("../src/components/calendario/CalendarioDiario.jsx");
const controles = leer("../src/components/calendario/ControlesAsistenciaV2.jsx");
const distribucionMobile = leer("../src/components/calendario/mobile/VistaDistribucionMobile.jsx");
const bloquesMobile = leer("../src/components/calendario/mobile/BloquesOperativosMobile.jsx");
const fuentesAsistencia = [calendario, distribucionMobile, bloquesMobile].join("\n");

probar("01 desktop no ofrece selector de tres estados", () => {
  assert.doesNotMatch(calendario, /<option value=\{ESTADOS_ASISTENCIA\.(?:PENDIENTE|PRESENTE|AUSENTE)\}/);
  assert.match(calendario, /<ControlesAsistenciaV2/);
});

probar("02 mobile no ofrece selector de tres estados", () => {
  assert.doesNotMatch(distribucionMobile, /<select|<option/);
  assert.doesNotMatch(bloquesMobile, /<select|<option/);
});

probar("03 existe acción accesible Presente", () => {
  assert.match(controles, /<span aria-hidden="true">✅<\/span>/);
  assert.doesNotMatch(controles, />✅ Presente</);
  assert.match(controles, /Marcar presente a/);
});

probar("04 existe acción accesible No disponible", () => {
  assert.match(controles, /<IconoSacarDeDistribucion \/>/);
  assert.doesNotMatch(controles, />No disponible</);
  assert.match(controles, /Marcar a .* como no disponible/);
});

probar("05 Pendiente no se escribe como control seleccionable", () => {
  assert.doesNotMatch(fuentesAsistencia, />Pendiente<|value=\{ESTADOS_ASISTENCIA\.PENDIENTE\}/);
});

probar("06 Ausente no se ofrece como opción nueva", () => {
  assert.doesNotMatch(fuentesAsistencia, /value=\{ESTADOS_ASISTENCIA\.AUSENTE\}|✕ Ausente/);
});

probar("07 confirmar Presente delega en el handler v2", () => {
  assert.match(controles, /onCambiarAsistencia\?\.\(/);
  assert.match(controles, /ESTADOS_ASISTENCIA\.PRESENTE/);
});

probar("08 quitar Presente vuelve a Pendiente mediante el mismo handler", () => {
  assert.match(controles, /presente \? ESTADOS_ASISTENCIA\.PENDIENTE : ESTADOS_ASISTENCIA\.PRESENTE/);
  const persona = { id: "p1", nombre: "Persona" };
  const presente = cambiarPresenciaV2({ calendario: {}, fecha: "2026-10-25", persona, estado: "presente" });
  const pendiente = cambiarPresenciaV2({ calendario: presente, fecha: "2026-10-25", persona, estado: "pendiente" });
  assert.equal(obtenerEstadoAsistencia(pendiente.asistenciaDia["2026-10-25"], persona), "pendiente");
});

probar("09 una persona bloqueada no puede confirmar Presente", () => {
  assert.match(controles, /disabled=\{soloLectura \|\| \(!presente && !confirmable\)\}/);
});

const extra = { id: "extra", nombre: "Extra" };
const libreExtra = { id: "libre-extra", nombre: "Libre Extra" };
const libre = { id: "libre", nombre: "Libre" };
const origen = { id: "origen", nombre: "Origen" };
const cobertura = { id: "cobertura", nombre: "Cobertura" };
const asignaciones = [extra, libreExtra, libre, origen, cobertura].map((enfermero) => ({
  nombre: enfermero.nombre,
  enfermero
}));
const disponibles = new Set(["extra", "libre-extra", "cobertura"]);
const cohorte = obtenerCohorteConfirmable({
  asignaciones,
  esPersonaDisponible: (persona) => disponibles.has(persona.id)
});
const incluye = (persona) => cohorte.some((actual) => actual.id === persona.id);

probar("10 Extra participante puede confirmar Presente", () => assert.equal(incluye(extra), true));
probar("11 Libre + Extra puede confirmar Presente", () => assert.equal(incluye(libreExtra), true));
probar("12 Libre ordinario no puede confirmar Presente", () => assert.equal(incluye(libre), false));
probar("13 origen de Cambio con otro turno no puede confirmar", () => assert.equal(incluye(origen), false));
probar("14 Extra de cobertura puede confirmar", () => assert.equal(incluye(cobertura), true));

probar("15 Ausente legacy sigue visible", () => {
  assert.match(calendario, /Ausente legacy/);
  assert.match(bloquesMobile, /Ausente legacy/);
});

probar("16 Ausente legacy conserva reversión explícita", () => {
  assert.match(calendario, /Restaurar \/ quitar ausencia/);
  assert.match(bloquesMobile, /Restaurar/);
  assert.match(bloquesMobile, /ESTADOS_ASISTENCIA\.PENDIENTE/);
});

probar("17 el bloque legacy no crea nuevas ausencias", () => {
  assert.doesNotMatch(bloquesMobile, /ESTADOS_ASISTENCIA\.AUSENTE/);
  assert.match(calendario, /Las nuevas ausencias se registran desde No disponible/);
});

probar("18 Marcar todos presentes sigue disponible y normalizado", () => {
  assert.match(calendario, />\s*Marcar todos presentes\s*</);
  assert.match(calendario, /marcarCohortePresenteV2\(\{/);
});

probar("19 Limpiar asistencia sigue disponible con contrato v2", () => {
  assert.match(calendario, />\s*Limpiar asistencia\s*</);
  assert.match(calendario, /limpiarPresentesV2\(\{/);
});

probar("20 desktop y mobile usan el mismo control visual", () => {
  assert.match(calendario, /<ControlesAsistenciaV2/);
  assert.match(distribucionMobile, /<ControlesAsistenciaV2/);
});

probar("21 los botones tienen área táctil y estado accesible", () => {
  assert.match(controles, /min-h-11/);
  assert.match(controles, /min-w-11/);
  assert.match(controles, /aria-pressed=\{presente\}/);
  assert.match(controles, /disabled=/);
});

probar("22 la UI no reimplementa persistencia", () => {
  assert.doesNotMatch(controles, /setCalendario|asistenciaDia|localStorage|supabase/i);
});

probar("23 mobile resalta toda la tarjeta cuando está Presente", () => {
  assert.match(distribucionMobile, /fila\.estadoAsistencia === ESTADOS_ASISTENCIA\.PRESENTE/);
  assert.match(distribucionMobile, /border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200 shadow-md/);
  assert.match(distribucionMobile, /: clasesEstado\[fila\.estadoVisual\] \|\| clasesEstado\.normal/);
});

probar("24 desktop resalta toda la fila cuando está Presente", () => {
  assert.match(calendario, /estadoAsistenciaItem === ESTADOS_ASISTENCIA\.PRESENTE/);
  assert.match(calendario, /border-emerald-300 bg-emerald-50 ring-1 ring-inset ring-emerald-200 shadow-md/);
  assert.match(calendario, /estado=\{estadoAsistenciaItem\}/);
});

console.log(`\n${aprobadas} comprobaciones de UI de asistencia v2 aprobadas.`);
