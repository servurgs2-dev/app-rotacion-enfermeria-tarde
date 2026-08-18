import { estaDeLicencia, parsearFechaLocal } from "./fechas.js";
import { licenciaCorrespondeAPersona } from "./licenciasPersonas.js";
import {
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";

const obtenerLimitesPeriodo = (periodo) => {
  const desde = periodo?.desde || periodo?.fechaInicio;
  const hasta = periodo?.hasta || periodo?.fechaFin;
  return {
    desde: desde instanceof Date ? desde : parsearFechaLocal(desde),
    hasta: hasta instanceof Date ? hasta : parsearFechaLocal(hasta)
  };
};

const obtenerLicenciaSuperpuesta = ({
  persona,
  licencias,
  personal,
  periodo
}) => {
  const limites = obtenerLimitesPeriodo(periodo);
  return (Array.isArray(licencias) ? licencias : [])
    .filter((licencia) =>
      licenciaCorrespondeAPersona(licencia, persona, personal)
    )
    .filter((licencia) => {
      const desde = parsearFechaLocal(licencia.desde);
      const hasta = parsearFechaLocal(licencia.hasta);
      return desde <= limites.hasta && hasta >= limites.desde;
    })
    .sort((a, b) => String(b.hasta).localeCompare(String(a.hasta)))[0] || null;
};

const fechaCorta = (valor) => {
  const [, mes, dia] = String(valor || "").split("-");
  return dia && mes ? `${dia}/${mes}` : valor || "";
};

const sumarDias = (fecha, cantidad) => {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + cantidad);
  return resultado;
};

export const personaTieneAlMenosUnDiaDisponibleEnPeriodo = ({
  persona,
  licencias = [],
  personal = [],
  periodo
} = {}) => {
  const { desde, hasta } = obtenerLimitesPeriodo(periodo);
  if (
    !(desde instanceof Date) || Number.isNaN(desde.getTime()) ||
    !(hasta instanceof Date) || Number.isNaN(hasta.getTime()) ||
    desde > hasta
  ) return false;

  for (let fecha = new Date(desde); fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    if (!estaDeLicencia(licencias, persona, fecha, personal)) return true;
  }
  return false;
};

export const obtenerOpcionesSelectorPlanilla = ({
  personalCategoria = [],
  personal = [],
  distribucion = {},
  sector,
  referenciaActual,
  licencias = [],
  periodo
} = {}) => {
  const personaActual = resolverPersonaDesdeReferencia(referenciaActual, personal);
  const opcionesNormales = personalCategoria.filter((persona) => {
    const disponible = !Object.entries(distribucion).some(
      ([otroSector, referencia]) =>
        otroSector !== sector &&
        referenciaCorrespondeAPersona(referencia, persona, personal)
    );
    const tieneDiaDisponible = personaTieneAlMenosUnDiaDisponibleEnPeriodo({
      persona,
      licencias,
      personal,
      periodo
    });
    return disponible && tieneDiaDisponible;
  });
  const actualIncluida = personaActual && opcionesNormales.some(
    (persona) => String(persona.id) === String(personaActual.id)
  );
  const licenciaActual = personaActual
    ? obtenerLicenciaSuperpuesta({
        persona: personaActual,
        licencias,
        personal,
        periodo
      })
    : null;
  const opcionActual = personaActual && !actualIncluida
    ? {
        persona: personaActual,
        esActualReincorporada: true,
        etiquetaEstado: licenciaActual
          ? `licencia hasta ${fechaCorta(licenciaActual.hasta)}`
          : "asignación actual"
      }
    : null;

  return {
    personaActual,
    opciones: [
      ...(opcionActual ? [opcionActual] : []),
      ...opcionesNormales.map((persona) => ({
        persona,
        esActualReincorporada: false,
        etiquetaEstado: (() => {
          const licencia = obtenerLicenciaSuperpuesta({
            persona,
            licencias,
            personal,
            periodo
          });
          return licencia ? `licencia hasta ${fechaCorta(licencia.hasta)}` : "";
        })()
      }))
    ]
  };
};
