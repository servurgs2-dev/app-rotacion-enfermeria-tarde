import { estaDeLicencia, keyDiaFromDate, parsearFechaLocal } from "./fechas.js";
import {
  resolverPersonalEfectivoPorTurnoFecha,
  resolverPersonalEfectivoPorTurnoPeriodo
} from "./padronVigenciasTurnoPersonal.js";
import {
  esReferenciaPersona,
  obtenerNombreDesdeReferencia,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";

const clonar = (valor) => {
  if (valor === undefined) return undefined;
  return globalThis.structuredClone
    ? globalThis.structuredClone(valor)
    : JSON.parse(JSON.stringify(valor));
};

const fechaIso = (valor) => valor instanceof Date ? keyDiaFromDate(valor) : String(valor || "");

export const resolverCohortePlanillaSemanal = ({
  padron,
  estadoCargaVigencias,
  turno,
  periodo,
  personalFisico = [],
  categoria
} = {}) => {
  const usarFallback = !padron ||
    estadoCargaVigencias?.cargando || estadoCargaVigencias?.error;
  const fisicas = Array.isArray(personalFisico) ? personalFisico : [];
  const resolucion = usarFallback
    ? { ok: true, origen: "legacy_fisico", personas: fisicas }
    : resolverPersonalEfectivoPorTurnoPeriodo({
        padron,
        turno,
        desde: fechaIso(periodo?.desde ?? periodo?.fechaInicio),
        hasta: fechaIso(periodo?.hasta ?? periodo?.fechaFin),
        personalFisico: fisicas
      });

  return {
    ...resolucion,
    personas: (resolucion.personas || [])
      .filter((persona) => !categoria || persona?.categoria === categoria)
      .map(clonar)
  };
};

const limitesPeriodoEnMes = ({ periodo, mes }) => {
  const desdePeriodo = fechaIso(periodo?.desde ?? periodo?.fechaInicio);
  const hastaPeriodo = fechaIso(periodo?.hasta ?? periodo?.fechaFin);
  const coincidenciaMes = /^(\d{4})-(\d{2})$/.exec(String(mes || ""));
  if (!coincidenciaMes) return null;
  const ultimoDia = new Date(
    Number(coincidenciaMes[1]),
    Number(coincidenciaMes[2]),
    0,
    12
  ).getDate();
  const desde = desdePeriodo < `${mes}-01` ? `${mes}-01` : desdePeriodo;
  const hastaMes = `${mes}-${String(ultimoDia).padStart(2, "0")}`;
  const hasta = hastaPeriodo > hastaMes ? hastaMes : hastaPeriodo;
  return desde && hasta && desde <= hasta ? { desde, hasta } : null;
};

export const resolverPersonalPlanificablePeriodo = ({
  padron,
  estadoCargaVigencias,
  turno,
  periodo,
  mes,
  personalFisico = [],
  categoria,
  licencias = []
} = {}) => {
  const cohorte = resolverCohortePlanillaSemanal({
    padron,
    estadoCargaVigencias,
    turno,
    periodo,
    personalFisico,
    categoria
  });
  const limites = limitesPeriodoEnMes({ periodo, mes: mes || padron?.mes });
  if (!limites || cohorte.personas.length === 0) return cohorte;

  const usarFallback = !padron || estadoCargaVigencias?.cargando || estadoCargaVigencias?.error;
  const personalCanonico = padron?.personas
    ?.map((entrada) => entrada?.persona)
    .filter(Boolean) || personalFisico;
  const idsPlanificables = new Set();

  for (
    let fecha = parsearFechaLocal(limites.desde);
    keyDiaFromDate(fecha) <= limites.hasta;
    fecha.setDate(fecha.getDate() + 1)
  ) {
    const fechaIsoActual = keyDiaFromDate(fecha);
    const idsEfectivos = usarFallback
      ? new Set(cohorte.personas.map((persona) => String(persona?.id || "")))
      : new Set(resolverPersonalEfectivoPorTurnoFecha({
          padron,
          turno,
          fecha: fechaIsoActual,
          personalFisico
        }).personas.map((persona) => String(persona?.id || "")));

    cohorte.personas.forEach((persona) => {
      const personaId = String(persona?.id || "");
      if (
        personaId && idsEfectivos.has(personaId) &&
        !estaDeLicencia(licencias, persona, fecha, personalCanonico)
      ) idsPlanificables.add(personaId);
    });
  }

  return {
    ...cohorte,
    personas: cohorte.personas.filter((persona) =>
      idsPlanificables.has(String(persona?.id || ""))
    )
  };
};

export const resolverReferenciaPlanillaSemanal = ({
  referencia,
  personalPeriodo = [],
  marcarFueraDeVigencia = true
} = {}) => {
  const persona = resolverPersonaDesdeReferencia(referencia, personalPeriodo);
  const nombre = obtenerNombreDesdeReferencia(referencia, personalPeriodo);
  return {
    persona: persona ? clonar(persona) : null,
    nombre,
    fueraDeVigencia: Boolean(
      marcarFueraDeVigencia && esReferenciaPersona(referencia) && !persona
    )
  };
};

export const obtenerPersonasSinAsignarPlanillaSemanal = ({
  personalPeriodo = [],
  distribucion = {}
} = {}) => {
  const idsPeriodo = new Set(
    personalPeriodo.map((persona) => String(persona?.id || "")).filter(Boolean)
  );
  const asignadas = new Set(
    Object.values(distribucion || {})
      .map((referencia) => {
        const idExplicito = referencia && typeof referencia === "object"
          ? String(referencia.personaId ?? referencia.id ?? "").trim()
          : "";
        if (idExplicito) return idsPeriodo.has(idExplicito) ? idExplicito : null;
        return resolverPersonaDesdeReferencia(referencia, personalPeriodo)?.id;
      })
      .filter(Boolean)
      .map(String)
  );
  return personalPeriodo
    .filter((persona) => !asignadas.has(String(persona?.id || "")))
    .map(clonar);
};
