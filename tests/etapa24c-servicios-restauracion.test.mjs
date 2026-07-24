import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  crearRepositorioHistorialEstadoTurnoMes,
  interpretarRespuestaRestauracion,
  LIMITES_HISTORIAL
} from "../src/services/repositorioHistorialEstadoTurnoMes.js";
import { compararSnapshotsMensuales } from "../src/utils/diferenciasHistorial.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8");
const migracion = leer(
  "supabase/migrations/20260725_agregar_consulta_y_restauracion_historial.sql"
);
const migracion24b = leer(
  "supabase/migrations/20260724_crear_historial_estado_turno_mes.sql"
);
const app = leer("src/App.jsx");
const panel = leer("src/components/concurrencia/PanelConflictoEdicion.jsx");
const repositorioFuente = leer("src/services/repositorioHistorialEstadoTurnoMes.js");
const comparadorFuente = leer("src/utils/diferenciasHistorial.js");
const packageJson = JSON.parse(leer("package.json"));

let cantidad = 0;
const prueba = async (nombre, ejecutar) => {
  await ejecutar();
  cantidad += 1;
  console.log(`✓ ${cantidad}. ${nombre}`);
};

const contiene = (texto, patron) =>
  typeof patron === "string" ? texto.includes(patron) : patron.test(texto);

await prueba("existe la migración 24C", () => {
  assert.match(migracion, /^begin;/m);
  assert.match(migracion, /^commit;/m);
});
await prueba("amplía acciones con restauración", () =>
  assert.match(migracion, /'restauracion'/));
await prueba("24B conserva sus acciones originales", () =>
  assert.doesNotMatch(migracion24b, /'restauracion'/));
await prueba("existe RPC de restauración", () =>
  assert.match(migracion, /restaurar_estado_turno_mes_desde_historial/));
await prueba("RPC solo recibe id y revisión", () =>
  assert.match(
    migracion,
    /restaurar_estado_turno_mes_desde_historial\s*\(\s*p_historial_id bigint,\s*p_revision_esperada bigint\s*\)/s
  ));
await prueba("RPC no recibe data", () =>
  assert.doesNotMatch(migracion, /restaurar_estado_turno_mes_desde_historial\s*\([^)]*p_data/s));
await prueba("RPC no recibe autor", () =>
  assert.doesNotMatch(migracion, /restaurar_estado_turno_mes_desde_historial\s*\([^)]*usuario/s));
await prueba("RPC no recibe acción", () =>
  assert.doesNotMatch(migracion, /restaurar_estado_turno_mes_desde_historial\s*\([^)]*accion/s));
await prueba("valida Supervisión server-side", () =>
  assert.match(migracion, /private\.usuario_app_es_supervision\(\)/));
await prueba("usa search_path seguro", () =>
  assert.match(migracion, /security invoker\s+set search_path = ''/s));
await prueba("obtiene snapshot desde historial", () =>
  assert.match(migracion, /from public\.historial_estado_turno_mes\s+where id = p_historial_id/s));
await prueba("turno y mes proceden del historial", () => {
  assert.match(migracion, /where turno = origen\.turno/);
  assert.match(migracion, /and mes = origen\.mes/);
});
await prueba("restauración usa CAS", () =>
  assert.match(migracion, /and revision = p_revision_esperada/));
await prueba("restauración incrementa revisión", () =>
  assert.match(migracion, /revision = revision \+ 1/));
await prueba("no reduce la revisión", () =>
  assert.doesNotMatch(migracion, /revision\s*=\s*origen\.revision/));
await prueba("no actualiza historial", () =>
  assert.doesNotMatch(migracion, /update public\.historial_estado_turno_mes/));
await prueba("no elimina historial", () =>
  assert.doesNotMatch(migracion, /delete from public\.historial_estado_turno_mes/));
await prueba("conflicto ocurre sin segundo update", () => {
  assert.equal((migracion.match(/update public\.estado_por_turno_mes/g) ?? []).length, 1);
  assert.match(migracion, /'resultado', 'conflicto'/);
});
await prueba("conflicto no inserta historial desde RPC", () =>
  assert.doesNotMatch(
    migracion.slice(
      migracion.indexOf(
        "create or replace function public.restaurar_estado_turno_mes_desde_historial"
      )
    ),
    /insert into public\.historial_estado_turno_mes/
  ));
await prueba("configura acción restauración", () =>
  assert.match(migracion, /set_config\(\s*'app_urgencias\.accion_historial',\s*'restauracion'/s));
await prueba("registra origen_revision", () =>
  assert.match(migracion, /revision_origen/));
await prueba("contexto es local a la transacción", () => {
  assert.match(migracion, /set_config\([\s\S]*true\s*\)/);
  assert.match(migracion, /app_urgencias\.origen_revision/);
});
await prueba("trigger normal conserva actualización CAS", () =>
  assert.match(migracion, /accion_registrada := 'actualizacion_cas'/));
await prueba("auth.uid continúa como autor", () =>
  assert.match(migracion, /auth\.uid\(\)/));
await prueba("updated_at sigue delegado al trigger BEFORE", () =>
  assert.doesNotMatch(migracion, /set\s+[\s\S]*updated_at\s*=/i));
await prueba("RPC devuelve resultado estructurado", () =>
  assert.match(migracion, /jsonb_build_object\(\s*'resultado', 'restaurado'/s));
await prueba("bigint se devuelve como texto", () =>
  assert.match(migracion, /fila\.revision::text/));
await prueba("anon no ejecuta", () =>
  assert.match(migracion, /from anon/));
await prueba("Licenciado queda rechazado por validación de Supervisión", () =>
  assert.match(migracion, /if not \(select private\.usuario_app_es_supervision\(\)\)/));
await prueba("Enfermería queda rechazada por validación de Supervisión", () =>
  assert.match(migracion, /errcode = '42501'/));
await prueba("authenticated recibe ejecución condicionada", () =>
  assert.match(migracion, /grant execute[\s\S]*to authenticated/));

const crearClienteFalso = ({ filas = [], detalle = null, rpc = null, error = null } = {}) => {
  const llamadas = [];
  const crearConsulta = () => {
    const consulta = {
      select(campos) {
        llamadas.push(["select", campos]);
        consulta.esDetalle = campos.includes("data");
        return consulta;
      },
      order(campo, opciones) {
        llamadas.push(["order", campo, opciones]);
        return consulta;
      },
      limit(valor) {
        llamadas.push(["limit", valor]);
        return consulta;
      },
      eq(campo, valor) {
        llamadas.push(["eq", campo, valor]);
        return consulta;
      },
      gte(campo, valor) {
        llamadas.push(["gte", campo, valor]);
        return consulta;
      },
      lte(campo, valor) {
        llamadas.push(["lte", campo, valor]);
        return consulta;
      },
      or(valor) {
        llamadas.push(["or", valor]);
        return consulta;
      },
      maybeSingle() {
        llamadas.push(["maybeSingle"]);
        return Promise.resolve({ data: detalle, error });
      },
      then(resolver, rechazar) {
        return Promise.resolve({ data: filas, error }).then(resolver, rechazar);
      }
    };
    return consulta;
  };
  return {
    llamadas,
    from(tabla) {
      llamadas.push(["from", tabla]);
      return crearConsulta();
    },
    rpc(nombre, argumentos) {
      llamadas.push(["rpc", nombre, argumentos]);
      return Promise.resolve({ data: rpc, error });
    }
  };
};

const filaBase = {
  id: "9",
  turno: "noche",
  mes: "2026-08",
  revision: "9007199254740993",
  revision_anterior: "2",
  accion: "actualizacion_cas",
  usuario_id: "00000000-0000-0000-0000-000000000001",
  usuario_snapshot: "supervision",
  rol_snapshot: "supervision",
  turno_perfil_snapshot: null,
  secciones_cambiadas: ["planillas"],
  origen_revision: null,
  created_at: "2026-07-23T12:00:00Z"
};

await prueba("listado no solicita data", async () => {
  const cliente = crearClienteFalso({ filas: [filaBase] });
  await crearRepositorioHistorialEstadoTurnoMes(cliente).listarHistorial();
  const select = cliente.llamadas.find(([tipo]) => tipo === "select")[1];
  assert.doesNotMatch(select, /(^|,\s*)data(,|$)/);
});
await prueba("listado es paginado", async () => {
  const cliente = crearClienteFalso({ filas: [filaBase] });
  await crearRepositorioHistorialEstadoTurnoMes(cliente).listarHistorial({ limite: 10 });
  assert.deepEqual(cliente.llamadas.find(([tipo]) => tipo === "limit"), ["limit", 11]);
});
await prueba("listado tiene límite máximo", () =>
  assert.equal(LIMITES_HISTORIAL.maximo, 100));
await prueba("orden es estable por fecha e id", async () => {
  const cliente = crearClienteFalso();
  await crearRepositorioHistorialEstadoTurnoMes(cliente).listarHistorial();
  assert.deepEqual(
    cliente.llamadas.filter(([tipo]) => tipo === "order").map((x) => x[1]),
    ["created_at", "id"]
  );
});
await prueba("valida turno", async () => {
  const repo = crearRepositorioHistorialEstadoTurnoMes(crearClienteFalso());
  await assert.rejects(() => repo.listarHistorial({ turno: "otro" }), /turno/i);
});
await prueba("valida mes", async () => {
  const repo = crearRepositorioHistorialEstadoTurnoMes(crearClienteFalso());
  await assert.rejects(() => repo.listarHistorial({ mes: "2026-13" }), /mes/i);
});
await prueba("valida fechas", async () => {
  const repo = crearRepositorioHistorialEstadoTurnoMes(crearClienteFalso());
  await assert.rejects(() => repo.listarHistorial({ fechaDesde: "x" }), /fecha/i);
});
await prueba("fechaDesde acepta y normaliza ISO UTC", async () => {
  const cliente = crearClienteFalso();
  await crearRepositorioHistorialEstadoTurnoMes(cliente).listarHistorial({
    fechaDesde: "2026-07-23T10:30:00Z"
  });
  assert.deepEqual(
    cliente.llamadas.find(([tipo]) => tipo === "gte"),
    ["gte", "created_at", "2026-07-23T10:30:00.000Z"]
  );
});
await prueba("fechaHasta acepta y normaliza offset ISO", async () => {
  const cliente = crearClienteFalso();
  await crearRepositorioHistorialEstadoTurnoMes(cliente).listarHistorial({
    fechaHasta: "2026-07-23T10:30:00-03:00"
  });
  assert.deepEqual(
    cliente.llamadas.find(([tipo]) => tipo === "lte"),
    ["lte", "created_at", "2026-07-23T13:30:00.000Z"]
  );
});
await prueba("rechaza fecha local ambigua", async () => {
  const repo = crearRepositorioHistorialEstadoTurnoMes(crearClienteFalso());
  await assert.rejects(
    () => repo.listarHistorial({ fechaDesde: "01/02/2026" }),
    /fecha/i
  );
});
await prueba("rechaza timestamp sin zona horaria", async () => {
  const repo = crearRepositorioHistorialEstadoTurnoMes(crearClienteFalso());
  await assert.rejects(
    () => repo.listarHistorial({ fechaDesde: "2026-07-23 10:30" }),
    /fecha/i
  );
});
await prueba("rechaza rango de fechas invertido antes de consultar", async () => {
  const cliente = crearClienteFalso();
  const repo = crearRepositorioHistorialEstadoTurnoMes(cliente);
  await assert.rejects(
    () => repo.listarHistorial({
      fechaDesde: "2026-07-24T00:00:00Z",
      fechaHasta: "2026-07-23T00:00:00Z"
    }),
    /posterior/i
  );
  assert.equal(cliente.llamadas.length, 0);
});
await prueba("cursor normaliza timestamp antes del filtro PostgREST", async () => {
  const cliente = crearClienteFalso();
  await crearRepositorioHistorialEstadoTurnoMes(cliente).listarHistorial({
    cursor: {
      createdAt: "2026-07-23T10:30:00-03:00",
      id: "9"
    }
  });
  const filtro = cliente.llamadas.find(([tipo]) => tipo === "or")[1];
  assert.match(filtro, /2026-07-23T13:30:00\.000Z/);
  assert.doesNotMatch(filtro, /-03:00/);
});
await prueba("usuarioId válido se normaliza a minúsculas", async () => {
  const cliente = crearClienteFalso();
  await crearRepositorioHistorialEstadoTurnoMes(cliente).listarHistorial({
    usuarioId: "550E8400-E29B-41D4-A716-446655440000"
  });
  assert.deepEqual(
    cliente.llamadas.find(
      ([tipo, campo]) => tipo === "eq" && campo === "usuario_id"
    ),
    ["eq", "usuario_id", "550e8400-e29b-41d4-a716-446655440000"]
  );
});
await prueba("usuarioId inválido se rechaza antes de consultar", async () => {
  const cliente = crearClienteFalso();
  await assert.rejects(
    () => crearRepositorioHistorialEstadoTurnoMes(cliente).listarHistorial({
      usuarioId: "usuario-arbitrario"
    }),
    /UUID/i
  );
  assert.equal(cliente.llamadas.length, 0);
});
await prueba("valida acción", async () => {
  const repo = crearRepositorioHistorialEstadoTurnoMes(crearClienteFalso());
  await assert.rejects(() => repo.listarHistorial({ accion: "libre" }), /acción/i);
});
await prueba("carga individual por id conserva snapshot", async () => {
  const data = { personal: [{ id: "p1", nombre: "Persona A" }] };
  const cliente = crearClienteFalso({ detalle: { ...filaBase, data, metadata: {} } });
  const resultado = await crearRepositorioHistorialEstadoTurnoMes(cliente)
    .cargarRevisionHistorial("9");
  assert.equal(resultado.tipo, "ok");
  assert.equal(resultado.revision.data, data);
});
await prueba("carga individual respeta no encontrado", async () => {
  const resultado = await crearRepositorioHistorialEstadoTurnoMes(
    crearClienteFalso()
  ).cargarRevisionHistorial("9");
  assert.equal(resultado.tipo, "no_encontrado");
});
await prueba("servicio de restauración no envía data", async () => {
  const cliente = crearClienteFalso({
    rpc: {
      resultado: "restaurado",
      turno: "noche",
      mes: "2026-08",
      revision: "4",
      revision_anterior: "3",
      origen_revision: "1",
      updated_at: "2026-07-23T12:00:00Z"
    }
  });
  await crearRepositorioHistorialEstadoTurnoMes(cliente).restaurarRevision({
    historialId: "9",
    revisionEsperada: "3"
  });
  const argumentos = cliente.llamadas.find(([tipo]) => tipo === "rpc")[2];
  assert.equal(Object.hasOwn(argumentos, "p_data"), false);
});
await prueba("servicio no envía autor", async () => {
  const fuente = repositorioFuente;
  assert.doesNotMatch(fuente, /p_usuario|p_autor/);
});
await prueba("conflicto se devuelve sin reintento", () => {
  const resultado = interpretarRespuestaRestauracion({
    resultado: "conflicto",
    existe: true,
    turno: "noche",
    mes: "2026-08",
    revision: "9007199254740993",
    updated_at: "2026-07-23T12:00:00Z"
  });
  assert.equal(resultado.tipo, "conflicto");
  assert.equal(resultado.revision, "9007199254740993");
});
await prueba("revisión decimal permanece como string", () => {
  const resultado = interpretarRespuestaRestauracion({
    resultado: "restaurado",
    turno: "noche",
    mes: "2026-08",
    revision: "9007199254740993",
    revision_anterior: "9007199254740992",
    origen_revision: "1"
  });
  assert.equal(resultado.revision, "9007199254740993");
});
await prueba("traduce errores de permiso", async () => {
  const resultado = await crearRepositorioHistorialEstadoTurnoMes(
    crearClienteFalso({ error: { code: "42501", message: "denied" } })
  ).listarHistorial();
  assert.equal(resultado.tipo, "sin_permiso");
});
await prueba("traduce error técnico sin exponer snapshots", async () => {
  const resultado = await crearRepositorioHistorialEstadoTurnoMes(
    crearClienteFalso({ error: { code: "500", message: "detalle interno" } })
  ).restaurarRevision({ historialId: "9", revisionEsperada: "3" });
  assert.deepEqual(resultado, {
    tipo: "error",
    mensaje: "No fue posible restaurar la revisión histórica."
  });
});
await prueba("no imprime snapshots en consola", () =>
  assert.doesNotMatch(repositorioFuente, /console\./));

const anterior = {
  personal: [
    { id: "p1", nombre: "Persona A", categoria: "enfermero", horario: "06-12" },
    { id: "p2", nombre: "Persona B" }
  ],
  planillas: { enfermeros: { semana1: { "REA 1": { personaId: "p1" } } } },
  calendario: {
    enfermeros: {
      extras: {},
      asistenciaDia: { "2026-08-01": { p1: "presente" } }
    }
  },
  licencias: [{ id: "l1", personaId: "p1", desde: "2026-08-01" }],
  certificaciones: [{ id: "c1", personaId: "p2", desde: "2026-08-02" }]
};
const nuevo = {
  personal: [
    { id: "p1", nombre: "Persona A", categoria: "enfermero", horario: "12-18" },
    { id: "p3", nombre: "Persona C" }
  ],
  planillas: { enfermeros: { semana1: { "REA 1": { personaId: "p3" } } } },
  calendario: {
    enfermeros: {
      extras: { "2026-08-01": [{ id: "e1", nombre: "Extra A" }] },
      asistenciaDia: { "2026-08-01": { p1: "ausente" } }
    }
  },
  licencias: [{ id: "l1", personaId: "p1", desde: "2026-08-03" }],
  certificaciones: []
};

await prueba("comparador es puro", () => {
  const copia = structuredClone(anterior);
  compararSnapshotsMensuales(anterior, nuevo);
  assert.deepEqual(anterior, copia);
});
await prueba("comparador no importa React", () =>
  assert.doesNotMatch(comparadorFuente, /from ["']react/));
await prueba("comparador no importa Supabase", () =>
  assert.doesNotMatch(comparadorFuente, /supabase/i));
await prueba("no existe clonación recursiva ilimitada", () => {
  assert.doesNotMatch(comparadorFuente, /const clonar\s*=/);
  assert.doesNotMatch(comparadorFuente, /\.map\(clonar\)/);
});
await prueba("profundidad máxima no clona la rama restante", () => {
  const ramaProfunda = comparadorFuente.slice(
    comparadorFuente.indexOf("const canonizarConPresupuesto"),
    comparadorFuente.indexOf("const crearFirmaCanonica")
  );
  assert.doesNotMatch(ramaProfunda, /clonar/);
  assert.match(ramaProfunda, /completo: false/);
});
await prueba("el índice de array no se usa como identidad", () =>
  assert.doesNotMatch(comparadorFuente, /indice:\$\{indice\}/));
await prueba("colección sin ids reordenada no genera cambios", () => {
  const resultado = compararSnapshotsMensuales(
    { licencias: [{ desde: "2026-01-01" }, { desde: "2026-02-01" }] },
    { licencias: [{ desde: "2026-02-01" }, { desde: "2026-01-01" }] }
  );
  assert.equal(resultado.totalDetalles, 0);
});
await prueba("insertar sin id no modifica falsamente los demás", () => {
  const resultado = compararSnapshotsMensuales(
    { licencias: [{ valor: "A" }, { valor: "B" }] },
    { licencias: [{ valor: "X" }, { valor: "A" }, { valor: "B" }] }
  );
  assert.deepEqual(resultado.totales, {
    agregados: 1,
    eliminados: 0,
    modificados: 0
  });
});
await prueba("cambio sin id se informa como baja y alta", () => {
  const resultado = compararSnapshotsMensuales(
    { certificaciones: [{ fecha: "2026-01-01", valor: "A" }] },
    { certificaciones: [{ fecha: "2026-01-01", valor: "B" }] }
  );
  assert.deepEqual(resultado.totales, {
    agregados: 1,
    eliminados: 1,
    modificados: 0
  });
});
await prueba("duplicados sin id conservan multiplicidad", () => {
  const resultado = compararSnapshotsMensuales(
    { licencias: [{ valor: "A" }, { valor: "A" }] },
    { licencias: [{ valor: "A" }] }
  );
  assert.deepEqual(resultado.totales, {
    agregados: 0,
    eliminados: 1,
    modificados: 0
  });
});
await prueba("persona con id continúa como modificación", () => {
  const resultado = compararSnapshotsMensuales(
    { personal: [{ id: "p1", nombre: "Persona A" }] },
    { personal: [{ id: "p1", nombre: "Persona B" }] }
  );
  assert.deepEqual(resultado.totales, {
    agregados: 0,
    eliminados: 0,
    modificados: 1
  });
});
await prueba("sin id no se inventa un renombrado", () => {
  const resultado = compararSnapshotsMensuales(
    { personal: [{ nombre: "Persona A" }] },
    { personal: [{ nombre: "Persona B" }] }
  );
  assert.equal(resultado.totales.modificados, 0);
  assert.equal(resultado.totales.agregados, 1);
  assert.equal(resultado.totales.eliminados, 1);
});
await prueba("objeto enorme no se copia completo en el detalle", () => {
  const payload = Object.fromEntries(
    Array.from({ length: 5_000 }, (_, indice) => [`campo${indice}`, indice])
  );
  const resultado = compararSnapshotsMensuales(
    { personal: [] },
    { personal: [{ id: "grande", payload }] }
  );
  const cambio = resultado.detalle.personal[0];
  assert.equal(cambio.tipo, "agregado");
  assert.equal(cambio.descripcion, "Persona agregado");
  assert.equal(cambio.contenidoOmitido, true);
  assert.ok(Object.keys(cambio.nuevo.payload).length < 5_000);
  assert.equal(resultado.truncado, true);
  assert.equal(resultado.analisisIncompleto, false);
});
await prueba("array enorme no se copia completo en una vista previa", () => {
  const resultado = compararSnapshotsMensuales(
    { personal: [] },
    {
      personal: [{
        id: "array-grande",
        valores: Array.from({ length: 10_000 }, (_, indice) => indice)
      }]
    }
  );
  const cambio = resultado.detalle.personal[0];
  assert.equal(cambio.tipo, "agregado");
  assert.equal(cambio.contenidoOmitido, true);
  assert.ok(cambio.nuevo.valores.length < 10_000);
});
await prueba("estructura sintética profunda no provoca RangeError", () => {
  const profundo = { id: "profundo" };
  let cursor = profundo;
  for (let indice = 0; indice < 5_000; indice += 1) {
    cursor.siguiente = {};
    cursor = cursor.siguiente;
  }
  assert.doesNotThrow(() =>
    compararSnapshotsMensuales(
      { personal: [] },
      { personal: [profundo] }
    )
  );
});
for (const seccion of ["personal", "planillas", "calendario", "licencias", "certificaciones"]) {
  await prueba(`detecta sección ${seccion}`, () =>
    assert.ok(compararSnapshotsMensuales(anterior, nuevo).seccionesCambiadas.includes(seccion)));
}
await prueba("detecta agregado", () =>
  assert.ok(compararSnapshotsMensuales(anterior, nuevo).totales.agregados > 0));
await prueba("detecta eliminado", () =>
  assert.ok(compararSnapshotsMensuales(anterior, nuevo).totales.eliminados > 0));
await prueba("detecta modificado", () =>
  assert.ok(compararSnapshotsMensuales(anterior, nuevo).totales.modificados > 0));
await prueba("maneja null", () =>
  assert.doesNotThrow(() => compararSnapshotsMensuales(null, null)));
await prueba("maneja estructuras históricas incompletas", () =>
  assert.doesNotThrow(() => compararSnapshotsMensuales({ personal: [] }, { calendario: {} })));
await prueba("evita mutar snapshot nuevo", () => {
  const copia = structuredClone(nuevo);
  compararSnapshotsMensuales(anterior, nuevo);
  assert.deepEqual(nuevo, copia);
});
await prueba("limita detalle", () => {
  const resultado = compararSnapshotsMensuales(anterior, nuevo, { limiteDetalles: 1 });
  assert.equal(
    Object.values(resultado.detalle).reduce((total, items) => total + items.length, 0),
    1
  );
});
await prueba("expone indicador truncado", () =>
  assert.equal(
    compararSnapshotsMensuales(anterior, nuevo, { limiteDetalles: 1 }).truncado,
    true
  ));
await prueba("existe presupuesto global de procesamiento", () =>
  assert.match(comparadorFuente, /presupuestoProcesamiento/));
await prueba("objeto ancho detiene el análisis", () => {
  const planillas = Object.fromEntries(
    Array.from({ length: 500 }, (_, indice) => [`sector${indice}`, indice])
  );
  const resultado = compararSnapshotsMensuales(
    { planillas: {} },
    { planillas },
    { presupuestoProcesamiento: 30 }
  );
  assert.ok(resultado.nodosVisitados <= 30);
  assert.equal(resultado.truncado, true);
  assert.equal(resultado.analisisIncompleto, true);
});
await prueba("análisis normal queda completo", () => {
  const resultado = compararSnapshotsMensuales(
    { personal: [{ id: "p1", nombre: "A" }] },
    { personal: [{ id: "p1", nombre: "B" }] }
  );
  assert.equal(resultado.analisisIncompleto, false);
});
await prueba("agotamiento durante detección marca análisis incompleto", () => {
  const profundo = {};
  let cursor = profundo;
  for (let indice = 0; indice < 30; indice += 1) {
    cursor.siguiente = {};
    cursor = cursor.siguiente;
  }
  const resultado = compararSnapshotsMensuales(
    { planillas: {} },
    { planillas: profundo },
    { presupuestoProcesamiento: 1_000 }
  );
  assert.equal(resultado.truncado, true);
  assert.equal(resultado.analisisIncompleto, true);
});
await prueba("limita profundidad de recorrido", () =>
  assert.match(
    comparadorFuente,
    /PROFUNDIDAD_DETECCION_MAXIMA = 12[\s\S]*profundidad > PROFUNDIDAD_DETECCION_MAXIMA/
  ));
await prueba("incluye fallback genérico", () => {
  const resultado = compararSnapshotsMensuales({ legado: 1 }, { legado: 2 });
  assert.ok(resultado.resumen.includes("Se modificó la sección legado."));
});
await prueba("no agrega dependencia externa", () => {
  assert.equal(packageJson.dependencies["deep-diff"], undefined);
  assert.equal(packageJson.devDependencies?.vitest, undefined);
});

await prueba("RPC CAS de Etapa 23 permanece", () =>
  assert.match(
    leer("supabase/migrations/20260723_agregar_concurrencia_estado_turno_mes.sql"),
    /guardar_estado_turno_mes_si_revision/
  ));
await prueba("trigger BEFORE permanece", () =>
  assert.match(
    leer("supabase/migrations/20260723_agregar_concurrencia_estado_turno_mes.sql"),
    /before insert or update/
  ));
await prueba("trigger histórico 24B permanece", () =>
  assert.match(migracion24b, /after insert or update/));
await prueba("App no integra historial", () =>
  assert.doesNotMatch(app, /historialEstadoTurnos|restaurarRevision/));
await prueba("panel de conflicto no integra historial", () =>
  assert.doesNotMatch(panel, /restaurarRevision|historialEstadoTurnos/));
await prueba("servicios actuales conservan archivos", () => {
  assert.ok(fs.existsSync(path.join(raiz, "src/services/estadoTurnos.js")));
  assert.ok(fs.existsSync(path.join(raiz, "src/services/estadoPorTurnoMes.js")));
});
await prueba("pruebas anteriores permanecen", () => {
  for (const nombre of ["test:etapa20", "test:etapa23b", "test:etapa23c", "test:etapa23d", "test:etapa24b"]) {
    assert.ok(packageJson.scripts[nombre]);
  }
});
await prueba("package-lock no referencia etapa 24C", () =>
  assert.doesNotMatch(leer("package-lock.json"), /etapa24c/));
await prueba("tests no crean cliente externo", () =>
  assert.doesNotMatch(leer("tests/etapa24c-servicios-restauracion.test.mjs"), /createClient\(/));
await prueba("SQL queda contenido en migración", () => {
  assert.doesNotMatch(repositorioFuente, /\b(update|insert|delete)\s+public\./i);
});

console.log(`\n${cantidad} pruebas permanentes de Etapa 24C superadas.`);
