import { useMemo, useState } from "react";
import {
  CATEGORIAS_PLANTILLA_PLANILLA,
  cambiarActivoFilaBorrador,
  moverFilaBorrador,
  obtenerBorradorConfiguracionPlanilla
} from "../../utils/plantillasConfiguracionPlanilla.js";

const ETIQUETAS_CATEGORIA = Object.freeze({
  enfermero: "Enfermeros",
  licenciado: "Licenciados"
});

export function FilaConfiguracionPlanilla({
  fila,
  indice,
  cantidadFilas,
  onMover,
  onCambiarActivo
}) {
  return (
    <tr className={fila.activo ? "" : "bg-slate-50 opacity-70"}>
      <td className="px-3 py-3 font-medium text-slate-700">{fila.orden + 1}</td>
      <td className="px-3 py-3"><div className="flex gap-1">
        <button type="button" aria-label={`Subir ${fila.etiqueta}`} disabled={indice === 0}
          onClick={() => onMover(fila.filaId, "arriba")}
          className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">↑</button>
        <button type="button" aria-label={`Bajar ${fila.etiqueta}`}
          disabled={indice === cantidadFilas - 1}
          onClick={() => onMover(fila.filaId, "abajo")}
          className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">↓</button>
      </div></td>
      <td className="px-3 py-3 font-medium text-slate-900">{fila.etiqueta}</td>
      <td className="px-3 py-3 text-slate-700">
        {fila.tipo === "turnante" ? "Turnante" : "Sector"}
      </td>
      <td className="px-3 py-3">
        <button type="button" onClick={() => onCambiarActivo(fila.filaId)}
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            fila.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-700"
          }`}>{fila.activo ? "Activo" : "Inactivo"}</button>
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        <div>fila: {fila.filaId}</div>
        {fila.sectorId && <div>sector: {fila.sectorId}</div>}
        {fila.turnanteId && <div>turnante: {fila.turnanteId}</div>}
      </td>
    </tr>
  );
}

function ConfiguracionPlanilla({ borradores = {}, onActualizarBorrador }) {
  const [categoria, setCategoria] = useState("enfermero");
  const borrador = obtenerBorradorConfiguracionPlanilla(borradores, categoria);
  const filas = useMemo(
    () => [...(borrador?.filas ?? [])].sort((a, b) => a.orden - b.orden),
    [borrador]
  );
  const actualizar = (actualizador) => onActualizarBorrador?.(categoria, actualizador);

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Estructura heredada del mes anterior. Los cambios permanecen sólo en esta preparación.
      </p>
      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Los cambios de estructura se aplicarán al confirmar el mes cuando finalice la configuración.
        La validación definitiva se incorporará antes de conectarlos con la confirmación.
      </p>
      <div className="mb-5 max-w-sm">
        <label className="text-sm font-medium text-slate-700">
          Categoría
          <select value={categoria} onChange={(evento) => setCategoria(evento.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            {CATEGORIAS_PLANTILLA_PLANILLA.map((categoriaId) => (
              <option key={categoriaId} value={categoriaId}>
                {ETIQUETAS_CATEGORIA[categoriaId]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Orden</th><th className="px-3 py-2">Mover</th>
              <th className="px-3 py-2">Etiqueta</th>
              <th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Identificadores</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filas.map((fila, indice) => (
              <FilaConfiguracionPlanilla key={fila.filaId} fila={fila} indice={indice}
                cantidadFilas={filas.length}
                onMover={(filaId, direccion) => actualizar(
                  (actual) => moverFilaBorrador(actual, filaId, direccion)
                )}
                onCambiarActivo={(filaId) => actualizar(
                  (actual) => cambiarActivoFilaBorrador(
                    actual,
                    filaId,
                    !actual.filas.find((item) => item.filaId === filaId)?.activo
                  )
                )}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ConfiguracionPlanilla;
