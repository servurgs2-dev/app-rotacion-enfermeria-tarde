import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { puedeEditarTurno } from "../src/utils/permisos.js";
import {
  aplicarMutacionMensualProtegida,
  evaluarMutacionEstadoMensual,
  puedeMutarEstadoMensual,
  puedeMutarPeriodoMensual
} from "../src/utils/proteccionTemporalMensual.js";

let total = 0;
const probar = async (nombre, prueba) => { await prueba(); total += 1; console.log(`✓ ${nombre}`); };
const referencia = "2026-09";
const temporal = (mes) => puedeMutarPeriodoMensual({ mes, mesReferencia: referencia });
const existente = (mes, opciones = {}) => puedeMutarEstadoMensual({
  mes, mesReferencia: referencia, existeRemoto: true, ...opciones
});
const supervision = { usuario: "supervisor", rol: "supervision", turno: null, activo: true };
const licenciado = { usuario: "licenciado.tarde", rol: "licenciado", turno: "tarde", activo: true };
const enfermeria = { usuario: "enfermeria", rol: "enfermeria", turno: null, activo: true };
const autorizada = (perfil, turno, mes) => puedeEditarTurno(perfil, turno) && existente(mes);

await probar("histórico cerrado bloquea Supervisión", () => assert.equal(autorizada(supervision, "noche", "2026-07"), false));
await probar("histórico cerrado bloquea Licenciado", () => assert.equal(autorizada(licenciado, "tarde", "2026-07"), false));
await probar("Enfermería continúa sin edición", () => assert.equal(autorizada(enfermeria, "tarde", "2026-09"), false));
await probar("mes anterior no se bloquea por tiempo", () => assert.equal(temporal("2026-08"), true));
await probar("mes actual no se bloquea por tiempo", () => assert.equal(temporal("2026-09"), true));
await probar("mes siguiente no se bloquea por tiempo", () => assert.equal(temporal("2026-10"), true));
await probar("futuro R+2 se bloquea", () => assert.equal(temporal("2026-11"), false));
await probar("Licenciado edita su turno en mes anterior existente", () => assert.equal(autorizada(licenciado, "tarde", "2026-08"), true));
await probar("Licenciado no edita otro turno aunque el período sea válido", () => assert.equal(autorizada(licenciado, "noche", "2026-08"), false));
await probar("Supervisión edita mes anterior existente", () => assert.equal(autorizada(supervision, "noche", "2026-08"), true));

await probar("setter histórico no muta", () => {
  const estados = { "tarde|2026-07": { valor: 1 } };
  const salida = aplicarMutacionMensualProtegida({
    estados, clave: "tarde|2026-07",
    autorizacion: evaluarMutacionEstadoMensual({ mes: "2026-07", mesReferencia: referencia, existeRemoto: true }),
    actualizar: () => ({ valor: 2 })
  });
  assert.equal(salida, estados);
});
await probar("setter editable muta sólo su clave", () => {
  const estados = { "tarde|2026-08": { valor: 1 }, "noche|2026-09": { valor: 9 } };
  const salida = aplicarMutacionMensualProtegida({
    estados, clave: "tarde|2026-08",
    autorizacion: evaluarMutacionEstadoMensual({ mes: "2026-08", mesReferencia: referencia, existeRemoto: true }),
    actualizar: () => ({ valor: 2 })
  });
  assert.deepEqual(salida, { "tarde|2026-08": { valor: 2 }, "noche|2026-09": { valor: 9 } });
});
await probar("mes inexistente consultado no admite mutación", () => assert.equal(puedeMutarEstadoMensual({ mes: "2026-09", mesReferencia: referencia, existeRemoto: false }), false));
await probar("mes anterior inexistente no se crea", () => assert.equal(puedeMutarEstadoMensual({ mes: "2026-08", mesReferencia: referencia, existeRemoto: false }), false));
await probar("histórico inexistente permanece bloqueado incluso con creación explícita", () => assert.equal(puedeMutarEstadoMensual({ mes: "2026-06", mesReferencia: referencia, existeRemoto: false, creacionExplicita: true }), false));
await probar("creación explícita del siguiente está autorizada temporalmente", () => assert.equal(puedeMutarEstadoMensual({ mes: "2026-10", mesReferencia: referencia, existeRemoto: false, creacionExplicita: true }), true));
await probar("siguiente preparado conserva escritura", () => assert.equal(existente("2026-10"), true));
await probar("referencia inyectable gobierna protección", () => assert.equal(puedeMutarEstadoMensual({ mes: "1999-12", mesReferencia: "2000-01", existeRemoto: true }), true));
await probar("período inválido se bloquea sin lanzar", () => assert.deepEqual(evaluarMutacionEstadoMensual({ mes: "2026-13", mesReferencia: referencia, existeRemoto: true }), { permitida: false, codigo: "PERIODO_INVALIDO", clasificacion: null }));

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
await probar("App usa la autoridad temporal central", () => assert.match(app, /puedeMutarEstadoMensual/));
await probar("App deriva clasificación e histórico cerrado con helpers", () => {
  assert.match(app, /clasificarPeriodoMes\(\{ mes: mesActivo \}\)/);
  assert.match(app, /esMesHistoricoCerrado\(\{ mes: mesActivo \}\)/);
  assert.doesNotMatch(app, /modoHistorico=\{mesActivo < mesActual\}/);
});
await probar("solo lectura incorpora período fuera de ventana", () => assert.match(app, /const modoSoloLecturaEfectiva =\s*periodoActivoFueraVentana \|\|/));
await probar("autosave, cola y guardado final consultan la frontera", () => {
  assert.ok((app.match(/puedeMutarClaveMensual/g) || []).length >= 7);
  assert.match(app, /const guardarMes[\s\S]*puedeMutarClaveMensual/);
  assert.match(app, /const encolarGuardado[\s\S]*puedeMutarClaveMensual/);
  assert.match(app, /Object\.entries\(estadoPorTurnoMes\)[\s\S]*puedeMutarClaveMensual/);
});
await probar("creación explícita usa autorización de clave", () => {
  assert.match(app, /creacionesMensualesAutorizadasRef\.current\.add\(claveActiva\)/);
  assert.match(app, /creacionesMensualesAutorizadasRef\.current\.delete\(clave\)/);
});
await probar("selector visual consume la lista temporal central", () => {
  assert.match(app, /crearListaMesesNavegables/);
  assert.match(app, /mesReferencia: mesActual/);
});

console.log(`\n${total} pruebas aprobadas`);
