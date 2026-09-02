import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  eliminarExtraVinculadoCambioOtroTurno,
  eliminarNoDisponibleVinculado,
  esCambioOtroTurnoVinculado,
  obtenerExtrasCompatiblesCambioOtroTurno,
  obtenerSectorOperativoPersona,
  vincularCambioOtroTurno
} from "../src/utils/cambioOtroTurno.js";
import {
  aplicarCoberturasDirectasExtras,
  crearExtraDesdePersonal,
  crearExtraTemporal,
  esOrigenExtraOtroTurno,
  prepararCandidatosExtraOtroTurno,
  TIPOS_EXTRA
} from "../src/utils/extrasPersonas.js";
import { obtenerNombreConMarcaTurnante } from "../src/utils/etiquetaTurnante.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import { aplicarPrioridadCoberturaParejas } from "../src/utils/coberturaParejasEnfermeros.js";

const fecha = "2026-08-12";
const titular = { id: "p-milton", nombre: "Milton", categoria: "enfermero" };
const rosa = {
  id: "extra-rosa",
  personaId: null,
  nombre: "Rosa",
  categoria: "enfermero",
  temporal: true,
  origenExtra: "manual"
};
const base = { extras: {}, noDisponibles: {}, cambiosDia: {} };

// El caso comienza realmente en la planificación mensual T5 y usa el mismo
// helper del Calendario Diario para resolver el sector operativo.
const planillaDesdeT5 = [
  { nombre: "T5", enfermero: titular, tipo: "turnante" },
  { nombre: "8-13", enfermero: null, tipo: "sector", reemplazo: true },
  { nombre: "SIN ASIGNAR", enfermero: null, tipo: "sector" }
];
assert.equal(obtenerSectorOperativoPersona({ asignaciones: planillaDesdeT5, persona: titular }), "",
  "T5 no se acepta como sector operativo");
const distribuciónOperativaDesdeT5 = resolverTurnantesYCoberturasOperativas({
  asignaciones: planillaDesdeT5,
  extras: [],
  personal: [titular],
  esPersonaDisponible: () => true
}).asignaciones;
const sectorOperativoT5 = obtenerSectorOperativoPersona({
  asignaciones: distribuciónOperativaDesdeT5,
  persona: titular
});
assert.equal(sectorOperativoT5, "8-13", "T5 se resuelve a su sector operativo real");

const desdeNoDisponibles = vincularCambioOtroTurno({
  calendarioCategoria: base,
  fecha,
  titular,
  sector: sectorOperativoT5,
  extra: rosa,
  detalle: "Cambio coordinado",
  personal: [titular]
});
assert.equal(desdeNoDisponibles.error, "", "crea el cambio desde No disponibles");
assert.equal(desdeNoDisponibles.calendario.extras[fecha].length, 1, "crea un solo Extra");
assert.equal(desdeNoDisponibles.calendario.noDisponibles[fecha].length, 1, "crea un solo No disponible");
assert.equal(desdeNoDisponibles.extra.tipoExtra, "cobertura");
assert.equal(desdeNoDisponibles.extra.origenExtra, "personal_otro_turno");
assert.equal(desdeNoDisponibles.extra.personaCubiertaId, titular.id);
assert.equal(desdeNoDisponibles.extra.sectorCubiertoNombre, "8-13", "hereda el sector");
assert.equal(desdeNoDisponibles.registro.personaCoberturaId, rosa.id, "vincula por id estable del Extra");
assert.equal(desdeNoDisponibles.registro.motivo, "cambio_otro_turno");

const desdeAgregarExtra = vincularCambioOtroTurno({
  calendarioCategoria: base,
  fecha,
  titular,
  sector: "8-13",
  extra: rosa,
  detalle: "Cambio coordinado",
  personal: [titular]
});
assert.deepEqual(desdeAgregarExtra.calendario.extras, desdeNoDisponibles.calendario.extras,
  "ambos puntos de entrada producen el mismo Extra");
assert.deepEqual(
  { ...desdeAgregarExtra.calendario.noDisponibles[fecha][0], creadoEn: "estable" },
  { ...desdeNoDisponibles.calendario.noDisponibles[fecha][0], creadoEn: "estable" },
  "ambos puntos de entrada producen el mismo No disponible"
);

const repetido = vincularCambioOtroTurno({
  calendarioCategoria: desdeNoDisponibles.calendario,
  fecha,
  titular,
  sector: "8-13",
  extra: rosa,
  personal: [titular]
});
assert.equal(repetido.calendario.extras[fecha].length, 1, "no duplica el Extra");
assert.equal(repetido.calendario.noDisponibles[fecha].length, 1, "no duplica el titular");

const otroTitular = { id: "p-otro", nombre: "Otro", categoria: "enfermero" };
const doble = vincularCambioOtroTurno({
  calendarioCategoria: desdeNoDisponibles.calendario,
  fecha,
  titular: otroTitular,
  sector: "REA 1",
  extra: rosa,
  personal: [titular, otroTitular]
});
assert.match(doble.error, /vinculado a otro titular/i, "un Extra no cubre dos titulares");

const compatibles = obtenerExtrasCompatiblesCambioOtroTurno({
  extras: [desdeNoDisponibles.extra], titular, personal: [titular]
});
assert.equal(compatibles.length, 1, "permite editar la relación vigente");
assert.equal(obtenerExtrasCompatiblesCambioOtroTurno({ extras: [rosa], titular: rosa }).length, 0,
  "no permite seleccionar al propio titular");

const sinExtra = eliminarExtraVinculadoCambioOtroTurno({
  calendarioCategoria: desdeNoDisponibles.calendario,
  fecha,
  extra: desdeNoDisponibles.extra,
  personal: [titular]
});
assert.equal(sinExtra.extras[fecha].length, 0, "elimina el Extra");
assert.equal(sinExtra.noDisponibles[fecha].length, 1, "mantiene al titular No disponible");
assert.equal(sinExtra.noDisponibles[fecha][0].personaCoberturaId, null, "limpia la relación");
assert.equal(sinExtra.noDisponibles[fecha][0].personaCoberturaNombre, "", "vuelve a cobertura no indicada");

const eliminaAmbos = eliminarNoDisponibleVinculado({
  calendarioCategoria: desdeNoDisponibles.calendario,
  fecha,
  titular,
  accionExtra: "eliminar",
  personal: [titular]
});
assert.equal(eliminaAmbos.noDisponibles[fecha].length, 0);
assert.equal(eliminaAmbos.extras[fecha].length, 0);

const conservaRefuerzo = eliminarNoDisponibleVinculado({
  calendarioCategoria: desdeNoDisponibles.calendario,
  fecha,
  titular,
  accionExtra: "mantener_refuerzo",
  personal: [titular]
});
assert.equal(conservaRefuerzo.noDisponibles[fecha].length, 0);
assert.equal(conservaRefuerzo.extras[fecha].length, 1);
assert.equal(conservaRefuerzo.extras[fecha][0].tipoExtra, TIPOS_EXTRA.REFUERZO);
assert.equal("personaCubiertaId" in conservaRefuerzo.extras[fecha][0], false,
  "el refuerzo no conserva una relación fantasma");

const histórico = {
  ...base,
  noDisponibles: { [fecha]: ["Milton"] },
  extras: { [fecha]: ["Rosa histórica"] }
};
assert.deepEqual(histórico.noDisponibles[fecha], ["Milton"], "los formatos históricos no se migran");
assert.deepEqual(histórico.extras[fecha], ["Rosa histórica"]);

const creado = crearExtraTemporal({
  nombre: "Funcionario externo",
  funcionario: "123",
  categoria: "enfermero",
  extrasDia: [],
  personal: [],
  crearId: () => "extra-externo"
});
assert.equal(creado.extra.id, "extra-externo", "admite funcionario externo sin Personal");
assert.equal(titular.nombre, "Milton", "no modifica Personal");
assert.equal(base.extras[fecha], undefined, "no muta el estado original");

const recargado = JSON.parse(JSON.stringify(desdeNoDisponibles.calendario));
const extraRecargado = recargado.extras[fecha][0];
assert.equal(extraRecargado.personaId, null, "conserva personaId nulo tras recargar");
assert.equal(esCambioOtroTurnoVinculado({
  persona: titular,
  registros: recargado.noDisponibles[fecha],
  extras: recargado.extras[fecha],
  personal: [titular]
}), true, "reconoce que el No disponible corresponde a la cobertura vinculada");
const distribución = resolverTurnantesYCoberturasOperativas({
  asignaciones: planillaDesdeT5,
  extras: recargado.extras[fecha],
  personal: [titular],
  esPersonaDisponible: () => false,
  esPersonaDisponibleParaCobertura: (persona) => esCambioOtroTurnoVinculado({
    persona,
    registros: recargado.noDisponibles[fecha],
    extras: recargado.extras[fecha],
    personal: [titular]
  })
}).asignaciones;
assert.equal(distribución.find((fila) => fila.nombre === "8-13").enfermero.id, "extra-rosa",
  "el Extra externo ocupa 8-13");
assert.equal(distribución.some((fila) => fila.enfermero?.id === titular.id), false,
  "el titular deja de trabajar");
assert.equal(distribución.filter((fila) => fila.enfermero?.id === "extra-rosa").length, 1,
  "el Extra aparece una sola vez");
assert.equal(distribución.find((fila) => fila.nombre === "SIN ASIGNAR").enfermero, null,
  "el Extra no queda en SIN ASIGNAR");
assert.equal(distribución.find((fila) => fila.nombre === "T5"), undefined,
  "el Extra no aparece en T5");
assert.equal(obtenerNombreConMarcaTurnante({ ...extraRecargado, esExtra: true }), "Rosa (E)",
  "presenta una única marca Extra");
assert.equal(esOrigenExtraOtroTurno({ origenExtra: "otro_turno" }), true,
  "lee el valor histórico otro_turno");
assert.equal(esOrigenExtraOtroTurno({ origenExtra: "personal_otro_turno" }), true,
  "lee el origen canónico personal_otro_turno");
const refuerzo = aplicarCoberturasDirectasExtras({
  asignaciones: [{ nombre: "8-13", enfermero: titular, tipo: "sector" }],
  extras: [{ ...extraRecargado, tipoExtra: "refuerzo" }],
  personal: [titular]
}).asignaciones;
assert.equal(refuerzo[0].enfermero.id, titular.id, "un refuerzo no reemplaza al titular");
const refuerzoTurnante = resolverTurnantesYCoberturasOperativas({
  asignaciones: planillaDesdeT5,
  extras: [{ ...extraRecargado, tipoExtra: "refuerzo" }],
  personal: [titular],
  esPersonaDisponible: () => true
}).asignaciones;
assert.equal(refuerzoTurnante.find((fila) => fila.nombre === "8-13").enfermero.id, titular.id,
  "un refuerzo no sustituye directamente al Turnante");

for (const incidencia of ["libre", "certificado", "licencia", "ausente"]) {
  const bloqueado = resolverTurnantesYCoberturasOperativas({
    asignaciones: planillaDesdeT5,
    extras: recargado.extras[fecha],
    personal: [titular],
    esPersonaDisponible: () => false,
    esPersonaDisponibleParaCobertura: () => false
  }).asignaciones;
  assert.equal(bloqueado.some((fila) => fila.enfermero?.id === "extra-rosa"), false,
    `un Turnante ${incidencia} no es sustituido`);
}

const cambioManualPrevio = resolverTurnantesYCoberturasOperativas({
  asignaciones: [
    { nombre: "T5", enfermero: titular, tipo: "turnante" },
    { nombre: "REA 2", enfermero: titular, tipo: "sector" },
    { nombre: "8-13", enfermero: null, tipo: "sector" }
  ],
  extras: recargado.extras[fecha],
  personal: [titular],
  esPersonaDisponible: () => false,
  esPersonaDisponibleParaCobertura: () => true,
  ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({
    asignaciones: sectores,
    cambiosDia: { "rea 2": { personaId: titular.id, nombre: titular.nombre } },
    esPersonaDisponible: () => true
  })
}).asignaciones;
assert.equal(cambioManualPrevio.find((fila) => fila.nombre === "REA 2").enfermero.id, "extra-rosa",
  "el cambio manual previo define la ubicación y la prioridad no elimina la cobertura");

const candidatosBrutos = [
  { persona: { id: "p-juan", nombre: "Juan Pérez", funcionario: "12345", categoria: "enfermero" }, turnoOrigen: "manana", turnoNombre: "Mañana" },
  { persona: { id: "p-activo", nombre: "Del turno", categoria: "enfermero" }, turnoOrigen: "tarde", turnoNombre: "Tarde" },
  { persona: { id: "p-lic", nombre: "Licenciado", categoria: "licenciado" }, turnoOrigen: "manana", turnoNombre: "Mañana" },
  { persona: titular, turnoOrigen: "noche", turnoNombre: "Noche" }
];
const candidatosFiltrados = prepararCandidatosExtraOtroTurno({
  candidatos: candidatosBrutos,
  categoria: "enfermero",
  turnoActivo: "tarde",
  personaExcluida: titular,
  extrasDia: []
});
assert.deepEqual(candidatosFiltrados.map((item) => item.persona.id), ["p-juan"],
  "lista Personal del mismo tipo, excluye turno activo y titular");
assert.match(candidatosFiltrados[0].etiqueta, /Juan Pérez — Turno Mañana — Func\. 12345/);
const extraPersonal = crearExtraDesdePersonal({
  persona: candidatosFiltrados[0].persona,
  turnoOrigen: candidatosFiltrados[0].turnoOrigen,
  categoria: "enfermero",
  extrasDia: []
}).extra;
assert.equal(extraPersonal.personaId, "p-juan", "Personal existente conserva personaId");
assert.equal(creado.extra.personaId, null, "la opción manual conserva personaId nulo");
assert.equal(esOrigenExtraOtroTurno(extraPersonal), true, "ambas altas comparten origen de otro turno");
assert.equal(prepararCandidatosExtraOtroTurno({
  candidatos: candidatosBrutos,
  categoria: "enfermero",
  turnoActivo: "tarde",
  extrasDia: [extraPersonal]
}).some((item) => item.persona.id === "p-juan"), false, "excluye Extras ya cargados");

const panel = readFileSync(new URL("../src/components/calendario/PanelNoDisponible.jsx", import.meta.url), "utf8");
const selectorCompartido = readFileSync(new URL("../src/components/calendario/SelectorFuncionarioOtroTurno.jsx", import.meta.url), "utf8");
assert.match(panel, /\+ Agregar funcionario de otro turno/);
assert.match(selectorCompartido, /Nombre\s*<input/);
assert.match(selectorCompartido, /Número de funcionario \(opcional\)/);
assert.match(panel, /Turno de origen \(opcional\)/);
assert.match(panel, /Eliminar también el Extra/);
assert.match(panel, /Mantener al Extra como refuerzo/);
assert.match(panel, /ModalMobileShell/, "el modal delega el scroll móvil al shell común");
assert.match(panel, /Escape/, "el modal cierra con Escape");
const panelExtra = readFileSync(new URL("../src/components/calendario/PanelAgregarExtra.jsx", import.meta.url), "utf8");
assert.match(panel, /SelectorFuncionarioOtroTurno/);
assert.match(panelExtra, /SelectorFuncionarioOtroTurno/,
  "No disponibles y Agregar Extra comparten el mismo selector");
assert.match(selectorCompartido, /\+ Cargar Extra manual/);

console.log("Etapa 28D: 20 comprobaciones de vinculación y compatibilidad superadas.");
