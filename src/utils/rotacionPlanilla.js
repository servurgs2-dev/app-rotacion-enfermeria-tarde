import {
  aplicarAsignacionesFijasADistribucion,
  ErrorGeneracionAsignacionesFijas,
  validarAsignacionesFijasMensuales
} from "./asignacionesFijasMensuales.js";
import {
  crearReferenciaPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { resolverClaveDistribucionParaFila } from "./resolucionIdentidadesPlanilla.js";
import {
  obtenerEtiquetasFilasPlanilla,
  obtenerFilasActivas
} from "./configuracionPlanilla.js";
import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";

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
  posicionesNoAplicables = [],
  pasos = 0
} = {}) => {
  const base = distribucionBase && typeof distribucionBase === "object"
    ? distribucionBase
    : {};
  const filasValidas = Array.isArray(filas) ? filas : [];
  const fijas = new Set(Array.isArray(filasFijas) ? filasFijas : []);
  const excluidas = new Set(
    Array.isArray(posicionesNoAplicables) ? posicionesNoAplicables : []
  );
  const filasRotables = filasValidas.filter(
    (fila) => !fijas.has(fila) && !excluidas.has(fila)
  );
  const referenciasFijas = new Set(
    [...fijas]
      .filter((fila) => !excluidas.has(fila))
      .map((fila) => obtenerIdReferencia(base[fila]))
      .filter(Boolean)
  );
  const referenciasRotadas = rotarValores(
    filasRotables.map((fila) => base[fila] || ""),
    pasos
  );
  const resultado = Object.fromEntries(filasValidas.map((fila) => [fila, ""]));

  filasRotables.forEach((fila, indice) => {
    const referencia = referenciasRotadas[indice];
    resultado[fila] = referenciasFijas.has(obtenerIdReferencia(referencia))
      ? ""
      : clonarAsignacion(referencia);
  });
  [...fijas].forEach((fila) => {
    resultado[fila] = excluidas.has(fila)
      ? ""
      : clonarAsignacion(base[fila] || "");
  });

  return resultado;
};

export const generarDistribucionParaIndice = ({
  distribucionBase,
  filas,
  filasFijas = [],
  posicionesNoAplicables = [],
  indice = 0
} = {}) => rotarDistribucionPorPasos({
  distribucionBase,
  filas,
  filasFijas,
  posicionesNoAplicables,
  pasos: indice
});

const esReferenciaUtil = (referencia) => {
  if (referencia && typeof referencia === "object" && !Array.isArray(referencia)) {
    return String(referencia.personaId ?? referencia.id ?? "").trim() !== "";
  }
  return typeof referencia === "string" &&
    referencia.trim() !== "" &&
    referencia !== "__EMPTY__";
};

export const tieneAsignacionesUtiles = (distribucion) =>
  distribucion &&
  typeof distribucion === "object" &&
  !Array.isArray(distribucion) &&
  Object.values(distribucion).some(esReferenciaUtil);

export const obtenerPrimerBloqueReferencia = ({
  rotacion3Dias,
  periodos
} = {}) => obtenerBloquesReferenciaUtiles({ rotacion3Dias, periodos })[0] || null;

export const obtenerBloquesReferenciaUtiles = ({
  rotacion3Dias,
  periodos
} = {}) => {
  const bloques = rotacion3Dias?.bloques && typeof rotacion3Dias.bloques === "object"
    ? rotacion3Dias.bloques
    : {};
  return (Array.isArray(periodos) ? periodos : []).flatMap((periodo) => {
    const bloque = bloques[periodo?.clave];
    return periodo?.clave && Number.isInteger(periodo.indice) && tieneAsignacionesUtiles(bloque)
      ? [{ periodo, bloque: clonarDistribucion(bloque) }]
      : [];
  });
};

const obtenerFilasConReferenciasNoResolubles = ({
  distribucion,
  personal,
  categoria
} = {}) => {
  if (!Array.isArray(personal) || personal.length === 0) return [];
  const idsValidos = new Set(
    (Array.isArray(personal) ? personal : [])
      .filter((persona) => !categoria || String(persona?.categoria ?? "").trim() === categoria)
      .map((persona) => String(persona?.id ?? "").trim())
      .filter(Boolean)
  );
  return Object.entries(distribucion || {}).flatMap(([fila, referencia]) => {
    if (!esReferenciaUtil(referencia)) return [];
    const personaId = obtenerIdReferencia(referencia);
    return personaId && idsValidos.has(personaId) ? [] : [fila];
  });
};

export const filtrarDistribucionPorCohorteEfectiva = ({
  distribucion,
  personalCanonico = [],
  personalPeriodo = []
} = {}) => {
  const idsPeriodo = new Set(
    (Array.isArray(personalPeriodo) ? personalPeriodo : [])
      .map((persona) => String(persona?.id ?? "").trim())
      .filter(Boolean)
  );
  return Object.fromEntries(
    Object.entries(distribucion || {}).map(([fila, referencia]) => {
      if (!esReferenciaUtil(referencia)) return [fila, clonarAsignacion(referencia)];
      const persona = resolverPersonaDesdeReferencia(referencia, personalCanonico);
      return [fila, persona && idsPeriodo.has(String(persona.id))
        ? clonarAsignacion(referencia)
        : ""];
    })
  );
};

const obtenerPersonalPeriodo = ({ personalPorPeriodo, periodo, personalCanonico }) =>
  personalPorPeriodo && Array.isArray(personalPorPeriodo[periodo?.clave])
    ? personalPorPeriodo[periodo.clave]
    : personalCanonico;

export const derivarAsignacionBaseDesdeBloque = ({
  bloqueReferencia,
  indiceReferencia,
  filas,
  filasFijas = [],
  posicionesNoAplicables = []
} = {}) => {
  if (!tieneAsignacionesUtiles(bloqueReferencia) || !Number.isInteger(indiceReferencia)) {
    return null;
  }

  return generarDistribucionParaIndice({
    distribucionBase: bloqueReferencia,
    filas,
    filasFijas,
    posicionesNoAplicables,
    indice: -indiceReferencia
  });
};

export const resolverAsignacionBaseRotacion3DiasEfectiva = ({
  rotacion3Dias,
  periodos,
  filas,
  filasFijas = [],
  asignacionesFijas = [],
  filasConfiguracion = [],
  personal = [],
  categoria = "",
  posicionesNoAplicables = []
} = {}) => {
  const rotacion = rotacion3Dias && typeof rotacion3Dias === "object"
    ? rotacion3Dias
    : {};
  let asignacionBase = tieneAsignacionesUtiles(rotacion.asignacionBase)
    ? clonarDistribucion(rotacion.asignacionBase)
    : null;
  let bloqueReferencia = null;

  if (!asignacionBase) {
    const candidatos = obtenerBloquesReferenciaUtiles({
      rotacion3Dias: rotacion,
      periodos
    });
    if (candidatos.length === 0) {
      return { ok: false, codigo: "BLOQUE_REFERENCIA_AUSENTE" };
    }
    const candidatosNoResolubles = [];
    for (const candidato of candidatos) {
      const referenciaConFijas = aplicarAsignacionesFijasADistribucion({
        distribucion: candidato.bloque,
        asignacionesFijas,
        filas: filasConfiguracion,
        personal,
        categoria
      });
      if (!referenciaConFijas.ok) {
        return {
          ok: false,
          codigo: referenciaConFijas.codigo,
          errores: referenciaConFijas.errores
        };
      }
      const candidatoPreparado = {
        ...candidato,
        bloque: referenciaConFijas.distribucion
      };
      const baseCandidata = derivarAsignacionBaseDesdeBloque({
        bloqueReferencia: candidatoPreparado.bloque,
        indiceReferencia: candidatoPreparado.periodo.indice,
        filas,
        filasFijas,
        posicionesNoAplicables
      });
      if (!baseCandidata) {
        return { ok: false, codigo: "BLOQUE_REFERENCIA_INVALIDO" };
      }
      const filasNoResolubles = obtenerFilasConReferenciasNoResolubles({
        distribucion: baseCandidata,
        personal,
        categoria
      });
      if (filasNoResolubles.length > 0) {
        candidatosNoResolubles.push({
          clave: candidatoPreparado.periodo.clave,
          filas: filasNoResolubles
        });
        continue;
      }
      bloqueReferencia = candidatoPreparado;
      asignacionBase = baseCandidata;
      break;
    }
    if (!asignacionBase) {
      return {
        ok: false,
        codigo: "REFERENCIAS_BLOQUES_NO_RESOLUBLES",
        candidatos: candidatosNoResolubles
      };
    }
  } else {
    const baseConFijas = aplicarAsignacionesFijasADistribucion({
      distribucion: asignacionBase,
      asignacionesFijas,
      filas: filasConfiguracion,
      personal,
      categoria
    });
    if (!baseConFijas.ok) {
      return {
        ok: false,
        codigo: baseConFijas.codigo,
        errores: baseConFijas.errores
      };
    }
    asignacionBase = baseConFijas.distribucion;
  }

  return {
    ok: true,
    origen: bloqueReferencia ? "bloque_legacy" : "asignacion_base",
    bloqueReferencia,
    asignacionBase
  };
};

export const existenBloquesPosterioresUtiles = ({
  rotacion3Dias,
  periodos,
  claveReferencia
} = {}) => {
  const bloques = rotacion3Dias?.bloques && typeof rotacion3Dias.bloques === "object"
    ? rotacion3Dias.bloques
    : {};
  const indiceReferencia = (Array.isArray(periodos) ? periodos : [])
    .findIndex((periodo) => periodo?.clave === claveReferencia);
  if (indiceReferencia < 0) return false;

  return periodos
    .slice(indiceReferencia + 1)
    .some((periodo) => tieneAsignacionesUtiles(bloques[periodo?.clave]));
};

export const regenerarRotacion3DiasDesdePrimerBloque = ({
  rotacion3Dias,
  periodos,
  filas,
  filasFijas = [],
  asignacionesFijas = [],
  filasConfiguracion = [],
  personal = [],
  personalCanonico = personal,
  personalPorPeriodo = null,
  categoria = "",
  posicionesNoAplicables = [],
  estrategia
} = {}) => {
  const rotacion = rotacion3Dias && typeof rotacion3Dias === "object"
    ? rotacion3Dias
    : {};
  const periodosValidos = (Array.isArray(periodos) ? periodos : [])
    .filter((periodo) => periodo?.clave && Number.isInteger(periodo.indice));
  const baseEfectiva = resolverAsignacionBaseRotacion3DiasEfectiva({
    rotacion3Dias: { ...rotacion, asignacionBase: {} },
    periodos: periodosValidos,
    filas,
    filasFijas,
    asignacionesFijas,
    filasConfiguracion,
    personal: personalCanonico,
    categoria,
    posicionesNoAplicables
  });
  if (!baseEfectiva.ok) return { ...baseEfectiva, rotacion3Dias: rotacion };
  const bloqueReferenciaPreparado = baseEfectiva.bloqueReferencia;
  const asignacionBase = baseEfectiva.asignacionBase;
  const bloques = Object.fromEntries(
    periodosValidos.map((periodo) => {
      const generada = periodo.clave === bloqueReferenciaPreparado.periodo.clave
        ? clonarDistribucion(bloqueReferenciaPreparado.bloque)
        : generarDistribucionParaIndice({
            distribucionBase: asignacionBase,
            filas,
            filasFijas,
            posicionesNoAplicables,
            indice: periodo.indice
          });
      return [periodo.clave, personalPorPeriodo
        ? filtrarDistribucionPorCohorteEfectiva({
            distribucion: generada,
            personalCanonico,
            personalPeriodo: obtenerPersonalPeriodo({
              personalPorPeriodo,
              periodo,
              personalCanonico
            })
          })
        : generada];
    })
  );

  return {
    ok: true,
    bloqueReferencia: bloqueReferenciaPreparado,
    rotacion3Dias: {
      ...rotacion,
      version: rotacion.version ?? 1,
      fechaBase: estrategia?.fechaBase ?? rotacion.fechaBase,
      duracionDias: estrategia?.duracionDias ?? rotacion.duracionDias,
      asignacionBase: clonarDistribucion(asignacionBase),
      bloques,
      coberturaLibreSM: clonarDistribucion(rotacion.coberturaLibreSM)
    }
  };
};

export const prepararRotacion3DiasParaGenerar = ({
  rotacion3Dias,
  periodos,
  filas,
  filasFijas = [],
  asignacionesFijas = [],
  filasConfiguracion = [],
  personal = [],
  personalCanonico = personal,
  personalPorPeriodo = null,
  categoria = "",
  posicionesNoAplicables = [],
  estrategia
} = {}) => {
  const rotacion = rotacion3Dias && typeof rotacion3Dias === "object"
    ? rotacion3Dias
    : {};
  const baseEfectiva = resolverAsignacionBaseRotacion3DiasEfectiva({
    rotacion3Dias: rotacion,
    periodos,
    filas,
    filasFijas,
    asignacionesFijas,
    filasConfiguracion,
    personal: personalCanonico,
    categoria,
    posicionesNoAplicables
  });
  if (!baseEfectiva.ok) {
    return { ...baseEfectiva, rotacion3Dias: rotacion };
  }
  const { asignacionBase, bloqueReferencia } = baseEfectiva;

  const bloquesPreparados = {};
  for (const [clave, bloque] of Object.entries(rotacion.bloques || {})) {
    if (!tieneAsignacionesUtiles(bloque)) {
      bloquesPreparados[clave] = clonarDistribucion(bloque);
      continue;
    }
    const bloqueConFijas = aplicarAsignacionesFijasADistribucion({
      distribucion: bloque,
      asignacionesFijas,
      filas: filasConfiguracion,
      personal: personalCanonico,
      categoria
    });
    if (!bloqueConFijas.ok) {
      return {
        ok: false,
        codigo: bloqueConFijas.codigo,
        errores: bloqueConFijas.errores,
        rotacion3Dias: rotacion
      };
    }
    const periodo = (Array.isArray(periodos) ? periodos : [])
      .find((actual) => actual?.clave === clave);
    bloquesPreparados[clave] = personalPorPeriodo
      ? filtrarDistribucionPorCohorteEfectiva({
          distribucion: bloqueConFijas.distribucion,
          personalCanonico,
          personalPeriodo: obtenerPersonalPeriodo({
            personalPorPeriodo,
            periodo,
            personalCanonico
          })
        })
      : bloqueConFijas.distribucion;
  }

  const preparada = {
    ...rotacion,
    version: rotacion.version ?? 1,
    fechaBase: estrategia?.fechaBase ?? rotacion.fechaBase,
    duracionDias: estrategia?.duracionDias ?? rotacion.duracionDias,
    asignacionBase,
    bloques: bloquesPreparados,
    coberturaLibreSM: rotacion.coberturaLibreSM || {}
  };

  return {
    ok: true,
    bloqueReferencia,
    rotacion3Dias: generarBloquesFaltantes({
      rotacion3Dias: preparada,
      periodos,
      filas,
      filasFijas,
      posicionesNoAplicables,
      personalCanonico,
      personalPorPeriodo
    })
  };
};

export const generarBloquesFaltantes = ({
  rotacion3Dias,
  periodos,
  filas,
  filasFijas = [],
  posicionesNoAplicables = [],
  personalCanonico = null,
  personalPorPeriodo = null
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
    const generada = generarDistribucionParaIndice({
      distribucionBase: rotacion.asignacionBase,
      filas,
      filasFijas,
      posicionesNoAplicables,
      indice: periodo.indice
    });
    bloques[periodo.clave] = personalCanonico && personalPorPeriodo
      ? filtrarDistribucionPorCohorteEfectiva({
          distribucion: generada,
          personalCanonico,
          personalPeriodo: obtenerPersonalPeriodo({
            personalPorPeriodo,
            periodo,
            personalCanonico
          })
        })
      : generada;
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
  filasFijas = [],
  asignacionesFijas = [],
  filasConfiguracion = [],
  categoria = "",
  personal,
  posicionesNoAplicables = [],
  personalPorPeriodo = null,
  personalCanonico = personal
}) => {
  const cohortes = personalPorPeriodo && typeof personalPorPeriodo === "object"
    ? personalPorPeriodo
    : null;
  const ids = (lista) => (Array.isArray(lista) ? lista : [])
    .map((persona) => String(persona?.id || ""))
    .filter(Boolean)
    .sort()
    .join("\u0000");
  const cohorteEstable = !cohortes || semanas.every(
    (semana) => ids(cohortes[semana.clave]) === ids(personal)
  );

  if (!cohorteEstable) {
    const validacionGlobal = validarAsignacionesFijasMensuales({
      asignaciones: asignacionesFijas,
      personal: personalCanonico,
      categoria,
      filas: filasConfiguracion
    });
    if (!validacionGlobal.valido) {
      throw new ErrorGeneracionAsignacionesFijas({
        codigo: "ASIGNACIONES_FIJAS_INVALIDAS",
        errores: validacionGlobal.errores
      });
    }

    const excluidas = new Set(
      Array.isArray(posicionesNoAplicables) ? posicionesNoAplicables : []
    );
    const filasFijasEfectivas = [...new Set([
      ...(Array.isArray(filasFijas) ? filasFijas : []),
      ...(typeof filaFija === "string" && filaFija ? [filaFija] : [])
    ])];
    const base = clonarDistribucion(planilla?.semana1 || {});
    const nuevaPlanilla = {
      ...planilla,
      semana6: planilla?.semana6 || {}
    };

    semanas.forEach((semana, indiceSemana) => {
      const cohorte = Array.isArray(cohortes[semana.clave])
        ? cohortes[semana.clave]
        : [];
      const idsCohorte = new Set(cohorte.map((persona) => String(persona?.id || "")));
      const rotada = generarDistribucionParaIndice({
        distribucionBase: base,
        filas,
        filasFijas: filasFijasEfectivas,
        posicionesNoAplicables: [...excluidas],
        indice: indiceSemana
      });
      let distribucion = Object.fromEntries(
        Object.entries(rotada).map(([fila, referencia]) => {
          const persona = resolverPersonaDesdeReferencia(referencia, personalCanonico);
          return [fila, persona && idsCohorte.has(String(persona.id))
            ? clonarAsignacion(referencia)
            : ""];
        })
      );
      const fijasActivas = validacionGlobal.asignaciones.filter(
        ({ personaId }) => idsCohorte.has(String(personaId))
      );
      const fijasPresentes = fijasActivas.filter(({ personaId }) =>
        Object.values(distribucion).some((referencia) =>
          String(resolverPersonaDesdeReferencia(referencia, cohorte)?.id || "") ===
          String(personaId)
        )
      );
      const aplicacion = aplicarAsignacionesFijasADistribucion({
        distribucion,
        asignacionesFijas: fijasPresentes,
        filas: filasConfiguracion,
        personal: cohorte,
        categoria
      });
      if (!aplicacion.ok) throw new ErrorGeneracionAsignacionesFijas(aplicacion);
      distribucion = aplicacion.distribucion;

      fijasActivas
        .filter(({ personaId }) => !fijasPresentes.some(
          (actual) => actual.personaId === personaId
        ))
        .forEach(({ sectorId, personaId }) => {
          const fila = filasConfiguracion.find(
            (actual) => actual?.tipo === "sector" && actual.sectorId === sectorId
          );
          const clave = resolverClaveDistribucionParaFila({ distribucion, fila });
          const persona = cohorte.find((actual) => String(actual?.id) === String(personaId));
          if (clave !== null && persona) distribucion[clave] = crearReferenciaPersona(persona);
        });

      nuevaPlanilla[semana.clave] = distribucion;
    });
    return nuevaPlanilla;
  }

  const preparacionBase = aplicarAsignacionesFijasADistribucion({
    distribucion: planilla?.semana1 || {},
    asignacionesFijas,
    filas: filasConfiguracion,
    personal,
    categoria
  });
  if (!preparacionBase.ok) {
    throw new ErrorGeneracionAsignacionesFijas(preparacionBase);
  }
  const semana1 = preparacionBase.distribucion;
  const excluidas = new Set(
    Array.isArray(posicionesNoAplicables) ? posicionesNoAplicables : []
  );
  const filasFijasEfectivas = [...new Set([
    ...(Array.isArray(filasFijas) ? filasFijas : []),
    ...(typeof filaFija === "string" && filaFija ? [filaFija] : [])
  ])];

  const nuevaPlanilla = {
    ...planilla,
    semana1,
    semana6: planilla?.semana6 || {}
  };

  semanas.slice(1).forEach((semana, indiceSemana) => {
    nuevaPlanilla[semana.clave] = generarDistribucionParaIndice({
      distribucionBase: semana1,
      filas,
      filasFijas: filasFijasEfectivas,
      posicionesNoAplicables: [...excluidas],
      indice: indiceSemana + 1
    });
  });

  return nuevaPlanilla;
};

export const generarRotacionMensualDesdeConfiguracion = ({
  configuracion,
  categoria = configuracion?.categoria || "",
  ...argumentos
} = {}) => {
  const filasConfiguracion = obtenerFilasActivas(configuracion?.filas || []);
  const usaLicenciadosV2 = categoria === "licenciado" &&
    resolverVersionEstructuraLicenciados(configuracion) ===
      VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  const filas = obtenerEtiquetasFilasPlanilla(filasConfiguracion);

  return generarRotacionMensual({
    ...argumentos,
    categoria,
    filas,
    filasConfiguracion,
    asignacionesFijas: configuracion?.asignacionesFijas || argumentos.asignacionesFijas || [],
    estructuraLicenciadosVersion: usaLicenciadosV2
      ? VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
      : undefined
  });
};
