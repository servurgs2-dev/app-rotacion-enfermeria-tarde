import ControlesAsistenciaV2 from "../ControlesAsistenciaV2.jsx";
import { ESTADOS_ASISTENCIA } from "../../../utils/asistenciaPersonas.js";

const clasesEstado = Object.freeze({
  seleccionada: "border-amber-300 bg-amber-50",
  sacrificada: "border-slate-300 bg-slate-100",
  no_disponible: "border-orange-300 bg-orange-50",
  libre: "border-red-300 bg-red-50",
  normal: "border-slate-200 bg-white"
});

function TarjetaSectorMobile({ fila, soloLectura, onSeleccionar, onCambiarAsistencia, onGestionarNoDisponible }) {
  if (fila.tipo === "divider") {
    return <div className="h-2" role="separator" />;
  }

  const presente = fila.estadoAsistencia === ESTADOS_ASISTENCIA.PRESENTE;
  const claseTarjeta = presente
    ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200 shadow-md shadow-emerald-200/60"
    : clasesEstado[fila.estadoVisual] || clasesEstado.normal;

  return (
    <article
      className={`rounded-xl border px-3 py-2 transition-shadow ${claseTarjeta}`}
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
          <ControlesAsistenciaV2
            persona={fila.persona}
            nombre={fila.textoPersona}
            estado={fila.estadoAsistencia}
            confirmable={fila.puedeConfirmarPresente}
            puedeGestionarNoDisponible={fila.puedeMarcarNoDisponible}
            soloLectura={soloLectura}
            onCambiarAsistencia={onCambiarAsistencia}
            onGestionarNoDisponible={() => onGestionarNoDisponible(
              fila.personaGestionNoDisponible,
              fila.registroNoDisponible
            )}
          />
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
