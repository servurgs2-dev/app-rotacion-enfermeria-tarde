import { configuracionSectores } from "../../data/sectores.js";
import {
  moverSectorEnPrioridadCobertura,
  obtenerPrioridadCoberturaEfectiva
} from "../../utils/prioridadCoberturaMensual.js";

const ETIQUETAS_CATEGORIA = Object.freeze({
  enfermero: "Enfermeros",
  licenciado: "Licenciados"
});

function PrioridadCoberturaMes({
  categoria,
  filas = [],
  prioridadCoberturaSectorIds = [],
  onCambiarPrioridad
}) {
  const prioridadFallback = configuracionSectores[categoria]?.prioridadSectoresIds || [];
  const { prioridadSectorIds } = obtenerPrioridadCoberturaEfectiva({
    prioridadConfigurada: prioridadCoberturaSectorIds,
    filas,
    prioridadFallback
  });
  const filasPorId = new Map(
    filas
      .filter((fila) => fila?.tipo === "sector" && fila.activo !== false && fila.sectorId)
      .map((fila) => [fila.sectorId, fila])
  );

  const mover = (sectorId, direccion) => {
    onCambiarPrioridad?.(moverSectorEnPrioridadCobertura({
      prioridad: prioridadSectorIds,
      sectorId,
      direccion
    }));
  };
  const restaurar = () => {
    onCambiarPrioridad?.(obtenerPrioridadCoberturaEfectiva({
      prioridadConfigurada: [],
      filas,
      prioridadFallback
    }).prioridadSectorIds);
  };

  return (
    <section aria-labelledby={`prioridad-cobertura-${categoria}`}>
      <h5 id={`prioridad-cobertura-${categoria}`} className="font-semibold text-slate-800">
        {ETIQUETAS_CATEGORIA[categoria] || categoria}
      </h5>
      <ol className="mt-2 space-y-2">
        {prioridadSectorIds.map((sectorId, indice) => {
          const etiqueta = filasPorId.get(sectorId)?.etiqueta || sectorId;
          return (
            <li key={sectorId}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <span className="w-7 shrink-0 text-center text-sm font-semibold text-slate-500">
                {indice + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                {etiqueta}
              </span>
              <button type="button" disabled={indice === 0}
                onClick={() => mover(sectorId, "arriba")}
                aria-label={`Subir ${etiqueta} en la prioridad`}
                className="min-h-11 min-w-11 rounded-lg border border-slate-300 bg-white text-lg disabled:cursor-not-allowed disabled:opacity-40">
                ↑
              </button>
              <button type="button" disabled={indice === prioridadSectorIds.length - 1}
                onClick={() => mover(sectorId, "abajo")}
                aria-label={`Bajar ${etiqueta} en la prioridad`}
                className="min-h-11 min-w-11 rounded-lg border border-slate-300 bg-white text-lg disabled:cursor-not-allowed disabled:opacity-40">
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={restaurar}
        className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 sm:w-auto">
        Restaurar orden predeterminado
      </button>
    </section>
  );
}

export default PrioridadCoberturaMes;
