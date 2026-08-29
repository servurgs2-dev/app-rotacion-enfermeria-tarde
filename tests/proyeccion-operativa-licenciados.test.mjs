import assert from "node:assert/strict";
import {
  resolverPerfilEstructuraLicenciadosDia
} from "../src/utils/dotacionEfectivaLicenciadosDia.js";
import {
  proyectarAsignacionesOperativasLicenciados
} from "../src/utils/proyeccionOperativaLicenciados.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const personaA = { personaId: "A", nombre: "Persona A" };
const personaB = { personaId: "B", nombre: "Persona B" };
const crearBase = () => [
  { filaId: "licenciado.sector.triage_1", sectorId: "triage_1", tipo: "sector", enfermero: { personaId: "C", nombre: "Persona C" } },
  { filaId: "licenciado.sector.estabiliza", sectorId: "estabiliza", tipo: "sector", enfermero: { personaId: "D", nombre: "Persona D" } },
  { filaId: "licenciado.turnante.1", turnanteId: "turnante_1", tipo: "turnante", enfermero: { personaId: "T1", nombre: "Turnante 1" } },
  { filaId: "licenciado.sector.reanimacion", sectorId: "reanimacion", tipo: "sector", enfermero: personaA },
  { filaId: "licenciado.sector.observacion_1", sectorId: "observacion_1", tipo: "sector", enfermero: { personaId: "E", nombre: "Persona E" } },
  { filaId: "licenciado.turnante.3", turnanteId: "turnante_3", tipo: "turnante", enfermero: { personaId: "T3", nombre: "Turnante 3" } },
  { filaId: "licenciado.sector.triage_2", sectorId: "triage_2", tipo: "sector", enfermero: { personaId: "F", nombre: "Persona F" } },
  { filaId: "licenciado.sector.diagnostico", sectorId: "diagnostico", tipo: "sector", enfermero: personaB },
  { filaId: "licenciado.sector.observacion_2", sectorId: "observacion_2", tipo: "sector", enfermero: { personaId: "G", nombre: "Persona G" } },
  { filaId: "licenciado.turnante.2", turnanteId: "turnante_2", tipo: "turnante", enfermero: { personaId: "T2", nombre: "Turnante 2" } },
  { filaId: "licenciado.sector.preinternacion", sectorId: "preinternacion", tipo: "sector", enfermero: { personaId: "H", nombre: "Persona H" } },
  { filaId: "licenciado.sector.salud_mental", sectorId: "salud_mental", tipo: "sector", enfermero: { personaId: "I", nombre: "Persona I" } }
];
const crearPerfil = (dotacionEfectiva, prioridadTurno = ["sillones", "explora"]) =>
  resolverPerfilEstructuraLicenciadosDia({
    personalBase: Array.from({ length: dotacionEfectiva }, (_, indice) => ({
      id: `p-${indice}`,
      categoria: "licenciado"
    })),
    prioridadTurno
  });
const proyectar = (dotacion, prioridad = ["sillones", "explora"], base = crearBase()) =>
  proyectarAsignacionesOperativasLicenciados({
    perfil: crearPerfil(dotacion, prioridad),
    asignacionesBase: base,
    versionEstructura: 2
  });
const porDestino = (resultado, destinoId) =>
  resultado.asignacionesOperativas.find((fila) => fila.destinoId === destinoId);

probar("v1 no aplica", () => {
  const resultado = proyectarAsignacionesOperativasLicenciados({ perfil: crearPerfil(9), asignacionesBase: crearBase(), versionEstructura: 1 });
  assert.equal(resultado.aplicar, false);
  assert.equal(resultado.motivo, "ESTRUCTURA_LICENCIADOS_LEGACY");
});
probar("versión ausente no aplica", () =>
  assert.equal(proyectarAsignacionesOperativasLicenciados({ perfil: crearPerfil(9), asignacionesBase: crearBase() }).aplicar, false));
probar("perfil inválido no aplica y preserva diagnóstico", () => {
  const resultado = proyectar(10, ["explora"]);
  assert.equal(resultado.aplicar, false);
  assert.equal(resultado.diagnostico, "PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA");
});
probar("dotación 8 proyecta estructura combinada v2", () => {
  const resultado = proyectar(8);
  assert.equal(resultado.aplicar, true);
  assert.equal(resultado.delegarEscasez, false);
  assert.deepEqual(
    resultado.asignacionesOperativas.filter((fila) => fila.combinado).map((fila) => fila.destinoId),
    ["reanimacion_sillones", "diagnostico_explora"]
  );
});

probar("9 proyecta Reanimación A al combinado", () =>
  assert.equal(porDestino(proyectar(9), "reanimacion_sillones").enfermero, personaA));
probar("9 proyecta Diagnóstico B al combinado", () =>
  assert.equal(porDestino(proyectar(9), "diagnostico_explora").enfermero, personaB));
probar("9 no genera vacantes dinámicas", () => assert.deepEqual(proyectar(9).vacantesDinamicas, []));

probar("10 Sillones conserva A en Reanimación", () =>
  assert.equal(porDestino(proyectar(10), "reanimacion").enfermero, personaA));
probar("10 Sillones conserva B en Diagnóstico+Explora", () =>
  assert.equal(porDestino(proyectar(10), "diagnostico_explora").enfermero, personaB));
probar("10 Sillones crea vacante estructural", () => {
  const resultado = proyectar(10);
  assert.deepEqual(resultado.vacantesDinamicas, ["sillones"]);
  assert.equal(porDestino(resultado, "sillones").enfermero, null);
  assert.equal(porDestino(resultado, "sillones").requiereCobertura, true);
});

probar("10 Explora conserva A en Reanimación+Sillones", () =>
  assert.equal(porDestino(proyectar(10, ["explora", "sillones"]), "reanimacion_sillones").enfermero, personaA));
probar("10 Explora conserva B en Diagnóstico", () =>
  assert.equal(porDestino(proyectar(10, ["explora", "sillones"]), "diagnostico").enfermero, personaB));
probar("10 Explora crea vacante estructural", () => {
  const resultado = proyectar(10, ["explora", "sillones"]);
  assert.deepEqual(resultado.vacantesDinamicas, ["explora"]);
  assert.equal(porDestino(resultado, "explora").enfermero, null);
});

probar("11 conserva A en Reanimación", () => assert.equal(porDestino(proyectar(11), "reanimacion").enfermero, personaA));
probar("11 conserva B en Diagnóstico", () => assert.equal(porDestino(proyectar(11), "diagnostico").enfermero, personaB));
probar("11 deja Sillones vacante", () => assert.equal(porDestino(proyectar(11), "sillones").enfermero, null));
probar("11 deja Explora vacante", () => assert.equal(porDestino(proyectar(11), "explora").enfermero, null));
probar("12 conserva el contrato operativo de 11", () =>
  assert.deepEqual(proyectar(12).asignacionesOperativas.map((fila) => fila.destinoId || fila.sectorId), proyectar(11).asignacionesOperativas.map((fila) => fila.destinoId || fila.sectorId)));

probar("T1 T2 y T3 no se consumen", () => {
  const resultado = proyectar(11);
  assert.deepEqual(resultado.turnantesDisponibles.map((turnante) => turnante.turnanteId), ["turnante_1", "turnante_3", "turnante_2"]);
  assert.equal(resultado.turnantesDisponibles.every((turnante) => turnante.referencia), true);
});
probar("T3 no se asigna automáticamente a Explora", () => {
  const resultado = proyectar(11);
  assert.equal(porDestino(resultado, "explora").enfermero, null);
  assert.notEqual(resultado.turnantesDisponibles.find((turnante) => turnante.turnanteId === "turnante_3").referencia, null);
});
probar("demás sectores se preservan", () => {
  const resultado = proyectar(11);
  assert.deepEqual(resultado.sectoresBasePreservados, ["triage_1", "estabiliza", "observacion_1", "triage_2", "observacion_2", "preinternacion", "salud_mental"]);
});
probar("identidad A no se duplica", () =>
  assert.equal(proyectar(9).asignacionesOperativas.filter((fila) => fila.enfermero?.personaId === "A").length, 1));
probar("identidad B no se duplica", () =>
  assert.equal(proyectar(11).asignacionesOperativas.filter((fila) => fila.enfermero?.personaId === "B").length, 1));
probar("input no se muta", () => {
  const base = crearBase();
  const antes = JSON.stringify(base);
  proyectar(11, undefined, base);
  assert.equal(JSON.stringify(base), antes);
});
probar("salida es determinista", () =>
  assert.deepEqual(proyectar(10), proyectar(10)));
probar("orden dinámico es estable", () => {
  const relevantes = proyectar(11).asignacionesOperativas
    .map((fila) => fila.destinoId)
    .filter((id) => ["reanimacion", "sillones", "diagnostico", "explora"].includes(id));
  assert.deepEqual(relevantes, ["reanimacion", "sillones", "diagnostico", "explora"]);
});
probar("reanimacion_sillones legacy no se convierte silenciosamente", () => {
  const resultado = proyectar(9, undefined, [{ sectorId: "reanimacion_sillones", enfermero: personaA }]);
  assert.equal(resultado.aplicar, false);
  assert.equal(resultado.motivo, "ASIGNACIONES_BASE_LICENCIADOS_NO_COMPATIBLES_V2");
});
probar("Explora legacy no se convierte silenciosamente", () => {
  const resultado = proyectar(9, undefined, [{ sectorId: "explora", enfermero: personaB }]);
  assert.equal(resultado.aplicar, false);
});

console.log(`proyeccion-operativa-licenciados: ${total} pruebas OK`);
