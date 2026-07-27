function PanelReiniciarMes({
  turnoNombre,
  periodoVisible,
  textoConfirmacion,
  error,
  onCambiarTexto,
  onCancelar,
  onConfirmar
}) {
  const confirmacionValida = textoConfirmacion.trim() === "REINICIAR";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-reiniciar-mes"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="titulo-reiniciar-mes" className="text-lg font-semibold text-slate-900">
          ¿Reiniciar completamente {periodoVisible}?
        </h2>
        <p className="mt-3 text-sm text-slate-700">
          Se eliminarán todos los datos del turno {turnoNombre} para este mes:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Personal</li>
          <li>Planilla de Enfermeros</li>
          <li>Planilla de Licenciados</li>
          <li>Calendario Diario</li>
          <li>extras y no disponibles</li>
          <li>licencias</li>
          <li>certificaciones</li>
          <li>cierres</li>
          <li>rotación nocturna</li>
          <li>configuración flexible</li>
        </ul>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Esta acción no afecta otros meses ni otros turnos.
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-800" htmlFor="confirmacion-reiniciar-mes">
          Escribí REINICIAR para confirmar
        </label>
        <input
          id="confirmacion-reiniciar-mes"
          type="text"
          value={textoConfirmacion}
          onChange={(evento) => onCambiarTexto(evento.target.value)}
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
        />

        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!confirmacionValida}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Sí, reiniciar mes completo
          </button>
        </div>
      </div>
    </div>
  );
}

export default PanelReiniciarMes;
