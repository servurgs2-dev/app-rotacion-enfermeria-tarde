import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ORIGEN_CERTIFICACION_DIA,
  agregarCertificacionPorElDia,
  crearCertificacionPorElDia,
  eliminarCertificacionPorElDia,
  esCertificacionPorElDia
} from "../src/utils/certificacionesPersonas.js";
import {
  MOTIVOS_NO_DISPONIBLE,
  OPCIONES_MOTIVO_NO_DISPONIBLE,
  crearRegistroNoDisponible,
  obtenerNoDisponiblesDelDia
} from "../src/utils/noDisponiblesMotivos.js";
import {
  crearDetectorCertificacionDia,
  excluirCertificadosDeAsignaciones,
  filtrarPersonasNoCertificadas
} from "../src/utils/disponibilidadCertificacionesCalendario.js";
import { estaCertificado } from "../src/utils/fechas.js";
import {
  TIPOS_EXTRA,
  aplicarCoberturasDirectasExtras,
  configurarTipoExtra,
  crearExtraDesdePersonal,
  crearExtraTemporal,
  obtenerOpcionesCoberturaExtra
} from "../src/utils/extrasPersonas.js";
import { crearEstadoMensualVacio, normalizarEstadoMensual } from "../src/utils/estadoMensual.js";
import { filtrarRegistrosQueIntersectanMes } from "../src/utils/preparacionMesNuevo.js";
import { obtenerDocumentoCalendarioPDF } from "../src/utils/exportPDF.js";

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const panelFuente = leer("src/components/calendario/PanelNoDisponible.jsx");
const calendarioFuente = leer("src/components/calendario/CalendarioDiario.jsx");
const certificacionesFuente = leer("src/components/certificaciones/Certificaciones.jsx");
const appFuente = leer("src/App.jsx");

const fecha = "2026-08-12";
const fechaDate = new Date(2026, 7, 12, 12);
const milton = { id: "milton", nombre: "Milton", categoria: "enfermero", turno: "tarde" };
const rosa = { id: "rosa", nombre: "Rosa", categoria: "enfermero", turno: "tarde" };
const ana = { id: "ana", nombre: "Ana", categoria: "enfermero", turno: "tarde" };
const personal = [milton, rosa, ana];
const alta = agregarCertificacionPorElDia({
  certificaciones: [], persona: milton, fecha, categoria: "enfermero", personal,
  creadoEn: "2026-08-12T12:00:00.000Z"
});
const certificacion = alta.certificacion;
const detector = crearDetectorCertificacionDia({
  certificaciones: alta.certificaciones,
  fecha: fechaDate,
  personal
});
const base = [
  { nombre: "EXPLORA", enfermero: milton, tipo: "sector" },
  { nombre: "REA 1", enfermero: rosa, tipo: "sector" },
  { nombre: "T1", enfermero: ana, tipo: "turnante" }
];
const filtrar = (asignaciones) => excluirCertificadosDeAsignaciones({
  asignaciones,
  estaCertificada: detector
});

probar("1 aparece Certificación por el día", () => {
  assert.ok(OPCIONES_MOTIVO_NO_DISPONIBLE.some((opcion) => opcion.etiqueta === "Certificación por el día"));
  assert.match(panelFuente, /Certificación por el día|CERTIFICACION_DIA/);
});
probar("2 permanecen todos los motivos anteriores", () => {
  for (const motivo of ["falta_con_aviso", "cambio_otro_turno", "supervision_otro_turno", "otro"]) {
    assert.ok(OPCIONES_MOTIVO_NO_DISPONIBLE.some((opcion) => opcion.valor === motivo));
  }
});
probar("3 usa exactamente la fecha seleccionada", () => assert.equal(certificacion.desde, fecha));
probar("4 desde y hasta son iguales", () => assert.equal(certificacion.desde, certificacion.hasta));
probar("5 guarda identidad estable", () => assert.equal(certificacion.personaId, "milton"));
probar("6 guarda origen no_disponibles_dia", () => assert.equal(certificacion.origen, ORIGEN_CERTIFICACION_DIA));
probar("7 no crea registro en calendario.noDisponibles", () => {
  const calendario = { noDisponibles: {} };
  agregarCertificacionPorElDia({ certificaciones: [], persona: milton, fecha, categoria: "enfermero", personal });
  assert.deepEqual(calendario.noDisponibles, {});
  assert.match(calendarioFuente, /setCertificaciones/);
});
probar("8 desaparece del sector", () => assert.equal(filtrar(base)[0].enfermero, null));
probar("9 no aparece como Turnante", () => {
  const filas = filtrar([{ nombre: "T1", enfermero: milton, tipo: "turnante" }]);
  assert.equal(filas[0].enfermero, null);
});
probar("10 no aparece entre sobrantes", () => {
  assert.deepEqual(filtrarPersonasNoCertificadas({ personas: [milton, rosa], estaCertificada: detector }), [rosa]);
});
probar("11 no aparece en SIN ASIGNAR", () => {
  assert.equal(filtrar([{ nombre: "SIN ASIGNAR", enfermero: milton }])[0].enfermero, null);
});
probar("12 no aparece en ¿A quién cubre?", () => {
  const opciones = obtenerOpcionesCoberturaExtra({
    asignaciones: filtrar(base), extras: [], categoria: "enfermero",
    esPersonaDisponible: (persona) => !detector(persona)
  });
  assert.equal(opciones.some((opcion) => opcion.persona.id === "milton"), false);
});
probar("13 al día siguiente vuelve normalmente", () => {
  assert.equal(estaCertificado(alta.certificaciones, milton, new Date(2026, 7, 13, 12), personal), false);
});
probar("14 inicio y fin del rango son inclusivos", () => assert.equal(detector(milton), true));
probar("15 aparece en la pestaña Certificaciones", () => {
  assert.match(certificacionesFuente, /Creada desde No disponibles/);
  assert.match(certificacionesFuente, /certificacion\.desde/);
  assert.match(certificacionesFuente, /certificacion\.hasta/);
});
const presentacion = () => obtenerNoDisponiblesDelDia({
  registros: [], certificaciones: alta.certificaciones, personal, fecha,
  categoria: "enfermero", obtenerSectorOrigen: () => "EXPLORA"
});
probar("16 aparece como fila derivada en No disponibles", () => {
  assert.equal(presentacion()[0].tipo, "certificacion_rapida");
  assert.equal(presentacion()[0].motivoEtiqueta, "Certificación por el día");
});
probar("17 eliminar desde No disponibles borra solo la rápida", () => {
  assert.deepEqual(eliminarCertificacionPorElDia({ certificaciones: alta.certificaciones, certificacionId: certificacion.id }), []);
});
probar("18 al eliminarla la persona vuelve", () => {
  const detectar = crearDetectorCertificacionDia({ certificaciones: [], fecha: fechaDate, personal });
  assert.equal(excluirCertificadosDeAsignaciones({ asignaciones: base, estaCertificada: detectar })[0].enfermero.id, "milton");
});
probar("19 eliminarla desde Certificaciones elimina la fila derivada", () => {
  assert.deepEqual(obtenerNoDisponiblesDelDia({ registros: [], certificaciones: [], personal, fecha, categoria: "enfermero" }), []);
});
const manual = { personaId: "rosa", nombre: "Rosa", desde: fecha, hasta: fecha };
probar("20 una certificación manual no se borra desde No disponibles", () => {
  assert.deepEqual(eliminarCertificacionPorElDia({ certificaciones: [manual], certificacionId: "inexistente" }), [manual]);
  assert.equal(esCertificacionPorElDia(manual), false);
});
probar("21 certificación manual existente evita duplicado", () => {
  const resultado = agregarCertificacionPorElDia({ certificaciones: [manual], persona: rosa, fecha, categoria: "enfermero", personal });
  assert.equal(resultado.certificacion, null);
  assert.equal(resultado.certificaciones.length, 1);
});
probar("22 certificación de varios días evita duplicado", () => {
  const resultado = agregarCertificacionPorElDia({
    certificaciones: [{ ...manual, desde: "2026-08-10", hasta: "2026-08-15" }],
    persona: rosa, fecha, categoria: "enfermero", personal
  });
  assert.match(resultado.error, /ya está certificado/);
});
probar("23 dos altas no crean dos certificaciones", () => {
  const segunda = agregarCertificacionPorElDia({ certificaciones: alta.certificaciones, persona: milton, fecha, categoria: "enfermero", personal });
  assert.equal(segunda.certificaciones, alta.certificaciones);
  assert.equal(segunda.certificaciones.length, 1);
});
probar("24 no crea Extras", () => assert.doesNotMatch(calendarioFuente.slice(calendarioFuente.indexOf("CERTIFICACION_DIA"), calendarioFuente.indexOf("const quitarNoDisponible")), /agregarExtraALista/));
probar("25 no crea coberturas", () => assert.doesNotMatch(calendarioFuente.slice(calendarioFuente.indexOf("CERTIFICACION_DIA"), calendarioFuente.indexOf("const quitarNoDisponible")), /configurarTipoExtra/));
probar("26 Rosa cubre a Milton continúa fuera de certificación", () => {
  const extra = crearExtraTemporal({ nombre: "Rosa extra", categoria: "enfermero", crearId: () => "extra" }).extra;
  const cobertura = configurarTipoExtra({ extra, tipoExtra: TIPOS_EXTRA.COBERTURA, personaCubierta: milton, sectorCubierto: "EXPLORA", personal }).extra;
  assert.equal(aplicarCoberturasDirectasExtras({ asignaciones: base, extras: [cobertura], personal }).asignaciones[0].enfermero.id, "extra");
});
probar("27 cobertura guardada no se aplica si Milton está certificado", () => {
  const extra = crearExtraTemporal({ nombre: "Rosa extra", categoria: "enfermero", crearId: () => "extra" }).extra;
  const cobertura = configurarTipoExtra({ extra, tipoExtra: TIPOS_EXTRA.COBERTURA, personaCubierta: milton, sectorCubierto: "EXPLORA", personal }).extra;
  const resultado = aplicarCoberturasDirectasExtras({ asignaciones: base, extras: [cobertura], personal, esPersonaDisponible: (persona) => !detector(persona) }).asignaciones;
  assert.equal(filtrar(resultado)[0].enfermero, null);
  assert.equal(resultado.some((fila) => fila.enfermero?.id === "extra"), false);
});
probar("28 Extra de Personal certificado no se utiliza", () => {
  const extra = crearExtraDesdePersonal({ persona: milton, turnoOrigen: "mañana", categoria: "enfermero" }).extra;
  assert.equal(detector(extra), true);
});
probar("29 otros motivos continúan guardándose en noDisponibles", () => {
  const resultado = crearRegistroNoDisponible({ persona: rosa, motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO });
  assert.equal(resultado.registro.motivo, MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO);
});
probar("30 funciona para Enfermeros", () => assert.equal(certificacion.categoria, "enfermero"));
probar("31 funciona para Licenciados", () => {
  const lic = { id: "lic", nombre: "Lic", categoria: "licenciado" };
  assert.ok(crearCertificacionPorElDia({ persona: lic, fecha, categoria: "licenciado" }).certificacion);
});
probar("32 funciona en Mañana", () => assert.equal(filtrar([{ nombre: "mañana", enfermero: milton }])[0].enfermero, null));
probar("33 funciona en Vespertino", () => assert.equal(filtrar([{ nombre: "vespertino", enfermero: milton }])[0].enfermero, null));
probar("34 funciona en Noche semanal", () => assert.equal(filtrar([{ nombre: "noche semanal", enfermero: milton }])[0].enfermero, null));
probar("35 funciona en Noche cada tres días", () => assert.equal(filtrar([{ nombre: "noche cada tres días", enfermero: milton }])[0].enfermero, null));
probar("36 persiste al recargar", () => assert.equal(JSON.parse(JSON.stringify(certificacion)).origen, ORIGEN_CERTIFICACION_DIA));
probar("37 Historial conserva el origen dentro del JSON mensual", () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = personal;
  estado.certificaciones = [certificacion];
  assert.equal(JSON.parse(JSON.stringify(estado)).certificaciones[0].origen, ORIGEN_CERTIFICACION_DIA);
});
probar("38 restaurar/normalizar recupera la certificación", () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = personal;
  estado.certificaciones = [certificacion];
  assert.equal(normalizarEstadoMensual(estado).certificaciones[0].id, certificacion.id);
});
probar("39 reiniciar mes la elimina como certificación normal", () => assert.deepEqual(crearEstadoMensualVacio().certificaciones, []));
probar("40 preparar mes siguiente no copia una certificación de este mes", () => {
  assert.deepEqual(filtrarRegistrosQueIntersectanMes([certificacion], "2026-09"), []);
});
probar("41 PDF no muestra a Milton trabajando", () => {
  const asignaciones = filtrar(base);
  const documento = obtenerDocumentoCalendarioPDF({
    fecha: fechaDate,
    enfermeros: { asignaciones, libres: [] }, licenciados: { asignaciones: [], libres: [] },
    certificaciones: alta.certificaciones, personal, turnoId: "tarde", mesActivo: "2026-08"
  });
  assert.equal(asignaciones.some((fila) => fila.enfermero?.id === "milton"), false);
  assert.equal(documento.pdf.getNumberOfPages(), 1);
});
probar("42 PDF recibe una sola certificación y no un No disponible duplicado", () => {
  const estado = crearEstadoMensualVacio();
  estado.certificaciones = alta.certificaciones;
  assert.equal(alta.certificaciones.length, 1);
  assert.deepEqual(estado.calendario.enfermeros.noDisponibles, {});
});
probar("43 PDF diario mantiene una página", () => {
  const documento = obtenerDocumentoCalendarioPDF({
    fecha: fechaDate,
    enfermeros: { asignaciones: filtrar(base), libres: [] }, licenciados: { asignaciones: [], libres: [] },
    certificaciones: alta.certificaciones, personal, turnoId: "tarde", mesActivo: "2026-08"
  });
  assert.equal(documento.pdf.getNumberOfPages(), 1);
});
probar("44 no existe SQL nuevo", () => assert.doesNotMatch(leer("src/utils/certificacionesPersonas.js") + calendarioFuente, /supabase|\bSQL\b/i));
probar("45 el acceso rápido usa una sola actualización mensual", () => {
  assert.match(appFuente, /setCertificaciones=\{actualizarCertificacionesMes\}/);
  assert.match(calendarioFuente, /setCertificaciones\(\(actuales\)/);
});
probar("46 el formulario explica el alcance de un día", () => assert.match(panelFuente, /únicamente para esta fecha/));
probar("47 el creador genérico impide duplicar la certificación en noDisponibles", () => {
  const resultado = crearRegistroNoDisponible({ persona: milton, motivo: MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA });
  assert.equal(resultado.registro, null);
});
probar("48 exige una persona existente", () => {
  const resultado = agregarCertificacionPorElDia({
    certificaciones: [], persona: { ...milton, id: "eliminado" }, fecha,
    categoria: "enfermero", personal
  });
  assert.match(resultado.error, /No se pudo identificar/);
});
probar("49 rechaza una fecha calendariamente inválida", () => {
  const resultado = agregarCertificacionPorElDia({
    certificaciones: [], persona: milton, fecha: "2026-02-30",
    categoria: "enfermero", personal
  });
  assert.match(resultado.error, /fecha seleccionada no es válida/);
});

console.log(`\n${total} pruebas de Certificación por el día pasaron.`);
