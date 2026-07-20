import {
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";

const clonarAsignacion = (referencia) =>
  referencia && typeof referencia === "object"
    ? { ...referencia }
    : referencia;

export const generarRotacionMensual = ({
  planilla,
  filas,
  semanas,
  filaFija,
  personal
}) => {
  const semana1 = planilla?.semana1 || {};
  const filasRotables = filas.filter((fila) => fila !== filaFija);
  const baseRotable = filasRotables.map((fila) => semana1[fila] || "");
  const tieneAsignacionFija = Object.prototype.hasOwnProperty.call(semana1, filaFija);
  const referenciaFija = tieneAsignacionFija ? semana1[filaFija] : "";
  const personaFija = resolverPersonaDesdeReferencia(referenciaFija, personal);

  const correspondeAFija = (referencia) => {
    if (!personaFija) return false;
    return referenciaCorrespondeAPersona(referencia, personaFija, personal);
  };

  const rotar = (array, pasos) => {
    const copia = [...array];
    for (let indice = 0; indice < pasos; indice += 1) {
      copia.unshift(copia.pop());
    }
    return copia;
  };

  const nuevaPlanilla = {
    ...planilla,
    semana1,
    semana6: planilla?.semana6 || {}
  };

  semanas.slice(1).forEach((semana, indiceSemana) => {
    const referenciasRotadas = rotar(baseRotable, indiceSemana + 1);
    const semanaGenerada = {};

    filasRotables.forEach((fila, indiceFila) => {
      const referencia = referenciasRotadas[indiceFila];
      semanaGenerada[fila] = correspondeAFija(referencia)
        ? ""
        : clonarAsignacion(referencia);
    });

    semanaGenerada[filaFija] = clonarAsignacion(referenciaFija);
    nuevaPlanilla[semana.clave] = semanaGenerada;
  });

  return nuevaPlanilla;
};
