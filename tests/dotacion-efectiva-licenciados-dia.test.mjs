import assert from "node:assert/strict";
import fs from "node:fs";
import {
  resolverDotacionEfectivaLicenciadosDia,
  resolverPerfilEstructuraLicenciadosDia
} from "../src/utils/dotacionEfectivaLicenciadosDia.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const personas = (cantidad, prefijo = "p") => Array.from({ length: cantidad }, (_, indice) => ({
  id: `${prefijo}-${indice + 1}`,
  nombre: `${prefijo.toUpperCase()} ${indice + 1}`,
  categoria: "licenciado"
}));
const perfil = ({
  base,
  extras = [],
  ausentes = [],
  prioridad = ["sillones", "explora"]
}) => resolverPerfilEstructuraLicenciadosDia({
  fecha: "2026-09-20",
  turno: "tarde",
  prioridadTurno: prioridad,
  personalBase: base,
  extras,
  esPersonaUtilizable: (persona) => !ausentes.includes(persona.id)
});

probar("10 nominales y una licencia producen 9 efectivos", () => {
  const resultado = perfil({ base: personas(10), ausentes: ["p-10"] });
  assert.equal(resultado.dotacionEfectiva, 9);
  assert.equal(resultado.modo, "combinados");
});
probar("10 disponibles producen dotación 10", () =>
  assert.equal(perfil({ base: personas(10) }).dotacionEfectiva, 10));
probar("10 base más un Extra adicional producen 11", () => {
  const resultado = perfil({ base: personas(10), extras: personas(1, "extra") });
  assert.equal(resultado.dotacionEfectiva, 11);
  assert.equal(resultado.modo, "separados");
});
probar("una ausencia y un Extra reemplazo producen 10 cuerpos", () => {
  const resultado = perfil({
    base: personas(10),
    extras: personas(1, "extra"),
    ausentes: ["p-10"]
  });
  assert.equal(resultado.dotacionEfectiva, 10);
});
probar("un libre se excluye mediante la fuente de disponibilidad", () =>
  assert.equal(perfil({ base: personas(11), ausentes: ["p-11"] }).dotacionEfectiva, 10));
probar("una certificación se excluye mediante la misma fuente", () =>
  assert.equal(perfil({ base: personas(11), ausentes: ["p-3"] }).dotacionEfectiva, 10));
probar("un No disponible se excluye mediante la misma fuente", () =>
  assert.equal(perfil({ base: personas(11), ausentes: ["p-5"] }).dotacionEfectiva, 10));
probar("base y Extra con mismo ID cuentan una sola vez", () => {
  const base = personas(10);
  const resultado = perfil({ base, extras: [{ ...base[0], esExtra: true }] });
  assert.equal(resultado.dotacionEfectiva, 10);
  assert.equal(resultado.extrasUtilizables.length, 0);
});
probar("identidad legacy por funcionario también evita doble conteo", () => {
  const base = [{ nombre: "Homónimo", funcionario: "123", categoria: "licenciado" }];
  const extra = { nombre: "Otro texto", funcionario: "1 2 3", categoria: "licenciado" };
  assert.equal(perfil({ base, extras: [extra] }).dotacionEfectiva, 1);
});
probar("vigencia excluida del turno origen no entra al universo recibido", () => {
  const padronOrigenFecha = personas(9);
  assert.equal(perfil({ base: padronOrigenFecha }).dotacionEfectiva, 9);
});
probar("vigencia efectiva en destino entra al universo recibido", () => {
  const padronDestinoFecha = personas(9).concat({ id: "transversal", nombre: "Transversal", categoria: "licenciado" });
  assert.equal(perfil({ base: padronDestinoFecha }).dotacionEfectiva, 10);
});
probar("dotación 8 conserva perfil v2 combinado", () => {
  const resultado = perfil({ base: personas(8) });
  assert.equal(resultado.modo, "combinados");
  assert.equal(resultado.resultado.delegarEscasez, false);
  assert.deepEqual(resultado.destinos.map((destino) => destino.id), [
    "reanimacion_sillones",
    "diagnostico_explora"
  ]);
});
probar("prioridad Sillones resuelve separación correspondiente", () =>
  assert.equal(perfil({ base: personas(10), prioridad: ["sillones", "explora"] }).modo, "separa_sillones"));
probar("prioridad Explora resuelve separación correspondiente", () =>
  assert.equal(perfil({ base: personas(10), prioridad: ["explora", "sillones"] }).modo, "separa_explora"));
probar("prioridad legacy incompleta conserva diagnóstico", () => {
  const resultado = perfil({ base: personas(10), prioridad: ["reanimacion_sillones", "explora"] });
  assert.equal(resultado.resultado.ok, false);
  assert.equal(resultado.diagnostico, "PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA");
});
probar("el helper no muta colecciones ni asignaciones ajenas", () => {
  const base = personas(10);
  const extras = personas(1, "extra");
  const asignaciones = [{ nombre: "Explora", enfermero: base[0] }];
  const antes = JSON.stringify({ base, extras, asignaciones });
  perfil({ base, extras });
  assert.equal(JSON.stringify({ base, extras, asignaciones }), antes);
});
probar("resultado separa base disponible de Extras utilizables", () => {
  const resultado = resolverDotacionEfectivaLicenciadosDia({
    personalBase: personas(2),
    extras: personas(1, "extra")
  });
  assert.equal(resultado.personasBaseDisponibles.length, 2);
  assert.equal(resultado.extrasUtilizables.length, 1);
  assert.equal(resultado.identidadesOperativas.length, 3);
});
probar("Enfermeros no contaminan la dotación de Licenciados", () => {
  const base = personas(9).concat({ id: "e-1", nombre: "Enfermero", categoria: "enfermero" });
  assert.equal(perfil({ base }).dotacionEfectiva, 9);
});
probar("Calendario integra el perfil sólo en una referencia shadow", () => {
  const fuente = fs.readFileSync(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8");
  assert.match(fuente, /perfilEstructuraLicenciadosDiaRef\.current/);
  assert.match(fuente, /esPersonaUtilizable: \(persona\) => !estaAusente\(persona\)/);
  assert.equal(fuente.includes("estructuraLicenciadosVersion = 2"), false);
});

console.log(`dotacion-efectiva-licenciados-dia: ${total} pruebas OK`);
