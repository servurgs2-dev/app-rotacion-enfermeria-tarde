import { describirRedistribucion } from "../../utils/redistribucionEnfermeros.js";
import ModalMobileShell from "../ui/ModalMobileShell.jsx";

export default function PanelConfirmacionRedistribucion({
  tipo,
  error,
  onCancelar,
  onConfirmar
}) {
  const esVueltaComun = tipo === "comun";
  const titulo = esVueltaComun
    ? "¿Volver a la distribución común?"
    : tipo === "boxes"
      ? "¿Aplicar Redistribución opción 2?"
      : "¿Aplicar Redistribución opción 1?";

  return (
    <ModalMobileShell
      ariaLabelledby="titulo-redistribucion"
      backdropClassName="bg-slate-950/55"
      panelClassName="px-5 pt-5 shadow-2xl sm:px-5 sm:pt-5 sm:pb-5"
    >
        <h2 id="titulo-redistribucion" className="text-lg font-semibold text-slate-900">
          {titulo}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          {describirRedistribucion(tipo)}
        </p>
        {esVueltaComun && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            También se eliminarán los cambios manuales realizados en esta fecha después de aplicar la redistribución. Personal, Planilla mensual, extras, licencias y otras fechas no se modificarán.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            {esVueltaComun
              ? "Sí, volver a distribución común"
              : "Sí, aplicar redistribución"}
          </button>
        </div>
    </ModalMobileShell>
  );
}
