import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

export const resolverDestinosCriticosCalendario = ({
  categoria,
  versionEstructura,
  asignaciones,
  sectoresCriticosIds = [],
  sectoresCriticosLegacy = []
} = {}) => {
  const filas = lista(asignaciones).filter((fila) => fila?.tipo === "sector");
  const esLicenciadoV2 = categoria === "licenciado" &&
    resolverVersionEstructuraLicenciados(versionEstructura) ===
      VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  if (!esLicenciadoV2) {
    const criticos = new Set(sectoresCriticosIds);
    const criticosLegacy = new Set(sectoresCriticosLegacy);
    return filas.filter((fila) => fila.sectorId
      ? criticos.has(fila.sectorId)
      : criticosLegacy.has(fila.nombre));
  }

  const criticos = new Set(sectoresCriticosIds);
  const resultado = filas.filter((fila) => {
    const destinoId = fila.destinoId || fila.sectorId;
    return destinoId &&
      destinoId !== "reanimacion" &&
      destinoId !== "reanimacion_sillones" &&
      criticos.has(destinoId);
  });
  if (criticos.has("reanimacion_sillones")) {
    const destinoReanimacion = filas.find((fila) => {
      const destinoId = fila.destinoId || fila.sectorId;
      return destinoId === "reanimacion" ||
        destinoId === "reanimacion_sillones" ||
        lista(fila.componentes).includes("reanimacion");
    });
    if (destinoReanimacion) resultado.push(destinoReanimacion);
  }
  return [...new Set(resultado)];
};

export const obtenerSectoresCriticosSinCobertura = ({
  asignaciones,
  sectoresCriticosIds = [],
  sectoresCriticosLegacy = [],
  categoria,
  versionEstructura
} = {}) => {
  return resolverDestinosCriticosCalendario({
    categoria,
    versionEstructura,
    asignaciones,
    sectoresCriticosIds,
    sectoresCriticosLegacy
  })
    .filter((fila) => !fila?.enfermero)
    .map((fila) => fila.etiqueta || fila.nombre)
    .filter(Boolean);
};

export const formatearAlertaSectoresCriticos = (sectores) => {
  const lista = Array.isArray(sectores) ? sectores.filter(Boolean) : [];
  if (lista.length === 0) return "";
  const nombres = new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(lista);
  return lista.length === 1
    ? `Sector crítico sin cobertura: ${nombres}`
    : `Sectores críticos sin cobertura: ${nombres}`;
};
