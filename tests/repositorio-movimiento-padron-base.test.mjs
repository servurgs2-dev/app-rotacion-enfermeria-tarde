import assert from "node:assert/strict";
import test from "node:test";
import { crearRepositorioMovimientoPadronBase } from "../src/services/repositorioMovimientoPadronBase.js";
import {
  crearServicioMovimientoPadronBase,
  normalizarRevisionMovimientoPadronBase,
  obtenerMensajeMovimientoPadronBase
} from "../src/services/servicioMovimientoPadronBase.js";

const entrada = Object.freeze({
  mes: "2026-09",
  personaId: "persona-p",
  turnoOrigen: "manana",
  turnoDestino: "tarde",
  revisionOrigenEsperada: "12",
  revisionDestinoEsperada: "7"
});
const respuesta = Object.freeze({
  ok: true,
  mes: entrada.mes,
  personaId: entrada.personaId,
  turnoOrigen: entrada.turnoOrigen,
  turnoDestino: entrada.turnoDestino,
  revisionOrigen: "13",
  revisionDestino: "8",
  estadoOrigen: { personal: [] },
  estadoDestino: { personal: [{ id: entrada.personaId }] }
});

const crearEscenario = ({ data = respuesta, error = null } = {}) => {
  const llamadas = [];
  const cliente = {
    rpc: async (...argumentos) => {
      llamadas.push(structuredClone(argumentos));
      return { data: structuredClone(data), error };
    }
  };
  const repositorio = crearRepositorioMovimientoPadronBase({ cliente });
  const servicio = crearServicioMovimientoPadronBase(repositorio);
  return { cliente, llamadas, repositorio, servicio };
};

test("1 llama el RPC exacto", async () => {
  const e = crearEscenario(); await e.servicio.moverPersonaPadronBaseTurnoMes(entrada);
  assert.equal(e.llamadas[0][0], "mover_persona_padron_base_turno_mes");
});
test("2 envía nombres exactos de parámetros", async () => {
  const e = crearEscenario(); await e.servicio.moverPersonaPadronBaseTurnoMes(entrada);
  assert.deepEqual(Object.keys(e.llamadas[0][1]).sort(), [
    "p_mes", "p_persona_id", "p_revision_destino_esperada",
    "p_revision_origen_esperada", "p_turno_destino", "p_turno_origen"
  ]);
});
for (const [numero, campo] of [[3,"nombre"],[4,"categoria"],[5,"usuario"],[6,"rol"],[7,"vigencias"]]) {
  test(`${numero} no envía ${campo}`, async () => {
    const e = crearEscenario(); await e.servicio.moverPersonaPadronBaseTurnoMes(entrada);
    assert.equal(JSON.stringify(e.llamadas[0][1]).includes(campo), false);
  });
}
test("8 conserva mes y personaId", async () => {
  const e = crearEscenario(); await e.servicio.moverPersonaPadronBaseTurnoMes(entrada);
  assert.equal(e.llamadas[0][1].p_mes, entrada.mes); assert.equal(e.llamadas[0][1].p_persona_id, entrada.personaId);
});
test("9 conserva origen y destino", async () => {
  const e = crearEscenario(); await e.servicio.moverPersonaPadronBaseTurnoMes(entrada);
  assert.equal(e.llamadas[0][1].p_turno_origen, "manana"); assert.equal(e.llamadas[0][1].p_turno_destino, "tarde");
});
test("10 conserva ambas revisiones como strings", async () => {
  const e = crearEscenario(); await e.servicio.moverPersonaPadronBaseTurnoMes(entrada);
  assert.equal(e.llamadas[0][1].p_revision_origen_esperada, "12"); assert.equal(e.llamadas[0][1].p_revision_destino_esperada, "7");
});
test("11 normaliza respuesta completa", async () => {
  const e = crearEscenario(); assert.deepEqual(await e.servicio.moverPersonaPadronBaseTurnoMes(entrada), respuesta);
});
test("12 bigint y enteros seguros no pierden precisión", () => {
  assert.equal(normalizarRevisionMovimientoPadronBase(9007199254740993n), "9007199254740993");
  assert.equal(normalizarRevisionMovimientoPadronBase(12), "12");
});
test("13 error Supabase conserva original", async () => {
  const original = { message: "fallo de red", code: "XX000" };
  const e = crearEscenario({ error: original });
  await assert.rejects(() => e.servicio.moverPersonaPadronBaseTurnoMes(entrada), (error) => error.errorOriginal === original && error.mensajeTecnico === "fallo de red");
});

const errores = [
  [14,"PERMISO_SUPERVISION_REQUERIDO"], [15,"MES_HISTORICO_PROTEGIDO"],
  [16,"REVISION_ORIGEN_CONFLICTO"], [17,"REVISION_DESTINO_CONFLICTO"],
  [18,"REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES"],
  [19,"REFERENCIA_LEGACY_OPERATIVA_PENDIENTE"], [20,"REFERENCIA_LEGACY_AMBIGUA"]
];
for (const [numero, codigo] of errores) {
  test(`${numero} preserva ${codigo}`, async () => {
    const original = { message: codigo, code: "P0001", details: "detalle" };
    const e = crearEscenario({ error: original });
    await assert.rejects(() => e.servicio.moverPersonaPadronBaseTurnoMes(entrada), (error) =>
      error.codigo === codigo && error.errorOriginal === original && error.message === obtenerMensajeMovimientoPadronBase(codigo)
    );
  });
}

const invalidas = [
  [22,{ mes: "09-2026" },"MES_INVALIDO"],
  [23,{ personaId: "  " },"PERSONA_NO_IDENTIFICABLE"],
  [24,{ turnoOrigen: "otro" },"TURNO_ORIGEN_INVALIDO"],
  [25,{ turnoDestino: "otro" },"TURNO_DESTINO_INVALIDO"],
  [26,{ turnoDestino: "manana" },"TURNOS_IGUALES"],
  [27,{ revisionOrigenEsperada: undefined },"REVISION_ORIGEN_INVALIDA"],
  [28,{ revisionDestinoEsperada: undefined },"REVISION_DESTINO_INVALIDA"]
];
for (const [numero, cambio, codigo] of invalidas) {
  test(`${numero} valida ${codigo} antes del RPC`, async () => {
    const e = crearEscenario();
    await assert.rejects(() => e.servicio.moverPersonaPadronBaseTurnoMes({ ...entrada, ...cambio }), (error) => error.codigo === codigo);
    assert.equal(e.llamadas.length, 0);
  });
}
test("29 cliente y repositorio son inyectables", async () => {
  let recibido;
  const servicio = crearServicioMovimientoPadronBase({
    moverPersonaPadronBaseTurnoMes: async (argumentos) => { recibido = argumentos; return respuesta; }
  });
  await servicio.moverPersonaPadronBaseTurnoMes(entrada);
  assert.equal(recibido.personaId, entrada.personaId);
});
test("30 no muta argumentos ni respuesta remota", async () => {
  const argumentos = structuredClone(entrada); const copia = structuredClone(argumentos);
  const remoto = structuredClone(respuesta); const copiaRemota = structuredClone(remoto);
  const e = crearEscenario({ data: remoto }); await e.servicio.moverPersonaPadronBaseTurnoMes(argumentos);
  assert.deepEqual(argumentos, copia); assert.deepEqual(remoto, copiaRemota);
});
test("31 rechaza Number inseguro", () => {
  assert.throws(() => normalizarRevisionMovimientoPadronBase(Number.MAX_SAFE_INTEGER + 1), (error) => error.codigo === "REVISION_INVALIDA");
});
test("32 rechaza respuesta de otro contexto", async () => {
  const e = crearEscenario({ data: { ...respuesta, personaId: "otra" } });
  await assert.rejects(() => e.servicio.moverPersonaPadronBaseTurnoMes(entrada), (error) => error.codigo === "RESPUESTA_MOVIMIENTO_INVALIDA");
});
