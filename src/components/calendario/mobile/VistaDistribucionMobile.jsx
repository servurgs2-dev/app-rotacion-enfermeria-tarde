import { ESTADOS_ASISTENCIA } from "../../../utils/asistenciaPersonas.js";

const clasesEstado = Object.freeze({
  seleccionada: "border-amber-300 bg-amber-50",
  sacrificada: "border-slate-300 bg-slate-100",
  no_disponible: "border-orange-300 bg-orange-50",
  libre: "border-red-300 bg-red-50",
  normal: "border-slate-200 bg-white"
});

function IconoSacarDeDistribucion() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7.5" cy="7" r="3" />
      <path d="M2.75 18.5c.45-3 2.1-4.75 4.75-4.75 1.35 0 2.45.45 3.25 1.25" />
      <path d="M13 11.5h8" />
      <path d="m18 8.5 3 3-3 3" />
    </svg>
  );
}

function TarjetaSectorMobile({ fila, soloLectura, onSeleccionar, onCambiarAsistencia, onGestionarNoDisponible }) {
  if (fila.tipo === "divider") {
    return <div className="h-2" role="separator" />;
  }

  return (
    <article
      className={`rounded-xl border px-3 py-2 shadow-sm ${clasesEstado[fila.estadoVisual] || clasesEstado.normal}`}
      data-sector-id={fila.sectorId || undefined}
      data-synthetic-id={fila.syntheticId || undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          disabled={soloLectura}
          onClick={() => onSeleccionar(fila.original)}
          className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 disabled:cursor-default"
          aria-label={`Seleccionar sector ${fila.nombre}`}
        >
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            {fila.nombre}
            {fila.criticoSinCobertura && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 normal-case tracking-normal text-red-800">
                Crítico
              </span>
            )}
          </span>
          <span className={`mt-0.5 block truncate text-sm font-semibold ${fila.persona ? "text-slate-950" : "text-red-700"}`}>
            {fila.textoPersona}
          </span>
        </button>

        {fila.persona && (
          <>
            <select
              aria-label={`Asistencia de ${fila.textoPersona}`}
              value={fila.estadoAsistencia}
              disabled={soloLectura}
              onClick={(evento) => evento.stopPropagation()}
              onChange={(evento) => onCambiarAsistencia(fila.persona, evento.target.value)}
              className={`min-h-11 max-w-28 rounded-lg border px-1.5 text-xs font-medium ${
                fila.estadoAsistencia === ESTADOS_ASISTENCIA.PRESENTE
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : fila.estadoAsistencia === ESTADOS_ASISTENCIA.AUSENTE
                    ? "border-red-300 bg-red-50 text-red-800"
                    : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              <option value={ESTADOS_ASISTENCIA.PENDIENTE}>Pendiente</option>
              <option value={ESTADOS_ASISTENCIA.PRESENTE}>✓ Presente</option>
              <option value={ESTADOS_ASISTENCIA.AUSENTE}>✕ Ausente</option>
            </select>
            {fila.puedeMarcarNoDisponible && (
              <button
                type="button"
                aria-label={`Marcar a ${fila.textoPersona} como no disponible`}
                title="Marcar no disponible"
                onClick={(evento) => {
                  evento.stopPropagation();
                  onGestionarNoDisponible(fila.personaGestionNoDisponible, fila.registroNoDisponible);
                }}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-800 transition hover:bg-amber-100 active:bg-amber-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/30"
              >
                <IconoSacarDeDistribucion />
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function VistaDistribucionMobile({
  asignaciones = [],
  soloLectura = false,
  onSeleccionar,
  onCambiarAsistencia,
  onGestionarNoDisponible
}) {
  return (
    <div className="space-y-1.5 md:hidden" aria-label="Distribución diaria por sectores">
      {asignaciones.map((fila) => (
        <TarjetaSectorMobile
          key={fila.clave}
          fila={fila}
          soloLectura={soloLectura}
          onSeleccionar={onSeleccionar}
          onCambiarAsistencia={onCambiarAsistencia}
          onGestionarNoDisponible={onGestionarNoDisponible}
        />
      ))}
    </div>
  );
}

export { TarjetaSectorMobile };
export default VistaDistribucionMobile;
