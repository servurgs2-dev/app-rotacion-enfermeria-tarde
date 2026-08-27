import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearDetalleVigenciasPersonal } from "../src/utils/presentacionVigenciasPersonal.js";
import { resolverPadronVigenciasEfectivasMes } from "../src/utils/padronVigenciasTurnoPersonal.js";
import { asegurarIdPersona } from "../src/utils/identidadPersonas.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (archivo) => fs.readFileSync(path.join(raiz, archivo), "utf8");
const app = leer("src/App.jsx");
const lista = leer("src/components/personal/ListaPersonal.jsx");
const tarjeta = leer("src/components/personal/EstadoVigenciasTurnoPersona.jsx");
const hook = leer("src/hooks/usePadronVigenciasPersonalMes.js");
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

const persona = (id, nombre = "Juan Pérez") => ({
  id, nombre, categoria: "enfermero", funcionario: id
});
const estados = { manana: { personal: [persona("p-1")] }, tarde: { personal: [] } };
const explicita = [{
  personaId: "p-1",
  mes: "2026-09",
  turno: "manana",
  desde: "2026-09-01",
  hasta: "2026-09-15"
}, {
  personaId: "p-1",
  mes: "2026-09",
  turno: "tarde",
  desde: "2026-09-16",
  hasta: "2026-09-30"
}];

probar("Personal conserva operaciones legacy y deriva la visualización mensual", () => {
  assert.match(lista, /const personalVisible = resolverPersonalMensualPorTurno/);
  assert.match(lista, /filtrados\.map\(\(entradaVisible\)/);
  assert.match(lista, /personalFisicoPorId/);
  assert.doesNotMatch(lista, /resolverPersonalEfectivoEnFecha/);
});

probar("sin explícitas no agrega detalle visual", () => {
  assert.deepEqual(crearDetalleVigenciasPersonal({
    mes: "2026-09",
    entrada: { origen: "legacy_implicita", vigencias: [] }
  }), { rangos: [], huecos: [] });
});

probar("explícitas muestran dos rangos legibles", () => {
  const detalle = crearDetalleVigenciasPersonal({
    mes: "2026-09",
    entrada: { origen: "explicita", vigencias: explicita }
  });
  assert.deepEqual(detalle.rangos.map(({ texto }) => texto), ["1–15 Mañana", "16–30 Tarde"]);
});

probar("persona con cambio conserva una única identidad", () => {
  const padron = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: estados,
    configuracionesExplicitas: [{ personaId: "p-1", mes: "2026-09", vigencias: explicita }]
  });
  assert.equal(padron.personas.length, 1);
});

probar("turno fuente permanece en la lista física", () => {
  const padron = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: estados,
    configuracionesExplicitas: [{ personaId: "p-1", mes: "2026-09", vigencias: explicita }]
  });
  assert.equal(padron.personas[0].turnoFuente, "manana");
});

probar("hueco se presenta sin inventar fallback", () => {
  const detalle = crearDetalleVigenciasPersonal({
    mes: "2026-09",
    entrada: { origen: "explicita", vigencias: [explicita[0]] }
  });
  assert.deepEqual(detalle.huecos, ["16–30"]);
  assert.match(tarjeta, /Sin turno base/);
});

probar("mismo nombre con IDs distintos no se mezcla", () => {
  const padron = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: {
      manana: { personal: [persona("p-1", "Alex")] },
      tarde: { personal: [persona("p-2", "Alex")] }
    },
    configuracionesExplicitas: []
  });
  assert.deepEqual(padron.personas.map(({ personaId }) => personaId), ["p-1", "p-2"]);
});

probar("persona con id explícito usa esa identidad para mostrar vigencia", () => {
  const original = persona("p-explicita");
  assert.equal(asegurarIdPersona(original).id, "p-explicita");
  assert.match(lista, /entrada=\{vigenciasPersonal\?\.padron\?\.porPersonaId\?\.\[personaIdVigencias\]\}/);
});

probar("persona sin id y con funcionario coincide con la identidad del padrón", () => {
  const original = { nombre: "Legacy", funcionario: "4567", categoria: "enfermero" };
  const personaId = asegurarIdPersona(original).id;
  const padron = resolverPadronVigenciasEfectivasMes({
    mes: "2026-09",
    estadosPorTurno: { manana: { personal: [original] } },
    configuracionesExplicitas: [{
      personaId,
      mes: "2026-09",
      vigencias: [{
        personaId,
        mes: "2026-09",
        turno: "tarde",
        desde: "2026-09-16",
        hasta: "2026-09-30"
      }]
    }]
  });
  assert.equal(padron.porPersonaId[personaId].personaId, personaId);
  assert.equal(padron.porPersonaId[personaId].vigencias[0].turno, "tarde");
});

probar("diagnóstico usa la misma identidad efectiva", () => {
  assert.match(lista, /diagnostico\.personaId === personaIdVigencias/);
  assert.equal((lista.match(/const personaIdVigencias/g) || []).length, 1);
});

probar("String de id crudo no es la única resolución de vigencias", () => {
  assert.doesNotMatch(lista, /porPersonaId\?\.\[String\(p\.id\)\]/);
  assert.doesNotMatch(lista, /diagnostico\.personaId === String\(p\.id\)/);
});

probar("fallback legacy de identidad no muta la persona", () => {
  const original = { nombre: "Persona sin número", categoria: "licenciado" };
  const firma = JSON.stringify(original);
  const normalizada = asegurarIdPersona(original);
  assert.match(normalizada.id, /^persona-h-/);
  assert.equal(JSON.stringify(original), firma);
});

probar("hook usa el mes activo sin fecha hardcodeada", () => {
  assert.match(app, /usePadronVigenciasPersonalMes\(\{[\s\S]*?mes:\s*mesActivo/);
  assert.doesNotMatch(hook, /2026-09/);
});

probar("cambio de mes forma una clave de solicitud nueva", () => {
  assert.match(hook, /const clave = `\$\{String\(mes \|\| ""\)\}\|\$\{intento\}`/);
  assert.match(hook, /\[clave, habilitado, mes\]/);
});

probar("error remoto no se interpreta como ausencia", () => {
  assert.match(hook, /No se pudo cargar la información de turnos del mes/);
  assert.match(hook, /if \(!vigente \|\| respuesta\.error\) return null/);
  assert.match(lista, /vigenciasPersonal\?\.error/);
});

probar("loading mantiene visible la lista", () => {
  assert.match(lista, /vigenciasPersonal\?\.cargando/);
  assert.match(lista, /<table className="w-full text-sm">/);
  assert.doesNotMatch(lista, /vigenciasPersonal\?\.cargando\s*\?\s*\(/);
});

probar("diagnóstico se muestra con mensaje conservador", () => {
  assert.match(tarjeta, /Hay un problema con la configuración de turno/);
  assert.match(tarjeta, /No se aplicará automáticamente/);
  assert.doesNotMatch(tarjeta, /PERSONA_DUPLICADA|CONFIGURACION_EXPLICITA/);
});

probar("se realiza una sola carga mensual de vigencias", () => {
  assert.equal((hook.match(/cargarVigenciasTurnoMes\(mes\)/g) || []).length, 1);
});

probar("estados y vigencias se cargan juntos sin N más uno", () => {
  assert.match(hook, /Promise\.all\(\[/);
  assert.equal((hook.match(/cargarEstadosTurnosPorMes\(/g) || []).length, 1);
  assert.doesNotMatch(tarjeta, /Supabase|cargarVigencias/);
});

probar("integración no importa guardado", () => {
  for (const codigo of [app, lista, tarjeta, hook]) {
    assert.doesNotMatch(codigo, /guardarVigenciasTurnoPersonaMes/);
  }
});

probar("integración no importa eliminación", () => {
  for (const codigo of [app, lista, tarjeta, hook]) {
    assert.doesNotMatch(codigo, /eliminarVigenciasTurnoPersonaMes/);
  }
});

probar("padrón no muta estados recibidos", () => {
  const entrada = structuredClone(estados);
  const firma = JSON.stringify(entrada);
  resolverPadronVigenciasEfectivasMes({
    mes: "2026-09", estadosPorTurno: entrada, configuracionesExplicitas: []
  });
  assert.equal(JSON.stringify(entrada), firma);
});

probar("Planilla no integra la nueva capa", () => {
  assert.doesNotMatch(leer("src/components/planilla/PlanillaMensual.jsx"), /VigenciasTurno|vigenciasPersonal/);
});

probar("Calendario no integra la nueva capa", () => {
  assert.doesNotMatch(leer("src/components/calendario/CalendarioDiario.jsx"), /VigenciasTurno|vigenciasPersonal/);
});

probar("Extras no integra la nueva capa", () => {
  assert.doesNotMatch(leer("src/components/calendario/CalendarioDiario.jsx"), /padronVigenciasTurnoPersonal/);
});

probar("respuesta vieja no puede sobrescribir el mes vigente", () => {
  assert.match(hook, /solicitudRef\.current !== solicitud/);
  assert.match(hook, /respuesta\.clave === clave/);
});

probar("cambiar turno no dispara otra consulta mensual", () => {
  assert.doesNotMatch(hook, /\[clave, habilitado, mes, turnoActivo\]/);
  assert.match(hook, /combinarEstadoActivoComparacion/);
});

probar("detalle es compacto y no presenta JSON interno", () => {
  assert.match(tarjeta, /max-w-64/);
  assert.doesNotMatch(tarjeta, /personaId|revision|JSON\.stringify/);
});

console.log(`Personal vigencias read-only: ${total}/${total} comprobaciones OK.`);
