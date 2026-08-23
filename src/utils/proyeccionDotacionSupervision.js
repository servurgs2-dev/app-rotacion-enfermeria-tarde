import { TURNOS } from "../config/turnos.js";
import {
  detectarDisponiblesPorReintegro,
  evaluarAsignacionesParcialesDia,
  filtrarReintegradosSinSectorDia,
  obtenerAsignacionesParcialesPeriodo
} from "./asignacionesParcialesPlanilla.js";
import {
  obtenerConfiguracionPlanillaEfectiva,
  obtenerFilasActivas
} from "./configuracionPlanilla.js";
import { esDiaLibre, estaDeLicencia, parsearFechaLocal } from "./fechas.js";
import {
  asegurarIdExtraHistorico,
  normalizarExtraCompatible,
  resolverPersonaPermanenteParaExtra
} from "./extrasPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import {
  ESTADOS_ASISTENCIA,
  obtenerEstadoAsistencia
} from "./asistenciaPersonas.js";
import {
  CAUSAS_INDISPONIBILIDAD_SUPERVISION,
  ESTADOS_VALIDACION_EXTRA_ORIGEN,
  resolverIndisponibilidadesDia
} from "./indisponibilidadesSupervision.js";
import {
  obtenerPlanillaCategoriaEstado,
  resolverPeriodoPlanillaDia
} from "./periodoPlanillaDia.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { resolverClaveDistribucionParaFila } from "./resolucionIdentidadesPlanilla.js";
import { normalizar } from "./texto.js";

const CATEGORIAS = new Set(["enfermero", "licenciado"]);

const claveFecha = (fecha) => typeof fecha === "string"
  ? fecha
  : `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

const personaMinima = (persona) => ({
  personaId: String(persona?.id ?? "").trim() || null,
  funcionario: String(persona?.funcionario ?? "").trim() || null,
  nombre: String(persona?.nombre ?? "").trim()
});

const detalleExtra = (persona, extra) => ({
  ...personaMinima(persona),
  origenExtra: String(extra?.origenExtra ?? "").trim() || null,
  turnoOrigen: String(extra?.turnoOrigen ?? "").trim() || null
});

const resolverReferencia = (referencia, personal) => {
  const resuelta = resolverPersonaDesdeReferencia(referencia, personal);
  if (resuelta) return { persona: resuelta, advertencia: null };
  const nombre = typeof referencia === "string"
    ? normalizar(referencia)
    : normalizar(referencia?.nombre);
  const coincidencias = nombre
    ? personal.filter((persona) => normalizar(persona?.nombre) === nombre)
    : [];
  return {
    persona: null,
    advertencia: {
      codigo: coincidencias.length > 1 ? "IDENTIDAD_AMBIGUA" : "REFERENCIA_NO_RESUELTA",
      referencia
    }
  };
};

const personasUnicas = (personas, advertencias) => {
  const unicas = new Map();
  personas.forEach((persona) => {
    const clave = obtenerClaveIdentidadPersona(persona);
    if (!clave) {
      advertencias.push({ codigo: "PERSONA_SIN_IDENTIDAD", nombre: persona?.nombre || "" });
      return;
    }
    if (!unicas.has(clave)) unicas.set(clave, persona);
  });
  return [...unicas.values()];
};

const resultadoNoDisponible = ({ fecha, turno, categoria, errores }) => ({
  ok: false,
  disponible: false,
  fecha,
  turno,
  categoria,
  cohortePlanilla: null,
  libresProgramados: null,
  previstosBase: null,
  advertencias: [],
  errores
});

export const resolverCohortePlanillaDia = ({
  estadoMensual,
  fecha,
  turno,
  categoria,
  mes
} = {}) => {
  if (!TURNOS[turno] || !CATEGORIAS.has(categoria)) {
    return resultadoNoDisponible({
      fecha,
      turno,
      categoria,
      errores: [{ codigo: !TURNOS[turno] ? "TURNO_INVALIDO" : "CATEGORIA_INVALIDA" }]
    });
  }
  const periodo = resolverPeriodoPlanillaDia({
    estadoMensual,
    fecha,
    turno,
    categoria,
    mes
  });
  if (!periodo.ok) {
    return resultadoNoDisponible({ fecha, turno, categoria, errores: periodo.errores });
  }

  const fechaDia = claveFecha(fecha);
  const personal = Array.isArray(estadoMensual?.personal) ? estadoMensual.personal : [];
  const personalCategoria = personal.filter((persona) => persona?.categoria === categoria);
  const configuracion = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual,
    turno,
    categoria,
    mes
  });
  const filas = obtenerFilasActivas(configuracion?.filas)
    .filter((fila) => fila?.tipo === "sector" || fila?.tipo === "turnante")
    .sort((a, b) => a.orden - b.orden);
  const planilla = obtenerPlanillaCategoriaEstado(estadoMensual, categoria);
  const asignacionesParciales = obtenerAsignacionesParcialesPeriodo(
    planilla,
    periodo.clavePeriodo
  );
  const licencias = Array.isArray(estadoMensual?.licencias) ? estadoMensual.licencias : [];
  const evaluacionParciales = evaluarAsignacionesParcialesDia({
    distribucionBase: periodo.distribucion,
    asignacionesParciales,
    fecha: fechaDia,
    personal,
    esPersonaDisponible: (persona) => persona?.categoria === categoria,
    estaPersonaBaseDeLicencia: (personaBase, fechaEvaluada) =>
      estaDeLicencia(licencias, personaBase, parsearFechaLocal(fechaEvaluada), personal)
  });
  const advertencias = evaluacionParciales.conflictos.map((conflicto) => ({
    codigo: "ASIGNACION_PARCIAL_NO_APLICADA",
    motivo: conflicto.motivo,
    asignacionId: conflicto.asignacion?.id || null
  }));
  const personasDistribucion = [];
  filas.forEach((fila) => {
    const clave = resolverClaveDistribucionParaFila({
      distribucion: evaluacionParciales.distribucion,
      fila
    });
    if (clave === null) return;
    const referencia = evaluacionParciales.distribucion[clave];
    if (!referencia) return;
    const resolucion = resolverReferencia(referencia, personalCategoria);
    if (resolucion.persona) personasDistribucion.push(resolucion.persona);
    if (resolucion.advertencia) advertencias.push({
      ...resolucion.advertencia,
      filaId: fila.filaId || null,
      sectorId: fila.sectorId || null,
      turnanteId: fila.turnanteId || null
    });
  });

  const idsParcialesAplicadas = new Set(
    evaluacionParciales.aplicadas.map((asignacion) => String(asignacion.personaId))
  );
  const reintegros = detectarDisponiblesPorReintegro({
    personal,
    licencias,
    distribucionBase: periodo.distribucion,
    asignacionesParciales: [],
    periodo: periodo.periodo,
    mesActivo: mes,
    categoria
  });
  const reintegradosSinSector = filtrarReintegradosSinSectorDia({
    reintegros,
    fecha: fechaDia,
    idsParcialesAplicadas,
    categoria,
    esPersonaDisponible: (persona) => persona?.categoria === categoria
  });
  const cohorte = personasUnicas(
    [...personasDistribucion, ...reintegradosSinSector],
    advertencias
  );
  const fechaLocal = parsearFechaLocal(fechaDia);
  const libres = cohorte.filter((persona) => esDiaLibre(persona, fechaLocal, false));
  const libresIds = new Set(libres.map(obtenerClaveIdentidadPersona));
  const previstos = cohorte.filter(
    (persona) => !libresIds.has(obtenerClaveIdentidadPersona(persona))
  );

  return {
    ok: true,
    disponible: true,
    fecha: fechaDia,
    turno,
    categoria,
    periodo: { tipo: periodo.tipoPeriodo, clave: periodo.clavePeriodo },
    cohortePlanilla: { cantidad: cohorte.length, personas: cohorte.map(personaMinima) },
    libresProgramados: { cantidad: libres.length, personas: libres.map(personaMinima) },
    previstosBase: { cantidad: previstos.length, personas: previstos.map(personaMinima) },
    advertencias,
    errores: []
  };
};

const metricasNoDisponibles = (cohorte) => ({
  ...cohorte,
  bajasConocidas: null,
  baseDisponible: null,
  extrasRegistrados: null,
  extrasQueAportan: null,
  dotacionPrevistaOperativa: null,
  asistenciaRegistrada: null
});

export const proyectarDotacionDiaSupervision = ({
  estadoMensual,
  novedadesModernas = [],
  fecha,
  turno,
  categoria,
  mes,
  validarExtraOrigen
} = {}) => {
  const cohorte = resolverCohortePlanillaDia({
    estadoMensual,
    fecha,
    turno,
    categoria,
    mes
  });
  if (!cohorte.ok) return metricasNoDisponibles(cohorte);

  const personal = Array.isArray(estadoMensual?.personal) ? estadoMensual.personal : [];
  const fechaDia = cohorte.fecha;
  const advertencias = [...cohorte.advertencias];
  const previstos = cohorte.previstosBase.personas
    .map((referencia) => resolverPersonaDesdeReferencia(referencia, personal))
    .filter(Boolean);
  const previstosPorIdentidad = new Map(
    previstos.map((persona) => [obtenerClaveIdentidadPersona(persona), persona])
  );
  const indisponibilidades = resolverIndisponibilidadesDia({
    estadoMensual, novedadesModernas, fecha: fechaDia, turno, categoria
  });
  const indisponibilidadesPorIdentidad = indisponibilidades.porIdentidad;
  advertencias.push(...indisponibilidades.advertencias);

  const calendarioCategoria = estadoMensual?.calendario?.[
    categoria === "enfermero" ? "enfermeros" : "licenciados"
  ] || {};

  const bajasPorIdentidad = new Map(
    [...indisponibilidadesPorIdentidad].filter(([identidad]) =>
      previstosPorIdentidad.has(identidad)
    )
  );
  const bajas = [...bajasPorIdentidad.values()].map(({ persona, causas }) => ({
    ...personaMinima(persona),
    causas: [...causas]
  }));
  const porCausa = Object.fromEntries(CAUSAS_INDISPONIBILIDAD_SUPERVISION.map((causa) => [
    causa,
    bajas.filter((persona) => persona.causas.includes(causa)).length
  ]));
  const baseDisponible = previstos.filter(
    (persona) => !bajasPorIdentidad.has(obtenerClaveIdentidadPersona(persona))
  );
  const baseDisponiblePorIdentidad = new Map(
    baseDisponible.map((persona) => [obtenerClaveIdentidadPersona(persona), persona])
  );

  const extrasRegistrados = Array.isArray(calendarioCategoria?.extras?.[fechaDia])
    ? calendarioCategoria.extras[fechaDia]
    : [];
  const extrasPorIdentidad = new Map();
  const extrasBloqueadosPorOrigen = new Set();
  extrasRegistrados.forEach((extraOriginal, indice) => {
    const compatible = normalizarExtraCompatible(extraOriginal, {
      fecha: fechaDia,
      categoria,
      indice
    });
    if (!compatible || typeof compatible !== "object") {
      advertencias.push({ codigo: "EXTRA_SIN_IDENTIDAD", indice });
      return;
    }
    if (compatible.categoria && compatible.categoria !== categoria) return;
    const personaPermanente = resolverPersonaPermanenteParaExtra(compatible, personal);
    const tieneDatoIdentidad = Boolean(
      String(compatible.id ?? "").trim() ||
      String(compatible.personaId ?? "").trim() ||
      String(compatible.funcionario ?? "").trim() ||
      String(compatible.nombre ?? "").trim()
    );
    if (!tieneDatoIdentidad) {
      advertencias.push({ codigo: "EXTRA_SIN_IDENTIDAD", indice });
      return;
    }
    const personaExtra = personaPermanente || (
      String(compatible.id ?? "").trim()
        ? compatible
        : String(compatible.personaId ?? "").trim()
          ? { ...compatible, id: String(compatible.personaId).trim() }
          : String(compatible.funcionario ?? "").trim()
            ? compatible
            : asegurarIdExtraHistorico(
                compatible,
                { fecha: fechaDia, categoria, indice }
              )
    );
    const identidad = obtenerClaveIdentidadPersona(personaExtra);
    if (!identidad) {
      advertencias.push({ codigo: "EXTRA_SIN_IDENTIDAD", indice });
      return;
    }
    if (extrasPorIdentidad.has(identidad)) return;
    extrasPorIdentidad.set(identidad, { persona: personaExtra, registro: compatible });
    const validacionOrigen = typeof validarExtraOrigen === "function"
      ? validarExtraOrigen({ extra: compatible, categoria, turnoDestino: turno })
      : null;
    if (validacionOrigen?.estado === ESTADOS_VALIDACION_EXTRA_ORIGEN.VERIFICADO_INDISPONIBLE) {
      extrasBloqueadosPorOrigen.add(identidad);
      advertencias.push({
        codigo: "EXTRA_INDISPONIBLE_EN_TURNO_ORIGEN",
        personaId: validacionOrigen.personaId || personaMinima(personaExtra).personaId,
        turnoOrigen: validacionOrigen.turnoOrigen,
        causas: [...(validacionOrigen.causas || [])]
      });
    } else if (validacionOrigen?.estado === ESTADOS_VALIDACION_EXTRA_ORIGEN.NO_VERIFICABLE) {
      advertencias.push({
        codigo: "EXTRA_ORIGEN_NO_VERIFICABLE",
        personaId: personaMinima(personaExtra).personaId,
        turnoOrigen: validacionOrigen.turnoOrigen || null,
        motivo: validacionOrigen.motivo
      });
    }
    if (indisponibilidadesPorIdentidad.has(identidad)) {
      advertencias.push({
        codigo: "EXTRA_CON_INDISPONIBILIDAD_ACTIVA",
        personaId: personaMinima(personaExtra).personaId,
        causas: [...indisponibilidadesPorIdentidad.get(identidad).causas]
      });
    }
  });

  const extrasQueAportanPorIdentidad = new Map(
    [...extrasPorIdentidad].filter(([identidad]) =>
      !baseDisponiblePorIdentidad.has(identidad) &&
      !indisponibilidadesPorIdentidad.has(identidad) &&
      !extrasBloqueadosPorOrigen.has(identidad)
    )
  );
  const dotacionPorIdentidad = new Map(baseDisponiblePorIdentidad);
  extrasQueAportanPorIdentidad.forEach(({ persona }, identidad) => {
    dotacionPorIdentidad.set(identidad, persona);
  });
  const presentarExtras = (mapa) => [...mapa.values()].map(({ persona, registro }) =>
    detalleExtra(persona, registro)
  );
  const extrasRegistradosPresentacion = presentarExtras(extrasPorIdentidad);
  const extrasQueAportanPresentacion = presentarExtras(extrasQueAportanPorIdentidad);
  const registrosAsistencia = calendarioCategoria?.asistenciaDia?.[fechaDia];
  const asistenciaFecha = registrosAsistencia && typeof registrosAsistencia === "object" &&
    !Array.isArray(registrosAsistencia)
    ? registrosAsistencia
    : {};
  const personasConsideradas = [...dotacionPorIdentidad.values()];
  const asistenciaPorEstado = {
    [ESTADOS_ASISTENCIA.PRESENTE]: [],
    [ESTADOS_ASISTENCIA.AUSENTE]: [],
    [ESTADOS_ASISTENCIA.PENDIENTE]: []
  };
  personasConsideradas.forEach((persona) => {
    const estado = obtenerEstadoAsistencia(asistenciaFecha, persona);
    asistenciaPorEstado[estado].push(personaMinima(persona));
  });
  const identidadesConsideradas = new Set(
    personasConsideradas.map(obtenerClaveIdentidadPersona).filter(Boolean)
  );
  const registrosFueraDeDotacion = Object.entries(asistenciaFecha)
    .filter(([clave]) => !identidadesConsideradas.has(clave))
    .map(([clave, registro]) => ({
      clave,
      estado: registro && typeof registro === "object" && !Array.isArray(registro)
        ? registro.estado
        : registro
    }));
  if (registrosFueraDeDotacion.length > 0) {
    advertencias.push({
      codigo: "ASISTENCIA_FUERA_DE_DOTACION",
      cantidad: registrosFueraDeDotacion.length
    });
  }
  const crearGrupoAsistencia = (personas) => ({
    cantidad: personas.length,
    personas
  });

  return {
    ...cohorte,
    bajasConocidas: { cantidad: bajas.length, personas: bajas, porCausa },
    baseDisponible: {
      cantidad: baseDisponible.length,
      personas: baseDisponible.map(personaMinima)
    },
    extrasRegistrados: {
      cantidad: extrasRegistradosPresentacion.length,
      personas: extrasRegistradosPresentacion
    },
    extrasQueAportan: {
      cantidad: extrasQueAportanPresentacion.length,
      personas: extrasQueAportanPresentacion
    },
    dotacionPrevistaOperativa: {
      cantidad: dotacionPorIdentidad.size,
      personas: [...dotacionPorIdentidad.values()].map(personaMinima)
    },
    asistenciaRegistrada: {
      personasConsideradas: crearGrupoAsistencia(personasConsideradas.map(personaMinima)),
      presentes: crearGrupoAsistencia(asistenciaPorEstado[ESTADOS_ASISTENCIA.PRESENTE]),
      ausentes: crearGrupoAsistencia(asistenciaPorEstado[ESTADOS_ASISTENCIA.AUSENTE]),
      pendientes: crearGrupoAsistencia(asistenciaPorEstado[ESTADOS_ASISTENCIA.PENDIENTE]),
      registrosFueraDeDotacion: {
        cantidad: registrosFueraDeDotacion.length,
        registros: registrosFueraDeDotacion
      }
    },
    advertencias
  };
};
