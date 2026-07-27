const SEMANAS_PLANILLA = [
  "semana1",
  "semana2",
  "semana3",
  "semana4",
  "semana5",
  "semana6"
];

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const tieneContenidoSignificativo = (valor) => {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim() !== "";
  if (typeof valor === "boolean") return valor;
  if (Array.isArray(valor)) return valor.some(tieneContenidoSignificativo);
  if (esObjeto(valor)) {
    return Object.values(valor).some(tieneContenidoSignificativo);
  }
  return true;
};

export const estaPlanillaVacia = ({
  planilla,
  tipo,
  usaRotacionTresDias = false
} = {}) => {
  if (!esObjeto(planilla)) return true;

  if (usaRotacionTresDias && tipo === "enfermero") {
    const rotacion = planilla.rotacion3Dias;
    return (
      !tieneContenidoSignificativo(rotacion?.asignacionBase) &&
      !tieneContenidoSignificativo(rotacion?.bloques) &&
      !tieneContenidoSignificativo(rotacion?.coberturaLibreSM) &&
      !tieneContenidoSignificativo(planilla.generacionFlexible)
    );
  }

  return (
    SEMANAS_PLANILLA.every(
      (semana) => !tieneContenidoSignificativo(planilla[semana])
    ) &&
    !tieneContenidoSignificativo(planilla.coberturaLibreSM) &&
    (
      tipo !== "enfermero" ||
      !tieneContenidoSignificativo(planilla.generacionFlexible)
    )
  );
};

export const reiniciarMesEnEstado = ({
  estadoPorTurnoMes,
  clave,
  crearEstadoVacio
}) => {
  if (!clave || typeof crearEstadoVacio !== "function") return estadoPorTurnoMes;
  return {
    ...estadoPorTurnoMes,
    [clave]: crearEstadoVacio()
  };
};

export const vaciarPlanillaMensual = ({
  planilla,
  tipo,
  usaRotacionTresDias = false
} = {}) => {
  const actual = esObjeto(planilla) ? planilla : {};
  const base = tipo === "enfermero"
    ? Object.fromEntries(
        Object.entries(actual).filter(([clave]) => clave !== "generacionFlexible")
      )
    : actual;

  if (usaRotacionTresDias && tipo === "enfermero") {
    return {
      ...base,
      rotacion3Dias: {
        ...(esObjeto(base.rotacion3Dias) ? base.rotacion3Dias : {}),
        asignacionBase: {},
        bloques: {},
        coberturaLibreSM: {}
      }
    };
  }

  return {
    ...base,
    ...Object.fromEntries(SEMANAS_PLANILLA.map((semana) => [semana, {}])),
    coberturaLibreSM: {}
  };
};

export const describirContenidoAEliminar = ({
  tipo,
  usaRotacionTresDias = false
} = {}) => {
  if (usaRotacionTresDias && tipo === "enfermero") {
    return [
      "la asignación base",
      "los bloques de tres días",
      "la cobertura de Salud Mental",
      "la configuración flexible de esta generación"
    ];
  }

  return [
    "las asignaciones de las semanas 1 a 6",
    "la cobertura de Salud Mental",
    ...(tipo === "enfermero"
      ? ["la configuración flexible de esta generación"]
      : [])
  ];
};

export const validarContextoLimpieza = (esperado, actual) => {
  if (!esperado || !actual) return false;
  return (
    esperado.turnoId === actual.turnoId &&
    esperado.mesActivo === actual.mesActivo &&
    esperado.tipo === actual.tipo &&
    esperado.estrategia === actual.estrategia &&
    esperado.soloLectura === actual.soloLectura &&
    esperado.versionHistoricaActiva === actual.versionHistoricaActiva
  );
};

export { SEMANAS_PLANILLA };
