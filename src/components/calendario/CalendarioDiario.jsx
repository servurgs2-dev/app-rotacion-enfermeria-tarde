import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { configuracionSectores } from "../../data/sectores";
import {
  estaCertificado,
  estaDeLicencia,
  esDiaLibre,
  keyDiaFromDate,
  semanaKeyFromDate
} from "../../utils/fechas";
import { normalizar } from "../../utils/texto";
import {
  obtenerClaveIdentidadPersona,
  personasCompartenIdentidad
} from "../../utils/identidadPersonas.js";
import {
  agregarPersonaAListaReferencias,
  quitarPersonaDeListaReferencias,
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "../../utils/referenciasPersonas.js";
import { aplicarMovimientosCalendario } from "../../utils/cambiosCalendario.js";
import {
  agregarExtraALista,
  crearExtraTemporal,
  eliminarExtraDelDia
} from "../../utils/extrasPersonas.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";
import {
  obtenerClaveRenderPersona,
  obtenerIdsPersonalDuplicados
} from "../../utils/validacionPersonal.js";
import {
  ESTADOS_ASISTENCIA,
  actualizarAsistenciaPersona,
  limpiarAsistenciaFecha,
  marcarPersonasPresentes,
  obtenerEstadoAsistencia,
  obtenerPersonasPrevistas,
  resumirAsistencia
} from "../../utils/asistenciaPersonas.js";
import {
  aplicarCoberturaLibreSaludMental,
  obtenerSectorSaludMental,
  obtenerTitularSaludMental,
  puedeCubrirLibreSaludMental,
  resolverCoberturaSemanalSaludMental
} from "../../utils/coberturaSaludMental.js";
import { crearResumenTurno } from "../../utils/resumenTurno.js";

function CalendarioDiario({
  personal,
  planilla,
  tipo,
  mesActivo,
  licencias,
  certificaciones,
  calendario,
  setCalendario,
  esDiaParo,
  setDiaParo,
  onDataReady,
  fecha,
  setFecha,
  soloLectura = false
}) {
  const personalFiltrado = useMemo(
    () => personal.filter((p) => p?.categoria === tipo),
    [personal, tipo]
  );
  const idsPersonalDuplicados = useMemo(
    () => obtenerIdsPersonalDuplicados(personal),
    [personal]
  );

const {
  cambiosDia = {},
  cambiosParoDia = {},
  noDisponibles = {},
  extras = {},
  asistenciaDia = {}
} = calendario || {};

const [nuevoNombre, setNuevoNombre] = useState("");
  const [errorNuevoExtra, setErrorNuevoExtra] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [alertasAbiertas, setAlertasAbiertas] = useState(true);
  const prevDataRef = useRef(null);
  const altaExtraEnCursoRef = useRef(false);

  const {
    sectoresFijos,
    sectoresCriticos,
    sectoresBajaPrioridad,
    prioridadSectores,
    sectoresParo,
    prioridadesParo,
    turnantes: turnantesLabels,
    posicionesTurnantes,
    ordenVisual
  } = configuracionSectores[tipo];

  const filas = useMemo(() => {
    const filasCalculadas = [];
    let tIndex = 0;

    sectoresFijos.forEach((s, i) => {
      filasCalculadas.push(s);

      if (posicionesTurnantes.includes(i)) {
        filasCalculadas.push(turnantesLabels[tIndex]);
        tIndex++;
      }
    });

    return filasCalculadas;
  }, [posicionesTurnantes, sectoresFijos, turnantesLabels]);

const semanaKey = semanaKeyFromDate(fecha, mesActivo);
const planillaSemana = useMemo(
  () => (semanaKey ? planilla?.[semanaKey] || {} : {}),
  [planilla, semanaKey]
);
const keyDia = keyDiaFromDate(fecha);
const asistenciaFecha = useMemo(
  () => asistenciaDia[keyDia] || {},
  [asistenciaDia, keyDia]
);
const cambiosActivos = esDiaParo ? cambiosParoDia : cambiosDia;
const claveCambiosActivos = esDiaParo ? "cambiosParoDia" : "cambiosDia";
const fechaMinima = `${mesActivo}-01`;
const [yearMesActivo, monthMesActivo] = mesActivo.split("-").map(Number);
const ultimoDiaDelMes = new Date(yearMesActivo, monthMesActivo, 0).getDate();
const fechaMaxima = `${mesActivo}-${String(ultimoDiaDelMes).padStart(2, "0")}`;
const extrasDia = useMemo(
  () => (Array.isArray(extras[keyDia]) ? extras[keyDia].filter(Boolean) : []),
  [extras, keyDia]
);

useEffect(() => {
  altaExtraEnCursoRef.current = false;
}, [extrasDia]);

const esLibreReal = useCallback(
  (e) => esDiaLibre(e, fecha, false),
  [fecha]
);

const libres = useMemo(
  () => personalFiltrado.filter(esLibreReal),
  [esLibreReal, personalFiltrado]
);

const estaLibre = useCallback(
  (e) => {
    const esExtraHoy = extrasDia.some((ex) => personasCompartenIdentidad(ex, e));
    return esDiaLibre(e, fecha, esExtraHoy);
  },
  [fecha, extrasDia]
);

const estaDeLicenciaHoy = useCallback(
  (e) => e && estaDeLicencia(licencias, e, fecha, personal),
  [fecha, licencias, personal]
);

const estaCertificadoHoy = useCallback(
  (e) => e && estaCertificado(certificaciones, e, fecha, personal),
  [certificaciones, fecha, personal]
);

const certificados = useMemo(
  () => [...new Map(
    personalFiltrado
      .filter(estaCertificadoHoy)
      .map((persona) => [obtenerClaveIdentidadPersona(persona), persona])
      .filter(([clave]) => Boolean(clave))
  ).values()],
  [estaCertificadoHoy, personalFiltrado]
);

  const estaNoDisponible = useCallback(
    (e) => e && (noDisponibles[keyDia] || []).some(
      (referencia) => referenciaCorrespondeAPersona(
        referencia,
        e,
        personalFiltrado
      )
    ),
    [keyDia, noDisponibles, personalFiltrado]
  );

const estaAusente = useCallback(
  (e) =>
    e &&
    (
      (esLibreReal(e) && !extrasDia.some((ex) => personasCompartenIdentidad(ex, e))) ||
      estaNoDisponible(e) ||
      estaDeLicenciaHoy(e) ||
      estaCertificadoHoy(e)
    ),
  [esLibreReal, estaCertificadoHoy, estaDeLicenciaHoy, estaNoDisponible, extrasDia]
);

const borrarExtra = (extra) => {
  if (soloLectura) return;
  setCalendario((prev) => eliminarExtraDelDia({
    calendarioCategoria: prev,
    fecha: keyDia,
    extra,
    personal: personalFiltrado
  }));

  if (personasCompartenIdentidad(seleccionado?.enfermero, extra)) {
    setSeleccionado(null);
  }
};

const asignacionOrdenada = useMemo(() => {
let asignacionCompleta = filas.map((fila) => {
  const override = cambiosDia[keyDia]?.[normalizar(fila)];

  let enfermero;

  if (override && override !== "__EMPTY__") {
    enfermero = resolverPersonaDesdeReferencia(
      override,
      [...personalFiltrado, ...extrasDia]
    );
  } else if (!override) {
    enfermero = resolverPersonaDesdeReferencia(
      planillaSemana[fila],
      personal
    );
  }

  return {
    nombre: fila,
    enfermero: enfermero || null,
    tipo: turnantesLabels.includes(fila) ? "turnante" : "sector"
  };
});

const sectorSaludMental = obtenerSectorSaludMental(tipo);
const titularSaludMental = obtenerTitularSaludMental({
  planillaSemana,
  personal: personalFiltrado,
  tipo
});
const coberturaSaludMental = resolverCoberturaSemanalSaludMental({
  planilla,
  semana: semanaKey,
  personal: personalFiltrado
});
const cambiosActivosDia = cambiosActivos[keyDia] || {};
const existeCambioManualSaludMental = Object.hasOwn(
  cambiosActivosDia,
  normalizar(sectorSaludMental)
);
const coberturaDisponible = puedeCubrirLibreSaludMental({
  persona: coberturaSaludMental,
  tipo,
  estaLibre: esLibreReal(coberturaSaludMental),
  estaDeLicencia: estaDeLicenciaHoy(coberturaSaludMental),
  estaCertificada: estaCertificadoHoy(coberturaSaludMental),
  estaNoDisponible: estaNoDisponible(coberturaSaludMental)
});

asignacionCompleta = aplicarCoberturaLibreSaludMental({
  asignaciones: asignacionCompleta,
  sector: sectorSaludMental,
  titular: titularSaludMental,
  cobertura: coberturaSaludMental,
  titularLibre: Boolean(
    titularSaludMental &&
    esLibreReal(titularSaludMental) &&
    !estaDeLicenciaHoy(titularSaludMental) &&
    !estaCertificadoHoy(titularSaludMental) &&
    !estaNoDisponible(titularSaludMental) &&
    obtenerEstadoAsistencia(asistenciaFecha, titularSaludMental) !== ESTADOS_ASISTENCIA.AUSENTE
  ),
  coberturaDisponible,
  existeCambioManual: existeCambioManualSaludMental
});

  let turnantesDisponibles = asignacionCompleta
    .filter((f) => f.tipo === "turnante")
    .map((f) => f.enfermero)
    .filter((e) => e && !estaAusente(e));

  let turnoIndex = 0;
const usadosSet = new Set();
const usarEnfermero = (e) => {
  if (!e) return null;

  const claveIdentidad = obtenerClaveIdentidadPersona(e);

  if (!claveIdentidad || usadosSet.has(claveIdentidad)) return null;

  usadosSet.add(claveIdentidad);
  return e;
};
const tomarTurnanteDisponible = () => {
  while (turnoIndex < turnantesDisponibles.length) {
    const turnante = usarEnfermero(turnantesDisponibles[turnoIndex++]);

    if (turnante) return turnante;
  }

  return null;
};
  const asignacionBase = asignacionCompleta
    .filter((f) => f.tipo === "sector")
    .map((item) => {
      if (!item.enfermero) return { ...item, enfermero: null };

      if (estaAusente(item.enfermero)) {
        const eFinal = tomarTurnanteDisponible();
return { ...item, enfermero: eFinal, reemplazo: true };
      }

    const eFinal = usarEnfermero(item.enfermero);
return { ...item, enfermero: eFinal, reemplazo: false };
    });

  let extraIndex = 0;
const tomarExtraDisponible = () => {
  const extrasDisponibles = extrasDia.filter((e) => e && !estaAusente(e));

  while (extraIndex < extrasDisponibles.length) {
    const extra = usarEnfermero(extrasDisponibles[extraIndex++]);

    if (extra) return extra;
  }

  return null;
};

asignacionBase.forEach((item) => {
  if (!item.enfermero) {
    item.enfermero = tomarExtraDisponible();
  }
});

asignacionBase.forEach((item) => {
  if (!item.enfermero) {
    const eFinal = tomarTurnanteDisponible();
    if (eFinal) item.enfermero = eFinal;
  }
});

  if (esDiaParo) {
    sectoresCriticos.forEach((critico) => {
      const sectorCritico = asignacionBase.find((item) => item.nombre === critico);

      if (sectorCritico && !sectorCritico.enfermero) {
        for (const sectorBajaPrioridad of sectoresBajaPrioridad) {
          const donante = asignacionBase.find((item) => item.nombre === sectorBajaPrioridad);

          if (donante?.enfermero && !estaAusente(donante.enfermero)) {
            sectorCritico.enfermero = donante.enfermero;
            donante.enfermero = null;
            donante.sacrificado = true;
            break;
          }
        }
      }
    });
  } else {
    prioridadSectores.forEach((sector, indiceSector) => {
      const destino = asignacionBase.find(
        (item) => normalizar(item.nombre) === normalizar(sector)
      );

      if (!destino || destino.enfermero) return;

      for (let indiceDonante = prioridadSectores.length - 1; indiceDonante > indiceSector; indiceDonante--) {
        const donante = asignacionBase.find(
          (item) => normalizar(item.nombre) === normalizar(prioridadSectores[indiceDonante])
        );

        if (donante?.enfermero && !estaAusente(donante.enfermero)) {
          destino.enfermero = donante.enfermero;
          donante.enfermero = null;
          donante.sacrificado = true;
          break;
        }
      }
    });
  }

  const asignacionFinal = asignacionBase;

const hayHuecosFinal = asignacionFinal.some((a) => !a.enfermero);

const usados = asignacionFinal
  .map((a) => obtenerClaveIdentidadPersona(a.enfermero))
  .filter(Boolean);

const identidadesSobrantes = new Set(usados);
const sobrantes = [...personalFiltrado, ...extrasDia].filter((e) => {
  if (!e || estaAusente(e)) return false;

  const claveIdentidad = obtenerClaveIdentidadPersona(e);

  if (!claveIdentidad || identidadesSobrantes.has(claveIdentidad)) return false;

  identidadesSobrantes.add(claveIdentidad);
  return true;
});

const filaReanimacionSillones = asignacionFinal.find(
  (item) => normalizar(item.nombre) === normalizar("Reanimación + Sillones")
);
const seDivideReanimacionSillones =
  tipo === "licenciado" &&
  !esDiaParo &&
  !hayHuecosFinal &&
  Boolean(filaReanimacionSillones?.enfermero) &&
  sobrantes.length > 0;

let asignacionParaMostrar = asignacionFinal;
let ordenVisualActivo = ordenVisual;

if (seDivideReanimacionSillones) {
  const filasDivididas = [
    {
      nombre: "Reanimación",
      enfermero: filaReanimacionSillones.enfermero,
      tipo: "sector"
    },
    {
      nombre: "Sillones",
      enfermero: sobrantes[0],
      tipo: "sector"
    },
    ...sobrantes.slice(1).map((enfermero) => ({
      nombre: "SIN ASIGNAR",
      enfermero,
      tipo: "sector"
    }))
  ];

  asignacionParaMostrar = [
    ...asignacionFinal.filter(
      (item) => normalizar(item.nombre) !== normalizar("Reanimación + Sillones")
    ),
    ...filasDivididas
  ];

  const cambiosDivididos = cambiosDia[keyDia] || {};
  const nombresFilasDivididas = ["Reanimación", "Sillones"];
  const operaciones = [];
  const personasSolicitadas = new Set();

  nombresFilasDivididas.forEach((nombreFila) => {
    const destino = asignacionParaMostrar.find(
      (item) => normalizar(item.nombre) === normalizar(nombreFila)
    );
    const referenciaSolicitada = cambiosDivididos[normalizar(nombreFila)];

    if (!destino || !referenciaSolicitada || referenciaSolicitada === "__EMPTY__") return;

    const personaSolicitada = resolverPersonaDesdeReferencia(
      referenciaSolicitada,
      [...personalFiltrado, ...extrasDia]
    );
    const enfermero = asignacionParaMostrar.find(
      (item) => personasCompartenIdentidad(item.enfermero, personaSolicitada)
    )?.enfermero;
    const claveIdentidad = obtenerClaveIdentidadPersona(enfermero);

    if (!enfermero || !claveIdentidad || personasSolicitadas.has(claveIdentidad)) return;

    const fuente = asignacionParaMostrar.find(
      (item) => obtenerClaveIdentidadPersona(item.enfermero) === claveIdentidad
    );

    if (!fuente) return;

    personasSolicitadas.add(claveIdentidad);
    operaciones.push({ destino, fuente, enfermero, desplazado: destino.enfermero });
  });

  const destinosConCambio = new Set(
    operaciones.map(({ destino }) => normalizar(destino.nombre))
  );

  operaciones.forEach(({ fuente }) => {
    fuente.enfermero = null;
  });

  operaciones.forEach(({ destino, enfermero }) => {
    destino.enfermero = enfermero;
  });

  const personasParaReubicar = operaciones
    .map(({ desplazado }) => desplazado)
    .filter((enfermero) =>
      enfermero &&
      !personasSolicitadas.has(obtenerClaveIdentidadPersona(enfermero))
    );
  const identidadesYaAsignadas = new Set(
    asignacionParaMostrar
      .map((item) => obtenerClaveIdentidadPersona(item.enfermero))
      .filter(Boolean)
  );

  operaciones.forEach(({ fuente }) => {
    if (destinosConCambio.has(normalizar(fuente.nombre)) || fuente.enfermero) return;

    const indiceReubicacion = personasParaReubicar.findIndex(
      (enfermero) =>
        !identidadesYaAsignadas.has(obtenerClaveIdentidadPersona(enfermero))
    );
    const enfermero = personasParaReubicar[indiceReubicacion];

    if (enfermero) {
      fuente.enfermero = enfermero;
      identidadesYaAsignadas.add(obtenerClaveIdentidadPersona(enfermero));
    }
  });

  ordenVisualActivo = ordenVisual.flatMap((item) =>
    normalizar(item) === normalizar("Reanimación + Sillones")
      ? ["Reanimación", "Sillones"]
      : [item]
  );
} else if (!hayHuecosFinal && sobrantes.length > 0) {
  asignacionFinal.push({
    nombre: "SILLONES 3",
    enfermero: sobrantes[0]
  });

  sobrantes.slice(1).forEach((e) => {
    asignacionFinal.push({
      nombre: "SIN ASIGNAR",
      enfermero: e
    });
  });
}

if (esDiaParo) {
  const candidatos = [];
  const candidatosSet = new Set();
  const agregarCandidato = (enfermero) => {
    if (!enfermero || estaAusente(enfermero)) return;

    const claveIdentidad = obtenerClaveIdentidadPersona(enfermero);
    if (!claveIdentidad || candidatosSet.has(claveIdentidad)) return;

    candidatosSet.add(claveIdentidad);
    candidatos.push(enfermero);
  };

  asignacionFinal.forEach((item) => agregarCandidato(item.enfermero));
  extrasDia.forEach(agregarCandidato);

  const usadosParo = new Set();
  const tomarCandidato = (enfermero) => {
    if (!enfermero) return null;

    const claveIdentidad = obtenerClaveIdentidadPersona(enfermero);
    if (!claveIdentidad || usadosParo.has(claveIdentidad)) return null;

    usadosParo.add(claveIdentidad);
    return enfermero;
  };
  const resolverCambioParo = (referencia) =>
    resolverPersonaDesdeReferencia(referencia, candidatos);
  const tomarSobrante = (sectorActual) => {
    const sectorNormalizado = normalizar(sectorActual);

    for (const candidato of candidatos) {
      const sectorReservado = reservasParo.get(
        obtenerClaveIdentidadPersona(candidato)
      );
      if (sectorReservado && sectorReservado !== sectorNormalizado) {
        continue;
      }

      const enfermero = tomarCandidato(candidato);
      if (enfermero) return enfermero;
    }

    return null;
  };
  const cambiosParo = cambiosParoDia[keyDia] || {};
  const reservasParo = new Map();

  sectoresParo.forEach((sector) => {
    const override = cambiosParo[normalizar(sector)];
    const enfermero = override && override !== "__EMPTY__"
      ? resolverCambioParo(override)
      : null;
    const claveIdentidad = obtenerClaveIdentidadPersona(enfermero);

    if (claveIdentidad && !reservasParo.has(claveIdentidad)) {
      reservasParo.set(claveIdentidad, normalizar(sector));
    }
  });

  const asignacionParo = sectoresParo.map((sector) => {
    const override = cambiosParo[normalizar(sector)];
    let enfermero = null;

    if (override === "__EMPTY__") {
      return { nombre: sector, enfermero: null, tipo: "sector" };
    }

    if (override) {
      enfermero = tomarCandidato(resolverCambioParo(override));
    } else {
      for (const sectorPrioritario of prioridadesParo[sector] || []) {
        const candidatoPrioritario = asignacionFinal.find(
          (item) => normalizar(item.nombre) === normalizar(sectorPrioritario)
        )?.enfermero;

        const sectorReservado = candidatoPrioritario &&
          reservasParo.get(obtenerClaveIdentidadPersona(candidatoPrioritario));

        if (sectorReservado && sectorReservado !== normalizar(sector)) {
          continue;
        }

        enfermero = tomarCandidato(candidatoPrioritario);
        if (enfermero) break;
      }
    }

    if (!enfermero) enfermero = tomarSobrante(sector);

    return { nombre: sector, enfermero, tipo: "sector" };
  });

  candidatos.forEach((candidato) => {
    const enfermero = tomarCandidato(candidato);
    if (enfermero) {
      asignacionParo.push({
        nombre: "SIN ASIGNAR",
        enfermero,
        tipo: "sector"
      });
    }
  });

  return asignacionParo;
}

const resultadoOrdenado = [];

ordenVisualActivo.forEach((item) => {
  if (item === "DIVIDER") {
    resultadoOrdenado.push({ tipo: "divider" });
  } else {
    const encontrados = asignacionParaMostrar.filter(
      (a) => normalizar(a.nombre) === normalizar(item)
    );

    if (encontrados.length === 0) {
      resultadoOrdenado.push({
        nombre: item,
        enfermero: null,
        tipo: "sector"
      });
    } else {
      resultadoOrdenado.push(...encontrados);
    }
  }
});

return resultadoOrdenado;
}, [
  cambiosActivos,
  cambiosDia,
  cambiosParoDia,
  asistenciaFecha,
  esDiaParo,
  esLibreReal,
  estaCertificadoHoy,
  estaDeLicenciaHoy,
  estaNoDisponible,
  estaAusente,
  extrasDia,
  filas,
  keyDia,
  ordenVisual,
  personal,
  personalFiltrado,
  planilla,
  planillaSemana,
  semanaKey,
  sectoresBajaPrioridad,
  sectoresCriticos,
  prioridadSectores,
  sectoresParo,
  prioridadesParo,
  tipo,
  turnantesLabels
]);

useEffect(() => {
  const datosParaPDF = {
    asignaciones: asignacionOrdenada,
    libres,
    keyDia
  };
  const dataString = JSON.stringify(datosParaPDF);

  if (prevDataRef.current !== dataString) {
    prevDataRef.current = dataString;

    if (onDataReady) {
      onDataReady(datosParaPDF);
    }
  }
}, [asignacionOrdenada, keyDia, libres, onDataReady]);

  const personasPrevistas = useMemo(
    () => obtenerPersonasPrevistas(asignacionOrdenada),
    [asignacionOrdenada]
  );
  const resumenAsistencia = useMemo(
    () => resumirAsistencia(personasPrevistas, asistenciaFecha),
    [asistenciaFecha, personasPrevistas]
  );
  const resumenTurno = useMemo(() => {
    const hayFilasDivididas = tipo === "licenciado" &&
      asignacionOrdenada.some((item) => normalizar(item?.nombre) === "REANIMACION") &&
      asignacionOrdenada.some((item) => normalizar(item?.nombre) === "SILLONES");
    const expandirReanimacion = (sectores) => sectores.flatMap((sector) =>
      hayFilasDivididas && normalizar(sector) === "REANIMACION + SILLONES"
        ? ["Reanimación", "Sillones"]
        : [sector]
    );
    const sectoresReales = expandirReanimacion(
      esDiaParo ? sectoresParo : sectoresFijos
    );
    const criticosPanel = expandirReanimacion(sectoresCriticos);
    const personasConLicencia = personalFiltrado.filter(estaDeLicenciaHoy);
    const personasNoDisponibles = personalFiltrado.filter(estaNoDisponible);
    const sectoresSaludMental = tipo === "enfermero"
      ? ["SM"]
      : esDiaParo
        ? ["SM + Preinternación"]
        : ["Salud Mental"];

    return crearResumenTurno({
      asignaciones: asignacionOrdenada,
      asistencia: asistenciaFecha,
      libres,
      licencias: personasConLicencia,
      certificaciones: certificados,
      noDisponibles: personasNoDisponibles,
      extras: extrasDia,
      sectoresReales,
      sectoresCriticos: criticosPanel,
      sectoresSaludMental
    });
  }, [
    asignacionOrdenada,
    asistenciaFecha,
    certificados,
    esDiaParo,
    estaDeLicenciaHoy,
    estaNoDisponible,
    extrasDia,
    libres,
    personalFiltrado,
    sectoresCriticos,
    sectoresFijos,
    sectoresParo,
    tipo
  ]);

  const cambiarAsistencia = (persona, estado) => {
    if (soloLectura) return;
    setCalendario((prev) => ({
      ...prev,
      asistenciaDia: actualizarAsistenciaPersona(prev.asistenciaDia, keyDia, persona, estado)
    }));
  };

  const marcarTodosPresentes = () => {
    if (soloLectura || personasPrevistas.length === 0) return;
    setCalendario((prev) => ({
      ...prev,
      asistenciaDia: marcarPersonasPresentes(prev.asistenciaDia, keyDia, personasPrevistas)
    }));
  };

  const limpiarAsistencia = () => {
    if (soloLectura || !Object.hasOwn(asistenciaDia, keyDia)) return;
    if (!confirm("¿Limpiar la asistencia de esta fecha y categoría?")) return;
    setCalendario((prev) => ({
      ...prev,
      asistenciaDia: limpiarAsistenciaFecha(prev.asistenciaDia, keyDia)
    }));
  };

  const handleClick = (item) => {
    if (soloLectura) return;
    const guardarMovimientos = (movimientos) => {
      const nuevo = aplicarMovimientosCalendario({
        cambios: cambiosActivos[keyDia],
        movimientos
      });

      setCalendario({
        [claveCambiosActivos]: {
          ...cambiosActivos,
          [keyDia]: nuevo
        }
      });
    };

    const esFilaDividida = (fila) =>
      tipo === "licenciado" &&
      !esDiaParo &&
      fila &&
      ["REANIMACION", "SILLONES"].includes(normalizar(fila.nombre)) &&
      asignacionOrdenada.some(
        (asignacion) => normalizar(asignacion.nombre) === normalizar(fila.nombre)
      );

    if (esFilaDividida(item) || esFilaDividida(seleccionado)) {
      if (!item.enfermero) {
        if (seleccionado && esFilaDividida(item)) {
          guardarMovimientos([
            { sector: item.nombre, persona: seleccionado.enfermero },
            { sector: seleccionado.nombre, vacio: true }
          ]);
          setSeleccionado(null);
        }
        return;
      }

      if (!seleccionado) {
        setSeleccionado(item);
        return;
      }

      const movimientos = [];

      if (esFilaDividida(item)) {
        movimientos.push({ sector: item.nombre, persona: seleccionado.enfermero });
      }

      if (esFilaDividida(seleccionado)) {
        movimientos.push({ sector: seleccionado.nombre, persona: item.enfermero });
      }

      guardarMovimientos(movimientos);
      setSeleccionado(null);
      return;
    }

    if (!item.enfermero) {
      if (seleccionado) {
        guardarMovimientos([
          { sector: item.nombre, persona: seleccionado.enfermero },
          { sector: seleccionado.nombre, vacio: true }
        ]);

        setSeleccionado(null);
      }
      return;
    }

    if (estaAusente(item.enfermero)) return;

    if (!seleccionado) {
      setSeleccionado(item);
      return;
    }

    guardarMovimientos([
      { sector: item.nombre, persona: seleccionado.enfermero },
      { sector: seleccionado.nombre, persona: item.enfermero }
    ]);

    setSeleccionado(null);
  };

  return (
    <div className="min-h-fit">
      <h2 className="text-xl font-semibold text-slate-800">
  Distribución diaria
</h2>

      <div className="flex flex-wrap items-center gap-2">
      <input
  type="date"
  value={`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`}
  min={fechaMinima}
  max={fechaMaxima}
  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
  onChange={(e) => {
    const fechaSeleccionada = e.target.value;

    if (!fechaSeleccionada || fechaSeleccionada < fechaMinima || fechaSeleccionada > fechaMaxima) {
      return;
    }

    const [y, m, d] = fechaSeleccionada.split("-");
    setFecha(new Date(y, m - 1, d, 12));
  }}
/>
      <button
        type="button"
        disabled={soloLectura}
        onClick={() => {
          setSeleccionado(null);
          setDiaParo(keyDia, !esDiaParo);
        }}
        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          esDiaParo
            ? "bg-amber-600 text-white"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        Día de paro
      </button>
      </div>

      <h3>Día {fecha.getDate()}</h3>

      <section className="my-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-slate-800">Resumen del turno</h4>
          <span className="text-xs font-medium text-slate-500">
            {tipo === "enfermero" ? "Enfermeros" : "Licenciados"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Previstos", resumenTurno.conteos.previstos],
            ["Presentes", resumenTurno.conteos.presentes],
            ["Ausentes", resumenTurno.conteos.ausentes],
            ["Pendientes", resumenTurno.conteos.pendientes],
            ["Libres", resumenTurno.conteos.libres],
            ["Licencias", resumenTurno.conteos.licencias],
            ["Certificados", resumenTurno.conteos.certificaciones],
            ["Extras registrados", resumenTurno.conteos.extras],
            ["Sin cobertura", resumenTurno.conteos.sectoresSinCobertura]
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">{etiqueta}</p>
              <p className="text-xl font-bold text-slate-800">{valor}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          {resumenTurno.alertas.length === 0 ? (
            <p className="text-sm font-medium text-emerald-700">✓ Sin alertas para revisar</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAlertasAbiertas((actual) => !actual)}
                className="flex w-full items-center justify-between text-left text-sm font-semibold text-amber-800"
                aria-expanded={alertasAbiertas}
              >
                <span>⚠ {resumenTurno.alertas.length} situaciones para revisar</span>
                <span>{alertasAbiertas ? "Ocultar" : "Mostrar"}</span>
              </button>
              {alertasAbiertas && (
                <ul className="mt-2 space-y-2">
                  {resumenTurno.alertas.map((alerta) => (
                    <li
                      key={alerta.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        alerta.nivel === "critica"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : alerta.nivel === "advertencia"
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                      }`}
                    >
                      <strong>{alerta.nivel.toUpperCase()}:</strong> {alerta.mensaje}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      <div className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">
            Previstos: {resumenAsistencia.previstos} | Presentes: {resumenAsistencia.presente} | Ausentes: {resumenAsistencia.ausente} | Pendientes: {resumenAsistencia.pendiente}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={soloLectura || personasPrevistas.length === 0}
              onClick={marcarTodosPresentes}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Marcar todos presentes
            </button>
            <button
              type="button"
              disabled={soloLectura || !Object.hasOwn(asistenciaDia, keyDia)}
              onClick={limpiarAsistencia}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpiar asistencia
            </button>
          </div>
        </div>
      </div>

<div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
  {asignacionOrdenada.map((item, i) => {

    if (item.tipo === "divider") {
      return (
        <div key={i} className="h-3 bg-slate-100" />
      );
    }

    const bg =
      seleccionado?.nombre === item.nombre
        ? "bg-yellow-200"
        : item.sacrificado
        ? "bg-slate-200"
        : estaNoDisponible(item.enfermero)
        ? "bg-orange-200"
        : estaLibre(item.enfermero)
        ? "bg-red-200"
        : "bg-white";

    return (
      <div
        key={i}
        onClick={() => handleClick(item)}
        className={`flex justify-between items-center px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${bg}`}
      >
        <span className="font-medium text-slate-700">
          {item.nombre}
        </span>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm text-slate-600">
            {item.enfermero ? item.enfermero.nombre : "Sin cobertura"}
          </span>
          {item.enfermero && (
            <select
              aria-label={`Asistencia de ${item.enfermero.nombre}`}
              value={obtenerEstadoAsistencia(asistenciaFecha, item.enfermero)}
              disabled={soloLectura}
              onClick={(evento) => evento.stopPropagation()}
              onChange={(evento) => {
                evento.stopPropagation();
                cambiarAsistencia(item.enfermero, evento.target.value);
              }}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                obtenerEstadoAsistencia(asistenciaFecha, item.enfermero) === ESTADOS_ASISTENCIA.PRESENTE
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : obtenerEstadoAsistencia(asistenciaFecha, item.enfermero) === ESTADOS_ASISTENCIA.AUSENTE
                    ? "border-red-300 bg-red-50 text-red-800"
                    : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              <option value={ESTADOS_ASISTENCIA.PENDIENTE}>Pendiente</option>
              <option value={ESTADOS_ASISTENCIA.PRESENTE}>✓ Presente</option>
              <option value={ESTADOS_ASISTENCIA.AUSENTE}>✕ Ausente</option>
            </select>
          )}
        </div>
      </div>
    );
  })}
</div>

<h4 className="text-sm font-semibold text-slate-700">Libres</h4>

<div className="flex flex-wrap gap-2">
  {libres.map((e, indice) => {
    const yaEsta = extrasDia.some(
      (ex) => personasCompartenIdentidad(ex, e)
    );

    return (
      <button
        disabled={soloLectura}
        key={obtenerClaveRenderPersona(e, indice, idsPersonalDuplicados)}
        className={`px-3 py-1.5 rounded-lg text-sm text-white transition
          ${yaEsta ? "bg-green-600" : "bg-green-400 hover:bg-green-500"}`}
        onClick={() => {
          if (yaEsta) {
            borrarExtra(e);
            return;
          }

          setCalendario((prev) => ({
            ...prev,
            extras: {
              ...prev.extras,
              [keyDia]: agregarExtraALista(prev.extras?.[keyDia], e)
            }
          }));
        }}
      >
        {e.nombre}
      </button>
    );
  })}
</div>

<h4 className="text-sm font-semibold text-slate-700">Certificados</h4>

<div className="flex flex-wrap gap-2">
  {certificados.length > 0 ? certificados.map((persona, indice) => (
    <span
      key={obtenerClaveRenderPersona(persona, indice, idsPersonalDuplicados)}
      className="bg-rose-100 px-3 py-1.5 rounded-lg text-sm text-rose-800"
    >
      {obtenerEtiquetaPersona(persona, personal)}
    </span>
  )) : (
    <span className="text-sm text-slate-500">Ninguno</span>
  )}
</div>

<h4 className="text-sm font-semibold text-slate-700">
  Extras del día
</h4>

<div className="flex flex-wrap gap-2">
  {extrasDia.map((e) => (
    <div
      key={e.id}
      className="flex items-center gap-2 bg-blue-100 px-3 py-1.5 rounded-lg text-sm"
    >
      <span>{e.nombre}</span>

      {e.temporal && (
        <button
          disabled={soloLectura}
          onClick={() => borrarExtra(e)}
          className="text-red-500"
        >
          ❌
        </button>
      )}
    </div>
  ))}
</div>

<div className="flex gap-2 mb-2">
  <input
    disabled={soloLectura}
    value={nuevoNombre}
    onChange={(e) => {
      setNuevoNombre(e.target.value);
      setErrorNuevoExtra("");
    }}
    placeholder="Nombre extra"
    className="border px-2 py-1 rounded text-sm"
  />

  <button
    disabled={soloLectura}
    onClick={() => {
      if (altaExtraEnCursoRef.current) return;
      const resultado = crearExtraTemporal({
        nombre: nuevoNombre,
        categoria: tipo,
        personal,
        extrasDia
      });
      if (!resultado.extra) {
        setErrorNuevoExtra(resultado.error);
        return;
      }

      altaExtraEnCursoRef.current = true;
      setCalendario((prev) => ({
  ...prev,
  extras: {
    ...prev.extras,
    [keyDia]: agregarExtraALista(prev.extras?.[keyDia], resultado.extra)
  }
}));

      setNuevoNombre("");
      setErrorNuevoExtra("");
    }}
    className="bg-blue-500 text-white px-3 rounded"
  >
    + Agregar
  </button>
</div>

{errorNuevoExtra && (
  <p className="text-sm text-red-600">{errorNuevoExtra}</p>
)}


<h4 className="text-sm font-semibold text-slate-700">
  No disponibles
</h4>

<div className="flex flex-wrap gap-2">
  {personalFiltrado.map((e, indice) => {
    const activo = (noDisponibles[keyDia] || []).some(
      (referencia) => referenciaCorrespondeAPersona(
        referencia,
        e,
        personalFiltrado
      )
    );

    return (
      <button
        disabled={soloLectura}
        key={obtenerClaveRenderPersona(e, indice, idsPersonalDuplicados)}
        className={`px-3 py-1.5 rounded-lg text-sm transition
          ${activo
            ? "bg-red-500 text-white"
            : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
        onClick={() => {
          const lista = noDisponibles[keyDia] || [];

          const nueva = activo
            ? quitarPersonaDeListaReferencias(lista, e, personalFiltrado)
            : agregarPersonaAListaReferencias(lista, e, personalFiltrado);

          setCalendario((prev) => ({
  ...prev,
  noDisponibles: {
    ...prev.noDisponibles,
    [keyDia]: nueva
  }
}));
        }}
      >
        {obtenerEtiquetaPersona(e, personal)}
      </button>
    );
  })}
</div>
    </div>
  );
}

export default CalendarioDiario;
