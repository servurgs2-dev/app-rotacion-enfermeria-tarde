import assert from "node:assert/strict";
import fs from "node:fs";
import { TURNOS } from "../src/config/turnos.js";
import { crearSnapshotConfiguracionPlanilla, obtenerFilasActivas } from "../src/utils/configuracionPlanilla.js";
import { esDiaLibre, obtenerSemanasDelMes, semanaKeyFromDate, parsearFechaLocal } from "../src/utils/fechas.js";
import { TIPOS_NOVEDAD_PERSONAL } from "../src/utils/novedadesPersonal.js";
import { proyectarSupervisionMes } from "../src/utils/proyeccionSupervisionMes.js";

let total = 0;
const probar = (nombre, fn) => { fn(); total += 1; console.log(`✓ ${total} ${nombre}`); };
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const MES = "2026-04";
const FECHA = "2026-04-10";

const crearCategoria = (turno, categoria, mes, cantidad) => {
  const snapshot = crearSnapshotConfiguracionPlanilla({ turno, categoria, mes });
  const filas = obtenerFilasActivas(snapshot.filas);
  const personas = Array.from({ length: cantidad }, (_, indice) => ({
    id: `${turno}-${categoria}-${indice + 1}`,
    funcionario: `${turno}-${categoria}-${indice + 1}`,
    nombre: `${categoria} ${indice + 1}`,
    categoria
  }));
  const distribucion = Object.fromEntries(personas.map((persona, indice) => [
    filas[indice].etiqueta,
    { personaId: persona.id, nombre: persona.nombre }
  ]));
  const planilla = { coberturaLibreSM: {}, asignacionesParciales: {} };
  obtenerSemanasDelMes(mes).forEach(({ clave }) => { planilla[clave] = copiar(distribucion); });
  return { snapshot, personas, planilla };
};

const crearEstado = (turno, mes = MES, { licenciado = 11, enfermero = 16 } = {}) => {
  const le = crearCategoria(turno, "licenciado", mes, licenciado);
  const ae = crearCategoria(turno, "enfermero", mes, enfermero);
  return {
    personal: [...le.personas, ...ae.personas],
    licencias: [],
    certificaciones: [],
    configuracionPlanilla: { licenciado: le.snapshot, enfermero: ae.snapshot },
    planillas: { licenciados: le.planilla, enfermeros: ae.planilla },
    calendario: {
      licenciados: { extras: {}, noDisponibles: {}, asistenciaDia: {} },
      enfermeros: { extras: {}, noDisponibles: {}, asistenciaDia: {} }
    }
  };
};

const crearEstados = (mes = MES) => Object.fromEntries(
  Object.keys(TURNOS).map((turno) => [turno, crearEstado(turno, mes)])
);
const proyectar = ({
  estadosPorTurno = crearEstados(),
  novedadesModernas = [],
  mes = MES,
  configuracionDotacion
} = {}) => proyectarSupervisionMes({
  estadosPorTurno, novedadesModernas, mes, configuracionDotacion
});
const dia = (resultado, fecha = FECHA) => resultado.dias.find((actual) => actual.fecha === fecha);
const categoria = (resultado, turno = "tarde", tipo = "licenciado", fecha = FECHA) =>
  dia(resultado, fecha).turnos[turno][tipo];

probar("enero tiene 31 días", () => assert.equal(proyectar({ mes: "2027-01", estadosPorTurno: {} }).cantidadDias, 31));
probar("abril tiene 30 días", () => assert.equal(proyectar().cantidadDias, 30));
probar("febrero 2026 tiene 28 días", () => assert.equal(proyectar({ mes: "2026-02", estadosPorTurno: {} }).cantidadDias, 28));
probar("febrero 2024 tiene 29 días", () => assert.equal(proyectar({ mes: "2024-02", estadosPorTurno: {} }).cantidadDias, 29));
probar("fechas ordenadas ascendente", () => { const r = proyectar(); assert.deepEqual(r.fechas, [...r.fechas].sort()); });
probar("primera fecha correcta", () => assert.equal(proyectar().fechas[0], "2026-04-01"));
probar("última fecha correcta", () => assert.equal(proyectar().fechas.at(-1), "2026-04-30"));
probar("diciembre no invade enero", () => { const r = proyectar({ mes: "2026-12", estadosPorTurno: {} }); assert.equal(r.fechas.at(-1), "2026-12-31"); });
probar("enero del nuevo año empieza correctamente", () => { const r = proyectar({ mes: "2027-01", estadosPorTurno: {} }); assert.equal(r.fechas[0], "2027-01-01"); });
probar("cada día conserva cuatro turnos", () => assert.deepEqual(Object.keys(proyectar().dias[0].turnos), Object.keys(TURNOS)));
probar("cada turno conserva dos categorías", () => assert.deepEqual(Object.keys(proyectar().dias[0].turnos.tarde).filter((clave) => clave !== "disponible"), ["licenciado", "enfermero"]));
probar("conserva resumen diario", () => assert.equal(Object.values(proyectar().dias[0].resumen).reduce((a, b) => a + b, 0), 8));
probar("conserva proyección completa", () => assert.equal(categoria(proyectar()).proyeccion.fecha, FECHA));
probar("conserva previstosBase", () => assert.equal(categoria(proyectar()).proyeccion.previstosBase.cantidad, 11));
probar("conserva baseDisponible", () => assert.equal(categoria(proyectar()).proyeccion.baseDisponible.cantidad, 11));
probar("conserva extrasRegistrados", () => assert.equal(categoria(proyectar()).proyeccion.extrasRegistrados.cantidad, 0));
probar("conserva extrasQueAportan", () => assert.equal(categoria(proyectar()).proyeccion.extrasQueAportan.cantidad, 0));
probar("conserva dotacionPrevistaOperativa", () => assert.equal(categoria(proyectar()).proyeccion.dotacionPrevistaOperativa.cantidad, 11));
probar("conserva asistenciaRegistrada", () => assert.equal(categoria(proyectar()).proyeccion.asistenciaRegistrada.pendientes.cantidad, 11));
probar("conserva umbral", () => assert.deepEqual([categoria(proyectar()).umbral.minimo, categoria(proyectar()).umbral.optimo], [9, 11]));
probar("conserva estadoDotacion", () => assert.equal(categoria(proyectar()).estadoDotacion.estado, "optimo"));
probar("conserva advertencias diarias", () => { const estados = crearEstados(); estados.tarde.calendario.licenciados.asistenciaDia[FECHA] = { "id:fantasma": "presente" }; assert.ok(dia(proyectar({ estadosPorTurno: estados })).advertencias.length > 0); });
probar("turno faltante queda sin datos", () => { const estados = crearEstados(); estados.noche = null; assert.equal(categoria(proyectar({ estadosPorTurno: estados }), "noche").estadoDotacion.estado, "sin_datos"); });
probar("otro turno sigue calculándose", () => { const estados = crearEstados(); estados.noche = null; assert.equal(categoria(proyectar({ estadosPorTurno: estados }), "tarde").disponible, true); });
probar("período faltante queda sin datos", () => { const estados = crearEstados(); delete estados.tarde.planillas.licenciados[semanaKeyFromDate(parsearFechaLocal(FECHA), MES)]; assert.equal(categoria(proyectar({ estadosPorTurno: estados })).disponible, false); });
probar("período vacío válido conserva cero", () => { const estados = crearEstados(); estados.tarde.planillas.licenciados[semanaKeyFromDate(parsearFechaLocal(FECHA), MES)] = {}; assert.equal(categoria(proyectar({ estadosPorTurno: estados })).proyeccion.dotacionPrevistaOperativa.cantidad, 0); });
probar("cero real conserva estado crítico", () => { const estados = crearEstados(); estados.tarde.planillas.licenciados[semanaKeyFromDate(parsearFechaLocal(FECHA), MES)] = {}; assert.equal(categoria(proyectar({ estadosPorTurno: estados })).estadoDotacion.estado, "critico"); });
probar("sin datos no se convierte en cero", () => { const estados = crearEstados(); estados.tarde = null; const c = categoria(proyectar({ estadosPorTurno: estados })); assert.equal(c.estadoDotacion.cantidad, null); });
probar("configuración llega al diario", () => { const c = categoria(proyectar({ configuracionDotacion: { overridesTurno: { tarde: { licenciado: { minimo: 12, optimo: 14 } } } } })); assert.equal(c.umbral.fuente, "override"); });
probar("override por turno se refleja", () => { const c = categoria(proyectar({ configuracionDotacion: { overridesTurno: { tarde: { licenciado: { minimo: 12, optimo: 14 } } } } })); assert.deepEqual([c.umbral.minimo, c.umbral.optimo], [12, 14]); });
probar("Noche no tiene excepción automática", () => assert.equal(categoria(proyectar(), "noche").umbral.fuente, "default"));
probar("Extra válido sigue sumando", () => { const estados = crearEstados(); estados.tarde.calendario.licenciados.extras[FECHA] = [{ id: "extra", nombre: "Extra", categoria: "licenciado" }]; assert.equal(categoria(proyectar({ estadosPorTurno: estados })).proyeccion.extrasQueAportan.cantidad, 1); });
probar("Extra indisponible en origen sigue bloqueado", () => { const estados = crearEstados(); const persona = estados.manana.personal.find((p) => p.categoria === "licenciado"); estados.manana.certificaciones = [{ personaId: persona.id, desde: FECHA, hasta: FECHA }]; estados.tarde.calendario.licenciados.extras[FECHA] = [{ id: "extra-origen", personaId: persona.id, funcionario: persona.funcionario, nombre: persona.nombre, categoria: "licenciado", origenExtra: "personal_otro_turno", turnoOrigen: "manana" }]; const p = categoria(proyectar({ estadosPorTurno: estados })).proyeccion; assert.equal(p.extrasRegistrados.cantidad, 1); assert.equal(p.extrasQueAportan.cantidad, 0); });
probar("Licencia sigue restando", () => { const estados = crearEstados(); const persona = estados.tarde.personal.find((p) => p.categoria === "licenciado"); estados.tarde.licencias = [{ personaId: persona.id, desde: FECHA, hasta: FECHA }]; assert.equal(categoria(proyectar({ estadosPorTurno: estados })).proyeccion.bajasConocidas.cantidad, 1); });
probar("Certificación sigue restando", () => { const estados = crearEstados(); const persona = estados.tarde.personal.find((p) => p.categoria === "licenciado"); estados.tarde.certificaciones = [{ personaId: persona.id, desde: FECHA, hasta: FECHA }]; assert.equal(categoria(proyectar({ estadosPorTurno: estados })).proyeccion.bajasConocidas.cantidad, 1); });
probar("Suspensión sigue restando", () => { const estados = crearEstados(); const persona = estados.tarde.personal.find((p) => p.categoria === "licenciado"); const novedad = { id: "s", personaId: persona.id, personaNombre: persona.nombre, tipo: TIPOS_NOVEDAD_PERSONAL.SUSPENSION, fechaDesde: FECHA, fechaHasta: FECHA, turno: "tarde", categoria: "licenciado", afectaDisponibilidad: true, estado: "activa" }; assert.equal(categoria(proyectar({ estadosPorTurno: estados, novedadesModernas: [novedad] })).proyeccion.bajasConocidas.cantidad, 1); });
probar("Paro sigue restando", () => { const estados = crearEstados(); const persona = estados.tarde.personal.find((p) => p.categoria === "licenciado"); const novedad = { id: "p", personaId: persona.id, personaNombre: persona.nombre, tipo: TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO, fechaDesde: FECHA, fechaHasta: FECHA, turno: "tarde", categoria: "licenciado", afectaDisponibilidad: true, estado: "activa" }; assert.equal(categoria(proyectar({ estadosPorTurno: estados, novedadesModernas: [novedad] })).proyeccion.bajasConocidas.cantidad, 1); });
probar("Libre sigue fuera de previstosBase", () => { const estados = crearEstados(); const persona = estados.tarde.personal.find((p) => p.categoria === "licenciado"); persona.libre = [1, 2, 3, 4, 5].find((grupo) => esDiaLibre({ libre: grupo }, parsearFechaLocal(FECHA))); assert.equal(categoria(proyectar({ estadosPorTurno: estados })).proyeccion.previstosBase.cantidad, 10); });
probar("Cambio horario no reduce", () => { const estados = crearEstados(); const persona = estados.tarde.personal.find((p) => p.categoria === "licenciado"); const novedad = { id: "c", personaId: persona.id, personaNombre: persona.nombre, tipo: TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO, fechaDesde: FECHA, fechaHasta: FECHA, turno: "tarde", categoria: "licenciado", estado: "activa" }; assert.equal(categoria(proyectar({ estadosPorTurno: estados, novedadesModernas: [novedad] })).proyeccion.bajasConocidas.cantidad, 0); });
probar("Olvido tarjeta no reduce", () => { const estados = crearEstados(); const persona = estados.tarde.personal.find((p) => p.categoria === "licenciado"); const novedad = { id: "o", personaId: persona.id, personaNombre: persona.nombre, tipo: TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA, fechaDesde: FECHA, fechaHasta: FECHA, turno: "tarde", categoria: "licenciado", estado: "activa" }; assert.equal(categoria(proyectar({ estadosPorTurno: estados, novedadesModernas: [novedad] })).proyeccion.bajasConocidas.cantidad, 0); });
probar("Asistencia no cambia dotación", () => { const estados = crearEstados(); estados.tarde.calendario.licenciados.asistenciaDia[FECHA] = { "id:tarde-licenciado-1": "ausente" }; assert.equal(categoria(proyectar({ estadosPorTurno: estados })).proyeccion.dotacionPrevistaOperativa.cantidad, 11); });
probar("no muta estadosPorTurno", () => { const estados = crearEstados(); const antes = copiar(estados); proyectar({ estadosPorTurno: estados }); assert.deepEqual(estados, antes); });
probar("no muta novedadesModernas", () => { const novedades = [{ id: "n" }]; const antes = copiar(novedades); proyectar({ novedadesModernas: novedades }); assert.deepEqual(novedades, antes); });
probar("no muta configuracionDotacion", () => { const configuracion = { overridesTurno: { noche: { licenciado: { minimo: 8, optimo: 10 } } } }; const antes = copiar(configuracion); proyectar({ configuracionDotacion: configuracion }); assert.deepEqual(configuracion, antes); });
probar("resultado determinístico", () => { const entrada = { estadosPorTurno: crearEstados() }; assert.deepEqual(proyectar(entrada), proyectar(entrada)); });
probar("mes inválido no genera fechas ficticias", () => { const r = proyectar({ mes: "2026-13", estadosPorTurno: {} }); assert.deepEqual([r.ok, r.fechas, r.dias, r.cantidadDias], [false, [], [], 0]); });
probar("no usa Supabase", () => assert.doesNotMatch(fs.readFileSync(new URL("../src/utils/proyeccionSupervisionMes.js", import.meta.url), "utf8"), /supabase|rpc\(/i));
probar("no usa React", () => assert.doesNotMatch(fs.readFileSync(new URL("../src/utils/proyeccionSupervisionMes.js", import.meta.url), "utf8"), /react|useMemo|useEffect|useState/i));
probar("no implementa reglas numéricas de semáforo", () => assert.doesNotMatch(fs.readFileSync(new URL("../src/utils/proyeccionSupervisionMes.js", import.meta.url), "utf8"), /resolverEstadoDotacion|minimo|optimo|bajo_optimo|critico/));
probar("no crea segundo motor de Extras o bajas", () => { const fuente = fs.readFileSync(new URL("../src/utils/proyeccionSupervisionMes.js", import.meta.url), "utf8"); assert.match(fuente, /proyectarSupervisionDia/); assert.doesNotMatch(fuente, /resolverIndisponibilidadesDia|extrasQueAportan|bajasConocidas/); });

console.log(`\nProyección Supervisión mes: ${total}/${total} pruebas OK`);
