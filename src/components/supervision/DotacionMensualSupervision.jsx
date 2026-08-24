import { useMemo, useState } from "react";
import { TURNOS } from "../../config/turnos.js";
import { parsearFechaLocal } from "../../utils/fechas.js";
import { resumirEstadisticasSupervisionMes } from "../../utils/estadisticasSupervisionMes.js";
import { proyectarSupervisionMes } from "../../utils/proyeccionSupervisionMes.js";
import EstadisticasDotacionSupervision from "./EstadisticasDotacionSupervision.jsx";

const TURNOS_MENSUALES = Object.freeze(Object.keys(TURNOS));
const CATEGORIAS = Object.freeze([
  ["licenciado", "Licenciados"],
  ["enfermero", "Enfermeros"]
]);
const DIAS_SEMANA = Object.freeze(["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]);
const PRESENTACION_ESTADO = Object.freeze({
  critico: { etiqueta: "Crítico", clases: "border-red-200 bg-red-50 text-red-900" },
  bajo_optimo: { etiqueta: "Bajo óptimo", clases: "border-amber-200 bg-amber-50 text-amber-950" },
  optimo: { etiqueta: "Óptimo", clases: "border-emerald-200 bg-emerald-50 text-emerald-950" },
  sin_datos: { etiqueta: "Sin datos", clases: "border-slate-200 bg-slate-50 text-slate-700" }
});

const etiquetaDia = (fecha) => {
  const fechaLocal = parsearFechaLocal(fecha);
  return `${fecha.slice(-2)} ${DIAS_SEMANA[fechaLocal.getDay()]}`;
};

function CeldaDotacionMensual({ datos }) {
  const cantidad = datos?.proyeccion?.dotacionPrevistaOperativa?.cantidad;
  const base = datos?.proyeccion?.previstosBase?.cantidad;
  const disponible = datos?.disponible === true &&
    Number.isInteger(cantidad) && Number.isInteger(base);
  const estado = disponible ? datos?.estadoDotacion?.estado : "sin_datos";
  const presentacion = PRESENTACION_ESTADO[estado] || PRESENTACION_ESTADO.sin_datos;

  if (!disponible) {
    return (
      <div className={`min-w-0 rounded-lg border px-2 py-2 text-center ${presentacion.clases}`}>
        <strong className="block break-words text-sm">Sin datos</strong>
      </div>
    );
  }

  return (
    <div className={`min-w-0 rounded-lg border px-2 py-2 text-center ${presentacion.clases}`}>
      <strong className="block text-xl font-extrabold tabular-nums">{cantidad}</strong>
      <span className="block text-xs font-semibold tabular-nums">Base {base}</span>
      <span className="mt-1 block break-words text-[11px] font-bold">{presentacion.etiqueta}</span>
    </div>
  );
}

function DotacionMensualSupervision({
  mes,
  fechaSeleccionada,
  estadosPorTurno,
  novedadesModernas,
  configuracionDotacion,
  cargando = false,
  errorTotal = false
}) {
  const [turnoSeleccionado, setTurnoSeleccionado] = useState(() => TURNOS_MENSUALES[0]);
  const resultadoMensual = useMemo(() => proyectarSupervisionMes({
    estadosPorTurno,
    novedadesModernas,
    mes,
    configuracionDotacion
  }), [estadosPorTurno, novedadesModernas, mes, configuracionDotacion]);
  const estadisticasMensuales = useMemo(
    () => resumirEstadisticasSupervisionMes(resultadoMensual),
    [resultadoMensual]
  );

  if (cargando) {
    return (
      <section aria-label="Dotación mensual" className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Cargando dotaci&oacute;n mensual&hellip;
      </section>
    );
  }

  if (errorTotal || !resultadoMensual.ok) {
    return (
      <section aria-label="Dotación mensual" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-extrabold text-slate-900">Dotaci&oacute;n mensual</h2>
        <p className="mt-2 text-sm text-slate-600">No hay datos suficientes para proyectar este mes.</p>
      </section>
    );
  }

  return (
    <section aria-label="Dotación mensual" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900">Dotaci&oacute;n mensual</h2>
          <p className="mt-1 break-words text-sm text-slate-600">Dotaci&oacute;n operativa y base planificada por d&iacute;a</p>
        </div>
        <span className="text-xs font-bold text-slate-500">{resultadoMensual.cantidadDias} d&iacute;as</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Turno de la dotación mensual">
        {TURNOS_MENSUALES.map((turnoId) => {
          const activo = turnoId === turnoSeleccionado;
          return (
            <button
              key={turnoId}
              type="button"
              aria-pressed={activo}
              onClick={() => setTurnoSeleccionado(turnoId)}
              className={`min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 ${activo ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {TURNOS[turnoId].nombre}
            </button>
          );
        })}
      </div>

      <EstadisticasDotacionSupervision
        estadisticas={estadisticasMensuales}
        turnoSeleccionado={turnoSeleccionado}
        categorias={CATEGORIAS}
      />

      <div className="mt-4 max-w-3xl">
        <div className="grid grid-cols-[minmax(3.5rem,0.55fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-1 text-xs font-bold text-slate-600">
          <span>D&iacute;a</span>
          {CATEGORIAS.map(([categoria, titulo]) => <span key={categoria} className="break-words text-center">{titulo}</span>)}
        </div>
        <div className="mt-2 grid gap-2">
          {resultadoMensual.dias.map((dia) => {
            const seleccionado = dia.fecha === fechaSeleccionada;
            return (
              <div
                key={dia.fecha}
                className={`grid min-w-0 grid-cols-[minmax(3.5rem,0.55fr)_minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-2 rounded-xl p-1 ${seleccionado ? "bg-indigo-50 ring-2 ring-indigo-300" : "bg-slate-50"}`}
              >
                <time dateTime={dia.fecha} className="self-center break-words px-1 text-xs font-extrabold text-slate-700">
                  {etiquetaDia(dia.fecha)}
                </time>
                {CATEGORIAS.map(([categoria]) => (
                  <CeldaDotacionMensual
                    key={categoria}
                    datos={dia.turnos?.[turnoSeleccionado]?.[categoria]}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p><strong>Operativa:</strong> base planificada, menos bajas conocidas, m&aacute;s Extras que aportan.</p>
        <p><strong>Base:</strong> personal planificado menos libres programados.</p>
      </div>
    </section>
  );
}

export default DotacionMensualSupervision;
