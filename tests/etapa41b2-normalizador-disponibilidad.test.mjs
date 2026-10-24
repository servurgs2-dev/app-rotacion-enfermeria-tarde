import assert from "node:assert/strict";
import { esCambioOtroTurnoVinculado } from "../src/utils/cambioOtroTurno.js";
import {
  crearCambioHorarioPersonal,
  evaluarDisponibilidadPorNovedades
} from "../src/utils/novedadesPersonal.js";
import { resolverDisponibilidadPersonalPorFecha } from "../src/utils/resolverDisponibilidadPersonalPorFecha.js";

const FECHA = "2026-10-24";
const persona = { id: "p-1", nombre: "Ana", categoria: "enfermero", turno: "tarde", horario: "normal" };
const personal = [persona];
const base = (cambios = {}) => ({
  persona,
  personal,
  fecha: FECHA,
  turnoConsultado: "tarde",
  ...cambios
});
const novedad = (tipo, cambios = {}) => ({
  id: `n-${tipo}`,
  personaId: persona.id,
  personaNombre: persona.nombre,
  tipo,
  fechaDesde: FECHA,
  fechaHasta: FECHA,
  turno: "tarde",
  categoria: "enfermero",
  afectaDisponibilidad: true,
  estado: "activa",
  datos: {},
  ...cambios
});
const noDisponible = (motivo, cambios = {}) => ({
  id: `nd-${motivo}`,
  personaId: persona.id,
  nombre: persona.nombre,
  motivo,
  ...cambios
});
const resolver = (cambios = {}) => resolverDisponibilidadPersonalPorFecha(base(cambios));
const codigos = (resultado) => resultado.causasBloqueantes.map((causa) => causa.codigo);

let aprobadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  aprobadas += 1;
  console.log(`OK ${nombre}`);
};

probar("1 persona normal está disponible", () => {
  const resultado = resolver();
  assert.equal(resultado.disponibleEnTurno, true);
  assert.equal(resultado.disponibleParaCobertura, true);
  assert.equal(resultado.turnoEfectivo, "tarde");
});

probar("2 persona de otro turno no pertenece ni está disponible", () => {
  const resultado = resolver({ turnoConsultado: "manana" });
  assert.equal(resultado.perteneceAlTurnoConsultado, false);
  assert.equal(resultado.disponibleEnTurno, false);
  assert.equal(resultado.disponibleParaCobertura, false);
});

probar("3 una vigencia válida cambia el turno efectivo antes de filtrar", () => {
  const resultado = resolver({
    turnoConsultado: "manana",
    padronVigencias: [{
      personaId: persona.id,
      mes: "2026-10",
      turno: "manana",
      desde: "2026-10-01",
      hasta: "2026-10-31"
    }]
  });
  assert.equal(resultado.turnoEfectivo, "manana");
  assert.equal(resultado.perteneceAlTurnoConsultado, true);
});

for (const [numero, tipo, codigo] of [
  [4, "licencia", "licencia"],
  [5, "certificacion", "certificacion"],
  [6, "suspension", "suspension"],
  [7, "adhesion_paro", "adhesion_paro"]
]) {
  probar(`${numero} ${tipo} moderna bloquea`, () => {
    const resultado = resolver({ novedadesModernas: [novedad(tipo)] });
    assert.equal(resultado.disponibleEnTurno, false);
    assert.deepEqual(codigos(resultado), [codigo]);
  });
}

probar("8 adhesión a paro legacy bloquea", () => {
  const resultado = resolver({ noDisponiblesDiaTurno: [noDisponible("adhesion_paro")] });
  assert.deepEqual(codigos(resultado), ["adhesion_paro"]);
});

probar("9 adhesión moderna y legacy tiene un solo efecto", () => {
  const resultado = resolver({
    novedadesModernas: [novedad("adhesion_paro")],
    noDisponiblesDiaTurno: [noDisponible("adhesion_paro")]
  });
  assert.deepEqual(codigos(resultado), ["adhesion_paro"]);
  assert.deepEqual(resultado.causasBloqueantes[0].origenes.sort(), ["no_disponible", "novedades_personal"]);
});

for (const [numero, motivo] of [
  [10, "falta_sin_aviso"],
  [11, "supervision_autorizo_inasistencia"],
  [12, "donacion_sangre"],
  [13, "pap"],
  [14, "mamografia"],
  [15, "libre_feriado"],
  [16, "otro"]
]) {
  probar(`${numero} ${motivo} bloquea`, () => {
    const resultado = resolver({ noDisponiblesDiaTurno: [noDisponible(motivo)] });
    assert.equal(resultado.disponibleEnTurno, false);
    assert.deepEqual(codigos(resultado), [motivo]);
  });
}

probar("17 Supervisión solicitó otro turno conserva indisponibilidad operativa", () => {
  const resultado = resolver({
    noDisponiblesDiaTurno: [noDisponible("supervision_solicito_otro_turno", { turnoDestino: "noche" })]
  });
  assert.equal(resultado.contextoOperativo.noDisponible, true);
  assert.deepEqual(codigos(resultado), ["supervision_solicito_otro_turno"]);
});

probar("18 Certificación por el día proyectada no duplica la causa", () => {
  const resultado = resolver({
    certificacionesLegacy: [{
      id: "cert-dia",
      personaId: persona.id,
      nombre: persona.nombre,
      desde: FECHA,
      hasta: FECHA,
      origen: "no_disponibles_dia"
    }],
    noDisponiblesDiaTurno: [noDisponible("certificacion_dia")]
  });
  assert.deepEqual(codigos(resultado), ["certificacion"]);
});

probar("19 Libre ordinario no participa normalmente", () => {
  const resultado = resolver({ libresTurno: [{ personaId: persona.id, nombre: persona.nombre }] });
  assert.equal(resultado.contextoOperativo.libre, true);
  assert.equal(resultado.disponibleEnTurno, false);
  assert.deepEqual(codigos(resultado), ["libre"]);
});

probar("20 Ausente de asistencia bloquea", () => {
  const resultado = resolver({ asistenciaDia: { "id:p-1": "ausente" } });
  assert.equal(resultado.contextoOperativo.ausente, true);
  assert.deepEqual(codigos(resultado), ["ausente"]);
});

probar("21 Cambio con otro turno separa disponibilidad y cobertura", () => {
  const extra = {
    id: "extra-1",
    nombre: "Extra",
    categoria: "enfermero",
    tipoExtra: "cobertura",
    personaCubiertaId: persona.id
  };
  const resultado = resolver({
    extrasDiaTurno: [extra],
    noDisponiblesDiaTurno: [noDisponible("cambio_otro_turno", { personaCoberturaId: extra.id })]
  });
  assert.equal(resultado.disponibleEnTurno, false);
  assert.equal(resultado.disponibleParaCobertura, true);
  assert.equal(resultado.contextoOperativo.cambioOtroTurnoVinculado, true);
});

probar("22 cambio excepcional modifica horario pero no turno lógico", () => {
  const cambio = crearCambioHorarioPersonal({
    persona,
    fecha: FECHA,
    turno: "tarde",
    horaEntrada: "10:00",
    horaSalida: "16:00"
  }).novedad;
  const resultado = resolver({ novedadesModernas: [{ ...cambio, id: "horario-1" }] });
  assert.equal(resultado.turnoEfectivo, "tarde");
  assert.deepEqual(resultado.horarioEfectivo, {
    horaEntrada: "10:00",
    horaSalida: "16:00",
    origen: "cambio_horario",
    registroId: "horario-1"
  });
});

probar("23 Licencia y Suspensión acumulan ambas causas", () => {
  const resultado = resolver({
    novedadesModernas: [novedad("licencia"), novedad("suspension")]
  });
  assert.deepEqual(codigos(resultado).sort(), ["licencia", "suspension"]);
});

probar("24 Licencia moderna y legacy equivalente se deduplica", () => {
  const resultado = resolver({
    novedadesModernas: [novedad("licencia")],
    licenciasLegacy: [{ personaId: persona.id, nombre: persona.nombre, desde: FECHA, hasta: FECHA }]
  });
  assert.deepEqual(codigos(resultado), ["licencia"]);
  assert.equal(resultado.causasBloqueantes[0].origenes.length, 2);
});

probar("25 Certificación moderna y legacy equivalente se deduplica", () => {
  const resultado = resolver({
    novedadesModernas: [novedad("certificacion")],
    certificacionesLegacy: [{ personaId: persona.id, nombre: persona.nombre, desde: FECHA, hasta: FECHA }]
  });
  assert.deepEqual(codigos(resultado), ["certificacion"]);
  assert.equal(resultado.causasBloqueantes[0].origenes.length, 2);
});

probar("26 referencia legacy ambigua no se asigna a una persona", () => {
  const homonimo = { ...persona, id: "p-2" };
  const resultado = resolver({
    personal: [persona, homonimo],
    noDisponiblesDiaTurno: [{ nombre: persona.nombre, motivo: "otro" }]
  });
  assert.equal(resultado.disponibleEnTurno, true);
  assert.deepEqual(codigos(resultado), []);
  assert.equal(resultado.advertencias[0].codigo, "referencia_legacy_no_resuelta");
});

probar("27 mismos inputs producen el mismo resultado", () => {
  const entrada = base({ novedadesModernas: [novedad("suspension")] });
  assert.deepEqual(
    resolverDisponibilidadPersonalPorFecha(entrada),
    resolverDisponibilidadPersonalPorFecha(entrada)
  );
});

probar("28 no muta ninguno de sus inputs", () => {
  const entrada = base({
    novedadesModernas: [novedad("suspension")],
    noDisponiblesDiaTurno: [noDisponible("pap")],
    libresTurno: [],
    extrasDiaTurno: []
  });
  const antes = JSON.stringify(entrada);
  resolverDisponibilidadPersonalPorFecha(entrada);
  assert.equal(JSON.stringify(entrada), antes);
});

probar("29 coincide con el evaluador actual de Novedades", () => {
  const novedadesModernas = [novedad("suspension")];
  const actual = evaluarDisponibilidadPorNovedades({
    novedades: novedadesModernas,
    persona,
    fecha: FECHA,
    turno: "tarde"
  });
  const normalizado = resolver({ novedadesModernas });
  assert.equal(normalizado.disponibleEnTurno, actual.disponible);
  assert.deepEqual(codigos(normalizado), actual.bloqueantes.map((item) => item.tipo));
});

probar("30 coincide con el helper actual de Cambio con otro turno", () => {
  const extra = {
    id: "extra-diferencial",
    nombre: "Extra diferencial",
    categoria: "enfermero",
    tipoExtra: "cobertura",
    personaCubiertaId: persona.id
  };
  const noDisponiblesDiaTurno = [noDisponible("cambio_otro_turno", {
    personaCoberturaId: extra.id
  })];
  const actual = esCambioOtroTurnoVinculado({
    persona,
    registros: noDisponiblesDiaTurno,
    extras: [extra],
    personal
  });
  const normalizado = resolver({ extrasDiaTurno: [extra], noDisponiblesDiaTurno });
  assert.equal(normalizado.contextoOperativo.cambioOtroTurnoVinculado, actual);
  assert.equal(normalizado.disponibleParaCobertura, actual);
});

probar("31 las colecciones operativas de día y turno se consumen ya acotadas", () => {
  const resultado = resolver({
    noDisponiblesDiaTurno: [noDisponible("pap", { fecha: "2099-01-01", turno: "noche" })],
    asistenciaDia: {},
    libresTurno: [],
    extrasDiaTurno: []
  });
  assert.deepEqual(codigos(resultado), ["pap"]);
});

probar("32 Novedades se filtran internamente por la fecha consultada", () => {
  const resultado = resolver({
    novedadesModernas: [novedad("suspension", {
      fechaDesde: "2026-10-25",
      fechaHasta: "2026-10-25"
    })]
  });
  assert.equal(resultado.disponibleEnTurno, true);
  assert.deepEqual(codigos(resultado), []);
});

probar("33 Novedades se filtran después de resolver el turno efectivo", () => {
  const resultado = resolver({
    turnoConsultado: "manana",
    padronVigencias: [{
      personaId: persona.id,
      mes: "2026-10",
      turno: "manana",
      desde: "2026-10-01",
      hasta: "2026-10-31"
    }],
    novedadesModernas: [novedad("suspension", { turno: "tarde" })]
  });
  assert.equal(resultado.turnoEfectivo, "manana");
  assert.deepEqual(codigos(resultado), ["suspension"]);
});

console.log(`\n${aprobadas} comprobaciones del normalizador puro pasaron.`);
