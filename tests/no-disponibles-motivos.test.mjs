import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearRegistroNoDisponible,
  excluirAusenciasOperativasNoDisponiblesDeAsignaciones,
  MOTIVOS_NO_DISPONIBLE,
  OPCIONES_MOTIVO_NO_DISPONIBLE,
  obtenerEtiquetaMotivoNoDisponible,
  obtenerNoDisponiblesDelDia,
  reemplazarRegistroNoDisponible
} from "../src/utils/noDisponiblesMotivos.js";
import {
  quitarPersonaDeListaReferencias,
  referenciaCorrespondeAPersona
} from "../src/utils/referenciasPersonas.js";
import { renombrarPersonaEnEstado } from "../src/utils/renombrarPersona.js";
import { limpiarPersonaDeCalendario } from "../src/utils/integridadPersonas.js";
import { aplicarPrioridadCoberturaParejas } from "../src/utils/coberturaParejasEnfermeros.js";
import { prepararFilasCalendarioPDF } from "../src/utils/exportPDF.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const persona = {
  id: "p1",
  nombre: "Persona A",
  categoria: "enfermero",
  turno: "tarde"
};
const cobertura = {
  id: "p2",
  nombre: "Persona B",
  categoria: "enfermero",
  turno: "manana"
};
const personal = [persona, cobertura];
const base = {
  persona,
  sectorOrigen: "REA 1",
  creadoEn: "2026-07-28T10:00:00.000Z"
};
const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
const panelFuente = fs.readFileSync(
  new URL("../src/components/calendario/PanelNoDisponible.jsx", import.meta.url),
  "utf8"
);

probar("1 Falta con aviso se guarda correctamente", () => {
  const resultado = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO
  });
  assert.equal(resultado.error, "");
  assert.equal(resultado.registro.motivo, "falta_con_aviso");
  assert.equal(resultado.registro.personaId, "p1");
});
probar("2 Cambio con otro turno se guarda correctamente", () => {
  const resultado = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO,
    detalle: "Cambio coordinado"
  });
  assert.equal(resultado.registro.motivo, "cambio_otro_turno");
  assert.equal(resultado.registro.detalle, "Cambio coordinado");
});
probar("3 permite registrar quién cubre sin crear un Extra", () => {
  const resultado = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO,
    personaCobertura: cobertura
  });
  assert.equal(resultado.registro.personaCoberturaId, "p2");
  assert.equal(resultado.registro.personaCoberturaNombre, "Persona B");
  assert.equal(Object.hasOwn(resultado.registro, "temporal"), false);
});
probar("4 Supervisión permite seleccionar turno destino", () => {
  const resultado = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO,
    turnoDestino: "noche"
  });
  assert.equal(resultado.registro.turnoDestino, "noche");
  assert.match(panelFuente, /Turno destino/);
});
probar("5 Otro motivo exige detalle", () => {
  const resultado = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.OTRO,
    detalle: " "
  });
  assert.equal(resultado.registro, null);
  assert.match(resultado.error, /aclaración/);
});
probar("6 no permite confirmar sin motivo", () => {
  const resultado = crearRegistroNoDisponible({ ...base, motivo: "" });
  assert.equal(resultado.registro, null);
  assert.match(resultado.error, /Seleccioná un motivo/);
});
probar("7 los formatos históricos siguen siendo legibles", () => {
  for (const referencia of ["Persona A", "p1", { personaId: "p1", nombre: "Persona A" }]) {
    assert.equal(referenciaCorrespondeAPersona(referencia, persona, personal), true);
  }
});
probar("8 un registro histórico muestra Motivo no informado", () => {
  assert.equal(
    obtenerEtiquetaMotivoNoDisponible({ personaId: "p1", nombre: "Persona A" }),
    "Motivo no informado"
  );
});
probar("9 la disponibilidad reconoce el nuevo objeto por identidad", () => {
  const registro = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO
  }).registro;
  assert.equal(referenciaCorrespondeAPersona(registro, persona, personal), true);
  assert.match(calendarioFuente, /referenciaCorrespondeAPersona\(/);
});
probar("10 quitar No disponible elimina el objeto correcto", () => {
  const registro = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO
  }).registro;
  assert.deepEqual(
    quitarPersonaDeListaReferencias([registro, cobertura], persona, personal),
    [cobertura]
  );
});
probar("11 editar motivo reemplaza solo el registro informativo", () => {
  const anterior = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO
  }).registro;
  const nuevo = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.OTRO,
    detalle: "Motivo sintético"
  }).registro;
  const planilla = { semana1: { "REA 1": { personaId: "p1" } } };
  const lista = reemplazarRegistroNoDisponible({
    lista: [anterior],
    persona,
    registro: nuevo,
    personal
  });
  assert.equal(lista[0].motivo, "otro");
  assert.deepEqual(planilla, { semana1: { "REA 1": { personaId: "p1" } } });
});

const certificacionBase = {
  personaId: "p1",
  nombre: "Persona A",
  desde: "2026-07-28",
  hasta: "2026-07-30"
};
const listar = (fecha, registros = []) => obtenerNoDisponiblesDelDia({
  registros,
  certificaciones: [certificacionBase],
  personal,
  fecha,
  categoria: "enfermero",
  obtenerSectorOrigen: () => "REA 1"
});

probar("12 una certificación vigente aparece automáticamente", () => {
  const resultado = listar("2026-07-29");
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].motivoEtiqueta, "Certificación médica");
  assert.equal(resultado[0].detalle, "28/07 al 30/07");
});
probar("13 una certificación vencida no aparece", () => {
  assert.equal(listar("2026-07-31").length, 0);
});
probar("14 una certificación futura no aparece", () => {
  assert.equal(listar("2026-07-27").length, 0);
});
probar("15 una certificación no se copia a noDisponibles", () => {
  const registros = [];
  listar("2026-07-29", registros);
  assert.deepEqual(registros, []);
});
probar("16 una persona certificada no se duplica y la certificación tiene prioridad", () => {
  const historico = { personaId: "p1", nombre: "Persona A" };
  const resultado = listar("2026-07-29", [historico]);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].tipo, "certificacion");
});
probar("17 la fila vacía muestra Falta con aviso", () => {
  assert.match(calendarioFuente, /Sin cobertura — \$\{noDisponibleDelSector\.motivoBreve\}/);
  assert.equal(
    obtenerEtiquetaMotivoNoDisponible({ motivo: "falta_con_aviso" }, { breve: true }),
    "Falta con aviso"
  );
});
probar("18 la fila vacía muestra Cambio de turno", () => {
  assert.equal(
    obtenerEtiquetaMotivoNoDisponible({ motivo: "cambio_otro_turno" }, { breve: true }),
    "Cambio de turno"
  );
});
probar("19 la fila vacía muestra Supervisión", () => {
  assert.equal(
    obtenerEtiquetaMotivoNoDisponible({ motivo: "supervision_otro_turno" }, { breve: true }),
    "Supervisión"
  );
});
probar("20 la fila vacía muestra Certificación médica", () => {
  assert.equal(
    obtenerEtiquetaMotivoNoDisponible({ tipo: "certificacion" }),
    "Certificación médica"
  );
});
probar("21 la prioridad por parejas continúa funcionando", () => {
  const resultado = aplicarPrioridadCoberturaParejas({
    asignaciones: [
      { nombre: "REA 1", enfermero: null },
      { nombre: "REA 2", enfermero: cobertura }
    ]
  });
  assert.equal(resultado[0].enfermero, cobertura);
  assert.equal(resultado[1].enfermero, null);
});
probar("22 los Turnantes continúan usando su origen de planilla", () => {
  assert.match(calendarioFuente, /obtenerIdentidadesTurnantes/);
  assert.doesNotMatch(calendarioFuente, /motivo.*esTurnante/);
});
probar("23 los Extras solo se ofrecen como cobertura informativa", () => {
  assert.match(panelFuente, /Cobertura aún no indicada/);
  assert.doesNotMatch(panelFuente, /setCalendario|agregarExtra/);
});
probar("24 las ausencias permanecen separadas de No disponibles", () => {
  assert.match(calendarioFuente, /Sin asignar — ausencia/);
  assert.match(calendarioFuente, /No disponibles del día/);
});
probar("25 cambiar nombre conserva el registro enriquecido", () => {
  const registro = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO,
    personaCobertura: cobertura
  }).registro;
  const estado = {
    personal,
    planillas: {},
    calendario: {
      enfermeros: { noDisponibles: { "2026-07-28": [registro] } },
      licenciados: {}
    },
    licencias: [],
    certificaciones: []
  };
  const renombrado = renombrarPersonaEnEstado(estado, "p1", "Persona Renombrada");
  const conservado = renombrado.calendario.enfermeros.noDisponibles["2026-07-28"][0];
  assert.equal(conservado.nombre, "Persona Renombrada");
  assert.equal(conservado.motivo, "cambio_otro_turno");
  assert.equal(conservado.personaCoberturaId, "p2");
});
probar("26 eliminar Personal limpia la referencia activa sin romper otras estructuras", () => {
  const registro = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO
  }).registro;
  const calendario = {
    noDisponibles: { "2026-07-28": [registro] },
    cambiosDia: {},
    cambiosParoDia: {},
    extras: {},
    asistenciaDia: {}
  };
  const limpio = limpiarPersonaDeCalendario(calendario, persona, personal);
  assert.equal(limpio.noDisponibles["2026-07-28"], undefined);
  assert.equal(limpio.extras, calendario.extras);
});
probar("27 preparar mes siguiente mantiene noDisponibles vacío", () => {
  const preparacion = fs.readFileSync(
    new URL("../src/utils/preparacionMesNuevo.js", import.meta.url),
    "utf8"
  );
  assert.match(preparacion, /const vacio = crearEstadoMensualVacio\(\)/);
  assert.doesNotMatch(preparacion, /noDisponibles:\s*clonar/);
});
probar("28 el PDF usa la etiqueta abreviada sin agregar tablas", () => {
  assert.deepEqual(
    prepararFilasCalendarioPDF([
      { nombre: "REA 1", enfermero: null, etiquetaVacio: "Sin cobertura — Falta con aviso" }
    ]),
    [["REA 1", "SIN COBERTURA — FALTA CON AVISO"]]
  );
});
probar("29 el panel diario presenta motivos sin tocar Planilla semanal", () => {
  assert.match(calendarioFuente, /PanelNoDisponible/);
  assert.doesNotMatch(panelFuente, /planilla|generarRotacion/i);
});
probar("30 Adhesión a PARO es opción manual exacta y Cambio con otro turno no lo es", () => {
  assert.equal(MOTIVOS_NO_DISPONIBLE.ADHESION_PARO, "adhesion_paro");
  assert.deepEqual(
    OPCIONES_MOTIVO_NO_DISPONIBLE.find((opcion) => opcion.valor === "adhesion_paro"),
    { valor: "adhesion_paro", etiqueta: "Adhesión a PARO" }
  );
  assert.equal(
    OPCIONES_MOTIVO_NO_DISPONIBLE.some(
      (opcion) => opcion.valor === MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO
    ),
    false
  );
  assert.equal(MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO, "cambio_otro_turno");
});
probar("31 Adhesión a PARO es ausencia operativa simple sin __EMPTY__", () => {
  const registro = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.ADHESION_PARO
  }).registro;
  const [resultado] = excluirAusenciasOperativasNoDisponiblesDeAsignaciones({
    asignaciones: [{ nombre: "REA 1", enfermero: persona, vacioManual: false }],
    registros: [registro],
    personal
  });
  assert.equal(registro.motivo, "adhesion_paro");
  assert.equal(obtenerEtiquetaMotivoNoDisponible(registro), "Adhesión a PARO");
  assert.equal(resultado.enfermero, null);
  assert.equal(resultado.excluidoPorNoDisponible, true);
  assert.equal(resultado.vacioManual, false);
  assert.equal(resultado.cambioManualProtegido, undefined);
  assert.equal(JSON.stringify(resultado).includes("__EMPTY__"), false);
});
probar("32 Otro motivo conserva texto y libera sin __EMPTY__ ni protección manual", () => {
  const registro = crearRegistroNoDisponible({
    ...base,
    motivo: MOTIVOS_NO_DISPONIBLE.OTRO,
    detalle: "Ausencia informada"
  }).registro;
  const [resultado] = excluirAusenciasOperativasNoDisponiblesDeAsignaciones({
    asignaciones: [{ nombre: "REA 1", enfermero: persona, vacioManual: false }],
    registros: [registro],
    personal
  });
  assert.equal(registro.motivo, "otro");
  assert.equal(registro.detalle, "Ausencia informada");
  assert.equal(obtenerEtiquetaMotivoNoDisponible(registro), "Otro motivo");
  assert.equal(resultado.enfermero, null);
  assert.equal(resultado.excluidoPorNoDisponible, true);
  assert.equal(resultado.vacioManual, false);
  assert.equal(resultado.cambioManualProtegido, undefined);
  assert.equal(JSON.stringify(resultado).includes("__EMPTY__"), false);
});
probar("30 no existe SQL nuevo", () => {
  const helper = fs.readFileSync(
    new URL("../src/utils/noDisponiblesMotivos.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(helper + panelFuente, /\b(?:select|insert|update|delete)\s+(?:from|into|public\.)/i);
});

console.log(`\n${total} pruebas de motivos de No disponibles pasaron.`);
