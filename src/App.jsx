import { useState, useEffect } from "react";
import ListaPersonal from "./components/personal/ListaPersonal";
import PlanillaMensual from "./components/planilla/PlanillaMensual";
import CalendarioDiario from "./components/calendario/CalendarioDiario";
import Seccion from "./components/ui/Seccion";
import Licencias from "./components/licencias/Licencias";
import { supabase } from "./supabase";
import { useRef } from "react";
import { exportarPDF } from "./utils/exportPDF";


function App() {
 const [estadoPorMes, setEstadoPorMes] = useState({});
  const [mesActivo, setMesActivo] = useState(() => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
});

const [tabPlanilla, setTabPlanilla] = useState("enfermeros");
const [fecha, setFecha] = useState(new Date());
const timeoutRef = useRef(null);
const [cargando, setCargando] = useState(true);

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
  if (cargando) return;

  clearTimeout(timeoutRef.current);

  timeoutRef.current = setTimeout(async () => {
    const mesData = estadoPorMes[mesActivo];

    if (!mesData) return;

    const { error } = await supabase
      .from("estado_por_mes")
      .upsert(
        {
          mes: mesActivo,
          data: mesData
        },
        { onConflict: "mes" }
      );

    if (error) {
      console.error("Error guardando:", error);
    } else {
      console.log("Guardado OK");
    }
  }, 500); // espera 500ms

}, [estadoPorMes, mesActivo, cargando]);

useEffect(() => {
  const cargar = async () => {
    setCargando(true); // 👈 empieza carga

    const { data } = await supabase
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
    .single();

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


return (
  <div className="min-h-screen bg-slate-100 p-4 md:p-6">
  <div className="max-w-6xl mx-auto space-y-6">

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
  <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
    🏥 Gestión de Urgencias
  </h1>

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
  setFecha(new Date(year, month - 1, 1)); // ✅ CLAVE
}}
    className="border border-slate-300 rounded-lg px-3 py-2 text-sm shadow-sm"
  />
</div>

      

      <Seccion titulo="👥 Personal">
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

      

<Seccion titulo="📊 Planilla mensual">

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

      <Seccion titulo="🏖 Licencias">
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

      <div id="calendario-pdf">
        <div className="max-h-[70vh] overflow-y-auto pr-2">
        <Seccion titulo="📅 Calendario diario">
          <CalendarioDiario
  personal={personal}
  planilla={planillaEnfermeros}
  tipo="enfermero"
  mesActivo={mesActivo}
  licencias={licenciasMes}
  calendario={mesData.calendario.enfermeros}
  fecha={fecha}            // ✅
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

          <CalendarioDiario
  personal={personal}
  planilla={planillaLicenciados}
  tipo="licenciado"
  mesActivo={mesActivo}
  licencias={licenciasMes}
  fecha={fecha}            // ✅
  setFecha={setFecha}  
  calendario={mesData.calendario.licenciados}
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

        </Seccion>
        </div>
      </div>

      <button
  className="mt-6 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm shadow-md transition"
  onClick={() => exportarPDF("calendario-pdf", "calendario")}
>
  📄 <span>Exportar PDF</span>
</button>

    </div>
  </div>
);
}

export default App;