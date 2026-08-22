import { TURNOS } from "../config/turnos.js";
import {
  detectarDisponiblesPorReintegro,
  evaluarAsignacionesParcialesDia,
  filtrarReintegradosSinSectorDia,
  obtenerAsignacionesParcialesPeriodo
} from "./asignacionesParcialesPlanilla.js";
import {
  obtenerConfiguracionPlanillaEfectiva,
  obtenerFilasActivas
} from "./configuracionPlanilla.js";
import { esDiaLibre, estaDeLicencia, parsearFechaLocal } from "./fechas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import {
  obtenerPlanillaCategoriaEstado,
  resolverPeriodoPlanillaDia
} from "./periodoPlanillaDia.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { resolverClaveDistribucionParaFila } from "./resolucionIdentidadesPlanilla.js";
import { normalizar } from "./texto.js";

const CATEGORIAS = new Set(["enfermero", "licenciado"]);

const claveFecha = (fecha) => typeof fecha === "string"
  ? fecha
  : `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

const personaMinima = (persona) => ({
  personaId: String(persona?.id ?? "").trim() || null,
  funcionario: String(persona?.funcionario ?? "").trim() || null,
  nombre: String(persona?.nombre ?? "").trim()
});

const resolverReferencia = (referencia, personal) => {
  const resuelta = resolverPersonaDesdeReferencia(referencia, personal);
  if (resuelta) return { persona: resuelta, advertencia: null };
  const nombre = typeof referencia === "string"
    ? normalizar(referencia)
    : normalizar(referencia?.nombre);
  const coincidencias = nombre
    ? personal.filter((persona) => normalizar(persona?.nombre) === nombre)
    : [];
  return {
    persona: null,
    advertencia: {
      codigo: coincidencias.length > 1 ? "IDENTIDAD_AMBIGUA" : "REFERENCIA_NO_RESUELTA",
      referencia
    }
  };
};

const personasUnicas = (personas, advertencias) => {
  const unicas = new Map();
  personas.forEach((persona) => {
    const clave = obtenerClaveIdentidadPersona(persona);
    if (!clave) {
      advertencias.push({ codigo: "PERSONA_SIN_IDENTIDAD", nombre: persona?.nombre || "" });
      return;
    }
    if (!unicas.has(clave)) unicas.set(clave, persona);
  });
  return [...unicas.values()];
};

const resultadoNoDisponible = ({ fecha, turno, categoria, errores }) => ({
  ok: false,
  disponible: false,
  fecha,
  turno,
  categoria,
  cohortePlanilla: null,
  libresProgramados: null,
  previstosBase: null,
  advertencias: [],
  errores
});

export const resolverCohortePlanillaDia = ({
  estadoMensual,
  fecha,
  turno,
  categoria,
  mes
} = {}) => {
  if (!TURNOS[turno] || !CATEGORIAS.has(categoria)) {
    return resultadoNoDisponible({
      fecha,
      turno,
      categoria,
      errores: [{ codigo: !TURNOS[turno] ? "TURNO_INVALIDO" : "CATEGORIA_INVALIDA" }]
    });
  }
  const periodo = resolverPeriodoPlanillaDia({
    estadoMensual,
    fecha,
    turno,
    categoria,
    mes
  });
  if (!periodo.ok) {
    return resultadoNoDisponible({ fecha, turno, categoria, errores: periodo.errores });
  }

  const fechaDia = claveFecha(fecha);
  const personal = Array.isArray(estadoMensual?.personal) ? estadoMensual.personal : [];
  const personalCategoria = personal.filter((persona) => persona?.categoria === categoria);
  const configuracion = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual,
    turno,
    categoria,
    mes
  });
  const filas = obtenerFilasActivas(configuracion?.filas)
    .filter((fila) => fila?.tipo === "sector" || fila?.tipo === "turnante")
    .sort((a, b) => a.orden - b.orden);
  const planilla = obtenerPlanillaCategoriaEstado(estadoMensual, categoria);
  const asignacionesParciales = obtenerAsignacionesParcialesPeriodo(
    planilla,
    periodo.clavePeriodo
  );
  const licencias = Array.isArray(estadoMensual?.licencias) ? estadoMensual.licencias : [];
  const evaluacionParciales = evaluarAsignacionesParcialesDia({
    distribucionBase: periodo.distribucion,
    asignacionesParciales,
    fecha: fechaDia,
    personal,
    esPersonaDisponible: (persona) => persona?.categoria === categoria,
    estaPersonaBaseDeLicencia: (personaBase, fechaEvaluada) =>
      estaDeLicencia(licencias, personaBase, parsearFechaLocal(fechaEvaluada), personal)
  });
  const advertencias = evaluacionParciales.conflictos.map((conflicto) => ({
    codigo: "ASIGNACION_PARCIAL_NO_APLICADA",
    motivo: conflicto.motivo,
    asignacionId: conflicto.asignacion?.id || null
  }));
  const personasDistribucion = [];
  filas.forEach((fila) => {
    const clave = resolverClaveDistribucionParaFila({
      distribucion: evaluacionParciales.distribucion,
      fila
    });
    if (clave === null) return;
    const referencia = evaluacionParciales.distribucion[clave];
    if (!referencia) return;
    const resolucion = resolverReferencia(referencia, personalCategoria);
    if (resolucion.persona) personasDistribucion.push(resolucion.persona);
    if (resolucion.advertencia) advertencias.push({
      ...resolucion.advertencia,
      filaId: fila.filaId || null,
      sectorId: fila.sectorId || null,
      turnanteId: fila.turnanteId || null
    });
  });

  const idsParcialesAplicadas = new Set(
    evaluacionParciales.aplicadas.map((asignacion) => String(asignacion.personaId))
  );
  const reintegros = detectarDisponiblesPorReintegro({
    personal,
    licencias,
    distribucionBase: periodo.distribucion,
    asignacionesParciales: [],
    periodo: periodo.periodo,
    mesActivo: mes,
    categoria
  });
  const reintegradosSinSector = filtrarReintegradosSinSectorDia({
    reintegros,
    fecha: fechaDia,
    idsParcialesAplicadas,
    categoria,
    esPersonaDisponible: (persona) => persona?.categoria === categoria
  });
  const cohorte = personasUnicas(
    [...personasDistribucion, ...reintegradosSinSector],
    advertencias
  );
  const fechaLocal = parsearFechaLocal(fechaDia);
  const libres = cohorte.filter((persona) => esDiaLibre(persona, fechaLocal, false));
  const libresIds = new Set(libres.map(obtenerClaveIdentidadPersona));
  const previstos = cohorte.filter(
    (persona) => !libresIds.has(obtenerClaveIdentidadPersona(persona))
  );

  return {
    ok: true,
    disponible: true,
    fecha: fechaDia,
    turno,
    categoria,
    periodo: { tipo: periodo.tipoPeriodo, clave: periodo.clavePeriodo },
    cohortePlanilla: { cantidad: cohorte.length, personas: cohorte.map(personaMinima) },
    libresProgramados: { cantidad: libres.length, personas: libres.map(personaMinima) },
    previstosBase: { cantidad: previstos.length, personas: previstos.map(personaMinima) },
    advertencias,
    errores: []
  };
};
