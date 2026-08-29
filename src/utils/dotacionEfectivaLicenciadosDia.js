import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { resolverEstructuraOperativaLicenciadosDia } from "./estructuraLicenciadosDinamica.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

const esLicenciado = (persona) =>
  Boolean(persona) && (!persona.categoria || persona.categoria === "licenciado");

export const resolverDotacionEfectivaLicenciadosDia = ({
  personalBase = [],
  extras = [],
  esPersonaUtilizable = () => true
} = {}) => {
  const identidades = new Map();
  const personasBaseDisponibles = [];
  const extrasUtilizables = [];

  const incorporar = (persona, destino, origen) => {
    if (!esLicenciado(persona) || !esPersonaUtilizable(persona, { origen })) return;
    const identidad = obtenerClaveIdentidadPersona(persona);
    if (!identidad || identidades.has(identidad)) return;
    identidades.set(identidad, persona);
    destino.push(persona);
  };

  lista(personalBase).forEach((persona) =>
    incorporar(persona, personasBaseDisponibles, "personal_base")
  );
  lista(extras).forEach((persona) =>
    incorporar(persona, extrasUtilizables, "extra")
  );

  return {
    personasBaseDisponibles,
    extrasUtilizables,
    identidadesOperativas: [...identidades.keys()],
    dotacionEfectiva: identidades.size
  };
};

export const resolverPerfilEstructuraLicenciadosDia = ({
  fecha = "",
  turno = "",
  prioridadTurno = [],
  personalBase = [],
  extras = [],
  esPersonaUtilizable = () => true
} = {}) => {
  const dotacion = resolverDotacionEfectivaLicenciadosDia({
    personalBase,
    extras,
    esPersonaUtilizable
  });
  const prioridadUsada = Array.isArray(prioridadTurno) ? [...prioridadTurno] : [];
  const resultado = resolverEstructuraOperativaLicenciadosDia({
    dotacionEfectiva: dotacion.dotacionEfectiva,
    prioridadTurno: prioridadUsada
  });

  return {
    fecha,
    turno,
    ...dotacion,
    prioridadUsada,
    resultado,
    modo: resultado.modo || "diagnostico",
    destinos: resultado.destinos || [],
    demandaAdicional: resultado.demandaAdicional || [],
    diagnostico: resultado.ok ? null : resultado.codigo
  };
};
