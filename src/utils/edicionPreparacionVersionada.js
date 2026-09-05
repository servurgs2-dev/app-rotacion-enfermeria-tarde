import {
  clasificarPreparacion,
  clonarPreparacion,
  ESTADO_TEMPORAL_PREPARACION,
  normalizarPreparacionesMes
} from "./preparacionesMes.js";
import { analizarActividadDesdeFechaPreparacion } from "./transicionPreparacionesMes.js";

export const CODIGOS_EDICION_PREPARACION = Object.freeze({
  EDITABLE_FUTURA: "EDITABLE_FUTURA",
  EDITABLE_DESDE_HOY: "EDITABLE_DESDE_HOY",
  PREPARACION_PASADA: "PREPARACION_PASADA",
  PREPARACION_VIGENTE_ANTERIOR: "PREPARACION_VIGENTE_ANTERIOR",
  ACTIVIDAD_DESDE_INICIO: "ACTIVIDAD_DESDE_INICIO",
  PREPARACION_NO_ENCONTRADA: "PREPARACION_NO_ENCONTRADA",
  PREPARACIONES_INVALIDAS: "PREPARACIONES_INVALIDAS"
});

const claveCategoria = (categoria) => categoria === "enfermero" ? "enfermeros" : "licenciados";
const esObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const quitarFilaDistribucion = (distribucion, fila) => {
  if (!esObjeto(distribucion)) return distribucion;
  const claves = new Set([fila?.filaId, fila?.sectorId, fila?.turnanteId, fila?.etiqueta].filter(Boolean));
  return Object.fromEntries(Object.entries(distribucion).filter(([clave]) => !claves.has(clave)));
};

export const reconciliarPlanillaConConfiguracion = ({ planilla, configuracion } = {}) => {
  const resultado = clonarPreparacion(planilla || {});
  const inactivas = (configuracion?.filas || []).filter((fila) => fila?.activo === false);
  for (const fila of inactivas) {
    for (const clave of Object.keys(resultado)) {
      if (/^semana\d+$/.test(clave)) resultado[clave] = quitarFilaDistribucion(resultado[clave], fila);
    }
    if (esObjeto(resultado.rotacion3Dias)) {
      resultado.rotacion3Dias.asignacionBase = quitarFilaDistribucion(resultado.rotacion3Dias.asignacionBase, fila);
      resultado.rotacion3Dias.bloques = Object.fromEntries(
        Object.entries(resultado.rotacion3Dias.bloques || {}).map(([clave, bloque]) => [clave, quitarFilaDistribucion(bloque, fila)])
      );
    }
    if (esObjeto(resultado.asignacionesParciales)) {
      const destinos = new Set([fila.filaId, fila.sectorId, fila.turnanteId, fila.etiqueta].filter(Boolean));
      resultado.asignacionesParciales = Object.fromEntries(
        Object.entries(resultado.asignacionesParciales).map(([clave, asignaciones]) => [
          clave,
          Array.isArray(asignaciones) ? asignaciones.filter((item) => !destinos.has(item?.sector)) : asignaciones
        ])
      );
    }
  }
  return resultado;
};

export const analizarEdicionPreparacionVersionada = ({
  estado,
  mes,
  preparacionId,
  fechaReferencia,
  turno,
  novedadesExternas = [],
  padronVigencias = null
} = {}) => {
  const coleccion = normalizarPreparacionesMes({
    preparaciones: estado?.preparaciones,
    mes,
    exigirCoberturaCompleta: true
  });
  if (!coleccion.ok) return { editable: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACIONES_INVALIDAS, errores: coleccion.errores };
  const preparacion = coleccion.preparaciones.find((item) => item.id === preparacionId);
  if (!preparacion) return { editable: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACION_NO_ENCONTRADA };
  const estadoTemporal = clasificarPreparacion(preparacion, fechaReferencia);
  if (estadoTemporal === ESTADO_TEMPORAL_PREPARACION.FUTURA) {
    return { editable: true, codigo: CODIGOS_EDICION_PREPARACION.EDITABLE_FUTURA, estadoTemporal, preparacion };
  }
  if (estadoTemporal === ESTADO_TEMPORAL_PREPARACION.PASADA) {
    return { editable: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACION_PASADA, estadoTemporal, preparacion };
  }
  if (preparacion.desde !== fechaReferencia) {
    return { editable: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACION_VIGENTE_ANTERIOR, estadoTemporal, preparacion };
  }
  const actividad = analizarActividadDesdeFechaPreparacion({
    estado,
    mes,
    desde: preparacion.desde,
    fechaReferencia,
    turno,
    novedadesExternas,
    padronVigencias
  });
  return actividad.actividadDetectada
    ? { editable: false, codigo: CODIGOS_EDICION_PREPARACION.ACTIVIDAD_DESDE_INICIO, estadoTemporal, preparacion, actividad }
    : { editable: true, codigo: CODIGOS_EDICION_PREPARACION.EDITABLE_DESDE_HOY, estadoTemporal, preparacion, actividad };
};

export const obtenerEstadoEditablePreparacion = ({ estado, mes, preparacionId } = {}) => {
  const coleccion = normalizarPreparacionesMes({ preparaciones: estado?.preparaciones, mes, exigirCoberturaCompleta: true });
  if (!coleccion.ok) return { ok: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACIONES_INVALIDAS, estado: null };
  const preparacion = coleccion.preparaciones.find((item) => item.id === preparacionId);
  if (!preparacion) return { ok: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACION_NO_ENCONTRADA, estado: null };
  return {
    ok: true,
    codigo: "ESTADO_EDITABLE_PREPARACION",
    preparacion,
    estado: {
      ...estado,
      planillas: {
        enfermeros: clonarPreparacion(preparacion.categorias.enfermero.planilla),
        licenciados: clonarPreparacion(preparacion.categorias.licenciado.planilla)
      },
      configuracionPlanilla: {
        enfermero: clonarPreparacion(preparacion.categorias.enfermero.configuracion),
        licenciado: clonarPreparacion(preparacion.categorias.licenciado.configuracion)
      }
    }
  };
};

export const aplicarCambiosPreparacionAlEstado = ({
  estado,
  mes,
  preparacionId,
  categoria,
  planilla,
  configuracionPlanilla
} = {}) => {
  const coleccion = normalizarPreparacionesMes({ preparaciones: estado?.preparaciones, mes, exigirCoberturaCompleta: true });
  if (!coleccion.ok || !["enfermero", "licenciado"].includes(categoria)) {
    return { ok: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACIONES_INVALIDAS, estado };
  }
  const indice = coleccion.preparaciones.findIndex((item) => item.id === preparacionId);
  if (indice < 0) return { ok: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACION_NO_ENCONTRADA, estado };
  const preparaciones = clonarPreparacion(coleccion.preparaciones);
  const actual = preparaciones[indice];
  preparaciones[indice] = {
    ...actual,
    categorias: {
      ...actual.categorias,
      [categoria]: {
        planilla: clonarPreparacion(planilla ?? actual.categorias[categoria].planilla),
        configuracion: clonarPreparacion(configuracionPlanilla ?? actual.categorias[categoria].configuracion)
      }
    }
  };
  const validacion = normalizarPreparacionesMes({ preparaciones, mes, exigirCoberturaCompleta: true });
  if (!validacion.ok) return { ok: false, codigo: CODIGOS_EDICION_PREPARACION.PREPARACIONES_INVALIDAS, estado };
  return {
    ok: true,
    codigo: "PREPARACION_ACTUALIZADA",
    estado: { ...estado, preparaciones: validacion.preparaciones },
    preparacion: validacion.preparaciones[indice],
    clavePlanilla: claveCategoria(categoria)
  };
};
