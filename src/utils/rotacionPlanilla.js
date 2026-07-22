import {
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";

const clonarAsignacion = (referencia) =>
  referencia && typeof referencia === "object"
    ? { ...referencia }
    : referencia;

const clonarDistribucion = (distribucion) => Object.fromEntries(
  Object.entries(distribucion || {}).map(([fila, referencia]) => [
    fila,
    clonarAsignacion(referencia)
  ])
);

export const clonarCoberturaLibreSM = (coberturas) => {
  if (!coberturas || typeof coberturas !== "object" || Array.isArray(coberturas)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(coberturas).flatMap(([clave, referencia]) => {
      if (!referencia || typeof referencia !== "object" || Array.isArray(referencia)) {
        return [];
      }
      const personaId = String(referencia.personaId ?? "").trim();
      if (!personaId) return [];

      return [[clave, {
        personaId,
        nombre: String(referencia.nombre ?? "").trim()
      }]];
    })
  );
};

const rotarValores = (valores, pasos) => {
  const copia = valores.map(clonarAsignacion);
  if (copia.length === 0) return copia;

  const pasosNormalizados = ((pasos % copia.length) + copia.length) % copia.length;
  if (pasosNormalizados === 0) return copia;
  return [
    ...copia.slice(-pasosNormalizados),
    ...copia.slice(0, -pasosNormalizados)
  ];
};

const obtenerIdReferencia = (referencia) => {
  if (referencia && typeof referencia === "object") {
    return String(referencia.personaId ?? referencia.id ?? "").trim();
  }
  return typeof referencia === "string" && referencia.startsWith("persona-")
    ? referencia.trim()
    : "";
};

export const rotarDistribucionPorPasos = ({
  distribucionBase,
  filas,
  filasFijas = [],
  pasos = 0
} = {}) => {
  const base = distribucionBase && typeof distribucionBase === "object"
    ? distribucionBase
    : {};
  const filasValidas = Array.isArray(filas) ? filas : [];
  const fijas = new Set(Array.isArray(filasFijas) ? filasFijas : []);
  const filasRotables = filasValidas.filter((fila) => !fijas.has(fila));
  const referenciasFijas = new Set(
    [...fijas].map((fila) => obtenerIdReferencia(base[fila])).filter(Boolean)
  );
  const referenciasRotadas = rotarValores(
    filasRotables.map((fila) => base[fila] || ""),
    pasos
  );
  const resultado = {};

  filasRotables.forEach((fila, indice) => {
    const referencia = referenciasRotadas[indice];
    resultado[fila] = referenciasFijas.has(obtenerIdReferencia(referencia))
      ? ""
      : clonarAsignacion(referencia);
  });
  [...fijas].forEach((fila) => {
    resultado[fila] = clonarAsignacion(base[fila] || "");
  });

  return resultado;
};

export const generarDistribucionParaIndice = ({
  distribucionBase,
  filas,
  filasFijas = [],
  indice = 0
} = {}) => rotarDistribucionPorPasos({
  distribucionBase,
  filas,
  filasFijas,
  pasos: indice
});

export const generarBloquesFaltantes = ({
  rotacion3Dias,
  periodos,
  filas,
  filasFijas = []
} = {}) => {
  const rotacion = rotacion3Dias && typeof rotacion3Dias === "object"
    ? rotacion3Dias
    : {};
  const bloquesExistentes = rotacion.bloques && typeof rotacion.bloques === "object"
    ? rotacion.bloques
    : {};
  const bloques = Object.fromEntries(
    Object.entries(bloquesExistentes).map(([clave, distribucion]) => [
      clave,
      clonarDistribucion(distribucion)
    ])
  );

  (Array.isArray(periodos) ? periodos : []).forEach((periodo) => {
    if (!periodo?.clave || Object.hasOwn(bloquesExistentes, periodo.clave)) return;
    bloques[periodo.clave] = generarDistribucionParaIndice({
      distribucionBase: rotacion.asignacionBase,
      filas,
      filasFijas,
      indice: periodo.indice
    });
  });

  return {
    ...rotacion,
    asignacionBase: clonarDistribucion(rotacion.asignacionBase),
    bloques,
    coberturaLibreSM: clonarCoberturaLibreSM(rotacion.coberturaLibreSM)
  };
};

export const inicializarRotacion3DiasDesdeSemana1 = ({
  planillaEnfermeros,
  fechaBase,
  duracionDias
} = {}) => {
  const planilla = planillaEnfermeros && typeof planillaEnfermeros === "object"
    ? planillaEnfermeros
    : {};
  const existente = planilla.rotacion3Dias && typeof planilla.rotacion3Dias === "object"
    ? planilla.rotacion3Dias
    : {};
  const tieneBase = existente.asignacionBase &&
    typeof existente.asignacionBase === "object" &&
    Object.keys(existente.asignacionBase).length > 0;
  const asignacionBase = clonarDistribucion(
    tieneBase ? existente.asignacionBase : planilla.semana1
  );
  const bloquesExistentes = existente.bloques && typeof existente.bloques === "object"
    ? existente.bloques
    : {};
  const bloques = Object.fromEntries(
    Object.entries(bloquesExistentes).map(([clave, distribucion]) => [
      clave,
      clonarDistribucion(distribucion)
    ])
  );

  if (fechaBase && !Object.hasOwn(bloquesExistentes, fechaBase)) {
    bloques[fechaBase] = clonarDistribucion(asignacionBase);
  }

  return {
    ...planilla,
    rotacion3Dias: {
      ...existente,
      version: existente.version ?? 1,
      fechaBase: existente.fechaBase || fechaBase,
      duracionDias: existente.duracionDias || duracionDias,
      asignacionBase,
      bloques,
      coberturaLibreSM: clonarCoberturaLibreSM(existente.coberturaLibreSM)
    }
  };
};

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

  const nuevaPlanilla = {
    ...planilla,
    semana1,
    semana6: planilla?.semana6 || {}
  };

  semanas.slice(1).forEach((semana, indiceSemana) => {
    const referenciasRotadas = rotarValores(baseRotable, indiceSemana + 1);
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
