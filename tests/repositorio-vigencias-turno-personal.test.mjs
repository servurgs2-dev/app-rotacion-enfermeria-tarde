import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearRepositorioVigenciasTurnoPersonal } from "../src/services/repositorioVigenciasTurnoPersonal.js";
import {
  crearServicioVigenciasTurnoPersonal,
  normalizarRevisionVigenciasTurno
} from "../src/services/servicioVigenciasTurnoPersonal.js";
import { validarRangosTurnoPropio } from "../src/utils/vigenciasTurnoPersonal.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let numero = 0;
const prueba = async (nombre, ejecutar) => {
  await ejecutar();
  numero += 1;
  console.log(`OK ${numero} ${nombre}`);
};

const compactas = [
  { turno: "manana", desde: "2026-09-01", hasta: "2026-09-15" },
  { turno: "tarde", desde: "2026-09-16", hasta: "2026-09-30" }
];
const expandidas = compactas.map((rango) => ({
  personaId: "12345",
  mes: "2026-09",
  ...rango
}));
const fila = {
  mes: "2026-09",
  persona_id: "12345",
  vigencias: compactas,
  revision: "3",
  actualizado_en: "2026-08-25T12:00:00Z"
};

const crearCliente = ({ filaExacta = fila, filasMes = [fila], rpcData = null, error = null } = {}) => {
  const llamadas = [];
  const cliente = {
    from(tabla) {
      const filtros = [];
      const consulta = {
        select(columnas) {
          llamadas.push({ tipo: "select", tabla, columnas, filtros });
          return consulta;
        },
        eq(campo, valor) {
          filtros.push([campo, valor]);
          return consulta;
        },
        async maybeSingle() {
          return { data: filaExacta, error };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: filasMes, error }).then(resolve, reject);
        }
      };
      return consulta;
    },
    async rpc(nombre, parametros) {
      llamadas.push({ tipo: "rpc", nombre, parametros });
      return { data: rpcData, error };
    }
  };
  return { cliente, llamadas };
};

const servicioConCliente = (opciones) => {
  const simulado = crearCliente(opciones);
  const repositorio = crearRepositorioVigenciasTurnoPersonal(simulado.cliente);
  return { ...simulado, servicio: crearServicioVigenciasTurnoPersonal(repositorio) };
};

await prueba("carga exacta filtra persona y mes", async () => {
  const { servicio, llamadas } = servicioConCliente();
  await servicio.cargarVigenciasTurnoPersonaMes({ mes: "2026-09", personaId: "12345" });
  assert.deepEqual(llamadas[0].filtros, [["mes", "2026-09"], ["persona_id", "12345"]]);
});

await prueba("carga exacta usa la tabla correcta", async () => {
  const { servicio, llamadas } = servicioConCliente();
  await servicio.cargarVigenciasTurnoPersonaMes({ mes: "2026-09", personaId: "12345" });
  assert.equal(llamadas[0].tabla, "vigencias_turno_personal_mes");
});

await prueba("fila inexistente representa ausencia explícita", async () => {
  const { servicio } = servicioConCliente({ filaExacta: null });
  assert.deepEqual(await servicio.cargarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345"
  }), {
    existe: false,
    mes: "2026-09",
    personaId: "12345",
    revision: "0",
    actualizadoEn: null,
    vigencias: []
  });
});

await prueba("mes inválido no consulta Supabase", async () => {
  const { servicio, llamadas } = servicioConCliente();
  await assert.rejects(
    servicio.cargarVigenciasTurnoPersonaMes({ mes: "2026-13", personaId: "12345" }),
    (error) => error.codigo === "CONTEXTO_VIGENCIAS_INVALIDO"
  );
  assert.equal(llamadas.length, 0);
});

await prueba("lectura reconstruye personaId y mes en cada rango", async () => {
  const { servicio } = servicioConCliente();
  const resultado = await servicio.cargarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345"
  });
  assert.deepEqual(resultado.vigencias, expandidas);
});

await prueba("carga exacta rechaza fila de otra persona", async () => {
  const { servicio } = servicioConCliente({ filaExacta: { ...fila, persona_id: "ajena" } });
  await assert.rejects(
    servicio.cargarVigenciasTurnoPersonaMes({ mes: "2026-09", personaId: "12345" }),
    (error) => error.codigo === "CONTEXTO_REMOTO_INVALIDO"
  );
});

await prueba("revision remota permanece string", async () => {
  const { servicio } = servicioConCliente({ filaExacta: { ...fila, revision: 3n } });
  const resultado = await servicio.cargarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345"
  });
  assert.equal(resultado.revision, "3");
});

await prueba("bigint grande no se convierte a Number", async () => {
  assert.equal(normalizarRevisionVigenciasTurno("9007199254740993"), "9007199254740993");
});

await prueba("carga mensual filtra únicamente el mes", async () => {
  const { servicio, llamadas } = servicioConCliente();
  await servicio.cargarVigenciasTurnoMes("2026-09");
  assert.deepEqual(llamadas[0].filtros, [["mes", "2026-09"]]);
});

await prueba("carga mensual normaliza todas las filas", async () => {
  const segunda = { ...fila, persona_id: "67890", revision: "1" };
  const { servicio } = servicioConCliente({ filasMes: [fila, segunda] });
  const resultado = await servicio.cargarVigenciasTurnoMes("2026-09");
  assert.deepEqual(resultado.map((item) => item.personaId), ["12345", "67890"]);
});

await prueba("carga mensual rechaza filas de otro mes", async () => {
  const { servicio } = servicioConCliente({ filasMes: [{ ...fila, mes: "2026-10" }] });
  await assert.rejects(
    servicio.cargarVigenciasTurnoMes("2026-09"),
    (error) => error.codigo === "CONTEXTO_REMOTO_INVALIDO"
  );
});

await prueba("guardar usa la RPC correcta", async () => {
  const { servicio, llamadas } = servicioConCliente({
    rpcData: { resultado: "guardado", ...fila }
  });
  await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: "0"
  });
  assert.equal(llamadas[0].nombre, "guardar_vigencias_turno_personal_mes");
});

await prueba("guardar manda JSON compacto", async () => {
  const { servicio, llamadas } = servicioConCliente({
    rpcData: { resultado: "guardado", ...fila }
  });
  await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: "0"
  });
  assert.deepEqual(llamadas[0].parametros.p_vigencias, compactas);
});

await prueba("JSON RPC no incluye personaId dentro de rangos", async () => {
  const { servicio, llamadas } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: "0"
  });
  assert.ok(llamadas[0].parametros.p_vigencias.every((rango) => !("personaId" in rango)));
});

await prueba("JSON RPC no incluye mes dentro de rangos", async () => {
  const { servicio, llamadas } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: "0"
  });
  assert.ok(llamadas[0].parametros.p_vigencias.every((rango) => !("mes" in rango)));
});

await prueba("creación envía revisión cero como string", async () => {
  const { servicio, llamadas } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: 0
  });
  assert.equal(llamadas[0].parametros.p_revision_esperada, "0");
});

await prueba("actualización conserva revisión existente", async () => {
  const { servicio, llamadas } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: "3"
  });
  assert.equal(llamadas[0].parametros.p_revision_esperada, "3");
});

await prueba("éxito de guardado se normaliza", async () => {
  const { servicio } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  const resultado = await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: "0"
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.conflicto, false);
  assert.equal(resultado.revision, "3");
});

await prueba("conflicto existente es resultado de dominio", async () => {
  const { servicio } = servicioConCliente({
    rpcData: { resultado: "conflicto", codigo: "REVISION_CONFLICTO", existe: true, ...fila }
  });
  const resultado = await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: "2"
  });
  assert.equal(resultado.conflicto, true);
  assert.equal(resultado.remoto.existe, true);
  assert.deepEqual(resultado.remoto.vigencias, expandidas);
});

await prueba("conflicto sin fila expone revisión cero", async () => {
  const { servicio } = servicioConCliente({
    rpcData: {
      resultado: "conflicto", codigo: "REVISION_CONFLICTO", existe: false,
      mes: "2026-09", persona_id: "12345", revision: "0", vigencias: null
    }
  });
  const resultado = await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: expandidas, revisionEsperada: "2"
  });
  assert.deepEqual(resultado.remoto.vigencias, []);
  assert.equal(resultado.remoto.revision, "0");
});

await prueba("eliminar usa la RPC correcta", async () => {
  const { servicio, llamadas } = servicioConCliente({
    rpcData: { resultado: "eliminado", mes: "2026-09", persona_id: "12345", revision_eliminada: "3" }
  });
  await servicio.eliminarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", revisionEsperada: "3"
  });
  assert.equal(llamadas[0].nombre, "eliminar_vigencias_turno_personal_mes");
});

await prueba("eliminación exitosa conserva revisión eliminada", async () => {
  const { servicio } = servicioConCliente({
    rpcData: { resultado: "eliminado", mes: "2026-09", persona_id: "12345", revision_eliminada: "3" }
  });
  const resultado = await servicio.eliminarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", revisionEsperada: "3"
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.eliminado, true);
  assert.equal(resultado.revisionEliminada, "3");
});

await prueba("conflicto al eliminar no se lanza como excepción", async () => {
  const { servicio } = servicioConCliente({
    rpcData: { resultado: "conflicto", codigo: "REVISION_CONFLICTO", existe: true, ...fila }
  });
  const resultado = await servicio.eliminarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", revisionEsperada: "2"
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.conflicto, true);
});

await prueba("error remoto real se propaga", async () => {
  const remoto = Object.assign(new Error("sin permiso"), { code: "42501" });
  const { servicio } = servicioConCliente({ error: remoto });
  await assert.rejects(
    servicio.cargarVigenciasTurnoPersonaMes({ mes: "2026-09", personaId: "12345" }),
    (error) => error === remoto
  );
});

await prueba("fila remota corrupta no cae silenciosamente a legacy", async () => {
  const { servicio } = servicioConCliente({
    filaExacta: { ...fila, vigencias: [{ ...compactas[0], extra: true }] }
  });
  await assert.rejects(
    servicio.cargarVigenciasTurnoPersonaMes({ mes: "2026-09", personaId: "12345" }),
    (error) => error.codigo === "VIGENCIAS_REMOTAS_INVALIDAS"
  );
});

await prueba("array vacío no llama RPC guardar", async () => {
  const { servicio, llamadas } = servicioConCliente();
  await assert.rejects(
    servicio.guardarVigenciasTurnoPersonaMes({
      mes: "2026-09", personaId: "12345", vigencias: [], revisionEsperada: "0"
    }),
    (error) => error.codigo === "VIGENCIAS_INVALIDAS"
  );
  assert.equal(llamadas.length, 0);
});

await prueba("vigencia de otra identidad no llama RPC", async () => {
  const { servicio, llamadas } = servicioConCliente();
  await assert.rejects(servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "99999", vigencias: expandidas, revisionEsperada: "0"
  }));
  assert.equal(llamadas.length, 0);
});

await prueba("inputs de guardado no son mutados", async () => {
  const entrada = structuredClone(expandidas);
  const original = structuredClone(entrada);
  const { servicio } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  await servicio.guardarVigenciasTurnoPersonaMes({
    mes: "2026-09", personaId: "12345", vigencias: entrada, revisionEsperada: "0"
  });
  assert.deepEqual(entrada, original);
});

await prueba("repositorio no hace escritura directa", async () => {
  const codigo = fs.readFileSync(path.join(raiz, "src/services/repositorioVigenciasTurnoPersonal.js"), "utf8");
  assert.doesNotMatch(codigo, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(/);
});

await prueba("servicio reutiliza el cliente Supabase existente", async () => {
  const codigo = fs.readFileSync(path.join(raiz, "src/services/vigenciasTurnoPersonal.js"), "utf8");
  assert.match(codigo, /from "\.\.\/supabase\.js"/);
  assert.doesNotMatch(codigo, /createClient/);
});

await prueba("infraestructura no está integrada en consumidores productivos", async () => {
  const consumidores = [
    "src/App.jsx",
    "src/components/personal/ListaPersonal.jsx",
    "src/components/planilla/PlanillaMensual.jsx",
    "src/components/calendario/CalendarioDiario.jsx",
    "src/components/supervision/VistaSupervision.jsx",
    "src/utils/preparacionMesNuevo.js"
  ].filter((archivo) => fs.existsSync(path.join(raiz, archivo)));
  for (const archivo of consumidores) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(raiz, archivo), "utf8"),
      /services\/(?:repositorioVigenciasTurnoPersonal|vigenciasTurnoPersonal)/
    );
  }
});

const rangosPropios = [{ desde: "2026-09-01", hasta: "2026-09-15" }];

await prueba("turno propio usa RPC y payload exactos", async () => {
  const { servicio, llamadas } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  await servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345", rangos: rangosPropios, revisionEsperada: "0"
  });
  assert.equal(llamadas[0].nombre, "guardar_vigencias_turno_personal_mes_turno_propio");
  assert.deepEqual(llamadas[0].parametros, {
    p_mes: "2026-09",
    p_persona_id: "12345",
    p_rangos: rangosPropios,
    p_revision_esperada: "0"
  });
});

await prueba("turno propio no envia turno ni contexto dentro de rangos", async () => {
  const { servicio, llamadas } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  await servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345", rangos: rangosPropios, revisionEsperada: "0"
  });
  assert.equal("p_turno" in llamadas[0].parametros, false);
  assert.ok(llamadas[0].parametros.p_rangos.every((rango) =>
    !("turno" in rango) && !("personaId" in rango) && !("mes" in rango)
  ));
});

await prueba("array vacio llega al RPC de turno propio", async () => {
  const { servicio, llamadas } = servicioConCliente({
    rpcData: { resultado: "guardado", ...fila, vigencias: [compactas[1]] }
  });
  await servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345", rangos: [], revisionEsperada: "3"
  });
  assert.deepEqual(llamadas[0].parametros.p_rangos, []);
});

await prueba("validador puro acepta rango valido y contiguos", async () => {
  const resultado = validarRangosTurnoPropio({
    mes: "2026-09",
    rangos: [
      { desde: "2026-09-01", hasta: "2026-09-15" },
      { desde: "2026-09-16", hasta: "2026-09-30" }
    ]
  });
  assert.equal(resultado.valido, true);
  assert.equal(resultado.rangos.length, 2);
});

await prueba("fecha invalida no llama RPC", async () => {
  const { servicio, llamadas } = servicioConCliente();
  await assert.rejects(servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345",
    rangos: [{ desde: "2026-09-31", hasta: "2026-09-31" }], revisionEsperada: "0"
  }), (error) => error.codigo === "RANGOS_PROPIOS_INVALIDOS");
  assert.equal(llamadas.length, 0);
});

await prueba("fuera de mes y solapamiento se rechazan", async () => {
  assert.equal(validarRangosTurnoPropio({
    mes: "2026-09", rangos: [{ desde: "2026-10-01", hasta: "2026-10-02" }]
  }).valido, false);
  assert.equal(validarRangosTurnoPropio({
    mes: "2026-09",
    rangos: [
      { desde: "2026-09-01", hasta: "2026-09-15" },
      { desde: "2026-09-15", hasta: "2026-09-20" }
    ]
  }).valido, false);
});

await prueba("turno y toda clave extra se rechazan", async () => {
  for (const extra of [
    { turno: "manana" }, { personaId: "12345" }, { mes: "2026-09" }, { extra: true }
  ]) {
    assert.equal(validarRangosTurnoPropio({
      mes: "2026-09", rangos: [{ ...rangosPropios[0], ...extra }]
    }).valido, false);
  }
});

await prueba("turno propio no muta inputs", async () => {
  const entrada = structuredClone(rangosPropios);
  const original = structuredClone(entrada);
  const { servicio } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  await servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345", rangos: entrada, revisionEsperada: "0"
  });
  assert.deepEqual(entrada, original);
});

await prueba("revisiones cero existente y bigint grande se preservan", async () => {
  for (const revisionEsperada of ["0", "3", 9007199254740993n]) {
    const { servicio, llamadas } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
    await servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
      mes: "2026-09", personaId: "12345", rangos: rangosPropios, revisionEsperada
    });
    assert.equal(llamadas[0].parametros.p_revision_esperada, String(revisionEsperada));
  }
});

await prueba("exito parcial reconstruye configuracion completa", async () => {
  const { servicio } = servicioConCliente({ rpcData: { resultado: "guardado", ...fila } });
  const resultado = await servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345", rangos: rangosPropios, revisionEsperada: "0"
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.conflicto, false);
  assert.equal(resultado.revision, "3");
  assert.deepEqual(resultado.vigencias, expandidas);
});

await prueba("conflicto parcial existente es resultado de dominio", async () => {
  const { servicio } = servicioConCliente({
    rpcData: { resultado: "conflicto", codigo: "REVISION_CONFLICTO", existe: true, ...fila }
  });
  const resultado = await servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345", rangos: rangosPropios, revisionEsperada: "2"
  });
  assert.equal(resultado.conflicto, true);
  assert.equal(resultado.remoto.existe, true);
  assert.deepEqual(resultado.remoto.vigencias, expandidas);
});

await prueba("conflicto parcial sin fila conserva revision cero", async () => {
  const { servicio } = servicioConCliente({ rpcData: {
    resultado: "conflicto", codigo: "REVISION_CONFLICTO", existe: false,
    mes: "2026-09", persona_id: "12345", revision: "0", vigencias: null
  } });
  const resultado = await servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345", rangos: rangosPropios, revisionEsperada: "2"
  });
  assert.equal(resultado.conflicto, true);
  assert.equal(resultado.remoto.existe, false);
  assert.deepEqual(resultado.remoto.vigencias, []);
});

await prueba("errores backend de turno propio se propagan", async () => {
  for (const codigo of [
    "PERMISO_LICENCIADO_REQUERIDO",
    "CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE",
    "CONFIGURACION_EXPLICITA_VACIA_NO_PERMITIDA"
  ]) {
    const remoto = Object.assign(new Error(codigo), { code: "P0001" });
    const { servicio } = servicioConCliente({ error: remoto });
    await assert.rejects(servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
      mes: "2026-09", personaId: "12345", rangos: rangosPropios, revisionEsperada: "0"
    }), (error) => error === remoto);
  }
});

await prueba("respuesta parcial corrupta se rechaza", async () => {
  const { servicio } = servicioConCliente({ rpcData: {
    resultado: "guardado", ...fila, vigencias: [{ ...compactas[0], extra: true }]
  } });
  await assert.rejects(servicio.guardarVigenciasTurnoPersonaMesTurnoPropio({
    mes: "2026-09", personaId: "12345", rangos: rangosPropios, revisionEsperada: "0"
  }), (error) => error.codigo === "VIGENCIAS_REMOTAS_INVALIDAS");
});

await prueba("turno propio sigue sin integracion UI", async () => {
  for (const archivo of [
    "src/App.jsx",
    "src/components/personal/ListaPersonal.jsx",
    "src/components/personal/EstadoVigenciasTurnoPersona.jsx",
    "src/components/planilla/PlanillaMensual.jsx",
    "src/components/calendario/CalendarioDiario.jsx",
    "src/components/supervision/VistaSupervision.jsx"
  ].filter((archivo) => fs.existsSync(path.join(raiz, archivo)))) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(raiz, archivo), "utf8"),
      /guardarVigenciasTurnoPersonaMesTurnoPropio/
    );
  }
});

console.log(`Repository vigencias de turno: ${numero}/${numero} comprobaciones OK.`);
