const clonarReferencia = (referencia) =>
  referencia && typeof referencia === "object" && !Array.isArray(referencia)
    ? { ...referencia }
    : referencia;

const clonarReferencias = (semana) => {
  if (!semana || typeof semana !== "object" || Array.isArray(semana)) {
    return semana;
  }

  return Object.fromEntries(
    Object.entries(semana).map(([sector, referencia]) => [
      sector,
      clonarReferencia(referencia)
    ])
  );
};

export const continuarPlanillasDesdeMesAnterior = (
  estadoActual,
  {
    planillaVacia,
    baseEnfermeros,
    baseLicenciados,
    coberturaEnfermeros,
    coberturaLicenciados
  }
) => ({
  ...estadoActual,
  planillas: {
    ...estadoActual.planillas,
    ...(baseEnfermeros
      ? {
          enfermeros: {
            ...planillaVacia(),
            semana1: clonarReferencias(baseEnfermeros),
            coberturaLibreSM: coberturaEnfermeros
              ? { semana1: clonarReferencia(coberturaEnfermeros) }
              : {}
          }
        }
      : {}),
    ...(baseLicenciados
      ? {
          licenciados: {
            ...planillaVacia(),
            semana1: clonarReferencias(baseLicenciados),
            coberturaLibreSM: coberturaLicenciados
              ? { semana1: clonarReferencia(coberturaLicenciados) }
              : {}
          }
        }
      : {})
  }
});

export const clasificarResultadoCarga = ({ error, resultado, estadoPrevio }) => {
  if (error) {
    return { tipo: "error", estado: estadoPrevio ?? null };
  }
  if (resultado?.existe) {
    return { tipo: "existente", estado: resultado.estado };
  }
  return { tipo: "inexistente", estado: null };
};

export const esCargaVigente = (cargaEsperada, cargaActual) =>
  Boolean(
    cargaEsperada &&
    cargaActual &&
    cargaEsperada.id === cargaActual.id &&
    cargaEsperada.clave === cargaActual.clave
  );

export const hayCambiosLocalesPendientes = ({
  clave,
  estadoPrevio,
  referenciaConocida,
  cola,
  debounces,
  erroresGuardado,
  claveGuardadoEnCurso
}) => Boolean(
  cola?.has(clave) ||
  debounces?.has(clave) ||
  erroresGuardado?.has(clave) ||
  claveGuardadoEnCurso === clave ||
  (estadoPrevio && referenciaConocida !== estadoPrevio)
);
