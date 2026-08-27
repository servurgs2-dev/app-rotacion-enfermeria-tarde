import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CODIGOS_VIGENCIA_TURNO,
  crearVigenciasImplicitasLegacy,
  haySolapamientoVigencias,
  normalizarVigenciaTurno,
  obtenerVigenciaPersonaEnFecha,
  resolverTurnoPersonaEnFecha,
  resolverVigenciasEfectivasPersonaMes,
  validarVigenciaTurno,
  validarVigenciasPersonaMes
} from "../src/utils/vigenciasTurnoPersonal.js";

const persona = (id, nombre = "Juan Pérez", categoria = "enfermero", funcionario = "12345") => ({
  id,
  nombre,
  categoria,
  funcionario
});
const vigencia = (turno, desde, hasta, personaId = "p-1", mes = "2026-09") => ({
  personaId,
  mes,
  turno,
  desde,
  hasta
});
const separadas = [
  vigencia("manana", "2026-09-01", "2026-09-15"),
  vigencia("tarde", "2026-09-16", "2026-09-30")
];
const codigoPresente = (resultado, codigo) =>
  resultado.errores.some((error) => error.codigo === codigo);

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

probar("Mañana 01-15 y Tarde 16-30 son válidas", () => {
  assert.equal(validarVigenciasPersonaMes({ personaId: "p-1", mes: "2026-09", vigencias: separadas }).valido, true);
});

probar("Mañana 01-20 y Tarde 15-30 se solapan", () => {
  const resultado = validarVigenciasPersonaMes({
    personaId: "p-1",
    mes: "2026-09",
    vigencias: [
      vigencia("manana", "2026-09-01", "2026-09-20"),
      vigencia("tarde", "2026-09-15", "2026-09-30")
    ]
  });
  assert.equal(resultado.valido, false);
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.SOLAPAMIENTO_VIGENCIAS), true);
});

probar("solapamiento dentro del mismo turno también es inválido", () => {
  const lista = [
    vigencia("manana", "2026-09-01", "2026-09-12"),
    vigencia("manana", "2026-09-10", "2026-09-20")
  ];
  assert.equal(haySolapamientoVigencias(lista), true);
  assert.equal(validarVigenciasPersonaMes({ personaId: "p-1", mes: "2026-09", vigencias: lista }).valido, false);
});

probar("rangos contiguos no se solapan", () => {
  assert.equal(haySolapamientoVigencias(separadas), false);
});

probar("rangos simultáneos de identidades distintas no se solapan entre sí", () => {
  assert.equal(haySolapamientoVigencias([
    vigencia("manana", "2026-09-01", "2026-09-30", "p-1"),
    vigencia("tarde", "2026-09-01", "2026-09-30", "p-2")
  ]), false);
});

probar("desde posterior a hasta es inválido", () => {
  const resultado = validarVigenciaTurno(vigencia("tarde", "2026-09-20", "2026-09-10"));
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.RANGO_INVERTIDO), true);
});

probar("una fecha fuera del mes declarado es inválida", () => {
  const resultado = validarVigenciaTurno(vigencia("tarde", "2026-08-31", "2026-09-10"));
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.FECHA_FUERA_DE_MES), true);
});

probar("una fecha calendario inexistente es inválida", () => {
  const resultado = validarVigenciaTurno(vigencia("tarde", "2026-09-31", "2026-09-31"));
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.FECHA_DESDE_INVALIDA), true);
});

probar("turno inválido se rechaza", () => {
  const resultado = validarVigenciaTurno(vigencia("madrugada", "2026-09-01", "2026-09-02"));
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.TURNO_INVALIDO), true);
});

probar("personaId vacío se rechaza", () => {
  const resultado = validarVigenciaTurno(vigencia("tarde", "2026-09-01", "2026-09-02", ""));
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.PERSONA_ID_REQUERIDA), true);
});

probar("contexto persona y mes se valida aun sin rangos", () => {
  const resultado = validarVigenciasPersonaMes({ personaId: "", mes: "mes-invalido", vigencias: [] });
  assert.equal(resultado.valido, false);
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.PERSONA_ID_REQUERIDA), true);
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.MES_INVALIDO), true);
});

probar("resolver 10 de septiembre devuelve Mañana", () => {
  assert.equal(resolverTurnoPersonaEnFecha({ personaId: "p-1", fecha: "2026-09-10", vigencias: separadas }).turno, "manana");
});

probar("resolver 20 de septiembre devuelve Tarde", () => {
  assert.equal(resolverTurnoPersonaEnFecha({ personaId: "p-1", fecha: "2026-09-20", vigencias: separadas }).turno, "tarde");
});

probar("fecha en hueco informa SIN_VIGENCIA_EN_FECHA", () => {
  const resultado = resolverTurnoPersonaEnFecha({
    personaId: "p-1",
    fecha: "2026-09-20",
    vigencias: [vigencia("manana", "2026-09-01", "2026-09-15")]
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.turno, null);
  assert.equal(resultado.codigo, CODIGOS_VIGENCIA_TURNO.SIN_VIGENCIA_EN_FECHA);
});

probar("otra persona no interfiere", () => {
  const resultado = resolverTurnoPersonaEnFecha({
    personaId: "p-1",
    fecha: "2026-09-10",
    vigencias: [...separadas, vigencia("noche", "2026-09-01", "2026-09-30", "p-2")]
  });
  assert.equal(resultado.turno, "manana");
});

probar("la identidad se conserva entre turnos", () => {
  const ids = new Set(separadas.map((item) => item.personaId));
  assert.deepEqual([...ids], ["p-1"]);
});

probar("explícitas reemplazan fallback legacy", () => {
  const resultado = resolverVigenciasEfectivasPersonaMes({
    personaId: "p-1",
    mes: "2026-09",
    vigenciasExplicitas: [vigencia("tarde", "2026-09-16", "2026-09-30")],
    estadosPorTurno: [{ turno: "manana", personal: [persona("p-1")] }]
  });
  assert.equal(resultado.origen, "explicita");
  assert.deepEqual(resultado.vigencias.map((item) => item.turno), ["tarde"]);
  assert.equal(resultado.vigencias[0].desde, "2026-09-16");
});

probar("sin explícitas crea fallback legacy por mes completo", () => {
  const resultado = resolverVigenciasEfectivasPersonaMes({
    personaId: "p-1",
    mes: "2026-09",
    estadosPorTurno: [{ turno: "manana", personal: [persona("p-1")] }]
  });
  assert.equal(resultado.origen, "legacy_implicita");
  assert.deepEqual(resultado.vigencias[0], vigencia("manana", "2026-09-01", "2026-09-30"));
});

probar("misma identidad legacy en dos turnos genera conflicto", () => {
  const resultado = crearVigenciasImplicitasLegacy({
    mes: "2026-09",
    estadosPorTurno: [
      { turno: "manana", personal: [persona("p-1")] },
      { turno: "tarde", personal: [persona("p-1")] }
    ]
  });
  assert.equal(resultado.ok, false);
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.CONFLICTO_TURNOS_LEGACY), true);
  assert.equal(resultado.vigencias.length, 0);
});

probar("nombre igual con personaId distinto no mezcla identidades", () => {
  const resultado = crearVigenciasImplicitasLegacy({
    mes: "2026-09",
    estadosPorTurno: [
      { turno: "manana", personal: [persona("p-1", "Alex Pérez", "enfermero", "1")] },
      { turno: "tarde", personal: [persona("p-2", "Alex Pérez", "enfermero", "2")] }
    ]
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.vigencias.map((item) => item.personaId), ["p-1", "p-2"]);
});

probar("cambio de nombre con mismo personaId conserva identidad y diagnostica turnos", () => {
  const resultado = crearVigenciasImplicitasLegacy({
    mes: "2026-09",
    estadosPorTurno: [
      { turno: "manana", personal: [persona("p-1", "Juan Pérez")] },
      { turno: "tarde", personal: [persona("p-1", "Juan P. Pérez")] }
    ]
  });
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.CONFLICTO_TURNOS_LEGACY), true);
});

probar("categorías legacy incompatibles se diagnostican", () => {
  const resultado = crearVigenciasImplicitasLegacy({
    mes: "2026-09",
    estadosPorTurno: [{
      turno: "manana",
      personal: [persona("p-1", "Juan", "enfermero"), persona("p-1", "Juan", "licenciado")]
    }]
  });
  assert.equal(codigoPresente(resultado, CODIGOS_VIGENCIA_TURNO.CATEGORIA_LEGACY_INCOMPATIBLE), true);
});

probar("normalización clona y ordena sin mutar entradas", () => {
  const entrada = [separadas[1], separadas[0]].map((item) => ({ ...item }));
  const firma = JSON.stringify(entrada);
  const resultado = validarVigenciasPersonaMes({ personaId: "p-1", mes: "2026-09", vigencias: entrada });
  resultado.vigencias[0].turno = "noche";
  assert.equal(JSON.stringify(entrada), firma);
  assert.equal(entrada[0].turno, "tarde");
});

probar("normalizador defensivo rechaza y no devuelve dato inválido", () => {
  const resultado = normalizarVigenciaTurno(vigencia("tarde", "2026-09-31", "2026-09-31"));
  assert.equal(resultado.ok, false);
  assert.equal(resultado.vigencia, null);
});

probar("funciona en un mes genérico sin hardcodear septiembre", () => {
  const lista = [vigencia("vespertino", "2027-04-01", "2027-04-30", "p-9", "2027-04")];
  assert.equal(resolverTurnoPersonaEnFecha({ personaId: "p-9", fecha: "2027-04-18", vigencias: lista }).turno, "vespertino");
});

probar("primer y último día del mes son inclusivos", () => {
  assert.equal(obtenerVigenciaPersonaEnFecha({ personaId: "p-1", fecha: "2026-09-01", vigencias: separadas }).vigencia.turno, "manana");
  assert.equal(obtenerVigenciaPersonaEnFecha({ personaId: "p-1", fecha: "2026-09-30", vigencias: separadas }).vigencia.turno, "tarde");
});

probar("febrero bisiesto acepta el día 29", () => {
  const bisiesta = vigencia("noche", "2028-02-01", "2028-02-29", "p-1", "2028-02");
  assert.equal(validarVigenciaTurno(bisiesta).valida, true);
  assert.equal(resolverTurnoPersonaEnFecha({ personaId: "p-1", fecha: "2028-02-29", vigencias: [bisiesta] }).turno, "noche");
});

probar("un Extra conceptual no modifica el turno base", () => {
  const base = [vigencia("manana", "2026-09-01", "2026-09-30")];
  const extra = { personaId: "p-1", fecha: "2026-09-10", turnoDestino: "tarde" };
  assert.equal(extra.turnoDestino, "tarde");
  assert.equal(resolverTurnoPersonaEnFecha({ personaId: extra.personaId, fecha: extra.fecha, vigencias: base }).turno, "manana");
});

probar("el dominio no se importa directamente desde consumidores productivos", () => {
  const productivos = [
    "src/App.jsx",
    "src/components/personal/ListaPersonal.jsx",
    "src/components/planilla/PlanillaMensual.jsx",
    "src/components/calendario/CalendarioDiario.jsx",
    "src/utils/proyeccionDotacionSupervision.js",
    "src/utils/preparacionMesNuevo.js"
  ];
  productivos.forEach((archivo) => {
    assert.doesNotMatch(fs.readFileSync(archivo, "utf8"), /vigenciasTurnoPersonal/);
  });
});

console.log(`Vigencias de turno: ${total}/${total} comprobaciones OK.`);
