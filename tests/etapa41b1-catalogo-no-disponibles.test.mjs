import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CATALOGO_MOTIVOS_NO_DISPONIBLE,
  crearRegistroNoDisponible,
  excluirAusenciasOperativasNoDisponiblesDeAsignaciones,
  MOTIVOS_NO_DISPONIBLE,
  obtenerConfiguracionMotivoNoDisponible,
  obtenerEtiquetaMotivoNoDisponible,
  OPCIONES_MOTIVO_NO_DISPONIBLE
} from "../src/utils/noDisponiblesMotivos.js";

const persona = { id: "p-1", nombre: "Persona", categoria: "enfermero" };
const opciones = new Map(
  OPCIONES_MOTIVO_NO_DISPONIBLE.map((opcion) => [opcion.valor, opcion.etiqueta])
);
const catalogo = new Map(
  CATALOGO_MOTIVOS_NO_DISPONIBLE.map((motivo) => [motivo.codigo, motivo])
);

let aprobadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  aprobadas += 1;
  console.log(`OK ${nombre}`);
};

const motivosNuevos = [
  [MOTIVOS_NO_DISPONIBLE.FALTA_SIN_AVISO, "Falta sin aviso"],
  [MOTIVOS_NO_DISPONIBLE.SUPERVISION_AUTORIZO_INASISTENCIA, "Supervisión autorizó inasistencia"],
  [MOTIVOS_NO_DISPONIBLE.SUPERVISION_SOLICITO_OTRO_TURNO, "Supervisión solicitó otro turno"],
  [MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA, "Certificación por el día"],
  [MOTIVOS_NO_DISPONIBLE.DONACION_SANGRE, "Donación de sangre"],
  [MOTIVOS_NO_DISPONIBLE.PAP, "PAP"],
  [MOTIVOS_NO_DISPONIBLE.MAMOGRAFIA, "Mamografía"],
  [MOTIVOS_NO_DISPONIBLE.LIBRE_FERIADO, "Libre por feriado"],
  [MOTIVOS_NO_DISPONIBLE.OTRO, "Otro motivo"]
];

motivosNuevos.forEach(([codigo, label]) => {
  probar(`${codigo} está habilitado con su label canónico`, () => {
    const configuracion = catalogo.get(codigo);
    assert.equal(opciones.get(codigo), label);
    assert.equal(configuracion.label, label);
    assert.equal(configuracion.disponibleParaNuevaCarga, true);
    assert.equal(configuracion.afectaDisponibilidad, true);
    assert.equal(configuracion.esLegacy, false);
  });
});

probar("Adhesión a paro queda fuera de las nuevas altas", () => {
  assert.equal(opciones.has(MOTIVOS_NO_DISPONIBLE.ADHESION_PARO), false);
  assert.equal(catalogo.get(MOTIVOS_NO_DISPONIBLE.ADHESION_PARO).disponibleParaNuevaCarga, false);
});

probar("Adhesión a paro legacy conserva lectura y clasificación", () => {
  const configuracion = obtenerConfiguracionMotivoNoDisponible("adhesion_paro");
  assert.equal(configuracion.esLegacy, true);
  assert.equal(configuracion.afectaDisponibilidad, true);
  assert.equal(obtenerEtiquetaMotivoNoDisponible({ motivo: "adhesion_paro" }), "Adhesión a PARO");
});

probar("Falta con aviso legacy conserva su label histórico y su código", () => {
  const configuracion = obtenerConfiguracionMotivoNoDisponible("falta_con_aviso");
  assert.equal(configuracion.esLegacy, true);
  assert.equal(configuracion.disponibleParaNuevaCarga, false);
  assert.equal(obtenerEtiquetaMotivoNoDisponible({ motivo: "falta_con_aviso" }), "Falta con aviso");
  assert.equal(opciones.has(MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO), false);
  assert.equal(
    opciones.get(MOTIVOS_NO_DISPONIBLE.SUPERVISION_AUTORIZO_INASISTENCIA),
    "Supervisión autorizó inasistencia"
  );
  assert.notEqual(
    MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO,
    MOTIVOS_NO_DISPONIBLE.SUPERVISION_AUTORIZO_INASISTENCIA
  );
});

probar("los nuevos motivos puntuales bloquean la asignación", () => {
  for (const motivo of [
    MOTIVOS_NO_DISPONIBLE.FALTA_SIN_AVISO,
    MOTIVOS_NO_DISPONIBLE.SUPERVISION_AUTORIZO_INASISTENCIA,
    MOTIVOS_NO_DISPONIBLE.DONACION_SANGRE,
    MOTIVOS_NO_DISPONIBLE.PAP,
    MOTIVOS_NO_DISPONIBLE.MAMOGRAFIA,
    MOTIVOS_NO_DISPONIBLE.LIBRE_FERIADO,
    MOTIVOS_NO_DISPONIBLE.OTRO
  ]) {
    const registro = crearRegistroNoDisponible({
      persona,
      motivo,
      detalle: motivo === MOTIVOS_NO_DISPONIBLE.OTRO ? "Detalle requerido" : ""
    }).registro;
    const [resultado] = excluirAusenciasOperativasNoDisponiblesDeAsignaciones({
      asignaciones: [{ nombre: "REA 1", enfermero: persona }],
      registros: [registro],
      personal: [persona]
    });
    assert.equal(resultado.enfermero, null, motivo);
    assert.equal(resultado.excluidoPorNoDisponible, true, motivo);
  }
});

probar("ningún motivo del catálogo selecciona redistribución", () => {
  const fuente = fs.readFileSync(
    new URL("../src/utils/noDisponiblesMotivos.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(fuente, /resolverDistribucionDiaria|redistribuirCritica|redistribuirPorBoxes/);
  CATALOGO_MOTIVOS_NO_DISPONIBLE.forEach((motivo) => {
    assert.equal(Object.hasOwn(motivo, "modoRedistribucion"), false);
  });
});

probar("Certificación por el día continúa delegada a Certificaciones", () => {
  const configuracion = catalogo.get(MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA);
  assert.equal(configuracion.categoriaOperativa, "delega_certificaciones");
  const resultado = crearRegistroNoDisponible({
    persona,
    motivo: MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA
  });
  assert.equal(resultado.registro, null);
  assert.match(resultado.error, /guardarse en Certificaciones/);
});

probar("Supervisión solicitó otro turno usa el código canónico y conserva turno destino", () => {
  const resultado = crearRegistroNoDisponible({
    persona,
    motivo: MOTIVOS_NO_DISPONIBLE.SUPERVISION_SOLICITO_OTRO_TURNO,
    turnoDestino: "noche"
  });
  assert.equal(resultado.error, "");
  assert.equal(resultado.registro.turnoDestino, "noche");
  assert.equal(
    catalogo.get(MOTIVOS_NO_DISPONIBLE.SUPERVISION_SOLICITO_OTRO_TURNO).categoriaOperativa,
    "cambio_turno_operativo"
  );
});

probar("Supervisión solicitó otro turno legacy sigue siendo legible", () => {
  const configuracion = catalogo.get(MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO);
  assert.equal(configuracion.esLegacy, true);
  assert.equal(configuracion.disponibleParaNuevaCarga, false);
  assert.equal(
    obtenerEtiquetaMotivoNoDisponible({ motivo: MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO }),
    "Supervisión solicitó otro turno"
  );
});

console.log(`\n${aprobadas} comprobaciones del catálogo canónico pasaron.`);
