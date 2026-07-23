import { formatearFechaRemota } from "../../utils/resolucionConflicto.js";

function PanelConflictoEdicion({
  turnoNombre,
  mes,
  conflicto,
  estadoResolucion = "inactivo",
  error = "",
  puedeResolver = false,
  onDescargar,
  onUsarServidor,
  onConservarLocal
}) {
  const ocupado = ["descargando", "cargando_servidor", "guardando_local"].includes(
    estadoResolucion
  );

  return (
    <section className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-slate-800">
      <h2 className="text-lg font-bold text-red-800">Conflicto de edición</h2>
      <p className="mt-2">
        Este turno y mes fue modificado desde otra computadora después de que lo
        abriste. Tu versión local continúa disponible, pero el guardado automático
        está detenido.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-slate-500">Turno</dt><dd className="font-semibold">{turnoNombre}</dd></div>
        <div><dt className="text-slate-500">Mes</dt><dd className="font-semibold">{mes}</dd></div>
        <div><dt className="text-slate-500">Revisión remota</dt><dd className="font-semibold">{conflicto?.revisionRemota ?? "0"}</dd></div>
        <div><dt className="text-slate-500">Último guardado remoto</dt><dd className="font-semibold">{formatearFechaRemota(conflicto?.updatedAtRemoto)}</dd></div>
      </dl>
      <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-medium text-amber-900">
        Resolver el conflicto afecta el estado mensual completo, no solamente el
        último campo modificado. Incluye Enfermeros, Licenciados, planillas,
        calendario, cierres, licencias y certificaciones.
      </p>
      {estadoResolucion !== "inactivo" && estadoResolucion !== "error" && (
        <p className="mt-3 font-medium text-blue-700">Procesando resolución…</p>
      )}
      {error && <p className="mt-3 text-red-700" role="alert">{error}</p>}
      {puedeResolver && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={ocupado} onClick={onUsarServidor} className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-medium text-blue-700 disabled:opacity-50">
            Usar versión del servidor
          </button>
          <button type="button" disabled={ocupado} onClick={onConservarLocal} className="rounded-lg bg-red-700 px-3 py-2 font-medium text-white disabled:opacity-50">
            Conservar mi versión y guardar
          </button>
        </div>
      )}
      <details className="mt-4 rounded-lg border border-slate-300 bg-white px-3 py-2">
        <summary className="cursor-pointer font-medium text-slate-700">
          Opciones avanzadas
        </summary>
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          <p className="text-slate-600">
            Esta opción guarda una copia técnica de tus cambios locales en un
            archivo JSON. Utilizala solamente si te lo solicita el administrador.
          </p>
          <p className="text-xs text-slate-600">
            El archivo puede contener datos personales. Guardalo de forma segura
            y eliminálo cuando ya no sea necesario.
          </p>
          <button
            type="button"
            disabled={ocupado}
            onClick={onDescargar}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-medium text-slate-700 disabled:opacity-50"
          >
            Descargar respaldo técnico
          </button>
        </div>
      </details>
    </section>
  );
}

export default PanelConflictoEdicion;
