import { useState } from "react";
import { configuracionSectores } from "../../data/sectores";
import {
  estaDeLicencia,
  obtenerSemanasDelMes,
  parsearFechaLocal
} from "../../utils/fechas";
import { obtenerEstrategiaRotacionPlanilla } from "../../config/turnos.js";
import {
  obtenerBloquesQueIntersectanMes
} from "../../utils/periodosRotacionPlanilla.js";
import {
  crearReferenciaPersona,
  obtenerNombreDesdeReferencia,
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "../../utils/referenciasPersonas.js";
import {
  existenBloquesPosterioresUtiles,
  generarRotacionMensual,
  obtenerPrimerBloqueReferencia,
  prepararRotacion3DiasParaGenerar,
  regenerarRotacion3DiasDesdePrimerBloque,
  tieneAsignacionesUtiles
} from "../../utils/rotacionPlanilla.js";
import {
  evaluarPreparacionRotacion3Dias
} from "../../utils/continuidadRotacionPlanilla.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";
import {
  obtenerClaveRenderPersona,
  obtenerIdsPersonalDuplicados
} from "../../utils/validacionPersonal.js";
import {
  analizarDistribucionBaseEnfermeros,
  crearMetadataGeneracionFlexible,
  tieneAsignacionesEnPeriodos,
  validarPosicionesNoAplicables
} from "../../utils/generacionFlexiblePlanilla.js";
import SelectorPosicionesNoAplicables from "./SelectorPosicionesNoAplicables.jsx";

function PlanillaMensual({
  personal,
  planilla,
  setPlanilla,
  tipo,
  licencias,
  mesActivo,
  turnoId,
  soloLectura = false
}) {
  const personalFiltrado = personal.filter((p) => p.categoria === tipo);
  const idsDuplicados = obtenerIdsPersonalDuplicados(personal);
  const {
    sectoresFijos,
    turnantes,
    posicionesTurnantes,
    sectoresCriticos
  } = configuracionSectores[tipo];
  const estrategia = obtenerEstrategiaRotacionPlanilla({
    turnoId,
    tipo,
    mesActivo
  });
  const usaRotacionTresDias = estrategia.tipo === "cada_3_dias";
  const periodos = usaRotacionTresDias
    ? obtenerBloquesQueIntersectanMes({
        mesActivo,
        fechaBase: estrategia.fechaBase,
        duracionDias: estrategia.duracionDias
      })
    : obtenerSemanasDelMes(mesActivo);
  const evaluacionGeneracion = evaluarPreparacionRotacion3Dias({
    estrategia,
    mesActivo,
    rotacion3Dias: planilla?.rotacion3Dias
  });
  const [preparacionFlexible, setPreparacionFlexible] = useState(null);
  const [posicionesSeleccionadas, setPosicionesSeleccionadas] = useState([]);
  const [errorSeleccion, setErrorSeleccion] = useState("");

  const filas = [];
  let tIndex = 0;

  sectoresFijos.forEach((sector, indice) => {
    filas.push(sector);
    if (posicionesTurnantes.includes(indice)) {
      filas.push(turnantes[tIndex]);
      tIndex += 1;
    }
  });

  const obtenerContextoBaseEnfermeros = () => {
    if (!usaRotacionTresDias) {
      return {
        distribucionBase: planilla?.semana1,
        bloqueReferencia: null
      };
    }
    if (evaluacionGeneracion.esMesInicial) {
      const bloqueReferencia = obtenerPrimerBloqueReferencia({
        rotacion3Dias: planilla?.rotacion3Dias,
        periodos
      });
      return {
        distribucionBase: bloqueReferencia?.bloque,
        bloqueReferencia
      };
    }
    return {
      distribucionBase: planilla?.rotacion3Dias?.asignacionBase,
      bloqueReferencia: null
    };
  };

  const obtenerAdvertenciaSobrescritura = (bloqueReferencia) => {
    if (!usaRotacionTresDias) {
      const posteriores = periodos.slice(1).map(
        (periodo) => planilla?.[periodo.clave]
      );
      return tieneAsignacionesEnPeriodos(posteriores)
        ? "Las semanas posteriores contienen asignaciones y serán regeneradas."
        : "";
    }
    if (
      evaluacionGeneracion.esMesInicial &&
      bloqueReferencia &&
      existenBloquesPosterioresUtiles({
        rotacion3Dias: planilla?.rotacion3Dias,
        periodos,
        claveReferencia: bloqueReferencia.periodo.clave
      })
    ) {
      return `Los bloques posteriores a ${bloqueReferencia.periodo.etiqueta} contienen asignaciones y serán regenerados.`;
    }
    return "";
  };

  const ejecutarGeneracionEnfermeros = ({
    analisis,
    posicionesNoAplicables
  }) => {
    const metadata = crearMetadataGeneracionFlexible({
      estrategia: estrategia.tipo,
      turnoId,
      posicionesNoAplicables,
      cantidadPersonasConsideradas: analisis.cantidadPersonas
    });

    if (usaRotacionTresDias) {
      const esMesInicial = evaluacionGeneracion.esMesInicial;
      const preparar = (rotacion3Dias) => esMesInicial
        ? regenerarRotacion3DiasDesdePrimerBloque({
            rotacion3Dias,
            periodos,
            filas,
            filasFijas: ["SM"],
            posicionesNoAplicables,
            estrategia
          })
        : prepararRotacion3DiasParaGenerar({
            rotacion3Dias,
            periodos,
            filas,
            filasFijas: ["SM"],
            posicionesNoAplicables,
            estrategia
          });

      setPlanilla((prev) => {
        const resultado = preparar(prev?.rotacion3Dias);
        if (!resultado.ok) return prev;
        return {
          ...prev,
          rotacion3Dias: resultado.rotacion3Dias,
          generacionFlexible: metadata
        };
      });
    } else {
      setPlanilla((prev) => ({
        ...generarRotacionMensual({
          planilla: prev,
          filas,
          semanas: periodos,
          filaFija: "SM",
          personal: personalFiltrado,
          posicionesNoAplicables
        }),
        generacionFlexible: metadata
      }));
    }

    setPreparacionFlexible(null);
    setPosicionesSeleccionadas([]);
    setErrorSeleccion("");
  };

  const iniciarGeneracionFlexible = () => {
    if (evaluacionGeneracion.debeBloquearGeneracion) {
      alert(evaluacionGeneracion.mensaje);
      return;
    }
    const contexto = obtenerContextoBaseEnfermeros();
    const analisis = analizarDistribucionBaseEnfermeros({
      distribucionBase: contexto.distribucionBase,
      filas,
      personal: personalFiltrado
    });
    if (!analisis.ok) {
      alert(analisis.mensaje);
      return;
    }
    const advertenciaSobrescritura = obtenerAdvertenciaSobrescritura(
      contexto.bloqueReferencia
    );
    const preparacion = {
      ...analisis,
      bloqueReferencia: contexto.bloqueReferencia,
      advertenciaSobrescritura
    };

    if (analisis.cantidadPosicionesNoAplicables === 0) {
      if (
        advertenciaSobrescritura &&
        !window.confirm(`${advertenciaSobrescritura} ¿Deseás continuar?`)
      ) return;
      ejecutarGeneracionEnfermeros({
        analisis,
        posicionesNoAplicables: []
      });
      return;
    }

    setPreparacionFlexible(preparacion);
    setPosicionesSeleccionadas([...analisis.filasVacias]);
    setErrorSeleccion("");
  };

  const confirmarGeneracionFlexible = () => {
    if (!preparacionFlexible) return;
    const validacion = validarPosicionesNoAplicables({
      seleccionadas: posicionesSeleccionadas,
      filas,
      filasVacias: preparacionFlexible.filasVacias,
      cantidadRequerida: preparacionFlexible.cantidadPosicionesNoAplicables
    });
    if (!validacion.ok) {
      setErrorSeleccion(validacion.mensaje);
      return;
    }
    ejecutarGeneracionEnfermeros({
      analisis: preparacionFlexible,
      posicionesNoAplicables: posicionesSeleccionadas
    });
  };

  function generarMes() {
    if (soloLectura) return;

    if (tipo === "enfermero") {
      iniciarGeneracionFlexible();
      return;
    }

    if (usaRotacionTresDias) {
      if (evaluacionGeneracion.debeBloquearGeneracion) {
        alert(evaluacionGeneracion.mensaje);
        return;
      }

      const esMesInicial = evaluacionGeneracion.esMesInicial;
      const prepararGeneracion = (rotacion3Dias) => (esMesInicial
        ? regenerarRotacion3DiasDesdePrimerBloque({
            rotacion3Dias,
            periodos,
            filas,
            filasFijas: ["SM"],
            estrategia
          })
        : prepararRotacion3DiasParaGenerar({
            rotacion3Dias,
            periodos,
            filas,
            filasFijas: ["SM"],
            estrategia
          }));
      const preparacionActual = prepararGeneracion(planilla?.rotacion3Dias);
      if (!preparacionActual.ok) {
        alert("Completá el primer bloque de la rotación antes de generar los siguientes.");
        return;
      }

      if (
        esMesInicial &&
        existenBloquesPosterioresUtiles({
          rotacion3Dias: planilla?.rotacion3Dias,
          periodos,
          claveReferencia: preparacionActual.bloqueReferencia.periodo.clave
        }) &&
        !window.confirm(
          `Se volverán a generar todos los bloques posteriores usando ${preparacionActual.bloqueReferencia.periodo.etiqueta} como referencia. Las asignaciones manuales posteriores serán reemplazadas. ¿Deseás continuar?`
        )
      ) return;

      setPlanilla((prev) => {
        const preparacion = prepararGeneracion(prev?.rotacion3Dias);
        if (!preparacion.ok) return prev;

        return {
          ...prev,
          rotacion3Dias: preparacion.rotacion3Dias
        };
      });
      return;
    }

    setPlanilla(generarRotacionMensual({
      planilla,
      filas,
      semanas: periodos,
      filaFija: tipo === "enfermero" ? "SM" : "Salud Mental",
      personal: personalFiltrado
    }));
  }

  function actualizarCelda(periodo, sector, personaId) {
    if (soloLectura) return;
    const persona = personalFiltrado.find((item) => item.id === personaId);
    const valor = personaId ? crearReferenciaPersona(persona) : "";
    if (personaId && !valor) return;

    if (usaRotacionTresDias) {
      setPlanilla((prev) => {
        const rotacionActual = prev?.rotacion3Dias || {};
        const bloquesActuales = rotacionActual.bloques || {};
        const bloqueActual = bloquesActuales[periodo] || {};
        const esBloqueBase = periodo === rotacionActual.fechaBase;
        const tieneBase = tieneAsignacionesUtiles(rotacionActual.asignacionBase);

        return {
          ...prev,
          rotacion3Dias: {
            ...rotacionActual,
            version: rotacionActual.version ?? 1,
            fechaBase: rotacionActual.fechaBase || estrategia.fechaBase,
            duracionDias: rotacionActual.duracionDias || estrategia.duracionDias,
            asignacionBase: rotacionActual.asignacionBase || {},
            coberturaLibreSM: rotacionActual.coberturaLibreSM || {},
            bloques: {
              ...bloquesActuales,
              [periodo]: {
                ...bloqueActual,
                [sector]: valor
              }
            },
            ...(esBloqueBase && tieneBase
              ? {
                  asignacionBase: {
                    ...(rotacionActual.asignacionBase || {}),
                    [sector]: valor
                  }
                }
              : {})
          }
        };
      });
      return;
    }

    setPlanilla((prev) => ({
      ...prev,
      [periodo]: {
        ...(prev?.[periodo] || {}),
        [sector]: valor
      }
    }));
  }

  function actualizarCoberturaLibreSM(periodo, personaId) {
    if (soloLectura) return;
    const persona = personalFiltrado.find((item) => item.id === personaId);
    const valor = personaId ? crearReferenciaPersona(persona) : "";
    if (personaId && !valor) return;

    if (usaRotacionTresDias) {
      setPlanilla((prev) => ({
        ...prev,
        rotacion3Dias: {
          ...(prev?.rotacion3Dias || {}),
          coberturaLibreSM: {
            ...(prev?.rotacion3Dias?.coberturaLibreSM || {}),
            [periodo]: valor
          }
        }
      }));
      return;
    }

    setPlanilla((prev) => ({
      ...prev,
      coberturaLibreSM: {
        ...(prev?.coberturaLibreSM || {}),
        [periodo]: valor
      }
    }));
  }

  const obtenerValoresPeriodo = (periodo) => usaRotacionTresDias
    ? planilla?.rotacion3Dias?.bloques?.[periodo.clave] || {}
    : planilla?.[periodo.clave] || {};

  const obtenerFechaInicioPeriodo = (periodo) => usaRotacionTresDias
    ? parsearFechaLocal(periodo.fechaInicio)
    : periodo.desde;

  const obtenerEtiquetaPeriodo = (periodo) => usaRotacionTresDias
    ? periodo.etiqueta
    : `${periodo.desde.getDate()}/${periodo.desde.getMonth() + 1} - ${periodo.hasta.getDate()}/${periodo.hasta.getMonth() + 1}`;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Planilla Mensual</h2>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] border border-slate-200 rounded-xl overflow-hidden text-sm table-auto">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Sector</th>
              {periodos.map((periodo) => (
                <th
                  key={periodo.clave}
                  className="px-4 py-3 text-left font-semibold min-w-[140px] whitespace-nowrap"
                >
                  {obtenerEtiquetaPeriodo(periodo)}
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

                {periodos.map((periodo) => {
                  const valoresPeriodo = obtenerValoresPeriodo(periodo);
                  const referenciaActual = valoresPeriodo[sector] || "";
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
                    <td key={periodo.clave} className="px-3 py-2 min-w-[140px]">
                      <select
                        disabled={soloLectura}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={valorSelect}
                        onChange={(evento) =>
                          actualizarCelda(periodo.clave, sector, evento.target.value)
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
                            const disponible = !Object.entries(valoresPeriodo).some(
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
                              obtenerFechaInicioPeriodo(periodo),
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
              {periodos.map((periodo) => {
                const sectorSM = tipo === "enfermero" ? "SM" : "Salud Mental";
                const valoresPeriodo = obtenerValoresPeriodo(periodo);
                const titular = resolverPersonaDesdeReferencia(
                  valoresPeriodo[sectorSM],
                  personalFiltrado
                );
                const referencia = usaRotacionTresDias
                  ? planilla?.rotacion3Dias?.coberturaLibreSM?.[periodo.clave] || ""
                  : planilla?.coberturaLibreSM?.[periodo.clave] || "";
                const cobertura = resolverPersonaDesdeReferencia(referencia, personalFiltrado);
                const nombreHistorico = obtenerNombreDesdeReferencia(referencia, personalFiltrado);
                const valor = cobertura?.id || (nombreHistorico ? "__REFERENCIA_NO_RESUELTA__" : "");
                const opciones = [...personalFiltrado]
                  .filter((persona) => persona.id !== titular?.id)
                  .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

                return (
                  <td key={periodo.clave} className="px-3 py-2 min-w-[140px]">
                    <select
                      disabled={soloLectura}
                      value={valor}
                      onChange={(evento) =>
                        actualizarCoberturaLibreSM(periodo.clave, evento.target.value)
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
        disabled={soloLectura || evaluacionGeneracion.debeBloquearGeneracion}
        onClick={generarMes}
        title={evaluacionGeneracion.debeBloquearGeneracion
          ? evaluacionGeneracion.mensaje
          : undefined}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl shadow-sm transition"
      >
        🔄 Generar rotación automática
      </button>
      {evaluacionGeneracion.debeBloquearGeneracion && (
        <p className="text-sm text-amber-700">
          Para generar este mes primero debés usar ‘Continuar desde mes anterior’.
        </p>
      )}
      {preparacionFlexible && (
        <SelectorPosicionesNoAplicables
          filas={filas}
          filasVacias={preparacionFlexible.filasVacias}
          nombresPorFila={preparacionFlexible.nombresPorFila}
          seleccionadas={posicionesSeleccionadas}
          cantidadRequerida={preparacionFlexible.cantidadPosicionesNoAplicables}
          sectoresCriticos={sectoresCriticos}
          advertenciaSobrescritura={preparacionFlexible.advertenciaSobrescritura}
          error={errorSeleccion}
          onAlternar={(fila) => {
            setErrorSeleccion("");
            setPosicionesSeleccionadas((actuales) =>
              actuales.includes(fila)
                ? actuales.filter((item) => item !== fila)
                : [...actuales, fila]
            );
          }}
          onCancelar={() => {
            setPreparacionFlexible(null);
            setPosicionesSeleccionadas([]);
            setErrorSeleccion("");
          }}
          onConfirmar={confirmarGeneracionFlexible}
        />
      )}
    </div>
  );
}

export default PlanillaMensual;
