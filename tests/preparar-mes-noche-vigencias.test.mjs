import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { configuracionSectores } from "../src/data/sectores.js";
import { crearConfiguracionPlanillaLicenciadosV2, crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { obtenerBloquesQueIntersectanMes } from "../src/utils/periodosRotacionPlanilla.js";
import { derivarAsignacionBaseDesdeBloque } from "../src/utils/rotacionPlanilla.js";
import { analizarPreparacionMesNuevo, construirEstadoMesNuevo as construirEstadoMesNuevoBase, obtenerFilasPlanilla } from "../src/utils/preparacionMesNuevo.js";
import { CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 } from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";

const prioridadV2 = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2.map(({ id }) => id);
const configuracionV2Base = crearConfiguracionPlanillaLicenciadosV2({ prioridadCoberturaSectorIds: prioridadV2 }).configuracion;
const construirEstadoMesNuevo = (entrada = {}) => construirEstadoMesNuevoBase({
  ...entrada,
  configuracionLicenciadosV2: configuracionV2Base
});

const filasEnfermeros = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
const filasLicenciados = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
const persona = (id, categoria, nombre = id) => ({ id, categoria, nombre });
const p = persona("P", "enfermero", "Transversal P");
const enfermeros = filasEnfermeros.map((_, i) => persona(`N${i}`, "enfermero", `Noche ${i}`));
const licenciados = filasLicenciados.map((_, i) => persona(`L${i}`, "licenciado"));
const ref = (actual) => ({ personaId: actual.id, nombre: actual.nombre });
const distribuir = (filas, personas) => Object.fromEntries(filas.map((fila, i) => [fila, ref(personas[i])]));
const periodosOrigen = obtenerBloquesQueIntersectanMes({ mesActivo: "2026-09", fechaBase: "2026-07-02", duracionDias: 3 });
const periodosDestino = obtenerBloquesQueIntersectanMes({ mesActivo: "2026-10", fechaBase: "2026-07-02", duracionDias: 3 });
const claveCompartida = periodosOrigen.find((origen) => periodosDestino.some((destino) => destino.clave === origen.clave))?.clave;

const crearOrigenNoche = ({ transversal = true, fijas = true } = {}) => {
  const estado = crearEstadoMensualVacio();
  estado.personal = structuredClone([...enfermeros, ...licenciados]);
  const base = distribuir(filasEnfermeros, enfermeros);
  if (transversal) base[filasEnfermeros[0]] = ref(p);
  estado.planillas.enfermeros.rotacion3Dias = {
    version: 4, fechaBase: "2026-07-02", duracionDias: 3,
    asignacionBase: structuredClone(base),
    bloques: claveCompartida ? { [claveCompartida]: structuredClone(base) } : {},
    coberturaLibreSM: claveCompartida ? { [claveCompartida]: transversal ? ref(p) : ref(enfermeros[0]) } : {},
    metadataHistorica: { conservar: true }
  };
  estado.planillas.licenciados.semana5 = distribuir(filasLicenciados, licenciados);
  const snapshotEnf = crearSnapshotConfiguracionPlanilla({ turno: "noche", categoria: "enfermero", mes: "2026-09" });
  const snapshotLic = crearSnapshotConfiguracionPlanilla({ turno: "noche", categoria: "licenciado", mes: "2026-09" });
  if (fijas) {
    const sectores = snapshotEnf.filas.filter((fila) => fila.tipo === "sector" && fila.activo);
    snapshotEnf.asignacionesFijas = [
      { sectorId: sectores[0].sectorId, personaId: transversal ? "P" : enfermeros[0].id },
      { sectorId: sectores[1].sectorId, personaId: enfermeros[1].id }
    ];
  }
  estado.configuracionPlanilla = { enfermero: snapshotEnf, licenciado: snapshotLic };
  estado.calendario.enfermeros.cambiosDia = { "2026-09-20": { A: ref(p) } };
  estado.calendario.enfermeros.extras = { "2026-09-20": [{ id: "extra", nombre: "Extra" }] };
  return estado;
};

const analizar = (origen, canonico = [...enfermeros, ...licenciados, p]) => analizarPreparacionMesNuevo({
  turnoId: "noche", mesOrigen: "2026-09", mesDestino: "2026-10",
  estadoOrigen: origen, personalCanonicoOrigen: canonico,
  estadoDestino: crearEstadoMensualVacio()
});

test("origen valida base, bloque y cobertura transversales contra padrón canónico", () => {
  const resultado = analizar(crearOrigenNoche());
  assert.equal(resultado.ok, true, resultado.mensaje);
  assert.equal(resultado.enfermeros.base[filasEnfermeros[0]].personaId, "P");
  assert.equal(resultado.rotacionEnfermerosOrigen.bloques[claveCompartida][filasEnfermeros[0]].personaId, "P");
  assert.equal(resultado.rotacionEnfermerosOrigen.coberturaLibreSM[claveCompartida].personaId, "P");
});

test("destino filtra transversal de base, bloque y cobertura sin copiar Personal", () => {
  const origen = crearOrigenNoche();
  const copia = structuredClone(origen);
  const construido = construirEstadoMesNuevo({ analisis: analizar(origen) });
  assert.equal(construido.ok, true);
  const destino = construido.estado;
  const rotacion = destino.planillas.enfermeros.rotacion3Dias;
  assert.equal(destino.personal.some(({ id }) => id === "P"), false);
  assert.equal(rotacion.asignacionBase[filasEnfermeros[0]], "");
  assert.equal(rotacion.bloques[claveCompartida][filasEnfermeros[0]], "");
  assert.equal(Object.hasOwn(rotacion.coberturaLibreSM, claveCompartida), false);
  assert.equal("vigencias" in destino, false);
  assert.deepEqual(origen, copia);
});

test("persona física Noche y fija local permanecen; fija transversal no se hereda", () => {
  const destino = construirEstadoMesNuevo({ analisis: analizar(crearOrigenNoche()) }).estado;
  assert.equal(destino.personal.filter(({ id }) => id === enfermeros[1].id).length, 1);
  assert.equal(Object.values(destino.planillas.enfermeros.rotacion3Dias.asignacionBase).some((referencia) => referencia?.personaId === enfermeros[1].id), true);
  assert.equal(destino.configuracionPlanilla.enfermero.asignacionesFijas.some(({ personaId }) => personaId === "P"), false);
  assert.equal(destino.configuracionPlanilla.enfermero.asignacionesFijas.some(({ personaId }) => personaId === enfermeros[1].id), true);
});

test("metadata y continuidad se preservan sin reconstruir base moderna", () => {
  const rotacion = construirEstadoMesNuevo({ analisis: analizar(crearOrigenNoche()) }).estado.planillas.enfermeros.rotacion3Dias;
  assert.equal(rotacion.fechaBase, "2026-07-02");
  assert.equal(rotacion.duracionDias, 3);
  assert.equal(rotacion.version, 4);
  assert.deepEqual(rotacion.metadataHistorica, { conservar: true });
  assert.deepEqual(Object.keys(rotacion.bloques), claveCompartida ? [claveCompartida] : []);
});

test("caso físico legacy estable conserva base, bloque y cobertura", () => {
  const origen = crearOrigenNoche({ transversal: false });
  const rotacion = construirEstadoMesNuevo({ analisis: analizar(origen, origen.personal) }).estado.planillas.enfermeros.rotacion3Dias;
  assert.equal(rotacion.asignacionBase[filasEnfermeros[0]].personaId, enfermeros[0].id);
  assert.equal(rotacion.bloques[claveCompartida][filasEnfermeros[0]].personaId, enfermeros[0].id);
  assert.equal(rotacion.coberturaLibreSM[claveCompartida].personaId, enfermeros[0].id);
});

test("legacy inequívoco conserva compatibilidad y ambiguo bloquea", () => {
  const resoluble = crearOrigenNoche({ transversal: false, fijas: false });
  resoluble.planillas.enfermeros.rotacion3Dias.asignacionBase[filasEnfermeros[0]] = enfermeros[0].nombre;
  assert.equal(analizar(resoluble, resoluble.personal).ok, true);
  const ambiguo = crearOrigenNoche({ transversal: false, fijas: false });
  ambiguo.personal[0].nombre = "Homónimo";
  ambiguo.personal[1].nombre = "Homónimo";
  ambiguo.planillas.enfermeros.rotacion3Dias.asignacionBase[filasEnfermeros[0]] = "Homónimo";
  const resultado = analizar(ambiguo, ambiguo.personal);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "BASE_ENFERMEROS");
});

test("B4C3D sigue seleccionando bloque legacy resoluble por índice", () => {
  const origen = crearOrigenNoche({ transversal: false, fijas: false });
  const baseValida = structuredClone(origen.planillas.enfermeros.rotacion3Dias.asignacionBase);
  origen.planillas.enfermeros.rotacion3Dias.asignacionBase = {};
  const [stale, valido] = periodosOrigen;
  origen.planillas.enfermeros.rotacion3Dias.bloques = {
    [stale.clave]: { [filasEnfermeros[0]]: { personaId: "stale", nombre: "Stale" } },
    [valido.clave]: baseValida
  };
  const resultado = analizar(origen, origen.personal);
  assert.equal(resultado.ok, true, resultado.mensaje);
  const derivada = derivarAsignacionBaseDesdeBloque({
    bloqueReferencia: baseValida,
    indiceReferencia: valido.indice,
    filas: filasEnfermeros,
    filasFijas: ["SM"]
  });
  assert.deepEqual(resultado.rotacionEnfermerosOrigen.asignacionBase, derivada);
});

test("no copia Extras ni Calendario y conserva identidad física única", () => {
  const destino = construirEstadoMesNuevo({ analisis: analizar(crearOrigenNoche()) }).estado;
  assert.deepEqual(destino.calendario.enfermeros.extras, {});
  assert.deepEqual(destino.calendario.enfermeros.cambiosDia, {});
  assert.equal(new Set(destino.personal.map(({ id }) => id)).size, destino.personal.length);
});

test("diagnóstico diferido y bloqueo de movimiento desaparecen tras N3", () => {
  const preparacion = fs.readFileSync("src/utils/preparacionMesNuevo.js", "utf8");
  const detector = fs.readFileSync("src/utils/dependenciasMovimientoPadronBase.js", "utf8");
  const sql = fs.readFileSync("supabase/migrations/20260826183000_habilitar_movimiento_enfermeros_noche.sql", "utf8");
  assert.doesNotMatch(preparacion, /REFERENCIA_TRANSVERSAL_NOCTURNA_DIFERIDA/);
  assert.doesNotMatch(detector, /MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO/);
  assert.doesNotMatch(sql, /MOVIMIENTO_ENFERMERO_NOCHE_DIFERIDO/);
});
