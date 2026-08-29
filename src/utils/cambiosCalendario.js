import { crearReferenciaPersona } from "./referenciasPersonas.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { normalizar } from "./texto.js";
import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";

export const VACANTE_OPERATIVA = "__OPERATIONAL_VACANCY__";

export const crearValorCambioCalendario = (persona) =>
  crearReferenciaPersona(persona);

export const resolverClaveMovimientoCalendario = ({
  fila,
  categoria,
  versionEstructura
} = {}) => {
  const esLicenciadoV2 = categoria === "licenciado" &&
    resolverVersionEstructuraLicenciados(versionEstructura) ===
      VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  if (!esLicenciadoV2) return normalizar(fila?.nombre || fila?.etiqueta || "");
  return fila?.destinoId || fila?.sectorId || fila?.filaId || fila?.turnanteId || "";
};

export const crearMovimientosEntreFilasCalendario = ({
  seleccionado,
  destino,
  resolverClave
} = {}) => {
  if (!seleccionado?.enfermero || !destino) return [];
  const origenEsSinAsignar = normalizar(seleccionado.nombre) === "SIN ASIGNAR";
  const destinoEsSinAsignar = normalizar(destino.nombre) === "SIN ASIGNAR";
  const movimiento = (fila, datos) => ({
    sector: fila.nombre,
    ...(typeof resolverClave === "function" && resolverClave(fila)
      ? { clave: resolverClave(fila) }
      : {}),
    ...datos
  });

  if (destinoEsSinAsignar && !origenEsSinAsignar) {
    return [movimiento(seleccionado, { vacioOperativo: true })];
  }

  return [
    movimiento(destino, { persona: seleccionado.enfermero }),
    movimiento(seleccionado, { persona: destino.enfermero, vacio: !destino.enfermero })
  ];
};

export const aplicarMovimientosCalendario = ({
  cambios,
  movimientos
}) => {
  const resultado = { ...(cambios || {}) };

  movimientos.forEach(({ sector, clave, persona, vacio = false, vacioOperativo = false }) => {
    resultado[clave || normalizar(sector)] = vacioOperativo
      ? VACANTE_OPERATIVA
      : vacio
        ? "__EMPTY__"
        : crearValorCambioCalendario(persona);
  });

  return resultado;
};

export const aplicarMovimientosOperativosCalendarioV2 = ({
  asignaciones = [],
  cambios = {},
  personalDisponible = []
} = {}) => {
  const resultado = (Array.isArray(asignaciones) ? asignaciones : []).map((fila) => ({ ...fila }));
  const aplicables = resultado.flatMap((fila, indice) => {
    const clave = fila?.destinoId || fila?.sectorId || fila?.filaId || fila?.turnanteId;
    return clave && Object.hasOwn(cambios || {}, clave)
      ? [{ indice, clave, valor: cambios[clave] }]
      : [];
  });
  const reservas = new Map();
  aplicables.forEach(({ indice, valor }) => {
    if (!valor || valor === "__EMPTY__" || valor === VACANTE_OPERATIVA) return;
    const persona = resolverPersonaDesdeReferencia(valor, personalDisponible);
    const identidad = obtenerClaveIdentidadPersona(persona);
    if (identidad && !reservas.has(identidad)) reservas.set(identidad, { indice, persona });
  });

  resultado.forEach((fila, indice) => {
    const identidad = obtenerClaveIdentidadPersona(fila.enfermero);
    const reserva = identidad ? reservas.get(identidad) : null;
    if (reserva && reserva.indice !== indice) fila.enfermero = null;
  });
  aplicables.forEach(({ indice, valor }) => {
    const fila = resultado[indice];
    if (valor === "__EMPTY__" || valor === VACANTE_OPERATIVA) {
      fila.enfermero = null;
      fila.vacioManual = valor === "__EMPTY__";
      fila.vacioOperativo = valor === VACANTE_OPERATIVA;
      fila.cambioManualProtegido = valor === "__EMPTY__";
      return;
    }
    const persona = resolverPersonaDesdeReferencia(valor, personalDisponible);
    const identidad = obtenerClaveIdentidadPersona(persona);
    const reserva = identidad ? reservas.get(identidad) : null;
    fila.enfermero = reserva?.indice === indice ? reserva.persona : null;
    fila.vacioManual = false;
    fila.vacioOperativo = false;
    fila.cambioManualProtegido = Boolean(fila.enfermero);
  });
  return resultado;
};
