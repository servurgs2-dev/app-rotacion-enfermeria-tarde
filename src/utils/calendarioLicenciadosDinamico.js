import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";
import { proyectarAsignacionesOperativasLicenciados } from "./proyeccionOperativaLicenciados.js";
import { resolverCoberturaDinamicaLicenciados } from "./coberturaDinamicaLicenciados.js";
import { validarPrioridadCoberturaLicenciadosV2 } from "./prioridadCoberturaLicenciadosDinamica.js";
import { aplicarMovimientosOperativosCalendarioV2 } from "./cambiosCalendario.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

export const debeUsarCalendarioLicenciadosDinamicoVisible = ({
  resultado,
  esDiaParo = false
} = {}) => !esDiaParo &&
  resultado?.ok === true &&
  resultado?.aplicar === true;

export const resolverOrdenVisibleCalendarioLicenciadosDinamico = ({
  ordenVisual = [],
  filasConfiguracion = [],
  asignacionesOperativas = []
} = {}) => {
  const etiquetaBasePorId = new Map(lista(filasConfiguracion)
    .filter((fila) => fila?.tipo === "sector" && fila?.sectorId)
    .map((fila) => [fila.sectorId, fila.etiqueta]));
  const destinosPorOrigen = new Map();
  lista(asignacionesOperativas).forEach((asignacion) => {
    if (!asignacion?.destinoId || !asignacion?.origenSectorBaseId) return;
    const actuales = destinosPorOrigen.get(asignacion.origenSectorBaseId) || [];
    destinosPorOrigen.set(asignacion.origenSectorBaseId, [...actuales, asignacion.nombre]);
  });
  const reemplazosPorEtiqueta = new Map([...destinosPorOrigen].flatMap(([sectorId, nombres]) => {
    const etiqueta = etiquetaBasePorId.get(sectorId);
    return etiqueta ? [[etiqueta, nombres]] : [];
  }));
  return lista(ordenVisual).flatMap((item) => reemplazosPorEtiqueta.get(item) || [item]);
};

export const resolverCalendarioLicenciadosDinamico = ({
  versionEstructura,
  perfil,
  asignacionesBase = [],
  prioridadTurno = [],
  candidatosPrioridad = [],
  extras = [],
  personal = [],
  esPersonaDisponible = () => true,
  esPersonaDisponibleParaCobertura = esPersonaDisponible,
  sectorIdsDonantes = [],
  cambiosDia = {}
} = {}) => {
  if (
    resolverVersionEstructuraLicenciados(versionEstructura) !==
    VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
  ) {
    return {
      ok: true,
      aplicar: false,
      motivo: "ESTRUCTURA_LICENCIADOS_LEGACY",
      delegarEscasez: false
    };
  }

  const validacionPrioridad = validarPrioridadCoberturaLicenciadosV2({
    prioridad: prioridadTurno,
    candidatos: candidatosPrioridad
  });
  if (!validacionPrioridad.ok) {
    return {
      ok: false,
      aplicar: false,
      motivo: "PRIORIDAD_COBERTURA_LICENCIADOS_V2_INVALIDA",
      diagnostico: "PRIORIDAD_COBERTURA_LICENCIADOS_V2_INVALIDA",
      errores: validacionPrioridad.errores,
      delegarEscasez: false,
      perfil
    };
  }

  const proyeccion = proyectarAsignacionesOperativasLicenciados({
    perfil,
    asignacionesBase,
    versionEstructura
  });
  if (!proyeccion.aplicar) {
    return {
      ok: proyeccion.ok !== false,
      aplicar: false,
      motivo: proyeccion.motivo,
      diagnostico: proyeccion.diagnostico || null,
      delegarEscasez: proyeccion.delegarEscasez === true,
      perfil,
      proyeccion
    };
  }

  const idsPrioridad = new Set(lista(prioridadTurno));
  const sectoresBasePreservados = new Set(proyeccion.sectoresBasePreservados);
  const asignacionesOperativas = proyeccion.asignacionesOperativas.filter((fila) =>
    !sectoresBasePreservados.has(fila?.sectorId) || idsPrioridad.has(fila.sectorId)
  );
  const proyeccionEfectiva = {
    ...proyeccion,
    asignacionesOperativas: aplicarMovimientosOperativosCalendarioV2({
      asignaciones: asignacionesOperativas,
      cambios: cambiosDia,
      personalDisponible: [...lista(personal), ...lista(extras)]
    }),
    sectoresBasePreservados: proyeccion.sectoresBasePreservados.filter((id) => idsPrioridad.has(id))
  };
  const cobertura = resolverCoberturaDinamicaLicenciados({
    proyeccion: proyeccionEfectiva,
    prioridadTurno,
    extras,
    personal,
    esPersonaDisponible,
    esPersonaDisponibleParaCobertura,
    sectorIdsDonantes
  });

  return {
    ok: cobertura.ok !== false,
    aplicar: cobertura.aplicar === true,
    version: VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA,
    perfil,
    proyeccion: proyeccionEfectiva,
    cobertura,
    asignacionesOperativas: cobertura.asignacionesOperativas,
    vacantesSinCobertura: cobertura.vacantesSinCobertura,
    turnantesUtilizados: cobertura.turnantesUtilizados,
    turnantesRestantes: cobertura.turnantesRestantes
  };
};
