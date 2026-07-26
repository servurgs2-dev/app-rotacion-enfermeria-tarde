function PanelIntercambioPlanilla({
  periodos,
  periodoClave,
  filaOrigen,
  filaDestino,
  opciones,
  resumen,
  error,
  onCambiarPeriodo,
  onCambiarOrigen,
  onCambiarDestino,
  onCancelar,
  onConfirmar
}) {
  const origen = opciones.find((opcion) => opcion.fila === filaOrigen);
  const opcionesDestino = opciones.filter((opcion) => opcion.fila !== filaOrigen);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-intercambio-planilla"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="titulo-intercambio-planilla" className="text-lg font-semibold text-slate-900">
          ⇄ Intercambiar personas
        </h3>

        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Período
            <select
              value={periodoClave}
              onChange={(evento) => onCambiarPeriodo(evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              {periodos.map((periodo) => (
                <option key={periodo.clave} value={periodo.clave}>
                  {periodo.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Primera posición
            <select
              value={filaOrigen}
              onChange={(evento) => onCambiarOrigen(evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <option value="">Seleccionar posición</option>
              {opciones.map((opcion) => (
                <option key={opcion.fila} value={opcion.fila}>
                  {opcion.fila} — {opcion.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Segunda posición
            <select
              value={filaDestino}
              disabled={!origen}
              onChange={(evento) => onCambiarDestino(evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:bg-slate-100"
            >
              <option value="">Seleccionar posición</option>
              {opcionesDestino.map((opcion) => (
                <option key={opcion.fila} value={opcion.fila}>
                  {opcion.fila} — {opcion.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {resumen && (
          <div className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">Intercambiar:</p>
            <p className="mt-2">{resumen.origen.nombre} — {resumen.origen.fila}</p>
            <p className="my-1">con</p>
            <p>{resumen.destino.nombre} — {resumen.destino.fila}</p>
            <p className="mt-3 font-medium">Período: {resumen.periodoEtiqueta}</p>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-rose-700" role="alert">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancelar} className="rounded-lg border px-4 py-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!resumen}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:bg-slate-300"
          >
            Confirmar intercambio
          </button>
        </div>
      </div>
    </div>
  );
}

export default PanelIntercambioPlanilla;
