import { useMemo, useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  CATEGORIAS_PLANTILLA_PLANILLA,
  cambiarActivoFilaBorrador,
  moverFilaBorrador,
  moverFilaBorradorAIndice,
  obtenerBorradorConfiguracionPlanilla
} from "../../utils/plantillasConfiguracionPlanilla.js";
import { obtenerPosicionTurnanteMensual } from "../../utils/turnanteMensual.js";

const ETIQUETAS_CATEGORIA = Object.freeze({
  enfermero: "Enfermeros",
  licenciado: "Licenciados"
});

export function FilaConfiguracionPlanilla({
  fila,
  indice,
  cantidadFilas,
  onMover,
  onCambiarActivo,
  filaRef,
  handleRef,
  arrastrando = false,
  soloLectura = false
}) {
  return (
    <tr ref={filaRef} className={`${fila.activo ? "" : "bg-slate-50 opacity-70"} ${
      arrastrando ? "relative z-10 bg-blue-50 shadow-md" : ""
    }`}>
      <td className="px-3 py-3 font-medium text-slate-700">{fila.orden + 1}</td>
      <td className="px-3 py-3"><div className="flex items-center gap-1">
        <button ref={handleRef} type="button" disabled={soloLectura} aria-label={`Arrastrar ${fila.etiqueta}`}
          title="Arrastrar para reordenar" style={{ touchAction: "none" }}
          className="cursor-grab rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-600 active:cursor-grabbing">
          ☰
        </button>
        <button type="button" aria-label={`Subir ${fila.etiqueta}`} disabled={soloLectura || indice === 0}
          onClick={() => onMover(fila.filaId, "arriba")}
          className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">↑</button>
        <button type="button" aria-label={`Bajar ${fila.etiqueta}`}
          disabled={soloLectura || indice === cantidadFilas - 1}
          onClick={() => onMover(fila.filaId, "abajo")}
          className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">↓</button>
      </div></td>
      <td className="px-3 py-3 font-medium text-slate-900">{fila.etiqueta}</td>
      <td className="px-3 py-3 text-slate-700">
        {fila.tipo === "turnante" ? "Turnante" : "Sector"}
      </td>
      <td className="px-3 py-3">
        <button type="button" disabled={soloLectura} onClick={() => onCambiarActivo(fila.filaId)}
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

function FilaOrdenableConfiguracionPlanilla(props) {
  const { fila, indice, categoria } = props;
  const { ref, handleRef, isDragging } = useSortable({
    id: fila.filaId,
    index: indice,
    group: categoria,
    type: "fila-planilla",
    accept: "fila-planilla"
  });
  return <FilaConfiguracionPlanilla {...props} filaRef={ref} handleRef={handleRef}
    arrastrando={isDragging} />;
}

function ConfiguracionPlanilla({
  borradores = {},
  onActualizarBorrador,
  modoPreparacionVersionada = false,
  ocultarTurnanteMensual = false,
  soloLectura = false
}) {
  const [categoria, setCategoria] = useState("enfermero");
  const borrador = obtenerBorradorConfiguracionPlanilla(borradores, categoria);
  const filas = useMemo(() => {
    const posicionMensual = ocultarTurnanteMensual
      ? obtenerPosicionTurnanteMensual(categoria, borrador)
      : null;
    return [...(borrador?.filas ?? [])]
      .filter((fila) => !posicionMensual || fila.etiqueta !== posicionMensual)
      .sort((a, b) => a.orden - b.orden);
  }, [borrador, categoria, ocultarTurnanteMensual]);
  const actualizar = (actualizador) => onActualizarBorrador?.(categoria, actualizador);
  const finalizarArrastre = (evento) => {
    if (soloLectura || evento.canceled || !isSortable(evento.operation.source)) return;
    const origen = evento.operation.source;
    if (origen.group !== categoria || origen.initialGroup !== categoria) return;
    actualizar((actual) => moverFilaBorradorAIndice(actual, origen.id, origen.index));
  };

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        {modoPreparacionVersionada
          ? soloLectura
            ? "Estructura confirmada de esta organización."
            : "Los cambios de estructura se aplican únicamente a la nueva organización antes de confirmarla."
          : "Estructura heredada del mes anterior. Los cambios permanecen sólo en esta preparación."}
      </p>
      {!modoPreparacionVersionada && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Los cambios de estructura se aplicarán al confirmar el mes cuando finalice la configuración.
          La validación definitiva se incorporará antes de conectarlos con la confirmación.
        </p>
      )}
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
      <DragDropProvider onDragEnd={finalizarArrastre}>
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
              <FilaOrdenableConfiguracionPlanilla key={fila.filaId} fila={fila} indice={indice}
                categoria={categoria}
                soloLectura={soloLectura}
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
      </DragDropProvider>
    </div>
  );
}

export default ConfiguracionPlanilla;
