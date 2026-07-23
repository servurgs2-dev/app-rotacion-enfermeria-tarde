import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { configuracionSectores } from "../../data/sectores";
import { obtenerEstrategiaRotacionPlanilla } from "../../config/turnos.js";
import {
  estaCertificado,
  estaDeLicencia,
  esDiaLibre,
  keyDiaFromDate,
  semanaKeyFromDate
} from "../../utils/fechas";
import { obtenerBloqueParaFecha } from "../../utils/periodosRotacionPlanilla.js";
import { normalizar } from "../../utils/texto";
import {
  obtenerClaveIdentidadPersona,
  personasCompartenIdentidad
} from "../../utils/identidadPersonas.js";
import {
  agregarPersonaAListaReferencias,
  crearReferenciaPersona,
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
  obtenerPersonasPrevistas
} from "../../utils/asistenciaPersonas.js";
import {
  aplicarCoberturaLibreSaludMental,
  obtenerSectorSaludMental,
  obtenerTitularSaludMental,
  puedeCubrirLibreSaludMental,
  resolverCoberturaSaludMental
} from "../../utils/coberturaSaludMental.js";
import { crearResumenTurno } from "../../utils/resumenTurno.js";
import {
  cerrarFechaCategoria,
  crearSnapshotCierreTurno,
  estaFechaCategoriaCerrada,
  obtenerResponsablesCierre,
  obtenerUltimaVersionCierre,
  reabrirFechaCategoria,
  snapshotAAsignacionesVisibles
} from "../../utils/cierreTurno.js";

const obtenerAsistenciaDeSnapshot = (snapshot, referencia) => {
  const clave = obtenerClaveIdentidadPersona({
    id: referencia?.personaId,
    nombre: referencia?.nombre
  });
  return (clave && snapshot?.asistencia?.[clave]) || ESTADOS_ASISTENCIA.PENDIENTE;
};

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
  turnoActivo = "",
  soloLectura = false,
  usuarioActual = "",
  puedeReabrirCierre = false
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
  asistenciaDia = {},
  cierresDia = {}
} = calendario || {};

const [nuevoNombre, setNuevoNombre] = useState("");
  const [errorNuevoExtra, setErrorNuevoExtra] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [alertasAbiertas, setAlertasAbiertas] = useState(true);
  const [cierreVisible, setCierreVisible] = useState(false);
  const [seleccionResponsable, setSeleccionResponsable] = useState({ contexto: "", personaId: "" });
  const [errorResponsable, setErrorResponsable] = useState({ contexto: "", mensaje: "" });
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

const keyDia = keyDiaFromDate(fecha);
const periodoPlanilla = useMemo(() => {
  const estrategia = obtenerEstrategiaRotacionPlanilla({
    turnoId: turnoActivo,
    tipo,
    mesActivo
  });

  if (estrategia.tipo === "cada_3_dias") {
    const bloque = obtenerBloqueParaFecha({
      fecha: keyDia,
      fechaBase: estrategia.fechaBase,
      duracionDias: estrategia.duracionDias
    });
    const clavePeriodo = bloque?.clave || null;

    return {
      tipoPeriodo: "cada_3_dias",
      clavePeriodo,
      planillaPeriodo: clavePeriodo
        ? planilla?.rotacion3Dias?.bloques?.[clavePeriodo] || {}
        : {},
      coberturasSaludMental: planilla?.rotacion3Dias?.coberturaLibreSM || {}
    };
  }

  const clavePeriodo = semanaKeyFromDate(fecha, mesActivo);
  return {
    tipoPeriodo: "semanal",
    clavePeriodo,
    planillaPeriodo: clavePeriodo ? planilla?.[clavePeriodo] || {} : {},
    coberturasSaludMental: planilla?.coberturaLibreSM || {}
  };
}, [fecha, keyDia, mesActivo, planilla, tipo, turnoActivo]);
const {
  clavePeriodo,
  planillaPeriodo,
  coberturasSaludMental
} = periodoPlanilla;
const bloqueadoPorCierre = estaFechaCategoriaCerrada(cierresDia, keyDia);
const soloLecturaEfectiva = soloLectura || bloqueadoPorCierre;
const versionCierre = obtenerUltimaVersionCierre(cierresDia, keyDia);
const snapshotCierre = versionCierre?.snapshot || null;
const contextoResponsable = `${turnoActivo}|${keyDia}|${tipo}`;
const responsableSeleccionadoId = seleccionResponsable.contexto === contextoResponsable
  ? seleccionResponsable.personaId
  : "";
const mensajeErrorResponsable = errorResponsable.contexto === contextoResponsable
  ? errorResponsable.mensaje
  : "";
const licenciadosResponsables = obtenerResponsablesCierre(personal);
const asistenciaFecha = asistenciaDia[keyDia] || {};
const cambiosActivos = esDiaParo ? cambiosParoDia : cambiosDia;
const claveCambiosActivos = esDiaParo ? "cambiosParoDia" : "cambiosDia";
const fechaMinima = `${mesActivo}-01`;
const [yearMesActivo, monthMesActivo] = mesActivo.split("-").map(Number);
const ultimoDiaDelMes = new Date(yearMesActivo, monthMesActivo, 0).getDate();
const fechaMaxima = `${mesActivo}-${String(ultimoDiaDelMes).padStart(2, "0")}`;
const extrasDia = Array.isArray(extras[keyDia]) ? extras[keyDia].filter(Boolean) : [];

useEffect(() => {
  altaExtraEnCursoRef.current = false;
}, [extras, keyDia]);

const esLibreReal = useCallback(
  (e) => esDiaLibre(e, fecha, false),
  [fecha]
);

const libres = useMemo(
  () => personalFiltrado.filter(esLibreReal),
  [esLibreReal, personalFiltrado]
);

const estaLibre = (e) => {
    const esExtraHoy = extrasDia.some((ex) => personasCompartenIdentidad(ex, e));
    return esDiaLibre(e, fecha, esExtraHoy);
  };

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

  const estaNoDisponible = (e) => e && (noDisponibles[keyDia] || []).some(
      (referencia) => referenciaCorrespondeAPersona(
        referencia,
        e,
        personalFiltrado
      )
    );

const estaAusente = (e) =>
    e &&
    (
      (esLibreReal(e) && !extrasDia.some((ex) => personasCompartenIdentidad(ex, e))) ||
      estaNoDisponible(e) ||
      estaDeLicenciaHoy(e) ||
      estaCertificadoHoy(e)
    );

const borrarExtra = (extra) => {
  if (soloLecturaEfectiva) return;
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

const asignacionOrdenada = (() => {
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
      planillaPeriodo[fila],
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
  planillaSemana: planillaPeriodo,
  personal: personalFiltrado,
  tipo
});
const coberturaSaludMental = resolverCoberturaSaludMental({
  coberturas: coberturasSaludMental,
  clave: clavePeriodo,
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
})();

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

  const personasPrevistas = obtenerPersonasPrevistas(asignacionOrdenada);
  const datosResumenTurno = (() => {
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

    return {
      libres,
      licencias: personasConLicencia,
      certificaciones: certificados,
      noDisponibles: personasNoDisponibles,
      extras: extrasDia,
      sectoresReales,
      sectoresCriticos: criticosPanel,
      sectoresSaludMental
    };
  })();
  const resumenTurno = crearResumenTurno({
    asignaciones: asignacionOrdenada,
    asistencia: asistenciaFecha,
    ...datosResumenTurno
  });
  const asignacionesMostradas = bloqueadoPorCierre && snapshotCierre
    ? snapshotAAsignacionesVisibles(snapshotCierre)
    : asignacionOrdenada;
  const resumenMostrado = bloqueadoPorCierre && snapshotCierre
    ? snapshotCierre.resumen
    : resumenTurno;
  const asistenciaMostrada = bloqueadoPorCierre && snapshotCierre
    ? snapshotCierre.asistencia
    : asistenciaFecha;

  const cerrarTurno = () => {
    if (soloLecturaEfectiva || !usuarioActual) return;
    const responsable = licenciadosResponsables.find(
      (persona) => String(persona.id) === responsableSeleccionadoId
    );
    const responsableCierre = crearReferenciaPersona(responsable);
    if (!responsableCierre) {
      setErrorResponsable({
        contexto: contextoResponsable,
        mensaje: "Seleccioná el licenciado responsable antes de cerrar."
      });
      return;
    }
    const criticas = resumenTurno.alertas.filter((alerta) => alerta.nivel === "critica").length;
    const mensaje = [
      `Previstos: ${resumenTurno.conteos.previstos}`,
      `Presentes: ${resumenTurno.conteos.presentes}`,
      `Ausentes: ${resumenTurno.conteos.ausentes}`,
      `Pendientes: ${resumenTurno.conteos.pendientes}`,
      `Sectores sin cobertura: ${resumenTurno.conteos.sectoresSinCobertura}`,
      `Alertas críticas: ${criticas}`,
      "",
      resumenTurno.conteos.pendientes > 0 || criticas > 0
        ? "Hay situaciones pendientes. ¿Cerrar igualmente?"
        : "¿Confirmar el cierre?"
    ].join("\n");
    if (!confirm(mensaje)) return;

    const snapshot = crearSnapshotCierreTurno({
      fecha: keyDia,
      tipo,
      resumen: resumenTurno,
      asignaciones: asignacionOrdenada,
      asistencia: asistenciaFecha,
      libres: datosResumenTurno.libres,
      licencias: datosResumenTurno.licencias,
      certificaciones: datosResumenTurno.certificaciones,
      noDisponibles: datosResumenTurno.noDisponibles,
      extrasRegistrados: datosResumenTurno.extras,
      sectoresReales: datosResumenTurno.sectoresReales
    });
    setCalendario((prev) => ({
      ...prev,
      cierresDia: cerrarFechaCategoria({
        cierresDia: prev.cierresDia,
        fecha: keyDia,
        usuario: usuarioActual,
        responsableCierre,
        snapshot
      })
    }));
    setSeleccionResponsable({ contexto: "", personaId: "" });
    setErrorResponsable({ contexto: "", mensaje: "" });
    setCierreVisible(true);
  };

  const reabrirTurno = () => {
    if (!puedeReabrirCierre || !bloqueadoPorCierre) return;
    if (!confirm("¿Reabrir esta fecha y categoría? La fotografía anterior se conservará.")) return;
    setCalendario((prev) => ({
      ...prev,
      cierresDia: reabrirFechaCategoria({
        cierresDia: prev.cierresDia,
        fecha: keyDia,
        usuario: usuarioActual
      })
    }));
    setSeleccionResponsable({ contexto: "", personaId: "" });
    setErrorResponsable({ contexto: "", mensaje: "" });
    setCierreVisible(false);
  };

  const cambiarAsistencia = (persona, estado) => {
    if (soloLecturaEfectiva) return;
    setCalendario((prev) => ({
      ...prev,
      asistenciaDia: actualizarAsistenciaPersona(prev.asistenciaDia, keyDia, persona, estado)
    }));
  };

  const marcarTodosPresentes = () => {
    if (soloLecturaEfectiva || personasPrevistas.length === 0) return;
    setCalendario((prev) => ({
      ...prev,
      asistenciaDia: marcarPersonasPresentes(prev.asistenciaDia, keyDia, personasPrevistas)
    }));
  };

  const limpiarAsistencia = () => {
    if (soloLecturaEfectiva || !Object.hasOwn(asistenciaDia, keyDia)) return;
    if (!confirm("¿Limpiar la asistencia de esta fecha y categoría?")) return;
    setCalendario((prev) => ({
      ...prev,
      asistenciaDia: limpiarAsistenciaFecha(prev.asistenciaDia, keyDia)
    }));
  };

  const handleClick = (item) => {
    if (soloLecturaEfectiva) return;
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
        disabled={soloLecturaEfectiva}
        onClick={() => {
          if (soloLecturaEfectiva) return;
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

<div className="rounded-2xl border border-slate-100 bg-white">
  {asignacionesMostradas.map((item, i) => {

    if (item.tipo === "divider") {
      return (
        <div key={i} className="h-3 bg-slate-100" />
      );
    }

    const bg = bloqueadoPorCierre
      ? item.sacrificado
        ? "bg-slate-200"
        : "bg-white"
      : seleccionado?.nombre === item.nombre
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
              value={obtenerEstadoAsistencia(asistenciaMostrada, item.enfermero)}
              disabled={soloLecturaEfectiva}
              onClick={(evento) => evento.stopPropagation()}
              onChange={(evento) => {
                evento.stopPropagation();
                cambiarAsistencia(item.enfermero, evento.target.value);
              }}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                obtenerEstadoAsistencia(asistenciaMostrada, item.enfermero) === ESTADOS_ASISTENCIA.PRESENTE
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : obtenerEstadoAsistencia(asistenciaMostrada, item.enfermero) === ESTADOS_ASISTENCIA.AUSENTE
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
        disabled={soloLecturaEfectiva}
        key={obtenerClaveRenderPersona(e, indice, idsPersonalDuplicados)}
        className={`px-3 py-1.5 rounded-lg text-sm text-white transition
          ${yaEsta ? "bg-green-600" : "bg-green-400 hover:bg-green-500"}`}
        onClick={() => {
          if (soloLecturaEfectiva) return;
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
          disabled={soloLecturaEfectiva}
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
    disabled={soloLecturaEfectiva}
    value={nuevoNombre}
    onChange={(e) => {
      setNuevoNombre(e.target.value);
      setErrorNuevoExtra("");
    }}
    placeholder="Nombre extra"
    className="border px-2 py-1 rounded text-sm"
  />

  <button
    disabled={soloLecturaEfectiva}
    onClick={() => {
      if (soloLecturaEfectiva) return;
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
        disabled={soloLecturaEfectiva}
        key={obtenerClaveRenderPersona(e, indice, idsPersonalDuplicados)}
        className={`px-3 py-1.5 rounded-lg text-sm transition
          ${activo
            ? "bg-red-500 text-white"
            : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
        onClick={() => {
          if (soloLecturaEfectiva) return;
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
      <div className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">
            Previstos: {resumenMostrado.conteos.previstos} | Presentes: {resumenMostrado.conteos.presentes} | Ausentes: {resumenMostrado.conteos.ausentes} | Pendientes: {resumenMostrado.conteos.pendientes}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={soloLecturaEfectiva || personasPrevistas.length === 0}
              onClick={marcarTodosPresentes}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Marcar todos presentes
            </button>
            <button
              type="button"
              disabled={soloLecturaEfectiva || !Object.hasOwn(asistenciaDia, keyDia)}
              onClick={limpiarAsistencia}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpiar asistencia
            </button>
          </div>
        </div>
      </div>

      <section className="my-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-slate-800">Resumen del turno</h4>
          <span className="text-xs font-medium text-slate-500">
            {tipo === "enfermero" ? "Enfermeros" : "Licenciados"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Previstos", resumenMostrado.conteos.previstos],
            ["Presentes", resumenMostrado.conteos.presentes],
            ["Ausentes", resumenMostrado.conteos.ausentes],
            ["Pendientes", resumenMostrado.conteos.pendientes],
            ["Libres", resumenMostrado.conteos.libres],
            ["Licencias", resumenMostrado.conteos.licencias],
            ["Certificados", resumenMostrado.conteos.certificaciones],
            ["Extras registrados", resumenMostrado.conteos.extras],
            ["Sin cobertura", resumenMostrado.conteos.sectoresSinCobertura]
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">{etiqueta}</p>
              <p className="text-xl font-bold text-slate-800">{valor}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          {resumenMostrado.alertas.length === 0 ? (
            <p className="text-sm font-medium text-emerald-700">✓ Sin alertas para revisar</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAlertasAbiertas((actual) => !actual)}
                className="flex w-full items-center justify-between text-left text-sm font-semibold text-amber-800"
                aria-expanded={alertasAbiertas}
              >
                <span>⚠ {resumenMostrado.alertas.length} situaciones para revisar</span>
                <span>{alertasAbiertas ? "Ocultar" : "Mostrar"}</span>
              </button>
              {alertasAbiertas && (
                <ul className="mt-2 space-y-2">
                  {resumenMostrado.alertas.map((alerta) => (
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

      <section className={`my-4 rounded-2xl border p-4 ${
        bloqueadoPorCierre
          ? "border-emerald-200 bg-emerald-50"
          : cierresDia?.[keyDia]?.estado === "reabierto"
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-white"
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-800">
              {bloqueadoPorCierre
                ? `✓ Turno cerrado — ${tipo === "enfermero" ? "Enfermeros" : "Licenciados"}`
                : cierresDia?.[keyDia]?.estado === "reabierto"
                  ? `Turno reabierto — ${tipo === "enfermero" ? "Enfermeros" : "Licenciados"}`
                  : `Turno abierto — ${tipo === "enfermero" ? "Enfermeros" : "Licenciados"}`}
            </p>
            {versionCierre && (
              <p className="mt-1 text-xs text-slate-600">
                Cerrado por {versionCierre.cerradoPor}{versionCierre.responsableCierre?.nombre ? `, ${versionCierre.responsableCierre.nombre}` : ""} · {new Date(versionCierre.cerradoEn).toLocaleString("es-UY")} · Revisión {versionCierre.revision}
              </p>
            )}
          </div>
          {!bloqueadoPorCierre && !soloLectura && (
            <div className="min-w-64">
              <label htmlFor={`responsable-cierre-${tipo}`} className="mb-1 block text-xs font-semibold text-slate-600">
                Responsable del cierre
              </label>
              <select
                id={`responsable-cierre-${tipo}`}
                value={responsableSeleccionadoId}
                onChange={(evento) => {
                  setSeleccionResponsable({ contexto: contextoResponsable, personaId: evento.target.value });
                  setErrorResponsable({ contexto: "", mensaje: "" });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="">Seleccionar responsable</option>
                {licenciadosResponsables.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {obtenerEtiquetaPersona(persona, personal)}
                  </option>
                ))}
              </select>
              {mensajeErrorResponsable && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{mensajeErrorResponsable}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {versionCierre && (
              <button type="button" onClick={() => setCierreVisible((actual) => !actual)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                {cierreVisible ? "Ocultar cierre" : "Ver cierre"}
              </button>
            )}
            {!bloqueadoPorCierre && !soloLectura && (
              <button type="button" onClick={cerrarTurno} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white">
                Cerrar turno — {tipo === "enfermero" ? "Enfermeros" : "Licenciados"}
              </button>
            )}
            {bloqueadoPorCierre && puedeReabrirCierre && (
              <button type="button" onClick={reabrirTurno} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white">
                Reabrir
              </button>
            )}
          </div>
        </div>
        {cierreVisible && versionCierre?.snapshot && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-700">Fotografía histórica · {versionCierre.snapshot.fecha}</p>
            <p className="mt-1 text-sm text-slate-600">Cuenta de cierre: {versionCierre.cerradoPor}</p>
            <p className="text-sm text-slate-600">Responsable: {versionCierre.responsableCierre?.nombre || "No registrado"}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Distribución</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {versionCierre.snapshot.asignaciones.map((item, indice) => (
                    <li key={`${item.sector}-${indice}`}><strong>{item.sector}:</strong> {item.persona?.nombre || "Sin cobertura"}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Asistencia</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {versionCierre.snapshot.personasPrevistas.map((persona) => (
                    <li key={persona.personaId}><strong>{persona.nombre}:</strong> {obtenerAsistenciaDeSnapshot(versionCierre.snapshot, persona)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}

export default CalendarioDiario;
