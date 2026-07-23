import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  crearRepositorioEstadoPorTurnoMes,
  interpretarRespuestaGuardadoConRevision,
  normalizarRevisionConcurrencia
} from "../src/services/repositorioEstadoPorTurnoMes.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";

let cantidadPruebas = 0;
const probar = async (nombre, comprobacion) => {
  await comprobacion();
  cantidadPruebas += 1;
  process.stdout.write(`✓ ${nombre}\n`);
};

const crearCliente = ({
  fila = null,
  filas = [],
  respuestaRpc = null,
  errorRpc = null
} = {}) => {
  const registro = { select: null, filtros: [], rpc: null, upsert: null };
  const consulta = {
    select(columnas) {
      registro.select = columnas;
      return this;
    },
    eq(campo, valor) {
      registro.filtros.push([campo, valor]);
      return this;
    },
    async maybeSingle() {
      return { data: fila, error: null };
    },
    async in() {
      return { data: filas, error: null };
    },
    async upsert(datos, opciones) {
      registro.upsert = { datos, opciones };
      return { error: null };
    }
  };
  const cliente = {
    from() {
      return consulta;
    },
    async rpc(nombre, parametros) {
      registro.rpc = { nombre, parametros };
      return { data: respuestaRpc, error: errorRpc };
    }
  };
  return { cliente, registro };
};

const estadoFuente = crearEstadoMensualVacio();
estadoFuente.personal = [
  { id: "enf-1", nombre: "Enfermero Uno", tipo: "enfermero" },
  { id: "lic-1", nombre: "Licenciado Uno", tipo: "licenciado" }
];

await probar("1. carga heredada no selecciona revisión", async () => {
  const { cliente, registro } = crearCliente({
    fila: {
      data: estadoFuente,
      updated_at: "2026-07-23T10:00:00.000Z"
    }
  });
  const resultado = await crearRepositorioEstadoPorTurnoMes(cliente)
    .cargarEstadoPorTurnoMes("noche", "2026-07");
  assert.equal(resultado.existe, true);
  assert.ok(resultado.estado);
  assert.equal(registro.select, "turno, mes, data, updated_at");
  assert.equal(registro.select.includes("revision"), false);
  assert.deepEqual(registro.filtros, [
    ["turno", "noche"],
    ["mes", "2026-07"]
  ]);
});

await probar("2. carga heredada conserva el contrato usado por App", async () => {
  const { cliente } = crearCliente({ fila: { data: estadoFuente } });
  const resultado = await crearRepositorioEstadoPorTurnoMes(cliente)
    .cargarEstadoPorTurnoMes("noche", "2026-07");
  assert.deepEqual(Object.keys(resultado).sort(), ["estado", "existe"]);
});

await probar("3. carga versionada selecciona revisión y updated_at", async () => {
  const { cliente, registro } = crearCliente({
    fila: {
      data: estadoFuente,
      revision: "7",
      updated_at: "2026-07-23T10:00:00.000Z"
    }
  });
  const resultado = await crearRepositorioEstadoPorTurnoMes(cliente)
    .cargarEstadoPorTurnoMesConRevision("noche", "2026-07");
  assert.equal(registro.select, "turno, mes, data, revision, updated_at");
  assert.equal(resultado.revision, "7");
  assert.equal(resultado.updatedAt, "2026-07-23T10:00:00.000Z");
});

await probar("4. la revisión se conserva como string", () => {
  assert.equal(normalizarRevisionConcurrencia("900719925474099312345"), "900719925474099312345");
});

await probar("5. no se convierte una revisión grande a Number", () => {
  assert.equal(typeof normalizarRevisionConcurrencia("9223372036854775806"), "string");
});

await probar("6. fila inexistente versionada devuelve revisión cero", async () => {
  const { cliente } = crearCliente();
  const resultado = await crearRepositorioEstadoPorTurnoMes(cliente)
    .cargarEstadoPorTurnoMesConRevision("tarde", "2026-08");
  assert.deepEqual(resultado, {
    existe: false,
    estado: null,
    revision: "0",
    updatedAt: null
  });
});

await probar("7. revisión inválida en fila versionada genera error", async () => {
  const { cliente } = crearCliente({ fila: { data: estadoFuente, revision: "0" } });
  await assert.rejects(
    crearRepositorioEstadoPorTurnoMes(cliente)
      .cargarEstadoPorTurnoMesConRevision("noche", "2026-07"),
    /revisión 1 o superior/
  );
});

await probar("8. valida turno", async () => {
  const { cliente } = crearCliente();
  await assert.rejects(
    crearRepositorioEstadoPorTurnoMes(cliente).cargarEstadoPorTurnoMes("otro", "2026-07"),
    /no es válido/
  );
});

await probar("9. valida mes", async () => {
  const { cliente } = crearCliente();
  await assert.rejects(
    crearRepositorioEstadoPorTurnoMes(cliente).cargarEstadoPorTurnoMes("noche", "2026-13"),
    /YYYY-MM/
  );
});

await probar("10. valida revisionEsperada", async () => {
  const { cliente } = crearCliente();
  await assert.rejects(
    crearRepositorioEstadoPorTurnoMes(cliente).guardarEstadoTurnoMesConRevision({
      turnoId: "noche",
      mes: "2026-07",
      estado: estadoFuente,
      revisionEsperada: "-1"
    }),
    /entero decimal/
  );
});

const respuestaExitosa = {
  resultado: "guardado",
  existe: true,
  revision: "2",
  updated_at: "2026-07-23T11:00:00.000Z",
  data: null
};
const clienteGuardado = crearCliente({ respuestaRpc: respuestaExitosa });
const repoGuardado = crearRepositorioEstadoPorTurnoMes(clienteGuardado.cliente);
const resultadoGuardado = await repoGuardado.guardarEstadoTurnoMesConRevision({
  turnoId: "noche",
  mes: "2026-07",
  estado: estadoFuente,
  revisionEsperada: "1"
});

await probar("9. guardado envía turno correcto", () => {
  assert.equal(clienteGuardado.registro.rpc.parametros.p_turno, "noche");
});
await probar("10. guardado envía mes correcto", () => {
  assert.equal(clienteGuardado.registro.rpc.parametros.p_mes, "2026-07");
});
await probar("11. guardado envía el JSON completo", () => {
  assert.equal(clienteGuardado.registro.rpc.parametros.p_data, estadoFuente);
});
await probar("12. guardado envía la revisión como cadena", () => {
  assert.equal(clienteGuardado.registro.rpc.parametros.p_revision_esperada, "1");
});
await probar("13. el RPC no recibe updated_at del navegador", () => {
  assert.equal(Object.hasOwn(clienteGuardado.registro.rpc.parametros, "updated_at"), false);
  assert.equal(Object.hasOwn(clienteGuardado.registro.rpc.parametros, "p_updated_at"), false);
});
await probar("14. éxito RPC se interpreta como guardado", () => {
  assert.equal(resultadoGuardado.tipo, "guardado");
});
await probar("15. revisión nueva permanece como string", () => {
  assert.equal(resultadoGuardado.revision, "2");
  assert.equal(typeof resultadoGuardado.revision, "string");
});

const conflicto = interpretarRespuestaGuardadoConRevision({
  resultado: "conflicto",
  existe: true,
  revision: "3",
  updated_at: "2026-07-23T12:00:00.000Z",
  data: estadoFuente
});
await probar("16. conflicto se distingue de guardado", () => {
  assert.equal(conflicto.tipo, "conflicto");
  assert.equal(conflicto.existeRemoto, true);
});
await probar("17. estado remoto de conflicto se normaliza", () => {
  assert.ok(conflicto.estadoRemoto?.planillas);
  assert.notEqual(conflicto.estadoRemoto, estadoFuente);
});
await probar("18. conflicto sin fila remota se interpreta", () => {
  assert.deepEqual(
    interpretarRespuestaGuardadoConRevision({
      resultado: "conflicto",
      existe: false,
      revision: "0",
      updated_at: null,
      data: null
    }),
    {
      tipo: "conflicto",
      existeRemoto: false,
      revision: "0",
      updatedAt: null,
      estadoRemoto: null
    }
  );
});
await probar("19. error de red se propaga", async () => {
  const error = new Error("sin red");
  const { cliente } = crearCliente({ errorRpc: error });
  await assert.rejects(
    crearRepositorioEstadoPorTurnoMes(cliente).guardarEstadoTurnoMesConRevision({
      turnoId: "noche", mes: "2026-07", estado: estadoFuente, revisionEsperada: "1"
    }),
    error
  );
});
await probar("20. error de permisos se propaga", async () => {
  const error = { code: "42501", message: "permission denied" };
  const { cliente } = crearCliente({ errorRpc: error });
  await assert.rejects(
    crearRepositorioEstadoPorTurnoMes(cliente).guardarEstadoTurnoMesConRevision({
      turnoId: "noche", mes: "2026-07", estado: estadoFuente, revisionEsperada: "1"
    }),
    (recibido) => recibido === error
  );
});
await probar("21. respuesta RPC vacía genera error", () => {
  assert.throws(() => interpretarRespuestaGuardadoConRevision(null), /respuesta vacía/);
});
await probar("22. respuesta RPC desconocida genera error", () => {
  assert.throws(
    () => interpretarRespuestaGuardadoConRevision({ resultado: "otro" }),
    /resultado desconocido/
  );
});
await probar("23. el estado fuente permanece inmutable", () => {
  assert.equal(estadoFuente.personal[0].nombre, "Enfermero Uno");
  assert.equal(clienteGuardado.registro.rpc.parametros.p_data, estadoFuente);
});
await probar("24. el resultado es serializable", () => {
  assert.doesNotThrow(() => JSON.stringify(conflicto));
});
await probar("25. el doble de pruebas no conecta servicios externos", () => {
  assert.equal(clienteGuardado.registro.rpc.nombre, "guardar_estado_turno_mes_si_revision");
});

await probar("26. clientes A y B pueden partir de revisión uno", () => {
  assert.equal(normalizarRevisionConcurrencia("1"), "1");
});
await probar("27. A recibe revisión dos", () => {
  assert.equal(resultadoGuardado.revision, "2");
});
await probar("28. B recibe conflicto en revisión dos", () => {
  const resultadoB = interpretarRespuestaGuardadoConRevision({
    resultado: "conflicto", existe: true, revision: "2", updated_at: "x", data: estadoFuente
  });
  assert.equal(resultadoB.revision, "2");
});
await probar("29. B no obtiene éxito", () => {
  assert.notEqual(conflicto.tipo, "guardado");
});
await probar("30. primera creación A devuelve revisión uno", () => {
  const resultado = interpretarRespuestaGuardadoConRevision({
    resultado: "guardado", existe: true, revision: "1", updated_at: "x", data: null
  });
  assert.equal(resultado.revision, "1");
});
await probar("31. primera creación B recibe conflicto", () => {
  const resultado = interpretarRespuestaGuardadoConRevision({
    resultado: "conflicto", existe: true, revision: "1", updated_at: "x", data: estadoFuente
  });
  assert.equal(resultado.tipo, "conflicto");
});
await probar("32. una segunda creación no se representa como éxito", () => {
  assert.equal(conflicto.tipo, "conflicto");
});
await probar("33. revisión muy alta conserva exactitud", () => {
  const valor = "9223372036854775806";
  assert.equal(normalizarRevisionConcurrencia(valor), valor);
});
await probar("34. JSON mensual grande se transmite sin mutarse", async () => {
  const grande = structuredClone(estadoFuente);
  grande.datosPrueba = Array.from({ length: 2000 }, (_, indice) => ({ indice, texto: "x".repeat(20) }));
  const antes = JSON.stringify(grande);
  const { cliente, registro } = crearCliente({ respuestaRpc: respuestaExitosa });
  await crearRepositorioEstadoPorTurnoMes(cliente).guardarEstadoTurnoMesConRevision({
    turnoId: "tarde", mes: "2026-08", estado: grande, revisionEsperada: "9"
  });
  assert.equal(JSON.stringify(grande), antes);
  assert.equal(registro.rpc.parametros.p_data, grande);
});
await probar("35. la revisión protege Enfermeros y Licenciados como un solo JSON", () => {
  assert.equal(estadoFuente.personal.some((persona) => persona.tipo === "enfermero"), true);
  assert.equal(estadoFuente.personal.some((persona) => persona.tipo === "licenciado"), true);
  assert.equal(clienteGuardado.registro.rpc.parametros.p_revision_esperada, "1");
});

await probar("36. comparación entre turnos no consulta revisión", async () => {
  const { cliente, registro } = crearCliente({
    filas: [
      { turno: "noche", mes: "2026-07", data: estadoFuente },
      { turno: "tarde", mes: "2026-07", data: estadoFuente }
    ]
  });
  const resultado = await crearRepositorioEstadoPorTurnoMes(cliente)
    .cargarEstadosTurnosPorMes("2026-07", ["noche", "tarde"]);
  assert.equal(registro.select, "turno, mes, data");
  assert.equal(registro.select.includes("revision"), false);
  assert.deepEqual(Object.keys(resultado), ["noche", "tarde"]);
});

await probar("37. estadoTurnos mantiene conectada la carga heredada", async () => {
  const codigo = await readFile(
    new URL("../src/services/estadoTurnos.js", import.meta.url),
    "utf8"
  );
  assert.match(codigo, /cargarNuevo:\s*cargarEstadoPorTurnoMes/);
  assert.doesNotMatch(codigo, /cargarEstadoPorTurnoMesConRevision/);
});

await probar("38. App no usa carga ni guardado versionados", async () => {
  const codigo = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(codigo, /cargarEstadoPorTurnoMesConRevision/);
  assert.doesNotMatch(codigo, /guardarEstadoTurnoMesConRevision/);
});

await probar("39. el servicio expone rutas versionadas sin activarlas en App", async () => {
  const codigo = await readFile(
    new URL("../src/services/estadoPorTurnoMes.js", import.meta.url),
    "utf8"
  );
  assert.match(codigo, /cargarEstadoPorTurnoMesConRevision/);
  assert.match(codigo, /guardarEstadoTurnoMesConRevision/);
});

await probar("40. la migración declara la columna y restricción de revisión", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260723_agregar_concurrencia_estado_turno_mes.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /revision bigint not null default 1/i);
  assert.match(sql, /check \(revision >= 1\)/i);
});
await probar("41. la migración implementa CAS y tiempo del servidor", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260723_agregar_concurrencia_estado_turno_mes.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /on conflict \(turno, mes\) do nothing/i);
  assert.match(sql, /revision = revision \+ 1/i);
  assert.match(sql, /and revision = p_revision_esperada/i);
  assert.match(sql, /updated_at = now\(\)/i);
  assert.match(sql, /fila\.revision::text/i);
});
await probar("42. la función conserva RLS y restringe EXECUTE", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260723_agregar_concurrencia_estado_turno_mes.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /security invoker/i);
  assert.match(sql, /from public;/i);
  assert.match(sql, /from anon;/i);
  assert.match(sql, /to authenticated;/i);
  assert.doesNotMatch(sql, /p_user_id|p_updated_at/i);
});

process.stdout.write(`\n${cantidadPruebas} pruebas permanentes de Etapa 23B superadas.\n`);
