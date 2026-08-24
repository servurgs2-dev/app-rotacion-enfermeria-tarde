import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CODIGOS_ADVERTENCIA_CONFIGURACION_DOTACION_MES,
  crearConfiguracionDotacionFallback,
  esMesConfiguracionDotacionValido,
  resolverConfiguracionDotacionSupervisionMes,
  validarConfiguracionDotacionMaterializada
} from "../src/utils/configuracionDotacionSupervisionMes.js";
import { DEFAULTS_DOTACION_SUPERVISION } from "../src/utils/dotacionSupervision.js";
import {
  crearRepositorioConfiguracionDotacionSupervisionMes,
  interpretarRespuestaGuardadoConfiguracionDotacion,
  normalizarRevisionConfiguracionDotacion
} from "../src/services/repositorioConfiguracionDotacionSupervisionMes.js";

let total = 0;
const probar = async (nombre, fn) => {
  await fn();
  total += 1;
  process.stdout.write(`OK ${total} ${nombre}\n`);
};

const configuracion = (overridesTurno = {}) => ({
  defaults: {
    licenciado: { minimo: 9, optimo: 11 },
    enfermero: { minimo: 13, optimo: 16 }
  },
  overridesTurno
});

const fila = (mes = "2026-08", config = configuracion()) => ({
  mes,
  configuracion: config,
  revision: "3",
  updatedAt: "2026-08-20T10:00:00Z",
  updatedBy: "00000000-0000-0000-0000-000000000001"
});

const crearCliente = ({ exacta = null, anterior = null, errorExacta = null, rpcData = null, rpcError = null } = {}) => {
  const registro = { tablas: [], consultas: [], rpc: null };
  let numeroConsulta = 0;
  const cliente = {
    from(tabla) {
      registro.tablas.push(tabla);
      const indice = numeroConsulta++;
      const llamada = { filtros: [], orden: null, limite: null };
      registro.consultas.push(llamada);
      return {
        select(columnas) { llamada.columnas = columnas; return this; },
        eq(campo, valor) { llamada.filtros.push(["eq", campo, valor]); return this; },
        lt(campo, valor) { llamada.filtros.push(["lt", campo, valor]); return this; },
        order(campo, opciones) { llamada.orden = [campo, opciones]; return this; },
        limit(valor) { llamada.limite = valor; return this; },
        async maybeSingle() {
          if (indice === 0) return { data: exacta, error: errorExacta };
          return { data: anterior, error: null };
        }
      };
    },
    async rpc(nombre, parametros) {
      registro.rpc = { nombre, parametros };
      return { data: rpcData, error: rpcError };
    }
  };
  return { cliente, registro };
};

await probar("defaults centrales importados", () => assert.equal(crearConfiguracionDotacionFallback().defaults.licenciado.minimo, DEFAULTS_DOTACION_SUPERVISION.licenciado.minimo));
await probar("mes válido", () => assert.equal(esMesConfiguracionDotacionValido("2026-08"), true));
await probar("año cero inválido", () => assert.equal(esMesConfiguracionDotacionValido("0000-08"), false));
await probar("mes inválido", () => assert.equal(esMesConfiguracionDotacionValido("2026-13"), false));
const persistida = resolverConfiguracionDotacionSupervisionMes({ mes: "2026-08", filaExacta: fila() });
await probar("fila exacta válida es persistida", () => assert.equal(persistida.origen, "persistida"));
await probar("persistida conserva revisión", () => assert.equal(persistida.revision, "3"));
await probar("persistida conserva updatedAt", () => assert.equal(persistida.updatedAt, fila().updatedAt));
await probar("persistida conserva updatedBy", () => assert.equal(persistida.updatedBy, fila().updatedBy));
await probar("overrides parciales válidos", () => assert.equal(validarConfiguracionDotacionMaterializada(configuracion({ noche: { licenciado: { minimo: 8, optimo: 10 } } })).ok, true));
await probar("no hardcodea excepción de Noche", () => assert.deepEqual(crearConfiguracionDotacionFallback().overridesTurno, {}));
await probar("no muta fila exacta", () => { const fuente = fila(); const antes = structuredClone(fuente); resolverConfiguracionDotacionSupervisionMes({ mes: "2026-08", filaExacta: fuente }); assert.deepEqual(fuente, antes); });
const heredada = resolverConfiguracionDotacionSupervisionMes({ mes: "2026-09", filaAnterior: fila("2026-08", configuracion({ noche: { enfermero: { minimo: 12, optimo: 15 } } })) });
await probar("anterior válida es heredada", () => assert.equal(heredada.origen, "heredada"));
await probar("heredada copia configuración", () => assert.equal(heredada.configuracion.overridesTurno.noche.enfermero.minimo, 12));
await probar("heredada usa revisión cero del destino", () => assert.equal(heredada.revision, "0"));
await probar("heredada conserva mes origen", () => assert.equal(heredada.heredadaDesdeMes, "2026-08"));
await probar("heredada conserva revisión origen", () => assert.equal(heredada.heredadaDesdeRevision, "3"));
const fallback = resolverConfiguracionDotacionSupervisionMes({ mes: "2026-09" });
await probar("sin filas usa fallback", () => assert.equal(fallback.origen, "fallback_codigo"));
await probar("fallback usa LE central", () => assert.deepEqual(fallback.configuracion.defaults.licenciado, { minimo: 9, optimo: 11 }));
await probar("fallback usa AE central", () => assert.deepEqual(fallback.configuracion.defaults.enfermero, { minimo: 13, optimo: 16 }));
await probar("fallback tiene overrides vacíos", () => assert.deepEqual(fallback.configuracion.overridesTurno, {}));
await probar("fallback usa revisión cero", () => assert.equal(fallback.revision, "0"));
const exactaInvalida = resolverConfiguracionDotacionSupervisionMes({ mes: "2026-08", filaExacta: fila("2026-08", { defaults: {} }) });
await probar("exacta inválida no es persistida", () => assert.equal(exactaInvalida.origen, "fallback_codigo"));
await probar("exacta inválida advierte", () => assert.equal(exactaInvalida.advertencias[0].codigo, CODIGOS_ADVERTENCIA_CONFIGURACION_DOTACION_MES.CONFIGURACION_PERSISTIDA_INVALIDA));
const anteriorInvalida = resolverConfiguracionDotacionSupervisionMes({ mes: "2026-09", filaAnterior: fila("2026-08", { defaults: {} }) });
await probar("anterior inválida no se hereda", () => assert.equal(anteriorInvalida.origen, "fallback_codigo"));
await probar("anterior inválida advierte", () => assert.equal(anteriorInvalida.advertencias[0].codigo, CODIGOS_ADVERTENCIA_CONFIGURACION_DOTACION_MES.CONFIGURACION_HEREDADA_INVALIDA));
await probar("claves arbitrarias se rechazan", () => assert.equal(validarConfiguracionDotacionMaterializada({ ...configuracion(), otra: true }).ok, false));

const exactaRaw = { mes: "2026-08", configuracion: configuracion(), revision: "4", updated_at: "fecha", updated_by: "actor" };
const cargaExacta = crearCliente({ exacta: exactaRaw });
const repoExacta = crearRepositorioConfiguracionDotacionSupervisionMes(cargaExacta.cliente);
const filaCargada = await repoExacta.cargarConfiguracionDotacionSupervisionMes("2026-08");
await probar("consulta tabla correcta", () => assert.deepEqual(cargaExacta.registro.tablas, ["configuracion_dotacion_supervision_mes"]));
await probar("exacta filtra por mes", () => assert.deepEqual(cargaExacta.registro.consultas[0].filtros, [["eq", "mes", "2026-08"]]));
await probar("fila exacta normalizada", () => assert.deepEqual([filaCargada.revision, filaCargada.updatedAt, filaCargada.updatedBy], ["4", "fecha", "actor"]));
await probar("inexistente devuelve null", async () => assert.equal(await crearRepositorioConfiguracionDotacionSupervisionMes(crearCliente().cliente).cargarConfiguracionDotacionSupervisionMes("2026-08"), null));
await probar("error real no se convierte en null", async () => { const error = new Error("RLS"); await assert.rejects(crearRepositorioConfiguracionDotacionSupervisionMes(crearCliente({ errorExacta: error }).cliente).cargarConfiguracionDotacionSupervisionMes("2026-08"), /RLS/); });
const cargaAnterior = crearCliente({ anterior: { ...exactaRaw, mes: "2026-07" } });
await crearRepositorioConfiguracionDotacionSupervisionMes(cargaAnterior.cliente).cargarConfiguracionDotacionSupervisionAnterior("2026-08");
await probar("anterior usa lt mes", () => assert.deepEqual(cargaAnterior.registro.consultas[0].filtros, [["lt", "mes", "2026-08"]]));
await probar("anterior ordena DESC", () => assert.deepEqual(cargaAnterior.registro.consultas[0].orden, ["mes", { ascending: false }]));
await probar("anterior limita uno", () => assert.equal(cargaAnterior.registro.consultas[0].limite, 1));
const efectivaExacta = crearCliente({ exacta: exactaRaw });
await crearRepositorioConfiguracionDotacionSupervisionMes(efectivaExacta.cliente).cargarConfiguracionDotacionSupervisionEfectiva("2026-08");
await probar("con exacta no busca anterior", () => assert.equal(efectivaExacta.registro.consultas.length, 1));
const efectivaHeredada = crearCliente({ anterior: { ...exactaRaw, mes: "2026-07" } });
const efectiva = await crearRepositorioConfiguracionDotacionSupervisionMes(efectivaHeredada.cliente).cargarConfiguracionDotacionSupervisionEfectiva("2026-08");
await probar("sin exacta busca anterior", () => assert.equal(efectivaHeredada.registro.consultas.length, 2));
await probar("carga efectiva resuelve heredada", () => assert.equal(efectiva.origen, "heredada"));

const rpcGuardado = crearCliente({ rpcData: { resultado: "guardado", mes: "2026-08", revision: "2", updated_at: "fecha" } });
const resultadoGuardado = await crearRepositorioConfiguracionDotacionSupervisionMes(rpcGuardado.cliente).guardarConfiguracionDotacionSupervisionMes({ mes: "2026-08", configuracion: configuracion(), revisionEsperada: "1" });
await probar("guardado usa RPC", () => assert.equal(rpcGuardado.registro.rpc.nombre, "guardar_configuracion_dotacion_supervision_mes"));
await probar("RPC recibe contrato correcto", () => assert.deepEqual(rpcGuardado.registro.rpc.parametros, { p_mes: "2026-08", p_configuracion: configuracion(), p_revision_esperada: "1" }));
await probar("guardado se normaliza", () => assert.deepEqual(resultadoGuardado, { ok: true, conflicto: false, mes: "2026-08", revision: "2", updatedAt: "fecha" }));
await probar("revisión cero permitida", () => assert.equal(normalizarRevisionConfiguracionDotacion(0), "0"));
await probar("revisión positiva permitida", () => assert.equal(normalizarRevisionConfiguracionDotacion("12"), "12"));
await probar("bigint permanece string", () => assert.equal(normalizarRevisionConfiguracionDotacion("9223372036854775806"), "9223372036854775806"));
await probar("revisión negativa rechazada", () => assert.throws(() => normalizarRevisionConfiguracionDotacion(-1), /entero decimal/));
await probar("revisión decimal rechazada", () => assert.throws(() => normalizarRevisionConfiguracionDotacion(1.5), /entero decimal/));
await probar("mes inválido no llama RPC", async () => { const c = crearCliente(); await assert.rejects(crearRepositorioConfiguracionDotacionSupervisionMes(c.cliente).guardarConfiguracionDotacionSupervisionMes({ mes: "2026-13", configuracion: configuracion(), revisionEsperada: 0 }), /YYYY-MM/); assert.equal(c.registro.rpc, null); });
await probar("configuración inválida no llama RPC", async () => { const c = crearCliente(); await assert.rejects(crearRepositorioConfiguracionDotacionSupervisionMes(c.cliente).guardarConfiguracionDotacionSupervisionMes({ mes: "2026-08", configuracion: {}, revisionEsperada: 0 }), /no es válida/); assert.equal(c.registro.rpc, null); });
const conflicto = interpretarRespuestaGuardadoConfiguracionDotacion({ resultado: "conflicto", codigo: "REVISION_CONFLICTO", existe: true, mes: "2026-08", revision: "5", configuracion: configuracion(), updated_at: "fecha" });
await probar("conflicto identificado", () => assert.deepEqual([conflicto.ok, conflicto.conflicto, conflicto.codigo], [false, true, "REVISION_CONFLICTO"]));
await probar("conflicto conserva revisión actual", () => assert.equal(conflicto.revisionActual, "5"));
await probar("conflicto valida configuración actual", () => assert.deepEqual(conflicto.configuracionActual, configuracion()));
const conflictoInvalido = interpretarRespuestaGuardadoConfiguracionDotacion({ resultado: "conflicto", codigo: "REVISION_CONFLICTO", existe: true, mes: "2026-08", revision: "5", configuracion: {} });
await probar("conflicto inválido no expone configuración", () => assert.equal(conflictoInvalido.configuracionActual, null));
await probar("conflicto inválido advierte", () => assert.equal(conflictoInvalido.advertencias[0].codigo, "CONFIGURACION_CONFLICTO_INVALIDA"));
await probar("error RPC permanece error", async () => { const c = crearCliente({ rpcError: new Error("red") }); await assert.rejects(crearRepositorioConfiguracionDotacionSupervisionMes(c.cliente).guardarConfiguracionDotacionSupervisionMes({ mes: "2026-08", configuracion: configuracion(), revisionEsperada: 0 }), /red/); });
await probar("entrada de guardado no se muta", async () => { const fuente = configuracion(); const antes = structuredClone(fuente); const c = crearCliente({ rpcData: { resultado: "guardado", mes: "2026-08", revision: "1" } }); await crearRepositorioConfiguracionDotacionSupervisionMes(c.cliente).guardarConfiguracionDotacionSupervisionMes({ mes: "2026-08", configuracion: fuente, revisionEsperada: 0 }); assert.deepEqual(fuente, antes); });

const dominio = await readFile(new URL("../src/utils/configuracionDotacionSupervisionMes.js", import.meta.url), "utf8");
const repositorio = await readFile(new URL("../src/services/repositorioConfiguracionDotacionSupervisionMes.js", import.meta.url), "utf8");
await probar("repositorio no hace insert directo", () => assert.doesNotMatch(repositorio, /\.insert\s*\(/));
await probar("repositorio no hace update directo", () => assert.doesNotMatch(repositorio, /\.update\s*\(/));
await probar("sin React", () => assert.doesNotMatch(dominio + repositorio, /from ["']react|useState|useEffect/));
await probar("tests no crean cliente remoto", async () => assert.doesNotMatch(await readFile(new URL(import.meta.url), "utf8"), /createClient\s*\(/));
await probar("sin mojibake", () => assert.doesNotMatch(dominio + repositorio, /Ã|Â|â/));

process.stdout.write(`Configuración dotación Supervisión mes: ${total}/${total} comprobaciones OK.\n`);
