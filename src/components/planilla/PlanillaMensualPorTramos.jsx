import { useMemo } from "react";
import { resolverTramosPlanillaMes } from "../../utils/preparacionesMes.js";
import { obtenerFilasActivas } from "../../utils/configuracionPlanilla.js";
import { resolverClaveDistribucionParaFila } from "../../utils/resolucionIdentidadesPlanilla.js";
import { obtenerNombreDesdeReferencia } from "../../utils/referenciasPersonas.js";

const obtenerFilasTramos = (tramos) => {
  const filas = new Map();
  tramos.forEach((tramo) => {
    obtenerFilasActivas(tramo.configuracionPlanilla?.filas || [])
      .sort((a, b) => a.orden - b.orden)
      .forEach((fila) => {
        const identidad = fila.filaId || fila.sectorId || fila.etiqueta;
        if (!filas.has(identidad)) filas.set(identidad, fila);
      });
  });
  return [...filas.values()];
};

export default function PlanillaMensualPorTramos({
  estadoMensual,
  mesActivo,
  turnoId,
  tipo,
  personal = []
}) {
  const resultado = useMemo(() => resolverTramosPlanillaMes({
    estado: estadoMensual,
    mes: mesActivo,
    turno: turnoId,
    categoria: tipo
  }), [estadoMensual, mesActivo, turnoId, tipo]);

  if (!resultado.ok) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No se pudo resolver la organización de la Planilla ({resultado.codigo}).
      </div>
    );
  }

  const filas = obtenerFilasTramos(resultado.tramos);
  return (
    <section>
      <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        Planilla organizada por vigencias. Esta vista permanece en modo lectura.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[900px] table-auto border-separate border-spacing-0 text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="sticky left-0 z-20 w-[140px] min-w-[140px] border-r border-slate-200 bg-slate-100 px-3 py-3 text-left font-semibold md:w-[180px] md:min-w-[180px]">
                Sector
              </th>
              {resultado.tramos.map((tramo) => (
                <th key={tramo.id} className="min-w-[140px] whitespace-nowrap px-4 py-3 text-left font-semibold">
                  <span className="block">{tramo.etiqueta}</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    Vigencia {tramo.preparacionId}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((fila) => (
              <tr key={fila.filaId || fila.sectorId || fila.etiqueta}>
                <td className="sticky left-0 z-10 w-[140px] min-w-[140px] border-r border-slate-200 bg-slate-50 px-3 py-3 font-medium text-slate-700 md:w-[180px] md:min-w-[180px]">
                  {fila.etiqueta}
                </td>
                {resultado.tramos.map((tramo) => {
                  const clave = resolverClaveDistribucionParaFila({
                    distribucion: tramo.distribucion,
                    fila
                  }) || fila.etiqueta;
                  const nombre = obtenerNombreDesdeReferencia(
                    tramo.distribucion?.[clave],
                    personal
                  );
                  return (
                    <td key={tramo.id} className="min-w-[140px] px-3 py-2 text-slate-700">
                      {nombre || "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
