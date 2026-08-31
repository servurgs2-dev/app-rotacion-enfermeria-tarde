import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ListaPersonal from "./components/personal/ListaPersonal";
import PlanillaMensual from "./components/planilla/PlanillaMensual";
import CalendarioDiario from "./components/calendario/CalendarioDiario";
import Seccion from "./components/ui/Seccion";
import Novedades from "./components/novedades/Novedades";
import {
  cancelarNovedadPersonal,
  actualizarEstadoNovedadPersonal,
  listarNovedadesPersonal,
  registrarNovedadPersonal,
  registrarOlvidoTarjeta,
  guardarCambioHorarioPersonal,
  sincronizarListaParo
} from "./services/novedadesPersonal.js";
import {
  crearNovedadesLegacy,
  eliminarRegistroLegacyProyectado,
  obtenerRangoMesNovedades,
  reemplazarRegistroLegacyProyectado
} from "./utils/novedadesPersonal.js";
import { crearResumenInicioTurno } from "./utils/resumenInicioTurno.js";
import { fechaPerteneceAlMes } from "./utils/navegacionFechaResumen.js";
import Estadisticas from "./components/estadisticas/Estadisticas";
import HistorialCambios from "./components/historial/HistorialCambios";
import PanelConflictoEdicion from "./components/concurrencia/PanelConflictoEdicion";
import PanelPrepararMes from "./components/mes/PanelPrepararMes";
import PanelPrioridadCoberturaMes from "./components/mes/PanelPrioridadCoberturaMes";
import PanelReiniciarMes from "./components/mes/PanelReiniciarMes";
import NavegadorMeses from "./components/mes/NavegadorMeses";
import SelectorTurno from "./components/turnos/SelectorTurno";
import VistaSupervision from "./components/supervision/VistaSupervision";
import {
  exportarPlanillaPDF,
  exportarCalendarioPDF,
  obtenerAdjuntoCalendarioPDF,
  obtenerAdjuntoPlanillaPDF
} from "./utils/exportPDF";
import BotonEnviarPDF from "./components/correo/BotonEnviarPDF";
import NavegacionPrincipal from "./components/layout/NavegacionPrincipal";
import VistaInicio from "./components/layout/VistaInicio";
import HubMas, { BotonVolverMas } from "./components/layout/HubMas";
import { crearAsuntoCorreoPDF } from "./utils/correoPDF";
import {
  keyDiaFromDate,
  obtenerSemanasDelMes,
  parsearFechaLocal
} from "./utils/fechas";
import { generarAlertasHorarios } from "./utils/alertasHorarios";
import {
  TURNOS,
  obtenerConfiguracionTurno,
  obtenerEstrategiaRotacionPlanilla
} from "./config/turnos";
import {
  crearEstadoMensualVacio
} from "./utils/estadoMensual";
import {
  clasificarPeriodoMes,
  esMesHistoricoCerrado,
  obtenerMesAnterior,
  obtenerMesSiguiente
} from "./utils/periodosMensuales.js";
import { crearListaMesesNavegables } from "./utils/navegacionMensual.js";
import {
  puedeMutarEstadoMensual,
  puedeMutarPeriodoMensual
} from "./utils/proteccionTemporalMensual.js";
import {
  cargarEstadoTurnoMesConRevision,
  guardarEstadoTurnoMesConRevision,
  listarMesesExistentes
} from "./services/estadoTurnos";
import { cargarPadronPersonalEfectivoMes } from "./services/padronVigenciasTurnoPersonal.js";
import { crearClaveTurnoMes } from "./utils/claveTurnoMes";
import {
  buscarPersonaEnEstadosDeTurnos,
  obtenerEstadosDeOtrosTurnos
} from "./utils/exclusividadPersonalTurnos";
import {
  limpiarReferenciasDeCategoria,
  limpiarReferenciasDePersona
} from "./utils/integridadPersonas";
import { renombrarPersonaEnEstado } from "./utils/renombrarPersona.js";
import {
  existeFuncionarioDuplicado,
  obtenerIdsPersonalDuplicados
} from "./utils/validacionPersonal.js";
import {
  clasificarResultadoCarga,
  esCargaVigente,
  hayCambiosLocalesPendientes
} from "./utils/proteccionDatos.js";
import {
  crearBloqueoSolicitud,
  ejecutarSolicitudProtegida,
  evaluarCierreSesion
} from "./utils/auth.js";
import {
  esPerfilSupervision,
  esSoloLectura,
  obtenerEtiquetaPerfil,
  obtenerMensajeSoloLectura,
  puedeEditarTurno
} from "./utils/permisos.js";
import {
  analizarPreparacionMesNuevo,
  aplicarOmisionesPersonalEstadoPreparado,
  clasificarEstadoMesDestino,
  construirEstadoMesNuevo,
  formatearContenidoMes,
  reconciliarPersonalPreparacionMes,
  validarContextoPreparacion
} from "./utils/preparacionMesNuevo.js";
import {
  aplicarConflictoConcurrencia,
  aplicarErrorConcurrencia,
  aplicarErrorResolucionConflicto,
  aplicarExitoConcurrencia,
  actualizarEstadoLocalConflicto,
  claveBloqueadaPorConflicto,
  crearMetadatosConcurrenciaDesdeCarga,
  hayPendienteMasNuevo,
  marcarConcurrenciaGuardando,
  marcarConcurrenciaPendiente,
  normalizarEstadoGuardadoVisible,
  obtenerRevisionEsperada
} from "./utils/concurrenciaGuardado.js";
import {
  crearNombreRespaldoConflicto,
  crearRespaldoConflicto,
  interpretarClaveConflicto,
  listarConflictosPendientes,
  prepararMetadatosUsarServidor,
  prepararResolucionConservarLocal
} from "./utils/resolucionConflicto.js";
import {
  debeMantenerBloqueoRestauracion,
  evaluarDisponibilidadRestauracion,
  seleccionarEstadoCargaVersionada,
  validarContextoAdopcionRestauracion,
  validarRespuestaRestaurada
} from "./utils/restauracionHistorial.js";
import { reiniciarMesEnEstado } from "./utils/limpiezaSegura.js";
import { validarBorradoresConfiguracionPlanilla } from "./utils/plantillasConfiguracionPlanilla.js";
import { esSnapshotConfiguracionPlanillaValido } from "./utils/configuracionPlanilla.js";
import {
  actualizarPrioridadCoberturaEnEstadoMensual,
  copiarPrioridadCoberturaMensual
} from "./utils/prioridadCoberturaMensual.js";
import { usePadronVigenciasPersonalMes } from "./hooks/usePadronVigenciasPersonalMes.js";
import { resolverPersonalEfectivoPorTurnoFecha } from "./utils/padronVigenciasTurnoPersonal.js";
import { analizarDependenciasMovimientoPadronBase } from "./utils/dependenciasMovimientoPadronBase.js";
import { moverPersonaPadronBaseTurnoMes } from "./services/movimientoPadronBase.js";
import { obtenerMensajeMovimientoPadronBase } from "./services/servicioMovimientoPadronBase.js";

const crearInstantanea = (data) => JSON.parse(JSON.stringify(data));

const ControlSesion = ({ etiqueta, cerrando, error, onCerrar }) => (
  <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
    {etiqueta && <span className="text-slate-600">{etiqueta}</span>}
    <button
      type="button"
      onClick={onCerrar}
      disabled={cerrando}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
    >
      {cerrando ? "Cerrando..." : "Cerrar sesión"}
    </button>
    {error && <p className="w-full text-right text-sm text-red-600" role="alert">{error}</p>}
  </div>
);

function App({ perfil, onSignOut }) {
 const [turnoActivo, setTurnoActivo] = useState(null);
 const configTurno = turnoActivo ? obtenerConfiguracionTurno(turnoActivo) : null;
 const [estadoPorTurnoMes, setEstadoPorTurnoMes] = useState({});
 const estadoPorTurnoMesRef = useRef(estadoPorTurnoMes);
  const [mesActivo, setMesActivo] = useState(() => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
});

const [tabPlanilla, setTabPlanilla] = useState("enfermeros");
const [tabCalendario, setTabCalendario] = useState("enfermeros");
const [vistaActiva, setVistaActiva] = useState("inicio");
const [subvistaMas, setSubvistaMas] = useState(null);
const [vistaInicial, setVistaInicial] = useState("selector");

const [fecha, setFecha] = useState(() => parsearFechaLocal(keyDiaFromDate(new Date())));
const claveActiva = turnoActivo
  ? crearClaveTurnoMes(turnoActivo, mesActivo)
  : null;
const puedeEditarActivo = puedeEditarTurno(perfil, turnoActivo);
const modoSoloLectura = esSoloLectura(perfil, turnoActivo);
const debouncesGuardadoRef = useRef(new Map());
const colaGuardadoRef = useRef(new Map());
const versionesGuardadoRef = useRef(new Map());
const mesesConErrorGuardadoRef = useRef(new Set());
const guardadoEnCursoRef = useRef(false);
const appMontadaRef = useRef(true);
const bloqueoCierreSesionRef = useRef(crearBloqueoSolicitud());
const claveGuardadoEnCursoRef = useRef(null);
const procesarColaGuardadoRef = useRef(null);
const referenciasEstadoRef = useRef(new Map());
const identidadesEstadoRef = useRef(new Map());
const mesesCargadosRef = useRef(new Set());
const cargandoRef = useRef(true);
const cargaActualRef = useRef({ id: 0, clave: null });
const [cargando, setCargando] = useState(true);
const [estadoGuardado, setEstadoGuardado] = useState("loading");
const [metadatosPorClave, setMetadatosPorClave] = useState({});
const metadatosPorClaveRef = useRef(new Map());
const [resolucionPorClave, setResolucionPorClave] = useState({});
const [erroresCargaPorClave, setErroresCargaPorClave] = useState({});
const erroresCargaRef = useRef(new Set());
const [intentoCarga, setIntentoCarga] = useState(0);
const [cerrandoSesion, setCerrandoSesion] = useState(false);
const [errorCierreSesion, setErrorCierreSesion] = useState("");
const [preparacionMes, setPreparacionMes] = useState(null);
const [reinicioMes, setReinicioMes] = useState(null);
const [edicionPrioridadCobertura, setEdicionPrioridadCobertura] = useState(null);
const [novedadesPersonal, setNovedadesPersonal] = useState([]);
const [mesesExistentes, setMesesExistentes] = useState([]);
const [estadoDescubrimientoMeses, setEstadoDescubrimientoMeses] = useState("cargando");
const [errorDescubrimientoMeses, setErrorDescubrimientoMeses] = useState("");
const [cargandoNovedades, setCargandoNovedades] = useState(false);
const [errorNovedades, setErrorNovedades] = useState("");
const contextoNovedadesRef = useRef({ mes: "", turno: "", solicitud: 0 });
const [restauracionHistorialEnCurso, setRestauracionHistorialEnCurso] = useState(null);
const restauracionHistorialEnCursoRef = useRef(null);
const [clavesBloqueadasTrasRestauracion, setClavesBloqueadasTrasRestauracion] =
  useState(() => new Set());
const clavesBloqueadasTrasRestauracionRef = useRef(new Set());
const creacionesMensualesAutorizadasRef = useRef(new Set());
const sesionActivaRef = useRef(String(perfil?.usuario || ""));
const contextoActivoRef = useRef({ turno: turnoActivo, mes: mesActivo });

const [dataPDFEnf, setDataPDFEnf] = useState({ asignaciones: [], libres: [] });
const [dataPDFLic, setDataPDFLic] = useState({ asignaciones: [], libres: [] });

useEffect(() => {
  let vigente = true;
  setEstadoDescubrimientoMeses("cargando");
  listarMesesExistentes()
    .then((meses) => {
      if (!vigente) return;
      setMesesExistentes(meses);
      setEstadoDescubrimientoMeses("listo");
      setErrorDescubrimientoMeses("");
    })
    .catch(() => {
      if (!vigente) return;
      setEstadoDescubrimientoMeses("error");
      setErrorDescubrimientoMeses("No fue posible consultar los meses históricos.");
    });
  return () => { vigente = false; };
}, []);

useEffect(() => {
  estadoPorTurnoMesRef.current = estadoPorTurnoMes;
}, [estadoPorTurnoMes]);

useEffect(() => {
  sesionActivaRef.current = String(perfil?.usuario || "");
  contextoActivoRef.current = { turno: turnoActivo, mes: mesActivo };
}, [mesActivo, perfil?.usuario, turnoActivo]);

useEffect(() => {
  const timeout = setTimeout(() => setReinicioMes(null), 0);
  return () => clearTimeout(timeout);
}, [claveActiva]);

//console.log("🔁 TAB ACTUAL:", tabCalendario);

useEffect(() => {
  if (!claveActiva || !turnoActivo) return;

  identidadesEstadoRef.current.set(claveActiva, { turnoId: turnoActivo, mes: mesActivo });
}, [claveActiva, mesActivo, turnoActivo]);

const getMesData = (mes, turnoId = turnoActivo) => {
  if (!turnoId) return crearEstadoMensualVacio();

  const clave = crearClaveTurnoMes(turnoId, mes);
  return estadoPorTurnoMes[clave] || crearEstadoMensualVacio();
};



const mesData = getMesData(mesActivo);
const personal = mesData.personal;
const periodoMesActivoVisible = new Intl.DateTimeFormat("es-UY", {
  month: "long",
  year: "numeric"
}).format(new Date(`${mesActivo}-01T12:00:00`));
const vigenciasPersonal = usePadronVigenciasPersonalMes({
  mes: mesActivo,
  turnoActivo,
  estadoActivo: mesData,
  habilitado: (vistaActiva === "mas" && subvistaMas === "personal") ||
    vistaActiva === "calendario" || vistaActiva === "planilla"
});
const personalCalendario = useMemo(() => resolverPersonalEfectivoPorTurnoFecha({
  padron: vigenciasPersonal.error || vigenciasPersonal.cargando
    ? null
    : vigenciasPersonal.padron,
  turno: turnoActivo,
  fecha: keyDiaFromDate(fecha),
  personalFisico: personal
}).personas, [fecha, personal, turnoActivo, vigenciasPersonal.cargando, vigenciasPersonal.error, vigenciasPersonal.padron]);
const estadosVigenciasCalendario = vigenciasPersonal.estadosPorTurno;
const diasParo = mesData.calendario?.diasParo || {};
const keyDiaActual = keyDiaFromDate(fecha);
const esDiaParoActual = Boolean(diasParo[keyDiaActual]);
const alertasHorarios = useMemo(() => {
  if (
    !configTurno ||
    esDiaParoActual ||
    dataPDFEnf.keyDia !== keyDiaActual ||
    dataPDFLic.keyDia !== keyDiaActual
  ) {
    return [];
  }

  return generarAlertasHorarios({
    enfermeros: dataPDFEnf.asignaciones,
    licenciados: dataPDFLic.asignaciones,
    personal,
    configTurno,
    novedades: novedadesPersonal,
    fecha: keyDiaActual,
    turno: turnoActivo
  });
}, [configTurno, dataPDFEnf, dataPDFLic, esDiaParoActual, keyDiaActual, novedadesPersonal, personal, turnoActivo]);

// 🔹 PLANILLAS
const planillaEnfermeros = mesData.planillas.enfermeros;
const planillaLicenciados = mesData.planillas.licenciados;
// 🔹 LICENCIAS

const licenciasMes = mesData.licencias;
const certificacionesMes = useMemo(
  () => mesData.certificaciones || [],
  [mesData.certificaciones]
);
const licenciasCalendarioLectura = useMemo(() => estadosVigenciasCalendario
  ? Object.values(estadosVigenciasCalendario).flatMap((estado) =>
      Array.isArray(estado?.licencias) ? estado.licencias : []
    )
  : licenciasMes, [estadosVigenciasCalendario, licenciasMes]);
const certificacionesCalendarioLectura = useMemo(() => estadosVigenciasCalendario
  ? Object.values(estadosVigenciasCalendario).flatMap((estado) =>
      Array.isArray(estado?.certificaciones) ? estado.certificaciones : []
    )
  : certificacionesMes, [certificacionesMes, estadosVigenciasCalendario]);
const resumenInicio = useMemo(() => crearResumenInicioTurno({
  enfermeros: dataPDFEnf.keyDia === keyDiaActual
    ? dataPDFEnf.resumenInicio
    : {},
  licenciados: dataPDFLic.keyDia === keyDiaActual
    ? dataPDFLic.resumenInicio
    : {},
  novedades: [
    ...crearNovedadesLegacy({
      licencias: licenciasMes,
      certificaciones: mesData.certificaciones || [],
      personal
    }),
    ...novedadesPersonal
  ],
  fecha: keyDiaActual,
  turnoActivo
}), [
  dataPDFEnf,
  dataPDFLic,
  keyDiaActual,
  licenciasMes,
  mesData.certificaciones,
  novedadesPersonal,
  personal,
  turnoActivo
]);

const cargarNovedades = useCallback(async () => {
  const solicitud = contextoNovedadesRef.current.solicitud + 1;
  if (!turnoActivo) {
    contextoNovedadesRef.current = { mes: mesActivo, turno: "", solicitud };
    setNovedadesPersonal([]);
    setCargandoNovedades(false);
    setErrorNovedades("");
    return;
  }
  if (
    contextoNovedadesRef.current.mes !== mesActivo ||
    contextoNovedadesRef.current.turno !== turnoActivo
  ) {
    setNovedadesPersonal([]);
  }
  contextoNovedadesRef.current = { mes: mesActivo, turno: turnoActivo, solicitud };
  setCargandoNovedades(true);
  setErrorNovedades("");
  try {
    const resultado = await listarNovedadesPersonal({
      ...obtenerRangoMesNovedades(mesActivo),
      turno: turnoActivo
    });
    if (contextoNovedadesRef.current.mes !== mesActivo || contextoNovedadesRef.current.turno !== turnoActivo || contextoNovedadesRef.current.solicitud !== solicitud) return;
    setNovedadesPersonal(resultado);
  } catch (error) {
    if (contextoNovedadesRef.current.mes !== mesActivo || contextoNovedadesRef.current.turno !== turnoActivo || contextoNovedadesRef.current.solicitud !== solicitud) return;
    setErrorNovedades(error?.message || "No fue posible cargar las novedades.");
  } finally {
    if (contextoNovedadesRef.current.mes === mesActivo && contextoNovedadesRef.current.turno === turnoActivo && contextoNovedadesRef.current.solicitud === solicitud) {
      setCargandoNovedades(false);
    }
  }
}, [mesActivo, turnoActivo]);

useEffect(() => {
  cargarNovedades();
}, [cargarNovedades]);

const registrarNovedad = async (novedad) => {
  if (!puedeMutarMesActivo()) return null;
  const creada = await registrarNovedadPersonal(novedad);
  setNovedadesPersonal((actuales) => [creada, ...actuales]);
  return creada;
};

const cancelarNovedad = async (id) => {
  if (!puedeMutarMesActivo()) return null;
  const cancelada = await cancelarNovedadPersonal(id);
  setNovedadesPersonal((actuales) => actuales.map(
    (novedad) => novedad.id === cancelada.id ? cancelada : novedad
  ));
  return cancelada;
};

const guardarListaParo = async ({ fecha, personasSeleccionadas, observacion }) => {
  if (!puedeMutarMesActivo()) return null;
  const resultado = await sincronizarListaParo({
    fecha,
    turno: turnoActivo,
    personasSeleccionadas,
    observacion
  });
  setNovedadesPersonal((actuales) => {
    const canceladasPorId = new Map(
      resultado.canceladas.map((novedad) => [novedad.id, novedad])
    );
    const actualizadas = actuales.map(
      (novedad) => canceladasPorId.get(novedad.id) || novedad
    );
    const idsActuales = new Set(actualizadas.map((novedad) => novedad.id));
    return [
      ...resultado.creadas.filter((novedad) => !idsActuales.has(novedad.id)),
      ...actualizadas
    ];
  });
  return resultado;
};

const guardarOlvidoTarjeta = async ({ persona, fecha, observacion }) => {
  if (!puedeMutarMesActivo()) return null;
  const creada = await registrarOlvidoTarjeta({
    persona,
    fecha,
    turno: turnoActivo,
    observacion
  });
  setNovedadesPersonal((actuales) => [creada, ...actuales]);
  return creada;
};

const guardarCambioHorario = async (entrada) => {
  if (!puedeMutarMesActivo()) return null;
  const guardada = await guardarCambioHorarioPersonal({
    ...entrada,
    turno: turnoActivo
  });
  setNovedadesPersonal((actuales) => {
    const existe = actuales.some((novedad) => novedad.id === guardada.id);
    return existe
      ? actuales.map((novedad) => novedad.id === guardada.id ? guardada : novedad)
      : [guardada, ...actuales];
  });
  return guardada;
};

const actualizarEstadoNovedad = async (id, estado) => {
  if (!puedeMutarMesActivo()) return null;
  const actualizada = await actualizarEstadoNovedadPersonal(id, estado);
  setNovedadesPersonal((actuales) => actuales.map(
    (novedad) => novedad.id === actualizada.id ? actualizada : novedad
  ));
  return actualizada;
};

const actualizarCertificacionesMes = (actualizacion) => {
  setEstadoPorTurnoMes((prev) => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
    const actual = prev[claveActiva] || crearEstadoMensualVacio();
    const certificacionesActuales = actual.certificaciones || [];
    const nuevas = typeof actualizacion === "function"
      ? actualizacion(certificacionesActuales)
      : actualizacion;
    if (nuevas === certificacionesActuales) return prev;
    return { ...prev, [claveActiva]: { ...actual, certificaciones: nuevas } };
  });
};

const actualizarLicenciasMes = (actualizacion) => {
  setEstadoPorTurnoMes((prev) => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
    const actual = prev[claveActiva] || crearEstadoMensualVacio();
    const licenciasActuales = actual.licencias || [];
    const nuevas = typeof actualizacion === "function"
      ? actualizacion(licenciasActuales)
      : actualizacion;
    if (nuevas === licenciasActuales) return prev;
    return { ...prev, [claveActiva]: { ...actual, licencias: nuevas } };
  });
};

const editarRegistroLegacyMes = (campo, novedad, actualizacion) => {
  const estadoActual = estadoPorTurnoMesRef.current[claveActiva] || crearEstadoMensualVacio();
  const registros = Array.isArray(estadoActual[campo]) ? estadoActual[campo] : [];
  const resultado = reemplazarRegistroLegacyProyectado({ registros, novedad, actualizacion });
  if (resultado.error) throw new Error(resultado.error);
  const actualizar = campo === "licencias" ? actualizarLicenciasMes : actualizarCertificacionesMes;
  actualizar(resultado.registros);
  return resultado.registros;
};

const eliminarRegistroLegacyMes = (campo, novedad) => {
  const estadoActual = estadoPorTurnoMesRef.current[claveActiva] || crearEstadoMensualVacio();
  const registros = Array.isArray(estadoActual[campo]) ? estadoActual[campo] : [];
  const resultado = eliminarRegistroLegacyProyectado({ registros, novedad });
  if (resultado.error) throw new Error(resultado.error);
  const actualizar = campo === "licencias" ? actualizarLicenciasMes : actualizarCertificacionesMes;
  actualizar(resultado.registros);
  return resultado.registros;
};

const obtenerCertificacionesActuales = () =>
  estadoPorTurnoMesRef.current[claveActiva]?.certificaciones ?? certificacionesMes;

const semanas = obtenerSemanasDelMes(mesActivo);

const puedeMutarClaveMensual = useCallback(({
  clave,
  turnoId,
  mes,
  permitirCreacionExplicita = false
}) => {
  const metadatos = metadatosPorClaveRef.current.get(clave);
  const creacionExplicita = permitirCreacionExplicita ||
    creacionesMensualesAutorizadasRef.current.has(clave);
  return puedeEditarTurno(perfil, turnoId) && puedeMutarEstadoMensual({
    mes,
    existeRemoto: metadatos?.existeRemoto === true,
    creacionExplicita
  });
}, [perfil]);

const puedeMutarMesActivo = useCallback(() => Boolean(
  claveActiva && turnoActivo && puedeMutarClaveMensual({
    clave: claveActiva,
    turnoId: turnoActivo,
    mes: mesActivo
  })
), [claveActiva, mesActivo, puedeMutarClaveMensual, turnoActivo]);

const actualizarMetadatosClave = useCallback((clave, actualizador) => {
  const anteriores = metadatosPorClaveRef.current.get(clave) || null;
  const siguientes =
    typeof actualizador === "function" ? actualizador(anteriores) : actualizador;
  if (!siguientes) return;

  metadatosPorClaveRef.current.set(clave, siguientes);
  setMetadatosPorClave((prev) => ({ ...prev, [clave]: siguientes }));
}, []);

const guardarMes = useCallback(
  async (turnoId, mes, data, revisionEsperada) => {
    const clave = crearClaveTurnoMes(turnoId, mes);
    if (!data || !puedeMutarClaveMensual({ clave, turnoId, mes })) {
      throw new Error("No hay permisos para guardar este turno y mes.");
    }
    return guardarEstadoTurnoMesConRevision({
      turnoId,
      mes,
      estado: data,
      revisionEsperada
    });
  },
  [puedeMutarClaveMensual]
);

const actualizarEstadoGuardadoDesdeCola = useCallback(() => {
  if (guardadoEnCursoRef.current) {
    setEstadoGuardado("saving");
    return;
  }

  if (colaGuardadoRef.current.size > 0) {
    const hayPendientesReintentables = [...colaGuardadoRef.current.keys()].some(
      (clave) =>
        !mesesConErrorGuardadoRef.current.has(clave) &&
        !erroresCargaRef.current.has(clave)
    );
    setEstadoGuardado(hayPendientesReintentables ? "saving" : "error");
    return;
  }

  setEstadoGuardado(
    mesesConErrorGuardadoRef.current.size > 0
      ? "error"
      : cargandoRef.current
        ? "loading"
        : "saved"
  );
}, []);

const encolarGuardado = useCallback(({
  clave,
  turnoId,
  mes,
  data,
  esResolucionConflicto = false,
  revisionEsperadaResolucion = null
}) => {
  const metadatos = metadatosPorClaveRef.current.get(clave);
  if (
    erroresCargaRef.current.has(clave) ||
    clavesBloqueadasTrasRestauracionRef.current.has(clave) ||
    !metadatos ||
    (claveBloqueadaPorConflicto(metadatos) && !esResolucionConflicto) ||
    !puedeMutarClaveMensual({ clave, turnoId, mes })
  ) return;

  const secuenciaLocal = (versionesGuardadoRef.current.get(clave) || 0) + 1;
  versionesGuardadoRef.current.set(clave, secuenciaLocal);
  colaGuardadoRef.current.set(clave, {
    clave,
    turnoId,
    mes,
    data: crearInstantanea(data),
    secuenciaLocal,
    esResolucionConflicto,
    revisionEsperadaResolucion
  });
  mesesConErrorGuardadoRef.current.delete(clave);
  if (!esResolucionConflicto) {
    actualizarMetadatosClave(clave, (actuales) =>
      marcarConcurrenciaPendiente(actuales)
    );
  }
  setEstadoGuardado("pending");
  procesarColaGuardadoRef.current?.();
}, [actualizarMetadatosClave, puedeMutarClaveMensual]);

const procesarColaGuardado = useCallback(async () => {
  if (!appMontadaRef.current) return;
  if (guardadoEnCursoRef.current) return;

  [...colaGuardadoRef.current.entries()].forEach(([clave, pendiente]) => {
    if (!puedeMutarClaveMensual({
      clave,
      turnoId: pendiente.turnoId,
      mes: pendiente.mes
    })) {
      colaGuardadoRef.current.delete(clave);
      mesesConErrorGuardadoRef.current.delete(clave);
    }
  });

  const siguiente = [...colaGuardadoRef.current.entries()].find(
    ([clave, pendiente]) => {
      const metadatos = metadatosPorClaveRef.current.get(clave);
      return (
      puedeMutarClaveMensual({
        clave,
        turnoId: pendiente.turnoId,
        mes: pendiente.mes
      }) &&
      !mesesConErrorGuardadoRef.current.has(clave) &&
      !erroresCargaRef.current.has(clave) &&
      (
        !claveBloqueadaPorConflicto(metadatos) ||
        pendiente.esResolucionConflicto === true
      )
      );
    }
  );

  if (!siguiente) {
    actualizarEstadoGuardadoDesdeCola();
    return;
  }

  const [clave, pendiente] = siguiente;
  const metadatosAlIniciar = metadatosPorClaveRef.current.get(clave);
  let revisionEsperada;
  try {
    revisionEsperada = pendiente.esResolucionConflicto
      ? String(pendiente.revisionEsperadaResolucion)
      : obtenerRevisionEsperada(metadatosAlIniciar);
    if (!/^\d+$/.test(revisionEsperada)) {
      throw new Error("La resolución no tiene una revisión remota válida.");
    }
  } catch (error) {
    colaGuardadoRef.current.set(clave, pendiente);
    mesesConErrorGuardadoRef.current.add(clave);
    actualizarMetadatosClave(clave, (actuales) =>
      pendiente.esResolucionConflicto
        ? aplicarErrorResolucionConflicto(actuales, error)
        : aplicarErrorConcurrencia(actuales, error)
    );
    actualizarEstadoGuardadoDesdeCola();
    return;
  }

  colaGuardadoRef.current.delete(clave);
  guardadoEnCursoRef.current = true;
  claveGuardadoEnCursoRef.current = clave;
  if (!pendiente.esResolucionConflicto) {
    actualizarMetadatosClave(clave, (actuales) =>
      marcarConcurrenciaGuardando(actuales)
    );
  }
  setEstadoGuardado("saving");

  let resultado;
  let error;
  try {
    resultado = await guardarMes(
      pendiente.turnoId,
      pendiente.mes,
      pendiente.data,
      revisionEsperada
    );
    if (!["guardado", "conflicto"].includes(resultado?.tipo)) {
      error = new Error("El servidor devolvió un resultado de guardado inválido.");
    }
  } catch (errorGuardado) {
    error =
      errorGuardado instanceof Error
        ? errorGuardado
        : new Error("No se pudo guardar el estado mensual.");
  } finally {
    guardadoEnCursoRef.current = false;
    claveGuardadoEnCursoRef.current = null;
  }

  if (!appMontadaRef.current) return;

  if (error) {
    const pendienteMasNuevo = colaGuardadoRef.current.get(clave);

    if (
      !pendienteMasNuevo ||
      pendienteMasNuevo.secuenciaLocal <= pendiente.secuenciaLocal
    ) {
      colaGuardadoRef.current.set(clave, pendiente);
    }
    mesesConErrorGuardadoRef.current.add(clave);
    actualizarMetadatosClave(clave, (actuales) =>
      pendiente.esResolucionConflicto
        ? aplicarErrorResolucionConflicto(actuales, error)
        : aplicarErrorConcurrencia(actuales, error)
    );
  } else if (resultado?.tipo === "conflicto") {
    const pendienteMasNuevo = colaGuardadoRef.current.get(clave);
    const estadoLocal =
      pendienteMasNuevo?.data ||
      estadoPorTurnoMesRef.current[clave] ||
      pendiente.data;
    clearTimeout(debouncesGuardadoRef.current.get(clave));
    debouncesGuardadoRef.current.delete(clave);
    colaGuardadoRef.current.delete(clave);
    mesesConErrorGuardadoRef.current.delete(clave);
    actualizarMetadatosClave(clave, (actuales) =>
      aplicarConflictoConcurrencia(actuales, resultado, estadoLocal)
    );
    setEstadoGuardado("conflict");
  } else if (resultado?.tipo === "guardado") {
    creacionesMensualesAutorizadasRef.current.delete(clave);
    const pendienteMasNuevo = colaGuardadoRef.current.get(clave);
    const hayPosterior = hayPendienteMasNuevo(pendiente, pendienteMasNuevo);
    actualizarMetadatosClave(clave, (actuales) =>
      aplicarExitoConcurrencia(actuales, resultado, {
        hayCambiosPosteriores: hayPosterior
      })
    );
    setEstadoGuardado(hayPosterior ? "pending" : "saved");
  }

  procesarColaGuardadoRef.current?.();
}, [
  actualizarEstadoGuardadoDesdeCola,
  actualizarMetadatosClave,
  guardarMes,
  puedeMutarClaveMensual
]);

useEffect(() => {
  procesarColaGuardadoRef.current = procesarColaGuardado;
}, [procesarColaGuardado]);

useEffect(() => {
  cargandoRef.current = cargando;
}, [cargando]);

useEffect(() => {
  if (cargando) return;

  Object.entries(estadoPorTurnoMes).forEach(([clave, data]) => {
    if (erroresCargaRef.current.has(clave)) return;
    if (clavesBloqueadasTrasRestauracionRef.current.has(clave)) {
      referenciasEstadoRef.current.set(clave, data);
      return;
    }
    if (claveBloqueadaPorConflicto(metadatosPorClaveRef.current.get(clave))) {
      referenciasEstadoRef.current.set(clave, data);
      actualizarMetadatosClave(clave, (actuales) =>
        actualizarEstadoLocalConflicto(actuales, data)
      );
      return;
    }
    if (mesesCargadosRef.current.delete(clave)) {
      referenciasEstadoRef.current.set(clave, data);
      return;
    }
    if (referenciasEstadoRef.current.get(clave) === data) return;

    referenciasEstadoRef.current.set(clave, data);

    const identidad = identidadesEstadoRef.current.get(clave);
    if (!identidad) return;
    if (!puedeMutarClaveMensual({ clave, ...identidad })) {
      referenciasEstadoRef.current.set(clave, data);
      return;
    }

    clearTimeout(debouncesGuardadoRef.current.get(clave));
    const timeout = setTimeout(() => {
      if (debouncesGuardadoRef.current.get(clave) !== timeout) return;

      debouncesGuardadoRef.current.delete(clave);

      encolarGuardado({ clave, ...identidad, data });
    }, 500);

    debouncesGuardadoRef.current.set(clave, timeout);
  });
}, [
  estadoPorTurnoMes,
  cargando,
  encolarGuardado,
  puedeMutarClaveMensual,
  actualizarMetadatosClave
]);

useEffect(() => {
  appMontadaRef.current = true;
  const debounces = debouncesGuardadoRef.current;
  return () => {
    appMontadaRef.current = false;
    cargaActualRef.current = {
      id: cargaActualRef.current.id + 1,
      clave: null
    };
    procesarColaGuardadoRef.current = null;
    debounces.forEach((timeout) => clearTimeout(timeout));
  };
}, []);

const setPlanillaEnfermeros = (nueva) => {
  setEstadoPorTurnoMes(prev => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
    const actual = prev[claveActiva] || crearEstadoMensualVacio();

    return {
      ...prev,
      [claveActiva]: {
        ...actual,
        planillas: {
          ...actual.planillas,
          enfermeros:
            typeof nueva === "function"
              ? nueva(actual.planillas.enfermeros)
              : nueva
        }
      }
    };
  });
};

const setPlanillaLicenciados = (nueva) => {
  setEstadoPorTurnoMes(prev => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
    const actual = prev[claveActiva] || crearEstadoMensualVacio();

    return {
      ...prev,
      [claveActiva]: {
        ...actual,
        planillas: {
          ...actual.planillas,
          licenciados:
            typeof nueva === "function"
              ? nueva(actual.planillas.licenciados)
              : nueva
        }
      }
    };
  });
};

const actualizarPersona = (personaAnterior, personaNueva) => {
  setEstadoPorTurnoMes((prev) => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
    const actual = prev[claveActiva] || crearEstadoMensualVacio();
    const personaId = String(personaAnterior?.id ?? "").trim();
    const coincidencias = actual.personal?.filter(
      (persona) => String(persona?.id ?? "").trim() === personaId
    ) || [];
    if (coincidencias.length !== 1) return prev;
    if (
      existeFuncionarioDuplicado(
        actual.personal,
        personaNueva?.funcionario,
        personaId
      )
    ) return prev;
    const indicePersona = actual.personal.findIndex(
      (persona) => String(persona?.id ?? "").trim() === personaId
    );

    if (indicePersona === -1) return prev;

    const personalActualizado = actual.personal.map((persona, indice) =>
      indice === indicePersona ? personaNueva : persona
    );
    let nuevoMes = { ...actual, personal: personalActualizado };

    if (personaAnterior.categoria !== personaNueva.categoria) {
      nuevoMes = limpiarReferenciasDeCategoria(
        nuevoMes,
        personaAnterior.categoria,
        personaAnterior
      );
    }

    return { ...prev, [claveActiva]: nuevoMes };
  });
};

const renombrarPersona = (persona, nombreNuevo) => {
  setEstadoPorTurnoMes((prev) => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
    const actual = prev[claveActiva] || crearEstadoMensualVacio();
    const personaId = String(persona?.id ?? "").trim();
    const coincidencias = actual.personal?.filter(
      (item) => String(item?.id ?? "").trim() === personaId
    ) || [];
    if (!personaId || coincidencias.length !== 1) return prev;

    return {
      ...prev,
      [claveActiva]: renombrarPersonaEnEstado(actual, personaId, nombreNuevo)
    };
  });
};

const eliminarPersona = (persona) => {
  setEstadoPorTurnoMes((prev) => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
    const actual = prev[claveActiva] || crearEstadoMensualVacio();
    const personaId = String(persona?.id ?? "").trim();
    const coincidencias = actual.personal?.filter(
      (item) => String(item?.id ?? "").trim() === personaId
    ) || [];
    if (coincidencias.length !== 1) return prev;
    const [personaActual] = coincidencias;

    return {
      ...prev,
      [claveActiva]: limpiarReferenciasDePersona(actual, personaActual)
    };
  });
};

const limpiarPersonal = () => {
  setEstadoPorTurnoMes((prev) => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
    const actual = prev[claveActiva] || crearEstadoMensualVacio();
    if (obtenerIdsPersonalDuplicados(actual.personal).size > 0) return prev;
    const nuevoMes = (actual.personal || []).reduce(
      (mes, persona) => limpiarReferenciasDePersona(mes, persona),
      actual
    );

    return { ...prev, [claveActiva]: nuevoMes };
  });
};

const validarPersonasDisponiblesEnOtrosTurnos = useCallback(async (personas) => {
  if (!turnoActivo || !claveActiva) {
    return { cancelada: true };
  }

  const turnoValidado = turnoActivo;
  const mesValidado = mesActivo;
  const claveValidada = claveActiva;
  const cargaIdValidada = cargaActualRef.current.id;
  try {
    const estadosLeidos = await obtenerEstadosDeOtrosTurnos({
      turnoActual: turnoValidado,
      mes: mesValidado,
      turnosIds: Object.keys(TURNOS),
      estadosPorTurnoMes: estadoPorTurnoMes,
      crearClave: crearClaveTurnoMes,
      cargarEstado: cargarEstadoTurnoMesConRevision
    });

    if (
      cargaActualRef.current.id !== cargaIdValidada ||
      cargaActualRef.current.clave !== claveValidada
    ) {
      return { cancelada: true };
    }

    const conflicto = personas
      .map((personaCandidata) => ({
        personaCandidata,
        resultado: buscarPersonaEnEstadosDeTurnos({
          personaCandidata,
          turnoActual: turnoValidado,
          estadosPorTurno: estadosLeidos
        })
      }))
      .find(({ resultado }) => resultado.existeEnOtroTurno);

    const resultado = conflicto?.resultado || {
      existeEnOtroTurno: false,
      turnoId: null,
      persona: null
    };

    return {
      ...resultado,
      cancelada: false,
      personaValidada: conflicto?.personaCandidata || null,
      turnoNombre: resultado.turnoId
        ? TURNOS[resultado.turnoId]?.nombre || resultado.turnoId
        : null
    };
  } catch (error) {
    console.error("No se pudo verificar la exclusividad de la persona por turno.", error);
    throw error;
  }
}, [claveActiva, estadoPorTurnoMes, mesActivo, turnoActivo]);

const validarPersonaDisponibleEnOtrosTurnos = useCallback(
  (persona) => validarPersonasDisponiblesEnOtrosTurnos([persona]),
  [validarPersonasDisponiblesEnOtrosTurnos]
);

const cargarPersonalDeOtrosTurnos = useCallback(async ({ categoria } = {}) => {
  if (!turnoActivo || !mesActivo) return [];
  const turnoEsperado = turnoActivo;
  const mesEsperado = mesActivo;
  const estadosLeidos = await obtenerEstadosDeOtrosTurnos({
    turnoActual: turnoEsperado,
    mes: mesEsperado,
    turnosIds: Object.keys(TURNOS),
    estadosPorTurnoMes: estadoPorTurnoMesRef.current,
    crearClave: crearClaveTurnoMes,
    cargarEstado: cargarEstadoTurnoMesConRevision
  });
  if (turnoActivo !== turnoEsperado || mesActivo !== mesEsperado) return [];

  return Object.entries(estadosLeidos).flatMap(([turnoId, estado]) =>
    (Array.isArray(estado?.personal) ? estado.personal : [])
      .filter((persona) => persona?.categoria === categoria)
      .map((persona) => ({
        persona,
        turnoOrigen: turnoId,
        turnoNombre: TURNOS[turnoId]?.nombre || turnoId
      }))
  );
}, [mesActivo, turnoActivo]);


useEffect(() => {
  if (!turnoActivo) {
    cargaActualRef.current = {
      id: cargaActualRef.current.id + 1,
      clave: null
    };
    return;
  }

  const cargar = async () => {
    const claveCarga = crearClaveTurnoMes(turnoActivo, mesActivo);
    const cargaId = cargaActualRef.current.id + 1;
    cargaActualRef.current = { id: cargaId, clave: claveCarga };
    if (
      claveBloqueadaPorConflicto(
        metadatosPorClaveRef.current.get(claveCarga)
      )
    ) {
      cargandoRef.current = false;
      setCargando(false);
      setEstadoGuardado("conflict");
      return;
    }
    cargandoRef.current = true;
    setCargando(true); // 👈 empieza carga
    setEstadoGuardado("loading");
    setErroresCargaPorClave((prev) => {
      if (!prev[claveCarga]) return prev;
      const siguiente = { ...prev };
      delete siguiente[claveCarga];
      return siguiente;
    });

    let resultado;
    let error;

    try {
      resultado = await cargarEstadoTurnoMesConRevision(turnoActivo, mesActivo);
    } catch (errorCarga) {
      error = errorCarga;
    }

    if (!esCargaVigente(
      { id: cargaId, clave: claveCarga },
      cargaActualRef.current
    )) return;

    const clasificacion = clasificarResultadoCarga({ error, resultado });

    if (clasificacion.tipo === "error") {
      console.error("No se pudo cargar el estado del turno y mes.", error);
      erroresCargaRef.current.add(claveCarga);
      setErroresCargaPorClave((prev) => ({
        ...prev,
        [claveCarga]: {
          mensaje: "No se pudo cargar este turno y mes. Tus datos no fueron reemplazados. Reintentá la carga."
        }
      }));
      cargandoRef.current = false;
      setCargando(false);
      setEstadoGuardado("error");
      procesarColaGuardadoRef.current?.();
      return;
    }

    if (clasificacion.tipo === "existente") {
      creacionesMensualesAutorizadasRef.current.delete(claveCarga);
      const estadoPrevio = estadoPorTurnoMesRef.current[claveCarga];
      const hayPendientes =
        claveBloqueadaPorConflicto(
          metadatosPorClaveRef.current.get(claveCarga)
        ) ||
        hayCambiosLocalesPendientes({
        clave: claveCarga,
        estadoPrevio,
        referenciaConocida: referenciasEstadoRef.current.get(claveCarga),
        cola: colaGuardadoRef.current,
        debounces: debouncesGuardadoRef.current,
        erroresGuardado: mesesConErrorGuardadoRef.current,
        claveGuardadoEnCurso: claveGuardadoEnCursoRef.current
        });

      if (hayPendientes) {
        erroresCargaRef.current.add(claveCarga);
        setErroresCargaPorClave((prev) => ({
          ...prev,
          [claveCarga]: {
            mensaje: "Se recuperó la conexión, pero hay cambios locales pendientes. No se reemplazaron ni guardaron datos automáticamente."
          }
        }));
        cargandoRef.current = false;
        setCargando(false);
        setEstadoGuardado("error");
        procesarColaGuardadoRef.current?.();
        return;
      }

      erroresCargaRef.current.delete(claveCarga);
      actualizarMetadatosClave(
        claveCarga,
        crearMetadatosConcurrenciaDesdeCarga(resultado)
      );
      mesesCargadosRef.current.add(claveCarga);
      referenciasEstadoRef.current.set(claveCarga, clasificacion.estado);
      setEstadoPorTurnoMes(prev => {
        const siguiente = {
          ...prev,
          [claveCarga]: clasificacion.estado
        };
        estadoPorTurnoMesRef.current = siguiente;
        return siguiente;
      });
    } else {
      creacionesMensualesAutorizadasRef.current.delete(claveCarga);
      erroresCargaRef.current.delete(claveCarga);
      actualizarMetadatosClave(
        claveCarga,
        crearMetadatosConcurrenciaDesdeCarga(resultado)
      );
    }

    cargandoRef.current = false;
    setCargando(false); // 👈 termina carga
    actualizarEstadoGuardadoDesdeCola();
    procesarColaGuardadoRef.current?.();
  };

  cargar();
}, [
  intentoCarga,
  mesActivo,
  turnoActivo,
  actualizarEstadoGuardadoDesdeCola,
  actualizarMetadatosClave
]);

const reintentarCarga = () => {
  if (!claveActiva) return;
  cargaActualRef.current = {
    id: cargaActualRef.current.id + 1,
    clave: claveActiva
  };
  cargandoRef.current = true;
  setCargando(true);
  setIntentoCarga((actual) => actual + 1);
};

const actualizarResolucionClave = (clave, estado, error = "") => {
  setResolucionPorClave((prev) => ({
    ...prev,
    [clave]: { estado, error }
  }));
};

const limpiarPendientesClave = useCallback((clave) => {
  clearTimeout(debouncesGuardadoRef.current.get(clave));
  debouncesGuardadoRef.current.delete(clave);
  colaGuardadoRef.current.delete(clave);
  mesesConErrorGuardadoRef.current.delete(clave);
}, []);

const actualizarBloqueoTrasRestauracion = useCallback((clave, bloqueada) => {
  const siguientes = new Set(clavesBloqueadasTrasRestauracionRef.current);
  if (bloqueada) {
    siguientes.add(clave);
  } else {
    siguientes.delete(clave);
  }
  clavesBloqueadasTrasRestauracionRef.current = siguientes;
  setClavesBloqueadasTrasRestauracion(siguientes);
}, []);

const adoptarCargaServidorClave = useCallback((clave, resultado) => {
  const { carga, estado: estadoServidor } = seleccionarEstadoCargaVersionada(
    resultado,
    crearEstadoMensualVacio
  );
  limpiarPendientesClave(clave);
  erroresCargaRef.current.delete(clave);
  actualizarBloqueoTrasRestauracion(clave, false);
  setErroresCargaPorClave((prev) => {
    if (!prev[clave]) return prev;
    const siguiente = { ...prev };
    delete siguiente[clave];
    return siguiente;
  });
  referenciasEstadoRef.current.set(clave, estadoServidor);
  mesesCargadosRef.current.add(clave);
  setEstadoPorTurnoMes((prev) => {
    const siguiente = { ...prev, [clave]: estadoServidor };
    estadoPorTurnoMesRef.current = siguiente;
    return siguiente;
  });
  actualizarMetadatosClave(clave, prepararMetadatosUsarServidor(carga));
  setEstadoGuardado("saved");
  return estadoServidor;
}, [
  actualizarBloqueoTrasRestauracion,
  actualizarMetadatosClave,
  limpiarPendientesClave
]);

const obtenerDisponibilidadRestauracion = useCallback(({ turno, mes }) => {
  const clave = crearClaveTurnoMes(turno, mes);
  const coincideContexto =
    turno === turnoActivo &&
    mes === mesActivo &&
    clave === claveActiva;
  const estadoPrevio = estadoPorTurnoMesRef.current[clave];
  const hayCambiosLocales = hayCambiosLocalesPendientes({
    clave,
    estadoPrevio,
    referenciaConocida: referenciasEstadoRef.current.get(clave),
    cola: colaGuardadoRef.current,
    debounces: debouncesGuardadoRef.current,
    erroresGuardado: mesesConErrorGuardadoRef.current,
    claveGuardadoEnCurso: claveGuardadoEnCursoRef.current
  });
  return evaluarDisponibilidadRestauracion({
    mes,
    esSupervision: esPerfilSupervision(perfil),
    coincideContexto,
    metadatos: metadatosPorClaveRef.current.get(clave),
    estadoCargado:
      !cargandoRef.current &&
      !erroresCargaRef.current.has(clave) &&
      Boolean(estadoPrevio),
    hayCambiosLocales,
    restauracionEnCurso: Boolean(restauracionHistorialEnCursoRef.current),
    bloqueadaTrasRestauracion:
      clavesBloqueadasTrasRestauracionRef.current.has(clave)
  });
}, [claveActiva, mesActivo, perfil, turnoActivo]);

const cargarEstadoOperativoHistorial = useCallback(async ({ turno, mes }) => {
  const disponibilidad = obtenerDisponibilidadRestauracion({ turno, mes });
  if (!disponibilidad.permitida) {
    throw new Error(disponibilidad.mensaje);
  }
  return cargarEstadoTurnoMesConRevision(turno, mes);
}, [obtenerDisponibilidadRestauracion]);

const iniciarRestauracionHistorial = useCallback(({ turno, mes }) => {
  const disponibilidad = obtenerDisponibilidadRestauracion({ turno, mes });
  if (!disponibilidad.permitida) return disponibilidad;
  const clave = crearClaveTurnoMes(turno, mes);
  restauracionHistorialEnCursoRef.current = {
    clave,
    sesionId: sesionActivaRef.current
  };
  setRestauracionHistorialEnCurso(clave);
  return { permitida: true };
}, [obtenerDisponibilidadRestauracion]);

const finalizarRestauracionHistorial = useCallback(({ turno, mes }) => {
  const clave = crearClaveTurnoMes(turno, mes);
  if (restauracionHistorialEnCursoRef.current?.clave !== clave) return;
  restauracionHistorialEnCursoRef.current = null;
  setRestauracionHistorialEnCurso(null);
}, []);

const adoptarRestauracionHistorial = useCallback(async ({
  turno,
  mes,
  resultadoRestauracion
}) => {
  const clave = crearClaveTurnoMes(turno, mes);
  const inicio = restauracionHistorialEnCursoRef.current;
  try {
    const cargaServidor = await cargarEstadoTurnoMesConRevision(turno, mes);
    const cargaValidada = validarRespuestaRestaurada({
      resultadoRestauracion,
      cargaServidor,
      turnoEsperado: turno,
      mesEsperado: mes
    });
    const contextoActual = contextoActivoRef.current;
    if (!validarContextoAdopcionRestauracion({
      inicio,
      clave,
      sesionActual: sesionActivaRef.current,
      turnoActual: contextoActual.turno,
      mesActual: contextoActual.mes,
      turnoEsperado: turno,
      mesEsperado: mes
    })) {
      throw new Error("La sesión o el contexto activo cambió durante la restauración.");
    }
    adoptarCargaServidorClave(clave, cargaValidada);
    finalizarRestauracionHistorial({ turno, mes });
    return { tipo: "adoptado", revision: cargaValidada.revision };
  } catch {
    actualizarBloqueoTrasRestauracion(
      clave,
      debeMantenerBloqueoRestauracion({
        rpcConfirmada: true,
        adopcionVerificada: false
      })
    );
    limpiarPendientesClave(clave);
    erroresCargaRef.current.add(clave);
    actualizarMetadatosClave(clave, (actuales) =>
      aplicarErrorConcurrencia(
        actuales,
        new Error("La restauración se completó, pero falta recargar el estado desde el servidor.")
      )
    );
    if (restauracionHistorialEnCursoRef.current?.clave === clave) {
      restauracionHistorialEnCursoRef.current = null;
      setRestauracionHistorialEnCurso(null);
    }
    setEstadoGuardado("error");
    return { tipo: "error_recarga" };
  }
}, [
  adoptarCargaServidorClave,
  actualizarBloqueoTrasRestauracion,
  actualizarMetadatosClave,
  finalizarRestauracionHistorial,
  limpiarPendientesClave
]);

const descargarCopiaConflicto = (clave) => {
  const contexto = interpretarClaveConflicto(clave);
  const conflicto = metadatosPorClaveRef.current.get(clave)?.conflicto;
  if (!contexto || !conflicto) return;

  actualizarResolucionClave(clave, "descargando");
  try {
    const creadoEn = new Date().toISOString();
    const respaldo = crearRespaldoConflicto({
      ...contexto,
      conflicto,
      creadoEn
    });
    const blob = new Blob([JSON.stringify(respaldo, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = crearNombreRespaldoConflicto({ ...contexto, creadoEn });
    enlace.click();
    URL.revokeObjectURL(url);
    actualizarResolucionClave(clave, "inactivo");
  } catch (error) {
    actualizarResolucionClave(
      clave,
      "error",
      error instanceof Error ? error.message : "No se pudo crear el respaldo."
    );
  }
};

const usarVersionServidor = async (clave) => {
  const contexto = interpretarClaveConflicto(clave);
  if (
    !contexto ||
    !puedeEditarTurno(perfil, contexto.turnoId) ||
    !window.confirm(
      "Se descartarán de la aplicación los cambios locales no guardados de este turno y mes. Descargá tu copia antes de continuar si necesitás conservarla."
    )
  ) return;

  actualizarResolucionClave(clave, "cargando_servidor");
  try {
    const resultado = await cargarEstadoTurnoMesConRevision(
      contexto.turnoId,
      contexto.mes
    );
    adoptarCargaServidorClave(clave, resultado);
    actualizarResolucionClave(clave, "inactivo");
  } catch (error) {
    actualizarResolucionClave(
      clave,
      "error",
      error instanceof Error
        ? error.message
        : "No se pudo cargar la versión más reciente."
    );
  }
};

const conservarVersionLocal = (clave) => {
  const contexto = interpretarClaveConflicto(clave);
  if (
    !contexto ||
    !puedeEditarTurno(perfil, contexto.turnoId) ||
    !window.confirm(
      "Tu versión local reemplazará el estado mensual completo guardado actualmente. Si el servidor volvió a cambiar, aparecerá un nuevo conflicto. ¿Continuar?"
    )
  ) return;

  try {
    const preparacion = prepararResolucionConservarLocal(
      metadatosPorClaveRef.current.get(clave)
    );
    limpiarPendientesClave(clave);
    actualizarMetadatosClave(clave, preparacion.metadatos);
    referenciasEstadoRef.current.set(clave, preparacion.estadoLocal);
    setEstadoPorTurnoMes((prev) => {
      const siguiente = { ...prev, [clave]: preparacion.estadoLocal };
      estadoPorTurnoMesRef.current = siguiente;
      return siguiente;
    });
    actualizarResolucionClave(clave, "guardando_local");
    encolarGuardado({
      clave,
      turnoId: contexto.turnoId,
      mes: contexto.mes,
      data: preparacion.estadoLocal,
      esResolucionConflicto: true,
      revisionEsperadaResolucion: preparacion.revisionEsperada
    });
  } catch (error) {
    actualizarResolucionClave(
      clave,
      "error",
      error instanceof Error ? error.message : "No se pudo preparar el guardado."
    );
  }
};

useEffect(() => {
  setResolucionPorClave((prev) => {
    let cambio = false;
    const siguiente = { ...prev };
    Object.entries(prev).forEach(([clave, resolucion]) => {
      if (resolucion.estado !== "guardando_local") return;
      const metadatos = metadatosPorClave[clave];
      if (metadatos?.estado === "guardado") {
        siguiente[clave] = { estado: "inactivo", error: "" };
        cambio = true;
      } else if (metadatos?.estado === "conflicto") {
        siguiente[clave] = {
          estado: "error",
          error:
            metadatos.error ||
            "El servidor volvió a cambiar. Revisá el nuevo conflicto."
        };
        cambio = true;
      } else if (metadatos?.estado === "error") {
        siguiente[clave] = {
          estado: "error",
          error: metadatos.error || "No se pudo guardar la copia local."
        };
        cambio = true;
      }
    });
    return cambio ? siguiente : prev;
  });
}, [metadatosPorClave]);

const hoy = new Date();

const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

const mesSiguiente = obtenerMesSiguiente(mesActual);
const mesesNavegables = useMemo(() => crearListaMesesNavegables({
  mesesExistentes,
  mesReferencia: mesActual
}), [mesActual, mesesExistentes]);

const clasificacionPeriodoActivo = clasificarPeriodoMes({ mes: mesActivo });
const mesHistoricoCerradoActivo = esMesHistoricoCerrado({ mes: mesActivo });
const periodoActivoFueraVentana =
  clasificacionPeriodoActivo === "historico_cerrado" ||
  clasificacionPeriodoActivo === "futuro_fuera_de_ventana";

const seleccionarTurno = (turnoId) => {
  if (!Object.hasOwn(TURNOS, turnoId)) return;

  setDataPDFEnf({ asignaciones: [], libres: [] });
  setDataPDFLic({ asignaciones: [], libres: [] });
  setCargando(true);
  setPreparacionMes(null);
  cargandoRef.current = true;
  setTurnoActivo(turnoId);
};

const abrirSupervision = () => {
  if (!esPerfilSupervision(perfil)) return;
  setVistaInicial("supervision");
};

const volverDesdeSupervision = () => {
  setVistaInicial("selector");
};

const cambiarTurno = () => {
  setPreparacionMes(null);
  cargaActualRef.current = {
    id: cargaActualRef.current.id + 1,
    clave: null
  };
  cargandoRef.current = false;
  setCargando(false);
  setDataPDFEnf({ asignaciones: [], libres: [] });
  setDataPDFLic({ asignaciones: [], libres: [] });
  setTurnoActivo(null);
};

const cerrarSesion = async () => {
  const cantidadConflictos = [...metadatosPorClaveRef.current.values()].filter(
    (metadatos) => Boolean(metadatos.conflicto)
  ).length;
  const cambiosSinProgramar = Object.entries(estadoPorTurnoMes).some(
    ([clave, data]) =>
      !erroresCargaRef.current.has(clave) &&
      !mesesCargadosRef.current.has(clave) &&
      referenciasEstadoRef.current.get(clave) !== data
  );
  const evaluacion = evaluarCierreSesion({
    guardadoEnCurso: guardadoEnCursoRef.current,
    cantidadDebounces: debouncesGuardadoRef.current.size,
    cantidadEnCola: colaGuardadoRef.current.size,
    cantidadErroresGuardado:
      mesesConErrorGuardadoRef.current.size + cantidadConflictos,
    cambiosSinProgramar
  });

  if (!evaluacion.permitido) {
    setErrorCierreSesion(evaluacion.mensaje);
    return;
  }

  const solicitud = ejecutarSolicitudProtegida(
    bloqueoCierreSesionRef.current,
    onSignOut
  );
  if (!solicitud) return;

  setCerrandoSesion(true);
  setErrorCierreSesion("");
  try {
    await solicitud;
  } catch {
    setErrorCierreSesion("No se pudo cerrar sesión. Intentá nuevamente.");
    setCerrandoSesion(false);
  }
};

const controlSesion = (
  <ControlSesion
    etiqueta={obtenerEtiquetaPerfil(perfil)}
    cerrando={cerrandoSesion}
    error={errorCierreSesion}
    onCerrar={cerrarSesion}
  />
);

const conflictosPendientes = listarConflictosPendientes(
  metadatosPorClave,
  TURNOS
);

const irAlConflicto = (clave) => {
  const contexto = interpretarClaveConflicto(clave);
  if (!contexto) return;
  cargaActualRef.current = {
    id: cargaActualRef.current.id + 1,
    clave
  };
  cargandoRef.current = false;
  setCargando(false);
  setTurnoActivo(contexto.turnoId);
  setMesActivo(contexto.mes);
};

const avisoGlobalConflictos = conflictosPendientes.length > 0 && (
  <aside className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm">
    <p className="font-bold text-red-800">
      Hay {conflictosPendientes.length} conflicto
      {conflictosPendientes.length === 1 ? "" : "s"} de edición pendiente
      {conflictosPendientes.length === 1 ? "" : "s"}.
    </p>
    <ul className="mt-2 space-y-2">
      {conflictosPendientes.map((item) => (
        <li key={item.clave} className="flex flex-wrap items-center justify-between gap-2">
          <span>{item.turnoNombre} — {item.mes}</span>
          <button
            type="button"
            onClick={() => irAlConflicto(item.clave)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium text-red-700"
          >
            Ir al conflicto
          </button>
        </li>
      ))}
    </ul>
  </aside>
);

if (!turnoActivo) {
  if (vistaInicial === "supervision" && esPerfilSupervision(perfil)) {
    return (
      <VistaSupervision
        turnoActivo={turnoActivo}
        mesActivo={mesActivo}
        estadoActivo={null}
        onVolver={volverDesdeSupervision}
        controlSesion={controlSesion}
      />
    );
  }
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {controlSesion}
      <div className="mx-auto mt-4 max-w-3xl">{avisoGlobalConflictos}</div>
      <SelectorTurno
        turnos={TURNOS}
        onSeleccionar={seleccionarTurno}
        mostrarSupervision={esPerfilSupervision(perfil)}
        onSeleccionarSupervision={abrirSupervision}
      />
    </div>
  );
}

if (cargando) {
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {controlSesion}
      <p className="mt-6 text-slate-600">Cargando datos...</p>
    </div>
  );
}

const errorCargaActivo = claveActiva ? erroresCargaPorClave[claveActiva] : null;
if (errorCargaActivo) {
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {controlSesion}
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-800">Error de carga</h1>
        <p className="mt-2 text-sm text-red-700" role="alert">
          {errorCargaActivo.mensaje}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reintentarCarga}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={cambiarTurno}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cambiar turno
          </button>
        </div>
      </div>
    </div>
  );
}



/*console.log("PLANILLA LIC:", planillaLicenciados);
console.log("SEMANA LIC:", planillaLicenciados?.semana1);
console.log("🔁 TAB ACTUAL:", tabCalendario);*/

const metadatosActivos = claveActiva ? metadatosPorClave[claveActiva] : null;
const mesActivoTieneInformacion = Boolean(
  metadatosActivos?.existeRemoto === true ||
  metadatosActivos?.origen === "historico" ||
  creacionesMensualesAutorizadasRef.current.has(claveActiva)
);
const mesActivoSinInformacion = !mesActivoTieneInformacion;
const resolviendoConflictoActivo =
  resolucionPorClave[claveActiva]?.estado === "guardando_local";
const modoSoloLecturaEfectiva =
  periodoActivoFueraVentana ||
  modoSoloLectura ||
  resolviendoConflictoActivo ||
  restauracionHistorialEnCurso === claveActiva ||
  clavesBloqueadasTrasRestauracion.has(claveActiva);
const estadoGuardadoVisible = normalizarEstadoGuardadoVisible(
  metadatosActivos?.estado,
  estadoGuardado
);
const textoEstadoGuardado = {
  loading: "Cargando...",
  pending: "Cambios pendientes",
  saving: "Guardando...",
  saved: "Guardado",
  error: "Error al guardar",
  conflict: "Conflicto de edición"
}[estadoGuardadoVisible];
const destinoActivoPreparacion = clasificarEstadoMesDestino({
  existeRemoto: metadatosActivos?.existeRemoto === true,
  estado: mesData
});
const contenidoDestinoPresentable = formatearContenidoMes(
  destinoActivoPreparacion.contenido
);

const hayPendientesEnClave = (clave) => {
  const estadoPrevio = estadoPorTurnoMesRef.current[clave];
  return hayCambiosLocalesPendientes({
    clave,
    estadoPrevio,
    referenciaConocida: referenciasEstadoRef.current.get(clave),
    cola: colaGuardadoRef.current,
    debounces: debouncesGuardadoRef.current,
    erroresGuardado: mesesConErrorGuardadoRef.current,
    claveGuardadoEnCurso: claveGuardadoEnCursoRef.current
  });
};

const abrirReinicioMes = () => {
  const metadatos = metadatosPorClaveRef.current.get(claveActiva);
  const estadoEsperado = estadoPorTurnoMesRef.current[claveActiva];
  if (
    !claveActiva ||
    destinoActivoPreparacion.permitido ||
    !puedeEditarActivo ||
    modoSoloLecturaEfectiva ||
    cargandoRef.current ||
    erroresCargaRef.current.has(claveActiva) ||
    metadatos?.conflicto ||
    clavesBloqueadasTrasRestauracionRef.current.has(claveActiva) ||
    hayPendientesEnClave(claveActiva) ||
    !String(metadatos?.revisionConfirmada ?? "")
  ) return;

  setReinicioMes({
    turnoId: turnoActivo,
    mesActivo,
    clave: claveActiva,
    revision: String(metadatos.revisionConfirmada),
    estadoEsperado,
    texto: "",
    error: ""
  });
};

const confirmarReinicioMes = () => {
  if (!reinicioMes || reinicioMes.texto.trim() !== "REINICIAR") return;
  const metadatos = metadatosPorClaveRef.current.get(reinicioMes.clave);
  const estadoActual = estadoPorTurnoMesRef.current[reinicioMes.clave];
  const contextoValido =
    reinicioMes.turnoId === turnoActivo &&
    reinicioMes.mesActivo === mesActivo &&
    reinicioMes.clave === claveActiva &&
    reinicioMes.revision === String(metadatos?.revisionConfirmada ?? "") &&
    reinicioMes.estadoEsperado === estadoActual &&
    puedeMutarClaveMensual({
      clave: reinicioMes.clave,
      turnoId: reinicioMes.turnoId,
      mes: reinicioMes.mesActivo
    }) &&
    !cargandoRef.current &&
    !erroresCargaRef.current.has(claveActiva) &&
    !metadatos?.conflicto &&
    !clavesBloqueadasTrasRestauracionRef.current.has(claveActiva) &&
    !hayPendientesEnClave(claveActiva) &&
    !clasificarEstadoMesDestino({
      existeRemoto: metadatos?.existeRemoto === true,
      estado: estadoActual
    }).permitido;

  if (!contextoValido) {
    setReinicioMes((actual) => actual
      ? {
          ...actual,
          error: "El estado del mes cambió mientras confirmabas el reinicio. Revisá nuevamente."
        }
      : actual);
    return;
  }

  const claveEsperada = reinicioMes.clave;
  const estadoEsperado = reinicioMes.estadoEsperado;
  setEstadoPorTurnoMes((prev) => {
    if (prev[claveEsperada] !== estadoEsperado) return prev;
    return reiniciarMesEnEstado({
      estadoPorTurnoMes: prev,
      clave: claveEsperada,
      crearEstadoVacio: crearEstadoMensualVacio
    });
  });
  setReinicioMes(null);
  setPreparacionMes(null);
  setEstadoGuardado("pending");
};

const iniciarPreparacionMes = async () => {
  const mesDestino = mesActivo;
  const mesOrigen = obtenerMesAnterior(mesDestino);
  const turnoId = turnoActivo;
  const claveDestino = claveActiva;
  const metadatosDestino = metadatosPorClaveRef.current.get(claveDestino);
  const revisionDestino = String(metadatosDestino?.revisionConfirmada ?? "");
  const contexto = {
    turnoId,
    mesOrigen,
    mesDestino,
    revisionDestino,
    cargaId: cargaActualRef.current.id
  };
  const contextoSigueVigente = () =>
    cargaActualRef.current.id === contexto.cargaId &&
    cargaActualRef.current.clave === claveDestino &&
    String(
      metadatosPorClaveRef.current.get(claveDestino)?.revisionConfirmada ?? ""
    ) === revisionDestino;
  if (
    mesDestino !== mesSiguiente ||
    !puedeEditarActivo ||
    modoSoloLecturaEfectiva ||
    cargandoRef.current ||
    erroresCargaRef.current.has(claveDestino) ||
    metadatosDestino?.conflicto ||
    clavesBloqueadasTrasRestauracionRef.current.has(claveDestino) ||
    !revisionDestino ||
    hayPendientesEnClave(claveDestino)
  ) {
    alert("El mes destino debe estar cargado, estable y sin guardados pendientes.");
    return;
  }
  const claveOrigen = crearClaveTurnoMes(turnoId, mesOrigen);
  if (hayPendientesEnClave(claveOrigen)) {
    alert("El mes origen todavía tiene cambios locales pendientes de guardar.");
    return;
  }
  const destinoActual =
    estadoPorTurnoMesRef.current[claveDestino] || crearEstadoMensualVacio();
  const clasificacion = clasificarEstadoMesDestino({
    existeRemoto: metadatosDestino?.existeRemoto === true,
    estado: destinoActual
  });
  if (!clasificacion.permitido) {
    alert(
      `El mes destino ya contiene información: ${clasificacion.contenido.join(", ")}.`
    );
    return;
  }

  setPreparacionMes({ estado: "cargando", contexto, error: "" });
  let origen;
  try {
    origen = await cargarEstadoTurnoMesConRevision(turnoId, mesOrigen);
  } catch {
    if (!contextoSigueVigente()) return;
    setPreparacionMes({
      estado: "error",
      contexto,
      error: "No se pudo cargar el mes origen. Intentá nuevamente."
    });
    return;
  }
  if (!contextoSigueVigente()) return;
  if (hayPendientesEnClave(claveOrigen)) {
    setPreparacionMes({
      estado: "error",
      contexto,
      error: "El mes origen recibió cambios mientras se preparaba la vista previa."
    });
    return;
  }
  const metadatosActuales = metadatosPorClaveRef.current.get(claveDestino);
  const contextoActual = {
    turnoId: turnoActivo,
    mesOrigen: obtenerMesAnterior(mesActivo),
    mesDestino: mesActivo,
    revisionDestino: String(metadatosActuales?.revisionConfirmada ?? "")
  };
  if (!validarContextoPreparacion(contexto, contextoActual)) {
    setPreparacionMes(null);
    return;
  }
  if (!origen?.existe || !origen.estado) {
    setPreparacionMes({
      estado: "error",
      contexto,
      error: "No existe información en el mes origen."
    });
    return;
  }

  let estadosDestinoPorTurno;
  let padronOrigen;
  try {
    const [destinos, otrosOrigen] = await Promise.all([
      obtenerEstadosDeOtrosTurnos({
        turnoActual: turnoId,
        mes: mesDestino,
        turnosIds: Object.keys(TURNOS),
        estadosPorTurnoMes: estadoPorTurnoMesRef.current,
        crearClave: crearClaveTurnoMes,
        cargarEstado: cargarEstadoTurnoMesConRevision
      }),
      obtenerEstadosDeOtrosTurnos({
        turnoActual: turnoId,
        mes: mesOrigen,
        turnosIds: Object.keys(TURNOS),
        estadosPorTurnoMes: estadoPorTurnoMesRef.current,
        crearClave: crearClaveTurnoMes,
        cargarEstado: cargarEstadoTurnoMesConRevision
      })
    ]);
    estadosDestinoPorTurno = destinos;
    padronOrigen = await cargarPadronPersonalEfectivoMes({
      mes: mesOrigen,
      estadosPorTurno: { ...otrosOrigen, [turnoId]: origen.estado }
    });
  } catch {
    if (!contextoSigueVigente()) return;
    setPreparacionMes({
      estado: "error",
      contexto,
      error: "No se pudo validar el padrón transversal del mes origen."
    });
    return;
  }
  if (!contextoSigueVigente()) return;
  if (!padronOrigen?.ok) {
    setPreparacionMes({
      estado: "error",
      contexto,
      error: "El padrón del mes origen contiene identidades o vigencias que requieren revisión."
    });
    return;
  }
  const reconciliacionPersonal = reconciliarPersonalPreparacionMes({
    estadoOrigen: origen.estado,
    turnoDestino: turnoId,
    estadosDestinoPorTurno
  });
  if (!reconciliacionPersonal.ok) {
    setPreparacionMes({
      estado: "error",
      contexto,
      error: reconciliacionPersonal.mensaje
    });
    return;
  }

  const analisis = analizarPreparacionMesNuevo({
    turnoId,
    mesOrigen,
    mesDestino,
    estadoOrigen: origen.estado,
    personalCanonicoOrigen: padronOrigen.personas.map((entrada) => entrada.persona),
    estadoDestino: destinoActual,
    existeDestinoRemoto: metadatosDestino?.existeRemoto === true,
    revisionDestino
  });
  if (!analisis.ok) {
    setPreparacionMes({ estado: "error", contexto, error: analisis.mensaje });
    return;
  }
  setPreparacionMes({
    estado: "lista",
    contexto,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla,
    analisis: {
      ...analisis,
      personasOmitidas: reconciliacionPersonal.personasOmitidas,
      personaIdsOmitidos: reconciliacionPersonal.personaIdsOmitidos,
      turnoNombre: TURNOS[turnoId]?.nombre || turnoId
    },
    error: ""
  });
};

const confirmarPreparacionMes = ({ configuracionLicenciadosV2 } = {}) => {
  if (preparacionMes?.estado !== "lista") return;
  const metadatosDestino = metadatosPorClaveRef.current.get(claveActiva);
  const contextoActual = {
    turnoId: turnoActivo,
    mesOrigen: obtenerMesAnterior(mesActivo),
    mesDestino: mesActivo,
    revisionDestino: String(metadatosDestino?.revisionConfirmada ?? "")
  };
  const estadoDestino =
    estadoPorTurnoMesRef.current[claveActiva] || crearEstadoMensualVacio();
  const destinoActual = clasificarEstadoMesDestino({
    existeRemoto: metadatosDestino?.existeRemoto === true,
    estado: estadoDestino
  });
  if (
    !validarContextoPreparacion(preparacionMes.contexto, contextoActual) ||
    !destinoActual.permitido ||
    !puedeEditarActivo ||
    modoSoloLecturaEfectiva ||
    metadatosDestino?.conflicto ||
    hayPendientesEnClave(claveActiva)
  ) {
    setPreparacionMes((actual) => ({
      ...actual,
      error: "El estado del mes cambió mientras preparabas la continuidad. Volvé a revisar la vista previa."
    }));
    return;
  }
  const validacionBorradores = validarBorradoresConfiguracionPlanilla({
    borradores: preparacionMes.borradoresConfiguracionPlanilla,
    turno: contextoActual.turnoId,
    mesOrigen: contextoActual.mesOrigen
  });
  if (!validacionBorradores.ok) {
    setPreparacionMes((actual) => ({ ...actual, error: validacionBorradores.mensaje }));
    return;
  }
  const construccion = construirEstadoMesNuevo({
    analisis: preparacionMes.analisis,
    borradoresConfiguracionPlanilla: validacionBorradores.borradores,
    configuracionLicenciadosV2
  });
  if (!construccion.ok) {
    setPreparacionMes((actual) => ({ ...actual, error: construccion.mensaje }));
    return;
  }
  const estadoPreparado = aplicarOmisionesPersonalEstadoPreparado({
    estadoPreparado: construccion.estado,
    personaIdsOmitidos: preparacionMes.analisis.personaIdsOmitidos
  });

  creacionesMensualesAutorizadasRef.current.add(claveActiva);
  setEstadoPorTurnoMes((prev) => {
    const actual = prev[claveActiva] || crearEstadoMensualVacio();
    const clasificacion = clasificarEstadoMesDestino({
      existeRemoto: metadatosDestino?.existeRemoto === true,
      estado: actual
    });
    if (!clasificacion.permitido) return prev;
    return { ...prev, [claveActiva]: estadoPreparado };
  });
  const personasOmitidas = preparacionMes.analisis.personasOmitidas || [];
  setPreparacionMes(personasOmitidas.length > 0
    ? {
        estado: "exito",
        contexto: preparacionMes.contexto,
        personasOmitidas
      }
    : null);
  setEstadoGuardado("pending");
};

const cargarEstadoFrescoMovimiento = async ({ turno, mes, personaId, esOrigen }) => {
  const carga = await cargarEstadoTurnoMesConRevision(turno, mes);
  if (carga?.existeRemoto !== true || !carga.estado || !/^\d+$/.test(String(carga.revision ?? ""))) {
    throw new Error(`No existe el estado mensual del turno de ${esOrigen ? "origen" : "destino"}.`);
  }
  const coincidencias = (Array.isArray(carga.estado.personal) ? carga.estado.personal : [])
    .filter((persona) => String(persona?.id ?? "").trim() === personaId);
  if (esOrigen && coincidencias.length !== 1) {
    throw new Error(coincidencias.length > 1
      ? "La persona está duplicada en su turno base. Revisá el padrón antes de continuar."
      : "La persona ya no pertenece al turno base indicado. Recargá los datos.");
  }
  if (!esOrigen && coincidencias.length > 0) {
    throw new Error("La persona ya pertenece físicamente al turno de destino.");
  }
  return { ...carga, persona: coincidencias[0] || null };
};

const analizarMovimientoPadronBaseUI = async ({
  personaId,
  turnoOrigen,
  turnoDestino,
  mes
}) => {
  if (!esPerfilSupervision(perfil) || !puedeMutarPeriodoMensual({ mes })) {
    throw new Error("No tenés permiso para cambiar el turno base en este mes.");
  }
  const claveOrigen = crearClaveTurnoMes(turnoOrigen, mes);
  if (hayPendientesEnClave(claveOrigen)) {
    throw new Error("Esperá a que terminen de guardarse los cambios del turno base.");
  }
  const origen = await cargarEstadoFrescoMovimiento({
    turno: turnoOrigen,
    mes,
    personaId,
    esOrigen: true
  });
  return analizarDependenciasMovimientoPadronBase({
    estadoOrigen: origen.estado,
    personaId,
    categoria: origen.persona.categoria,
    turnoOrigen,
    turnoDestino,
    mes
  });
};

const ejecutarMovimientoPadronBase = async ({
  personaId,
  turnoOrigen,
  turnoDestino,
  mes
}) => {
  if (!esPerfilSupervision(perfil) || !puedeMutarPeriodoMensual({ mes })) {
    throw new Error("No tenés permiso para cambiar el turno base en este mes.");
  }
  const claveOrigen = crearClaveTurnoMes(turnoOrigen, mes);
  const claveDestino = crearClaveTurnoMes(turnoDestino, mes);
  if (hayPendientesEnClave(claveOrigen) || hayPendientesEnClave(claveDestino)) {
    throw new Error("Hay cambios pendientes de guardar. Esperá y volvé a intentarlo.");
  }
  const [origen, destino] = await Promise.all([
    cargarEstadoFrescoMovimiento({ turno: turnoOrigen, mes, personaId, esOrigen: true }),
    cargarEstadoFrescoMovimiento({ turno: turnoDestino, mes, personaId, esOrigen: false })
  ]);
  if (hayPendientesEnClave(claveOrigen) || hayPendientesEnClave(claveDestino)) {
    throw new Error("Los datos cambiaron mientras realizabas la operación. Recargá e intentá nuevamente.");
  }
  const preflight = analizarDependenciasMovimientoPadronBase({
    estadoOrigen: origen.estado,
    personaId,
    categoria: origen.persona.categoria,
    turnoOrigen,
    turnoDestino,
    mes
  });
  if (!preflight.ok || preflight.tieneBloqueos) {
    const codigo = preflight.bloqueos?.[0]?.codigo;
    const error = new Error(codigo
      ? obtenerMensajeMovimientoPadronBase(codigo)
      : "No se puede cambiar el turno base con seguridad.");
    error.codigo = codigo || preflight.codigo;
    throw error;
  }
  const resultado = await moverPersonaPadronBaseTurnoMes({
    mes,
    personaId,
    turnoOrigen,
    turnoDestino,
    revisionOrigenEsperada: origen.revision,
    revisionDestinoEsperada: destino.revision
  });
  adoptarCargaServidorClave(claveOrigen, {
    existe: true,
    existeRemoto: true,
    estado: resultado.estadoOrigen,
    revision: resultado.revisionOrigen,
    updatedAt: null,
    origen: "turno_mes"
  });
  adoptarCargaServidorClave(claveDestino, {
    existe: true,
    existeRemoto: true,
    estado: resultado.estadoDestino,
    revision: resultado.revisionDestino,
    updatedAt: null,
    origen: "turno_mes"
  });
  vigenciasPersonal.recargar();
  return resultado;
};

const abrirEdicionPrioridadCobertura = () => {
  const metadatos = metadatosPorClaveRef.current.get(claveActiva);
  const estadoEsperado = estadoPorTurnoMesRef.current[claveActiva];
  const configuraciones = estadoEsperado?.configuracionPlanilla;
  const categorias = ["enfermero", "licenciado"];
  const snapshotsValidos = categorias.every((categoria) => {
    const snapshot = configuraciones?.[categoria];
    return esSnapshotConfiguracionPlanillaValido(snapshot) &&
      snapshot.turnoId === turnoActivo && snapshot.mes === mesActivo;
  });
  if (
    !claveActiva || destinoActivoPreparacion.permitido || !snapshotsValidos ||
    !puedeEditarActivo || modoSoloLecturaEfectiva || cargandoRef.current ||
    erroresCargaRef.current.has(claveActiva) || metadatos?.conflicto ||
    clavesBloqueadasTrasRestauracionRef.current.has(claveActiva) ||
    hayPendientesEnClave(claveActiva) || !String(metadatos?.revisionConfirmada ?? "")
  ) return;
  setEdicionPrioridadCobertura({
    turnoId: turnoActivo,
    mesActivo,
    clave: claveActiva,
    revision: String(metadatos.revisionConfirmada),
    estadoEsperado,
    borradores: Object.fromEntries(categorias.map((categoria) => {
      const snapshot = configuraciones[categoria];
      return [categoria, {
        filas: snapshot.filas.map((fila) => ({ ...fila })),
        ...(Object.hasOwn(snapshot, "estructuraLicenciadosVersion")
          ? { estructuraLicenciadosVersion: snapshot.estructuraLicenciadosVersion }
          : {}),
        prioridadCoberturaSectorIds: copiarPrioridadCoberturaMensual(
          snapshot.prioridadCoberturaSectorIds
        )
      }];
    })),
    error: ""
  });
};

const actualizarBorradorPrioridadCobertura = (categoria, prioridad) => {
  setEdicionPrioridadCobertura((actual) => actual?.borradores?.[categoria] ? {
    ...actual,
    borradores: {
      ...actual.borradores,
      [categoria]: {
        ...actual.borradores[categoria],
        prioridadCoberturaSectorIds: copiarPrioridadCoberturaMensual(prioridad)
      }
    }
  } : actual);
};

const guardarPrioridadCoberturaMesPreparado = () => {
  if (!edicionPrioridadCobertura) return;
  const metadatos = metadatosPorClaveRef.current.get(edicionPrioridadCobertura.clave);
  const estadoActual = estadoPorTurnoMesRef.current[edicionPrioridadCobertura.clave];
  const contextoValido =
    edicionPrioridadCobertura.turnoId === turnoActivo &&
    edicionPrioridadCobertura.mesActivo === mesActivo &&
    edicionPrioridadCobertura.clave === claveActiva &&
    edicionPrioridadCobertura.revision === String(metadatos?.revisionConfirmada ?? "") &&
    edicionPrioridadCobertura.estadoEsperado === estadoActual &&
    puedeMutarClaveMensual({
      clave: edicionPrioridadCobertura.clave,
      turnoId: edicionPrioridadCobertura.turnoId,
      mes: edicionPrioridadCobertura.mesActivo
    }) && !cargandoRef.current &&
    !erroresCargaRef.current.has(claveActiva) && !metadatos?.conflicto &&
    !clavesBloqueadasTrasRestauracionRef.current.has(claveActiva) &&
    !hayPendientesEnClave(claveActiva) &&
    !clasificarEstadoMesDestino({
      existeRemoto: metadatos?.existeRemoto === true,
      estado: estadoActual
    }).permitido;
  if (!contextoValido) {
    setEdicionPrioridadCobertura((actual) => ({
      ...actual,
      error: "El estado del mes cambió. Cancelá y volvé a abrir el editor."
    }));
    return;
  }
  let resultado = { ok: true, estado: estadoActual };
  ["enfermero", "licenciado"].forEach((categoria) => {
    if (!resultado.ok) return;
    resultado = actualizarPrioridadCoberturaEnEstadoMensual({
      estadoMensual: resultado.estado,
      categoria,
      prioridadCoberturaSectorIds:
        edicionPrioridadCobertura.borradores[categoria].prioridadCoberturaSectorIds
    });
  });
  if (!resultado.ok) {
    setEdicionPrioridadCobertura((actual) => ({
      ...actual,
      error: resultado.codigo === "PRIORIDAD_COBERTURA_LICENCIADOS_V2_INVALIDA"
        ? "La prioridad de Licenciados debe configurarse para la nueva estructura."
        : "No se pudo actualizar la prioridad porque falta la configuración mensual."
    }));
    return;
  }
  if (resultado.estado !== estadoActual) {
    setEstadoPorTurnoMes((prev) => prev[claveActiva] === estadoActual
      ? { ...prev, [claveActiva]: resultado.estado }
      : prev);
    setEstadoGuardado("pending");
  }
  setEdicionPrioridadCobertura(null);
};

const actualizarBorradorConfiguracionPlanilla = (categoria, actualizador) => {
  setPreparacionMes((actual) => {
    if (actual?.estado !== "lista" || !actual.borradoresConfiguracionPlanilla?.[categoria]) {
      return actual;
    }
    const borradorActual = actual.borradoresConfiguracionPlanilla[categoria];
    const borradorSiguiente = typeof actualizador === "function"
      ? actualizador(borradorActual)
      : actualizador;
    if (!borradorSiguiente || borradorSiguiente === borradorActual) return actual;
    return {
      ...actual,
      borradoresConfiguracionPlanilla: {
        ...actual.borradoresConfiguracionPlanilla,
        [categoria]: borradorSiguiente
      }
    };
  });
};

const seleccionarMesNavegable = (nuevoMes, { usarFechaActual = false } = {}) => {
  if (!mesesNavegables.some(({ mes }) => mes === nuevoMes)) return;
  const nuevaClave = crearClaveTurnoMes(turnoActivo, nuevoMes);
  setPreparacionMes(null);
  cargaActualRef.current = {
    id: cargaActualRef.current.id + 1,
    clave: nuevaClave
  };
  setMesActivo(nuevoMes);

  if (usarFechaActual && nuevoMes === mesActual) {
    setFecha(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12));
    return;
  }
  const [year, month] = nuevoMes.split("-").map(Number);
  const ultimoDiaDelNuevoMes = new Date(year, month, 0).getDate();
  const diaSeleccionado = Math.min(fecha.getDate(), ultimoDiaDelNuevoMes);
  setFecha(new Date(year, month - 1, diaSeleccionado, 12));
};

const cambiarVistaPrincipal = (nuevaVista) => {
  if (nuevaVista === "mas") setSubvistaMas(null);
  if (nuevaVista === "inicio") {
    seleccionarMesNavegable(mesActual, { usarFechaActual: true });
  }
  setVistaActiva(nuevaVista);
};

return (
  <div className="min-h-screen overflow-x-hidden bg-slate-100 px-3 pb-28 pt-3 sm:px-4 md:p-6 md:pb-28">
  <div className="max-w-6xl mx-auto flex flex-col gap-6">

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
  <div>
    <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
      🏥 Gestión de Urgencias
    </h1>
    <p className="mt-1 text-sm font-medium text-slate-600">
      Turno {configTurno.nombre} · {configTurno.horarioVisible}
    </p>
  </div>

  <div className="flex flex-wrap items-center gap-3">
    {controlSesion}
    {!modoSoloLectura && textoEstadoGuardado && (
      <span
        className={`text-sm ${
          ["error", "conflict"].includes(estadoGuardadoVisible)
            ? "text-red-600"
            : "text-slate-500"
        }`}
      >
        {textoEstadoGuardado}
      </span>
    )}

  {vistaActiva === "inicio" ? (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
      Período actual · {periodoMesActivoVisible}
    </div>
  ) : (
    <NavegadorMeses
      key={`${turnoActivo}|${mesActivo}`}
      mesActivo={mesActivo}
      meses={mesesNavegables}
      turnoActivo={turnoActivo}
      cargando={estadoDescubrimientoMeses === "cargando"}
      error={errorDescubrimientoMeses}
      onSeleccionar={seleccionarMesNavegable}
    />
  )}
  {metadatosActivos?.conflicto && (
    <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      Hay cambios más recientes guardados desde otra computadora. El guardado
      automático quedó detenido.
    </p>
  )}
  {clavesBloqueadasTrasRestauracion.has(claveActiva) && (
    <p role="alert" className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      La restauración se completó en el servidor, pero no fue posible actualizar
      esta pantalla. Recargá la aplicación.
    </p>
  )}
  <button
    type="button"
    onClick={cambiarTurno}
    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
  >
    Cambiar turno
  </button>
  </div>
</div>

      {avisoGlobalConflictos}

      {mesHistoricoCerradoActivo && (
        <p role="status" className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
          Mes histórico · Sólo lectura
        </p>
      )}

      {mesActivoSinInformacion && vistaActiva !== "inicio" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm" role="status">
          <p className="font-medium">No hay información registrada para este mes en este turno.</p>
          {mesActivo === mesSiguiente && (
            <p className="mt-1 text-slate-500">Podés revisar Gestión del mes para prepararlo cuando corresponda.</p>
          )}
        </div>
      )}

      {Boolean(metadatosActivos?.conflicto) && (
        <PanelConflictoEdicion
          turnoNombre={configTurno.nombre}
          mes={mesActivo}
          conflicto={metadatosActivos.conflicto}
          estadoResolucion={
            resolucionPorClave[claveActiva]?.estado || "inactivo"
          }
          error={resolucionPorClave[claveActiva]?.error || ""}
          puedeResolver={puedeEditarTurno(perfil, turnoActivo)}
          onDescargar={() => descargarCopiaConflicto(claveActiva)}
          onUsarServidor={() => usarVersionServidor(claveActiva)}
          onConservarLocal={() => conservarVersionLocal(claveActiva)}
        />
      )}

      {reinicioMes?.clave === claveActiva && (
        <PanelReiniciarMes
          turnoNombre={configTurno.nombre}
          periodoVisible={new Intl.DateTimeFormat("es-UY", {
            month: "long",
            year: "numeric"
          }).format(new Date(`${mesActivo}-01T12:00:00`))}
          textoConfirmacion={reinicioMes.texto}
          error={reinicioMes.error}
          onCambiarTexto={(texto) => setReinicioMes((actual) => ({
            ...actual,
            texto,
            error: ""
          }))}
          onCancelar={() => setReinicioMes(null)}
          onConfirmar={confirmarReinicioMes}
        />
      )}

      {vistaActiva === "inicio" && (
        <VistaInicio
          turno={configTurno.nombre}
          mes={mesActivo}
          fecha={keyDiaActual}
          modoHistorico={mesHistoricoCerradoActivo}
          resumen={resumenInicio}
          onCambiarFecha={(nuevaFecha) => {
            if (!fechaPerteneceAlMes(nuevaFecha, mesActivo)) return;
            setFecha(parsearFechaLocal(nuevaFecha));
          }}
          onNavegar={cambiarVistaPrincipal}
        />
      )}

      {vistaActiva === "mas" && subvistaMas === null && (
        <HubMas
          esSupervision={esPerfilSupervision(perfil)}
          onAbrir={setSubvistaMas}
        />
      )}

      <div className={vistaActiva === "mas" && subvistaMas === "personal" && !mesActivoSinInformacion ? "" : "hidden"}>
        <BotonVolverMas onVolver={() => setSubvistaMas(null)} />
        <h2 className="mb-4 text-xl font-semibold text-slate-800">👥 Personal</h2>
        {modoSoloLectura && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            {obtenerMensajeSoloLectura(perfil)}
          </p>
        )}
        <ListaPersonal
          soloLectura={modoSoloLecturaEfectiva}
          personal={personal}
          mesActivo={mesActivo}
          configTurno={configTurno}
          onActualizarPersona={actualizarPersona}
          onRenombrarPersona={renombrarPersona}
          onEliminarPersona={eliminarPersona}
          onLimpiarPersonal={limpiarPersonal}
          onValidarExclusividadTurno={validarPersonaDisponibleEnOtrosTurnos}
          vigenciasPersonal={vigenciasPersonal}
          onAnalizarMovimientoPadronBase={analizarMovimientoPadronBaseUI}
          onMoverPadronBase={ejecutarMovimientoPadronBase}
          perfil={perfil}
          modoHistorico={mesHistoricoCerradoActivo}
          setPersonal={(nuevo) => {
            setEstadoPorTurnoMes(prev => {
    if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
              const actual = prev[claveActiva] || crearEstadoMensualVacio();
              return { ...prev, [claveActiva]: { ...actual, personal: nuevo } };
            });
          }}
        />
      </div>

      

<div id="planilla-principal" className={vistaActiva === "planilla" && !mesActivoSinInformacion ? "" : "hidden"}>
<h2 className="mb-4 text-xl font-semibold text-slate-800">📊 Planilla mensual</h2>

<div className="mb-4 flex flex-wrap gap-2">
<button
  onClick={() =>
    exportarPlanillaPDF({
      planillaEnfermeros,
      planillaLicenciados,
      semanas,
      personal,
      turnoId: turnoActivo,
      mesActivo,
      estadoMensual: mesData
    })
  }
  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm shadow-sm transition"
>
  📄 Exportar planilla PDF
</button>
<BotonEnviarPDF
  asuntoInicial={crearAsuntoCorreoPDF({
    tipoDocumento: "planilla_mensual",
    turnoId: turnoActivo,
    mesActivo
  })}
  informacion={{
    nombreArchivo: "planilla_mensual.pdf",
    tipo: obtenerEstrategiaRotacionPlanilla({
      turnoId: turnoActivo,
      tipo: "enfermero",
      mesActivo
    }).tipo === "cada_3_dias" ? "Rotación nocturna" : "Planilla mensual",
    mes: mesActivo,
    turno: configTurno.nombre,
    categoria: "Enfermeros y Licenciados"
  }}
  generarPDF={async () => {
    const adjunto = obtenerAdjuntoPlanillaPDF({
      planillaEnfermeros,
      planillaLicenciados,
      semanas,
      personal,
      turnoId: turnoActivo,
      mesActivo,
      estadoMensual: mesData
    });
    return {
      ...adjunto,
      contexto: {
        tipoDocumento: adjunto.tipoDocumento,
        mes: mesActivo,
        turno: turnoActivo,
        categoria: "ambas",
        fecha: null,
        origen: "planilla"
      }
    };
  }}
/>
</div>
  {/* TABS */}
  <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1 md:hidden" aria-label="Categoría de la Planilla">
    <button
      type="button"
      aria-pressed={tabPlanilla === "enfermeros"}
      onClick={() => setTabPlanilla("enfermeros")}
      className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition ${
        tabPlanilla === "enfermeros" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"
      }`}
    >
      Enfermeros
    </button>
    <button
      type="button"
      aria-pressed={tabPlanilla === "licenciados"}
      onClick={() => setTabPlanilla("licenciados")}
      className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition ${
        tabPlanilla === "licenciados" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"
      }`}
    >
      Licenciados
    </button>
  </div>

  <div className="mb-4 hidden gap-2 md:flex">
    
    <button
      onClick={() => setTabPlanilla("enfermeros")}
      className={`px-4 py-2 rounded-lg text-sm transition ${
        tabPlanilla === "enfermeros"
          ? "bg-blue-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      👨‍⚕️ Enfermeros
    </button>

    <button
      onClick={() => setTabPlanilla("licenciados")}
      className={`px-4 py-2 rounded-lg text-sm transition ${
        tabPlanilla === "licenciados"
          ? "bg-blue-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      🧑‍⚕️ Licenciados
    </button>

  </div>

  {/* CONTENIDO */}
  {tabPlanilla === "enfermeros" && (
    <PlanillaMensual
      soloLectura={modoSoloLecturaEfectiva}
      personal={personal}
      estadoMensual={mesData}
      planilla={planillaEnfermeros}
      setPlanilla={setPlanillaEnfermeros}
      tipo="enfermero"
      licencias={licenciasMes}
      mesActivo={mesActivo}
      turnoId={turnoActivo}
      padronVigencias={vigenciasPersonal.padron}
      estadoCargaVigencias={{
        cargando: vigenciasPersonal.cargando,
        error: vigenciasPersonal.error
      }}
    />
  )}

  {tabPlanilla === "licenciados" && (
    <PlanillaMensual
      soloLectura={modoSoloLecturaEfectiva}
      personal={personal}
      estadoMensual={mesData}
      planilla={planillaLicenciados}
      setPlanilla={setPlanillaLicenciados}
      tipo="licenciado"
      licencias={licenciasMes}
      mesActivo={mesActivo}
      turnoId={turnoActivo}
      padronVigencias={vigenciasPersonal.padron}
      estadoCargaVigencias={{
        cargando: vigenciasPersonal.cargando,
        error: vigenciasPersonal.error
      }}
    />
  )}



      </div>

      <div id="novedades-principal" className={vistaActiva === "novedades" && !mesActivoSinInformacion ? "" : "hidden"}>
        <h2 className="mb-4 text-xl font-semibold text-slate-800">📋 Novedades</h2>
        <Novedades
          personal={personal}
          licencias={licenciasMes}
          certificaciones={certificacionesMes}
          turnoActivo={turnoActivo}
          fechaActiva={keyDiaActual}
          mesActivo={mesActivo}
          soloLectura={modoSoloLecturaEfectiva}
          novedades={novedadesPersonal}
          cargando={cargandoNovedades}
          errorCarga={errorNovedades}
          onRecargar={cargarNovedades}
          onRegistrar={registrarNovedad}
          onCancelar={cancelarNovedad}
          onGuardarListaParo={guardarListaParo}
          onRegistrarOlvidoTarjeta={guardarOlvidoTarjeta}
          onActualizarEstado={actualizarEstadoNovedad}
          onGuardarCambioHorario={guardarCambioHorario}
          onGuardarLicencia={(licencia) => actualizarLicenciasMes((actuales) => [...actuales, licencia])}
          onGuardarCertificacion={(certificacion) => actualizarCertificacionesMes((actuales) => [...actuales, certificacion])}
          onEditarLicencia={(novedad, licencia) => editarRegistroLegacyMes("licencias", novedad, licencia)}
          onEliminarLicencia={(novedad) => eliminarRegistroLegacyMes("licencias", novedad)}
          onEditarCertificacion={(novedad, certificacion) => editarRegistroLegacyMes("certificaciones", novedad, certificacion)}
          onEliminarCertificacion={(novedad) => eliminarRegistroLegacyMes("certificaciones", novedad)}
        />
      </div>

      <div className={vistaActiva === "mas" && subvistaMas === "gestionMes" ? "" : "hidden"}>
        <BotonVolverMas onVolver={() => setSubvistaMas(null)} />
        <h2 className="mb-4 text-xl font-semibold text-slate-800">🗓️ Gestión del mes</h2>
        {(mesActivo === mesSiguiente || !destinoActivoPreparacion.permitido) && (
        <div className="mb-4 rounded-xl border border-purple-200 bg-white p-4 shadow-sm">
          {mesActivo === mesSiguiente &&
          destinoActivoPreparacion.permitido &&
          puedeEditarActivo &&
          !modoSoloLecturaEfectiva &&
          !cargando &&
          !metadatosActivos?.conflicto &&
          !clavesBloqueadasTrasRestauracion.has(claveActiva) &&
          !hayPendientesEnClave(claveActiva) && (
            <button
              type="button"
              onClick={iniciarPreparacionMes}
              disabled={
                cargando ||
                Boolean(metadatosActivos?.conflicto) ||
                clavesBloqueadasTrasRestauracion.has(claveActiva)
              }
              className="mt-3 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white shadow-sm transition hover:bg-purple-700 disabled:bg-slate-300"
            >
              Preparar mes siguiente
            </button>
          )}
          {!destinoActivoPreparacion.permitido && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">
                Este mes ya fue iniciado y no puede prepararse nuevamente.
              </p>
              {contenidoDestinoPresentable.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium">Información encontrada:</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {contenidoDestinoPresentable.map((etiqueta) => (
                      <li
                        key={etiqueta}
                        className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2"
                      >
                        • {etiqueta}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {puedeEditarActivo && !modoSoloLecturaEfectiva && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={abrirEdicionPrioridadCobertura}
                    disabled={cargando || Boolean(metadatosActivos?.conflicto) ||
                      clavesBloqueadasTrasRestauracion.has(claveActiva) ||
                      hayPendientesEnClave(claveActiva)}
                    className="min-h-11 rounded-lg border border-blue-300 bg-white px-4 py-2 font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">
                    Editar prioridad de cobertura
                  </button>
                  <button
                    type="button"
                    onClick={abrirReinicioMes}
                    disabled={
                      cargando ||
                      Boolean(metadatosActivos?.conflicto) ||
                      clavesBloqueadasTrasRestauracion.has(claveActiva) ||
                      hayPendientesEnClave(claveActiva)
                    }
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    Reiniciar mes completo
                  </button>
                </div>
              )}
            </div>
          )}
          {edicionPrioridadCobertura?.clave === claveActiva && (
            <PanelPrioridadCoberturaMes
              turnoNombre={configTurno.nombre}
              mes={mesActivo}
              borradores={edicionPrioridadCobertura.borradores}
              error={edicionPrioridadCobertura.error}
              onActualizar={actualizarBorradorPrioridadCobertura}
              onCancelar={() => setEdicionPrioridadCobertura(null)}
              onGuardar={guardarPrioridadCoberturaMesPreparado}
            />
          )}
          {mesActivo === mesSiguiente &&
            destinoActivoPreparacion.permitido &&
            (cargando ||
              metadatosActivos?.conflicto ||
              clavesBloqueadasTrasRestauracion.has(claveActiva) ||
              hayPendientesEnClave(claveActiva)) && (
              <p className="mt-3 text-sm text-slate-600">
                La preparación estará disponible cuando finalicen las operaciones pendientes.
              </p>
            )}

          {preparacionMes?.estado === "cargando" && (
            <p aria-live="polite" className="mt-3 text-sm text-slate-600">
              Preparando vista previa…
            </p>
          )}
          {preparacionMes?.estado === "error" && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p role="alert" className="text-sm text-rose-700">{preparacionMes.error}</p>
              <button type="button" onClick={() => setPreparacionMes(null)} className="mt-2 text-sm underline">
                Cerrar
              </button>
            </div>
          )}
          {preparacionMes?.estado === "exito" && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3" role="status" aria-live="polite">
              <p className="text-sm font-semibold text-emerald-900">Mes preparado correctamente.</p>
              {preparacionMes.personasOmitidas.length > 0 && (
                <div className="mt-2 text-sm text-emerald-900">
                  <p>
                    {preparacionMes.personasOmitidas.length} {preparacionMes.personasOmitidas.length === 1 ? "persona no fue copiada" : "personas no fueron copiadas"} porque ya {preparacionMes.personasOmitidas.length === 1 ? "pertenece" : "pertenecen"} a otro turno en {periodoMesActivoVisible}:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {preparacionMes.personasOmitidas.map((persona) => (
                      <li key={persona.personaId}>• {persona.nombre} → {persona.turnoNombre}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button type="button" onClick={() => setPreparacionMes(null)} className="mt-2 text-sm font-medium text-emerald-900 underline">
                Cerrar
              </button>
            </div>
          )}
          {preparacionMes?.estado === "lista" &&
            mesActivo === mesSiguiente &&
            validarContextoPreparacion(preparacionMes.contexto, {
              turnoId: turnoActivo,
              mesOrigen: obtenerMesAnterior(mesActivo),
              mesDestino: mesActivo,
              revisionDestino: String(metadatosActivos?.revisionConfirmada ?? "")
            }) && (
              <PanelPrepararMes
                analisis={preparacionMes.analisis}
                borradoresConfiguracionPlanilla={preparacionMes.borradoresConfiguracionPlanilla}
                onActualizarBorradorConfiguracionPlanilla={actualizarBorradorConfiguracionPlanilla}
                error={preparacionMes.error}
                onCancelar={() => setPreparacionMes(null)}
                onConfirmar={confirmarPreparacionMes}
              />
            )}
        </div>
        )}
        {mesActivo !== mesSiguiente && destinoActivoPreparacion.permitido && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            No hay acciones de gestión disponibles para el mes seleccionado.
          </div>
        )}
      </div>

      <div className={vistaActiva === "mas" && subvistaMas === "estadisticas" ? "" : "hidden"}>
        <BotonVolverMas onVolver={() => setSubvistaMas(null)} />
        <h2 className="mb-4 text-xl font-semibold text-slate-800">📈 Estadísticas</h2>
        <Estadisticas
          calendario={mesData.calendario}
          estadoActivo={mesData}
          mesActivo={mesActivo}
          nombreTurno={configTurno.nombre}
          turnoActivo={turnoActivo}
        />
      </div>

      {esPerfilSupervision(perfil) && (
        <div className={vistaActiva === "mas" && subvistaMas === "historial" ? "" : "hidden"}>
          <BotonVolverMas onVolver={() => setSubvistaMas(null)} />
          <h2 className="mb-4 text-xl font-semibold text-slate-800">🕘 Historial</h2>
          <HistorialCambios
            turnoInicial={turnoActivo}
            mesInicial={mesActivo}
            turnoActivo={turnoActivo}
            mesActivo={mesActivo}
            sesionId={perfil?.usuario || ""}
            seccionVisible={vistaActiva === "mas" && subvistaMas === "historial"}
            obtenerDisponibilidadRestauracion={obtenerDisponibilidadRestauracion}
            cargarEstadoOperativo={cargarEstadoOperativoHistorial}
            iniciarRestauracion={iniciarRestauracionHistorial}
            adoptarRestauracion={adoptarRestauracionHistorial}
            finalizarRestauracion={finalizarRestauracionHistorial}
          />
        </div>
      )}

      <div id="calendario-pdf" className={vistaActiva === "calendario" && !mesActivoSinInformacion ? "" : "hidden"}>
        <h2 className="mb-4 text-xl font-semibold text-slate-800">📅 Calendario diario</h2>

  <div className="mb-4 flex flex-wrap gap-2">
  <button
  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm shadow-sm transition"
  onClick={() =>
    exportarCalendarioPDF({
      fecha,
      enfermeros: dataPDFEnf,
      licenciados: dataPDFLic,
      certificaciones: certificacionesMes,
      personal,
      turnoId: turnoActivo,
      mesActivo,
      estadoMensual: mesData
    })
  }
>
  📄 Exportar calendario PDF
  </button>
  <BotonEnviarPDF
    asuntoInicial={crearAsuntoCorreoPDF({
      tipoDocumento: "calendario_diario",
      turnoId: turnoActivo,
      fecha,
      mesActivo
    })}
    informacion={{
      nombreArchivo: `calendario-diario-${keyDiaFromDate(fecha)}-${turnoActivo}.pdf`,
      tipo: "Calendario Diario",
      mes: mesActivo,
      turno: configTurno.nombre,
      categoria: "Enfermeros y Licenciados"
    }}
    generarPDF={async () => {
      const adjunto = obtenerAdjuntoCalendarioPDF({
        fecha,
        enfermeros: dataPDFEnf,
        licenciados: dataPDFLic,
        certificaciones: certificacionesMes,
        personal,
        turnoId: turnoActivo,
        mesActivo,
        estadoMensual: mesData
      });
      return {
        ...adjunto,
        contexto: {
          tipoDocumento: adjunto.tipoDocumento,
          mes: mesActivo,
          turno: turnoActivo,
          categoria: "ambas",
          fecha: keyDiaFromDate(fecha),
          origen: "calendario"
        }
      };
    }}
  />
  </div>
          {/* 🔹 TABS */}
  <div className="flex gap-2 mb-4">
    <button
      onClick={() => setTabCalendario("enfermeros")}
      className={`px-4 py-2 rounded-lg text-sm transition ${
        tabCalendario === "enfermeros"
          ? "bg-blue-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      👨‍⚕️ Enfermeros
    </button>

    <button
      onClick={() => setTabCalendario("licenciados")}
      
      className={`px-4 py-2 rounded-lg text-sm transition ${
        tabCalendario === "licenciados"
          ? "bg-blue-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      🧑‍⚕️ Licenciados
    </button>
  </div>

  {alertasHorarios.length > 0 && (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="mb-2 font-semibold">Horarios especiales</p>
      <ul className="space-y-1">
        {alertasHorarios.map((alerta, index) => (
          <li key={`${alerta}-${index}`}>{alerta}</li>
        ))}
      </ul>
    </div>
  )}

<div className={tabCalendario === "enfermeros" ? "" : "hidden"}>
  <CalendarioDiario
    soloLectura={modoSoloLecturaEfectiva}
    turnoActivo={turnoActivo}
    usuarioActual={perfil.usuario}
    puedeReabrirCierre={esPerfilSupervision(perfil)}
  key={`enfermeros|${turnoActivo}|${mesActivo}|${keyDiaFromDate(fecha)}|${modoSoloLecturaEfectiva}`}
    personal={personalCalendario}
    estadoMensual={mesData}
    planilla={planillaEnfermeros}
    tipo="enfermero"
    mesActivo={mesActivo}
    licencias={licenciasMes}
    certificaciones={certificacionesMes}
    licenciasLectura={licenciasCalendarioLectura}
    certificacionesLectura={certificacionesCalendarioLectura}
    estadoCargaVigencias={{
      cargando: vigenciasPersonal.cargando,
      error: vigenciasPersonal.error
    }}
    novedades={novedadesPersonal}
    setCertificaciones={actualizarCertificacionesMes}
    obtenerCertificacionesActuales={obtenerCertificacionesActuales}
    calendario={mesData.calendario.enfermeros}
    obtenerCalendarioActual={() =>
      estadoPorTurnoMesRef.current[claveActiva]?.calendario?.enfermeros
    }
    cargarPersonalOtrosTurnos={cargarPersonalDeOtrosTurnos}
    esDiaParo={Boolean(diasParo[keyDiaFromDate(fecha)])}
     onDataReady={setDataPDFEnf}
    fecha={fecha}
    setFecha={setFecha}
    setCalendario={(update) => {
      setEstadoPorTurnoMes(prev => {
        if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
        const actual = prev[claveActiva] || crearEstadoMensualVacio();
        const calendarioActual = actual.calendario?.enfermeros || {};

        const nuevoCalendario =
          typeof update === "function"
            ? update(calendarioActual)
            : update;

        return {
          ...prev,
          [claveActiva]: {
            ...actual,
            calendario: {
              ...actual.calendario,
              enfermeros: {
                ...calendarioActual,
                ...nuevoCalendario
              }
            }
          }
        };
      });
    }}
  />
</div>

<div className={tabCalendario === "licenciados" ? "" : "hidden"}>
  <CalendarioDiario
    soloLectura={modoSoloLecturaEfectiva}
    turnoActivo={turnoActivo}
    usuarioActual={perfil.usuario}
    puedeReabrirCierre={esPerfilSupervision(perfil)}
  key={`licenciados|${turnoActivo}|${mesActivo}|${keyDiaFromDate(fecha)}|${modoSoloLecturaEfectiva}`}
    personal={personalCalendario}
    estadoMensual={mesData}
    planilla={planillaLicenciados}
    tipo="licenciado"
    mesActivo={mesActivo}
    licencias={licenciasMes}
    certificaciones={certificacionesMes}
    licenciasLectura={licenciasCalendarioLectura}
    certificacionesLectura={certificacionesCalendarioLectura}
    estadoCargaVigencias={{
      cargando: vigenciasPersonal.cargando,
      error: vigenciasPersonal.error
    }}
    novedades={novedadesPersonal}
    setCertificaciones={actualizarCertificacionesMes}
    obtenerCertificacionesActuales={obtenerCertificacionesActuales}
    calendario={mesData.calendario.licenciados}
    obtenerCalendarioActual={() =>
      estadoPorTurnoMesRef.current[claveActiva]?.calendario?.licenciados
    }
    cargarPersonalOtrosTurnos={cargarPersonalDeOtrosTurnos}
    esDiaParo={Boolean(diasParo[keyDiaFromDate(fecha)])}
    onDataReady={setDataPDFLic}
    fecha={fecha}
    setFecha={setFecha}
    setCalendario={(update) => {
      setEstadoPorTurnoMes(prev => {
        if (!puedeMutarMesActivo() || erroresCargaRef.current.has(claveActiva)) return prev;
        const actual = prev[claveActiva] || crearEstadoMensualVacio();
        const calendarioActual = actual.calendario?.licenciados || {};

        const nuevoCalendario =
          typeof update === "function"
            ? update(calendarioActual)
            : update;

        return {
          ...prev,
          [claveActiva]: {
            ...actual,
            calendario: {
              ...actual.calendario,
              licenciados: {
                ...calendarioActual,
                ...nuevoCalendario
              }
            }
          }
        };
      });
    }}
  />
</div>

        </div>
      </div>

      <NavegacionPrincipal vistaActiva={vistaActiva} onCambiarVista={cambiarVistaPrincipal} />

    

    </div>
  
);
}

export default App;
