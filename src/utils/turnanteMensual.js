import {
  adaptarConfiguracionLegacyPlanilla,
  obtenerEtiquetasFilasPlanilla
} from "./configuracionPlanilla.js";
import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";

const CONFIGURACION = Object.freeze({
  enfermero: Object.freeze({
    posicion: "T6",
    capacidadNormal: 20
  }),
  licenciado: Object.freeze({
    posicion: "T3",
    capacidadNormal: 12
  })
});

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const referenciaTieneContenido = (referencia) =>
  referencia !== "" && referencia !== null && referencia !== undefined;

export const obtenerPosicionTurnanteMensual = (tipo, versionEstructura) =>
  tipo === "licenciado" &&
  resolverVersionEstructuraLicenciados(versionEstructura) ===
    VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
    ? "T4"
    : CONFIGURACION[tipo]?.posicion || "";

export const obtenerCapacidadNormalPlanilla = (tipo) =>
  CONFIGURACION[tipo]?.capacidadNormal ?? 0;

export const estaHabilitadoTurnanteMensual = (planilla, tipo, versionEstructura) => {
  const posicion = obtenerPosicionTurnanteMensual(tipo, versionEstructura);
  return Boolean(
    posicion &&
    Array.isArray(planilla?.posicionesMensualesAdicionales) &&
    planilla.posicionesMensualesAdicionales.includes(posicion)
  );
};

export const obtenerFilasBasePlanilla = (configuracion = {}, tipo = "") =>
  obtenerEtiquetasFilasPlanilla(
    adaptarConfiguracionLegacyPlanilla(configuracion, tipo)
  );

export const obtenerFilasEfectivasPlanilla = (
  filasBase,
  planilla,
  tipo,
  versionEstructura
) => {
  const filas = [...new Set(Array.isArray(filasBase) ? filasBase : [])];
  const posicion = obtenerPosicionTurnanteMensual(tipo, versionEstructura);
  if (
    posicion &&
    estaHabilitadoTurnanteMensual(planilla, tipo, versionEstructura) &&
    !filas.includes(posicion)
  ) {
    filas.push(posicion);
  }
  return filas;
};

export const obtenerPosicionesTurnantesEfectivas = (
  turnantesBase,
  planilla,
  tipo,
  versionEstructura
) => {
  const base = [...new Set(Array.isArray(turnantesBase) ? turnantesBase : [])]
    .filter((posicion) => posicion !== obtenerPosicionTurnanteMensual(tipo, versionEstructura));
  const posicion = obtenerPosicionTurnanteMensual(tipo, versionEstructura);
  if (posicion && estaHabilitadoTurnanteMensual(planilla, tipo, versionEstructura)) {
    base.push(posicion);
  }
  return base;
};

export const habilitarTurnanteMensual = (planilla, tipo, versionEstructura) => {
  const actual = esObjeto(planilla) ? planilla : {};
  const posicion = obtenerPosicionTurnanteMensual(tipo, versionEstructura);
  if (!posicion || estaHabilitadoTurnanteMensual(actual, tipo, versionEstructura)) return actual;

  const resultado = {
    ...actual,
    ...Object.fromEntries(
      Object.entries(actual)
        .filter(([clave, distribucion]) =>
          /^semana\d+$/.test(clave) && esObjeto(distribucion)
        )
        .map(([clave, distribucion]) => [
          clave,
          { ...distribucion, [posicion]: distribucion[posicion] || "" }
        ])
    ),
    posicionesMensualesAdicionales: [
      ...(Array.isArray(actual.posicionesMensualesAdicionales)
        ? actual.posicionesMensualesAdicionales
        : []),
      posicion
    ]
  };
  if (esObjeto(actual.rotacion3Dias)) {
    resultado.rotacion3Dias = {
      ...actual.rotacion3Dias,
      asignacionBase: {
        ...(esObjeto(actual.rotacion3Dias.asignacionBase)
          ? actual.rotacion3Dias.asignacionBase
          : {}),
        [posicion]: actual.rotacion3Dias.asignacionBase?.[posicion] || ""
      },
      bloques: Object.fromEntries(
        Object.entries(actual.rotacion3Dias.bloques || {}).map(
          ([clave, bloque]) => [
            clave,
            {
              ...(esObjeto(bloque) ? bloque : {}),
              [posicion]: bloque?.[posicion] || ""
            }
          ]
        )
      )
    };
  }
  return resultado;
};

const etiquetaPeriodo = (clave) => {
  const coincidencia = /^semana(\d+)$/.exec(clave);
  return coincidencia ? `Semana ${coincidencia[1]}` : clave;
};

export const validarEliminacionTurnanteMensual = (planilla, tipo, versionEstructura) => {
  const posicion = obtenerPosicionTurnanteMensual(tipo, versionEstructura);
  if (!posicion || !estaHabilitadoTurnanteMensual(planilla, tipo, versionEstructura)) {
    return { ok: true, posicion, usos: [] };
  }

  const usos = [];
  Object.entries(esObjeto(planilla) ? planilla : {}).forEach(([clave, valor]) => {
    if (/^semana\d+$/.test(clave) && referenciaTieneContenido(valor?.[posicion])) {
      usos.push(etiquetaPeriodo(clave));
    }
  });
  if (referenciaTieneContenido(planilla?.rotacion3Dias?.asignacionBase?.[posicion])) {
    usos.push("asignación base nocturna");
  }
  Object.entries(planilla?.rotacion3Dias?.bloques || {}).forEach(([clave, bloque]) => {
    if (referenciaTieneContenido(bloque?.[posicion])) usos.push(`bloque ${clave}`);
  });
  const tieneParcial = Object.values(planilla?.asignacionesParciales || {})
    .some((asignaciones) =>
      Array.isArray(asignaciones) &&
      asignaciones.some((asignacion) => asignacion?.sector === posicion)
    );
  if (tieneParcial) usos.push("una asignación parcial");

  return {
    ok: usos.length === 0,
    posicion,
    usos,
    mensaje: usos.length
      ? `No se puede eliminar ${posicion}. Tiene asignaciones en ${usos.join(", ")}.`
      : ""
  };
};

const quitarClave = (distribucion, posicion) => {
  if (!esObjeto(distribucion) || !Object.hasOwn(distribucion, posicion)) {
    return distribucion;
  }
  const { [posicion]: _omitida, ...resto } = distribucion;
  return resto;
};

export const eliminarTurnanteMensual = (planilla, tipo, versionEstructura) => {
  const validacion = validarEliminacionTurnanteMensual(planilla, tipo, versionEstructura);
  if (!validacion.ok) return { ...validacion, planilla };

  const actual = esObjeto(planilla) ? planilla : {};
  const posicion = validacion.posicion;
  const posiciones = (actual.posicionesMensualesAdicionales || [])
    .filter((item) => item !== posicion);
  const resultado = {
    ...actual,
    ...Object.fromEntries(
      Object.entries(actual)
        .filter(([clave]) => /^semana\d+$/.test(clave))
        .map(([clave, distribucion]) => [clave, quitarClave(distribucion, posicion)])
    ),
    ...(esObjeto(actual.rotacion3Dias)
      ? {
          rotacion3Dias: {
            ...actual.rotacion3Dias,
            asignacionBase: quitarClave(
              actual.rotacion3Dias.asignacionBase,
              posicion
            ),
            bloques: Object.fromEntries(
              Object.entries(actual.rotacion3Dias.bloques || {}).map(
                ([clave, bloque]) => [clave, quitarClave(bloque, posicion)]
              )
            )
          }
        }
      : {})
  };

  resultado.posicionesMensualesAdicionales = posiciones;
  return { ok: true, posicion, usos: [], planilla: resultado };
};

export const quitarTurnanteMensualDeDistribucion = (distribucion, tipo, versionEstructura) =>
  quitarClave(distribucion, obtenerPosicionTurnanteMensual(tipo, versionEstructura));
