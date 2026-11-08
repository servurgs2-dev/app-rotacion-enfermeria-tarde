import assert from "node:assert/strict";
import test from "node:test";
import { resolverDistribucionDiaria } from "../src/utils/resolverDistribucionDiaria.js";

const persona = (id, nombre) => ({ id, nombre, categoria: "enfermero" });
const ana = persona("ana", "Ana Díaz");
const pedro = persona("pedro", "Pedro Rodríguez");
const santiago = persona("santiago", "Santiago Aramburu");

const base = () => [
  { nombre: "REA 1", sectorId: "rea_1", tipo: "sector", enfermero: ana },
  { nombre: "REA 2", sectorId: "rea_2", tipo: "sector", enfermero: pedro },
  { nombre: "SILLÓN 1", sectorId: "sillon_1", tipo: "sector", enfermero: santiago }
];

const reglasParejas = {
  distribucionBase: {
    "REA 1": ana,
    "REA 2": pedro,
    "SILLÓN 1": santiago
  },
  categoria: "enfermero"
};

const porSector = (resultado, sectorId) =>
  resultado.asignaciones.find((fila) => fila.sectorId === sectorId);

test("sin Extra vinculado, la ausencia de REA 1 dispara REA 2 → REA 1", () => {
  const resultado = resolverDistribucionDiaria({
    asignacionBase: base(),
    personalEfectivo: [ana, pedro, santiago],
    esPersonaDisponible: (actual) => actual.id !== ana.id,
    esPersonaDisponibleParaCobertura: (actual) => actual.id !== ana.id,
    reglasParejas
  });

  assert.equal(porSector(resultado, "rea_1").enfermero.id, pedro.id);
  assert.equal(porSector(resultado, "rea_2").enfermero, null);
});

test("Extra desde Libre vinculado no oculta la vacante antes de aplicar parejas", () => {
  const extraVinculado = {
    ...santiago,
    personaId: santiago.id,
    esExtra: true,
    origenExtra: "libre",
    motivoLibre: "cobertura_companero",
    tipoExtra: "cobertura",
    personaCubiertaId: ana.id,
    personaCubiertaNombre: ana.nombre,
    sectorCubiertoNombre: "REA 1"
  };
  const antes = structuredClone(extraVinculado);
  const resultado = resolverDistribucionDiaria({
    asignacionBase: base(),
    personalEfectivo: [ana, pedro, santiago],
    extras: [extraVinculado],
    esPersonaDisponible: (actual) => actual.id !== ana.id,
    // El vínculo especial permite evaluar a Ana para cobertura, pero no debe
    // convertir la relación nominal en ocupación física de REA 1.
    esPersonaDisponibleParaCobertura: () => true,
    reglasParejas
  });

  const rea1 = porSector(resultado, "rea_1");
  const rea2 = porSector(resultado, "rea_2");
  const sillon1 = porSector(resultado, "sillon_1");
  assert.equal(rea1.enfermero.id, pedro.id);
  assert.equal(rea1.coberturaDesdePareja, "REA 2");
  assert.equal(rea1.coberturaExtra, undefined);
  assert.equal(rea2.enfermero, null);
  assert.equal(rea2.cedidoAPareja, "REA 1");
  assert.equal(sillon1.enfermero.id, santiago.id);
  assert.equal(
    resultado.asignaciones.filter((fila) => fila.enfermero?.id === santiago.id).length,
    1
  );
  assert.deepEqual(extraVinculado, antes);
  assert.equal(extraVinculado.personaCubiertaId, ana.id);
});

test("la vacante derivada de REA 2 continúa por la reposición normal", () => {
  const turnante = persona("turnante", "Turnante disponible");
  const extraVinculado = {
    ...santiago,
    personaId: santiago.id,
    esExtra: true,
    origenExtra: "libre",
    motivoLibre: "cobertura_companero",
    tipoExtra: "cobertura",
    personaCubiertaId: ana.id,
    personaCubiertaNombre: ana.nombre,
    sectorCubiertoNombre: "REA 1"
  };
  const resultado = resolverDistribucionDiaria({
    asignacionBase: [
      ...base(),
      { nombre: "T1", turnanteId: "turnante_1", tipo: "turnante", enfermero: turnante }
    ],
    personalEfectivo: [ana, pedro, santiago, turnante],
    extras: [extraVinculado],
    esPersonaDisponible: (actual) => actual.id !== ana.id,
    esPersonaDisponibleParaCobertura: () => true,
    reglasParejas
  });

  assert.equal(porSector(resultado, "rea_1").enfermero.id, pedro.id);
  assert.equal(porSector(resultado, "rea_2").enfermero.id, turnante.id);
  assert.equal(
    resultado.asignaciones.filter((fila) => fila.enfermero?.id === turnante.id).length,
    1
  );
});
