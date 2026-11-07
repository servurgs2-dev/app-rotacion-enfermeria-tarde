import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { agruparMesesExistentesPorTurno, crearRepositorioEstadoPorTurnoMes, existeMesParaTurno } from "../src/services/repositorioEstadoPorTurnoMes.js";
import {
  combinarMesesExistentes,
  crearServicioDescubrimientoMeses,
  proyectarMesesEstadoMensualLegacy
} from "../src/utils/descubrimientoMeses.js";

let total = 0;
const probar = async (nombre, prueba) => { await prueba(); total += 1; console.log(`✓ ${nombre}`); };
const crearCliente = ({ filas = [], error = null } = {}) => {
  const registro = { tabla: null, select: null, escrituras: 0 };
  return { registro, cliente: { from(tabla) { registro.tabla = tabla; return {
    async select(columnas) { registro.select = columnas; return { data: filas, error }; },
    upsert() { registro.escrituras += 1; }, insert() { registro.escrituras += 1; },
    update() { registro.escrituras += 1; }, delete() { registro.escrituras += 1; }
  }; } } };
};
const filas = [
  { mes: "2026-08", turno: "tarde" }, { mes: "2026-09", turno: "noche" },
  { mes: "2026-08", turno: "manana" }, { mes: "2026-08", turno: "tarde" }
];

await probar("agrupa, deduplica y ordena reciente primero", () => assert.deepEqual(agruparMesesExistentesPorTurno(filas), [
  { mes: "2026-09", turnos: ["noche"] }, { mes: "2026-08", turnos: ["manana", "tarde"] }
]));
await probar("conserva mes de un solo turno", () => assert.deepEqual(agruparMesesExistentesPorTurno([{ mes: "2026-07", turno: "vespertino" }]), [{ mes: "2026-07", turnos: ["vespertino"] }]));
await probar("lista vacía es válida", () => assert.deepEqual(agruparMesesExistentesPorTurno([]), []));
await probar("consulta existencia por turno y mes", () => {
  const meses = agruparMesesExistentesPorTurno(filas);
  assert.equal(existeMesParaTurno(meses, "2026-08", "tarde"), true);
  assert.equal(existeMesParaTurno(meses, "2026-08", "noche"), false);
});
await probar("rechaza turno inválido", () => assert.throws(() => agruparMesesExistentesPorTurno([{ mes: "2026-08", turno: "otro" }]), /no es válido/));
await probar("repositorio hace una consulta mínima y sin escrituras", async () => {
  const { cliente, registro } = crearCliente({ filas });
  assert.equal((await crearRepositorioEstadoPorTurnoMes(cliente).listarMesesExistentesPorTurno()).length, 2);
  assert.deepEqual(registro, { tabla: "estado_por_turno_mes", select: "turno, mes", escrituras: 0 });
});
await probar("error no equivale a lista vacía", async () => {
  const { cliente } = crearCliente({ error: new Error("falló select") });
  await assert.rejects(crearRepositorioEstadoPorTurnoMes(cliente).listarMesesExistentesPorTurno(), /falló select/);
});
await probar("no consulta mes por mes ni trae data", async () => {
  const fuente = await readFile(new URL("../src/services/repositorioEstadoPorTurnoMes.js", import.meta.url), "utf8");
  const inicio = fuente.indexOf("const listarMesesExistentesPorTurno");
  const cuerpo = fuente.slice(inicio, fuente.indexOf("return {", inicio));
  assert.doesNotMatch(cuerpo, /\.eq\("mes"|select\([^)]*(?:data|updated_at|revision)/);
});
await probar("legacy consulta sólo mes y no escribe", async () => {
  const fuente = await readFile(new URL("../src/services/estadoMensual.js", import.meta.url), "utf8");
  const inicio = fuente.indexOf("const listarMesesEstadoMensual");
  const cuerpo = fuente.slice(inicio, fuente.indexOf("return {", inicio));
  assert.match(cuerpo, /from\("estado_por_mes"\)[\s\S]*select\("mes"\)/);
  assert.doesNotMatch(cuerpo, /upsert|insert|update|delete|select\([^)]*(?:data|updated_at)/);
});
await probar("legacy omite una fila inválida sin perder meses válidos", () => assert.deepEqual(
  proyectarMesesEstadoMensualLegacy([
    { mes: "2026-09" },
    { mes: "mes roto" },
    { mes: "2026-08" }
  ]),
  {
    meses: ["2026-09", "2026-08"],
    omitidos: [{ motivo: "mes_invalido", valorMesSeguro: "mes roto" }]
  }
));
await probar("legacy omite múltiples shapes inválidos de forma segura", () => assert.deepEqual(
  proyectarMesesEstadoMensualLegacy([
    { mes: null },
    { mes: "" },
    { mes: "2026-09-01" },
    { mes: { valor: "2026-09" } },
    { mes: "2026-09" }
  ]),
  {
    meses: ["2026-09"],
    omitidos: [
      { motivo: "mes_invalido", valorMesSeguro: null },
      { motivo: "mes_invalido", valorMesSeguro: "" },
      { motivo: "mes_invalido", valorMesSeguro: "2026-09-01" },
      { motivo: "mes_invalido", valorMesSeguro: "[object]" }
    ]
  }
));
await probar("legacy se combina únicamente como Tarde", () => assert.deepEqual(combinarMesesExistentes({
  mesesPorTurno: [{ mes: "2026-08", turnos: ["noche"] }], mesesLegacyTarde: ["2026-08", "2026-07"]
}), [
  { mes: "2026-08", turnos: ["noche", "tarde"] }, { mes: "2026-07", turnos: ["tarde"] }
]));
await probar("servicio consulta ambas fuentes una vez", async () => {
  const llamadas = { nuevas: 0, legacy: 0 };
  const listar = crearServicioDescubrimientoMeses({
    listarNuevos: async () => { llamadas.nuevas += 1; return []; },
    listarLegacyTarde: async () => { llamadas.legacy += 1; return { meses: [], omitidos: [] }; }
  });
  assert.deepEqual(await listar(), []);
  assert.deepEqual(llamadas, { nuevas: 1, legacy: 1 });
});
await probar("principal se preserva cuando legacy omite datos inválidos", async () => {
  const listar = crearServicioDescubrimientoMeses({
    listarNuevos: async () => [
      { mes: "2026-09", turnos: ["noche", "tarde"] },
      { mes: "2026-10", turnos: ["noche"] }
    ],
    listarLegacyTarde: async () => proyectarMesesEstadoMensualLegacy([
      { mes: "inválido" },
      { mes: null },
      { mes: "2026-08" }
    ])
  });
  assert.deepEqual(await listar(), [
    { mes: "2026-10", turnos: ["noche"] },
    { mes: "2026-09", turnos: ["noche", "tarde"] },
    { mes: "2026-08", turnos: ["tarde"] }
  ]);
});
await probar("error de una fuente se propaga", async () => {
  const error = Object.assign(new Error("permission denied for table estado_por_turno_mes"), {
    code: "42501",
    details: "Permiso insuficiente.",
    hint: "Revisar privilegios.",
    status: 401
  });
  const listar = crearServicioDescubrimientoMeses({ listarNuevos: async () => { throw error; }, listarLegacyTarde: async () => ({ meses: [], omitidos: [] }) });
  await assert.rejects(listar(), (recibido) => recibido === error);
});
await probar("un error real de consulta legacy no se oculta", async () => {
  const error = Object.assign(new Error("schema cache"), { code: "PGRST205" });
  const listar = crearServicioDescubrimientoMeses({
    listarNuevos: async () => [{ mes: "2026-09", turnos: ["noche"] }],
    listarLegacyTarde: async () => { throw error; }
  });
  await assert.rejects(listar(), (recibido) => recibido === error);
});
await probar("existencia no se fusiona con editabilidad", async () => {
  const fuente = await readFile(new URL("../src/utils/descubrimientoMeses.js", import.meta.url), "utf8");
  assert.doesNotMatch(fuente, /clasificarPeriodoMes|estaEnVentanaEditableTemporal|crearEstadoMensualVacio/);
});
console.log(`\n${total} pruebas aprobadas`);
