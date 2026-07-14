import { useState, useEffect, useRef } from "react";
import ListaPersonal from "./components/personal/ListaPersonal";
import PlanillaMensual from "./components/planilla/PlanillaMensual";
import CalendarioDiario from "./components/calendario/CalendarioDiario";
import Seccion from "./components/ui/Seccion";
import Licencias from "./components/licencias/Licencias";
import { supabase } from "./supabase";
import { exportarPlanillaPDF, exportarCalendarioPDF } from "./utils/exportPDF";
import { obtenerSemanasDelMes } from "./utils/fechas";



function App() {
 const [estadoPorMes, setEstadoPorMes] = useState({});
  const [mesActivo, setMesActivo] = useState(() => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
});

const [tabPlanilla, setTabPlanilla] = useState("enfermeros");
const [tabCalendario, setTabCalendario] = useState("enfermeros");

const [fecha, setFecha] = useState(new Date());
const timeoutRef = useRef(null);
const ultimaSolicitudGuardadoRef = useRef(0);
const [cargando, setCargando] = useState(true);
const [estadoGuardado, setEstadoGuardado] = useState("loading");

const [dataPDFEnf, setDataPDFEnf] = useState([]);
const [dataPDFLic, setDataPDFLic] = useState([]);

//console.log("🔁 TAB ACTUAL:", tabCalendario);

function crearEstructuraBase() {
  return {
    semana1: {},
    semana2: {},
    semana3: {},
    semana4: {},
    semana5: {}
  };
}
const getMesData = (mes) => {
  return estadoPorMes[mes] || {
    personal: [],
    planillas: {
      enfermeros: crearEstructuraBase(),
      licenciados: crearEstructuraBase()
    },
    calendario: {
      enfermeros: {
        cambiosDia: {},
        extras: {},
        noDisponibles: {}
      },
      licenciados: {
        cambiosDia: {},
        extras: {},
        noDisponibles: {}
      }
    }, // 👈 ESTA COMA FALTABA
    licencias: []
  };
};



const mesData = getMesData(mesActivo);

// 🔹 PERSONAL
const personal = mesData.personal;

// 🔹 PLANILLAS
const planillaEnfermeros = mesData.planillas.enfermeros;
const planillaLicenciados = mesData.planillas.licenciados;
// 🔹 LICENCIAS

const licenciasMes = mesData.licencias;

const semanas = obtenerSemanasDelMes(mesActivo);

const guardarMes = async (mes, data) => {
  if (!data) return null;

  const { error } = await supabase
    .from("estado_por_mes")
    .upsert({ mes, data }, { onConflict: "mes" });

  return error;
};

useEffect(() => {
  if (cargando) return;

  clearTimeout(timeoutRef.current);

  timeoutRef.current = setTimeout(async () => {
    const mesData = estadoPorMes[mesActivo];
    if (!mesData) return;

    const solicitudId = ultimaSolicitudGuardadoRef.current + 1;
    ultimaSolicitudGuardadoRef.current = solicitudId;

    setEstadoGuardado("saving");
    const error = await guardarMes(mesActivo, mesData);
    if (solicitudId === ultimaSolicitudGuardadoRef.current) {
      setEstadoGuardado(error ? "error" : "saved");
    }
  }, 500);
}, [estadoPorMes, mesActivo, cargando]);

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


useEffect(() => {
  const cargar = async () => {
    setCargando(true); // 👈 empieza carga

    ultimaSolicitudGuardadoRef.current += 1;
    setEstadoGuardado("loading");

    const { data, error } = await supabase
      .from("estado_por_mes")
      .select("*")
      .eq("mes", mesActivo)
      .maybeSingle();

    if (data?.data) {
      setEstadoPorMes(prev => ({
        ...prev,
        [mesActivo]: data.data
      }));
    }

    setCargando(false); // 👈 termina carga
    if (!error) {
      setEstadoGuardado("saved");
    }
  };

  cargar();
}, [mesActivo]);

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
    [mesActivo]: data.data
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

  setMesActivo(nuevoMes);

  const [year, month] = nuevoMes.split("-").map(Number);
  setFecha(new Date(year, month - 1, 1, 12));
}}
    className="border border-slate-300 rounded-lg px-3 py-2 text-sm shadow-sm"
  />
  </div>
</div>

      

      <Seccion titulo="👥 Personal" className="order-3">
        <ListaPersonal
          personal={personal}
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

              const baseEnf = data?.data?.planillas?.enfermeros?.semana5;
              const baseLic = data?.data?.planillas?.licenciados?.semana5;

              if (!baseEnf && !baseLic) {
                alert("No hay planilla anterior");
                return;
              }

              if (baseEnf) {
                setPlanillaEnfermeros({
                  semana1: baseEnf,
                  semana2: {},
                  semana3: {},
                  semana4: {},
                  semana5: {}
                });
              }

              if (baseLic) {
                setPlanillaLicenciados({
                  semana1: baseLic,
                  semana2: {},
                  semana3: {},
                  semana4: {},
                  semana5: {}
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

{tabCalendario === "enfermeros" && (
  <CalendarioDiario
  key="enfermeros"
    personal={personal}
    planilla={planillaEnfermeros}
    tipo="enfermero"
    mesActivo={mesActivo}
    licencias={licenciasMes}
    calendario={mesData.calendario.enfermeros}
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
)}

{tabCalendario === "licenciados" && (
  <CalendarioDiario
  key="licenciados"
    personal={personal}
    planilla={planillaLicenciados}
    tipo="licenciado"
    mesActivo={mesActivo}
    licencias={licenciasMes}
    calendario={mesData.calendario.licenciados}
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
)}

        </Seccion>
        </div>
      </div>

    

    </div>
  
);
}

export default App;
