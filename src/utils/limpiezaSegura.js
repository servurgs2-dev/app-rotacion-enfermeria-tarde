import { sincronizarAsignacionBaseDesdeBloqueReferencia } from "./rotacionPlanilla.js";

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
      !tieneContenidoSignificativo(planilla.generacionFlexible) &&
      !tieneContenidoSignificativo(planilla.asignacionesParciales)
    );
  }

  return (
    SEMANAS_PLANILLA.every(
      (semana) => !tieneContenidoSignificativo(planilla[semana])
    ) &&
    !tieneContenidoSignificativo(planilla.coberturaLibreSM) &&
    !tieneContenidoSignificativo(planilla.asignacionesParciales) &&
    !tieneContenidoSignificativo(planilla.generacionFlexible)
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
  const base = Object.fromEntries(
    Object.entries(actual).filter(
      ([clave]) =>
        clave !== "asignacionesParciales" &&
        clave !== "generacionFlexible"
    )
  );

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

const esClaveSemanaPosterior = (clave) =>
  /^semana\d+$/.test(clave) && clave !== "semana1";

const vaciarDistribucionExistente = (distribucion) => {
  if (!esObjeto(distribucion)) return {};
  return Object.fromEntries(
    Object.keys(distribucion).map((fila) => [fila, ""])
  );
};

export const vaciarPlanillaDesdeSemana2 = ({ planilla } = {}) => {
  const actual = esObjeto(planilla) ? planilla : {};
  const resultado = {
    ...actual,
    ...Object.fromEntries(
      Object.entries(actual)
        .filter(([clave]) => esClaveSemanaPosterior(clave))
        .map(([clave, distribucion]) => [
          clave,
          vaciarDistribucionExistente(distribucion)
        ])
    )
  };

  if (esObjeto(actual.asignacionesParciales)) {
    resultado.asignacionesParciales = Object.fromEntries(
      Object.entries(actual.asignacionesParciales)
        .filter(([clave]) => !esClaveSemanaPosterior(clave))
        .map(([clave, asignaciones]) => [clave, asignaciones])
    );
  }

  return resultado;
};

export const vaciarPlanillaDesdeBloque2 = ({
  planilla,
  periodos,
  filas,
  filasFijas = [],
  posicionesNoAplicables = []
} = {}) => {
  const actual = esObjeto(planilla) ? planilla : {};
  const rotacion = esObjeto(actual.rotacion3Dias) ? actual.rotacion3Dias : {};
  const periodosValidos = (Array.isArray(periodos) ? periodos : [])
    .filter((periodo) => periodo?.clave && Number.isInteger(periodo.indice));
  const referencia = periodosValidos[0];
  if (!referencia) return actual;
  const clavesPosteriores = new Set(
    periodosValidos.slice(1).map((periodo) => periodo.clave)
  );
  const bloques = esObjeto(rotacion.bloques) ? rotacion.bloques : {};
  const bloquesLimpios = Object.fromEntries(
    Object.entries(bloques).map(([clave, distribucion]) => [
      clave,
      clavesPosteriores.has(clave)
        ? vaciarDistribucionExistente(distribucion)
        : distribucion
    ])
  );
  const sincronizacion = sincronizarAsignacionBaseDesdeBloqueReferencia({
    rotacion3Dias: rotacion,
    periodoReferencia: referencia,
    bloqueReferencia: bloquesLimpios[referencia.clave],
    filas,
    filasFijas,
    posicionesNoAplicables
  });
  const coberturaLibreSM = esObjeto(rotacion.coberturaLibreSM)
    ? Object.fromEntries(
        Object.entries(rotacion.coberturaLibreSM)
          .filter(([clave]) => !clavesPosteriores.has(clave))
      )
    : {};
  const asignacionesParciales = esObjeto(actual.asignacionesParciales)
    ? Object.fromEntries(
        Object.entries(actual.asignacionesParciales)
          .filter(([clave]) => !clavesPosteriores.has(clave))
      )
    : undefined;

  return {
    ...actual,
    ...(asignacionesParciales === undefined ? {} : { asignacionesParciales }),
    rotacion3Dias: {
      ...(sincronizacion.ok ? sincronizacion.rotacion3Dias : rotacion),
      bloques: bloquesLimpios,
      coberturaLibreSM
    }
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
      "la configuración flexible de esta generación",
      "las asignaciones parciales por reintegro"
    ];
  }

  return [
    "las asignaciones de las semanas 1 a 6",
    "la cobertura de Salud Mental",
    "las asignaciones parciales por reintegro",
    "la configuración flexible de esta generación"
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
