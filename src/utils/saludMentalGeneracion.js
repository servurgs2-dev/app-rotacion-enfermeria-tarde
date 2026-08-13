import { obtenerAliasesSector } from "./configuracionPlanilla.js";
import { resolverClaveDistribucionParaFila } from "./resolucionIdentidadesPlanilla.js";

export const SECTOR_ID_SALUD_MENTAL_GENERACION = "salud_mental";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const obtenerFilaSaludMentalActiva = (filas = []) => {
  const fila = (Array.isArray(filas) ? filas : []).find(
    (item) => item?.tipo === "sector" &&
      item.sectorId === SECTOR_ID_SALUD_MENTAL_GENERACION &&
      item.activo !== false
  );
  return fila ? { ...fila } : null;
};

export const obtenerReferenciaSaludMental = ({ distribucion, fila } = {}) => {
  const clave = resolverClaveDistribucionParaFila({ distribucion, fila });
  return clave === null ? "" : distribucion[clave];
};

export const adaptarDistribucionSaludMental = ({
  distribucion,
  filasConfiguracion = []
} = {}) => {
  const base = esObjeto(distribucion) ? { ...distribucion } : {};
  const filaConfigurada = (Array.isArray(filasConfiguracion) ? filasConfiguracion : [])
    .find((fila) => fila?.tipo === "sector" &&
      fila.sectorId === SECTOR_ID_SALUD_MENTAL_GENERACION);
  const filaActiva = obtenerFilaSaludMentalActiva(filasConfiguracion);
  const clavesConocidas = new Set([
    filaConfigurada?.etiqueta,
    ...obtenerAliasesSector(SECTOR_ID_SALUD_MENTAL_GENERACION)
  ].filter(Boolean));

  if (!filaActiva) {
    clavesConocidas.forEach((clave) => { delete base[clave]; });
    return base;
  }

  const claveOrigen = resolverClaveDistribucionParaFila({
    distribucion: base,
    fila: filaActiva
  });
  const referencia = claveOrigen === null ? "" : base[claveOrigen];
  clavesConocidas.forEach((clave) => { delete base[clave]; });
  base[filaActiva.etiqueta] = referencia;
  return base;
};

export const adaptarPlanillaSaludMental = ({
  planilla,
  filasConfiguracion = []
} = {}) => {
  const base = esObjeto(planilla) ? { ...planilla } : {};
  for (let numero = 1; numero <= 6; numero += 1) {
    const clave = `semana${numero}`;
    if (esObjeto(base[clave])) {
      base[clave] = adaptarDistribucionSaludMental({
        distribucion: base[clave],
        filasConfiguracion
      });
    }
  }
  if (esObjeto(base.rotacion3Dias)) {
    const rotacion = { ...base.rotacion3Dias };
    if (esObjeto(rotacion.asignacionBase)) {
      rotacion.asignacionBase = adaptarDistribucionSaludMental({
        distribucion: rotacion.asignacionBase,
        filasConfiguracion
      });
    }
    if (esObjeto(rotacion.bloques)) {
      rotacion.bloques = Object.fromEntries(
        Object.entries(rotacion.bloques).map(([clave, distribucion]) => [
          clave,
          adaptarDistribucionSaludMental({ distribucion, filasConfiguracion })
        ])
      );
    }
    base.rotacion3Dias = rotacion;
  }
  return base;
};
