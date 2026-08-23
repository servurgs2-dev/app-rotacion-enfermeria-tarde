import { useMemo } from "react";
import {
  construirNovedadesSupervisionDia,
  formatearPeriodoNovedadSupervision,
  resumirNovedadesSupervisionDia
} from "../../utils/novedadesSupervision.js";

function TarjetaNovedadSupervision({ novedad }) {
  const ausencia = novedad.clasificacion === "ausencia";
  const horario = novedad.tipo === "cambio_horario" &&
    novedad.datos?.horaEntrada && novedad.datos?.horaSalida
    ? `${novedad.datos.horaEntrada}–${novedad.datos.horaSalida}`
    : "";
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-bold text-slate-900">{novedad.personaNombre}</h3>
          <p className="mt-0.5 break-words text-xs text-slate-500">
            {novedad.categoriaEtiqueta} · {novedad.turnoNombre}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ausencia ? "bg-red-100 text-red-800" : "bg-cyan-100 text-cyan-800"}`}>
          {ausencia ? "Afecta disponibilidad" : "Informativa"}
        </span>
      </div>
      <p className="mt-3 text-sm font-extrabold text-indigo-800">{novedad.tipoEtiqueta}</p>
      <p className="mt-1 text-sm text-slate-700">{formatearPeriodoNovedadSupervision(novedad)}</p>
      {horario && <p className="mt-1 text-sm font-semibold text-cyan-800">Horario excepcional: {horario}</p>}
      {novedad.observacion && <p className="mt-2 break-words text-sm text-slate-600">{novedad.observacion}</p>}
    </article>
  );
}

function NovedadesSupervisionDia({
  fecha,
  estadosPorTurno,
  novedadesModernas,
  cargando = false,
  errorModernas = null
}) {
  const novedades = useMemo(() => construirNovedadesSupervisionDia({
    estadosPorTurno,
    novedadesModernas,
    fecha
  }), [estadosPorTurno, fecha, novedadesModernas]);
  const resumen = useMemo(() => resumirNovedadesSupervisionDia(novedades), [novedades]);

  if (cargando) {
    return <section aria-label="Novedades del d\u00eda" className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Cargando novedades&hellip;</section>;
  }

  return (
    <section aria-label="Novedades del d\u00eda" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Novedades del d&iacute;a</h2>
          <p className="mt-1 text-sm text-slate-600">Todos los turnos · {resumen.total} registradas</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">Ausencias {resumen.ausencias}</span>
          <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-cyan-800">Informativas {resumen.informativas}</span>
        </div>
      </div>
      {errorModernas && (
        <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Parte de las novedades no pudo cargarse. Se muestran Licencias y Certificaciones disponibles.
        </p>
      )}
      {novedades.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          Sin novedades registradas para este d&iacute;a.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {novedades.map((novedad) => (
            <TarjetaNovedadSupervision key={novedad.idEstable} novedad={novedad} />
          ))}
        </div>
      )}
    </section>
  );
}

export default NovedadesSupervisionDia;
