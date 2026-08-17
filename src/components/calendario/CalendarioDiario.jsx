import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { configuracionSectores } from "../../data/sectores";
import {
  obtenerConfiguracionPlanillaEfectiva
} from "../../utils/configuracionPlanilla.js";
import { resolverEstructuraCalendario } from "../../utils/estructuraCalendario.js";
import {
  obtenerConfiguracionTurno,
  obtenerEstrategiaRotacionPlanilla
} from "../../config/turnos.js";
import {
  estaCertificado,
  estaDeLicencia,
  esDiaLibre,
  keyDiaFromDate,
  obtenerSemanasDelMes,
  semanaKeyFromDate
} from "../../utils/fechas";
import { obtenerBloqueParaFecha } from "../../utils/periodosRotacionPlanilla.js";
import { normalizar } from "../../utils/texto";
import {
  obtenerClaveIdentidadPersona,
  personasCompartenIdentidad
} from "../../utils/identidadPersonas.js";
import {
  crearReferenciaPersona,
  quitarPersonaDeListaReferencias,
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "../../utils/referenciasPersonas.js";
import {
  aplicarMovimientosCalendario,
  crearMovimientosEntreFilasCalendario
} from "../../utils/cambiosCalendario.js";
import { construirAsignacionesDiariasCalendario } from "../../utils/pipelineCalendarioDiario.js";
import {
  agregarExtraALista,
  configurarTipoExtra,
  crearExtraDesdeLibre,
  crearExtraDesdePersonal,
  crearExtraTemporal,
  esExtraCobertura,
  obtenerDescripcionExtra,
  obtenerCoberturasExtrasPresentacion,
  obtenerIdentidadesPersonasCubiertas,
  obtenerOpcionesCoberturaExtra,
  prepararCandidatosExtraOtroTurno
} from "../../utils/extrasPersonas.js";
import { resolverTurnantesYCoberturasOperativas } from "../../utils/distribucionTurnantesCoberturas.js";
import PanelExtraLibre from "./PanelExtraLibre.jsx";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";
import {
  obtenerClaveRenderPersona,
  obtenerIdsPersonalDuplicados
} from "../../utils/validacionPersonal.js";
import {
  ESTADOS_ASISTENCIA,
  obtenerEstadoAsistencia,
  obtenerPersonasPrevistas
} from "../../utils/asistenciaPersonas.js";
import {
  cambiarAsistenciaCalendario,
  filtrarAsignacionesAusentes,
  obtenerAusentesDelDia,
  obtenerPersonasParaSinAsignar,
  prepararCambioAsistencia,
  quitarPersonasDeSinAsignar
} from "../../utils/ausenciasCalendario.js";
import {
  aplicarCoberturaLibreSaludMental,
  SECTOR_ID_SALUD_MENTAL,
  obtenerTitularSaludMental,
  puedeCubrirLibreSaludMental,
  resolverCoberturaSaludMental
} from "../../utils/coberturaSaludMental.js";
import { aplicarPrioridadGeneralPorSectorId } from "../../utils/prioridadesSectores.js";
import {
  resolverClaveNormalizadaParaFila
} from "../../utils/resolucionIdentidadesPlanilla.js";
import { crearResumenTurno } from "../../utils/resumenTurno.js";
import {
  cerrarFechaCategoria,
  crearSnapshotCierreTurno,
  estaFechaCategoriaCerrada,
  obtenerResponsablesCierre,
  obtenerUltimaVersionCierre,
  reabrirFechaCategoria,
  snapshotAAsignacionesVisibles
} from "../../utils/cierreTurno.js";
import {
  esDistribucionOpcion1,
  esDistribucionPorBoxes,
  obtenerSectoresVisiblesBoxes,
  obtenerSectoresVisiblesOpcion1,
  quitarRedistribucionFecha,
  recalcularRedistribucionOpcion1Automatica,
  recalcularRedistribucionOpcion2Automatica,
  redistribuirCritica,
  redistribuirPorBoxes,
  validarContextoRedistribucion
} from "../../utils/redistribucionEnfermeros.js";
import {
  aplicarPrioridadCoberturaParejas,
  PROCEDENCIA_REDISTRIBUCION_AUTOMATICA
} from "../../utils/coberturaParejasEnfermeros.js";
import {
  formatearAlertaSectoresCriticos,
  obtenerSectoresCriticosSinCobertura
} from "../../utils/alertaSectoresCriticos.js";
import PanelConfirmacionRedistribucion from "./PanelConfirmacionRedistribucion.jsx";
import PanelAgregarExtra from "./PanelAgregarExtra.jsx";
import PanelNoDisponible from "./PanelNoDisponible.jsx";
import {
  eliminarExtraVinculadoCambioOtroTurno,
  eliminarNoDisponibleVinculado,
  esCambioOtroTurnoVinculado,
  obtenerExtrasCompatiblesCambioOtroTurno,
  obtenerSectorOperativoPersona,
  vincularCambioOtroTurno
} from "../../utils/cambioOtroTurno.js";
import {
  crearRegistroNoDisponible,
  excluirAusenciasOperativasNoDisponiblesDeAsignaciones,
  MOTIVOS_NO_DISPONIBLE,
  obtenerEtiquetaTurnoDestino,
  obtenerNoDisponiblesDelDia,
  reemplazarRegistroNoDisponible
} from "../../utils/noDisponiblesMotivos.js";
import {
  crearPersonaPresentacionTurnante,
  obtenerIdentidadesTurnantes,
  obtenerNombreConMarcaTurnante
} from "../../utils/etiquetaTurnante.js";
import {
  detectarDisponiblesPorReintegro,
  evaluarAsignacionesParcialesDia,
  filtrarReintegradosSinSectorDia,
  obtenerAsignacionesParcialesPeriodo
} from "../../utils/asignacionesParcialesPlanilla.js";
import {
  excluirCertificadosDeAsignaciones,
  filtrarPersonasNoCertificadas
} from "../../utils/disponibilidadCertificacionesCalendario.js";
import {
  evaluarDisponibilidadPorNovedades,
  excluirNoDisponiblesPorNovedadesDeAsignaciones
} from "../../utils/novedadesPersonal.js";
import {
  agregarCertificacionPorElDia,
  eliminarCertificacionPorElDia
} from "../../utils/certificacionesPersonas.js";
import {
  dividirReanimacionSillones,
  esDestinoSinteticoReanimacionSillones,
  SECTOR_ID_REANIMACION_SILLONES
} from "../../utils/reanimacionSillones.js";
import {
  DESTINOS_DINAMICOS_ENFERMEROS,
  incorporarDestinosDinamicosAlOrden,
  resolverDestinosDinamicosCalendario
} from "../../utils/destinosDinamicosCalendario.js";

const obtenerAsistenciaDeSnapshot = (snapshot, referencia) => {
  const clave = obtenerClaveIdentidadPersona({
    id: referencia?.personaId,
    nombre: referencia?.nombre
  });
  return (clave && snapshot?.asistencia?.[clave]) || ESTADOS_ASISTENCIA.PENDIENTE;
};

function CalendarioDiario({
  personal = [],
  estadoMensual,
  planilla = {},
  tipo,
  mesActivo = "",
  licencias,
  certificaciones,
  novedades = [],
  setCertificaciones,
  obtenerCertificacionesActuales,
  calendario,
  obtenerCalendarioActual,
  cargarPersonalOtrosTurnos,
  setCalendario,
  esDiaParo,
  onDataReady,
  fecha,
  setFecha,
  turnoActivo = "",
  soloLectura = false,
  usuarioActual = "",
  puedeReabrirCierre = false
}) {
  const personalFiltrado = useMemo(
    () => personal.filter((p) => p?.categoria === tipo),
    [personal, tipo]
  );
  const idsPersonalDuplicados = useMemo(
    () => obtenerIdsPersonalDuplicados(personal),
    [personal]
  );

const {
  cambiosDia = {},
  procedenciaCambiosDia = {},
  cambiosParoDia = {},
  noDisponibles = {},
  extras = {},
  asistenciaDia = {},
  cierresDia = {}
} = calendario || {};

  const [formularioExtra, setFormularioExtra] = useState(null);
  const [formularioExtraLibre, setFormularioExtraLibre] = useState(null);
  const [candidatosExtra, setCandidatosExtra] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [alertasAbiertas, setAlertasAbiertas] = useState(true);
  const [cierreVisible, setCierreVisible] = useState(false);
  const [seleccionResponsable, setSeleccionResponsable] = useState({ contexto: "", personaId: "" });
  const [errorResponsable, setErrorResponsable] = useState({ contexto: "", mensaje: "" });
  const [confirmacionRedistribucion, setConfirmacionRedistribucion] = useState(null);
  const [formularioNoDisponible, setFormularioNoDisponible] = useState(null);
  const [errorAsistencia, setErrorAsistencia] = useState("");
  const prevDataRef = useRef(null);
  const altaExtraEnCursoRef = useRef(false);
  const cargaExtrasRef = useRef(0);

  const {
    sectoresCriticos = [],
    sectoresBajaPrioridad = [],
    prioridadSectores = [],
    sectoresCriticosIds = [],
    prioridadSectoresIds = [],
    sectoresParo = [],
    prioridadesParo = {},
    ordenVisual = []
  } = configuracionSectores[tipo] || {};

  const configuracionEfectiva = useMemo(
    () => obtenerConfiguracionPlanillaEfectiva({
      estadoMensual,
      turno: turnoActivo,
      categoria: tipo,
      mes: mesActivo
    }),
    [estadoMensual, mesActivo, tipo, turnoActivo]
  );
  const estructuraCalendario = resolverEstructuraCalendario({
    configuracionEfectiva,
    ordenVisualLegacy: ordenVisual
  });
  const {
    filasConfiguracion,
    filas,
    turnantes: turnantesEfectivos,
    ordenVisual: ordenVisualEfectivo
  } = estructuraCalendario;

const keyDia = keyDiaFromDate(fecha);
const periodoPlanilla = useMemo(() => {
  const estrategia = obtenerEstrategiaRotacionPlanilla({
    turnoId: turnoActivo,
    tipo,
    mesActivo
  });

  if (estrategia.tipo === "cada_3_dias") {
    const bloque = obtenerBloqueParaFecha({
      fecha: keyDia,
      fechaBase: estrategia.fechaBase,
      duracionDias: estrategia.duracionDias
    });
    const clavePeriodo = bloque?.clave || null;

    return {
      tipoPeriodo: "cada_3_dias",
      clavePeriodo,
      periodo: bloque,
      planillaPeriodo: clavePeriodo
        ? planilla?.rotacion3Dias?.bloques?.[clavePeriodo] || {}
        : {},
      coberturasSaludMental: planilla?.rotacion3Dias?.coberturaLibreSM || {}
    };
  }

  const clavePeriodo = semanaKeyFromDate(fecha, mesActivo);
  const periodo = obtenerSemanasDelMes(mesActivo).find(
    (semana) => semana.clave === clavePeriodo
  );
  return {
    tipoPeriodo: "semanal",
    clavePeriodo,
    periodo,
    planillaPeriodo: clavePeriodo ? planilla?.[clavePeriodo] || {} : {},
    coberturasSaludMental: planilla?.coberturaLibreSM || {}
  };
}, [fecha, keyDia, mesActivo, planilla, tipo, turnoActivo]);
const {
  clavePeriodo,
  periodo,
  planillaPeriodo,
  coberturasSaludMental
} = periodoPlanilla;
const asignacionesParcialesPeriodo = obtenerAsignacionesParcialesPeriodo(
  planilla,
  clavePeriodo
);
const bloqueadoPorCierre = estaFechaCategoriaCerrada(cierresDia, keyDia);
const soloLecturaEfectiva = soloLectura || bloqueadoPorCierre;
const versionCierre = obtenerUltimaVersionCierre(cierresDia, keyDia);
const snapshotCierre = versionCierre?.snapshot || null;
const contextoResponsable = `${turnoActivo}|${keyDia}|${tipo}`;
const responsableSeleccionadoId = seleccionResponsable.contexto === contextoResponsable
  ? seleccionResponsable.personaId
  : "";
const mensajeErrorResponsable = errorResponsable.contexto === contextoResponsable
  ? errorResponsable.mensaje
  : "";
const licenciadosResponsables = obtenerResponsablesCierre(personal);
const asistenciaFecha = asistenciaDia[keyDia] || {};
const ausentesDelDia = obtenerAusentesDelDia({
  registros: asistenciaFecha,
  personal: [
    ...personalFiltrado,
    ...(Array.isArray(extras[keyDia]) ? extras[keyDia].filter(Boolean) : [])
  ]
});
const configTurnoCalendario = obtenerConfiguracionTurno(turnoActivo);
const cambiosActivos = esDiaParo ? cambiosParoDia : cambiosDia;
const claveCambiosActivos = esDiaParo ? "cambiosParoDia" : "cambiosDia";
const fechaMinima = `${mesActivo}-01`;
const [yearMesActivo, monthMesActivo] = mesActivo.split("-").map(Number);
const ultimoDiaDelMes = new Date(yearMesActivo, monthMesActivo, 0).getDate();
const fechaMaxima = `${mesActivo}-${String(ultimoDiaDelMes).padStart(2, "0")}`;
const extrasDia = Array.isArray(extras[keyDia]) ? extras[keyDia].filter(Boolean) : [];
const cambiosFechaActual = cambiosDia[keyDia] || {};
const distribucionPorBoxesActiva =
  tipo === "enfermero" && esDistribucionPorBoxes(cambiosFechaActual);
const distribucionOpcion1Activa =
  tipo === "enfermero" && esDistribucionOpcion1(cambiosFechaActual);
const tipoRedistribucionActiva = distribucionOpcion1Activa
  ? "critica"
  : distribucionPorBoxesActiva
    ? "boxes"
    : null;
const obtenerFilasRedistribucion = (filasOriginales) => {
  if (distribucionPorBoxesActiva) {
    return obtenerSectoresVisiblesBoxes(filasOriginales, filasConfiguracion);
  }
  if (distribucionOpcion1Activa) {
    return obtenerSectoresVisiblesOpcion1(filasOriginales, filasConfiguracion);
  }
  return filasOriginales;
};
const filasCalendario = obtenerFilasRedistribucion(filas);

const confirmacionRedistribucionVisible = Boolean(
  confirmacionRedistribucion &&
  confirmacionRedistribucion.contexto.turno === turnoActivo &&
  confirmacionRedistribucion.contexto.mes === mesActivo &&
  confirmacionRedistribucion.contexto.fecha === keyDia &&
  confirmacionRedistribucion.contexto.categoria === tipo &&
  confirmacionRedistribucion.contexto.soloLectura === soloLecturaEfectiva
);

useEffect(() => {
  altaExtraEnCursoRef.current = false;
}, [extras, keyDia]);

const esLibreReal = useCallback(
  (e) => esDiaLibre(e, fecha, false),
  [fecha]
);

const libres = personalFiltrado.filter(
  (persona) =>
    esLibreReal(persona) &&
    obtenerEstadoAsistencia(asistenciaFecha, persona) !==
      ESTADOS_ASISTENCIA.AUSENTE
);

const estaLibre = (e) => {
    const esExtraHoy = extrasDia.some((ex) => personasCompartenIdentidad(ex, e));
    return esDiaLibre(e, fecha, esExtraHoy);
  };

const estaDeLicenciaHoy = useCallback(
  (e) => e && estaDeLicencia(licencias, e, fecha, personal),
  [fecha, licencias, personal]
);

const estaCertificadoHoy = useCallback(
  (e) => e && estaCertificado(certificaciones, e, fecha, personal),
  [certificaciones, fecha, personal]
);

const certificados = useMemo(
  () => [...new Map(
    personalFiltrado
      .filter(estaCertificadoHoy)
      .map((persona) => [obtenerClaveIdentidadPersona(persona), persona])
      .filter(([clave]) => Boolean(clave))
  ).values()],
  [estaCertificadoHoy, personalFiltrado]
);

  const estaNoDisponibleManual = (e) =>
    e && (noDisponibles[keyDia] || []).some(
      (referencia) => referenciaCorrespondeAPersona(
        referencia,
        e,
        personalFiltrado
      )
    );

const estaNoDisponiblePorNovedad = (persona) => persona && !evaluarDisponibilidadPorNovedades({
  novedades,
  persona,
  fecha: keyDia,
  turno: turnoActivo
}).disponible;

const estaNoDisponible = (persona) =>
  estaNoDisponibleManual(persona) || estaNoDisponiblePorNovedad(persona);

const estaAusente = (e) =>
    e &&
    (
      (esLibreReal(e) && !extrasDia.some((ex) => personasCompartenIdentidad(ex, e))) ||
      estaNoDisponible(e) ||
      estaDeLicenciaHoy(e) ||
      estaCertificadoHoy(e) ||
      obtenerEstadoAsistencia(asistenciaFecha, e) === ESTADOS_ASISTENCIA.AUSENTE
    );

const puedeAplicarseCoberturaDirecta = (persona) => {
  if (!persona) return false;
  if (!estaAusente(persona)) return true;
  const cambioVinculado = esCambioOtroTurnoVinculado({
    persona,
    registros: noDisponibles[keyDia],
    extras: extrasDia,
    personal: personalFiltrado
  });
  return cambioVinculado &&
    !esLibreReal(persona) &&
    !estaNoDisponiblePorNovedad(persona) &&
    !estaDeLicenciaHoy(persona) &&
    !estaCertificadoHoy(persona) &&
    obtenerEstadoAsistencia(asistenciaFecha, persona) !== ESTADOS_ASISTENCIA.AUSENTE;
};

const evaluacionParcialesDia = evaluarAsignacionesParcialesDia({
  distribucionBase: planillaPeriodo,
  asignacionesParciales: asignacionesParcialesPeriodo,
  fecha: keyDia,
  personal,
  esPersonaDisponible: (persona) =>
    personalFiltrado.some((actual) => personasCompartenIdentidad(actual, persona)) &&
    !estaAusente(persona),
  estaPersonaBaseDeLicencia: (personaBase) => estaDeLicenciaHoy(personaBase)
});
const planillaPeriodoEfectiva = evaluacionParcialesDia.distribucion;
const identidadesParcialesAplicadas = new Set(
  evaluacionParcialesDia.aplicadas.map(
    (asignacion) => String(asignacion.personaId)
  )
);
const identidadesTurnantes = obtenerIdentidadesTurnantes({
  distribucion: planillaPeriodoEfectiva,
  posicionesTurnantes: turnantesEfectivos,
  personal
});
const reintegrosPeriodo = detectarDisponiblesPorReintegro({
  personal,
  licencias,
  distribucionBase: planillaPeriodo,
  asignacionesParciales: [],
  periodo,
  mesActivo,
  categoria: tipo
});
const reintegradosSinSectorHoy = filtrarReintegradosSinSectorDia({
  reintegros: reintegrosPeriodo,
  fecha: keyDia,
  idsParcialesAplicadas: identidadesParcialesAplicadas,
  categoria: tipo,
  esPersonaDisponible: (persona) =>
    !estaAusente(persona) &&
    personalFiltrado.some((actual) => personasCompartenIdentidad(actual, persona))
});
const identidadesReintegradosSinSector = new Set(
  reintegradosSinSectorHoy.map(obtenerClaveIdentidadPersona).filter(Boolean)
);

const borrarExtra = (extra) => {
  if (soloLecturaEfectiva) return;
  setCalendario((prev) => eliminarExtraVinculadoCambioOtroTurno({
    calendarioCategoria: prev,
    fecha: keyDia,
    extra,
    personal: personalFiltrado
  }));

  if (personasCompartenIdentidad(seleccionado?.enfermero, extra)) {
    setSeleccionado(null);
  }
};

const abrirFormularioExtra = async () => {
  if (soloLecturaEfectiva) return;
  const cargaId = cargaExtrasRef.current + 1;
  cargaExtrasRef.current = cargaId;
  const contexto = {
    turno: turnoActivo,
    mes: mesActivo,
    fecha: keyDia,
    categoria: tipo,
    calendario
  };
  setCandidatosExtra([]);
  setFormularioExtra({
    modalidad: "personal_otro_turno",
    tipoExtra: "cobertura",
    personaCubiertaId: "",
    personaId: "",
    nombre: "",
    funcionario: "",
    turnoOrigen: "",
    cargando: true,
    error: "",
    contexto
  });

  try {
    const candidatos = cargarPersonalOtrosTurnos
      ? await cargarPersonalOtrosTurnos({ categoria: tipo })
      : [];
    if (cargaExtrasRef.current !== cargaId) return;
    const filtrados = prepararCandidatosExtraOtroTurno({
      candidatos,
      categoria: tipo,
      turnoActivo,
      extrasDia
    });
    setCandidatosExtra(filtrados);
    setFormularioExtra((actual) => actual?.contexto === contexto
      ? { ...actual, cargando: false }
      : actual);
  } catch {
    if (cargaExtrasRef.current !== cargaId) return;
    setFormularioExtra((actual) => actual?.contexto === contexto
      ? {
          ...actual,
          cargando: false,
          error: "No se pudo cargar el Personal de otros turnos."
        }
      : actual);
  }
};

const contextoExtraValido = () =>
  formularioExtra &&
  formularioExtra.contexto.turno === turnoActivo &&
  formularioExtra.contexto.mes === mesActivo &&
  formularioExtra.contexto.fecha === keyDia &&
  formularioExtra.contexto.categoria === tipo &&
  formularioExtra.contexto.calendario === calendario &&
  formularioExtra.contexto.calendario ===
    (obtenerCalendarioActual ? obtenerCalendarioActual() : calendario) &&
  !soloLecturaEfectiva;

const confirmarExtra = () => {
  if (!contextoExtraValido()) {
    setFormularioExtra((actual) => ({
      ...actual,
      error: "El calendario cambió mientras agregabas el Extra. Revisá nuevamente."
    }));
    return;
  }
  const listaActual = calendario.extras?.[keyDia] || [];
  let resultado;
  if (formularioExtra.modalidad === "personal_otro_turno") {
    const candidato = candidatosExtra.find(
      (actual) =>
        `${actual.turnoOrigen}|${actual.persona.id}` === formularioExtra.personaId
    );
    resultado = crearExtraDesdePersonal({
      persona: candidato?.persona,
      turnoOrigen: candidato?.turnoOrigen,
      categoria: tipo,
      extrasDia: listaActual
    });
  } else {
    resultado = crearExtraTemporal({
      nombre: formularioExtra.nombre,
      funcionario: formularioExtra.funcionario,
      categoria: tipo,
      personal,
      extrasDia: listaActual
    });
  }
  if (!resultado.extra) {
    setFormularioExtra((actual) => ({ ...actual, error: resultado.error }));
    return;
  }
  const opcionCubierta = personasCubriblesExtra.find(
    (opcion) => String(opcion.persona.id) === String(formularioExtra.personaCubiertaId)
  );
  resultado = configurarTipoExtra({
    extra: resultado.extra,
    tipoExtra: formularioExtra.tipoExtra,
    personaCubierta: opcionCubierta?.persona,
    sectorCubierto: opcionCubierta?.sector,
    extrasDia: listaActual,
    personal
  });
  if (!resultado.extra) {
    setFormularioExtra((actual) => ({ ...actual, error: resultado.error }));
    return;
  }

  if (
    formularioExtra.tipoExtra === "cobertura" &&
    formularioExtra.modalidad === "personal_otro_turno"
  ) {
    const vinculado = vincularCambioOtroTurno({
      calendarioCategoria: calendario,
      fecha: keyDia,
      titular: opcionCubierta?.persona,
      sector: opcionCubierta?.sector,
      extra: resultado.extra,
      personal: personalFiltrado
    });
    if (vinculado.error) {
      setFormularioExtra((actual) => ({ ...actual, error: vinculado.error }));
      return;
    }
    altaExtraEnCursoRef.current = true;
    setCalendario((prev) => vincularCambioOtroTurno({
      calendarioCategoria: prev,
      fecha: keyDia,
      titular: opcionCubierta?.persona,
      sector: opcionCubierta?.sector,
      extra: resultado.extra,
      personal: personalFiltrado
    }).calendario);
    setFormularioExtra(null);
    return;
  }

  altaExtraEnCursoRef.current = true;
  setCalendario((prev) => {
    if (prev !== formularioExtra.contexto.calendario) return prev;
    return {
      ...prev,
      extras: {
        ...(prev.extras || {}),
        [keyDia]: agregarExtraALista(prev.extras?.[keyDia], resultado.extra)
      }
    };
  });
  setFormularioExtra(null);
};

const abrirFormularioExtraLibre = (persona) => {
  if (soloLecturaEfectiva) return;
  if (extrasDia.some((extra) => personasCompartenIdentidad(extra, persona))) return;
  setFormularioExtraLibre({
    persona,
    fecha: keyDia,
    motivoLibre: "",
    personaCubiertaId: "",
    error: "",
    contexto: {
      turno: turnoActivo,
      mes: mesActivo,
      fecha: keyDia,
      categoria: tipo,
      calendario
    }
  });
};

const asignacionOrdenada = (() => {
let asignacionCompleta = construirAsignacionesDiariasCalendario({
  filasCalendario,
  filasConfiguracion,
  planillaPeriodoEfectiva,
  cambiosDia: cambiosDia[keyDia],
  procedenciaCambiosDia: procedenciaCambiosDia[keyDia],
  personal,
  personalDisponibleParaOverrides: [...personalFiltrado, ...extrasDia],
  turnantes: turnantesEfectivos
});

asignacionCompleta = excluirCertificadosDeAsignaciones({
  asignaciones: asignacionCompleta,
  estaCertificada: estaCertificadoHoy
});
asignacionCompleta = excluirAusenciasOperativasNoDisponiblesDeAsignaciones({
  asignaciones: asignacionCompleta,
  registros: noDisponibles[keyDia],
  personal: personalFiltrado
});
asignacionCompleta = excluirNoDisponiblesPorNovedadesDeAsignaciones({
  asignaciones: asignacionCompleta,
  novedades,
  fecha: keyDia,
  turno: turnoActivo
});
if (distribucionOpcion1Activa) {
  asignacionCompleta = recalcularRedistribucionOpcion1Automatica({
    asignaciones: asignacionCompleta,
    cambiosDia: cambiosDia[keyDia],
    procedenciaCambiosDia: procedenciaCambiosDia[keyDia],
    ordenVisual: ordenVisualEfectivo,
    filasConfiguracion,
    procedenciaAutomatica: PROCEDENCIA_REDISTRIBUCION_AUTOMATICA
  });
} else if (distribucionPorBoxesActiva) {
  asignacionCompleta = recalcularRedistribucionOpcion2Automatica({
    asignaciones: asignacionCompleta,
    cambiosDia: cambiosDia[keyDia],
    procedenciaCambiosDia: procedenciaCambiosDia[keyDia],
    ordenVisual: ordenVisualEfectivo,
    filasConfiguracion,
    procedenciaAutomatica: PROCEDENCIA_REDISTRIBUCION_AUTOMATICA
  });
}
const filaSaludMental = filasConfiguracion.find(
  (fila) => fila.tipo === "sector" && fila.sectorId === SECTOR_ID_SALUD_MENTAL
);
const titularSaludMental = obtenerTitularSaludMental({
  planillaSemana: planillaPeriodo,
  personal: personalFiltrado,
  fila: filaSaludMental
});
const coberturaSaludMental = resolverCoberturaSaludMental({
  coberturas: coberturasSaludMental,
  clave: clavePeriodo,
  personal: personalFiltrado
});
const cambiosActivosDia = cambiosActivos[keyDia] || {};
const existeCambioManualSaludMental = Object.hasOwn(
  cambiosActivosDia,
  resolverClaveNormalizadaParaFila({ distribucion: cambiosActivosDia, fila: filaSaludMental })
);
const coberturaDisponible = puedeCubrirLibreSaludMental({
  persona: coberturaSaludMental,
  tipo,
  estaLibre: esLibreReal(coberturaSaludMental),
  estaDeLicencia: estaDeLicenciaHoy(coberturaSaludMental),
  estaCertificada: estaCertificadoHoy(coberturaSaludMental),
  estaNoDisponible: estaNoDisponible(coberturaSaludMental)
});

asignacionCompleta = aplicarCoberturaLibreSaludMental({
  asignaciones: asignacionCompleta,
  sectorId: SECTOR_ID_SALUD_MENTAL,
  titular: titularSaludMental,
  cobertura: coberturaSaludMental,
  titularLibre: Boolean(
    titularSaludMental &&
    esLibreReal(titularSaludMental) &&
    !estaDeLicenciaHoy(titularSaludMental) &&
    !estaCertificadoHoy(titularSaludMental) &&
    !estaNoDisponible(titularSaludMental) &&
    obtenerEstadoAsistencia(asistenciaFecha, titularSaludMental) !== ESTADOS_ASISTENCIA.AUSENTE
  ),
  coberturaDisponible,
  existeCambioManual: existeCambioManualSaludMental
});

const identidadesCubiertas = obtenerIdentidadesPersonasCubiertas(extrasDia, personal);
const resolucionOperativa = resolverTurnantesYCoberturasOperativas({
  asignaciones: asignacionCompleta,
  extras: extrasDia,
  personal,
  esPersonaDisponible: (persona) => !estaAusente(persona),
  esPersonaDisponibleParaCobertura: puedeAplicarseCoberturaDirecta,
  ajustarSectores: (sectores) =>
    tipo === "enfermero" && !esDiaParo
      ? aplicarPrioridadCoberturaParejas({
          asignaciones: sectores,
          distribucionBase: planillaPeriodo,
          personal,
          cambiosDia: cambiosDia[keyDia],
          procedenciaCambiosDia: procedenciaCambiosDia[keyDia],
          esPersonaDisponible: puedeAplicarseCoberturaDirecta,
          estadoMensual,
          turno: turnoActivo,
          categoria: tipo,
          mes: mesActivo
        })
      : sectores
});
let asignacionBase = resolucionOperativa.asignaciones;

  if (esDiaParo) {
    sectoresCriticos.forEach((critico) => {
      const sectorCritico = asignacionBase.find((item) => item.nombre === critico);

      if (sectorCritico && !sectorCritico.enfermero && !sectorCritico.vacioManual) {
        for (const sectorBajaPrioridad of sectoresBajaPrioridad) {
          const donante = asignacionBase.find((item) => item.nombre === sectorBajaPrioridad);

          if (donante?.enfermero && !estaAusente(donante.enfermero)) {
            sectorCritico.enfermero = donante.enfermero;
            donante.enfermero = null;
            donante.sacrificado = true;
            break;
          }
        }
      }
    });
  } else {
    asignacionBase = aplicarPrioridadGeneralPorSectorId({
      asignaciones: asignacionBase,
      prioridadSectorIds: prioridadSectoresIds,
      esPersonaDisponible: (persona) => !estaAusente(persona)
    });
  }

  const asignacionFinal = asignacionBase;

const hayHuecosFinal = asignacionFinal.some((a) => !a.enfermero);

const usados = asignacionFinal
  .map((a) => obtenerClaveIdentidadPersona(a.enfermero))
  .filter(Boolean);

const identidadesSobrantes = new Set(usados);
const sobrantes = [...personalFiltrado, ...extrasDia].filter((e) => {
  if (!e || estaAusente(e)) return false;

  const claveIdentidad = obtenerClaveIdentidadPersona(e);

  if (
    !claveIdentidad ||
    identidadesCubiertas.has(claveIdentidad) ||
    esExtraCobertura(e) ||
    identidadesSobrantes.has(claveIdentidad) ||
    identidadesReintegradosSinSector.has(claveIdentidad)
  ) return false;

  identidadesSobrantes.add(claveIdentidad);
  return true;
});

let asignacionParaMostrar = asignacionFinal;
let ordenVisualActivo = obtenerFilasRedistribucion(ordenVisualEfectivo);
const divisionReanimacionSillones = dividirReanimacionSillones({
  asignaciones: asignacionFinal,
  sobrantes,
  categoria: tipo,
  esDiaParo,
  cambiosDia: cambiosDia[keyDia],
  personalDisponible: [...personalFiltrado, ...extrasDia],
  ordenVisual: ordenVisualEfectivo
});
if (divisionReanimacionSillones.seDivide) {
  asignacionParaMostrar = divisionReanimacionSillones.asignaciones;
  ordenVisualActivo = divisionReanimacionSillones.ordenVisual;
} else {
  const destinosDinamicos = tipo === "enfermero"
    ? resolverDestinosDinamicosCalendario({
        destinos: DESTINOS_DINAMICOS_ENFERMEROS,
        cambiosDia: cambiosDia[keyDia],
        sobrantes,
        habilitarAutomaticos: !hayHuecosFinal
      })
    : { asignaciones: [], sobrantes };

  if (destinosDinamicos.asignaciones.length > 0) {
    asignacionParaMostrar = [
      ...asignacionFinal,
      ...destinosDinamicos.asignaciones
    ];
    ordenVisualActivo = incorporarDestinosDinamicosAlOrden({
      ordenVisual: ordenVisualActivo,
      destinosPresentes: destinosDinamicos.asignaciones,
      filasConfiguracion
    });
  }

  if (!hayHuecosFinal) {
    destinosDinamicos.sobrantes.forEach((e) => {
      asignacionParaMostrar.push({
        nombre: "SIN ASIGNAR",
        enfermero: e
      });
    });
  }
}

if (esDiaParo) {
  const candidatos = [];
  const candidatosSet = new Set();
  const agregarCandidato = (enfermero) => {
    if (!enfermero || estaAusente(enfermero)) return;

    const claveIdentidad = obtenerClaveIdentidadPersona(enfermero);
    if (!claveIdentidad || candidatosSet.has(claveIdentidad)) return;

    candidatosSet.add(claveIdentidad);
    candidatos.push(enfermero);
  };

  asignacionFinal.forEach((item) => agregarCandidato(item.enfermero));
  extrasDia.forEach(agregarCandidato);

  const usadosParo = new Set();
  const tomarCandidato = (enfermero) => {
    if (!enfermero) return null;

    const claveIdentidad = obtenerClaveIdentidadPersona(enfermero);
    if (!claveIdentidad || usadosParo.has(claveIdentidad)) return null;

    usadosParo.add(claveIdentidad);
    return enfermero;
  };
  const resolverCambioParo = (referencia) =>
    resolverPersonaDesdeReferencia(referencia, candidatos);
  const tomarSobrante = (sectorActual) => {
    const sectorNormalizado = normalizar(sectorActual);

    for (const candidato of candidatos) {
      const sectorReservado = reservasParo.get(
        obtenerClaveIdentidadPersona(candidato)
      );
      if (sectorReservado && sectorReservado !== sectorNormalizado) {
        continue;
      }

      const enfermero = tomarCandidato(candidato);
      if (enfermero) return enfermero;
    }

    return null;
  };
  const cambiosParo = cambiosParoDia[keyDia] || {};
  const reservasParo = new Map();

  sectoresParo.forEach((sector) => {
    const override = cambiosParo[normalizar(sector)];
    const enfermero = override && override !== "__EMPTY__"
      ? resolverCambioParo(override)
      : null;
    const claveIdentidad = obtenerClaveIdentidadPersona(enfermero);

    if (claveIdentidad && !reservasParo.has(claveIdentidad)) {
      reservasParo.set(claveIdentidad, normalizar(sector));
    }
  });

  const asignacionParo = sectoresParo.map((sector) => {
    const override = cambiosParo[normalizar(sector)];
    let enfermero = null;

    if (override === "__EMPTY__") {
      return { nombre: sector, enfermero: null, tipo: "sector" };
    }

    if (override) {
      enfermero = tomarCandidato(resolverCambioParo(override));
    } else {
      for (const sectorPrioritario of prioridadesParo[sector] || []) {
        const candidatoPrioritario = asignacionFinal.find(
          (item) => normalizar(item.nombre) === normalizar(sectorPrioritario)
        )?.enfermero;

        const sectorReservado = candidatoPrioritario &&
          reservasParo.get(obtenerClaveIdentidadPersona(candidatoPrioritario));

        if (sectorReservado && sectorReservado !== normalizar(sector)) {
          continue;
        }

        enfermero = tomarCandidato(candidatoPrioritario);
        if (enfermero) break;
      }
    }

    if (!enfermero) enfermero = tomarSobrante(sector);

    return { nombre: sector, enfermero, tipo: "sector" };
  });

  candidatos.forEach((candidato) => {
    const enfermero = tomarCandidato(candidato);
    if (enfermero) {
      asignacionParo.push({
        nombre: "SIN ASIGNAR",
        enfermero,
        tipo: "sector"
      });
    }
  });

  return excluirCertificadosDeAsignaciones({
    asignaciones: asignacionParo,
    estaCertificada: estaCertificadoHoy
  });
}

const personasParaSinAsignar = obtenerPersonasParaSinAsignar({
  registros: asistenciaFecha,
  personal: [...personalFiltrado, ...extrasDia]
});
const identidadesAsignadas = new Set(
  asignacionParaMostrar
    .map((item) => obtenerClaveIdentidadPersona(item.enfermero))
    .filter(Boolean)
);
personasParaSinAsignar.forEach((persona) => {
  const identidad = obtenerClaveIdentidadPersona(persona);
  if (
    !identidad ||
    identidadesAsignadas.has(identidad) ||
    identidadesCubiertas.has(identidad) ||
    estaAusente(persona)
  ) return;
  identidadesAsignadas.add(identidad);
  asignacionParaMostrar.push({
    nombre: "SIN ASIGNAR",
    enfermero: persona,
    tipo: "sector",
    regresoAusencia: true
  });
});
reintegradosSinSectorHoy.forEach((persona) => {
  const identidad = obtenerClaveIdentidadPersona(persona);
  if (!identidad || identidadesAsignadas.has(identidad) || estaAusente(persona)) return;
  identidadesAsignadas.add(identidad);
  asignacionParaMostrar.push({
    nombre: "SIN ASIGNAR",
    enfermero: persona,
    tipo: "sector",
    reintegroLicencia: true
  });
});

const resultadoOrdenado = [];

ordenVisualActivo.forEach((item) => {
  if (item === "DIVIDER") {
    resultadoOrdenado.push({ tipo: "divider" });
  } else {
    const encontrados = asignacionParaMostrar.filter(
      (a) => normalizar(a.nombre) === normalizar(item)
    );

    if (encontrados.length === 0) {
      resultadoOrdenado.push({
        nombre: item,
        enfermero: null,
        tipo: "sector"
      });
    } else {
      resultadoOrdenado.push(...encontrados);
    }
  }
});

const resultadoProtegido = excluirCertificadosDeAsignaciones({
  asignaciones: resultadoOrdenado,
  estaCertificada: estaCertificadoHoy
});

return resultadoProtegido.map((item) =>
  item?.enfermero
    ? {
        ...item,
        enfermero: {
          ...crearPersonaPresentacionTurnante(
            item.enfermero,
            identidadesTurnantes
          ),
          ...(extrasDia.some((extra) =>
            personasCompartenIdentidad(extra, item.enfermero)
          ) ? { esExtra: true } : {})
        }
      }
    : item
);
})();

const personasCubribles = obtenerOpcionesCoberturaExtra({
  asignaciones: excluirCertificadosDeAsignaciones({
    asignaciones: asignacionOrdenada,
    estaCertificada: estaCertificadoHoy
  }),
  extras: extrasDia,
  categoria: tipo,
  esPersonaDisponible: (persona) => !estaAusente(persona)
});

const personasCubriblesParaLibre = formularioExtraLibre
  ? personasCubribles.filter(
      (opcion) => !personasCompartenIdentidad(
        opcion.persona,
        formularioExtraLibre.persona
      )
    )
  : [];

const confirmarExtraLibre = () => {
  const contexto = formularioExtraLibre?.contexto;
  if (
    !contexto ||
    contexto.turno !== turnoActivo ||
    contexto.mes !== mesActivo ||
    contexto.fecha !== keyDia ||
    contexto.categoria !== tipo ||
    contexto.calendario !== calendario ||
    contexto.calendario !== (obtenerCalendarioActual ? obtenerCalendarioActual() : calendario) ||
    soloLecturaEfectiva
  ) {
    setFormularioExtraLibre((actual) => actual && ({
      ...actual,
      error: "El calendario cambió mientras agregabas el Extra. Revisá nuevamente."
    }));
    return;
  }
  const motivoLibre = formularioExtraLibre.motivoLibre;
  let resultado = crearExtraDesdeLibre({
    persona: formularioExtraLibre.persona,
    categoria: tipo,
    motivoLibre,
    extrasDia
  });
  if (!resultado.extra) {
    setFormularioExtraLibre((actual) => ({ ...actual, error: resultado.error }));
    return;
  }
  const opcionCubierta = personasCubriblesParaLibre.find(
    (opcion) => String(opcion.persona.id) === String(formularioExtraLibre.personaCubiertaId)
  );
  resultado = configurarTipoExtra({
    extra: resultado.extra,
    tipoExtra: motivoLibre === "cobertura_companero" ? "cobertura" : "refuerzo",
    personaCubierta: opcionCubierta?.persona,
    sectorCubierto: opcionCubierta?.sector,
    extrasDia,
    personal
  });
  if (!resultado.extra) {
    setFormularioExtraLibre((actual) => ({ ...actual, error: resultado.error }));
    return;
  }
  setCalendario((prev) => {
    if (prev !== contexto.calendario) return prev;
    return {
      ...prev,
      extras: {
        ...(prev.extras || {}),
        [keyDia]: agregarExtraALista(prev.extras?.[keyDia], resultado.extra)
      }
    };
  });
  setFormularioExtraLibre(null);
};

const obtenerSectorOrigenPersona = (persona) => {
  if (!persona) return "";
  const buscarReferencia = (distribucion, sector) => {
    const clave = Object.keys(distribucion || {}).find(
      (actual) => normalizar(actual) === normalizar(sector)
    );
    return clave ? distribucion[clave] : undefined;
  };
  const filasConTurnantes = filas.filter((fila) => fila !== "DIVIDER");

  for (const sector of filasConTurnantes) {
    const cambio = buscarReferencia(cambiosFechaActual, sector);
    const referencia = cambio === "__EMPTY__"
      ? null
      : cambio || buscarReferencia(planillaPeriodo, sector);
    const resuelta = resolverPersonaDesdeReferencia(
      referencia,
      [...personalFiltrado, ...extrasDia]
    );
    if (personasCompartenIdentidad(resuelta, persona)) return sector;
  }
  return "";
};

const noDisponiblesPresentacion = obtenerNoDisponiblesDelDia({
  registros: noDisponibles[keyDia],
  certificaciones,
  novedades,
  personal,
  fecha: keyDia,
  turno: turnoActivo,
  categoria: tipo,
  obtenerSectorOrigen: obtenerSectorOrigenPersona
}).sort((a, b) => {
  const ordenA = ordenVisual.findIndex(
    (sector) => normalizar(sector) === normalizar(a.sectorOrigen)
  );
  const ordenB = ordenVisual.findIndex(
    (sector) => normalizar(sector) === normalizar(b.sectorOrigen)
  );
  return (ordenA < 0 ? Number.MAX_SAFE_INTEGER : ordenA) -
    (ordenB < 0 ? Number.MAX_SAFE_INTEGER : ordenB);
});
const coberturasExtrasPresentacion = obtenerCoberturasExtrasPresentacion(
  extrasDia,
  personal
);
const opcionesCambioPendiente = noDisponiblesPresentacion.flatMap((item) =>
  item.tipo === "manual" &&
  item.motivo === MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO &&
  !item.registro?.personaCoberturaId &&
  item.persona
    ? [{
        persona: item.persona,
        sector: item.sectorOrigen,
        etiqueta: `${item.nombre} — ${item.sectorOrigen}`
      }]
    : []
);
const identidadesCubribles = new Set(
  personasCubribles.map((opcion) => obtenerClaveIdentidadPersona(opcion.persona))
);
const personasCubriblesExtra = [
  ...personasCubribles,
  ...opcionesCambioPendiente.filter((opcion) => {
    const identidad = obtenerClaveIdentidadPersona(opcion.persona);
    return identidad && !identidadesCubribles.has(identidad);
  })
];

const abrirFormularioNoDisponible = async (persona, registro = null) => {
  if (soloLecturaEfectiva || estaCertificadoHoy(persona)) return;
  const cargaId = cargaExtrasRef.current + 1;
  cargaExtrasRef.current = cargaId;
  const coberturaRegistrada = extrasDia.find(
    (extra) => String(extra.id) === String(registro?.personaCoberturaId || "")
  );
  const sectorOperativo = obtenerSectorOperativoPersona({
    asignaciones: asignacionOrdenada,
    persona: coberturaRegistrada || persona
  });
  const sectorHistoricoValido = /^T\d+$/i.test(String(registro?.sectorOrigen || ""))
    ? ""
    : registro?.sectorOrigen || "";
  const contexto = {
    turno: turnoActivo,
    mes: mesActivo,
    fecha: keyDia,
    categoria: tipo,
    calendario,
    certificaciones,
    soloLectura: soloLecturaEfectiva
  };
  setCandidatosExtra([]);
  setFormularioNoDisponible({
    persona,
    registro,
    editando: Boolean(registro),
    fecha: keyDia,
    sectorOrigen: sectorOperativo || sectorHistoricoValido,
    motivo: registro?.motivo || "",
    detalle: registro?.detalle || "",
    personaCoberturaId: coberturaRegistrada?.id || "",
    turnoDestino: registro?.turnoDestino || "",
    coberturaExternaNombre: "",
    coberturaExternaFuncionario: "",
    coberturaExternaTurno: "",
    coberturaExternaPersonaId: "",
    modalidadCobertura: "personal_otro_turno",
    cargandoCandidatos: true,
    confirmarEliminacion: false,
    error: "",
    contexto
  });
  try {
    const candidatos = cargarPersonalOtrosTurnos
      ? await cargarPersonalOtrosTurnos({ categoria: tipo })
      : [];
    if (cargaExtrasRef.current !== cargaId) return;
    setCandidatosExtra(prepararCandidatosExtraOtroTurno({
      candidatos,
      categoria: tipo,
      turnoActivo,
      personaExcluida: persona,
      extrasDia
    }));
    setFormularioNoDisponible((actual) => actual?.contexto === contexto
      ? { ...actual, cargandoCandidatos: false }
      : actual);
  } catch {
    if (cargaExtrasRef.current !== cargaId) return;
    setFormularioNoDisponible((actual) => actual?.contexto === contexto
      ? { ...actual, cargandoCandidatos: false, error: "No se pudo cargar el Personal de otros turnos." }
      : actual);
  }
};

const contextoNoDisponibleValido = () =>
  formularioNoDisponible &&
  formularioNoDisponible.contexto.turno === turnoActivo &&
  formularioNoDisponible.contexto.mes === mesActivo &&
  formularioNoDisponible.contexto.fecha === keyDia &&
  formularioNoDisponible.contexto.categoria === tipo &&
  formularioNoDisponible.contexto.calendario === calendario &&
  formularioNoDisponible.contexto.calendario ===
    (obtenerCalendarioActual ? obtenerCalendarioActual() : calendario) &&
  formularioNoDisponible.contexto.certificaciones ===
    (obtenerCertificacionesActuales
      ? obtenerCertificacionesActuales()
      : certificaciones) &&
  formularioNoDisponible.contexto.soloLectura === soloLecturaEfectiva &&
  !soloLecturaEfectiva;
const formularioNoDisponibleVisible = Boolean(
  formularioNoDisponible &&
  formularioNoDisponible.contexto.turno === turnoActivo &&
  formularioNoDisponible.contexto.mes === mesActivo &&
  formularioNoDisponible.contexto.fecha === keyDia &&
  formularioNoDisponible.contexto.categoria === tipo
);

const confirmarNoDisponible = () => {
  if (!contextoNoDisponibleValido()) {
    setFormularioNoDisponible((actual) => ({
      ...actual,
      error: "El calendario cambió mientras confirmabas. Revisá nuevamente."
    }));
    return;
  }
  if (formularioNoDisponible.motivo === MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA) {
    const personaActual = personalFiltrado.find((persona) =>
      personasCompartenIdentidad(persona, formularioNoDisponible.persona)
    );
    const resultadoCertificacion = agregarCertificacionPorElDia({
      certificaciones,
      persona: personaActual,
      fecha: keyDia,
      categoria: tipo,
      personal
    });
    if (!resultadoCertificacion.certificacion) {
      setFormularioNoDisponible((actual) => ({
        ...actual,
        error: resultadoCertificacion.error
      }));
      return;
    }
    setCertificaciones((actuales) =>
      agregarCertificacionPorElDia({
        certificaciones: actuales,
        persona: personaActual,
        fecha: keyDia,
        categoria: tipo,
        personal
      }).certificaciones
    );
    setFormularioNoDisponible(null);
    return;
  }
  let personaCobertura = extrasDia.find(
    (extra) => String(extra.id) === String(formularioNoDisponible.personaCoberturaId)
  );
  if (
    formularioNoDisponible.motivo === MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO &&
    formularioNoDisponible.personaCoberturaId === "__AGREGAR_OTRO_TURNO__"
  ) {
    const candidato = candidatosExtra.find((actual) =>
      `${actual.turnoOrigen}|${actual.persona.id}` ===
        formularioNoDisponible.coberturaExternaPersonaId
    );
    const creado = formularioNoDisponible.modalidadCobertura === "personal_otro_turno"
      ? crearExtraDesdePersonal({
          persona: candidato?.persona,
          turnoOrigen: candidato?.turnoOrigen,
          categoria: tipo,
          extrasDia
        })
      : crearExtraTemporal({
          nombre: formularioNoDisponible.coberturaExternaNombre,
          funcionario: formularioNoDisponible.coberturaExternaFuncionario,
          categoria: tipo,
          personal,
          extrasDia
        });
    if (!creado.extra) {
      setFormularioNoDisponible((actual) => ({ ...actual, error: creado.error }));
      return;
    }
    personaCobertura = {
      ...creado.extra,
      origenExtra: "personal_otro_turno",
      turnoOrigen: creado.extra.turnoOrigen || formularioNoDisponible.coberturaExternaTurno || ""
    };
  }

  if (
    formularioNoDisponible.motivo === MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO &&
    personaCobertura
  ) {
    const vinculado = vincularCambioOtroTurno({
      calendarioCategoria: calendario,
      fecha: keyDia,
      titular: formularioNoDisponible.persona,
      sector: formularioNoDisponible.sectorOrigen,
      extra: personaCobertura,
      detalle: formularioNoDisponible.detalle,
      personal: personalFiltrado
    });
    if (vinculado.error) {
      setFormularioNoDisponible((actual) => ({ ...actual, error: vinculado.error }));
      return;
    }
    setCalendario((prev) => vincularCambioOtroTurno({
      calendarioCategoria: prev,
      fecha: keyDia,
      titular: formularioNoDisponible.persona,
      sector: formularioNoDisponible.sectorOrigen,
      extra: personaCobertura,
      detalle: formularioNoDisponible.detalle,
      personal: personalFiltrado
    }).calendario);
    setFormularioNoDisponible(null);
    return;
  }
  const resultado = crearRegistroNoDisponible({
    persona: formularioNoDisponible.persona,
    motivo: formularioNoDisponible.motivo,
    detalle: formularioNoDisponible.detalle,
    personaCobertura,
    turnoDestino: formularioNoDisponible.turnoDestino,
    sectorOrigen: formularioNoDisponible.sectorOrigen,
    creadoEn: formularioNoDisponible.registro?.creadoEn
  });
  if (!resultado.registro) {
    setFormularioNoDisponible((actual) => ({ ...actual, error: resultado.error }));
    return;
  }

  setCalendario((prev) => {
    if (prev !== formularioNoDisponible.contexto.calendario) return prev;
    const lista = prev.noDisponibles?.[keyDia] || [];
    return {
      ...prev,
      noDisponibles: {
        ...(prev.noDisponibles || {}),
        [keyDia]: reemplazarRegistroNoDisponible({
          lista,
          persona: formularioNoDisponible.persona,
          registro: resultado.registro,
          personal: personalFiltrado
        })
      }
    };
  });
  setFormularioNoDisponible(null);
};

const quitarNoDisponible = (accionExtra = "") => {
  if (!contextoNoDisponibleValido()) {
    setFormularioNoDisponible((actual) => ({
      ...actual,
      error: "El calendario cambió mientras confirmabas. Revisá nuevamente."
    }));
    return;
  }
  const tieneExtraVinculado = Boolean(formularioNoDisponible.registro?.personaCoberturaId);
  if (tieneExtraVinculado && !accionExtra) {
    setFormularioNoDisponible((actual) => ({
      ...actual,
      confirmarEliminacion: true,
      error: ""
    }));
    return;
  }
  setCalendario((prev) => {
    if (prev !== formularioNoDisponible.contexto.calendario) return prev;
    if (tieneExtraVinculado) {
      return eliminarNoDisponibleVinculado({
        calendarioCategoria: prev,
        fecha: keyDia,
        titular: formularioNoDisponible.persona,
        accionExtra,
        personal: personalFiltrado
      });
    }
    const lista = prev.noDisponibles?.[keyDia] || [];
    return {
      ...prev,
      noDisponibles: {
        ...(prev.noDisponibles || {}),
        [keyDia]: quitarPersonaDeListaReferencias(
          lista,
          formularioNoDisponible.persona,
          personalFiltrado
        )
      }
    };
  });
  setFormularioNoDisponible(null);
};

const quitarCertificacionRapida = (certificacion) => {
  if (soloLecturaEfectiva || !certificacion?.id) return;
  setCertificaciones((actuales) => eliminarCertificacionPorElDia({
    certificaciones: actuales,
    certificacionId: certificacion.id
  }));
};

useEffect(() => {
  const asignacionesParaPDF = asignacionOrdenada.map((item) => {
    if (item.tipo === "divider" || item.enfermero) return item;
    const liberadoPorAusencia = ausentesDelDia.some(
      (ausente) => normalizar(ausente.sectorOrigen) === normalizar(item.nombre)
    );
    if (liberadoPorAusencia) {
      return { ...item, etiquetaVacio: "Sin asignar - ausencia" };
    }
    const noDisponible = noDisponiblesPresentacion.find(
      (registro) => normalizar(registro.sectorOrigen) === normalizar(item.nombre)
    );
    return noDisponible
      ? { ...item, etiquetaVacio: `Sin cobertura — ${noDisponible.motivoBreve}` }
      : item;
  });
  const libresParaPDF = filtrarPersonasNoCertificadas({
    personas: libres,
    estaCertificada: estaCertificadoHoy
  }).filter(
    (persona) =>
      !estaDeLicenciaHoy(persona) &&
      !(noDisponibles[keyDia] || []).some((referencia) =>
        referenciaCorrespondeAPersona(
          referencia,
          persona,
          personalFiltrado
        )
      )
  );
  const datosParaPDF = {
    asignaciones: asignacionesParaPDF,
    libres: libresParaPDF,
    keyDia
  };
  const dataString = JSON.stringify(datosParaPDF);

  if (prevDataRef.current !== dataString) {
    prevDataRef.current = dataString;

    if (onDataReady) {
      onDataReady(datosParaPDF);
    }
  }
}, [
  asignacionOrdenada,
  ausentesDelDia,
  estaCertificadoHoy,
  estaDeLicenciaHoy,
  keyDia,
  libres,
  noDisponibles,
  noDisponiblesPresentacion,
  onDataReady,
  personalFiltrado
]);

  const personasPrevistas = obtenerPersonasPrevistas(asignacionOrdenada);
  const datosResumenTurno = (() => {
    const hayFilasDivididas = tipo === "licenciado" &&
      asignacionOrdenada.filter(esDestinoSinteticoReanimacionSillones).length === 2;
    const expandirReanimacion = (sectores) => sectores.flatMap((sector) =>
      hayFilasDivididas && normalizar(sector) === "REANIMACION + SILLONES"
        ? ["Reanimación", "Sillones"]
        : [sector]
    );
    const sectoresEfectivosPresentacion = filasConfiguracion
      .filter((fila) => fila.tipo === "sector")
      .flatMap((fila) =>
        hayFilasDivididas && fila.sectorId === SECTOR_ID_REANIMACION_SILLONES
          ? ["Reanimación", "Sillones"]
          : [fila.etiqueta]
      );
    const sectoresReales = distribucionPorBoxesActiva || distribucionOpcion1Activa
      ? obtenerFilasRedistribucion(ordenVisualEfectivo).filter(
          (fila) => fila !== "DIVIDER" && normalizar(fila) !== "SIN ASIGNAR"
        )
      : esDiaParo
        ? expandirReanimacion(sectoresParo)
        : sectoresEfectivosPresentacion;
    const criticosPanel = expandirReanimacion(sectoresCriticos);
    const personasConLicencia = personalFiltrado.filter(estaDeLicenciaHoy);
    const personasNoDisponibles = personalFiltrado.filter(estaNoDisponible);
    const sectoresSaludMental = tipo === "enfermero"
      ? ["SM"]
      : esDiaParo
        ? ["SM + Preinternación"]
        : ["Salud Mental"];

    const destinosOperativos = esDiaParo
      ? undefined
      : asignacionOrdenada.filter((fila) => fila?.tipo !== "divider");

    return {
      libres,
      licencias: personasConLicencia,
      certificaciones: certificados,
      noDisponibles: personasNoDisponibles,
      extras: extrasDia,
      destinosOperativos,
      sectoresCriticosIds,
      sectoresReales,
      sectoresCriticos: criticosPanel,
      sectoresSaludMental
    };
  })();
  const resumenTurno = crearResumenTurno({
    asignaciones: asignacionOrdenada,
    asistencia: asistenciaFecha,
    ...datosResumenTurno
  });
  const asignacionesMostradas = bloqueadoPorCierre && snapshotCierre
    ? snapshotAAsignacionesVisibles(snapshotCierre)
    : asignacionOrdenada;
  const sectoresCriticosSinCobertura = obtenerSectoresCriticosSinCobertura({
    asignaciones: asignacionesMostradas,
    sectoresCriticosIds: esDiaParo ? [] : sectoresCriticosIds,
    sectoresCriticosLegacy: esDiaParo ? sectoresCriticos : []
  });
  const alertaSectoresCriticos = formatearAlertaSectoresCriticos(
    sectoresCriticosSinCobertura
  );
  const resumenMostrado = bloqueadoPorCierre && snapshotCierre
    ? snapshotCierre.resumen
    : resumenTurno;
  const asistenciaMostrada = bloqueadoPorCierre && snapshotCierre
    ? snapshotCierre.asistencia
    : asistenciaFecha;

  const cerrarTurno = () => {
    if (soloLecturaEfectiva || !usuarioActual) return;
    const responsable = licenciadosResponsables.find(
      (persona) => String(persona.id) === responsableSeleccionadoId
    );
    const responsableCierre = crearReferenciaPersona(responsable);
    if (!responsableCierre) {
      setErrorResponsable({
        contexto: contextoResponsable,
        mensaje: "Seleccioná el licenciado responsable antes de cerrar."
      });
      return;
    }
    const criticas = resumenTurno.alertas.filter((alerta) => alerta.nivel === "critica").length;
    const mensaje = [
      `Previstos: ${resumenTurno.conteos.previstos}`,
      `Presentes: ${resumenTurno.conteos.presentes}`,
      `Ausentes: ${resumenTurno.conteos.ausentes}`,
      `Pendientes: ${resumenTurno.conteos.pendientes}`,
      `Sectores sin cobertura: ${resumenTurno.conteos.sectoresSinCobertura}`,
      `Alertas críticas: ${criticas}`,
      "",
      resumenTurno.conteos.pendientes > 0 || criticas > 0
        ? "Hay situaciones pendientes. ¿Cerrar igualmente?"
        : "¿Confirmar el cierre?"
    ].join("\n");
    if (!confirm(mensaje)) return;

    const snapshot = crearSnapshotCierreTurno({
      fecha: keyDia,
      tipo,
      resumen: resumenTurno,
      asignaciones: asignacionOrdenada,
      asistencia: asistenciaFecha,
      libres: datosResumenTurno.libres,
      licencias: datosResumenTurno.licencias,
      certificaciones: datosResumenTurno.certificaciones,
      noDisponibles: datosResumenTurno.noDisponibles,
      extrasRegistrados: datosResumenTurno.extras,
      destinosOperativos: datosResumenTurno.destinosOperativos,
      sectoresReales: datosResumenTurno.sectoresReales
    });
    setCalendario((prev) => ({
      ...prev,
      cierresDia: cerrarFechaCategoria({
        cierresDia: prev.cierresDia,
        fecha: keyDia,
        usuario: usuarioActual,
        responsableCierre,
        snapshot
      })
    }));
    setSeleccionResponsable({ contexto: "", personaId: "" });
    setErrorResponsable({ contexto: "", mensaje: "" });
    setCierreVisible(true);
  };

  const reabrirTurno = () => {
    if (!puedeReabrirCierre || !bloqueadoPorCierre) return;
    if (!confirm("¿Reabrir esta fecha y categoría? La fotografía anterior se conservará.")) return;
    setCalendario((prev) => ({
      ...prev,
      cierresDia: reabrirFechaCategoria({
        cierresDia: prev.cierresDia,
        fecha: keyDia,
        usuario: usuarioActual
      })
    }));
    setSeleccionResponsable({ contexto: "", personaId: "" });
    setErrorResponsable({ contexto: "", mensaje: "" });
    setCierreVisible(false);
  };

  const cambiarAsistencia = (persona, estado) => {
    if (soloLecturaEfectiva) return;
    const asignacionActual = asignacionOrdenada.find(
      (item) => personasCompartenIdentidad(item.enfermero, persona)
    );
    const estabaAusente =
      obtenerEstadoAsistencia(asistenciaFecha, persona) ===
      ESTADOS_ASISTENCIA.AUSENTE;
    if (
      (estado === ESTADOS_ASISTENCIA.AUSENTE && !asignacionActual) ||
      (
        estado !== ESTADOS_ASISTENCIA.AUSENTE &&
        !asignacionActual &&
        !estabaAusente
      )
    ) {
      setErrorAsistencia("El calendario cambió. Revisá nuevamente la asistencia.");
      return;
    }
    const sectorActual = asignacionActual?.nombre || "";
    const resultado = prepararCambioAsistencia({
      calendarioActual: obtenerCalendarioActual
        ? obtenerCalendarioActual()
        : calendario,
      calendarioEsperado: calendario,
      fecha: keyDia,
      persona,
      sectorActual,
      estado,
      sectoresVisibles: asignacionOrdenada
        .filter((item) => item.tipo !== "divider")
        .map((item) => item.nombre)
    });
    if (resultado.tipo !== "aplicado") {
      setErrorAsistencia(resultado.mensaje);
      return;
    }

    setErrorAsistencia("");
    setCalendario((prev) =>
      prev === calendario ? resultado.calendario : prev
    );
  };

  const marcarTodosPresentes = () => {
    if (soloLecturaEfectiva || personasPrevistas.length === 0) return;
    setCalendario((prev) => {
      if (prev !== calendario) return prev;
      return personasPrevistas.reduce(
        (actual, persona) => cambiarAsistenciaCalendario({
          calendario: actual,
          fecha: keyDia,
          persona,
          sectorActual: asignacionOrdenada.find(
            (item) => personasCompartenIdentidad(item.enfermero, persona)
          )?.nombre || "",
          estado: ESTADOS_ASISTENCIA.PRESENTE,
          sectoresVisibles: asignacionOrdenada
            .filter((item) => item.tipo !== "divider")
            .map((item) => item.nombre)
        }),
        prev
      );
    });
  };

  const limpiarAsistencia = () => {
    if (soloLecturaEfectiva || !Object.hasOwn(asistenciaDia, keyDia)) return;
    if (!confirm("¿Limpiar la asistencia de esta fecha y categoría?")) return;
    setCalendario((prev) => {
      if (prev !== calendario) return prev;
      const conAusenciasResueltas = ausentesDelDia.reduce(
        (actual, ausente) => ausente.persona
          ? cambiarAsistenciaCalendario({
              calendario: actual,
              fecha: keyDia,
              persona: ausente.persona,
              estado: ESTADOS_ASISTENCIA.PENDIENTE,
              sectoresVisibles: asignacionOrdenada
                .filter((item) => item.tipo !== "divider")
                .map((item) => item.nombre)
            })
          : actual,
        prev
      );
      const asistenciaActual = { ...(conAusenciasResueltas.asistenciaDia || {}) };
      const registrosPendientes = Object.fromEntries(
        Object.entries(asistenciaActual[keyDia] || {}).filter(
          ([, registro]) =>
            registro &&
            typeof registro === "object" &&
            registro.sinAsignar === true
        )
      );
      if (Object.keys(registrosPendientes).length > 0) {
        asistenciaActual[keyDia] = registrosPendientes;
      } else {
        delete asistenciaActual[keyDia];
      }
      return {
        ...conAusenciasResueltas,
        asistenciaDia: asistenciaActual
      };
    });
  };

  const handleClick = (item) => {
    if (soloLecturaEfectiva) return;
    const guardarMovimientos = (movimientos) => {
      const movimientosReales = movimientos.filter(
        (movimiento) => normalizar(movimiento.sector) !== "SIN ASIGNAR"
      );
      const personasAsignadas = movimientosReales
        .map((movimiento) => movimiento.persona)
        .filter(Boolean);

      setCalendario((prev) => {
        if (prev !== calendario) return prev;
        const cambiosPrevios = prev[claveCambiosActivos] || {};
        const nuevo = aplicarMovimientosCalendario({
          cambios: cambiosPrevios[keyDia],
          movimientos: movimientosReales
        });
        return {
          ...prev,
          [claveCambiosActivos]: {
            ...cambiosPrevios,
            [keyDia]: nuevo
          },
          ...(claveCambiosActivos === "cambiosDia" ? {
            procedenciaCambiosDia: {
              ...(prev.procedenciaCambiosDia || {}),
              [keyDia]: Object.fromEntries(
                Object.entries(prev.procedenciaCambiosDia?.[keyDia] || {}).filter(
                  ([clave]) => !movimientosReales.some(
                    (movimiento) => normalizar(movimiento.sector) === normalizar(clave)
                  )
                )
              )
            }
          } : {}),
          asistenciaDia: quitarPersonasDeSinAsignar({
            asistenciaDia: prev.asistenciaDia,
            fecha: keyDia,
            personas: personasAsignadas
          })
        };
      });
    };

    const esFilaDividida = (fila) =>
      tipo === "licenciado" &&
      !esDiaParo &&
      esDestinoSinteticoReanimacionSillones(fila) &&
      asignacionOrdenada.some(
        (asignacion) => asignacion.syntheticId === fila.syntheticId
      );

    if (esFilaDividida(item) || esFilaDividida(seleccionado)) {
      if (!item.enfermero) {
        if (seleccionado && esFilaDividida(item)) {
          guardarMovimientos([
            { sector: item.nombre, persona: seleccionado.enfermero },
            { sector: seleccionado.nombre, vacio: true }
          ]);
          setSeleccionado(null);
        }
        return;
      }

      if (!seleccionado) {
        setSeleccionado(item);
        return;
      }

      const movimientos = [];

      if (esFilaDividida(item)) {
        movimientos.push({ sector: item.nombre, persona: seleccionado.enfermero });
      }

      if (esFilaDividida(seleccionado)) {
        movimientos.push({ sector: seleccionado.nombre, persona: item.enfermero });
      }

      guardarMovimientos(movimientos);
      setSeleccionado(null);
      return;
    }

    if (!item.enfermero) {
      if (seleccionado) {
        guardarMovimientos([
          { sector: item.nombre, persona: seleccionado.enfermero },
          { sector: seleccionado.nombre, vacio: true }
        ]);

        setSeleccionado(null);
      }
      return;
    }

    if (estaAusente(item.enfermero)) return;

    if (!seleccionado) {
      setSeleccionado(item);
      return;
    }

    guardarMovimientos(crearMovimientosEntreFilasCalendario({
      seleccionado,
      destino: item
    }));

    setSeleccionado(null);
  };

  const abrirRedistribucion = (tipoRedistribucion) => {
    if (
      tipo !== "enfermero" ||
      soloLecturaEfectiva ||
      esDiaParo
    ) return;

    setSeleccionado(null);
    setConfirmacionRedistribucion({
      tipo: tipoRedistribucion,
      error: "",
      contexto: {
        turno: turnoActivo,
        mes: mesActivo,
        fecha: keyDia,
        categoria: tipo,
        tipo: tipoRedistribucion,
        tipoRedistribucionActiva,
        calendario,
        soloLectura: soloLecturaEfectiva
      }
    });
  };

  const confirmarRedistribucion = () => {
    if (!confirmacionRedistribucion) return;

    const contextoActual = {
      turno: turnoActivo,
      mes: mesActivo,
      fecha: keyDia,
      categoria: tipo,
      tipo: confirmacionRedistribucion.tipo,
      calendario,
      soloLectura: soloLecturaEfectiva
    };

    if (
      !validarContextoRedistribucion(
        confirmacionRedistribucion.contexto,
        contextoActual
      )
    ) {
      setConfirmacionRedistribucion((actual) => ({
        ...actual,
        error: actual.tipo === "comun"
          ? "El calendario cambió mientras confirmabas. Revisá nuevamente."
          : "El calendario cambió mientras confirmabas la redistribución. Revisá nuevamente."
      }));
      return;
    }

    if (
      confirmacionRedistribucion.tipo === "comun" &&
      tipoRedistribucionActiva !==
        confirmacionRedistribucion.contexto.tipoRedistribucionActiva
    ) {
      setConfirmacionRedistribucion((actual) => ({
        ...actual,
        error: "El calendario cambió mientras confirmabas. Revisá nuevamente."
      }));
      return;
    }

    const asignacionesSinAusentes = filtrarAsignacionesAusentes({
      asignaciones: asignacionOrdenada,
      registros: asistenciaFecha
    });
    const redistribucion = confirmacionRedistribucion.tipo === "comun"
      ? null
      : confirmacionRedistribucion.tipo === "boxes"
        ? redistribuirPorBoxes({
            asignaciones: asignacionesSinAusentes,
            ordenVisual: ordenVisualEfectivo,
            filasConfiguracion,
            prioridadSectores
          })
        : redistribuirCritica({
            asignaciones: asignacionesSinAusentes,
            ordenVisual: ordenVisualEfectivo,
            filasConfiguracion,
            prioridadSectores
          });

    setCalendario((prev) => {
      if (prev !== confirmacionRedistribucion.contexto.calendario) return prev;

      if (confirmacionRedistribucion.tipo === "comun") {
        return quitarRedistribucionFecha(prev, keyDia);
      }

      return {
        ...prev,
        cambiosDia: {
          ...(prev.cambiosDia || {}),
          [keyDia]: redistribucion.cambios
        },
        procedenciaCambiosDia: {
          ...(prev.procedenciaCambiosDia || {}),
          [keyDia]: Object.fromEntries(
            Object.keys(redistribucion.cambios).map((clave) => [
              clave,
              PROCEDENCIA_REDISTRIBUCION_AUTOMATICA
            ])
          )
        }
      };
    });
    setSeleccionado(null);
    setConfirmacionRedistribucion(null);
  };

  return (
    <div className="min-h-fit">
      <h2 className="text-xl font-semibold text-slate-800">
  Distribución diaria
</h2>

      <div className="flex flex-wrap items-center gap-2">
      <input
  type="date"
  value={`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`}
  min={fechaMinima}
  max={fechaMaxima}
  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
  onChange={(e) => {
    const fechaSeleccionada = e.target.value;

    if (!fechaSeleccionada || fechaSeleccionada < fechaMinima || fechaSeleccionada > fechaMaxima) {
      return;
    }

    const [y, m, d] = fechaSeleccionada.split("-");
    setFecha(new Date(y, m - 1, d, 12));
  }}
/>
      {tipo === "enfermero" && !esDiaParo && !tipoRedistribucionActiva && (
        <>
          <button
            type="button"
            disabled={soloLecturaEfectiva}
            onClick={() => abrirRedistribucion("critica")}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Redistribución opción 1
          </button>
          <button
            type="button"
            disabled={soloLecturaEfectiva}
            onClick={() => abrirRedistribucion("boxes")}
            className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Redistribución opción 2
          </button>
        </>
      )}
      {tipo === "enfermero" &&
        !esDiaParo &&
        tipoRedistribucionActiva && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
              Redistribución opción {tipoRedistribucionActiva === "critica" ? "1" : "2"} aplicada
            </span>
            {!soloLecturaEfectiva && (
              <button
                type="button"
                onClick={() => abrirRedistribucion("comun")}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-50"
              >
                Volver a distribución común
              </button>
            )}
          </div>
        )}
      </div>

      {esDiaParo && (
        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Esta fecha conserva una redistribución histórica por paro.
        </p>
      )}

      {confirmacionRedistribucionVisible && (
        <PanelConfirmacionRedistribucion
          tipo={confirmacionRedistribucion.tipo}
          error={confirmacionRedistribucion.error}
          onCancelar={() => setConfirmacionRedistribucion(null)}
          onConfirmar={confirmarRedistribucion}
        />
      )}

      <h3>Día {fecha.getDate()}</h3>

      {errorAsistencia && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorAsistencia}
        </p>
      )}

      {formularioNoDisponibleVisible && (
        <PanelNoDisponible
          formulario={formularioNoDisponible}
          extras={obtenerExtrasCompatiblesCambioOtroTurno({
            extras: extrasDia,
            titular: formularioNoDisponible.persona,
            personal: personalFiltrado
          })}
          candidatos={candidatosExtra}
          onCambiar={(campo, valor) => setFormularioNoDisponible((actual) => ({
            ...actual,
            [campo]: valor,
            error: ""
          }))}
          onCancelar={() => setFormularioNoDisponible(null)}
          onConfirmar={confirmarNoDisponible}
          onQuitar={quitarNoDisponible}
        />
      )}

      {formularioExtra && (
        <PanelAgregarExtra
          formulario={formularioExtra}
          candidatos={candidatosExtra}
          personasCubribles={personasCubriblesExtra}
          onCambiar={(campo, valor) => setFormularioExtra((actual) => ({
            ...actual,
            [campo]: valor,
            error: ""
          }))}
          onCancelar={() => {
            cargaExtrasRef.current += 1;
            setFormularioExtra(null);
          }}
          onConfirmar={confirmarExtra}
        />
      )}

      {formularioExtraLibre && (
        <PanelExtraLibre
          formulario={formularioExtraLibre}
          personasCubribles={personasCubriblesParaLibre}
          onCambiar={(campo, valor) => setFormularioExtraLibre((actual) => ({
            ...actual,
            [campo]: valor,
            ...(campo === "motivoLibre" ? { personaCubiertaId: "" } : {}),
            error: ""
          }))}
          onCancelar={() => setFormularioExtraLibre(null)}
          onConfirmar={confirmarExtraLibre}
        />
      )}

      {alertaSectoresCriticos && (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
        >
          {alertaSectoresCriticos}
        </p>
      )}

<div className="rounded-2xl border border-slate-100 bg-white">
  {asignacionesMostradas.map((item, i) => {

    if (item.tipo === "divider") {
      return (
        <div key={i} className="h-3 bg-slate-100" />
      );
    }

    const sectorLiberadoPorAusencia = !item.enfermero && ausentesDelDia.some(
      (ausente) => normalizar(ausente.sectorOrigen) === normalizar(item.nombre)
    );
    const noDisponibleDelSector = !item.enfermero
      ? noDisponiblesPresentacion.find(
          (registro) => normalizar(registro.sectorOrigen) === normalizar(item.nombre)
        )
      : null;
    const bg = bloqueadoPorCierre
      ? item.sacrificado
        ? "bg-slate-200"
        : "bg-white"
      : seleccionado?.nombre === item.nombre
        ? "bg-yellow-200"
        : item.sacrificado
        ? "bg-slate-200"
        : estaNoDisponible(item.enfermero)
        ? "bg-orange-200"
        : estaLibre(item.enfermero)
        ? "bg-red-200"
        : "bg-white";

    return (
      <div
        key={i}
        onClick={() => handleClick(item)}
        className={`flex justify-between items-center px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${bg}`}
      >
        <span className="font-medium text-slate-700">
          {item.nombre}
        </span>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm text-slate-600">
            {item.enfermero
              ? obtenerNombreConMarcaTurnante(item.enfermero)
              : sectorLiberadoPorAusencia
                ? "Sin asignar — ausencia"
                : noDisponibleDelSector
                  ? `Sin cobertura — ${noDisponibleDelSector.motivoBreve}${
                      noDisponibleDelSector.turnoDestino
                        ? `: turno ${obtenerEtiquetaTurnoDestino(
                            noDisponibleDelSector.turnoDestino
                          ).toLowerCase()}`
                        : ""
                    }`
                  : "Sin cobertura"}
          </span>
          {item.enfermero && (
            <select
              aria-label={`Asistencia de ${obtenerNombreConMarcaTurnante(item.enfermero)}`}
              value={obtenerEstadoAsistencia(asistenciaMostrada, item.enfermero)}
              disabled={soloLecturaEfectiva}
              onClick={(evento) => evento.stopPropagation()}
              onChange={(evento) => {
                evento.stopPropagation();
                cambiarAsistencia(item.enfermero, evento.target.value);
              }}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                obtenerEstadoAsistencia(asistenciaMostrada, item.enfermero) === ESTADOS_ASISTENCIA.PRESENTE
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : obtenerEstadoAsistencia(asistenciaMostrada, item.enfermero) === ESTADOS_ASISTENCIA.AUSENTE
                    ? "border-red-300 bg-red-50 text-red-800"
                    : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              <option value={ESTADOS_ASISTENCIA.PENDIENTE}>Pendiente</option>
              <option value={ESTADOS_ASISTENCIA.PRESENTE}>✓ Presente</option>
              <option value={ESTADOS_ASISTENCIA.AUSENTE}>✕ Ausente</option>
            </select>
          )}
        </div>
      </div>
    );
  })}
</div>

{(noDisponiblesPresentacion.length > 0 || coberturasExtrasPresentacion.length > 0) && (
  <section className="mt-5" aria-labelledby={`no-disponibles-${tipo}-${keyDia}`}>
    <h4
      id={`no-disponibles-${tipo}-${keyDia}`}
      className="text-sm font-semibold text-slate-800"
    >
      No disponibles del día
    </h4>
    <div className="mt-2 grid gap-3 sm:grid-cols-2">
      {noDisponiblesPresentacion.map((registro, indice) => (
        <article
          key={`${obtenerClaveIdentidadPersona(registro.persona) || registro.nombre}-${indice}`}
          className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-slate-700"
        >
          <p className="font-semibold text-slate-900">
            {registro.persona
              ? obtenerNombreConMarcaTurnante(
                  registro.persona,
                  registro.nombre,
                  identidadesTurnantes
                )
              : registro.nombre}
          </p>
          <p className="mt-1">
            {registro.sectorOrigen || "Sector no registrado"} · {registro.motivoEtiqueta}
          </p>
          {registro.detalle && <p>{registro.detalle}</p>}
          {registro.personaCoberturaNombre && (
            <>
              <p>Cubierto por: {registro.personaCoberturaNombre} (E)</p>
              <p>Sector: {registro.sectorOrigen || "No identificado"}</p>
            </>
          )}
          {registro.tipo === "manual" &&
            registro.motivo === MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO &&
            !registro.personaCoberturaNombre && (
              <p>Cobertura aún no indicada</p>
            )}
          {registro.turnoDestino && (
            <p>Turno destino: {obtenerEtiquetaTurnoDestino(registro.turnoDestino)}</p>
          )}
          <p>
            Categoría: {registro.categoria === "licenciado" ? "Licenciados" : "Enfermeros"}
          </p>
          {registro.tipo === "manual" && registro.persona && !soloLecturaEfectiva && (
            <button
              type="button"
              onClick={() => abrirFormularioNoDisponible(registro.persona, registro.registro)}
              className="mt-2 rounded-lg border border-orange-300 bg-white px-2 py-1 text-xs font-medium text-orange-900"
            >
              Editar motivo
            </button>
          )}
          {registro.tipo === "certificacion_rapida" && !soloLecturaEfectiva && (
            <button
              type="button"
              onClick={() => quitarCertificacionRapida(registro.registro)}
              className="mt-2 rounded-lg border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-900"
            >
              Eliminar certificación del día
            </button>
          )}
        </article>
      ))}
      {coberturasExtrasPresentacion.map((cobertura) => (
        <article
          key={cobertura.id}
          className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-slate-700"
        >
          <p className="font-semibold text-slate-900">{cobertura.nombre}</p>
          <p className="mt-1">
            {cobertura.sector || "Sector no registrado"} · Cubierto por: {cobertura.extraNombre} (E)
          </p>
          <p>Motivo: Cobertura de compañero</p>
          <p>
            Categoría: {cobertura.categoria === "licenciado" ? "Licenciados" : "Enfermeros"}
          </p>
          <span className="mt-2 inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
            Cobertura registrada
          </span>
        </article>
      ))}
    </div>
  </section>
)}

{ausentesDelDia.length > 0 && (
  <section className="mt-5" aria-labelledby={`ausentes-${tipo}-${keyDia}`}>
    <h4 id={`ausentes-${tipo}-${keyDia}`} className="text-sm font-semibold text-slate-800">
      Ausentes del día
    </h4>
    <div className="mt-2 grid gap-3 sm:grid-cols-2">
      {ausentesDelDia.map((ausente) => {
        const horario = configTurnoCalendario.horarios[
          ausente.horario
        ] || configTurnoCalendario.horarios.normal;
        return (
          <article
            key={ausente.clave}
            className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-slate-700"
          >
            <p className="font-semibold text-slate-900">
              {obtenerNombreConMarcaTurnante(
                ausente.persona,
                ausente.nombre,
                identidadesTurnantes
              )}
            </p>
            <p className="mt-1">
              Sector al marcar ausencia: {ausente.sectorOrigen || "No registrado"}
            </p>
            <p>Horario: {horario?.textoVisible || "No disponible"}</p>
            <p>
              Categoría: {ausente.categoria === "licenciado" ? "Licenciados" : "Enfermeros"}
            </p>
            <label className="mt-2 block font-medium">
              Estado
              <select
                aria-label={`Asistencia de ${ausente.nombre}`}
                value={ESTADOS_ASISTENCIA.AUSENTE}
                disabled={soloLecturaEfectiva || !ausente.persona}
                onChange={(evento) => {
                  if (!ausente.persona) return;
                  cambiarAsistencia(ausente.persona, evento.target.value);
                }}
                className="mt-1 w-full rounded-md border border-violet-300 bg-white px-2 py-1.5"
              >
                <option value={ESTADOS_ASISTENCIA.PENDIENTE}>Pendiente</option>
                <option value={ESTADOS_ASISTENCIA.PRESENTE}>✓ Presente</option>
                <option value={ESTADOS_ASISTENCIA.AUSENTE}>✕ Ausente</option>
              </select>
            </label>
          </article>
        );
      })}
    </div>
  </section>
)}

<h4 className="text-sm font-semibold text-slate-700">Libres</h4>

<div className="flex flex-wrap gap-2">
  {libres.map((e, indice) => {
    const yaEsta = extrasDia.some(
      (ex) => personasCompartenIdentidad(ex, e)
    );

    return (
      <button
        disabled={soloLecturaEfectiva || yaEsta}
        key={obtenerClaveRenderPersona(e, indice, idsPersonalDuplicados)}
        className={`px-3 py-1.5 rounded-lg text-sm text-white transition
          ${yaEsta ? "bg-green-600" : "bg-green-400 hover:bg-green-500"}`}
        onClick={() => abrirFormularioExtraLibre(e)}
      >
        {obtenerNombreConMarcaTurnante(e, "", identidadesTurnantes)}
        {yaEsta ? " · Agregado como Extra" : " · Agregar como Extra"}
      </button>
    );
  })}
</div>

<h4 className="text-sm font-semibold text-slate-700">Certificados</h4>

<div className="flex flex-wrap gap-2">
  {certificados.length > 0 ? certificados.map((persona, indice) => (
    <span
      key={obtenerClaveRenderPersona(persona, indice, idsPersonalDuplicados)}
      className="bg-rose-100 px-3 py-1.5 rounded-lg text-sm text-rose-800"
    >
      {obtenerEtiquetaPersona(persona, personal)}
    </span>
  )) : (
    <span className="text-sm text-slate-500">Ninguno</span>
  )}
</div>

<h4 className="text-sm font-semibold text-slate-700">
  Extras del día
</h4>

<div className="flex flex-wrap gap-2">
  {extrasDia.map((e) => (
    <div
      key={e.id}
      className="flex items-start gap-2 rounded-lg bg-blue-100 px-3 py-2 text-sm"
    >
      <span>
        <span className="block font-medium">
          {obtenerNombreConMarcaTurnante(e, "", identidadesTurnantes)}
        </span>
        <span className="block text-xs text-slate-600">
          {obtenerDescripcionExtra(
            e,
            (turno) => obtenerConfiguracionTurno(turno).nombre
          )}
        </span>
      </span>

      <button
        type="button"
        disabled={soloLecturaEfectiva}
        onClick={() => borrarExtra(e)}
        aria-label={`Quitar Extra ${e.nombre}`}
        className="text-red-500"
      >
        ❌
      </button>
    </div>
  ))}
</div>

<div className="mb-2 mt-2">
  <button
    type="button"
    disabled={soloLecturaEfectiva}
    onClick={abrirFormularioExtra}
    className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white"
  >
    + Agregar Extra
  </button>
</div>


<h4 className="text-sm font-semibold text-slate-700">
  No disponibles
</h4>

<div className="flex flex-wrap gap-2">
  {personalFiltrado.map((e, indice) => {
    const activo = (noDisponibles[keyDia] || []).some(
      (referencia) => referenciaCorrespondeAPersona(
        referencia,
        e,
        personalFiltrado
      )
    );
    const certificado = estaCertificadoHoy(e);
    const registroActivo = activo
      ? (noDisponibles[keyDia] || []).find((referencia) =>
          referenciaCorrespondeAPersona(referencia, e, personalFiltrado)
        )
      : null;

    return (
      <button
        type="button"
        disabled={soloLecturaEfectiva || certificado}
        key={obtenerClaveRenderPersona(e, indice, idsPersonalDuplicados)}
        className={`px-3 py-1.5 rounded-lg text-sm transition
          ${activo
            ? "bg-red-500 text-white"
            : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
        onClick={() => abrirFormularioNoDisponible(e, registroActivo)}
      >
        {obtenerEtiquetaPersona(e, personal)}
        {certificado ? " · Certificación médica" : ""}
      </button>
    );
  })}
</div>
      <div className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">
            Previstos: {resumenMostrado.conteos.previstos} | Presentes: {resumenMostrado.conteos.presentes} | Ausentes: {resumenMostrado.conteos.ausentes} | Pendientes: {resumenMostrado.conteos.pendientes}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={soloLecturaEfectiva || personasPrevistas.length === 0}
              onClick={marcarTodosPresentes}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Marcar todos presentes
            </button>
            <button
              type="button"
              disabled={soloLecturaEfectiva || !Object.hasOwn(asistenciaDia, keyDia)}
              onClick={limpiarAsistencia}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpiar asistencia
            </button>
          </div>
        </div>
      </div>

      <section className="my-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-slate-800">Resumen del turno</h4>
          <span className="text-xs font-medium text-slate-500">
            {tipo === "enfermero" ? "Enfermeros" : "Licenciados"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Previstos", resumenMostrado.conteos.previstos],
            ["Presentes", resumenMostrado.conteos.presentes],
            ["Ausentes", resumenMostrado.conteos.ausentes],
            ["Pendientes", resumenMostrado.conteos.pendientes],
            ["Libres", resumenMostrado.conteos.libres],
            ["Licencias", resumenMostrado.conteos.licencias],
            ["Certificados", resumenMostrado.conteos.certificaciones],
            ["Extras registrados", resumenMostrado.conteos.extras],
            ["Sin cobertura", resumenMostrado.conteos.sectoresSinCobertura]
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">{etiqueta}</p>
              <p className="text-xl font-bold text-slate-800">{valor}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          {resumenMostrado.alertas.length === 0 ? (
            <p className="text-sm font-medium text-emerald-700">✓ Sin alertas para revisar</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAlertasAbiertas((actual) => !actual)}
                className="flex w-full items-center justify-between text-left text-sm font-semibold text-amber-800"
                aria-expanded={alertasAbiertas}
              >
                <span>⚠ {resumenMostrado.alertas.length} situaciones para revisar</span>
                <span>{alertasAbiertas ? "Ocultar" : "Mostrar"}</span>
              </button>
              {alertasAbiertas && (
                <ul className="mt-2 space-y-2">
                  {resumenMostrado.alertas.map((alerta) => (
                    <li
                      key={alerta.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        alerta.nivel === "critica"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : alerta.nivel === "advertencia"
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                      }`}
                    >
                      <strong>{alerta.nivel.toUpperCase()}:</strong> {alerta.mensaje}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      <section className={`my-4 rounded-2xl border p-4 ${
        bloqueadoPorCierre
          ? "border-emerald-200 bg-emerald-50"
          : cierresDia?.[keyDia]?.estado === "reabierto"
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-white"
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-800">
              {bloqueadoPorCierre
                ? `✓ Turno cerrado — ${tipo === "enfermero" ? "Enfermeros" : "Licenciados"}`
                : cierresDia?.[keyDia]?.estado === "reabierto"
                  ? `Turno reabierto — ${tipo === "enfermero" ? "Enfermeros" : "Licenciados"}`
                  : `Turno abierto — ${tipo === "enfermero" ? "Enfermeros" : "Licenciados"}`}
            </p>
            {versionCierre && (
              <p className="mt-1 text-xs text-slate-600">
                Cerrado por {versionCierre.cerradoPor}{versionCierre.responsableCierre?.nombre ? `, ${versionCierre.responsableCierre.nombre}` : ""} · {new Date(versionCierre.cerradoEn).toLocaleString("es-UY")} · Revisión {versionCierre.revision}
              </p>
            )}
          </div>
          {!bloqueadoPorCierre && !soloLectura && (
            <div className="min-w-64">
              <label htmlFor={`responsable-cierre-${tipo}`} className="mb-1 block text-xs font-semibold text-slate-600">
                Responsable del cierre
              </label>
              <select
                id={`responsable-cierre-${tipo}`}
                value={responsableSeleccionadoId}
                onChange={(evento) => {
                  setSeleccionResponsable({ contexto: contextoResponsable, personaId: evento.target.value });
                  setErrorResponsable({ contexto: "", mensaje: "" });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="">Seleccionar responsable</option>
                {licenciadosResponsables.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {obtenerEtiquetaPersona(persona, personal)}
                  </option>
                ))}
              </select>
              {mensajeErrorResponsable && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{mensajeErrorResponsable}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {versionCierre && (
              <button type="button" onClick={() => setCierreVisible((actual) => !actual)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                {cierreVisible ? "Ocultar cierre" : "Ver cierre"}
              </button>
            )}
            {!bloqueadoPorCierre && !soloLectura && (
              <button type="button" onClick={cerrarTurno} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white">
                Cerrar turno — {tipo === "enfermero" ? "Enfermeros" : "Licenciados"}
              </button>
            )}
            {bloqueadoPorCierre && puedeReabrirCierre && (
              <button type="button" onClick={reabrirTurno} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white">
                Reabrir
              </button>
            )}
          </div>
        </div>
        {cierreVisible && versionCierre?.snapshot && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-700">Fotografía histórica · {versionCierre.snapshot.fecha}</p>
            <p className="mt-1 text-sm text-slate-600">Cuenta de cierre: {versionCierre.cerradoPor}</p>
            <p className="text-sm text-slate-600">Responsable: {versionCierre.responsableCierre?.nombre || "No registrado"}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Distribución</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {versionCierre.snapshot.asignaciones.map((item, indice) => (
                    <li key={`${item.sector}-${indice}`}><strong>{item.sector}:</strong> {item.persona?.nombre || "Sin cobertura"}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Asistencia</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {versionCierre.snapshot.personasPrevistas.map((persona) => (
                    <li key={persona.personaId}><strong>{persona.nombre}:</strong> {obtenerAsistenciaDeSnapshot(versionCierre.snapshot, persona)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}

export default CalendarioDiario;
