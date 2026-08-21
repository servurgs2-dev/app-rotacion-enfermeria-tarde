import PrioridadCoberturaMes from "./PrioridadCoberturaMes.jsx";

const CATEGORIAS = ["enfermero", "licenciado"];

function PanelPrioridadCoberturaMes({
  turnoNombre,
  mes,
  borradores,
  error = "",
  onActualizar,
  onCancelar,
  onGuardar
}) {
  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3 sm:p-4">
      <h3 className="text-lg font-semibold text-slate-900">Prioridad de cobertura</h3>
      <p className="mt-1 text-sm text-slate-600">
        Define qué sectores se cubren primero. No modifica la Planilla.
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">
        {turnoNombre} · {mes}
      </p>
      <div className="mt-4 space-y-6">
        {CATEGORIAS.map((categoria) => {
          const borrador = borradores?.[categoria];
          if (!borrador) return null;
          return (
            <PrioridadCoberturaMes
              key={categoria}
              categoria={categoria}
              filas={borrador.filas}
              prioridadCoberturaSectorIds={borrador.prioridadCoberturaSectorIds}
              onCambiarPrioridad={(prioridadCoberturaSectorIds) =>
                onActualizar?.(categoria, prioridadCoberturaSectorIds)
              }
            />
          );
        })}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-5 grid gap-2 sm:flex sm:justify-end">
        <button type="button" onClick={onCancelar}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          Cancelar
        </button>
        <button type="button" onClick={onGuardar}
          className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Guardar prioridad
        </button>
      </div>
    </div>
  );
}

export default PanelPrioridadCoberturaMes;
