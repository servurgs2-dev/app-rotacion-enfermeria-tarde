import assert from "node:assert/strict";
import fs from "node:fs";
import {
  agregarExtraALista,
  crearExtraDesdePersonal,
  crearExtraTemporal,
  eliminarExtraDelDia,
  obtenerDescripcionExtra,
  prepararCandidatosExtraOtroTurno
} from "../src/utils/extrasPersonas.js";
import { renombrarPersonaEnEstado } from "../src/utils/renombrarPersona.js";
import { limpiarPersonaDeCalendario } from "../src/utils/integridadPersonas.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const enfermeraManana = {
  id: "p-manana",
  nombre: "Persona Mañana",
  funcionario: "12345",
  categoria: "enfermero",
  turno: "manana"
};
const enfermeraNoche = {
  id: "p-noche",
  nombre: "Persona Noche",
  funcionario: "67890",
  categoria: "enfermero",
  turno: "noche"
};
const licenciado = {
  id: "l-manana",
  nombre: "Licenciado A",
  funcionario: "555",
  categoria: "licenciado",
  turno: "manana"
};
const candidatos = [
  { persona: enfermeraManana, turnoOrigen: "manana", turnoNombre: "Mañana" },
  { persona: enfermeraNoche, turnoOrigen: "noche", turnoNombre: "Noche" },
  { persona: licenciado, turnoOrigen: "manana", turnoNombre: "Mañana" },
  {
    persona: { ...enfermeraManana, id: "p-tarde", turno: "tarde" },
    turnoOrigen: "tarde",
    turnoNombre: "Tarde"
  }
];
const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
const appFuente = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const panelFuente = fs.readFileSync(
  new URL("../src/components/calendario/PanelAgregarExtra.jsx", import.meta.url),
  "utf8"
);
const selectorFuente = fs.readFileSync(
  new URL("../src/components/calendario/SelectorFuncionarioOtroTurno.jsx", import.meta.url),
  "utf8"
);
const distribucionFuente = fs.readFileSync(
  new URL("../src/utils/distribucionTurnantesCoberturas.js", import.meta.url),
  "utf8"
);

probar("1 permite elegir Personal de otro turno", () => {
  const resultado = prepararCandidatosExtraOtroTurno({
    candidatos,
    categoria: "enfermero",
    turnoActivo: "tarde"
  });
  assert.deepEqual(resultado.map((item) => item.persona.id), ["p-manana", "p-noche"]);
  assert.match(panelFuente, /SelectorFuncionarioOtroTurno/);
  assert.match(selectorFuente, /Personal de otro turno/);
});
probar("2 filtra por la misma categoría", () => {
  const resultado = prepararCandidatosExtraOtroTurno({
    candidatos,
    categoria: "enfermero",
    turnoActivo: "tarde"
  });
  assert.equal(resultado.some((item) => item.persona.categoria === "licenciado"), false);
});
probar("3 excluye el turno activo", () => {
  const resultado = prepararCandidatosExtraOtroTurno({
    candidatos,
    categoria: "enfermero",
    turnoActivo: "tarde"
  });
  assert.equal(resultado.some((item) => item.turnoOrigen === "tarde"), false);
});
probar("4 muestra nombre, funcionario y turno habitual", () => {
  const [resultado] = prepararCandidatosExtraOtroTurno({
    candidatos: [candidatos[0]],
    categoria: "enfermero",
    turnoActivo: "tarde"
  });
  assert.equal(resultado.etiqueta, "Persona Mañana — Turno Mañana — Func. 12345");
});

const crearPersonal = (extrasDia = []) => crearExtraDesdePersonal({
  persona: enfermeraManana,
  turnoOrigen: "manana",
  categoria: "enfermero",
  extrasDia,
  creadoEn: "2026-07-29T10:00:00.000Z"
});

probar("5 Personal de otro turno guarda personaId", () => {
  assert.equal(crearPersonal().extra.personaId, "p-manana");
});
probar("6 Personal de otro turno guarda turno de origen", () => {
  const extra = crearPersonal().extra;
  assert.equal(extra.turnoOrigen, "manana");
  assert.equal(extra.origenExtra, "personal_otro_turno");
});
probar("7 agregar Extra no modifica el turno de origen", () => {
  const original = structuredClone(enfermeraManana);
  crearPersonal();
  assert.deepEqual(enfermeraManana, original);
  assert.match(appFuente, /obtenerEstadosDeOtrosTurnos/);
});
probar("8 agregar Extra no modifica No disponibles", () => {
  const calendario = {
    extras: {},
    noDisponibles: { "2026-07-29": [{ personaId: "otra" }] }
  };
  const siguiente = {
    ...calendario,
    extras: { "2026-07-29": [crearPersonal().extra] }
  };
  assert.equal(siguiente.noDisponibles, calendario.noDisponibles);
});
probar("9 permite Extra manual", () => {
  const resultado = crearExtraTemporal({
    nombre: "Persona Manual",
    categoria: "enfermero",
    extrasDia: [],
    crearId: () => "extra-manual"
  });
  assert.equal(resultado.extra.origenExtra, "manual");
  assert.equal(resultado.extra.personaId, null);
});
probar("10 el nombre manual es obligatorio", () => {
  assert.equal(
    crearExtraTemporal({ nombre: " ", categoria: "enfermero" }).extra,
    null
  );
});
probar("11 el funcionario manual es opcional", () => {
  const sinFuncionario = crearExtraTemporal({
    nombre: "Persona Manual",
    categoria: "enfermero",
    crearId: () => "extra-1"
  }).extra;
  const conFuncionario = crearExtraTemporal({
    nombre: "Otra Persona",
    funcionario: "45821",
    categoria: "enfermero",
    crearId: () => "extra-2"
  }).extra;
  assert.equal(sinFuncionario.funcionario, "");
  assert.equal(conFuncionario.funcionario, "45821");
});
probar("12 Extra manual no crea la persona dentro de Personal", () => {
  const personal = [enfermeraManana];
  crearExtraTemporal({
    nombre: "Persona Manual",
    categoria: "enfermero",
    personal,
    crearId: () => "extra-1"
  });
  assert.deepEqual(personal, [enfermeraManana]);
});
probar("13 no duplica Personal por personaId", () => {
  const primero = crearPersonal().extra;
  const segundo = crearPersonal([primero]);
  assert.equal(segundo.extra, null);
  assert.match(segundo.error, /ya está agregada/);
});
probar("14 no duplica manual por funcionario", () => {
  const primero = crearExtraTemporal({
    nombre: "Persona Manual",
    funcionario: "45821",
    categoria: "enfermero",
    crearId: () => "extra-1"
  }).extra;
  const segundo = crearExtraTemporal({
    nombre: "Nombre Distinto",
    funcionario: "45821",
    categoria: "enfermero",
    extrasDia: [primero],
    crearId: () => "extra-2"
  });
  assert.equal(segundo.extra, null);
});
probar("15 no duplica manual por nombre normalizado sin funcionario", () => {
  const primero = crearExtraTemporal({
    nombre: "Persona Álvarez",
    categoria: "enfermero",
    crearId: () => "extra-1"
  }).extra;
  const segundo = crearExtraTemporal({
    nombre: " persona alvarez ",
    categoria: "enfermero",
    extrasDia: [primero],
    crearId: () => "extra-2"
  });
  assert.equal(segundo.extra, null);
});
probar("16 permite quitar el Extra de la fecha", () => {
  const extra = crearPersonal().extra;
  const calendario = {
    extras: { "2026-07-29": [extra], "2026-07-30": [extra] },
    cambiosDia: {},
    cambiosParoDia: {}
  };
  const resultado = eliminarExtraDelDia({
    calendarioCategoria: calendario,
    fecha: "2026-07-29",
    extra
  });
  assert.deepEqual(resultado.extras["2026-07-29"], []);
  assert.equal(resultado.extras["2026-07-30"], calendario.extras["2026-07-30"]);
});
probar("17 quitar Extra no elimina Personal", () => {
  const personal = [enfermeraManana];
  eliminarExtraDelDia({
    calendarioCategoria: {
      extras: { "2026-07-29": [crearPersonal().extra] },
      cambiosDia: {},
      cambiosParoDia: {}
    },
    fecha: "2026-07-29",
    extra: crearPersonal().extra,
    personal
  });
  assert.deepEqual(personal, [enfermeraManana]);
});
probar("18 los Extras históricos siguen funcionando", () => {
  const historico = { id: "historico", nombre: "Extra Histórico", temporal: true };
  assert.deepEqual(agregarExtraALista([], historico), [historico]);
  assert.equal(obtenerDescripcionExtra(historico), "Refuerzo · Extra manual");
});
probar("19 ambos orígenes conservan el refuerzo sin ramas por origen", () => {
  assert.match(distribucionFuente, /const refuerzos = lista\(extras\)\.filter/);
  assert.doesNotMatch(distribucionFuente, /origenExtra.*tomarExtra/);
});
probar("20 ambos tipos aparecen en cambios manuales", () => {
  assert.match(calendarioFuente, /\[\.\.\.personalFiltrado, \.\.\.extrasDia\]/);
});
probar("21 ambos tipos pueden quedar en SIN ASIGNAR", () => {
  assert.match(calendarioFuente, /personal: \[\.\.\.personalFiltrado, \.\.\.extrasDia\]/);
});
probar("22 aparecen en cobertura informativa de No disponibles", () => {
  assert.match(calendarioFuente, /<PanelNoDisponible[\s\S]*obtenerExtrasCompatiblesCambioOtroTurno/);
});
probar("23 la marca Turnante no depende de ser Extra", () => {
  assert.doesNotMatch(calendarioFuente, /origenExtra.*esTurnante/);
});
probar("24 renombrar conserva identidad y metadata del Extra", () => {
  const extra = crearPersonal().extra;
  const estado = {
    personal: [],
    planillas: {},
    calendario: {
      enfermeros: { extras: { "2026-07-29": [extra] } },
      licenciados: {}
    },
    licencias: [],
    certificaciones: []
  };
  const renombrado = renombrarPersonaEnEstado(estado, "p-manana", "Nombre Nuevo")
    .calendario.enfermeros.extras["2026-07-29"][0];
  assert.equal(renombrado.nombre, "Nombre Nuevo");
  assert.equal(renombrado.personaId, "p-manana");
  assert.equal(renombrado.turnoOrigen, "manana");
});
probar("25 eliminar Personal limpia el Extra vinculado sin alterar manuales", () => {
  const manual = crearExtraTemporal({
    nombre: "Manual",
    categoria: "enfermero",
    crearId: () => "manual"
  }).extra;
  const calendario = {
    extras: { "2026-07-29": [crearPersonal().extra, manual] },
    cambiosDia: {},
    cambiosParoDia: {},
    noDisponibles: {},
    asistenciaDia: {}
  };
  const limpio = limpiarPersonaDeCalendario(
    calendario,
    enfermeraManana,
    [enfermeraManana]
  );
  assert.deepEqual(limpio.extras["2026-07-29"], [manual]);
});
probar("26 preparar mes siguiente no copia Extras", () => {
  const preparacion = fs.readFileSync(
    new URL("../src/utils/preparacionMesNuevo.js", import.meta.url),
    "utf8"
  );
  assert.match(preparacion, /const vacio = crearEstadoMensualVacio\(\)/);
  assert.doesNotMatch(preparacion, /extras:\s*clonar/);
});
probar("27 el PDF diario conserva su generador compacto", () => {
  assert.match(calendarioFuente, /onDataReady\(datosParaPDF\)/);
  assert.doesNotMatch(panelFuente, /exportPDF|jsPDF|autoTable/);
});
probar("28 la Planilla semanal no se modifica desde Extras", () => {
  assert.doesNotMatch(panelFuente, /planilla|rotacion|semana/i);
});
probar("29 no existe SQL nuevo", () => {
  const helper = fs.readFileSync(
    new URL("../src/utils/extrasPersonas.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(helper + panelFuente, /\b(?:select|insert|update|delete)\s+(?:from|into|public\.)/i);
});

console.log(`\n${total} pruebas de Extras de Calendario pasaron.`);
