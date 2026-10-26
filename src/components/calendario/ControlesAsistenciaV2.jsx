import { ESTADOS_ASISTENCIA } from "../../utils/asistenciaPersonas.js";

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

function ControlesAsistenciaV2({
  persona,
  nombre,
  estado,
  confirmable = false,
  puedeGestionarNoDisponible = false,
  soloLectura = false,
  onCambiarAsistencia,
  onGestionarNoDisponible
}) {
  if (!persona) return null;

  const presente = estado === ESTADOS_ASISTENCIA.PRESENTE;
  const etiquetaPersona = nombre || persona.nombre || "la persona";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        aria-label={presente
          ? `Quitar presente de ${etiquetaPersona}`
          : `Marcar presente a ${etiquetaPersona}`}
        aria-pressed={presente}
        disabled={soloLectura || (!presente && !confirmable)}
        title={presente ? "Quitar presente" : confirmable ? "Marcar presente" : "No disponible para confirmar"}
        onClick={(evento) => {
          evento.stopPropagation();
          onCambiarAsistencia?.(
            persona,
            presente ? ESTADOS_ASISTENCIA.PENDIENTE : ESTADOS_ASISTENCIA.PRESENTE
          );
        }}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-lg font-semibold transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${
          presente
            ? "border-emerald-500 bg-emerald-100 text-emerald-900 shadow-sm shadow-emerald-300/40 ring-1 ring-emerald-300 hover:bg-emerald-200 focus-visible:ring-emerald-500/40"
            : "border-slate-300 bg-white text-slate-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:ring-emerald-500/30"
        }`}
      >
        <span aria-hidden="true">✅</span>
      </button>

      {puedeGestionarNoDisponible && (
        <button
          type="button"
          aria-label={`Marcar a ${etiquetaPersona} como no disponible`}
          disabled={soloLectura}
          title="Marcar no disponible"
          onClick={(evento) => {
            evento.stopPropagation();
            onGestionarNoDisponible?.();
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconoSacarDeDistribucion />
        </button>
      )}
    </div>
  );
}

export { IconoSacarDeDistribucion };
export default ControlesAsistenciaV2;
