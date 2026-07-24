import { useState } from "react";
import { validarConfirmacionRestauracion } from "../../utils/restauracionHistorial.js";
import {
  formatearAutorHistorial,
  formatearFechaHistorial,
  formatearSeccionHistorial,
  formatearTurnoHistorial
} from "./historialPresentacion.js";

function PanelRestauracionHistorial({
  revision,
  disponibilidad,
  restauracion,
  onPreparar,
  onRestaurar,
  onCancelar
}) {
  const [aceptaReemplazo, setAceptaReemplazo] = useState(false);
  const [aceptaAnalisisParcial, setAceptaAnalisisParcial] = useState(false);
  const [textoConfirmacion, setTextoConfirmacion] = useState("");
  const impacto = restauracion.preflight?.impacto || null;
  const ocupada = ["preparando", "restaurando"].includes(restauracion.estado);
  const requiereNuevoPreflight = restauracion.estado === "conflicto";
  const accionBloqueada = ["sin_permiso", "no_encontrado", "error_post_exito"].includes(
    restauracion.estado
  );
  const hayCambiosGeneralesSinDesglose =
    Array.isArray(impacto?.seccionesCambiadas) &&
    impacto.seccionesCambiadas.length > 0 &&
    impacto?.totales?.agregados === 0 &&
    impacto?.totales?.eliminados === 0 &&
    impacto?.totales?.modificados === 0;

  const confirmacionValida = validarConfirmacionRestauracion({
    aceptaReemplazo,
    texto: textoConfirmacion,
    analisisIncompleto: impacto?.analisisIncompleto === true,
    aceptaAnalisisParcial
  });

  return (
    <section className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h4 className="font-bold text-amber-950">Restaurar esta revisión</h4>
      <p className="mt-1 text-sm text-amber-900">
        La restauración reemplaza el estado mensual operativo completo y crea una revisión nueva.
      </p>

      {!disponibilidad.permitida && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">
          {disponibilidad.mensaje}
        </p>
      )}

      {restauracion.error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {restauracion.error}
        </p>
      )}
      {restauracion.mensaje && (
        <p aria-live="polite" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {restauracion.mensaje}
        </p>
      )}

      {!restauracion.preflight && (
        <button
          type="button"
          disabled={!disponibilidad.permitida || ocupada}
          onClick={onPreparar}
          className="mt-4 rounded-lg border border-amber-500 bg-white px-4 py-2 text-sm font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {restauracion.estado === "preparando" ? "Preparando impacto…" : "Preparar restauración"}
        </button>
      )}

      {restauracion.preflight && (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 rounded-lg bg-white p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-slate-500">Turno y mes</dt><dd className="font-medium">{formatearTurnoHistorial(revision.turno)} · {revision.mes}</dd></div>
            <div><dt className="text-slate-500">Revisión de origen</dt><dd className="font-medium">{revision.revision}</dd></div>
            <div><dt className="text-slate-500">Revisión operativa actual</dt><dd className="font-medium">{restauracion.preflight.revisionEsperada}</dd></div>
            <div><dt className="text-slate-500">Fecha histórica</dt><dd className="font-medium">{formatearFechaHistorial(revision.createdAt)}</dd></div>
            <div><dt className="text-slate-500">Cuenta registrada</dt><dd className="font-medium">{formatearAutorHistorial(revision)}</dd></div>
            <div><dt className="text-slate-500">Último guardado actual</dt><dd className="font-medium">{formatearFechaHistorial(restauracion.preflight.updatedAt)}</dd></div>
          </dl>

          {restauracion.preflight.sinCambios ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Esta revisión ya coincide con el estado actual.
            </p>
          ) : (
            <>
              {impacto?.analisisIncompleto ? (
                <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
                  El análisis del impacto es parcial debido al tamaño o profundidad de los datos.
                </p>
              ) : impacto?.truncado ? (
                <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  Se limitaron algunas vistas previas, pero los totales del impacto están completos.
                </p>
              ) : null}
              {hayCambiosGeneralesSinDesglose && (
                <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  Se detectaron cambios generales en secciones que no admiten un desglose más específico.
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-emerald-100 p-2"><strong>{impacto?.totales.agregados ?? 0}</strong><span className="block text-xs">Agregados</span></div>
                <div className="rounded-lg bg-red-100 p-2"><strong>{impacto?.totales.eliminados ?? 0}</strong><span className="block text-xs">Eliminados</span></div>
                <div className="rounded-lg bg-blue-100 p-2"><strong>{impacto?.totales.modificados ?? 0}</strong><span className="block text-xs">Modificados</span></div>
              </div>

              <div className="max-h-64 space-y-3 overflow-y-auto overscroll-contain rounded-lg bg-white p-3">
                {(impacto?.seccionesCambiadas || []).map((seccion) => (
                  <section key={seccion}>
                    <h5 className="font-semibold text-slate-800">{formatearSeccionHistorial(seccion)}</h5>
                    <ul className="mt-1 space-y-1 text-sm text-slate-700">
                      {(impacto.detalle?.[seccion] || []).map((cambio, indice) => (
                        <li key={`${cambio.tipo}-${cambio.ruta || cambio.identidad || indice}`} className="rounded bg-slate-50 px-2 py-1">
                          {cambio.descripcion}
                          {cambio.ruta && <span className="block break-all text-xs text-slate-500">{cambio.ruta}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <div className="space-y-3 rounded-lg border border-amber-300 bg-white p-3">
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input type="checkbox" checked={aceptaReemplazo} onChange={(event) => setAceptaReemplazo(event.target.checked)} className="mt-1" />
                  <span>Entiendo que se reemplazará el estado actual de este turno y mes por una revisión anterior.</span>
                </label>
                {impacto?.analisisIncompleto && (
                  <label className="flex items-start gap-2 text-sm text-slate-800">
                    <input type="checkbox" checked={aceptaAnalisisParcial} onChange={(event) => setAceptaAnalisisParcial(event.target.checked)} className="mt-1" />
                    <span>Entiendo que el análisis mostrado puede ser parcial.</span>
                  </label>
                )}
                <label htmlFor="confirmacion-restaurar" className="block text-sm font-medium text-slate-800">
                  Escribí RESTAURAR para confirmar
                  <input
                    id="confirmacion-restaurar"
                    type="text"
                    autoComplete="off"
                    value={textoConfirmacion}
                    onChange={(event) => setTextoConfirmacion(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <p className="text-xs text-slate-600">
                  Se espera la revisión {restauracion.preflight.revisionEsperada}. La restauración no borra versiones posteriores ni retrocede el contador.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onCancelar} disabled={ocupada} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={onRestaurar}
                    disabled={
                      !confirmacionValida ||
                      ocupada ||
                      requiereNuevoPreflight ||
                      accionBloqueada ||
                      !disponibilidad.permitida
                    }
                    className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restauracion.estado === "restaurando" ? "Restaurando…" : "Restaurar revisión"}
                  </button>
                </div>
              </div>
            </>
          )}

          {restauracion.estado === "conflicto" && (
            <button type="button" onClick={onPreparar} disabled={ocupada} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-800 disabled:opacity-50">
              Actualizar estado actual
            </button>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-amber-900">
        Las cuentas pueden ser compartidas y no identifican necesariamente a la persona física.
      </p>
    </section>
  );
}

export default PanelRestauracionHistorial;
