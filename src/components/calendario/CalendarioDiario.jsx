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
import { crearIdPersonaNueva } from "../../utils/identidadPersonas.js";
import {
  agregarPersonaAListaReferencias,
  quitarPersonaDeListaReferencias,
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "../../utils/referenciasPersonas.js";
import { aplicarMovimientosCalendario } from "../../utils/cambiosCalendario.js";
import {
  agregarExtraALista,
  eliminarExtraDelDia,
  personasCompartenId
} from "../../utils/extrasPersonas.js";

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
  setFecha
}) {
  const personalFiltrado = useMemo(
    () => personal.filter((p) => p?.categoria === tipo),
    [personal, tipo]
  );

const {
  cambiosDia = {},
  cambiosParoDia = {},
  noDisponibles = {},
  extras = {}
} = calendario || {};

const [nuevoNombre, setNuevoNombre] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const prevDataRef = useRef(null);

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
    const esExtraHoy = extrasDia.some((ex) => personasCompartenId(ex, e));
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
      .map((persona) => [normalizar(persona.nombre), persona])
  ).values()],
  [estaCertificadoHoy, personalFiltrado]
);

  const estaNoDisponible = useCallback(
    (e) => e && (noDisponibles[keyDia] || []).some(
      (referencia) => referenciaCorrespondeAPersona(referencia, e)
    ),
    [keyDia, noDisponibles]
  );

const estaAusente = useCallback(
  (e) =>
    e &&
    (
      (esLibreReal(e) && !extrasDia.some((ex) => personasCompartenId(ex, e))) ||
      estaNoDisponible(e) ||
      estaDeLicenciaHoy(e) ||
      estaCertificadoHoy(e)
    ),
  [esLibreReal, estaCertificadoHoy, estaDeLicenciaHoy, estaNoDisponible, extrasDia]
);

const borrarExtra = (extra) => {
  setCalendario((prev) => eliminarExtraDelDia({
    calendarioCategoria: prev,
    fecha: keyDia,
    extra,
    personal: personalFiltrado
  }));

  if (personasCompartenId(seleccionado?.enfermero, extra)) {
    setSeleccionado(null);
  }
};

const asignacionOrdenada = useMemo(() => {
const asignacionCompleta = filas.map((fila) => {
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
      [...personalFiltrado, ...extrasDia]
    );
  }

  return {
    nombre: fila,
    enfermero: enfermero || null,
    tipo: turnantesLabels.includes(fila) ? "turnante" : "sector"
  };
});

  let turnantesDisponibles = asignacionCompleta
    .filter((f) => f.tipo === "turnante")
    .map((f) => f.enfermero)
    .filter((e) => e && !estaAusente(e));

  let turnoIndex = 0;
const usadosSet = new Set();
const usarEnfermero = (e) => {
  if (!e) return null;

  const nombreNormalizado = normalizar(e.nombre);

  if (usadosSet.has(nombreNormalizado)) return null;

  usadosSet.add(nombreNormalizado);
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
  .map((a) => a.enfermero?.nombre)
  .filter(Boolean);

const nombresSobrantes = new Set(usados.map(normalizar));
const sobrantes = [...personalFiltrado, ...extrasDia].filter((e) => {
  if (!e || estaAusente(e)) return false;

  const nombreNormalizado = normalizar(e.nombre);

  if (nombresSobrantes.has(nombreNormalizado)) return false;

  nombresSobrantes.add(nombreNormalizado);
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
      (item) => item.enfermero?.id === personaSolicitada?.id
    )?.enfermero;
    const nombreNormalizado = enfermero && normalizar(enfermero.nombre);

    if (!enfermero || personasSolicitadas.has(nombreNormalizado)) return;

    const fuente = asignacionParaMostrar.find(
      (item) => normalizar(item.enfermero?.nombre) === nombreNormalizado
    );

    if (!fuente) return;

    personasSolicitadas.add(nombreNormalizado);
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
      enfermero && !personasSolicitadas.has(normalizar(enfermero.nombre))
    );
  const nombresYaAsignados = new Set(
    asignacionParaMostrar
      .map((item) => item.enfermero?.nombre)
      .filter(Boolean)
      .map(normalizar)
  );

  operaciones.forEach(({ fuente }) => {
    if (destinosConCambio.has(normalizar(fuente.nombre)) || fuente.enfermero) return;

    const indiceReubicacion = personasParaReubicar.findIndex(
      (enfermero) => !nombresYaAsignados.has(normalizar(enfermero.nombre))
    );
    const enfermero = personasParaReubicar[indiceReubicacion];

    if (enfermero) {
      fuente.enfermero = enfermero;
      nombresYaAsignados.add(normalizar(enfermero.nombre));
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

    const nombreNormalizado = normalizar(enfermero.nombre);
    if (!nombreNormalizado || candidatosSet.has(nombreNormalizado)) return;

    candidatosSet.add(nombreNormalizado);
    candidatos.push(enfermero);
  };

  asignacionFinal.forEach((item) => agregarCandidato(item.enfermero));
  extrasDia.forEach(agregarCandidato);

  const usadosParo = new Set();
  const tomarCandidato = (enfermero) => {
    if (!enfermero) return null;

    const nombreNormalizado = normalizar(enfermero.nombre);
    if (usadosParo.has(nombreNormalizado)) return null;

    usadosParo.add(nombreNormalizado);
    return enfermero;
  };
  const resolverCambioParo = (referencia) =>
    resolverPersonaDesdeReferencia(referencia, candidatos);
  const tomarSobrante = (sectorActual) => {
    const sectorNormalizado = normalizar(sectorActual);

    for (const candidato of candidatos) {
      const sectorReservado = reservasParo.get(normalizar(candidato.nombre));
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
    const nombreNormalizado = enfermero && normalizar(enfermero.nombre);

    if (nombreNormalizado && !reservasParo.has(nombreNormalizado)) {
      reservasParo.set(nombreNormalizado, normalizar(sector));
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
          reservasParo.get(normalizar(candidatoPrioritario.nombre));

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
  cambiosDia,
  cambiosParoDia,
  esDiaParo,
  estaAusente,
  extrasDia,
  filas,
  keyDia,
  ordenVisual,
  personalFiltrado,
  planillaSemana,
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

  const handleClick = (item) => {
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

        <span className="text-sm text-slate-600">
          {item.enfermero ? item.enfermero.nombre : "Sin cobertura"}
        </span>
      </div>
    );
  })}
</div>

<h4 className="text-sm font-semibold text-slate-700">Libres</h4>

<div className="flex flex-wrap gap-2">
  {libres.map((e) => {
    const yaEsta = extrasDia.some(
      (ex) => personasCompartenId(ex, e)
    );

    return (
      <button
        key={e.id}
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
  {certificados.length > 0 ? certificados.map((persona) => (
    <span
      key={persona.nombre}
      className="bg-rose-100 px-3 py-1.5 rounded-lg text-sm text-rose-800"
    >
      {persona.nombre}
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
    value={nuevoNombre}
    onChange={(e) => setNuevoNombre(e.target.value)}
    placeholder="Nombre extra"
    className="border px-2 py-1 rounded text-sm"
  />

  <button
    onClick={() => {
      if (!nuevoNombre.trim()) return;

      const lista = extrasDia;

      const nuevoExtra = {
        id: crearIdPersonaNueva({ nombre: nuevoNombre, funcionario: "" }),
        nombre: nuevoNombre,
        categoria: tipo,
        libre: null,
        temporal: true
      };

      setCalendario((prev) => ({
  ...prev,
  extras: {
    ...prev.extras,
    [keyDia]: agregarExtraALista(lista, nuevoExtra)
  }
}));

      setNuevoNombre("");
    }}
    className="bg-blue-500 text-white px-3 rounded"
  >
    + Agregar
  </button>
</div>


<h4 className="text-sm font-semibold text-slate-700">
  No disponibles
</h4>

<div className="flex flex-wrap gap-2">
  {personalFiltrado.map((e) => {
    const activo = (noDisponibles[keyDia] || []).some(
      (referencia) => referenciaCorrespondeAPersona(referencia, e)
    );

    return (
      <button
        key={e.nombre}
        className={`px-3 py-1.5 rounded-lg text-sm transition
          ${activo
            ? "bg-red-500 text-white"
            : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
        onClick={() => {
          const lista = noDisponibles[keyDia] || [];

          const nueva = activo
            ? quitarPersonaDeListaReferencias(lista, e, personal)
            : agregarPersonaAListaReferencias(lista, e, personal);

          setCalendario((prev) => ({
  ...prev,
  noDisponibles: {
    ...prev.noDisponibles,
    [keyDia]: nueva
  }
}));
        }}
      >
        {e.nombre}
      </button>
    );
  })}
</div>
    </div>
  );
}

export default CalendarioDiario;
