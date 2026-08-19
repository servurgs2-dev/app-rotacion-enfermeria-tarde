import { useEffect, useState } from "react";
import { configuracionSectores } from "../../data/sectores";
import { obtenerSemanasDelMes } from "../../utils/fechas";
import {
  obtenerConfiguracionTurno,
  obtenerEstrategiaRotacionPlanilla
} from "../../config/turnos.js";
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
  regenerarRotacion3DiasDesdePrimerBloque
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
import PanelIntercambioPlanilla from "./PanelIntercambioPlanilla.jsx";
import PanelConfirmacionLimpieza from "../ui/PanelConfirmacionLimpieza.jsx";
import PanelReintegrosPlanilla from "./PanelReintegrosPlanilla.jsx";
import {
  aplicarIntercambioPlanilla,
  debeSincronizarAsignacionBase,
  obtenerDistribucionPeriodo,
  obtenerOpcionesOcupadas,
  validarIntercambioPlanilla
} from "../../utils/intercambioPlanilla.js";
import {
  describirContenidoAEliminar,
  estaPlanillaVacia,
  vaciarPlanillaDesdeSemana2,
  vaciarPlanillaMensual,
  validarContextoLimpieza
} from "../../utils/limpiezaSegura.js";
import {
  crearMetadatosAsignacionParcial,
  detectarDisponiblesPorReintegro,
  eliminarAsignacionParcial,
  guardarAsignacionParcial,
  obtenerAsignacionesParcialesPeriodo,
  validarAsignacionParcial
} from "../../utils/asignacionesParcialesPlanilla.js";
import { obtenerOpcionesSelectorPlanilla } from "../../utils/opcionesSelectorPlanilla.js";
import {
  eliminarTurnanteMensual,
  habilitarTurnanteMensual,
  obtenerCapacidadNormalPlanilla,
  obtenerPosicionTurnanteMensual,
  validarEliminacionTurnanteMensual
} from "../../utils/turnanteMensual.js";
import {
  obtenerConfiguracionPlanillaEfectiva,
  obtenerEtiquetasFilasPlanilla,
  obtenerFilasActivas
} from "../../utils/configuracionPlanilla.js";
import {
  adaptarPlanillaSaludMental,
  obtenerFilaSaludMentalActiva,
  obtenerReferenciaSaludMental
} from "../../utils/saludMentalGeneracion.js";

function PlanillaMensual({
  personal,
  estadoMensual,
  planilla,
  setPlanilla,
  tipo,
  licencias,
  mesActivo,
  turnoId,
  soloLectura = false,
  versionHistoricaActiva = false
}) {
  const personalSeguro = Array.isArray(personal) ? personal : [];
  const personalFiltrado = personalSeguro.filter((p) => p.categoria === tipo);
  const idsDuplicados = obtenerIdsPersonalDuplicados(personalSeguro);
  const sectoresCriticos = configuracionSectores[tipo]?.sectoresCriticos || [];
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
  const [intercambio, setIntercambio] = useState(null);
  const [limpiezaPlanilla, setLimpiezaPlanilla] = useState(null);
  const [periodoReintegros, setPeriodoReintegros] = useState(
    periodos[0]?.clave || ""
  );
  const [errorAsignacionParcial, setErrorAsignacionParcial] = useState("");
  const [mensajeTurnanteMensual, setMensajeTurnanteMensual] = useState("");
  const claveContextoIntercambio = [
    turnoId,
    mesActivo,
    tipo,
    estrategia.tipo,
    soloLectura ? "lectura" : "edicion",
    versionHistoricaActiva ? "historica" : "actual"
  ].join("|");

  const configuracionEfectiva = obtenerConfiguracionPlanillaEfectiva({
    estadoMensual,
    turno: turnoId,
    categoria: tipo,
    mes: mesActivo
  });
  const filasConfiguracion = [...(configuracionEfectiva?.filas || [])]
    .sort((filaA, filaB) => filaA.orden - filaB.orden);
  const filasActivas = obtenerFilasActivas(filasConfiguracion);
  const filas = obtenerEtiquetasFilasPlanilla(filasActivas);
  const filaSaludMental = obtenerFilaSaludMentalActiva(filasConfiguracion);
  const etiquetaSaludMental = filaSaludMental?.etiqueta || null;
  const posicionTurnanteMensual = obtenerPosicionTurnanteMensual(tipo);
  const turnanteMensualHabilitado = filas.includes(posicionTurnanteMensual);
  const capacidadNormal = obtenerCapacidadNormalPlanilla(tipo);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIntercambio(null);
      setLimpiezaPlanilla(null);
    }, 0);
    return () => clearTimeout(timeout);
  }, [claveContextoIntercambio]);

  const primeraClavePeriodo = periodos[0]?.clave || "";
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPeriodoReintegros(primeraClavePeriodo);
      setErrorAsignacionParcial("");
    }, 0);
    return () => clearTimeout(timeout);
  }, [mesActivo, estrategia.tipo, primeraClavePeriodo]);

  const contextoLimpiezaActual = {
    turnoId,
    mesActivo,
    tipo,
    estrategia: estrategia.tipo,
    soloLectura,
    versionHistoricaActiva
  };
  const planillaEstaVacia = estaPlanillaVacia({
    planilla,
    tipo,
    usaRotacionTresDias
  });
  const nombreCategoria = tipo === "enfermero" ? "Enfermeros" : "Licenciados";
  const nombreTurno = obtenerConfiguracionTurno(turnoId).nombre;
  const periodoVisible = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesActivo || "")
    ? new Intl.DateTimeFormat("es-UY", {
        month: "long",
        year: "numeric"
      }).format(new Date(`${mesActivo}-01T12:00:00`))
    : mesActivo;

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
      const preparar = (planillaActual) => {
        const planillaAdaptada = adaptarPlanillaSaludMental({
          planilla: planillaActual,
          filasConfiguracion
        });
        return esMesInicial
          ? regenerarRotacion3DiasDesdePrimerBloque({
            rotacion3Dias: planillaAdaptada.rotacion3Dias,
            periodos,
            filas,
            filasFijas: etiquetaSaludMental ? [etiquetaSaludMental] : [],
            posicionesNoAplicables,
            estrategia
          })
          : prepararRotacion3DiasParaGenerar({
            rotacion3Dias: planillaAdaptada.rotacion3Dias,
            periodos,
            filas,
            filasFijas: etiquetaSaludMental ? [etiquetaSaludMental] : [],
            posicionesNoAplicables,
            estrategia
          });
      };

      setPlanilla((prev) => {
        const resultado = preparar(prev);
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
          planilla: adaptarPlanillaSaludMental({
            planilla: prev,
            filasConfiguracion
          }),
          filas,
          semanas: periodos,
          filaFija: etiquetaSaludMental,
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
      personal: personalFiltrado,
      cantidadEsperada: filas.length
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
      const prepararGeneracion = (planillaActual) => {
        const planillaAdaptada = adaptarPlanillaSaludMental({
          planilla: planillaActual,
          filasConfiguracion
        });
        return esMesInicial
          ? regenerarRotacion3DiasDesdePrimerBloque({
            rotacion3Dias: planillaAdaptada.rotacion3Dias,
            periodos,
            filas,
            filasFijas: etiquetaSaludMental ? [etiquetaSaludMental] : [],
            estrategia
          })
          : prepararRotacion3DiasParaGenerar({
            rotacion3Dias: planillaAdaptada.rotacion3Dias,
            periodos,
            filas,
            filasFijas: etiquetaSaludMental ? [etiquetaSaludMental] : [],
            estrategia
          });
      };
      const preparacionActual = prepararGeneracion(planilla);
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
        const preparacion = prepararGeneracion(prev);
        if (!preparacion.ok) return prev;

        return {
          ...prev,
          rotacion3Dias: preparacion.rotacion3Dias
        };
      });
      return;
    }

    setPlanilla((prev) => generarRotacionMensual({
      planilla: adaptarPlanillaSaludMental({
        planilla: prev,
        filasConfiguracion
      }),
      filas,
      semanas: periodos,
      filaFija: etiquetaSaludMental,
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
        const sincronizaAsignacionBase = debeSincronizarAsignacionBase({
          rotacion3Dias: rotacionActual,
          periodoClave: periodo
        });

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
            ...(sincronizaAsignacionBase
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

  const habilitarPosicionMensual = () => {
    if (soloLectura || versionHistoricaActiva) return;
    setPlanilla((prev) => habilitarTurnanteMensual(prev, tipo));
    setMensajeTurnanteMensual("");
  };

  const solicitarEliminarPosicionMensual = () => {
    if (soloLectura || versionHistoricaActiva) return;
    const validacion = validarEliminacionTurnanteMensual(planilla, tipo);
    if (!validacion.ok) {
      setMensajeTurnanteMensual(validacion.mensaje);
      return;
    }
    if (!window.confirm(
      `¿Eliminar ${posicionTurnanteMensual} mensual? La fila está vacía y dejará de mostrarse en este turno y mes.`
    )) return;
    setPlanilla((prev) => {
      const resultado = eliminarTurnanteMensual(prev, tipo);
      return resultado.ok ? resultado.planilla : prev;
    });
    setMensajeTurnanteMensual("");
  };

  const vaciarDesdeSemana2 = () => {
    if (soloLectura || versionHistoricaActiva || usaRotacionTresDias) return;
    const confirmado = window.confirm(
      "Se vaciarán todas las asignaciones desde la Semana 2 en adelante. La Semana 1 quedará sin cambios y podrá usarse como referencia. ¿Continuar?"
    );
    if (!confirmado) return;
    setPlanilla((prev) => vaciarPlanillaDesdeSemana2({ planilla: prev }));
  };

  function actualizarAsignacionBaseNocturna(sector, personaId) {
    if (soloLectura || !usaRotacionTresDias || tipo !== "enfermero") return;
    const persona = personalFiltrado.find((item) => item.id === personaId);
    const valor = personaId ? crearReferenciaPersona(persona) : "";
    if (personaId && !valor) return;

    setPlanilla((prev) => ({
      ...prev,
      rotacion3Dias: {
        ...(prev?.rotacion3Dias || {}),
        asignacionBase: {
          ...(prev?.rotacion3Dias?.asignacionBase || {}),
          [sector]: valor
        }
      }
    }));
  }

  const obtenerValoresPeriodo = (periodo) => usaRotacionTresDias
    ? planilla?.rotacion3Dias?.bloques?.[periodo.clave] || {}
    : planilla?.[periodo.clave] || {};

  const obtenerEtiquetaPeriodo = (periodo) => usaRotacionTresDias
    ? periodo.etiqueta
    : `${periodo.desde.getDate()}/${periodo.desde.getMonth() + 1} - ${periodo.hasta.getDate()}/${periodo.hasta.getMonth() + 1}`;

  const periodoReintegroActivo = periodos.find(
    (periodo) => periodo.clave === periodoReintegros
  ) || periodos[0];
  const asignacionesParcialesActivas = obtenerAsignacionesParcialesPeriodo(
    planilla,
    periodoReintegroActivo?.clave
  );
  const reintegrosActivos = periodoReintegroActivo
    ? detectarDisponiblesPorReintegro({
        personal,
        licencias,
        distribucionBase: obtenerValoresPeriodo(periodoReintegroActivo),
        asignacionesParciales: asignacionesParcialesActivas,
        periodo: periodoReintegroActivo,
        mesActivo,
        categoria: tipo
      })
    : [];
  const advertenciasAsignacionesParciales = periodoReintegroActivo
    ? asignacionesParcialesActivas.flatMap((asignacion) => {
        const validacion = validarAsignacionParcial({
          asignacion,
          asignacionIdEditada: asignacion.id,
          periodo: periodoReintegroActivo,
          mesActivo,
          filas,
          distribucionBase: obtenerValoresPeriodo(periodoReintegroActivo),
          asignacionesExistentes: asignacionesParcialesActivas,
          personal,
          licencias,
          categoria: tipo
        });
        return validacion.ok
          ? []
          : [{ id: asignacion.id, mensaje: `${asignacion.nombre}: ${validacion.mensaje}` }];
      })
    : [];
  const periodosReintegros = periodos.map((periodo, indice) => ({
    clave: periodo.clave,
    etiqueta: usaRotacionTresDias
      ? obtenerEtiquetaPeriodo(periodo)
      : `Semana ${indice + 1} · ${obtenerEtiquetaPeriodo(periodo)}`
  }));

  const guardarParcial = (borrador, cerrar) => {
    if (soloLectura || versionHistoricaActiva || !periodoReintegroActivo) return;
    const metadatos = borrador.id ? {} : crearMetadatosAsignacionParcial();
    const asignacion = {
      ...borrador,
      id: borrador.id || metadatos.id,
      creadoEn: borrador.creadoEn || metadatos.creadoEn
    };
    const validar = (planillaActual) => validarAsignacionParcial({
      asignacion,
      asignacionIdEditada: borrador.id,
      periodo: periodoReintegroActivo,
      mesActivo,
      filas,
      distribucionBase: usaRotacionTresDias
        ? planillaActual?.rotacion3Dias?.bloques?.[periodoReintegroActivo.clave] || {}
        : planillaActual?.[periodoReintegroActivo.clave] || {},
      asignacionesExistentes: obtenerAsignacionesParcialesPeriodo(
        planillaActual,
        periodoReintegroActivo.clave
      ),
      personal,
      licencias,
      categoria: tipo
    });
    const validacionActual = validar(planilla);
    if (!validacionActual.ok) {
      setErrorAsignacionParcial(validacionActual.mensaje);
      return;
    }

    setPlanilla((prev) => {
      const revalidacion = validar(prev);
      if (!revalidacion.ok) return prev;
      return guardarAsignacionParcial({
        planilla: prev,
        periodoClave: periodoReintegroActivo.clave,
        asignacion: revalidacion.asignacion
      });
    });
    setErrorAsignacionParcial("");
    cerrar();
  };

  const eliminarParcial = (asignacionId) => {
    if (soloLectura || versionHistoricaActiva || !periodoReintegroActivo) return;
    setPlanilla((prev) => eliminarAsignacionParcial({
      planilla: prev,
      periodoClave: periodoReintegroActivo.clave,
      asignacionId
    }));
  };

  const periodosIntercambiables = periodos.flatMap((periodo, indice) =>
    obtenerDistribucionPeriodo({
      planilla,
      periodoClave: periodo.clave,
      usaRotacionTresDias
    })
      ? [{
          clave: periodo.clave,
          etiqueta: usaRotacionTresDias
            ? obtenerEtiquetaPeriodo(periodo)
            : `Semana ${indice + 1}`
        }]
      : []
  );

  const opcionesIntercambio = intercambio
    ? obtenerOpcionesOcupadas({
        planilla,
        periodoClave: intercambio.periodoClave,
        filas,
        personal,
        categoria: tipo,
        usaRotacionTresDias
      })
    : [];

  const validacionIntercambio = intercambio?.filaOrigen && intercambio?.filaDestino
    ? validarIntercambioPlanilla({
        planilla,
        periodoClave: intercambio.periodoClave,
        filaOrigen: intercambio.filaOrigen,
        filaDestino: intercambio.filaDestino,
        filas,
        personal: personalFiltrado,
        categoria: tipo,
        usaRotacionTresDias,
        personaIdOrigenEsperada: intercambio.personaIdOrigenEsperada,
        personaIdDestinoEsperada: intercambio.personaIdDestinoEsperada
      })
    : null;

  const abrirLimpiezaPlanilla = () => {
    if (soloLectura || versionHistoricaActiva || planillaEstaVacia) return;
    setLimpiezaPlanilla({
      contexto: contextoLimpiezaActual,
      planillaEsperada: planilla,
      error: ""
    });
  };

  const confirmarLimpiezaPlanilla = () => {
    if (
      !limpiezaPlanilla ||
      !validarContextoLimpieza(limpiezaPlanilla.contexto, contextoLimpiezaActual) ||
      limpiezaPlanilla.planillaEsperada !== planilla
    ) {
      setLimpiezaPlanilla((actual) => actual
        ? {
            ...actual,
            error: "La planilla cambió mientras confirmabas la limpieza. Revisá nuevamente."
          }
        : actual);
      return;
    }

    const planillaEsperada = limpiezaPlanilla.planillaEsperada;
    setPlanilla((prev) => {
      if (prev !== planillaEsperada) return prev;
      return vaciarPlanillaMensual({
        planilla: prev,
        tipo,
        usaRotacionTresDias
      });
    });
    setLimpiezaPlanilla(null);
  };

  const abrirIntercambio = () => {
    if (soloLectura || versionHistoricaActiva) return;
    const primerPeriodo = periodosIntercambiables[0];
    if (!primerPeriodo) {
      alert("No hay períodos existentes para intercambiar.");
      return;
    }
    setIntercambio({
      contextoClave: claveContextoIntercambio,
      periodoClave: primerPeriodo.clave,
      filaOrigen: "",
      filaDestino: "",
      personaIdOrigenEsperada: "",
      personaIdDestinoEsperada: "",
      error: ""
    });
  };

  const confirmarIntercambio = () => {
    if (
      !intercambio ||
      intercambio.contextoClave !== claveContextoIntercambio ||
      soloLectura ||
      versionHistoricaActiva
    ) {
      setIntercambio((actual) => actual
        ? {
            ...actual,
            error: versionHistoricaActiva
              ? "No se puede intercambiar mientras estás viendo una versión histórica."
              : "No se puede intercambiar en modo solo lectura."
          }
        : actual);
      return;
    }
    const validacion = validarIntercambioPlanilla({
      planilla,
      periodoClave: intercambio.periodoClave,
      filaOrigen: intercambio.filaOrigen,
      filaDestino: intercambio.filaDestino,
      filas,
      personal,
      categoria: tipo,
      usaRotacionTresDias,
      personaIdOrigenEsperada: intercambio.personaIdOrigenEsperada,
      personaIdDestinoEsperada: intercambio.personaIdDestinoEsperada
    });
    if (!validacion.ok) {
      setIntercambio((actual) => ({ ...actual, error: validacion.mensaje }));
      return;
    }

    setPlanilla((prev) => {
      const resultado = aplicarIntercambioPlanilla({
        planilla: prev,
        periodoClave: intercambio.periodoClave,
        filaOrigen: intercambio.filaOrigen,
        filaDestino: intercambio.filaDestino,
        filas,
        personal,
        categoria: tipo,
        usaRotacionTresDias,
        personaIdOrigenEsperada: intercambio.personaIdOrigenEsperada,
        personaIdDestinoEsperada: intercambio.personaIdDestinoEsperada
      });
      return resultado.ok ? resultado.planilla : prev;
    });
    setIntercambio(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">Planilla Mensual</h2>
        {!soloLectura && !versionHistoricaActiva && (
          <div className="flex flex-wrap items-center gap-2">
            {!usaRotacionTresDias && (
              <button
                type="button"
                onClick={vaciarDesdeSemana2}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
              >
                Vaciar desde Semana 2
              </button>
            )}
            <button
              type="button"
              onClick={abrirLimpiezaPlanilla}
              disabled={planillaEstaVacia}
              className="rounded-xl border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            >
              Vaciar planilla
            </button>
          </div>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {turnanteMensualHabilitado
                ? `${posicionTurnanteMensual} mensual habilitado`
                : "Turnante mensual adicional"}
            </p>
            {personalFiltrado.length > capacidadNormal && !turnanteMensualHabilitado && (
              <p className="mt-1 text-sm text-slate-600">
                Hay {personalFiltrado.length} {nombreCategoria} y {capacidadNormal} posiciones normales.
                Podés agregar {posicionTurnanteMensual} para este mes.
              </p>
            )}
            {mensajeTurnanteMensual && (
              <p role="alert" className="mt-1 text-sm text-amber-700">
                {mensajeTurnanteMensual}
              </p>
            )}
          </div>
          {!soloLectura && !versionHistoricaActiva && (
            turnanteMensualHabilitado ? (
              <button
                type="button"
                onClick={solicitarEliminarPosicionMensual}
                className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
              >
                Eliminar Turnante mensual
              </button>
            ) : (
              <button
                type="button"
                onClick={habilitarPosicionMensual}
                className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                + Agregar {posicionTurnanteMensual} mensual
              </button>
            )
          )}
        </div>
      </section>

      {usaRotacionTresDias && tipo === "enfermero" && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
          <h3 className="font-semibold text-indigo-950">
            Base editable de la rotación nocturna
          </h3>
          <p className="mt-1 text-sm text-indigo-900">
            Revisá esta distribución antes de generar los bloques faltantes.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {filas.map((sector) => {
              const distribucion = planilla?.rotacion3Dias?.asignacionBase || {};
              const referenciaActual = distribucion[sector] || "";
              const personaActual = resolverPersonaDesdeReferencia(
                referenciaActual,
                personal
              );
              const nombreHistorico = obtenerNombreDesdeReferencia(
                referenciaActual,
                personalFiltrado
              );
              const valor = personaActual?.id ||
                (nombreHistorico ? "__REFERENCIA_NO_RESUELTA__" : "");
              return (
                <label key={sector} className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">{sector}</span>
                  <select
                    disabled={soloLectura}
                    value={valor}
                    onChange={(evento) =>
                      actualizarAsignacionBaseNocturna(sector, evento.target.value)
                    }
                    className="w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5"
                  >
                    <option value="">-- elegir --</option>
                    {!personaActual && nombreHistorico && (
                      <option value="__REFERENCIA_NO_RESUELTA__" disabled>
                        {nombreHistorico}
                      </option>
                    )}
                    {personalFiltrado
                      .filter((persona) =>
                        !Object.entries(distribucion).some(
                          ([otraFila, referencia]) =>
                            otraFila !== sector &&
                            referenciaCorrespondeAPersona(
                              referencia,
                              persona,
                              personal
                            )
                        )
                      )
                      .map((persona, indice) => (
                        <option
                          key={obtenerClaveRenderPersona(persona, indice, idsDuplicados)}
                          value={persona.id}
                        >
                          {obtenerEtiquetaPersona(persona, personal)}
                        </option>
                      ))}
                  </select>
                </label>
              );
            })}
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[900px] table-auto border-separate border-spacing-0 text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="sticky left-0 z-20 w-[140px] min-w-[140px] max-w-[140px] border-r border-slate-200 bg-slate-100 px-3 py-3 text-left font-semibold shadow-[2px_0_4px_-3px_rgba(15,23,42,0.35)] md:w-[180px] md:min-w-[180px] md:max-w-[180px] md:px-4">
                Sector
              </th>
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
                <td className="sticky left-0 z-10 w-[140px] min-w-[140px] max-w-[140px] whitespace-normal border-r border-slate-200 bg-slate-50 px-3 py-3 font-medium text-slate-700 shadow-[2px_0_4px_-3px_rgba(15,23,42,0.35)] md:w-[180px] md:min-w-[180px] md:max-w-[180px] md:whitespace-nowrap md:px-4">
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
                  const opcionesSelector = obtenerOpcionesSelectorPlanilla({
                    personalCategoria: personalFiltrado,
                    personal,
                    distribucion: valoresPeriodo,
                    sector,
                    referenciaActual,
                    licencias,
                    periodo
                  }).opciones;

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
                        {opcionesSelector
                          .map(({ persona, etiquetaEstado }, indice) => (
                            <option
                              key={obtenerClaveRenderPersona(persona, indice, idsDuplicados)}
                              value={persona.id}
                            >
                              {obtenerEtiquetaPersona(persona, personal)}
                              {etiquetaEstado ? ` — ${etiquetaEstado}` : ""}
                            </option>
                          ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-blue-100 bg-blue-50/60">
              <td className="sticky left-0 z-10 w-[140px] min-w-[140px] max-w-[140px] whitespace-normal border-r border-blue-200 bg-blue-50 px-3 py-3 font-semibold text-blue-900 shadow-[2px_0_4px_-3px_rgba(15,23,42,0.35)] md:w-[180px] md:min-w-[180px] md:max-w-[180px] md:whitespace-nowrap md:px-4">
                {tipo === "enfermero"
                  ? "Cubre libre de SM"
                  : "Cubre libre de Salud Mental"}
              </td>
              {periodos.map((periodo) => {
                const valoresPeriodo = obtenerValoresPeriodo(periodo);
                const titular = resolverPersonaDesdeReferencia(
                  obtenerReferenciaSaludMental({
                    distribucion: valoresPeriodo,
                    fila: filaSaludMental
                  }),
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

      <PanelReintegrosPlanilla
        periodos={periodosReintegros}
        periodoClave={periodoReintegroActivo?.clave || ""}
        reintegros={reintegrosActivos}
        filas={filas}
        soloLectura={soloLectura || versionHistoricaActiva}
        error={errorAsignacionParcial}
        advertencias={advertenciasAsignacionesParciales}
        onCambiarPeriodo={(clave) => {
          setPeriodoReintegros(clave);
          setErrorAsignacionParcial("");
        }}
        onGuardar={guardarParcial}
        onEliminar={eliminarParcial}
      />

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
      <button
        type="button"
        disabled={soloLectura || versionHistoricaActiva}
        onClick={abrirIntercambio}
        title={versionHistoricaActiva
          ? "No se puede intercambiar mientras estás viendo una versión histórica."
          : undefined}
        className="ml-2 rounded-xl border border-blue-600 px-4 py-2 text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
      >
        ⇄ Intercambiar personas
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
      {intercambio?.contextoClave === claveContextoIntercambio && (
        <PanelIntercambioPlanilla
          periodos={periodosIntercambiables}
          periodoClave={intercambio.periodoClave}
          filaOrigen={intercambio.filaOrigen}
          filaDestino={intercambio.filaDestino}
          opciones={opcionesIntercambio}
          resumen={validacionIntercambio?.ok
            ? {
                ...validacionIntercambio.resumen,
                periodoEtiqueta: periodosIntercambiables.find(
                  (periodo) => periodo.clave === intercambio.periodoClave
                )?.etiqueta || intercambio.periodoClave
              }
            : null}
          error={intercambio.error || (
            validacionIntercambio && !validacionIntercambio.ok
              ? validacionIntercambio.mensaje
              : ""
          )}
          onCambiarPeriodo={(periodoClave) => {
            setIntercambio((actual) => ({
              ...actual,
              periodoClave,
              filaOrigen: "",
              filaDestino: "",
              personaIdOrigenEsperada: "",
              personaIdDestinoEsperada: "",
              error: ""
            }));
          }}
          onCambiarOrigen={(filaOrigen) => {
            const opcion = opcionesIntercambio.find(
              (item) => item.fila === filaOrigen
            );
            setIntercambio((actual) => ({
              ...actual,
              filaOrigen,
              filaDestino: "",
              personaIdOrigenEsperada: opcion?.personaId || "",
              personaIdDestinoEsperada: "",
              error: ""
            }));
          }}
          onCambiarDestino={(filaDestino) => {
            const opcion = opcionesIntercambio.find(
              (item) => item.fila === filaDestino
            );
            setIntercambio((actual) => ({
              ...actual,
              filaDestino,
              personaIdDestinoEsperada: opcion?.personaId || "",
              error: ""
            }));
          }}
          onCancelar={() => setIntercambio(null)}
          onConfirmar={confirmarIntercambio}
        />
      )}
      {limpiezaPlanilla && (
        <PanelConfirmacionLimpieza
          titulo={`¿Vaciar la Planilla de ${nombreCategoria}?`}
          descripcion={`Se eliminarán todas las asignaciones del turno ${nombreTurno} correspondientes a ${periodoVisible}.`}
          detalles={describirContenidoAEliminar({
            tipo,
            usaRotacionTresDias
          }).map((detalle) => `Se eliminarán ${detalle}.`)}
          advertencia="Personal, licencias, certificaciones, extras y Calendario Diario no se modificarán."
          error={limpiezaPlanilla.error}
          textoConfirmar="Sí, vaciar planilla"
          onCancelar={() => setLimpiezaPlanilla(null)}
          onConfirmar={confirmarLimpiezaPlanilla}
        />
      )}
    </div>
  );
}

export default PlanillaMensual;
