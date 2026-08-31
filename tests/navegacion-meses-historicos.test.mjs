import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  crearListaMesesNavegables,
  existeMesParaTurno,
  formatearMesHumano,
  obtenerIndicadorPeriodo,
  obtenerMesAdyacenteNavegable
} from "../src/utils/navegacionMensual.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(raiz, "src/App.jsx"), "utf8");
const componente = fs.readFileSync(
  path.join(raiz, "src/components/mes/NavegadorMeses.jsx"),
  "utf8"
);
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const lista = crearListaMesesNavegables({
  mesReferencia: "2026-09",
  mesesExistentes: [
    { mes: "2026-06", turnos: ["tarde"] },
    { mes: "2026-07", turnos: ["tarde"] },
    { mes: "2026-09", turnos: ["manana", "tarde"] },
    { mes: "2026-11", turnos: ["noche"] },
    { mes: "2026-07", turnos: ["tarde"] }
  ]
});
const meses = lista.map(({ mes }) => mes);

probar("incluye R-1", () => assert.ok(meses.includes("2026-08")));
probar("incluye R", () => assert.ok(meses.includes("2026-09")));
probar("incluye R+1", () => assert.ok(meses.includes("2026-10")));
probar("incluye R-2 si existe", () => assert.ok(meses.includes("2026-07")));
probar("incluye histórico más antiguo sólo si existe", () => assert.ok(meses.includes("2026-06")));
probar("no inventa R-3 inexistente", () => assert.ok(!meses.includes("2026-05")));
probar("no incluye R+2 aunque exista", () => assert.ok(!meses.includes("2026-11")));
probar("deduplica meses", () => assert.equal(new Set(meses).size, meses.length));
probar("ordena cronológicamente", () => assert.deepEqual(meses, [...meses].sort()));
probar("flecha anterior usa la lista", () => assert.equal(obtenerMesAdyacenteNavegable({
  lista, mesActivo: "2026-09", direccion: -1
}), "2026-08"));
probar("flecha siguiente usa la lista", () => assert.equal(obtenerMesAdyacenteNavegable({
  lista, mesActivo: "2026-09", direccion: 1
}), "2026-10"));
probar("siguiente se detiene en R+1", () => assert.equal(obtenerMesAdyacenteNavegable({
  lista, mesActivo: "2026-10", direccion: 1
}), null));
probar("anterior se detiene en el histórico conocido", () => assert.equal(obtenerMesAdyacenteNavegable({
  lista, mesActivo: "2026-06", direccion: -1
}), null));
probar("cambio de año conserva anterior actual y siguiente", () => assert.deepEqual(
  crearListaMesesNavegables({ mesReferencia: "2026-01" }).map(({ mes }) => mes),
  ["2025-12", "2026-01", "2026-02"]
));
probar("formatea nombre humano", () => assert.equal(formatearMesHumano("2026-10"), "Octubre de 2026"));
probar("histórico indica Sólo lectura", () => assert.equal(
  obtenerIndicadorPeriodo(lista.find(({ mes }) => mes === "2026-07").clasificacion),
  "Sólo lectura"
));
probar("R-1 no se etiqueta como histórico", () => assert.equal(
  obtenerIndicadorPeriodo(lista.find(({ mes }) => mes === "2026-08").clasificacion),
  ""
));
probar("actual tiene indicador", () => assert.equal(
  obtenerIndicadorPeriodo(lista.find(({ mes }) => mes === "2026-09").clasificacion),
  "Actual"
));
probar("siguiente tiene indicador", () => assert.equal(
  obtenerIndicadorPeriodo(lista.find(({ mes }) => mes === "2026-10").clasificacion),
  "Siguiente"
));
probar("existencia global no implica existencia en Noche", () => {
  assert.equal(lista.find(({ mes }) => mes === "2026-07").existeGlobalmente, true);
  assert.equal(existeMesParaTurno({ lista, mes: "2026-07", turno: "noche" }), false);
});
probar("Julio sí existe para Tarde", () => assert.equal(
  existeMesParaTurno({ lista, mes: "2026-07", turno: "tarde" }), true
));
probar("control tiene objetivos táctiles", () => assert.match(componente, /min-h-11[\s\S]*min-w-11/));
probar("flechas tienen nombres accesibles", () => {
  assert.match(componente, /aria-label="Mes anterior"/);
  assert.match(componente, /aria-label="Mes siguiente"/);
});
probar("selector central tiene nombre accesible", () => assert.match(componente, /aria-label="Seleccionar mes"/));
probar("estado no depende sólo del color", () => assert.match(componente, /obtenerIndicadorPeriodo/));
probar("App descubre meses una sola vez", () => {
  assert.match(app, /listarMesesExistentes\(\)/);
  assert.match(app, /\}, \[\]\);/);
});
probar("App mantiene mes al cambiar turno", () => {
  const bloque = app.slice(app.indexOf("const cambiarTurno"), app.indexOf("const cerrarSesion"));
  assert.doesNotMatch(bloque, /setMesActivo/);
});
probar("App ajusta la fecha al último día válido", () => {
  assert.match(app, /ultimoDiaDelNuevoMes/);
  assert.match(app, /Math\.min\(fecha\.getDate\(\), ultimoDiaDelNuevoMes\)/);
});
probar("App muestra estado sin información sin crear datos", () => {
  assert.match(app, /No hay información registrada para este mes en este turno/);
  assert.match(app, /mesActivoSinInformacion/);
});
probar("App muestra banner histórico accesible", () => assert.match(app, /Mes histórico · Sólo lectura/));
probar("Inicio vuelve al período y fecha actuales", () => {
  assert.match(app, /nuevaVista === "inicio"/);
  assert.match(app, /seleccionarMesNavegable\(mesActual, \{ usarFechaActual: true \}\)/);
});
probar("Inicio no ofrece selector histórico", () => assert.match(app,
  /vistaActiva === "inicio" \? \([\s\S]*Período actual[\s\S]*\) : \([\s\S]*<NavegadorMeses/));
probar("App no conserva type month ni alerta antigua", () => {
  assert.doesNotMatch(app, /type="month"/);
  assert.doesNotMatch(app, /Solo podés usar el mes actual o el siguiente/);
});

console.log(`\n${total} pruebas de navegación mensual histórica aprobadas.`);
