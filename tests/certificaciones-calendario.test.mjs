import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearDetectorCertificacionDia,
  excluirCertificadosDeAsignaciones,
  filtrarPersonasNoCertificadas
} from "../src/utils/disponibilidadCertificacionesCalendario.js";
import {
  TIPOS_EXTRA,
  aplicarCoberturasDirectasExtras,
  configurarTipoExtra,
  crearExtraDesdePersonal,
  crearExtraTemporal,
  obtenerOpcionesCoberturaExtra
} from "../src/utils/extrasPersonas.js";
import { aplicarPrioridadCoberturaParejas } from "../src/utils/coberturaParejasEnfermeros.js";
import { obtenerDocumentoCalendarioPDF } from "../src/utils/exportPDF.js";

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const fecha = new Date(2026, 7, 12, 12);
const milton = { id: "milton", nombre: "Milton", categoria: "enfermero", turno: "tarde" };
const rosa = { id: "rosa", nombre: "Rosa", categoria: "enfermero", turno: "tarde" };
const ana = { id: "ana", nombre: "Ana", categoria: "enfermero", turno: "tarde" };
const personal = [milton, rosa, ana];
const certificacionMilton = {
  personaId: "milton",
  nombre: "Milton",
  desde: "2026-08-10",
  hasta: "2026-08-12"
};
const detector = crearDetectorCertificacionDia({
  certificaciones: [certificacionMilton],
  fecha,
  personal
});
const filtrar = (asignaciones) => excluirCertificadosDeAsignaciones({
  asignaciones,
  estaCertificada: detector
});
const base = [
  { nombre: "REA 1", enfermero: milton, tipo: "sector" },
  { nombre: "REA 2", enfermero: rosa, tipo: "sector" },
  { nombre: "T1", enfermero: ana, tipo: "turnante" }
];

probar("1 reproduce una persona certificada almacenada en un sector fijo", () => {
  assert.equal(base[0].enfermero.id, "milton");
  assert.equal(detector(base[0].enfermero), true);
});
probar("2 el filtro diario la quita de su sector fijo", () => {
  assert.equal(filtrar(base)[0].enfermero, null);
});
probar("3 el sector queda disponible para la cobertura normal", () => {
  const protegida = filtrar(base);
  const cubierta = aplicarPrioridadCoberturaParejas({
    asignaciones: protegida,
    cambiosDia: {},
    esPersonaDisponible: (persona) => !detector(persona)
  });
  assert.equal(cubierta[0].enfermero.id, "rosa");
  assert.equal(cubierta[1].enfermero, null);
});
probar("4 una persona certificada en posición Turnante no se utiliza", () => {
  const filas = filtrar([{ nombre: "T1", enfermero: milton, tipo: "turnante" }]);
  assert.equal(filas[0].enfermero, null);
});
probar("5 una persona certificada no sobrevive en SIN ASIGNAR", () => {
  const filas = filtrar([{ nombre: "SIN ASIGNAR", enfermero: milton, tipo: "sector" }]);
  assert.equal(filas[0].enfermero, null);
});
probar("6 una persona certificada se excluye de sobrantes", () => {
  assert.deepEqual(filtrarPersonasNoCertificadas({ personas: personal, estaCertificada: detector }), [rosa, ana]);
});
probar("7 no aparece como candidata para ser cubierta", () => {
  const opciones = obtenerOpcionesCoberturaExtra({
    asignaciones: filtrar(base),
    extras: [],
    categoria: "enfermero",
    esPersonaDisponible: (persona) => !detector(persona)
  });
  assert.equal(opciones.some((opcion) => opcion.persona.id === "milton"), false);
});
probar("8 un cambio manual no la reincorpora", () => {
  assert.equal(filtrar([{ nombre: "DX", enfermero: milton, tipo: "sector" }])[0].enfermero, null);
});
probar("9 una redistribución final no la reincorpora", () => {
  assert.equal(filtrar([{ nombre: "1–3 + 19–22", enfermero: milton, tipo: "sector" }])[0].enfermero, null);
});
probar("10 la prioridad por parejas no reincorpora una referencia certificada", () => {
  const resultado = aplicarPrioridadCoberturaParejas({
    asignaciones: filtrar(base),
    cambiosDia: {},
    esPersonaDisponible: (persona) => !detector(persona)
  });
  assert.equal(resultado.some((fila) => fila.enfermero?.id === "milton"), false);
});

const refuerzo = crearExtraTemporal({
  nombre: "Extra externo",
  categoria: "enfermero",
  crearId: () => "extra-manual"
}).extra;
probar("11 un refuerzo no hace reaparecer al certificado", () => {
  const resultado = filtrar([...base, { nombre: "DX", enfermero: refuerzo, tipo: "sector" }]);
  assert.equal(resultado.some((fila) => fila.enfermero?.id === "milton"), false);
  assert.equal(resultado.some((fila) => fila.enfermero?.id === "extra-manual"), true);
});
probar("12 una cobertura de otra persona funciona con un tercero certificado", () => {
  const extra = crearExtraTemporal({ nombre: "Elena", categoria: "enfermero", crearId: () => "elena" }).extra;
  const cobertura = configurarTipoExtra({
    extra,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: rosa,
    sectorCubierto: "REA 2",
    personal
  }).extra;
  const resultado = filtrar(aplicarCoberturasDirectasExtras({
    asignaciones: base,
    extras: [cobertura],
    personal,
    esPersonaDisponible: (persona) => !detector(persona)
  }).asignaciones);
  assert.equal(resultado[1].enfermero.id, "elena");
  assert.equal(resultado.some((fila) => fila.enfermero?.id === "milton"), false);
});
probar("13 cobertura persistida sobre un titular certificado no lo reincorpora", () => {
  const cobertura = configurarTipoExtra({
    extra: refuerzo,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "REA 1",
    personal
  }).extra;
  const resultado = filtrar(aplicarCoberturasDirectasExtras({
    asignaciones: base,
    extras: [cobertura],
    personal,
    esPersonaDisponible: (persona) => !detector(persona)
  }).asignaciones);
  assert.equal(resultado[0].enfermero, null);
  assert.equal(resultado.some((fila) => fila.enfermero?.id === "extra-manual"), false);
});
probar("14 un Extra proveniente de Personal certificado queda excluido", () => {
  const extra = crearExtraDesdePersonal({
    persona: milton,
    turnoOrigen: "mañana",
    categoria: "enfermero"
  }).extra;
  assert.equal(detector(extra), true);
  assert.deepEqual(filtrarPersonasNoCertificadas({ personas: [extra], estaCertificada: detector }), []);
});
probar("15 un Extra manual homónimo no se excluye por coincidencia débil", () => {
  const manual = { ...refuerzo, nombre: "Milton" };
  assert.equal(detector(manual), false);
});
probar("16 el inicio del rango es inclusivo", () => {
  const detectar = crearDetectorCertificacionDia({ certificaciones: [certificacionMilton], fecha: new Date(2026, 7, 10, 12), personal });
  assert.equal(detectar(milton), true);
});
probar("17 el fin del rango es inclusivo", () => assert.equal(detector(milton), true));
probar("18 el día posterior permite volver", () => {
  const detectar = crearDetectorCertificacionDia({ certificaciones: [certificacionMilton], fecha: new Date(2026, 7, 13, 12), personal });
  assert.equal(detectar(milton), false);
});
probar("19 dos certificaciones separadas respetan cada rango", () => {
  const certificaciones = [certificacionMilton, { ...certificacionMilton, desde: "2026-08-20", hasta: "2026-08-21" }];
  const diaIntermedio = crearDetectorCertificacionDia({ certificaciones, fecha: new Date(2026, 7, 15, 12), personal });
  const segundoRango = crearDetectorCertificacionDia({ certificaciones, fecha: new Date(2026, 7, 20, 12), personal });
  assert.equal(diaIntermedio(milton), false);
  assert.equal(segundoRango(milton), true);
});
probar("20 certificación histórica por nombre resuelve identidad estable", () => {
  const detectar = crearDetectorCertificacionDia({
    certificaciones: [{ nombre: "Milton", desde: "2026-08-12", hasta: "2026-08-12" }],
    fecha,
    personal
  });
  assert.equal(detectar(milton), true);
});
probar("21 funciona igual para Licenciados", () => {
  const licenciado = { ...milton, id: "licenciado", categoria: "licenciado" };
  const detectar = crearDetectorCertificacionDia({
    certificaciones: [{ personaId: "licenciado", desde: "2026-08-12", hasta: "2026-08-12" }],
    fecha,
    personal: [licenciado]
  });
  assert.equal(excluirCertificadosDeAsignaciones({ asignaciones: [{ nombre: "SM", enfermero: licenciado }], estaCertificada: detectar })[0].enfermero, null);
});
probar("22 no depende del turno ni de la estrategia de planificación", () => {
  for (const contexto of ["mañana", "vespertino", "noche_semanal", "noche_3_dias"]) {
    assert.equal(filtrar([{ nombre: contexto, enfermero: milton }])[0].enfermero, null);
  }
});
probar("23 el PDF recibe la distribución final sin el certificado", () => {
  const asignaciones = filtrar(base);
  const documento = obtenerDocumentoCalendarioPDF({
    fecha,
    enfermeros: { asignaciones, libres: [] },
    licenciados: { asignaciones: [], libres: [] },
    certificaciones: [certificacionMilton],
    personal,
    turnoId: "tarde",
    mesActivo: "2026-08"
  });
  assert.equal(documento.pdf.getNumberOfPages(), 1);
  assert.equal(asignaciones.some((fila) => fila.enfermero?.id === "milton"), false);
});
probar("24 la implementación no crea ni elimina certificaciones", () => {
  const fuente = fs.readFileSync("src/utils/disponibilidadCertificacionesCalendario.js", "utf8");
  assert.doesNotMatch(fuente, /push\(|splice\(|setCertificaciones|filter\(.*certificacion/);
});
probar("25 la implementación no modifica No disponibles", () => {
  const fuente = fs.readFileSync("src/utils/disponibilidadCertificacionesCalendario.js", "utf8");
  assert.doesNotMatch(fuente, /noDisponibles|setCalendario/);
});
probar("26 la cobertura Rosa cubre a Milton sigue funcionando fuera de certificación", () => {
  const extra = configurarTipoExtra({
    extra: refuerzo,
    tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: milton,
    sectorCubierto: "REA 1",
    personal
  }).extra;
  const resultado = aplicarCoberturasDirectasExtras({ asignaciones: base, extras: [extra], personal }).asignaciones;
  assert.equal(resultado[0].enfermero.id, "extra-manual");
});
probar("27 Refuerzo sin reemplazo conserva su tipo", () => {
  const resultado = configurarTipoExtra({ extra: refuerzo, tipoExtra: TIPOS_EXTRA.REFUERZO }).extra;
  assert.equal(resultado.tipoExtra, TIPOS_EXTRA.REFUERZO);
});

console.log(`\n${total} pruebas de certificaciones en Calendario Diario pasaron.`);
