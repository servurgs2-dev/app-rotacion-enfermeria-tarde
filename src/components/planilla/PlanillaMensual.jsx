import { configuracionSectores } from "../../data/sectores";
import { estaDeLicencia, obtenerSemanasDelMes } from "../../utils/fechas";
import {
  crearReferenciaPersona,
  obtenerNombreDesdeReferencia,
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "../../utils/referenciasPersonas.js";
import { generarRotacionMensual } from "../../utils/rotacionPlanilla.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";
import {
  obtenerClaveRenderPersona,
  obtenerIdsPersonalDuplicados
} from "../../utils/validacionPersonal.js";

function PlanillaMensual({ personal, planilla, setPlanilla, tipo, licencias, mesActivo, soloLectura = false }) {
  const personalFiltrado = personal.filter((p) => p.categoria === tipo);
  const idsDuplicados = obtenerIdsPersonalDuplicados(personal);
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
    if (soloLectura) return;
    setPlanilla(generarRotacionMensual({
      planilla,
      filas,
      semanas,
      filaFija: tipo === "enfermero" ? "SM" : "Salud Mental",
      personal: personalFiltrado
    }));
  }

  function actualizarCelda(semana, sector, personaId) {
    if (soloLectura) return;
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

  function actualizarCoberturaLibreSM(semana, personaId) {
    if (soloLectura) return;
    const persona = personalFiltrado.find((item) => item.id === personaId);
    const valor = personaId ? crearReferenciaPersona(persona) : "";
    if (personaId && !valor) return;

    setPlanilla((prev) => ({
      ...prev,
      coberturaLibreSM: {
        ...(prev?.coberturaLibreSM || {}),
        [semana]: valor
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
                    personal
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
                        disabled={soloLectura}
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
                                referenciaCorrespondeAPersona(
                                  referencia,
                                  persona,
                                  personal
                                )
                            );
                            const noLicencia = !estaDeLicencia(
                              licencias,
                              persona,
                              semana.desde,
                              personal
                            );

                            return disponible && noLicencia;
                          })
                          .map((persona, indice) => (
                            <option
                              key={obtenerClaveRenderPersona(persona, indice, idsDuplicados)}
                              value={persona.id}
                            >
                              {obtenerEtiquetaPersona(persona, personal)}
                            </option>
                          ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-blue-100 bg-blue-50/60">
              <td className="px-4 py-3 font-semibold text-blue-900 min-w-[180px] whitespace-nowrap">
                {tipo === "enfermero"
                  ? "Cubre libre de SM"
                  : "Cubre libre de Salud Mental"}
              </td>
              {semanas.map((semana) => {
                const sectorSM = tipo === "enfermero" ? "SM" : "Salud Mental";
                const titular = resolverPersonaDesdeReferencia(
                  planilla?.[semana.clave]?.[sectorSM],
                  personalFiltrado
                );
                const referencia = planilla?.coberturaLibreSM?.[semana.clave] || "";
                const cobertura = resolverPersonaDesdeReferencia(referencia, personalFiltrado);
                const nombreHistorico = obtenerNombreDesdeReferencia(referencia, personalFiltrado);
                const valor = cobertura?.id || (nombreHistorico ? "__REFERENCIA_NO_RESUELTA__" : "");
                const opciones = [...personalFiltrado]
                  .filter((persona) => persona.id !== titular?.id)
                  .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

                return (
                  <td key={semana.clave} className="px-3 py-2 min-w-[140px]">
                    <select
                      disabled={soloLectura}
                      value={valor}
                      onChange={(evento) =>
                        actualizarCoberturaLibreSM(semana.clave, evento.target.value)
                      }
                      className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-slate-700"
                    >
                      <option value="">Sin cobertura asignada</option>
                      {!cobertura && nombreHistorico && (
                        <option value="__REFERENCIA_NO_RESUELTA__" disabled>
                          {nombreHistorico}
                        </option>
                      )}
                      {opciones.map((persona, indice) => (
                        <option
                          key={obtenerClaveRenderPersona(persona, indice, idsDuplicados)}
                          value={persona.id}
                        >
                          {obtenerEtiquetaPersona(persona, personal)}
                        </option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <button
        disabled={soloLectura}
        onClick={generarMes}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-sm transition"
      >
        🔄 Generar rotación automática
      </button>
    </div>
  );
}

export default PlanillaMensual;
