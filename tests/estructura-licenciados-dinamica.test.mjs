import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CATALOGO_DESTINOS_OPERATIVOS_LICENCIADOS_V2,
  CODIGO_PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA,
  FILAS_PLANILLA_LICENCIADOS_V2,
  TRANSICION_FILAS_LICENCIADOS_V1_A_V2,
  TRANSICION_TURNANTES_ADICIONALES_LICENCIADOS_V1_A_V2,
  resolverEstructuraOperativaLicenciadosDia,
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA,
  VERSION_ESTRUCTURA_LICENCIADOS_LEGACY
} from "../src/utils/estructuraLicenciadosDinamica.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const resolver = (dotacionEfectiva, prioridadTurno = ["sillones", "explora"]) =>
  resolverEstructuraOperativaLicenciadosDia({ dotacionEfectiva, prioridadTurno });
const ids = (resultado) => resultado.destinos.map((destino) => destino.id);

probar("versión ausente es legacy", () =>
  assert.equal(resolverVersionEstructuraLicenciados({}), VERSION_ESTRUCTURA_LICENCIADOS_LEGACY));
probar("versión 1 es legacy", () =>
  assert.equal(resolverVersionEstructuraLicenciados(1), VERSION_ESTRUCTURA_LICENCIADOS_LEGACY));
probar("versión 2 activa dinámica", () =>
  assert.equal(resolverVersionEstructuraLicenciados({ estructuraLicenciadosVersion: 2 }), VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA));
probar("versión desconocida no activa v2", () =>
  assert.equal(resolverVersionEstructuraLicenciados(99), VERSION_ESTRUCTURA_LICENCIADOS_LEGACY));

probar("perfil v2 tiene doce filas", () => assert.equal(FILAS_PLANILLA_LICENCIADOS_V2.length, 12));
probar("Reanimación existe como sector base", () =>
  assert.equal(FILAS_PLANILLA_LICENCIADOS_V2.some((fila) => fila.tipo === "sector" && fila.sectorId === "reanimacion"), true));
probar("fila combinada no existe en v2", () =>
  assert.equal(FILAS_PLANILLA_LICENCIADOS_V2.some((fila) => fila.sectorId === "reanimacion_sillones"), false));
probar("Explora no existe como fila base", () =>
  assert.equal(FILAS_PLANILLA_LICENCIADOS_V2.some((fila) => fila.sectorId === "explora"), false));
probar("T3 es Turnante base", () =>
  assert.equal(FILAS_PLANILLA_LICENCIADOS_V2.some((fila) => fila.tipo === "turnante" && fila.turnanteId === "turnante_3"), true));
probar("T3 no tiene sectorId Explora", () => {
  const t3 = FILAS_PLANILLA_LICENCIADOS_V2.find((fila) => fila.turnanteId === "turnante_3");
  assert.equal(t3.sectorId, null);
});
probar("transición futura mapea distribución Explora a T3 y adicional T3 a T4", () => {
  assert.equal(TRANSICION_FILAS_LICENCIADOS_V1_A_V2.explora, "turnante_3");
  assert.equal(TRANSICION_TURNANTES_ADICIONALES_LICENCIADOS_V1_A_V2.turnante_3, "turnante_4");
});
probar("T1 T2 y T3 tienen IDs distintos", () =>
  assert.deepEqual(FILAS_PLANILLA_LICENCIADOS_V2.filter((fila) => fila.tipo === "turnante").map((fila) => fila.turnanteId).sort(), ["turnante_1", "turnante_2", "turnante_3"]));
probar("Diagnóstico permanece como sector", () =>
  assert.equal(FILAS_PLANILLA_LICENCIADOS_V2.some((fila) => fila.tipo === "sector" && fila.sectorId === "diagnostico"), true));

for (const id of ["reanimacion", "sillones", "diagnostico", "explora", "reanimacion_sillones", "diagnostico_explora"]) {
  probar(`catálogo contiene ${id}`, () => assert.equal(CATALOGO_DESTINOS_OPERATIVOS_LICENCIADOS_V2[id].id, id));
}

probar("dotación 9 produce dos combinados", () => {
  const resultado = resolver(9);
  assert.equal(resultado.modo, "combinados");
  assert.deepEqual(ids(resultado), ["reanimacion_sillones", "diagnostico_explora"]);
});
probar("dotación 9 no abre Sillones", () => assert.equal(ids(resolver(9)).includes("sillones"), false));
probar("dotación 9 no abre Explora", () => assert.equal(ids(resolver(9)).includes("explora"), false));

probar("dotación 10 separa sólo Sillones cuando tiene prioridad", () => {
  const resultado = resolver(10, ["sillones", "explora"]);
  assert.equal(resultado.modo, "separa_sillones");
  assert.deepEqual(ids(resultado), ["reanimacion", "sillones", "diagnostico_explora"]);
});
probar("dotación 10 separa sólo Explora cuando tiene prioridad", () => {
  const resultado = resolver(10, ["explora", "sillones"]);
  assert.equal(resultado.modo, "separa_explora");
  assert.deepEqual(ids(resultado), ["reanimacion_sillones", "diagnostico", "explora"]);
});
probar("invertir prioridad invierte separación", () =>
  assert.notEqual(resolver(10, ["sillones", "explora"]).modo, resolver(10, ["explora", "sillones"]).modo));
probar("prioridad sin Sillones falla conservadoramente", () =>
  assert.equal(resolver(10, ["explora"]).codigo, CODIGO_PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA));
probar("prioridad sin Explora falla conservadoramente", () =>
  assert.equal(resolver(10, ["sillones"]).codigo, CODIGO_PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA));
probar("prioridad duplicada falla conservadoramente", () =>
  assert.equal(resolver(10, ["sillones", "explora", "sillones"]).codigo, CODIGO_PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA));

probar("dotación 11 abre cuatro individuales", () =>
  assert.deepEqual(ids(resolver(11)), ["reanimacion", "sillones", "diagnostico", "explora"]));
probar("dotación 12 conserva estructura de 11", () =>
  assert.deepEqual(ids(resolver(12)), ids(resolver(11))));
for (const dotacion of [8, 7, 6]) {
  probar(`dotación ${dotacion} conserva ambos combinados v2`, () => {
    const resultado = resolver(dotacion);
    assert.equal(resultado.modo, "combinados");
    assert.equal(resultado.delegarEscasez, false);
    assert.deepEqual(ids(resultado), ["reanimacion_sillones", "diagnostico_explora"]);
  });
}

probar("el resolutor nunca asigna personas", () => {
  const texto = JSON.stringify(resolver(11));
  assert.equal(/persona|funcionario/i.test(texto), false);
});
probar("el dominio no contiene nombres de funcionarios", () => {
  const fuente = fs.readFileSync(new URL("../src/utils/estructuraLicenciadosDinamica.js", import.meta.url), "utf8");
  assert.equal(/nombreFuncionario|personaId/.test(fuente), false);
});
probar("no reutiliza IDs de Enfermeros", () => {
  const texto = JSON.stringify({ filas: FILAS_PLANILLA_LICENCIADOS_V2, catalogo: CATALOGO_DESTINOS_OPERATIVOS_LICENCIADOS_V2 });
  assert.equal(/rea_1|sillon_1/.test(texto), false);
});
probar("T3 nunca es alias de Explora", () => {
  const t3 = FILAS_PLANILLA_LICENCIADOS_V2.find((fila) => fila.turnanteId === "turnante_3");
  assert.notEqual(t3.etiqueta, "Explora");
  assert.notEqual(t3.filaId, "licenciado.sector.explora");
});

probar("dotación 9 no demanda cuerpo adicional", () => assert.deepEqual(resolver(9).demandaAdicional, []));
probar("dotación 10 Sillones demanda Sillones", () => assert.deepEqual(resolver(10, ["sillones", "explora"]).demandaAdicional, ["sillones"]));
probar("dotación 10 Explora demanda Explora", () => assert.deepEqual(resolver(10, ["explora", "sillones"]).demandaAdicional, ["explora"]));
probar("dotación 11 demanda Sillones y Explora", () => assert.deepEqual(resolver(11).demandaAdicional, ["sillones", "explora"]));

console.log(`estructura-licenciados-dinamica: ${total} pruebas OK`);
