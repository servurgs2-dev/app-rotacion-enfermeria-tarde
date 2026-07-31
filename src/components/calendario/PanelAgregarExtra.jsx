export default function PanelAgregarExtra({
  formulario,
  candidatos,
  personasCubribles = [],
  onCambiar,
  onCancelar,
  onConfirmar
}) {
  if (!formulario) return null;
  const esPersonal = formulario.modalidad === "personal_otro_turno";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-agregar-extra"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 id="titulo-agregar-extra" className="text-lg font-semibold text-slate-900">
          Agregar Extra
        </h3>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onCambiar("modalidad", "personal_otro_turno")}
            className={`rounded-lg border px-3 py-2 text-sm ${
              esPersonal ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-300"
            }`}
          >
            Personal de otro turno
          </button>
          <button
            type="button"
            onClick={() => onCambiar("modalidad", "manual")}
            className={`rounded-lg border px-3 py-2 text-sm ${
              !esPersonal ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-300"
            }`}
          >
            Extra manual
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Tipo de extra
          <select
            value={formulario.tipoExtra}
            disabled={formulario.cargando}
            onChange={(evento) => onCambiar("tipoExtra", evento.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="cobertura">Cubre a un funcionario</option>
            <option value="refuerzo">Refuerzo sin reemplazo</option>
          </select>
        </label>

        {formulario.tipoExtra === "cobertura" && (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            ¿A quién cubre?
            <select
              value={formulario.personaCubiertaId}
              disabled={formulario.cargando}
              onChange={(evento) => onCambiar("personaCubiertaId", evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Seleccionar funcionario</option>
              {personasCubribles.map((opcion) => (
                <option key={opcion.persona.id} value={opcion.persona.id}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </label>
        )}

        {esPersonal ? (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Persona
            <select
              value={formulario.personaId}
              disabled={formulario.cargando}
              onChange={(evento) => onCambiar("personaId", evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">
                {formulario.cargando ? "Cargando Personal…" : "Seleccionar persona"}
              </option>
              {candidatos.map((candidato) => (
                <option
                  key={`${candidato.turnoOrigen}|${candidato.persona.id}`}
                  value={`${candidato.turnoOrigen}|${candidato.persona.id}`}
                >
                  {candidato.etiqueta}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Nombre
              <input
                value={formulario.nombre}
                onChange={(evento) => onCambiar("nombre", evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Número de funcionario (opcional)
              <input
                value={formulario.funcionario}
                onChange={(evento) => onCambiar("funcionario", evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </>
        )}

        {formulario.error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formulario.error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="rounded-lg border px-3 py-2">
            Cancelar
          </button>
          <button
            type="button"
            disabled={formulario.cargando}
            onClick={onConfirmar}
            className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
          >
            Agregar Extra
          </button>
        </div>
      </section>
    </div>
  );
}
