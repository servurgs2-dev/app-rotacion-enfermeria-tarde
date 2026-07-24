import { useState } from "react";
import {
  formatearAccionHistorial,
  formatearAutorHistorial,
  formatearFechaHistorial,
  formatearSeccionHistorial,
  formatearTurnoHistorial
} from "./historialPresentacion.js";

const VistaValor = ({ titulo, valor }) => (
  <details className="rounded-lg border border-slate-200 bg-slate-50 p-2">
    <summary className="cursor-pointer text-xs font-medium text-slate-700">
      {titulo}
    </summary>
    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-2 text-xs text-slate-700">
      {JSON.stringify(valor, null, 2)}
    </pre>
  </details>
);

function DetalleHistorial({
  estado,
  error,
  revision,
  revisionAnterior,
  diferencias,
  onCerrar,
  onReintentar,
  onDescargar
}) {
  const [mostrarSnapshot, setMostrarSnapshot] = useState(false);

  if (estado === "cargando") {
    return (
      <div aria-live="polite" className="rounded-xl border border-slate-200 p-5">
        Cargando detalle…
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
        <p>{error}</p>
        <button type="button" onClick={onReintentar} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 font-medium">
          Reintentar
        </button>
      </div>
    );
  }
  if (!revision) return null;
  const tieneRevisionAnterior =
    revision.revisionAnterior && revision.revisionAnterior !== "0";

  return (
    <article className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            Revisión {revision.revision}
          </h3>
          <p className="text-sm text-slate-600">
            {formatearTurnoHistorial(revision.turno)} · {revision.mes} ·{" "}
            {formatearAccionHistorial(revision.accion)}
          </p>
        </div>
        <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
          Cerrar detalle
        </button>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-500">Fecha</dt><dd className="font-medium">{formatearFechaHistorial(revision.createdAt)}</dd></div>
        <div><dt className="text-slate-500">Cuenta</dt><dd className="font-medium">{formatearAutorHistorial(revision)}</dd></div>
        <div><dt className="text-slate-500">Rol registrado</dt><dd className="font-medium">{revision.rolSnapshot || "No registrado"}</dd></div>
        <div><dt className="text-slate-500">Secuencia</dt><dd className="font-medium">{revision.revisionAnterior ?? "—"} → {revision.revision}</dd></div>
        {revision.origenRevision && <div><dt className="text-slate-500">Revisión de origen</dt><dd className="font-medium">{revision.origenRevision}</dd></div>}
        {revision.turnoPerfilSnapshot && <div><dt className="text-slate-500">Turno del perfil</dt><dd className="font-medium">{formatearTurnoHistorial(revision.turnoPerfilSnapshot)}</dd></div>}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Secciones registradas">
        {revision.seccionesCambiadas.map((seccion) => (
          <span key={seccion} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
            {formatearSeccionHistorial(seccion)}
          </span>
        ))}
      </div>

      {!revisionAnterior && (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {tieneRevisionAnterior
            ? "La versión anterior no está disponible."
            : "Esta es la primera versión registrada; no existe una comparación anterior."}
        </p>
      )}

      {diferencias && (
        <section className="mt-5">
          <h4 className="font-bold text-slate-800">Diferencias</h4>
          {diferencias.analisisIncompleto ? (
            <p role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              El análisis se detuvo por el tamaño o profundidad de los datos. Las secciones y cantidades mostradas pueden ser parciales.
            </p>
          ) : diferencias.truncado ? (
            <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Se limitaron algunos detalles para mantener la pantalla ágil. Los totales del análisis siguen completos.
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-emerald-50 p-2"><strong>{diferencias.totales.agregados}</strong><span className="block text-xs">Agregados</span></div>
            <div className="rounded-lg bg-red-50 p-2"><strong>{diferencias.totales.eliminados}</strong><span className="block text-xs">Eliminados</span></div>
            <div className="rounded-lg bg-blue-50 p-2"><strong>{diferencias.totales.modificados}</strong><span className="block text-xs">Modificados</span></div>
          </div>
          <div className="mt-4 space-y-3">
            {Object.entries(diferencias.detalle).map(([seccion, cambios]) =>
              cambios.length ? (
                <section key={seccion} className="rounded-lg border border-slate-200 p-3">
                  <h5 className="font-semibold text-slate-800">{formatearSeccionHistorial(seccion)}</h5>
                  <ul className="mt-2 space-y-2">
                    {cambios.map((cambio, indice) => (
                      <li key={`${cambio.tipo}-${cambio.ruta || cambio.identidad || indice}`} className="rounded bg-slate-50 p-2 text-sm">
                        <p className="font-medium text-slate-700">{cambio.descripcion}</p>
                        {cambio.ruta && <p className="break-all text-xs text-slate-500">Ruta: {cambio.ruta}</p>}
                        {cambio.campos?.length > 0 && <p className="text-xs text-slate-500">Campos: {cambio.campos.join(", ")}</p>}
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {Object.hasOwn(cambio, "anterior") && <VistaValor titulo="Anterior" valor={cambio.anterior} />}
                          {Object.hasOwn(cambio, "nuevo") && <VistaValor titulo="Nuevo" valor={cambio.nuevo} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null
            )}
          </div>
        </section>
      )}

      <details className="mt-5 rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold text-slate-700">Opciones avanzadas</summary>
        <p className="mt-3 text-sm text-slate-600">
          El snapshot puede contener datos personales. Conservá cualquier descarga de forma segura.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMostrarSnapshot((actual) => !actual)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
            {mostrarSnapshot ? "Ocultar snapshot técnico" : "Ver snapshot técnico"}
          </button>
          <button type="button" onClick={onDescargar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
            Descargar snapshot técnico
          </button>
        </div>
        {mostrarSnapshot && (
          <div className="mt-3 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-medium">Secciones incluidas:</p>
            <ul className="mt-1 list-disc pl-5">
              {Object.keys(revision.data ?? {}).sort().map((clave) => <li key={clave}>{clave}</li>)}
            </ul>
            <p className="mt-2">La descarga contiene el snapshot completo.</p>
          </div>
        )}
      </details>
    </article>
  );
}

export default DetalleHistorial;
