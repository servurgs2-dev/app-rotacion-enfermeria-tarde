import ModalMobileShell from "./ModalMobileShell.jsx";

function PanelConfirmacionLimpieza({
  titulo,
  descripcion,
  detalles = [],
  advertencia,
  error,
  textoConfirmar,
  onCancelar,
  onConfirmar
}) {
  return (
    <ModalMobileShell
      ariaLabelledby="titulo-confirmacion-limpieza"
      panelClassName="px-5 pt-5 sm:px-5 sm:pt-5 sm:pb-5"
    >
        <h3
          id="titulo-confirmacion-limpieza"
          className="text-lg font-semibold text-slate-900"
        >
          {titulo}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-700">{descripcion}</p>

        {detalles.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {detalles.map((detalle) => <li key={detalle}>{detalle}</li>)}
          </ul>
        )}

        {advertencia && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {advertencia}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
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
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            {textoConfirmar}
          </button>
        </div>
    </ModalMobileShell>
  );
}

export default PanelConfirmacionLimpieza;
