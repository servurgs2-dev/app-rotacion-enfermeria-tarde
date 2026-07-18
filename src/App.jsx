import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ListaPersonal from "./components/personal/ListaPersonal";
import PlanillaMensual from "./components/planilla/PlanillaMensual";
import CalendarioDiario from "./components/calendario/CalendarioDiario";
import Seccion from "./components/ui/Seccion";
import Licencias from "./components/licencias/Licencias";
import Certificaciones from "./components/certificaciones/Certificaciones";
import { supabase } from "./supabase";
import { exportarPlanillaPDF, exportarCalendarioPDF } from "./utils/exportPDF";
import { keyDiaFromDate, obtenerSemanasDelMes } from "./utils/fechas";
import { generarAlertasHorarios } from "./utils/alertasHorarios";
import { TURNO_POR_DEFECTO, obtenerConfiguracionTurno } from "./config/turnos";
import {
  crearEstadoMensualVacio,
  crearPlanillaMensualVacia,
  normalizarEstadoMensual
} from "./utils/estadoMensual";
import {
  limpiarReferenciasDeCategoria,
  limpiarReferenciasDePersona
} from "./utils/integridadPersonas";

const crearInstantanea = (data) => JSON.parse(JSON.stringify(data));


function App() {
 const turnoActivo = TURNO_POR_DEFECTO;
 const configTurno = obtenerConfiguracionTurno(turnoActivo);
 const [estadoPorMes, setEstadoPorMes] = useState({});
  const [mesActivo, setMesActivo] = useState(() => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
});

const [tabPlanilla, setTabPlanilla] = useState("enfermeros");
const [tabCalendario, setTabCalendario] = useState("enfermeros");

const [fecha, setFecha] = useState(new Date());
const debouncesGuardadoRef = useRef(new Map());
const colaGuardadoRef = useRef(new Map());
const versionesGuardadoRef = useRef(new Map());
const mesesConErrorGuardadoRef = useRef(new Set());
const guardadoEnCursoRef = useRef(false);
const procesarColaGuardadoRef = useRef(null);
const referenciasEstadoRef = useRef(new Map());
const mesesCargadosRef = useRef(new Set());
const cargandoRef = useRef(true);
const cargaActualRef = useRef(0);
const [cargando, setCargando] = useState(true);
const [estadoGuardado, setEstadoGuardado] = useState("loading");

const [dataPDFEnf, setDataPDFEnf] = useState({ asignaciones: [], libres: [] });
const [dataPDFLic, setDataPDFLic] = useState({ asignaciones: [], libres: [] });

//console.log("🔁 TAB ACTUAL:", tabCalendario);

const getMesData = (mes) => {
  return estadoPorMes[mes] || crearEstadoMensualVacio();
};



const mesData = getMesData(mesActivo);
const diasParo = mesData.calendario?.diasParo || {};
const keyDiaActual = keyDiaFromDate(fecha);
const esDiaParoActual = Boolean(diasParo[keyDiaActual]);
const alertasHorarios = useMemo(() => {
  if (
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
  setEstadoPorMes(prev => {
    const actual = prev[mesActivo] || getMesData(mesActivo);
    const diasActuales = actual.calendario?.diasParo || {};
    const nuevosDiasParo = { ...diasActuales };

    if (activo) {
      nuevosDiasParo[keyDia] = true;
    } else {
      delete nuevosDiasParo[keyDia];
    }

    return {
      ...prev,
      [mesActivo]: {
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

const guardarMes = useCallback(async (mes, data) => {
  if (!data) return null;

  const { error } = await supabase
    .from("estado_por_mes")
    .upsert({ mes, data }, { onConflict: "mes" });

  return error;
}, []);

const actualizarEstadoGuardadoDesdeCola = useCallback(() => {
  if (guardadoEnCursoRef.current) {
    setEstadoGuardado("saving");
    return;
  }

  if (colaGuardadoRef.current.size > 0) {
    const hayPendientesReintentables = [...colaGuardadoRef.current.keys()].some(
      (mes) => !mesesConErrorGuardadoRef.current.has(mes)
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

const encolarGuardado = useCallback((mes, data) => {
  const version = (versionesGuardadoRef.current.get(mes) || 0) + 1;
  versionesGuardadoRef.current.set(mes, version);
  colaGuardadoRef.current.set(mes, {
    data: crearInstantanea(data),
    version
  });
  mesesConErrorGuardadoRef.current.delete(mes);
  setEstadoGuardado("saving");
  procesarColaGuardadoRef.current?.();
}, []);

const procesarColaGuardado = useCallback(async () => {
  if (guardadoEnCursoRef.current) return;

  const siguiente = [...colaGuardadoRef.current.entries()].find(
    ([mes]) => !mesesConErrorGuardadoRef.current.has(mes)
  );

  if (!siguiente) {
    actualizarEstadoGuardadoDesdeCola();
    return;
  }

  const [mes, pendiente] = siguiente;
  colaGuardadoRef.current.delete(mes);
  guardadoEnCursoRef.current = true;
  setEstadoGuardado("saving");

  let error;
  try {
    error = await guardarMes(mes, pendiente.data);
  } catch {
    error = new Error("No se pudo guardar el estado mensual.");
  } finally {
    guardadoEnCursoRef.current = false;
  }

  if (error) {
    const pendienteMasNuevo = colaGuardadoRef.current.get(mes);

    if (!pendienteMasNuevo || pendienteMasNuevo.version <= pendiente.version) {
      colaGuardadoRef.current.set(mes, pendiente);
      mesesConErrorGuardadoRef.current.add(mes);
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

  Object.entries(estadoPorMes).forEach(([mes, data]) => {
    if (referenciasEstadoRef.current.get(mes) === data) return;

    referenciasEstadoRef.current.set(mes, data);

    if (mesesCargadosRef.current.delete(mes)) return;

    clearTimeout(debouncesGuardadoRef.current.get(mes));
    const timeout = setTimeout(() => {
      if (debouncesGuardadoRef.current.get(mes) !== timeout) return;

      debouncesGuardadoRef.current.delete(mes);

      encolarGuardado(mes, data);
    }, 500);

    debouncesGuardadoRef.current.set(mes, timeout);
  });
}, [estadoPorMes, cargando, encolarGuardado]);

useEffect(() => () => {
  debouncesGuardadoRef.current.forEach((timeout) => clearTimeout(timeout));
}, []);

const setPlanillaEnfermeros = (nueva) => {
  setEstadoPorMes(prev => {
    const actual = getMesData(mesActivo);

    return {
      ...prev,
      [mesActivo]: {
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
  setEstadoPorMes(prev => {
    const actual = getMesData(mesActivo);

    return {
      ...prev,
      [mesActivo]: {
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
  setEstadoPorMes((prev) => {
    const actual = prev[mesActivo] || getMesData(mesActivo);
    const indicePersona = actual.personal?.indexOf(personaAnterior) ?? -1;

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

    return { ...prev, [mesActivo]: nuevoMes };
  });
};

const eliminarPersona = (persona) => {
  setEstadoPorMes((prev) => {
    const actual = prev[mesActivo] || getMesData(mesActivo);

    if (!actual.personal?.includes(persona)) return prev;

    return {
      ...prev,
      [mesActivo]: limpiarReferenciasDePersona(actual, persona)
    };
  });
};

const limpiarPersonal = () => {
  setEstadoPorMes((prev) => {
    const actual = prev[mesActivo] || getMesData(mesActivo);
    const nuevoMes = (actual.personal || []).reduce(
      (mes, persona) => limpiarReferenciasDePersona(mes, persona),
      actual
    );

    return { ...prev, [mesActivo]: nuevoMes };
  });
};


useEffect(() => {
  const cargar = async () => {
    const cargaId = cargaActualRef.current + 1;
    cargaActualRef.current = cargaId;
    cargandoRef.current = true;
    setCargando(true); // 👈 empieza carga
    setEstadoGuardado("loading");

    const { data, error } = await supabase
      .from("estado_por_mes")
      .select("*")
      .eq("mes", mesActivo)
      .maybeSingle();

    if (cargaId !== cargaActualRef.current) return;

    if (data?.data) {
      const estadoNormalizado = normalizarEstadoMensual(data.data);

      setEstadoPorMes(prev => {
        if (prev[mesActivo]) return prev;

        mesesCargadosRef.current.add(mesActivo);
        return {
          ...prev,
          [mesActivo]: estadoNormalizado
        };
      });
    }

    cargandoRef.current = false;
    setCargando(false); // 👈 termina carga
    if (!error) actualizarEstadoGuardadoDesdeCola();
  };

  cargar();
}, [mesActivo, actualizarEstadoGuardadoDesdeCola]);

const copiarMesAnterior = async () => {
  const [year, month] = mesActivo.split("-").map(Number);

  const fechaAnterior = new Date(year, month - 2);
  const keyAnterior = `${fechaAnterior.getFullYear()}-${String(
    fechaAnterior.getMonth() + 1
  ).padStart(2, "0")}`;

  // 👇 traer desde Supabase SI o SI
  const { data } = await supabase
    .from("estado_por_mes")
    .select("*")
    .eq("mes", keyAnterior)
    .maybeSingle();

  if (!data) {
    alert("No hay datos del mes anterior");
    return;
  }

  setEstadoPorMes(prev => ({
    ...prev,
    [mesActivo]: normalizarEstadoMensual(data.data)
  }));
};

const hoy = new Date();

const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

const mesSiguienteFecha = new Date(hoy.getFullYear(), hoy.getMonth() + 1);

const mesSiguiente = `${mesSiguienteFecha.getFullYear()}-${String(
  mesSiguienteFecha.getMonth() + 1
).padStart(2, "0")}`;

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
  <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
    🏥 Gestión de Urgencias
  </h1>

  <div className="flex items-center gap-3">
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

  cargaActualRef.current += 1;
  setMesActivo(nuevoMes);

  const [year, month] = nuevoMes.split("-").map(Number);
  const ultimoDiaDelNuevoMes = new Date(year, month, 0).getDate();
  const diaSeleccionado = Math.min(fecha.getDate(), ultimoDiaDelNuevoMes);

  setFecha(new Date(year, month - 1, diaSeleccionado, 12));
}}
    className="border border-slate-300 rounded-lg px-3 py-2 text-sm shadow-sm"
  />
  </div>
</div>

      

      <Seccion titulo="👥 Personal" className="order-3">
        <ListaPersonal
          personal={personal}
          mesActivo={mesActivo}
          configTurno={configTurno}
          onActualizarPersona={actualizarPersona}
          onEliminarPersona={eliminarPersona}
          onLimpiarPersonal={limpiarPersonal}
          setPersonal={(nuevo) => {
            setEstadoPorMes(prev => ({
              ...prev,
              [mesActivo]: {
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
      semanas
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

              const { data } = await supabase
                .from("estado_por_mes")
                .select("*")
                .eq("mes", keyAnterior)
                .maybeSingle();

              const estadoAnterior = data?.data
                ? normalizarEstadoMensual(data.data)
                : null;

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
            setEstadoPorMes(prev => ({
              ...prev,
              [mesActivo]: {
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
            setEstadoPorMes(prev => ({
              ...prev,
              [mesActivo]: {
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
      setEstadoPorMes(prev => {
        const actual = prev[mesActivo] || getMesData(mesActivo);
        const calendarioActual = actual.calendario?.enfermeros || {};

        const nuevoCalendario =
          typeof update === "function"
            ? update(calendarioActual)
            : update;

        return {
          ...prev,
          [mesActivo]: {
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
      setEstadoPorMes(prev => {
        const actual = prev[mesActivo] || getMesData(mesActivo);
        const calendarioActual = actual.calendario?.licenciados || {};

        const nuevoCalendario =
          typeof update === "function"
            ? update(calendarioActual)
            : update;

        return {
          ...prev,
          [mesActivo]: {
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
