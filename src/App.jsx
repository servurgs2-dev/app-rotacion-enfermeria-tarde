import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ListaPersonal from "./components/personal/ListaPersonal";
import PlanillaMensual from "./components/planilla/PlanillaMensual";
import CalendarioDiario from "./components/calendario/CalendarioDiario";
import Seccion from "./components/ui/Seccion";
import Licencias from "./components/licencias/Licencias";
import Certificaciones from "./components/certificaciones/Certificaciones";
import SelectorTurno from "./components/turnos/SelectorTurno";
import { exportarPlanillaPDF, exportarCalendarioPDF } from "./utils/exportPDF";
import { keyDiaFromDate, obtenerSemanasDelMes } from "./utils/fechas";
import { generarAlertasHorarios } from "./utils/alertasHorarios";
import { TURNOS, obtenerConfiguracionTurno } from "./config/turnos";
import {
  crearEstadoMensualVacio,
  crearPlanillaMensualVacia
} from "./utils/estadoMensual";
import {
  cargarEstadoTurnoMes,
  guardarEstadoTurnoMes
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

const crearInstantanea = (data) => JSON.parse(JSON.stringify(data));


function App() {
 const [turnoActivo, setTurnoActivo] = useState(null);
 const configTurno = turnoActivo ? obtenerConfiguracionTurno(turnoActivo) : null;
 const [estadoPorTurnoMes, setEstadoPorTurnoMes] = useState({});
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
const debouncesGuardadoRef = useRef(new Map());
const colaGuardadoRef = useRef(new Map());
const versionesGuardadoRef = useRef(new Map());
const mesesConErrorGuardadoRef = useRef(new Set());
const guardadoEnCursoRef = useRef(false);
const procesarColaGuardadoRef = useRef(null);
const referenciasEstadoRef = useRef(new Map());
const identidadesEstadoRef = useRef(new Map());
const mesesCargadosRef = useRef(new Set());
const cargandoRef = useRef(true);
const cargaActualRef = useRef({ id: 0, clave: null });
const [cargando, setCargando] = useState(true);
const [estadoGuardado, setEstadoGuardado] = useState("loading");

const [dataPDFEnf, setDataPDFEnf] = useState({ asignaciones: [], libres: [] });
const [dataPDFLic, setDataPDFLic] = useState({ asignaciones: [], libres: [] });

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

const setDiaParo = (keyDia, activo) => {
  setEstadoPorTurnoMes(prev => {
    const actual = prev[claveActiva] || getMesData(mesActivo);
    const diasActuales = actual.calendario?.diasParo || {};
    const nuevosDiasParo = { ...diasActuales };

    if (activo) {
      nuevosDiasParo[keyDia] = true;
    } else {
      delete nuevosDiasParo[keyDia];
    }

    return {
      ...prev,
      [claveActiva]: {
        ...actual,
        calendario: {
          ...actual.calendario,
          diasParo: nuevosDiasParo
        }
      }
    };
  });
};

// 🔹 PERSONAL
const personal = mesData.personal;

// 🔹 PLANILLAS
const planillaEnfermeros = mesData.planillas.enfermeros;
const planillaLicenciados = mesData.planillas.licenciados;
// 🔹 LICENCIAS

const licenciasMes = mesData.licencias;
const certificacionesMes = mesData.certificaciones || [];

const semanas = obtenerSemanasDelMes(mesActivo);

const guardarMes = useCallback(async (turnoId, mes, data) => {
  if (!data) return null;

  try {
    await guardarEstadoTurnoMes(turnoId, mes, data);
    return null;
  } catch (error) {
    return error;
  }
}, []);

const actualizarEstadoGuardadoDesdeCola = useCallback(() => {
  if (guardadoEnCursoRef.current) {
    setEstadoGuardado("saving");
    return;
  }

  if (colaGuardadoRef.current.size > 0) {
    const hayPendientesReintentables = [...colaGuardadoRef.current.keys()].some(
      (clave) => !mesesConErrorGuardadoRef.current.has(clave)
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

const encolarGuardado = useCallback(({ clave, turnoId, mes, data }) => {
  const version = (versionesGuardadoRef.current.get(clave) || 0) + 1;
  versionesGuardadoRef.current.set(clave, version);
  colaGuardadoRef.current.set(clave, {
    clave,
    turnoId,
    mes,
    data: crearInstantanea(data),
    version
  });
  mesesConErrorGuardadoRef.current.delete(clave);
  setEstadoGuardado("saving");
  procesarColaGuardadoRef.current?.();
}, []);

const procesarColaGuardado = useCallback(async () => {
  if (guardadoEnCursoRef.current) return;

  const siguiente = [...colaGuardadoRef.current.entries()].find(
    ([clave]) => !mesesConErrorGuardadoRef.current.has(clave)
  );

  if (!siguiente) {
    actualizarEstadoGuardadoDesdeCola();
    return;
  }

  const [clave, pendiente] = siguiente;
  colaGuardadoRef.current.delete(clave);
  guardadoEnCursoRef.current = true;
  setEstadoGuardado("saving");

  let error;
  try {
    error = await guardarMes(pendiente.turnoId, pendiente.mes, pendiente.data);
  } catch {
    error = new Error("No se pudo guardar el estado mensual.");
  } finally {
    guardadoEnCursoRef.current = false;
  }

  if (error) {
    const pendienteMasNuevo = colaGuardadoRef.current.get(clave);

    if (!pendienteMasNuevo || pendienteMasNuevo.version <= pendiente.version) {
      colaGuardadoRef.current.set(clave, pendiente);
      mesesConErrorGuardadoRef.current.add(clave);
    }
  }

  procesarColaGuardadoRef.current?.();
}, [actualizarEstadoGuardadoDesdeCola, guardarMes]);

useEffect(() => {
  procesarColaGuardadoRef.current = procesarColaGuardado;
}, [procesarColaGuardado]);

useEffect(() => {
  cargandoRef.current = cargando;
}, [cargando]);

useEffect(() => {
  if (cargando) return;

  Object.entries(estadoPorTurnoMes).forEach(([clave, data]) => {
    if (referenciasEstadoRef.current.get(clave) === data) return;

    referenciasEstadoRef.current.set(clave, data);

    if (mesesCargadosRef.current.delete(clave)) return;

    const identidad = identidadesEstadoRef.current.get(clave);
    if (!identidad) return;

    clearTimeout(debouncesGuardadoRef.current.get(clave));
    const timeout = setTimeout(() => {
      if (debouncesGuardadoRef.current.get(clave) !== timeout) return;

      debouncesGuardadoRef.current.delete(clave);

      encolarGuardado({ clave, ...identidad, data });
    }, 500);

    debouncesGuardadoRef.current.set(clave, timeout);
  });
}, [estadoPorTurnoMes, cargando, encolarGuardado]);

useEffect(() => () => {
  debouncesGuardadoRef.current.forEach((timeout) => clearTimeout(timeout));
}, []);

const setPlanillaEnfermeros = (nueva) => {
  setEstadoPorTurnoMes(prev => {
    const actual = getMesData(mesActivo);

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
    const actual = getMesData(mesActivo);

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
    const actual = prev[claveActiva] || getMesData(mesActivo);
    const personaId = String(personaAnterior?.id ?? "").trim();
    const indicePersona = actual.personal?.findIndex(
      (persona) => String(persona?.id ?? "").trim() === personaId
    ) ?? -1;

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
    const actual = prev[claveActiva] || getMesData(mesActivo);
    const personaId = String(persona?.id ?? "").trim();
    if (!personaId || !actual.personal?.some(
      (item) => String(item?.id ?? "").trim() === personaId
    )) return prev;

    return {
      ...prev,
      [claveActiva]: renombrarPersonaEnEstado(actual, personaId, nombreNuevo)
    };
  });
};

const eliminarPersona = (persona) => {
  setEstadoPorTurnoMes((prev) => {
    const actual = prev[claveActiva] || getMesData(mesActivo);
    const personaId = String(persona?.id ?? "").trim();
    const personaActual = actual.personal?.find(
      (item) => String(item?.id ?? "").trim() === personaId
    );
    if (!personaActual) return prev;

    return {
      ...prev,
      [claveActiva]: limpiarReferenciasDePersona(actual, personaActual)
    };
  });
};

const limpiarPersonal = () => {
  setEstadoPorTurnoMes((prev) => {
    const actual = prev[claveActiva] || getMesData(mesActivo);
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
      cargarEstado: cargarEstadoTurnoMes
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
    cargandoRef.current = true;
    setCargando(true); // 👈 empieza carga
    setEstadoGuardado("loading");

    let resultado;
    let error;

    try {
      resultado = await cargarEstadoTurnoMes(turnoActivo, mesActivo);
    } catch (errorCarga) {
      error = errorCarga;
    }

    if (
      cargaId !== cargaActualRef.current.id ||
      claveCarga !== cargaActualRef.current.clave
    ) return;

    if (resultado?.existe) {
      setEstadoPorTurnoMes(prev => {
        if (prev[claveCarga]) return prev;

        mesesCargadosRef.current.add(claveCarga);
        return {
          ...prev,
          [claveCarga]: resultado.estado
        };
      });
    }

    cargandoRef.current = false;
    setCargando(false); // 👈 termina carga
    if (!error) actualizarEstadoGuardadoDesdeCola();
  };

  cargar();
}, [mesActivo, turnoActivo, actualizarEstadoGuardadoDesdeCola]);

const copiarMesAnterior = async () => {
  const [year, month] = mesActivo.split("-").map(Number);

  const fechaAnterior = new Date(year, month - 2);
  const keyAnterior = `${fechaAnterior.getFullYear()}-${String(
    fechaAnterior.getMonth() + 1
  ).padStart(2, "0")}`;

  // 👇 traer desde Supabase SI o SI
  let resultado;

  try {
    resultado = await cargarEstadoTurnoMes(turnoActivo, keyAnterior);
  } catch {
    alert("No hay datos del mes anterior");
    return;
  }

  if (!resultado.existe) {
    alert("No hay datos del mes anterior");
    return;
  }

  let validacion;
  try {
    validacion = await validarPersonasDisponiblesEnOtrosTurnos(
      resultado.estado.personal || []
    );
  } catch {
    alert("No se pudo verificar en qué turno está el personal. Intentá nuevamente.");
    return;
  }

  if (validacion.cancelada) return;

  if (validacion.existeEnOtroTurno) {
    alert(
      `${validacion.personaValidada.nombre} ya pertenece al Turno ${validacion.turnoNombre} en el mes actual.`
    );
    return;
  }

  setEstadoPorTurnoMes(prev => ({
    ...prev,
    [claveActiva]: resultado.estado
  }));
};

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
  cargandoRef.current = true;
  setTurnoActivo(turnoId);
};

const cambiarTurno = () => {
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

if (!turnoActivo) {
  return <SelectorTurno turnos={TURNOS} onSeleccionar={seleccionarTurno} />;
}

if (cargando) {
  return <div>Cargando datos...</div>;
}



/*console.log("PLANILLA LIC:", planillaLicenciados);
console.log("SEMANA LIC:", planillaLicenciados?.semana1);
console.log("🔁 TAB ACTUAL:", tabCalendario);*/

const textoEstadoGuardado = {
  loading: "Cargando...",
  saving: "Guardando...",
  saved: "Guardado",
  error: "Error al guardar"
}[estadoGuardado];

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
    {textoEstadoGuardado && (
      <span
        className={`text-sm ${
          estadoGuardado === "error" ? "text-red-600" : "text-slate-500"
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
  <button
    type="button"
    onClick={cambiarTurno}
    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
  >
    Cambiar turno
  </button>
  </div>
</div>

      

      <Seccion titulo="👥 Personal" className="order-3">
        <ListaPersonal
          personal={personal}
          mesActivo={mesActivo}
          configTurno={configTurno}
          onActualizarPersona={actualizarPersona}
          onRenombrarPersona={renombrarPersona}
          onEliminarPersona={eliminarPersona}
          onLimpiarPersonal={limpiarPersonal}
          onValidarExclusividadTurno={validarPersonaDisponibleEnOtrosTurnos}
          setPersonal={(nuevo) => {
            setEstadoPorTurnoMes(prev => ({
              ...prev,
              [claveActiva]: {
                ...getMesData(mesActivo),
                personal: nuevo
              }
            }));
          }}
        />
        <button
  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm shadow-sm transition"
  onClick={copiarMesAnterior}
>
  🔁 <span>Copiar mes anterior</span>
</button>
      </Seccion>

      

<Seccion titulo="📊 Planilla mensual" className="order-2">

<button
  onClick={() =>
    exportarPlanillaPDF(
      planillaEnfermeros,
      planillaLicenciados,
      semanas,
      personal
    )
  }
  className="mb-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm shadow-sm transition"
>
  📄 Exportar planilla PDF
</button>
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
      personal={personal}
      planilla={planillaEnfermeros}
      setPlanilla={setPlanillaEnfermeros}
      tipo="enfermero"
      licencias={licenciasMes}
      mesActivo={mesActivo}
    />
  )}

  {tabPlanilla === "licenciados" && (
    <PlanillaMensual
      personal={personal}
      planilla={planillaLicenciados}
      setPlanilla={setPlanillaLicenciados}
      tipo="licenciado"
      licencias={licenciasMes}
      mesActivo={mesActivo}
    />
  )}



      {mesActivo === mesSiguiente && (
        <div className="mb-4">
          <button
  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm shadow-sm transition"
            onClick={async () => {
              const [year, month] = mesActivo.split("-").map(Number);

              const fechaAnterior = new Date(year, month - 2);
              const keyAnterior = `${fechaAnterior.getFullYear()}-${String(
                fechaAnterior.getMonth() + 1
              ).padStart(2, "0")}`;

              let resultado;

              try {
                resultado = await cargarEstadoTurnoMes(turnoActivo, keyAnterior);
              } catch {
                alert("No hay planilla anterior");
                return;
              }

              const estadoAnterior = resultado.existe ? resultado.estado : null;

              const semanasAnteriores = obtenerSemanasDelMes(keyAnterior);
              const ultimaSemanaAnterior = semanasAnteriores.at(-1)?.clave || "semana5";
              const baseEnf =
                estadoAnterior?.planillas.enfermeros[ultimaSemanaAnterior] ||
                estadoAnterior?.planillas.enfermeros.semana5;
              const baseLic =
                estadoAnterior?.planillas.licenciados[ultimaSemanaAnterior] ||
                estadoAnterior?.planillas.licenciados.semana5;

              if (!baseEnf && !baseLic) {
                alert("No hay planilla anterior");
                return;
              }

              if (baseEnf) {
                setPlanillaEnfermeros({
                  ...crearPlanillaMensualVacia(),
                  semana1: { ...baseEnf }
                });
              }

              if (baseLic) {
                setPlanillaLicenciados({
                  ...crearPlanillaMensualVacia(),
                  semana1: { ...baseLic }
                });
              }
            }}
          >
            ⚡ <span>Continuar desde mes anterior</span>
          </button>
        </div>
      )}

      </Seccion>

      <Seccion titulo="🏖 Licencias" className="order-4">
        <Licencias
          personal={personal}
          licencias={licenciasMes}
          setLicencias={(nueva) => {
            setEstadoPorTurnoMes(prev => ({
              ...prev,
              [claveActiva]: {
                ...getMesData(mesActivo),
                licencias: nueva
              }
            }));
          }}
        />
      </Seccion>

      <Seccion titulo="🩺 Certificaciones médicas" className="order-4">
        <Certificaciones
          personal={personal}
          certificaciones={certificacionesMes}
          setCertificaciones={(nuevas) => {
            setEstadoPorTurnoMes(prev => ({
              ...prev,
              [claveActiva]: {
                ...getMesData(mesActivo),
                certificaciones: nuevas
              }
            }));
          }}
        />
      </Seccion>

      <div id="calendario-pdf" className="order-1">
        
        <Seccion titulo="📅 Calendario diario" defaultAbierto>
          

  <button
  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm shadow-sm transition"
  onClick={() =>
    exportarCalendarioPDF({
      fecha,
      enfermeros: dataPDFEnf,
      licenciados: dataPDFLic
    })
  }
>
  📄 Exportar calendario PDF
</button>
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
  key="enfermeros"
    personal={personal}
    planilla={planillaEnfermeros}
    tipo="enfermero"
    mesActivo={mesActivo}
    licencias={licenciasMes}
    certificaciones={certificacionesMes}
    calendario={mesData.calendario.enfermeros}
    esDiaParo={Boolean(diasParo[keyDiaFromDate(fecha)])}
    setDiaParo={setDiaParo}
     onDataReady={setDataPDFEnf}
    fecha={fecha}
    setFecha={setFecha}
    setCalendario={(update) => {
      setEstadoPorTurnoMes(prev => {
        const actual = prev[claveActiva] || getMesData(mesActivo);
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
  key="licenciados"
    personal={personal}
    planilla={planillaLicenciados}
    tipo="licenciado"
    mesActivo={mesActivo}
    licencias={licenciasMes}
    certificaciones={certificacionesMes}
    calendario={mesData.calendario.licenciados}
    esDiaParo={Boolean(diasParo[keyDiaFromDate(fecha)])}
    setDiaParo={setDiaParo}
    onDataReady={setDataPDFLic}
    fecha={fecha}
    setFecha={setFecha}
    setCalendario={(update) => {
      setEstadoPorTurnoMes(prev => {
        const actual = prev[claveActiva] || getMesData(mesActivo);
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
