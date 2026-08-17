import assert from "node:assert/strict";
import fs from "node:fs";
import {
  agregarExtraAlCalendario,
  agregarExtraALista,
  crearExtraDesdePersonal,
  crearExtraTemporal,
  eliminarExtraDelDia
} from "../src/utils/extrasPersonas.js";
import {
  crearEstadoMensualVacio,
  normalizarEstadoMensual
} from "../src/utils/estadoMensual.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { obtenerClaveIdentidadPersona } from "../src/utils/identidadPersonas.js";
import {
  construirAsignacionesDiariasCalendario,
  incorporarPersonasSinAsignar
} from "../src/utils/pipelineCalendarioDiario.js";
import {
  crearRegistroNoDisponible,
  MOTIVOS_NO_DISPONIBLE
} from "../src/utils/noDisponiblesMotivos.js";
import { referenciaCorrespondeAPersona } from "../src/utils/referenciasPersonas.js";

let total = 0;
const probar = (nombre, fn) => {
  fn();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const fecha = "2026-08-17";

const crearTresManuales = (categoria) => ["Extra A", "Extra B", "Extra C"].reduce(
  (lista, nombre, indice) => {
    const resultado = crearExtraTemporal({
      nombre: `${categoria} ${nombre}`,
      categoria,
      extrasDia: lista,
      crearId: () => `${categoria}-extra-${indice + 1}`
    });
    assert.equal(resultado.error, "");
    return agregarExtraALista(lista, resultado.extra);
  },
  []
);

for (const categoria of ["licenciado", "enfermero"]) {
  probar(`${categoria}: tres Extras de la misma fecha coexisten por id`, () => {
    const extras = crearTresManuales(categoria);
    assert.deepEqual(extras.map((extra) => extra.id), [
      `${categoria}-extra-1`, `${categoria}-extra-2`, `${categoria}-extra-3`
    ]);
  });

  probar(`${categoria}: eliminar sólo B conserva A y C`, () => {
    const extras = crearTresManuales(categoria);
    const calendario = { extras: { [fecha]: extras }, cambiosDia: {}, cambiosParoDia: {} };
    const resultado = eliminarExtraDelDia({
      calendarioCategoria: calendario,
      fecha,
      extra: extras[1]
    });
    assert.deepEqual(resultado.extras[fecha].map((extra) => extra.id), [
      `${categoria}-extra-1`, `${categoria}-extra-3`
    ]);
  });

  probar(`${categoria}: serializar, recargar y agregar D preserva A y C`, () => {
    const extras = crearTresManuales(categoria);
    const estado = crearEstadoMensualVacio();
    estado.calendario[categoria === "licenciado" ? "licenciados" : "enfermeros"].extras[fecha] = [extras[0], extras[2]];
    const recargado = normalizarEstadoMensual(JSON.parse(JSON.stringify(estado)));
    const claveCategoria = categoria === "licenciado" ? "licenciados" : "enfermeros";
    const actuales = recargado.calendario[claveCategoria].extras[fecha];
    const cuarto = crearExtraTemporal({
      nombre: `${categoria} Extra D`, categoria, extrasDia: actuales,
      crearId: () => `${categoria}-extra-4`
    }).extra;
    assert.deepEqual(agregarExtraALista(actuales, cuarto).map((extra) => extra.id), [
      `${categoria}-extra-1`, `${categoria}-extra-3`, `${categoria}-extra-4`
    ]);
  });
}

probar("varios funcionarios registrados del mismo turno de origen conservan personaId independientes", () => {
  const personas = ["a", "b", "c"].map((id) => ({
    id: `persona-${id}`,
    nombre: `Persona ${id.toUpperCase()}`,
    categoria: "licenciado"
  }));
  const extras = personas.reduce((lista, persona) => {
    const resultado = crearExtraDesdePersonal({
      persona,
      turnoOrigen: "manana",
      categoria: "licenciado",
      extrasDia: lista
    });
    assert.equal(resultado.error, "");
    return agregarExtraALista(lista, resultado.extra);
  }, []);
  assert.deepEqual(extras.map((extra) => extra.personaId), personas.map((persona) => persona.id));
});

probar("el updater productivo agrega A, B y C sobre el estado padre más reciente", () => {
  const extras = crearTresManuales("licenciado");
  let calendarioPadre = { extras: {}, cambiosDia: { [fecha]: { REA: "persona-x" } } };
  for (const extra of extras) {
    calendarioPadre = agregarExtraAlCalendario({
      calendarioCategoria: calendarioPadre,
      fecha,
      extra
    });
    assert.equal(
      calendarioPadre.extras[fecha].some((actual) => actual.id === extra.id),
      true
    );
  }
  assert.deepEqual(calendarioPadre.extras[fecha].map((extra) => extra.id), [
    "licenciado-extra-1", "licenciado-extra-2", "licenciado-extra-3"
  ]);
  assert.deepEqual(calendarioPadre.cambiosDia[fecha], { REA: "persona-x" });
});

probar("una actualización concurrente del padre no descarta el segundo Licenciado", () => {
  const [extraA, extraB] = crearTresManuales("licenciado");
  const fotoAlAbrir = agregarExtraAlCalendario({
    calendarioCategoria: { extras: {} }, fecha, extra: extraA
  });
  const estadoMasReciente = {
    ...fotoAlAbrir,
    asistenciaDia: { [fecha]: { otraPersona: "presente" } }
  };
  assert.notEqual(estadoMasReciente, fotoAlAbrir);
  const resultado = agregarExtraAlCalendario({
    calendarioCategoria: estadoMasReciente,
    fecha,
    extra: extraB
  });
  assert.deepEqual(resultado.extras[fecha].map((extra) => extra.id), [
    "licenciado-extra-1", "licenciado-extra-2"
  ]);
  assert.equal(resultado.asistenciaDia, estadoMasReciente.asistenciaDia);
});

const ejecutarDistribucionLicenciadosConExtras = ({ conAusencia }) => {
  const titulares = ["a", "b", "c"].map((id) => ({
    id: `titular-${id}`,
    nombre: `Titular ${id.toUpperCase()}`,
    categoria: "licenciado"
  }));
  const extras = crearTresManuales("licenciado").map((extra, indice) => ({
    ...extra,
    id: `extra-${indice + 1}`,
    tipoExtra: "refuerzo"
  }));
  const personal = [...titulares, ...extras];
  const noDisponible = conAusencia
    ? crearRegistroNoDisponible({
        persona: titulares[1],
        motivo: MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO,
        turnoDestino: "noche"
      }).registro
    : null;
  const estaDisponible = (persona) => !noDisponible ||
    !referenciaCorrespondeAPersona(noDisponible, persona, personal);
  const filasConfiguracion = titulares.map((_, indice) => ({
    filaId: `sector.${indice + 1}`,
    sectorId: `sector_${indice + 1}`,
    etiqueta: `SECTOR ${indice + 1}`
  }));
  const distribucion = Object.fromEntries(titulares.map((titular, indice) => [
    `SECTOR ${indice + 1}`,
    { personaId: titular.id, nombre: titular.nombre }
  ]));
  const base = construirAsignacionesDiariasCalendario({
    filasCalendario: filasConfiguracion.map((fila) => fila.etiqueta),
    filasConfiguracion,
    planillaPeriodoEfectiva: distribucion,
    cambiosDia: { PROTEGIDO: "__EMPTY__" },
    personal,
    turnantes: []
  });
  // Un hueco manual protegido reproduce el estado real que hacía que los
  // refuerzos sobrantes se descartaran de la vista.
  base.push({ nombre: "PROTEGIDO", sectorId: "protegido", enfermero: null, tipo: "sector", vacioManual: true });
  const resolucion = resolverTurnantesYCoberturasOperativas({
    asignaciones: base,
    extras,
    personal,
    esPersonaDisponible: estaDisponible
  });
  const sobrantes = extras.filter(
    (extra) => !resolucion.usados.has(obtenerClaveIdentidadPersona(extra))
  );
  return incorporarPersonasSinAsignar({
    asignaciones: resolucion.asignaciones,
    personas: sobrantes
  });
};

probar("Licenciados: una ausencia de Supervisión no limita tres Extras sin reemplazo", () => {
  const resultado = ejecutarDistribucionLicenciadosConExtras({ conAusencia: true });
  const extrasVisibles = resultado
    .map((fila) => fila.enfermero)
    .filter((persona) => persona?.tipoExtra === "refuerzo");
  assert.deepEqual(extrasVisibles.map((extra) => extra.id), ["extra-1", "extra-2", "extra-3"]);
  assert.equal(resultado.filter((fila) => fila.nombre === "SIN ASIGNAR").length, 2);
});

probar("Licenciados: sin ausencias conserva tres Extras sin reemplazo", () => {
  const resultado = ejecutarDistribucionLicenciadosConExtras({ conAusencia: false });
  const extrasSinAsignar = resultado
    .filter((fila) => fila.nombre === "SIN ASIGNAR")
    .map((fila) => fila.enfermero?.id);
  assert.deepEqual(extrasSinAsignar, ["extra-1", "extra-2", "extra-3"]);
});

probar("el formulario valida contra la prop actual y no contra un ref atrasado", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  const inicio = fuente.indexOf("const contextoExtraValido");
  const fin = fuente.indexOf("const confirmarExtra", inicio);
  const bloque = fuente.slice(inicio, fin);
  assert.match(bloque, /formularioExtra\.contexto\.calendario === calendario/);
  assert.doesNotMatch(bloque, /obtenerCalendarioActual/);
});

probar("Calendario usa el updater atómico y no compara prev por referencia", () => {
  const fuente = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(fuente, /setCalendario\(\(prev\) => agregarExtraAlCalendario\(\{/);
  assert.doesNotMatch(fuente, /prev !== (formularioExtra\.contexto|contexto)\.calendario/);
});

probar("Extras se persisten en el JSON mensual y no en una tabla Supabase separada", () => {
  const migraciones = fs.readdirSync("supabase/migrations")
    .map((archivo) => fs.readFileSync(`supabase/migrations/${archivo}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(migraciones, /create table[^;]*extras/i);
});

console.log(`\n${total} pruebas de Extras múltiples por categoría pasaron.`);
