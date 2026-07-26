function PanelPrepararMes({
  analisis,
  posicionesSeleccionadas,
  error,
  onAlternarPosicion,
  onCancelar,
  onConfirmar
}) {
  const enfermeros = analisis.enfermeros;
  const flex = enfermeros.analisis;
  const seleccionadas = new Set(posicionesSeleccionadas);
  const criticos = posicionesSeleccionadas.filter((fila) =>
    enfermeros.sectoresCriticos.includes(fila)
  );
  const seleccionCompleta =
    posicionesSeleccionadas.length === flex.cantidadPosicionesNoAplicables;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-preparar-mes"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="titulo-preparar-mes" className="text-xl font-bold text-slate-900">
          Preparar mes siguiente
        </h3>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <p><strong>Turno:</strong> {analisis.turnoNombre}</p>
          <p><strong>Origen:</strong> {analisis.mesOrigen}</p>
          <p><strong>Destino:</strong> {analisis.mesDestino}</p>
          <p><strong>Estado:</strong> {analisis.destino.clasificacion}</p>
          <p><strong>Revisión:</strong> {analisis.revisionDestino}</p>
        </div>

        <section className="mt-5 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Personal</h4>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-5">
            <p>Total: {analisis.conteosPersonal.total}</p>
            <p>Enfermeros: {analisis.conteosPersonal.enfermeros}</p>
            <p>Licenciados: {analisis.conteosPersonal.licenciados}</p>
            <p>Licencias vigentes: {analisis.licencias.length}</p>
            <p>Certificaciones vigentes: {analisis.certificaciones.length}</p>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <h4 className="font-semibold text-blue-950">Enfermeros</h4>
            <div className="mt-2 space-y-1 text-sm">
              <p>Estrategia: {enfermeros.estrategia.tipo === "cada_3_dias" ? "Cada tres días" : "Semanal"}</p>
              <p>Base: {enfermeros.claveBase}</p>
              <p>Posiciones: {enfermeros.filas.length}</p>
              <p>Personas válidas: {flex.cantidadPersonas}</p>
              <p>Posiciones vacías: {flex.filasVacias.join(", ") || "Ninguna"}</p>
              <p>No aplicables requeridas: {flex.cantidadPosicionesNoAplicables}</p>
              {enfermeros.estrategia.tipo === "cada_3_dias" && (
                <p>Bloques del destino: {enfermeros.bloquesDestino.length}</p>
              )}
            </div>

            {flex.cantidadPosicionesNoAplicables > 0 && (
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-slate-800">
                  Seleccioná exactamente {flex.cantidadPosicionesNoAplicables}
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {enfermeros.filas.map((fila) => {
                    const vacia = flex.filasVacias.includes(fila);
                    return (
                      <label
                        key={fila}
                        className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
                          vacia ? "bg-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionadas.has(fila)}
                          disabled={!vacia}
                          onChange={() => onAlternarPosicion(fila)}
                        />
                        <span>{fila} — {flex.nombresPorFila[fila] || "Vacía"}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {criticos.length > 0 && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Advertencia: seleccionaste sectores críticos: {criticos.join(", ")}.
                Podés continuar si la selección es intencional.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <h4 className="font-semibold text-emerald-950">Licenciados</h4>
            <div className="mt-2 space-y-1 text-sm">
              <p>Estrategia: Semanal</p>
              <p>Base: {analisis.licenciados.claveBase}</p>
              <p>Posiciones: {analisis.licenciados.filas.length}</p>
              <p>Personas válidas: {analisis.licenciados.cantidadPersonas}</p>
              <p>Salud Mental conserva su comportamiento fijo.</p>
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
          <h4 className="font-semibold text-slate-900">No se copiará</h4>
          <p className="mt-2">
            Extras, no disponibles, asistencia, cambios diarios, días de paro,
            cierres ni el calendario del mes anterior.
          </p>
        </section>

        {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancelar} className="rounded-lg border px-4 py-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!seleccionCompleta}
            className="rounded-lg bg-purple-600 px-4 py-2 text-white disabled:bg-slate-300"
          >
            Confirmar preparación
          </button>
        </div>
      </div>
    </div>
  );
}

export default PanelPrepararMes;
