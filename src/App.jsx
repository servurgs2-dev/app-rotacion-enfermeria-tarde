import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ListaPersonal from "./components/personal/ListaPersonal";
import PlanillaMensual from "./components/planilla/PlanillaMensual";
import CalendarioDiario from "./components/calendario/CalendarioDiario";
import Seccion from "./components/ui/Seccion";
import Licencias from "./components/licencias/Licencias";
import Certificaciones from "./components/certificaciones/Certificaciones";
import Estadisticas from "./components/estadisticas/Estadisticas";
import HistorialCambios from "./components/historial/HistorialCambios";
import PanelConflictoEdicion from "./components/concurrencia/PanelConflictoEdicion";
import PanelPrepararMes from "./components/mes/PanelPrepararMes";
import PanelReiniciarMes from "./components/mes/PanelReiniciarMes";
import SelectorTurno from "./components/turnos/SelectorTurno";
import {
  exportarPlanillaPDF,
  exportarCalendarioPDF,
  obtenerAdjuntoCalendarioPDF,
  obtenerAdjuntoPlanillaPDF
} from "./utils/exportPDF";
import BotonEnviarPDF from "./components/correo/BotonEnviarPDF";
import { crearAsuntoCorreoPDF } from "./utils/correoPDF";
import { keyDiaFromDate, obtenerSemanasDelMes } from "./utils/fechas";
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
  cargarEstadoTurnoMesConRevision,
  guardarEstadoTurnoMesConRevision
} from "./services/estadoTurnos";
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
  clasificarEstadoMesDestino,
  construirEstadoMesNuevo,
  formatearContenidoMes,
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

const [fecha, setFecha] = useState(new Date());
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
const [historialAbierto, setHistorialAbierto] = useState(false);
const [preparacionMes, setPreparacionMes] = useState(null);
const [reinicioMes, setReinicioMes] = useState(null);
const [restauracionHistorialEnCurso, setRestauracionHistorialEnCurso] = useState(null);
const restauracionHistorialEnCursoRef = useRef(null);
const [clavesBloqueadasTrasRestauracion, setClavesBloqueadasTrasRestauracion] =
  useState(() => new Set());
const clavesBloqueadasTrasRestauracionRef = useRef(new Set());
const sesionActivaRef = useRef(String(perfil?.usuario || ""));
const contextoActivoRef = useRef({ turno: turnoActivo, mes: mesActivo });

const [dataPDFEnf, setDataPDFEnf] = useState({ asignaciones: [], libres: [] });
const [dataPDFLic, setDataPDFLic] = useState({ asignaciones: [], libres: [] });

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
    configTurno
  });
}, [configTurno, dataPDFEnf, dataPDFLic, esDiaParoActual, keyDiaActual]);

// 🔹 PERSONAL
const personal = mesData.personal;

// 🔹 PLANILLAS
const planillaEnfermeros = mesData.planillas.enfermeros;
const planillaLicenciados = mesData.planillas.licenciados;
// 🔹 LICENCIAS

const licenciasMes = mesData.licencias;
const certificacionesMes = mesData.certificaciones || [];

const semanas = obtenerSemanasDelMes(mesActivo);

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
    if (!data || !puedeEditarTurno(perfil, turnoId)) {
      throw new Error("No hay permisos para guardar este turno y mes.");
    }
    return guardarEstadoTurnoMesConRevision({
      turnoId,
      mes,
      estado: data,
      revisionEsperada
    });
  },
  [perfil]
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
    !puedeEditarTurno(perfil, turnoId)
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
}, [actualizarMetadatosClave, perfil]);

const procesarColaGuardado = useCallback(async () => {
  if (!appMontadaRef.current) return;
  if (guardadoEnCursoRef.current) return;

  const siguiente = [...colaGuardadoRef.current.entries()].find(
    ([clave, pendiente]) => {
      const metadatos = metadatosPorClaveRef.current.get(clave);
      return (
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
  guardarMes
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
    if (!puedeEditarTurno(perfil, identidad.turnoId)) {
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
  perfil,
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
    if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
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
    if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
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
    if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
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
    if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
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
    if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
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
    if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
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
      setEstadoPorTurnoMes(prev => ({
        ...prev,
        [claveCarga]: clasificacion.estado
      }));
    } else {
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

const mesSiguienteFecha = new Date(hoy.getFullYear(), hoy.getMonth() + 1);

const mesSiguiente = `${mesSiguienteFecha.getFullYear()}-${String(
  mesSiguienteFecha.getMonth() + 1
).padStart(2, "0")}`;

const seleccionarTurno = (turnoId) => {
  if (!Object.hasOwn(TURNOS, turnoId)) return;

  setDataPDFEnf({ asignaciones: [], libres: [] });
  setDataPDFLic({ asignaciones: [], libres: [] });
  setCargando(true);
  setPreparacionMes(null);
  cargandoRef.current = true;
  setTurnoActivo(turnoId);
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
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {controlSesion}
      <div className="mx-auto mt-4 max-w-3xl">{avisoGlobalConflictos}</div>
      <SelectorTurno turnos={TURNOS} onSeleccionar={seleccionarTurno} />
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
const resolviendoConflictoActivo =
  resolucionPorClave[claveActiva]?.estado === "guardando_local";
const modoSoloLecturaEfectiva =
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

const obtenerMesAnterior = (mes) => {
  const [anio, numeroMes] = mes.split("-").map(Number);
  const fechaAnterior = new Date(anio, numeroMes - 2);
  return `${fechaAnterior.getFullYear()}-${String(
    fechaAnterior.getMonth() + 1
  ).padStart(2, "0")}`;
};

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
    puedeEditarActivo &&
    !modoSoloLecturaEfectiva &&
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

  let exclusividad;
  try {
    exclusividad = await validarPersonasDisponiblesEnOtrosTurnos(
      origen.estado.personal || []
    );
  } catch {
    if (!contextoSigueVigente()) return;
    setPreparacionMes({
      estado: "error",
      contexto,
      error: "No se pudo validar la pertenencia del Personal."
    });
    return;
  }
  if (!contextoSigueVigente()) return;
  if (exclusividad.cancelada) {
    setPreparacionMes(null);
    return;
  }
  if (exclusividad.existeEnOtroTurno) {
    setPreparacionMes({
      estado: "error",
      contexto,
      error: `${exclusividad.personaValidada.nombre} ya pertenece al Turno ${exclusividad.turnoNombre}.`
    });
    return;
  }

  const analisis = analizarPreparacionMesNuevo({
    turnoId,
    mesOrigen,
    mesDestino,
    estadoOrigen: origen.estado,
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
    analisis: {
      ...analisis,
      turnoNombre: TURNOS[turnoId]?.nombre || turnoId
    },
    error: ""
  });
};

const confirmarPreparacionMes = () => {
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
  const construccion = construirEstadoMesNuevo({
    analisis: preparacionMes.analisis
  });
  if (!construccion.ok) {
    setPreparacionMes((actual) => ({ ...actual, error: construccion.mensaje }));
    return;
  }

  setEstadoPorTurnoMes((prev) => {
    const actual = prev[claveActiva] || crearEstadoMensualVacio();
    const clasificacion = clasificarEstadoMesDestino({
      existeRemoto: metadatosDestino?.existeRemoto === true,
      estado: actual
    });
    if (!clasificacion.permitido) return prev;
    return { ...prev, [claveActiva]: construccion.estado };
  });
  setPreparacionMes(null);
  setEstadoGuardado("pending");
};

return (
  <div className="min-h-screen bg-slate-100 p-4 md:p-6">
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

  <input
    type="month"
    value={mesActivo}
    onChange={(e) => {
  const nuevoMes = e.target.value;

  if (nuevoMes !== mesActual && nuevoMes !== mesSiguiente) {
    alert("Solo podés usar el mes actual o el siguiente");
    return;
  }

  const nuevaClave = crearClaveTurnoMes(turnoActivo, nuevoMes);
  setPreparacionMes(null);
  cargaActualRef.current = {
    id: cargaActualRef.current.id + 1,
    clave: nuevaClave
  };
  setMesActivo(nuevoMes);

  const [year, month] = nuevoMes.split("-").map(Number);
  const ultimoDiaDelNuevoMes = new Date(year, month, 0).getDate();
  const diaSeleccionado = Math.min(fecha.getDate(), ultimoDiaDelNuevoMes);

  setFecha(new Date(year, month - 1, diaSeleccionado, 12));
}}
    className="border border-slate-300 rounded-lg px-3 py-2 text-sm shadow-sm"
  />
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

      <Seccion
        titulo="👥 Personal"
        className="order-3"
        cuerpoClassName="max-h-[70vh] overflow-y-auto overscroll-contain pr-1 sm:pr-2"
      >
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
          setPersonal={(nuevo) => {
            setEstadoPorTurnoMes(prev => {
              if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
              const actual = prev[claveActiva] || crearEstadoMensualVacio();
              return { ...prev, [claveActiva]: { ...actual, personal: nuevo } };
            });
          }}
        />
      </Seccion>

      

<Seccion titulo="📊 Planilla mensual" className="order-2">

<div className="mb-4 flex flex-wrap gap-2">
<button
  onClick={() =>
    exportarPlanillaPDF({
      planillaEnfermeros,
      planillaLicenciados,
      semanas,
      personal,
      turnoId: turnoActivo,
      mesActivo
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
      mesActivo
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
  <div className="flex gap-2 mb-4">
    
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
      planilla={planillaEnfermeros}
      setPlanilla={setPlanillaEnfermeros}
      tipo="enfermero"
      licencias={licenciasMes}
      mesActivo={mesActivo}
      turnoId={turnoActivo}
    />
  )}

  {tabPlanilla === "licenciados" && (
    <PlanillaMensual
      soloLectura={modoSoloLecturaEfectiva}
      personal={personal}
      planilla={planillaLicenciados}
      setPlanilla={setPlanillaLicenciados}
      tipo="licenciado"
      licencias={licenciasMes}
      mesActivo={mesActivo}
      turnoId={turnoActivo}
    />
  )}



      </Seccion>

      <Seccion titulo="🏖 Licencias" className="order-4">
        <Licencias
          soloLectura={modoSoloLecturaEfectiva}
          personal={personal}
          licencias={licenciasMes}
          setLicencias={(nueva) => {
            setEstadoPorTurnoMes(prev => {
              if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
              const actual = prev[claveActiva] || crearEstadoMensualVacio();
              return { ...prev, [claveActiva]: { ...actual, licencias: nueva } };
            });
          }}
        />
      </Seccion>

      <Seccion titulo="🩺 Certificaciones médicas" className="order-4">
        <Certificaciones
          soloLectura={modoSoloLecturaEfectiva}
          personal={personal}
          certificaciones={certificacionesMes}
          setCertificaciones={(nuevas) => {
            setEstadoPorTurnoMes(prev => {
              if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
              const actual = prev[claveActiva] || crearEstadoMensualVacio();
              return { ...prev, [claveActiva]: { ...actual, certificaciones: nuevas } };
            });
          }}
        />
      </Seccion>

      {(mesActivo === mesSiguiente || !destinoActivoPreparacion.permitido) && (
        <div className="order-4 mb-4 rounded-xl border border-purple-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Gestión del mes</h2>
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
                <button
                  type="button"
                  onClick={abrirReinicioMes}
                  disabled={
                    cargando ||
                    Boolean(metadatosActivos?.conflicto) ||
                    clavesBloqueadasTrasRestauracion.has(claveActiva) ||
                    hayPendientesEnClave(claveActiva)
                  }
                  className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  Reiniciar mes completo
                </button>
              )}
            </div>
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
                error={preparacionMes.error}
                onCancelar={() => setPreparacionMes(null)}
                onConfirmar={confirmarPreparacionMes}
              />
            )}
        </div>
      )}

      <Seccion titulo="📈 Estadísticas" className="order-5">
        <Estadisticas
          calendario={mesData.calendario}
          estadoActivo={mesData}
          mesActivo={mesActivo}
          nombreTurno={configTurno.nombre}
          turnoActivo={turnoActivo}
        />
      </Seccion>

      {esPerfilSupervision(perfil) && (
        <Seccion
          titulo="🕘 Historial"
          className="order-6"
          cuerpoClassName="max-h-[75vh] overflow-y-auto overscroll-contain pr-1 sm:pr-2"
          onCambioAbierto={setHistorialAbierto}
        >
          <HistorialCambios
            turnoInicial={turnoActivo}
            mesInicial={mesActivo}
            turnoActivo={turnoActivo}
            mesActivo={mesActivo}
            sesionId={perfil?.usuario || ""}
            seccionVisible={historialAbierto}
            obtenerDisponibilidadRestauracion={obtenerDisponibilidadRestauracion}
            cargarEstadoOperativo={cargarEstadoOperativoHistorial}
            iniciarRestauracion={iniciarRestauracionHistorial}
            adoptarRestauracion={adoptarRestauracionHistorial}
            finalizarRestauracion={finalizarRestauracionHistorial}
          />
        </Seccion>
      )}

      <div id="calendario-pdf" className="order-1">
        
        <Seccion
          titulo="📅 Calendario diario"
          cuerpoClassName="max-h-[75vh] overflow-y-auto overscroll-contain pr-1 sm:pr-2"
        >
          

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
      mesActivo
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
        mesActivo
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
    personal={personal}
    planilla={planillaEnfermeros}
    tipo="enfermero"
    mesActivo={mesActivo}
    licencias={licenciasMes}
    certificaciones={certificacionesMes}
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
        if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
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
    personal={personal}
    planilla={planillaLicenciados}
    tipo="licenciado"
    mesActivo={mesActivo}
    licencias={licenciasMes}
    certificaciones={certificacionesMes}
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
        if (!puedeEditarActivo || !claveActiva || erroresCargaRef.current.has(claveActiva)) return prev;
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

        </Seccion>
        </div>
      </div>

    

    </div>
  
);
}

export default App;
