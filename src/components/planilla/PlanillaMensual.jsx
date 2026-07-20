import { configuracionSectores } from "../../data/sectores";
import { estaDeLicencia, obtenerSemanasDelMes } from "../../utils/fechas";
import {
  crearReferenciaPersona,
  obtenerNombreDesdeReferencia,
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "../../utils/referenciasPersonas.js";
import { generarRotacionMensual } from "../../utils/rotacionPlanilla.js";

function PlanillaMensual({ personal, planilla, setPlanilla, tipo, licencias, mesActivo }) {
  const personalFiltrado = personal.filter((p) => p.categoria === tipo);
  const { sectoresFijos, turnantes, posicionesTurnantes } = configuracionSectores[tipo];
  const semanas = obtenerSemanasDelMes(mesActivo);

  const filas = [];
  let tIndex = 0;

  sectoresFijos.forEach((sector, indice) => {
    filas.push(sector);
    if (posicionesTurnantes.includes(indice)) {
      filas.push(turnantes[tIndex]);
      tIndex += 1;
    }
  });

  function generarMes() {
    setPlanilla(generarRotacionMensual({
      planilla,
      filas,
      semanas,
      filaFija: tipo === "enfermero" ? "SM" : "Salud Mental",
      personal: personalFiltrado
    }));
  }

  function actualizarCelda(semana, sector, personaId) {
    const persona = personalFiltrado.find((item) => item.id === personaId);
    const valor = personaId ? crearReferenciaPersona(persona) : "";
    if (personaId && !valor) return;

    setPlanilla((prev) => ({
      ...prev,
      [semana]: {
        ...(prev?.[semana] || {}),
        [sector]: valor
      }
    }));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Planilla Mensual</h2>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] border border-slate-200 rounded-xl overflow-hidden text-sm table-auto">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Sector</th>
              {semanas.map((semana) => (
                <th
                  key={semana.clave}
                  className="px-4 py-3 text-left font-semibold min-w-[140px] whitespace-nowrap"
                >
                  {`${semana.desde.getDate()}/${semana.desde.getMonth() + 1} - ${semana.hasta.getDate()}/${semana.hasta.getMonth() + 1}`}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filas.map((sector) => (
              <tr key={sector} className="hover:bg-slate-50 transition">
                <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 min-w-[180px] whitespace-nowrap">
                  {sector}
                </td>

                {semanas.map((semana) => {
                  const valoresSemana = planilla?.[semana.clave] || {};
                  const referenciaActual = valoresSemana[sector] || "";
                  const personaActual = resolverPersonaDesdeReferencia(
                    referenciaActual,
                    personalFiltrado
                  );
                  const nombreHistorico = obtenerNombreDesdeReferencia(
                    referenciaActual,
                    personalFiltrado
                  );
                  const valorSelect = personaActual?.id ||
                    (nombreHistorico ? "__REFERENCIA_NO_RESUELTA__" : "");

                  return (
                    <td key={semana.clave} className="px-3 py-2 min-w-[140px]">
                      <select
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={valorSelect}
                        onChange={(evento) =>
                          actualizarCelda(semana.clave, sector, evento.target.value)
                        }
                      >
                        <option value="">-- elegir --</option>
                        {!personaActual && nombreHistorico && (
                          <option value="__REFERENCIA_NO_RESUELTA__" disabled>
                            {nombreHistorico}
                          </option>
                        )}
                        {personalFiltrado
                          .filter((persona) => {
                            const disponible = !Object.entries(valoresSemana).some(
                              ([otroSector, referencia]) =>
                                otroSector !== sector &&
                                referenciaCorrespondeAPersona(referencia, persona)
                            );
                            const noLicencia = !estaDeLicencia(
                              licencias,
                              persona,
                              semana.desde,
                              personal
                            );

                            return disponible && noLicencia;
                          })
                          .map((persona) => (
                            <option key={persona.id} value={persona.id}>
                              {persona.nombre}
                            </option>
                          ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={generarMes}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-sm transition"
      >
        🔄 Generar rotación automática
      </button>
    </div>
  );
}

export default PlanillaMensual;
