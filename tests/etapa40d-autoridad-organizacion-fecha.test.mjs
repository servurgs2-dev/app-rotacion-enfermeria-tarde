import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  CODIGOS_PREPARACIONES_MES,
  crearNuevaPreparacionDesdeFecha,
  resolverOrganizacionMesPorFecha
} from "../src/utils/preparacionesMes.js";
import { analizarRecuperacionMesActual } from "../src/utils/recuperacionMesActual.js";
import { resolverPeriodoPlanillaDia } from "../src/utils/periodoPlanillaDia.js";
import { obtenerBloqueParaFecha } from "../src/utils/periodosRotacionPlanilla.js";
import {
  crearSnapshotConfiguracionPlanilla,
  obtenerConfiguracionPlanillaEfectiva
} from "../src/utils/configuracionPlanilla.js";
import { resolverDatosPresentacionCierreTurno } from "../src/utils/cierreTurno.js";

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};
const mes = "2026-09";
const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const configuracion = (turno, categoria, marca) => ({
  ...crearSnapshotConfiguracionPlanilla({ turno, categoria, mes }),
  marca,
  asignacionesFijas: [{ sectorId: `sector-${marca}`, personaId: `fija-${marca}` }],
  prioridadCoberturaSectorIds: [`prioridad-${marca}`],
  ...(categoria === "licenciado" ? { estructuraLicenciadosVersion: marca === "B" ? 2 : 1 } : {})
});
const planillaSemanal = (marca) => ({
  semana1: { REA1: { personaId: `p-${marca}` } },
  semana2: { REA1: { personaId: `p-${marca}` } },
  semana3: { REA1: { personaId: `p-${marca}` } },
  semana4: { REA1: { personaId: `p-${marca}` } },
  semana5: { REA1: { personaId: `p-${marca}` } },
  semana6: {},
  coberturaLibreSM: {},
  posicionesMensualesAdicionales: [`T-${marca}`]
});
const categorias = (marca, turno = "tarde") => ({
  enfermero: { planilla: planillaSemanal(marca), configuracion: configuracion(turno, "enfermero", marca) },
  licenciado: { planilla: planillaSemanal(`L${marca}`), configuracion: configuracion(turno, "licenciado", marca) }
});
const preparacion = (id, desde, hasta, marca, turno = "tarde") => ({
  id,
  desde,
  hasta,
  creadaEn: null,
  creadaPor: null,
  origen: "prueba",
  categorias: categorias(marca, turno)
});
const estadoAB = () => ({
  ...crearEstadoMensualVacio(),
  planillas: {
    enfermeros: planillaSemanal("TOP"),
    licenciados: planillaSemanal("LTOP")
  },
  configuracionPlanilla: {
    enfermero: configuracion("tarde", "enfermero", "TOP"),
    licenciado: configuracion("tarde", "licenciado", "TOP")
  },
  preparaciones: [
    preparacion("A", "2026-09-01", "2026-09-12", "A"),
    preparacion("B", "2026-09-13", "2026-09-30", "B")
  ]
});

await probar("legacy preparado resuelve exactamente Planillas y configuración previas", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros.semana1 = { REA1: { personaId: "p1" } };
  estado.configuracionPlanilla = { enfermero: configuracion("tarde", "enfermero", "LEGACY") };
  const resultado = resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-10" });
  assert.equal(resultado.origen, "legacy");
  assert.deepEqual(resultado.planillas, estado.planillas);
  assert.deepEqual(resultado.configuracionPlanilla, estado.configuracionPlanilla);
});

await probar("mes vacío devuelve SIN_PREPARACION sin organización", () => {
  const resultado = resolverOrganizacionMesPorFecha({ estado: crearEstadoMensualVacio(), mes, fecha: "2026-09-10" });
  assert.equal(resultado.codigo, CODIGOS_PREPARACIONES_MES.SIN_PREPARACION);
  assert.equal(resultado.planillas, null);
  assert.equal(resultado.configuracionPlanilla, null);
});

await probar("Personal solo no constituye organización", () => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "p1" }];
  assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-10" }).codigo, CODIGOS_PREPARACIONES_MES.LEGACY_NO_MATERIALIZABLE);
});

for (const [fecha, id] of [["2026-09-10", "A"], ["2026-09-12", "A"], ["2026-09-13", "B"], ["2026-09-30", "B"]]) {
  await probar(`${fecha} resuelve preparación ${id}`, () => {
    assert.equal(resolverOrganizacionMesPorFecha({ estado: estadoAB(), mes, fecha }).preparacionId, id);
  });
}

await probar("planilla y configuración proceden del mismo preparacionId", () => {
  const resultado = resolverOrganizacionMesPorFecha({ estado: estadoAB(), mes, fecha: "2026-09-13" });
  assert.equal(resultado.preparacionId, "B");
  assert.equal(resultado.planillas.enfermeros.semana2.REA1.personaId, "p-B");
  assert.equal(resultado.configuracionPlanilla.enfermero.marca, "B");
});

await probar("semana atravesada se decide por día y no globalmente", () => {
  const estado = estadoAB();
  const dia12 = resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-12" });
  const dia13 = resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-13" });
  assert.equal(dia12.planillas.enfermeros.semana2.REA1.personaId, "p-A");
  assert.equal(dia13.planillas.enfermeros.semana2.REA1.personaId, "p-B");
});

const crearEstadoNocheAB = () => {
  const estado = estadoAB();
  estado.preparaciones = estado.preparaciones.map((item) => {
    const marca = item.id;
    const planilla = item.categorias.enfermero.planilla;
    const bloques = {};
    for (const fecha of ["2026-09-12", "2026-09-13"]) {
      const bloque = obtenerBloqueParaFecha({ fecha, fechaBase: "2026-07-02", duracionDias: 3 });
      bloques[bloque.clave] = { REA1: { personaId: `noche-${marca}` } };
    }
    return {
      ...item,
      categorias: {
        ...item.categorias,
        enfermero: {
          planilla: {
            ...planilla,
            rotacion3Dias: {
              version: 1,
              fechaBase: "2026-07-02",
              duracionDias: 3,
              asignacionBase: { REA1: { personaId: `base-${marca}` } },
              bloques,
              coberturaLibreSM: {}
            }
          },
          configuracion: configuracion("noche", "enfermero", marca)
        }
      }
    };
  });
  return estado;
};

await probar("Noche conserva fechaBase en A y B", () => {
  const estado = crearEstadoNocheAB();
  for (const fecha of ["2026-09-12", "2026-09-13"]) {
    assert.equal(resolverOrganizacionMesPorFecha({ estado, mes, fecha }).planillas.enfermeros.rotacion3Dias.fechaBase, "2026-07-02");
  }
});

for (const [fecha, marca] of [["2026-09-12", "A"], ["2026-09-13", "B"]]) {
  await probar(`Noche ${fecha} selecciona bloque dentro de ${marca}`, () => {
    const organizacion = resolverOrganizacionMesPorFecha({ estado: crearEstadoNocheAB(), mes, fecha });
    const periodo = resolverPeriodoPlanillaDia({ planilla: organizacion.planillas.enfermeros, fecha, turno: "noche", categoria: "enfermero", mes });
    assert.equal(periodo.ok, true);
    assert.equal(periodo.distribucion.REA1.personaId, `noche-${marca}`);
  });
}

await probar("Turnantes A/B no se mezclan", () => {
  const estado = estadoAB();
  assert.deepEqual(resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-12" }).planillas.enfermeros.posicionesMensualesAdicionales, ["T-A"]);
  assert.deepEqual(resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-13" }).planillas.enfermeros.posicionesMensualesAdicionales, ["T-B"]);
});

await probar("prioridades y asignaciones fijas A/B no se mezclan", () => {
  const estado = estadoAB();
  const a = resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-12" }).configuracionPlanilla.enfermero;
  const b = resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-13" }).configuracionPlanilla.enfermero;
  assert.deepEqual(a.prioridadCoberturaSectorIds, ["prioridad-A"]);
  assert.deepEqual(b.prioridadCoberturaSectorIds, ["prioridad-B"]);
  assert.equal(a.asignacionesFijas[0].personaId, "fija-A");
  assert.equal(b.asignacionesFijas[0].personaId, "fija-B");
});

await probar("Licenciados v2 se resuelve junto a B", () => {
  const resultado = resolverOrganizacionMesPorFecha({ estado: estadoAB(), mes, fecha: "2026-09-13" });
  assert.equal(resultado.configuracionPlanilla.licenciado.estructuraLicenciadosVersion, 2);
  assert.equal(resultado.planillas.licenciados.semana2.REA1.personaId, "p-LB");
});

await probar("configuración efectiva puede consumir el estado adaptado de la fecha", () => {
  const estado = estadoAB();
  const organizacion = resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-13" });
  const adaptado = { ...estado, planillas: organizacion.planillas, configuracionPlanilla: organizacion.configuracionPlanilla };
  assert.equal(obtenerConfiguracionPlanillaEfectiva({ estadoMensual: adaptado, turno: "tarde", categoria: "enfermero", mes }).versionId, organizacion.configuracionPlanilla.enfermero.versionId);
});

await probar("colección corrupta no usa top-level legacy", () => {
  const estado = estadoAB();
  estado.preparaciones = [{ id: "rota", desde: "2026-09-20", hasta: "2026-09-10" }];
  const resultado = resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-10" });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.origen, "versionado");
  assert.equal(resultado.planillas, null);
});

await probar("operaciones diarias permanecen fuera y se conservan al adaptar", () => {
  const estado = estadoAB();
  estado.calendario.enfermeros.cambiosDia = { "2026-09-13": { REA1: "manual" } };
  estado.calendario.enfermeros.noDisponibles = { "2026-09-13": [{ personaId: "p1" }] };
  estado.calendario.enfermeros.extras = { "2026-09-13": [{ id: "e1" }] };
  estado.calendario.enfermeros.asistenciaDia = { "2026-09-13": { p1: true } };
  const organizacion = resolverOrganizacionMesPorFecha({ estado, mes, fecha: "2026-09-13" });
  assert.equal(Object.hasOwn(organizacion, "calendario"), false);
  const adaptado = { ...estado, planillas: organizacion.planillas, configuracionPlanilla: organizacion.configuracionPlanilla };
  assert.equal(adaptado.calendario, estado.calendario);
  assert.equal(adaptado.calendario.enfermeros.cambiosDia["2026-09-13"].REA1, "manual");
  assert.equal(adaptado.calendario.enfermeros.noDisponibles["2026-09-13"][0].personaId, "p1");
  assert.equal(adaptado.calendario.enfermeros.extras["2026-09-13"][0].id, "e1");
  assert.equal(adaptado.calendario.enfermeros.asistenciaDia["2026-09-13"].p1, true);
});

await probar("cierre conserva snapshot como autoridad frente a B", () => {
  const snapshot = { versionSnapshot: 2, asignaciones: [{ sector: "REA 1", persona: { personaId: "cerrada", nombre: "Cerrada" } }] };
  const resultado = resolverDatosPresentacionCierreTurno({ snapshot, reconstruccion: { asignaciones: [{ sector: "REA 1", persona: "B" }] } });
  assert.equal(resultado.fuente, "snapshot_cierre");
  assert.equal(resultado.asignaciones[0].enfermero.nombre, "Cerrada");
});

await probar("cada turno resuelve exclusivamente su propio estado", () => {
  const tarde = estadoAB();
  const noche = crearEstadoNocheAB();
  assert.equal(resolverOrganizacionMesPorFecha({ estado: tarde, mes, fecha: "2026-09-13" }).planillas.enfermeros.semana2.REA1.personaId, "p-B");
  assert.equal(resolverOrganizacionMesPorFecha({ estado: noche, mes, fecha: "2026-09-13" }).planillas.enfermeros.rotacion3Dias.asignacionBase.REA1.personaId, "base-B");
});

await probar("resolver no muta ni escribe preparaciones en legacy", () => {
  const legacy = crearEstadoMensualVacio();
  legacy.planillas.enfermeros.semana1 = { REA1: { personaId: "p1" } };
  const antes = clonar(legacy);
  resolverOrganizacionMesPorFecha({ estado: legacy, mes, fecha: "2026-09-10" });
  assert.deepEqual(legacy, antes);
  assert.equal(Object.hasOwn(legacy, "preparaciones"), false);
});

await probar("40B continúa recuperando vacío", () => {
  assert.equal(analizarRecuperacionMesActual({ mes, mesReferencia: mes, fechaReferencia: new Date(2026, 8, 2, 12), turno: "noche", estado: crearEstadoMensualVacio(), novedadesExternas: [], padronVigencias: { personas: [] }, auditoriaExternaDisponible: true }).permitida, true);
});

await probar("40C.1 desde hoy permanece vigente", () => {
  assert.equal(crearNuevaPreparacionDesdeFecha({ preparaciones: [preparacion("A", "2026-09-01", "2026-09-30", "A")], mes, desde: "2026-09-13", fechaReferencia: "2026-09-13", id: "B" }).ok, true);
});

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const calendario = await readFile(new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url), "utf8");
const planillaMensual = await readFile(new URL("../src/components/planilla/PlanillaMensual.jsx", import.meta.url), "utf8");

await probar("App conecta Calendario con una organización atómica por fecha", () => {
  assert.match(app, /resolverOrganizacionMesPorFecha\(\{/);
  assert.match(app, /estadoMensual=\{estadoMensualCalendarioDia\}/);
  assert.match(app, /planilla=\{planillaEnfermerosCalendarioDia\}/);
  assert.match(app, /planilla=\{planillaLicenciadosCalendarioDia\}/);
});

await probar("Calendario resuelve período después de recibir organización", () => {
  assert.match(calendario, /resolverPeriodoPlanillaDia\(\{[\s\S]*estadoMensual,[\s\S]*planilla,[\s\S]*fecha/);
});

await probar("autoridad versionada se declara sin consultar top-level", () => {
  const resultado = resolverOrganizacionMesPorFecha({ estado: estadoAB(), mes, fecha: "2026-09-13" });
  assert.equal(resultado.origen, "versionado");
  assert.equal(resultado.planillas.enfermeros.semana2.REA1.personaId, "p-B");
  assert.notEqual(resultado.planillas.enfermeros.semana2.REA1.personaId, "p-TOP");
});

await probar("resolución se memoiza por claves organizativas y fecha", () => {
  assert.match(app, /const organizacionCalendarioDia = useMemo\(\(\) => resolverOrganizacionMesPorFecha/);
  assert.match(app, /const fuenteOrganizativaMes = useMemo/);
  assert.match(app, /configuracionOrganizativaMes,[\s\S]*planillasOrganizativasMes,[\s\S]*preparacionesVersionadasMes/);
  assert.match(app, /fecha,[\s\S]*fuenteOrganizativaMes,[\s\S]*mesActivo/);
});

await probar("Planilla Mensual permanece fuera del puente por fecha", () => {
  assert.doesNotMatch(planillaMensual, /resolverOrganizacionMesPorFecha|preparaciones/);
  assert.match(app, /planilla=\{planillaEnfermeros\}/);
  assert.match(app, /planilla=\{planillaLicenciados\}/);
});

await probar("PDF diario sigue heredando los datos resueltos por Calendario", () => {
  assert.match(calendario, /onDataReady\(datosParaPDF\)/);
  assert.match(app, /enfermeros: dataPDFEnf/);
  assert.match(app, /licenciados: dataPDFLic/);
});

await probar("40D no crea preparaciones automáticamente", () => {
  assert.doesNotMatch(app, /preparaciones\s*:/);
  assert.doesNotMatch(app, /setEstadoPorTurnoMes[\s\S]{0,300}crearNuevaPreparacionDesdeFecha/);
});

console.log(`\n${total} comprobaciones de Etapa 40D superadas.`);
