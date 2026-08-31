import { useEffect, useRef, useState } from "react";
import {
  formatearMesHumano,
  obtenerIndicadorPeriodo,
  obtenerMesAdyacenteNavegable
} from "../../utils/navegacionMensual.js";

export default function NavegadorMeses({
  mesActivo,
  meses,
  turnoActivo,
  cargando,
  error,
  onSeleccionar
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);
  const anterior = obtenerMesAdyacenteNavegable({ lista: meses, mesActivo, direccion: -1 });
  const siguiente = obtenerMesAdyacenteNavegable({ lista: meses, mesActivo, direccion: 1 });
  const entradaActiva = meses.find(({ mes }) => mes === mesActivo);

  useEffect(() => {
    const cerrar = (evento) => {
      if (!contenedorRef.current?.contains(evento.target)) setAbierto(false);
    };
    document.addEventListener("pointerdown", cerrar);
    return () => document.removeEventListener("pointerdown", cerrar);
  }, []);
  const seleccionar = (mes) => {
    setAbierto(false);
    onSeleccionar(mes);
  };

  return (
    <div ref={contenedorRef} className="relative w-full sm:w-auto">
      <div className="flex min-h-11 items-stretch rounded-xl border border-slate-300 bg-white shadow-sm">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={!anterior}
          onClick={() => anterior && seleccionar(anterior)}
          className="min-h-11 min-w-11 rounded-l-xl text-xl text-slate-700 hover:bg-slate-100 disabled:text-slate-300"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          aria-label="Seleccionar mes"
          aria-expanded={abierto}
          onClick={() => setAbierto((actual) => !actual)}
          className="min-h-11 min-w-0 flex-1 border-x border-slate-200 px-3 py-1 text-center sm:min-w-44"
        >
          <span className="block truncate text-sm font-semibold text-slate-800">
            {formatearMesHumano(mesActivo)}
          </span>
          <span className="block text-xs text-slate-500">
            {obtenerIndicadorPeriodo(entradaActiva?.clasificacion) || "Período operativo"}
          </span>
        </button>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={!siguiente}
          onClick={() => siguiente && seleccionar(siguiente)}
          className="min-h-11 min-w-11 rounded-r-xl text-xl text-slate-700 hover:bg-slate-100 disabled:text-slate-300"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      {abierto && (
        <div className="absolute right-0 z-40 mt-2 max-h-72 w-full min-w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:w-72">
          {[...meses].reverse().map((entrada) => {
            const indicador = obtenerIndicadorPeriodo(entrada.clasificacion);
            const existeTurno = entrada.turnos.includes(turnoActivo);
            return (
              <button
                key={entrada.mes}
                type="button"
                aria-current={entrada.mes === mesActivo ? "true" : undefined}
                onClick={() => seleccionar(entrada.mes)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                  entrada.mes === mesActivo ? "bg-blue-50 text-blue-800" : "text-slate-700"
                }`}
              >
                <span className="font-medium">{formatearMesHumano(entrada.mes)}</span>
                <span className="text-right text-xs text-slate-500">
                  {indicador || (!existeTurno && entrada.existeGlobalmente ? "Sin datos en este turno" : "")}
                </span>
              </button>
            );
          })}
          {cargando && <p className="px-3 py-2 text-xs text-slate-500">Buscando históricos…</p>}
          {error && <p role="status" className="px-3 py-2 text-xs text-amber-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
