import { useEffect } from "react";

const PanelExtraLibre = ({
  formulario,
  personasCubribles,
  onCambiar,
  onCancelar,
  onConfirmar
}) => {
  useEffect(() => {
    if (!formulario) return undefined;
    const cerrarConEscape = (evento) => {
      if (evento.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", cerrarConEscape);
    return () => window.removeEventListener("keydown", cerrarConEscape);
  }, [formulario, onCancelar]);

  if (!formulario) return null;
  const esCobertura = formulario.motivoLibre === "cobertura_companero";
  const puedeConfirmar = Boolean(
    formulario.motivoLibre &&
    (!esCobertura || formulario.personaCubiertaId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-extra-libre"
        className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-2xl sm:max-h-[calc(100vh-2rem)]"
      >
        <h4 id="titulo-extra-libre" className="font-semibold text-blue-950">
          Funcionario que viene en su libre
        </h4>
        <p className="mt-1 text-sm text-blue-900">
          <span className="font-medium">{formulario.persona.nombre}</span>
          {` · ${formulario.fecha}`}
        </p>

        <fieldset className="mt-3 space-y-2">
        <legend className="text-sm font-medium text-slate-700">Motivo</legend>
        <label className="flex items-start gap-2 rounded-lg border border-blue-100 bg-white p-3 text-sm">
          <input
            type="radio"
            name="motivo-extra-libre"
            value="cobertura_companero"
            checked={esCobertura}
            onChange={(evento) => onCambiar("motivoLibre", evento.target.value)}
          />
          Viene en su libre para cubrir a otro compañero
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-blue-100 bg-white p-3 text-sm">
          <input
            type="radio"
            name="motivo-extra-libre"
            value="pedido_supervision"
            checked={formulario.motivoLibre === "pedido_supervision"}
            onChange={(evento) => onCambiar("motivoLibre", evento.target.value)}
          />
          Viene en su libre por pedido de Supervisión
        </label>
        </fieldset>

        {esCobertura && (
        <label className="mt-3 block text-sm font-medium text-slate-700">
          ¿A quién cubre?
          <select
            value={formulario.personaCubiertaId}
            onChange={(evento) => onCambiar("personaCubiertaId", evento.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Seleccionar compañero</option>
            {personasCubribles.map((opcion) => (
              <option key={opcion.persona.id} value={opcion.persona.id}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>
        )}

        {formulario.error && (
          <p role="alert" className="mt-3 text-sm text-red-700">{formulario.error}</p>
        )}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!puedeConfirmar}
          onClick={onConfirmar}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Confirmar
        </button>
        </div>
      </section>
    </div>
  );
};

export default PanelExtraLibre;
