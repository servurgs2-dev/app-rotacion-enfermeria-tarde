import { obtenerFilasActivas } from "./configuracionPlanilla.js";

export const resolverEstructuraCalendario = ({
  configuracionEfectiva,
  ordenVisualLegacy = []
} = {}) => {
  const filasConfiguracion = obtenerFilasActivas(configuracionEfectiva?.filas)
    .sort((filaA, filaB) => filaA.orden - filaB.orden);
  const filas = filasConfiguracion.map((fila) => fila.etiqueta);
  const turnantes = filasConfiguracion
    .filter((fila) => fila.tipo === "turnante")
    .map((fila) => fila.etiqueta);
  const sectores = filasConfiguracion
    .filter((fila) => fila.tipo === "sector")
    .map((fila) => fila.etiqueta);
  return {
    filasConfiguracion,
    filas,
    turnantes,
    sectores,
    ordenVisual: configuracionEfectiva?.schemaVersion === null
      ? ordenVisualLegacy
      : [...sectores, "DIVIDER", "SIN ASIGNAR"]
  };
};
