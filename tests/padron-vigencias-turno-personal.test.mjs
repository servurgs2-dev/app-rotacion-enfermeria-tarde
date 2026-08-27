import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CODIGOS_PADRON_VIGENCIAS,
  construirPadronPersonalMensual,
  resolverPadronVigenciasEfectivasMes,
  resolverPertenenciaPersonaEnFecha,
  resolverPersonalEfectivoEnFecha
} from "../src/utils/padronVigenciasTurnoPersonal.js";
import { CODIGOS_VIGENCIA_TURNO } from "../src/utils/vigenciasTurnoPersonal.js";
import { crearCargadorPadronPersonalEfectivoMes } from "../src/services/servicioPadronVigenciasTurnoPersonal.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

const persona = (id, nombre = "Juan Pérez", categoria = "enfermero", funcionario = "12345") => ({
  id, nombre, categoria, funcionario
});
const estados = (personaBase = persona("p-1"), turno = "manana") => ({
  noche: { personal: [] },
  manana: { personal: turno === "manana" ? [personaBase] : [] },
  tarde: { personal: turno === "tarde" ? [personaBase] : [] },
  vespertino: { personal: [] }
});
const rangosCambio = [
  { personaId: "p-1", mes: "2026-09", turno: "manana", desde: "2026-09-01", hasta: "2026-09-15" },
  { personaId: "p-1", mes: "2026-09", turno: "tarde", desde: "2026-09-16", hasta: "2026-09-30" }
];
const explicita = (vigencias = rangosCambio, personaId = "p-1", mes = "2026-09") => ({
  existe: true, personaId, mes, revision: "1", actualizadoEn: null, vigencias
});
const resolver = (opciones = {}) => resolverPadronVigenciasEfectivasMes({
  mes: "2026-09",
  estadosPorTurno: estados(),
  configuracionesExplicitas: [],
  ...opciones
});
const contieneCodigo = (resultado, codigo) =>
  resultado.diagnosticos.some((diagnostico) => diagnostico.codigo === codigo);

await probar("persona legacy única obtiene vigencia implícita de mes completo", () => {
  const resultado = resolver();
  assert.equal(resultado.personas[0].origen, "legacy_implicita");
  assert.equal(resultado.personas[0].vigencias[0].desde, "2026-09-01");
  assert.equal(resultado.personas[0].vigencias[0].hasta, "2026-09-30");
});

await probar("padrón contiene una identidad única", () => {
  const resultado = resolver();
  assert.equal(resultado.personas.length, 1);
  assert.equal(Object.keys(resultado.porPersonaId).length, 1);
});

await probar("turnoFuente se preserva separado de las vigencias", () => {
  assert.equal(resolver().personas[0].turnoFuente, "manana");
});

await probar("explícita representa Mañana 01-15 y Tarde 16-30", () => {
  const resultado = resolver({ configuracionesExplicitas: [explicita()] });
  assert.deepEqual(resultado.personas[0].vigencias.map(({ turno }) => turno), ["manana", "tarde"]);
});

await probar("10 de septiembre pertenece sólo a Mañana", () => {
  const padron = resolver({ configuracionesExplicitas: [explicita()] });
  assert.equal(resolverPersonalEfectivoEnFecha({
    mes: "2026-09", fecha: "2026-09-10", turno: "manana", padronEfectivo: padron
  }).personas.length, 1);
  assert.equal(resolverPersonalEfectivoEnFecha({
    mes: "2026-09", fecha: "2026-09-10", turno: "tarde", padronEfectivo: padron
  }).personas.length, 0);
});

await probar("20 de septiembre pertenece sólo a Tarde", () => {
  const padron = resolver({ configuracionesExplicitas: [explicita()] });
  assert.equal(resolverPersonalEfectivoEnFecha({
    mes: "2026-09", fecha: "2026-09-20", turno: "manana", padronEfectivo: padron
  }).personas.length, 0);
  assert.equal(resolverPersonalEfectivoEnFecha({
    mes: "2026-09", fecha: "2026-09-20", turno: "tarde", padronEfectivo: padron
  }).personas.length, 1);
});

await probar("una identidad nunca aparece en dos turnos el mismo día", () => {
  const padron = resolver({ configuracionesExplicitas: [explicita()] });
  const encontrados = ["noche", "manana", "tarde", "vespertino"].flatMap((turno) =>
    resolverPersonalEfectivoEnFecha({
      mes: "2026-09", fecha: "2026-09-20", turno, padronEfectivo: padron
    }).personas.map(({ personaId }) => personaId)
  );
  assert.deepEqual(encontrados, ["p-1"]);
});

await probar("vigencia explícita reemplaza el mes completo legacy", () => {
  const parcial = [rangosCambio[1]];
  const resultado = resolver({ configuracionesExplicitas: [explicita(parcial)] });
  assert.equal(resultado.personas[0].origen, "explicita");
  assert.deepEqual(resultado.personas[0].vigencias, parcial);
});

await probar("hueco explícito no cae a turnoFuente legacy", () => {
  const padron = resolver({ configuracionesExplicitas: [explicita([rangosCambio[0]])] });
  const pertenencia = resolverPertenenciaPersonaEnFecha({
    personaId: "p-1", fecha: "2026-09-20", padronEfectivo: padron
  });
  assert.equal(pertenencia.turnoEfectivo, null);
  assert.equal(pertenencia.codigo, CODIGOS_VIGENCIA_TURNO.SIN_VIGENCIA_EN_FECHA);
});

await probar("persona con hueco permanece en padrón", () => {
  const padron = resolver({ configuracionesExplicitas: [explicita([rangosCambio[0]])] });
  assert.equal(padron.personas.length, 1);
  assert.equal(padron.personas[0].personaId, "p-1");
});

await probar("duplicado físico entre turnos genera diagnóstico", () => {
  const resultado = resolver({
    estadosPorTurno: {
      manana: { personal: [persona("p-1")] },
      tarde: { personal: [persona("p-1")] }
    }
  });
  assert.equal(contieneCodigo(resultado, CODIGOS_PADRON_VIGENCIAS.PERSONA_DUPLICADA_ENTRE_TURNOS), true);
  assert.equal(resultado.personas.length, 0);
});

await probar("categoría inconsistente genera diagnóstico", () => {
  const resultado = resolver({
    estadosPorTurno: {
      manana: { personal: [persona("p-1", "Juan", "enfermero")] },
      tarde: { personal: [persona("p-1", "Juan", "licenciado")] }
    }
  });
  assert.equal(contieneCodigo(resultado, CODIGOS_PADRON_VIGENCIAS.CATEGORIA_PERSONA_INCONSISTENTE), true);
  assert.equal(resultado.personas.length, 0);
  assert.equal(resultado.porPersonaId["p-1"], undefined);
  assert.equal(resolverPertenenciaPersonaEnFecha({
    personaId: "p-1", fecha: "2026-09-10", padronEfectivo: resultado
  }).codigo, CODIGOS_PADRON_VIGENCIAS.PERSONA_PADRON_INVALIDA);
});

await probar("configuración explícita duplicada no elige ni cae a legacy", () => {
  const primera = explicita([rangosCambio[0]]);
  const segunda = explicita([rangosCambio[1]]);
  const resultado = resolver({ configuracionesExplicitas: [primera, segunda] });
  assert.equal(contieneCodigo(
    resultado,
    CODIGOS_PADRON_VIGENCIAS.CONFIGURACION_EXPLICITA_DUPLICADA
  ), true);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.personas[0].origen, "configuracion_invalida");
  assert.deepEqual(resultado.personas[0].vigencias, []);
  assert.equal(resultado.personas[0].origen === "legacy_implicita", false);
  const pertenencia = resolverPertenenciaPersonaEnFecha({
    personaId: "p-1", fecha: "2026-09-10", padronEfectivo: resultado
  });
  assert.equal(pertenencia.codigo, CODIGOS_PADRON_VIGENCIAS.PERSONA_PADRON_INVALIDA);
  assert.equal(pertenencia.turnoEfectivo, null);
});

await probar("resolución de turno omite identidad con configuración ambigua", () => {
  const resultado = resolver({
    configuracionesExplicitas: [explicita([rangosCambio[0]]), explicita([rangosCambio[1]])]
  });
  for (const turno of ["noche", "manana", "tarde", "vespertino"]) {
    assert.equal(resolverPersonalEfectivoEnFecha({
      mes: "2026-09", fecha: "2026-09-10", turno, padronEfectivo: resultado
    }).personas.length, 0);
  }
});

await probar("vigencia huérfana no crea persona fantasma", () => {
  const resultado = resolver({
    configuracionesExplicitas: [explicita([
      { ...rangosCambio[0], personaId: "ausente" }
    ], "ausente")]
  });
  assert.equal(contieneCodigo(resultado, CODIGOS_PADRON_VIGENCIAS.VIGENCIA_PERSONA_NO_ENCONTRADA), true);
  assert.equal(resultado.porPersonaId.ausente, undefined);
});

await probar("nombres iguales con IDs distintos permanecen separados", () => {
  const resultado = resolver({
    estadosPorTurno: {
      manana: { personal: [persona("p-1", "Alex", "enfermero", "1")] },
      tarde: { personal: [persona("p-2", "Alex", "enfermero", "2")] }
    }
  });
  assert.deepEqual(resultado.personas.map(({ personaId }) => personaId), ["p-1", "p-2"]);
});

await probar("mismo ID conserva identidad aunque cambie el nombre", () => {
  const padron = construirPadronPersonalMensual({
    mes: "2026-09",
    estadosPorTurno: {
      manana: { personal: [
        persona("p-1", "Juan Pérez"),
        persona("p-1", "Juan P. Pérez")
      ] }
    }
  });
  assert.equal(padron.personas.length, 1);
  assert.equal(padron.personas[0].personaId, "p-1");
});

await probar("construcción y resolución no mutan entradas", () => {
  const fuentes = estados();
  const configuraciones = [explicita()];
  const firma = JSON.stringify({ fuentes, configuraciones });
  const resultado = resolver({ estadosPorTurno: fuentes, configuracionesExplicitas: configuraciones });
  resultado.personas[0].persona.nombre = "Mutado";
  assert.equal(JSON.stringify({ fuentes, configuraciones }), firma);
});

await probar("otro mes funciona sin hardcode de septiembre", () => {
  const resultado = resolverPadronVigenciasEfectivasMes({
    mes: "2027-04",
    estadosPorTurno: estados(),
    configuracionesExplicitas: [explicita([{
      personaId: "p-1", mes: "2027-04", turno: "vespertino",
      desde: "2027-04-01", hasta: "2027-04-30"
    }], "p-1", "2027-04")]
  });
  assert.equal(resolverPertenenciaPersonaEnFecha({
    personaId: "p-1", fecha: "2027-04-18", padronEfectivo: resultado
  }).turnoEfectivo, "vespertino");
});

await probar("orquestador realiza una sola carga mensual", async () => {
  let llamadas = 0;
  const cargar = crearCargadorPadronPersonalEfectivoMes({
    cargarVigenciasMes: async (mes) => {
      llamadas += 1;
      assert.equal(mes, "2026-09");
      return [explicita()];
    }
  });
  const resultado = await cargar({ mes: "2026-09", estadosPorTurno: estados() });
  assert.equal(llamadas, 1);
  assert.equal(resultado.personas.length, 1);
});

await probar("sin filas explícitas opera únicamente con legacy", async () => {
  const cargar = crearCargadorPadronPersonalEfectivoMes({ cargarVigenciasMes: async () => [] });
  const resultado = await cargar({ mes: "2026-09", estadosPorTurno: estados() });
  assert.equal(resultado.personas[0].origen, "legacy_implicita");
});

await probar("datos explícitos solapados se diagnostican y no se ocultan", () => {
  const solapadas = [
    { ...rangosCambio[0], hasta: "2026-09-20" },
    { ...rangosCambio[1], desde: "2026-09-15" }
  ];
  const resultado = resolver({ configuracionesExplicitas: [explicita(solapadas)] });
  assert.equal(contieneCodigo(resultado, CODIGOS_VIGENCIA_TURNO.SOLAPAMIENTO_VIGENCIAS), true);
  assert.equal(resultado.ok, false);
});

await probar("Extra conceptual no altera la pertenencia base", () => {
  const padron = resolver();
  const extra = { personaId: "p-1", fecha: "2026-09-10", turnoDestino: "tarde" };
  assert.equal(extra.turnoDestino, "tarde");
  assert.equal(resolverPertenenciaPersonaEnFecha({
    personaId: extra.personaId, fecha: extra.fecha, padronEfectivo: padron
  }).turnoEfectivo, "manana");
});

await probar("padrón no depende de turnoActivo", () => {
  const codigo = fs.readFileSync(
    path.join(raiz, "src/utils/padronVigenciasTurnoPersonal.js"),
    "utf8"
  );
  assert.doesNotMatch(codigo, /turnoActivo/);
});

await probar("Personal y Calendario integran el padrón, Planilla aún no", () => {
  assert.match(
    fs.readFileSync(path.join(raiz, "src/components/personal/ListaPersonal.jsx"), "utf8"),
    /resolverPersonalMensualPorTurno/
  );
  assert.match(
    fs.readFileSync(path.join(raiz, "src/App.jsx"), "utf8"),
    /resolverPersonalEfectivoPorTurnoFecha/
  );
  const consumidores = [
    "src/components/planilla/PlanillaMensual.jsx",
    "src/components/supervision/VistaSupervision.jsx",
    "src/utils/preparacionMesNuevo.js"
  ].filter((archivo) => fs.existsSync(path.join(raiz, archivo)));
  consumidores.forEach((archivo) => assert.doesNotMatch(
    fs.readFileSync(path.join(raiz, archivo), "utf8"),
    /padronVigenciasTurnoPersonal/
  ));
});

console.log(`Padrón y vigencias efectivas: ${total}/${total} comprobaciones OK.`);
