import { configuracionSectores } from "../../data/sectores.js";
import {
  moverSectorEnPrioridadCobertura,
  obtenerCandidatosPrioridadCoberturaMes,
  obtenerPrioridadCoberturaEfectiva
} from "../../utils/prioridadCoberturaMensual.js";
import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "../../utils/estructuraLicenciadosDinamica.js";

const ETIQUETAS_CATEGORIA = Object.freeze({
  enfermero: "Enfermeros",
  licenciado: "Licenciados"
});

function PrioridadCoberturaMes({
  categoria,
  filas = [],
  prioridadCoberturaSectorIds = [],
  versionEstructura,
  onCambiarPrioridad
}) {
  const prioridadFallback = configuracionSectores[categoria]?.prioridadSectoresIds || [];
  const usaLicenciadosV2 = categoria === "licenciado" &&
    resolverVersionEstructuraLicenciados(versionEstructura) ===
      VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  const candidatos = obtenerCandidatosPrioridadCoberturaMes({ categoria, filas, versionEstructura });
  const resultadoPrioridad = obtenerPrioridadCoberturaEfectiva({
    prioridadConfigurada: prioridadCoberturaSectorIds,
    filas,
    prioridadFallback,
    categoria,
    versionEstructura
  });
  const prioridadSectorIds = usaLicenciadosV2 && !resultadoPrioridad.valido
    ? candidatos.map((candidato) => candidato.id)
    : resultadoPrioridad.prioridadSectorIds;
  const candidatosPorId = new Map(candidatos.map((candidato) => [candidato.id, candidato]));

  const mover = (sectorId, direccion) => {
    onCambiarPrioridad?.(moverSectorEnPrioridadCobertura({
      prioridad: prioridadSectorIds,
      sectorId,
      direccion
    }));
  };
  const restaurar = () => {
    onCambiarPrioridad?.(obtenerPrioridadCoberturaEfectiva({
      prioridadConfigurada: usaLicenciadosV2 ? candidatos.map((candidato) => candidato.id) : [],
      filas,
      prioridadFallback,
      categoria,
      versionEstructura
    }).prioridadSectorIds);
  };

  return (
    <section aria-labelledby={`prioridad-cobertura-${categoria}`}>
      <h5 id={`prioridad-cobertura-${categoria}`} className="font-semibold text-slate-800">
        {ETIQUETAS_CATEGORIA[categoria] || categoria}
      </h5>
      {usaLicenciadosV2 && !resultadoPrioridad.valido && (
        <p role="alert" className="mt-2 text-sm text-amber-700">
          La prioridad de Licenciados debe configurarse para la nueva estructura.
        </p>
      )}
      <ol className="mt-2 space-y-2">
        {prioridadSectorIds.map((sectorId, indice) => {
          const etiqueta = candidatosPorId.get(sectorId)?.nombre || sectorId;
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
