import assert from "node:assert/strict";
import fs from "node:fs";
import { resumirEstadisticasSupervisionMes } from "../src/utils/estadisticasSupervisionMes.js";

let total = 0;
const probar = (nombre, fn) => { fn(); total += 1; console.log(`OK ${total} ${nombre}`); };
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const TURNOS = ["noche", "manana", "tarde", "vespertino"];
const CATEGORIAS = ["licenciado", "enfermero"];

const crearCategoria = ({ cantidad = 12, base = 13, estado = "optimo", deficit = 0, disponible = true } = {}) =>
  disponible ? {
    disponible: true,
    proyeccion: {
      dotacionPrevistaOperativa: { cantidad },
      previstosBase: { cantidad: base }
    },
    umbral: { minimo: cantidad + deficit, optimo: cantidad + deficit + 2 },
    estadoDotacion: { estado, faltanParaMinimo: deficit }
  } : {
    disponible: false,
    proyeccion: { dotacionPrevistaOperativa: null, previstosBase: null },
    umbral: { minimo: 9, optimo: 11 },
    estadoDotacion: { estado: "sin_datos", faltanParaMinimo: null }
  };

const crearDia = (fecha) => ({
  fecha,
  turnos: Object.fromEntries(TURNOS.map((turno) => [turno, {
    disponible: true,
    licenciado: crearCategoria(),
    enfermero: crearCategoria()
  }])),
  resumen: {},
  advertencias: [],
  errores: []
});

const crearResultado = (cantidadDias = 4) => {
  const dias = Array.from({ length: cantidadDias }, (_, indice) =>
    crearDia(`2026-08-${String(indice + 1).padStart(2, "0")}`));
  return { ok: true, mes: "2026-08", fechas: dias.map((dia) => dia.fecha), dias, cantidadDias, errores: [] };
};

const escenarioPrincipal = () => {
  const resultado = crearResultado();
  resultado.dias[0].turnos.tarde.licenciado = crearCategoria({ cantidad: 0, base: 4, estado: "critico", deficit: 3 });
  resultado.dias[1].turnos.tarde.licenciado = crearCategoria({ cantidad: 6, base: 8, estado: "bajo_optimo", deficit: 0 });
  resultado.dias[2].turnos.tarde.licenciado = crearCategoria({ cantidad: 6, base: 10, estado: "optimo", deficit: 0 });
  resultado.dias[3].turnos.tarde.licenciado = crearCategoria({ disponible: false });
  resultado.dias[0].turnos.noche.licenciado = crearCategoria({ cantidad: 5, base: 5, estado: "critico", deficit: 2 });
  resultado.dias[0].turnos.noche.enfermero = crearCategoria({ cantidad: 7, base: 7, estado: "critico", deficit: 4 });
  resultado.dias[0].advertencias = [
    { codigo: "W_EXTRA", turno: "tarde", categoria: "licenciado" },
    { codigo: "W_EXTRA", turno: "tarde", categoria: "licenciado" },
    { codigo: "W_GLOBAL" }
  ];
  resultado.dias[1].errores = [{ codigo: "E_DATO" }, { codigo: "E_DATO" }];
  return resultado;
};

const fuente = fs.readFileSync(new URL("../src/utils/estadisticasSupervisionMes.js", import.meta.url), "utf8");
const principal = resumirEstadisticasSupervisionMes(escenarioPrincipal());
const tardeLe = principal.turnos.tarde.licenciado;

probar("utilidad existe", () => assert.equal(typeof resumirEstadisticasSupervisionMes, "function"));
probar("consume resultado mensual", () => assert.match(fuente, /resultadoMensual/));
probar("no consume estados crudos", () => assert.doesNotMatch(fuente, /estadosPorTurno|estadoMensual/));
probar("mes válido devuelve ok", () => assert.equal(principal.ok, true));
probar("conserva mes", () => assert.equal(principal.mes, "2026-08"));
probar("conserva días totales", () => assert.equal(principal.diasTotales, 4));
probar("procesa cuatro turnos", () => assert.deepEqual(Object.keys(principal.turnos), TURNOS));
probar("procesa dos categorías por turno", () => assert.deepEqual(Object.keys(principal.turnos.tarde), CATEGORIAS));
probar("cuenta días con datos", () => assert.equal(tardeLe.diasConDatos, 3));
probar("cuenta días sin datos", () => assert.equal(tardeLe.diasSinDatos, 1));
probar("cuenta crítico", () => assert.equal(tardeLe.estados.criticos, 1));
probar("cuenta bajo óptimo", () => assert.equal(tardeLe.estados.bajoOptimo, 1));
probar("cuenta óptimo", () => assert.equal(tardeLe.estados.optimos, 1));
probar("sin datos no cuenta crítico", () => assert.equal(tardeLe.estados.criticos + tardeLe.estados.bajoOptimo + tardeLe.estados.optimos, 3));
probar("cero válido cuenta como dato", () => assert.equal(tardeLe.diasConDatos, 3));
probar("cero válido participa del promedio", () => assert.equal(tardeLe.promedioOperativo, 4));
probar("promedio operativo correcto", () => assert.equal(tardeLe.promedioOperativo, (0 + 6 + 6) / 3));
probar("promedio Base correcto", () => assert.equal(tardeLe.promedioBase, (4 + 8 + 10) / 3));
probar("sin datos se excluye del promedio", () => assert.notEqual(tardeLe.promedioOperativo, (0 + 6 + 6) / 4));
probar("mínimo operativo correcto", () => assert.equal(tardeLe.minimoOperativo, 0));
probar("máximo operativo correcto", () => assert.equal(tardeLe.maximoOperativo, 6));
probar("fecha de mínimo", () => assert.deepEqual(tardeLe.fechasMinimoOperativo, ["2026-08-01"]));
probar("empate mínimo conserva fechas", () => { const entrada = escenarioPrincipal(); entrada.dias[1].turnos.tarde.licenciado = crearCategoria({ cantidad: 0, base: 8, estado: "critico", deficit: 1 }); assert.deepEqual(resumirEstadisticasSupervisionMes(entrada).turnos.tarde.licenciado.fechasMinimoOperativo, ["2026-08-01", "2026-08-02"]); });
probar("fechas de máximo", () => assert.deepEqual(tardeLe.fechasMaximoOperativo, ["2026-08-02", "2026-08-03"]));
probar("empate máximo conserva varias fechas", () => assert.equal(tardeLe.fechasMaximoOperativo.length, 2));
probar("déficit usa resultado diario", () => assert.equal(tardeLe.deficitMaximo, 3));
probar("no hardcodea 9", () => assert.doesNotMatch(fuente, /minimo\s*[:=]\s*9/));
probar("no hardcodea 11", () => assert.doesNotMatch(fuente, /optimo\s*[:=]\s*11/));
probar("no hardcodea 13", () => assert.doesNotMatch(fuente, /minimo\s*[:=]\s*13/));
probar("no hardcodea 16", () => assert.doesNotMatch(fuente, /optimo\s*[:=]\s*16/));
probar("déficit promedio incluye ceros", () => assert.equal(tardeLe.deficitPromedio, (3 + 0 + 0) / 3));
probar("déficit máximo correcto", () => assert.equal(tardeLe.deficitMaximo, 3));
probar("fecha de déficit máximo", () => assert.deepEqual(tardeLe.fechasDeficitMaximo, ["2026-08-01"]));
probar("sin déficit usa fechas vacías", () => assert.deepEqual(principal.turnos.manana.licenciado.fechasDeficitMaximo, []));
probar("combinación sin datos deja promedios null", () => { const entrada = crearResultado(); entrada.dias.forEach((dia) => { dia.turnos.tarde.licenciado = crearCategoria({ disponible: false }); }); const r = resumirEstadisticasSupervisionMes(entrada).turnos.tarde.licenciado; assert.deepEqual([r.promedioOperativo, r.promedioBase, r.deficitPromedio], [null, null, null]); });
probar("combinación sin datos deja mínimos null", () => { const entrada = crearResultado(); entrada.dias.forEach((dia) => { dia.turnos.tarde.licenciado = crearCategoria({ disponible: false }); }); const r = resumirEstadisticasSupervisionMes(entrada).turnos.tarde.licenciado; assert.deepEqual([r.minimoOperativo, r.maximoOperativo, r.deficitMaximo], [null, null, null]); });
probar("resume combinaciones totales", () => assert.equal(principal.resumenGeneral.combinacionesTotales, 32));
probar("resume combinaciones con datos", () => assert.equal(principal.resumenGeneral.combinacionesConDatos, 31));
probar("resume combinaciones sin datos", () => assert.equal(principal.resumenGeneral.combinacionesSinDatos, 1));
probar("resume combinaciones críticas", () => assert.equal(principal.resumenGeneral.combinacionesCriticas, 3));
probar("resume bajo óptimo", () => assert.equal(principal.resumenGeneral.combinacionesBajoOptimo, 1));
probar("resume óptimas", () => assert.equal(principal.resumenGeneral.combinacionesOptimas, 27));
probar("día con varios críticos cuenta una vez", () => assert.equal(principal.resumenGeneral.diasConAlgunCritico, 1));
probar("31 días producen 248 combinaciones", () => assert.equal(resumirEstadisticasSupervisionMes(crearResultado(31)).resumenGeneral.combinacionesTotales, 248));
probar("warning no elimina dato", () => assert.equal(tardeLe.diasConDatos, 3));
probar("calidad conserva warning", () => assert.deepEqual(principal.calidadDatos.advertenciasPorCodigo, { W_EXTRA: 2, W_GLOBAL: 1 }));
probar("warnings duplicados no falsean días", () => assert.equal(principal.calidadDatos.diasConAdvertencias, 1));
probar("errores se agrupan", () => assert.deepEqual(principal.calidadDatos.erroresPorCodigo, { E_DATO: 2 }));
probar("mes inválido devuelve ok false", () => assert.equal(resumirEstadisticasSupervisionMes({ ok: false, mes: "x", dias: [], errores: [{ codigo: "MES_INVALIDO" }] }).ok, false));
probar("mes inválido no inventa estadísticas", () => { const r = resumirEstadisticasSupervisionMes({ ok: false, mes: "x", dias: [], errores: [{ codigo: "MES_INVALIDO" }] }); assert.deepEqual([r.diasTotales, r.turnos, r.resumenGeneral.combinacionesTotales], [0, {}, 0]); });
probar("no agrega estadísticas de bajas", () => assert.doesNotMatch(fuente, /bajasConocidas|licencia|certificacion/));
probar("no agrega estadísticas de Extras", () => assert.doesNotMatch(fuente, /extrasRegistrados|extrasQueAportan|validarExtra/));
probar("no agrega asistencia", () => assert.doesNotMatch(fuente, /asistenciaRegistrada|presentes|ausentes|pendientes/));
probar("no agrega cobertura sectorial", () => assert.doesNotMatch(fuente, /sectoresSinCobertura|REA|Explora|Sillones/));
probar("no agrega Turnantes", () => assert.doesNotMatch(fuente, /turnante/i));
probar("no usa estadisticasCierres", () => assert.doesNotMatch(fuente, /estadisticasCierres/));
probar("no usa comparacionTurnos", () => assert.doesNotMatch(fuente, /comparacionTurnos/));
probar("no consulta Supabase", () => assert.doesNotMatch(fuente, /supabase|rpc\(|\.from\(/i));
probar("no importa React", () => assert.doesNotMatch(fuente, /react|useMemo|useEffect/i));
probar("no recalcula dotación", () => assert.doesNotMatch(fuente, /proyectarDotacion|proyectarSupervisionDia/));
probar("no recalcula semáforo", () => assert.doesNotMatch(fuente, /resolverEstadoDotacion|cantidad\s*<\s*minimo/));
probar("no muta input", () => { const entrada = escenarioPrincipal(); const antes = copiar(entrada); resumirEstadisticasSupervisionMes(entrada); assert.deepEqual(entrada, antes); });
probar("resultado determinístico", () => { const entrada = escenarioPrincipal(); assert.deepEqual(resumirEstadisticasSupervisionMes(entrada), resumirEstadisticasSupervisionMes(entrada)); });
probar("fuente no afirma snapshot histórico", () => { assert.equal(principal.fuente, "proyeccion_supervision_mes"); assert.doesNotMatch(principal.fuente, /snapshot|historico/); });

console.log(`Estadisticas Supervision mes: ${total}/${total} comprobaciones OK.`);
