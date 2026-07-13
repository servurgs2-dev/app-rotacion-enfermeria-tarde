import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { configuracionSectores } from "../../data/sectores";

const normalizar = (str) =>
  str
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

function CalendarioDiario({
  personal,
  planilla,
  tipo,
  mesActivo,
  licencias,
  calendario,
  setCalendario,
  onDataReady,
  fecha,
  setFecha
}) {
 //console.log(JSON.stringify(personal, null, 2));
 //console.log("🔥 MOUNT CalendarioDiario PROPS:", {
  //tipo,
  //mesActivo,
  //planillaKeys: planilla && Object.keys(planilla),
//});
console.log("🧠 TIPO:", tipo);
 //console.log("🧩 RENDER CalendarioDiario tipo:", tipo);
  const personalFiltrado = useMemo(
    () => personal.filter((p) => p.categoria === tipo),
    [personal, tipo]
  );


  





const {
  cambiosDia = {},
  noDisponibles = {},
  extras = {}
} = calendario || {};

//console.log("🧠 cambiosDia actual:", cambiosDia);
//const [nuevoExtra, setNuevoExtra] = useState("");
const [nuevoNombre, setNuevoNombre] = useState("");

  const [seleccionado, setSeleccionado] = useState(null);

  const prevDataRef = useRef(null);

  const {
    sectoresFijos,
    sectoresCriticos,
    sectoresBajaPrioridad,
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

console.log("FILAS:", filas);


const obtenerSemanasDelMes = (mesActivo) => {
  const [year, month] = mesActivo.split("-").map(Number);

  const primerDia = new Date(year, month - 1, 1);

  const inicio = new Date(primerDia);
  const dia = inicio.getDay();
  inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1));

  const semanas = [];

  for (let i = 0; i < 5; i++) {
    const desde = new Date(inicio);
    desde.setDate(inicio.getDate() + i * 7);

    semanas.push(desde);
  }

  return semanas;
};
const semanas = obtenerSemanasDelMes(mesActivo);

semanas.forEach((inicio, i) => {
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);

  console.log(
    `Semana ${i + 1}:`,
    inicio,
    "->",
    fin
  );
});

console.log("Fecha seleccionada:", fecha);

const semanaIndex = semanas.findIndex((inicioSemana) => {
  const fin = new Date(inicioSemana);
  fin.setDate(fin.getDate() + 6);

  return fecha >= inicioSemana && fecha <= fin;
});

const semanaKey =
  semanaIndex === -1 ? "semana1" : `semana${semanaIndex + 1}`;

//console.log("📦 PLANILLA SEMANA:", planilla?.[semanaKey]);
const keyDia = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,"0")}-${String(fecha.getDate()).padStart(2,"0")}`;

const esLibreReal = useCallback((e) => {
  if (!e || e.libre == null) return false;

  const dia = fecha.getDate();

  return ((dia - e.libre) % 5 + 5) % 5 === 0;
}, [fecha]);
const estaDeLicencia = useCallback((e) => {
  if (!e) return false;

  return (licencias || []).some(l => {
    if (l.nombre !== e.nombre) return false;

    const [yd, md, dd] = l.desde.split("-");
    const [yh, mh, dh] = l.hasta.split("-");

    const desde = new Date(yd, md - 1, dd, 12);
    const hasta = new Date(yh, mh - 1, dh, 12);

    return fecha >= desde && fecha <= hasta;
  });
}, [fecha, licencias]);
const estaLibre = useCallback((e) => {
  if (!e || e.libre == null) return false;

  const esExtraHoy = (extras[keyDia] || []).some(
    ex => ex.nombre === e.nombre
  );

  if (esExtraHoy) return false;

  const dia = fecha.getDate();

  return ((dia - e.libre) % 5 + 5) % 5 === 0;
}, [extras, fecha, keyDia]);

  const estaNoDisponible = useCallback(
    (e) => e && (noDisponibles[keyDia] || []).includes(e.nombre),
    [keyDia, noDisponibles]
  );

 const extrasDia = useMemo(() => extras[keyDia] || [], [extras, keyDia]);
const estaAusente = useCallback((e) =>
  e &&
  (
    (esLibreReal(e) && !extrasDia.some(ex => ex.nombre === e.nombre)) ||
    estaNoDisponible(e) ||
    estaDeLicencia(e)
  ), [esLibreReal, estaDeLicencia, estaNoDisponible, extrasDia]);
const borrarExtra = (nombre) => {
  const lista = extras[keyDia] || [];

  // 1. saco el extra de la lista
  const nuevaLista = lista.filter(e => e.nombre !== nombre);

  // 2. limpio overrides donde aparezca
  const cambios = { ...(cambiosDia[keyDia] || {}) };

  Object.keys(cambios).forEach(sector => {
    if (cambios[sector] === nombre) {
      delete cambios[sector];
    }
  });

  setCalendario({
    extras: {
      ...extras,
      [keyDia]: nuevaLista
    },
    cambiosDia: {
      ...cambiosDia,
      [keyDia]: cambios
    }
  });
};
 
/*console.log("📦 PLANILLA:", planilla);
console.log("📅 mesActivo:", mesActivo);
console.log("🧠 semanaKey:", semanaKey);
console.log("📊 data semana:", planilla?.[semanaKey]);*/


const asignacionOrdenada = useMemo(() => {
const asignacionCompleta = filas.map((fila) => {
  // 🔥 primero veo si hay override
  const override = cambiosDia[keyDia]?.[normalizar(fila)];

  let nombre;

  if (override === "__EMPTY__") {
    nombre = null;
  } else if (override) {
    nombre = override;
  } else {
    nombre = planilla?.[semanaKey]?.[fila];
  }


/*console.log("🧪 FILA:", fila);
  console.log("🧪 semanaKey:", semanaKey);
  console.log("🧪 planilla semana:", planilla?.[semanaKey]);
  console.log("🧪 valor planilla:", planilla?.[semanaKey]?.[fila]);*/


  const enfermero = [...personal, ...extrasDia].find(
    e => normalizar(e.nombre) === normalizar(nombre)
  );

  return {
    nombre: fila,
    enfermero: enfermero || null,
    tipo: turnantesLabels.includes(fila) ? "turnante" : "sector"
  };
});

console.log(
  "🧠 ASIGNACION COMPLETA:",
  asignacionCompleta.map(a => ({
    sector: a.sector,
    nombre: a.nombre
  }))
);
  let turnantesDisponibles = asignacionCompleta
    .filter(f => f.tipo === "turnante")
    .map(f => f.enfermero)
    .filter(e => e && !estaAusente(e));

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
    .filter(f => f.tipo === "sector")
    .map(item => {
      if (!item.enfermero) return { ...item, enfermero: null };

      if (estaAusente(item.enfermero)) {
        const eFinal = tomarTurnanteDisponible();
return { ...item, enfermero: eFinal, reemplazo: true };
      }

    const eFinal = usarEnfermero(item.enfermero);
return { ...item, enfermero: eFinal, reemplazo: false };
    });

  // extras
  let extraIndex = 0;
const tomarExtraDisponible = () => {
  const extrasDisponibles = extrasDia.filter(e => !estaAusente(e));

  while (extraIndex < extrasDisponibles.length) {
    const extra = usarEnfermero(extrasDisponibles[extraIndex++]);

    if (extra) return extra;
  }

  return null;
};
// ✅ extras SIN repetir
asignacionBase.forEach(item => {
  if (!item.enfermero) {
    item.enfermero = tomarExtraDisponible();
  }
});

// turnantes
asignacionBase.forEach(item => {
  if (!item.enfermero) {
    const eFinal = tomarTurnanteDisponible();
    if (eFinal) item.enfermero = eFinal;
  }
});

  // 🔥 sacrificio REAL
  sectoresCriticos.forEach(critico => {
    const c = asignacionBase.find(a => a.nombre === critico);

    if (c && !c.enfermero) {
      for (let s of sectoresBajaPrioridad) {
        const d = asignacionBase.find(a => a.nombre === s);

  if (d?.enfermero && !estaAusente(d.enfermero)) {
  c.enfermero = d.enfermero;
  d.enfermero = null;
  d.sacrificado = true;
  break;
}
      }
    }
  });

  // overrides
  const asignacionFinal = asignacionBase;

// 🔥 calcular sobrantes
const hayHuecosFinal = asignacionFinal.some(a => !a.enfermero);

const usados = asignacionFinal
  .map(a => a.enfermero?.nombre)
  .filter(Boolean);

const nombresSobrantes = new Set(usados.map(normalizar));
const sobrantes = [...personalFiltrado, ...extrasDia].filter(e => {
  if (!e || estaAusente(e)) return false;

  const nombreNormalizado = normalizar(e.nombre);

  if (nombresSobrantes.has(nombreNormalizado)) return false;

  nombresSobrantes.add(nombreNormalizado);
  return true;
});

// 🔥 SILLONES 3 + SIN ASIGNAR
if (!hayHuecosFinal && sobrantes.length > 0) {
  asignacionFinal.push({
    nombre: "SILLONES 3",
    enfermero: sobrantes[0]
  });

  sobrantes.slice(1).forEach(e => {
    asignacionFinal.push({
      nombre: "SIN ASIGNAR",
      enfermero: e
    });
  });
}

const resultadoOrdenado = [];

ordenVisual.forEach(item => {
  if (item === "DIVIDER") {
    resultadoOrdenado.push({ tipo: "divider" });
  } else {
    const encontrados = asignacionFinal.filter(
      a => normalizar(a.nombre) === normalizar(item)
    );

    if (encontrados.length === 0) {
      // 👇 ESTE ES EL FIX CLAVE
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
  estaAusente,
  extrasDia,
  filas,
  keyDia,
  ordenVisual,
  personal,
  personalFiltrado,
  planilla,
  sectoresBajaPrioridad,
  sectoresCriticos,
  semanaKey,
  turnantesLabels
]);

useEffect(() => {
  const dataString = JSON.stringify(asignacionOrdenada);

  if (prevDataRef.current !== dataString) {
    prevDataRef.current = dataString;

    if (onDataReady) {
      onDataReady(asignacionOrdenada);
    }
  }
}, [asignacionOrdenada, onDataReady]);

  const handleClick = (item) => {
    console.log("CLICK en:", item.nombre, item.enfermero?.nombre);
    if (!item.enfermero) {
      if (seleccionado) {
        const nuevo = { ...(cambiosDia[keyDia] || {}) };

        nuevo[normalizar(item.nombre)] = seleccionado.enfermero.nombre;
nuevo[normalizar(seleccionado.nombre)] = "__EMPTY__";

      setCalendario({
  cambiosDia: {
    ...cambiosDia,
    [keyDia]: nuevo
  }
});

        setSeleccionado(null);
      }
      return;
    }

    if (estaAusente(item.enfermero)) return;

    if (!seleccionado) {
      setSeleccionado(item);
      return;
    }

    const nuevo = { ...(cambiosDia[keyDia] || {}) };

    nuevo[normalizar(item.nombre)] = seleccionado.enfermero.nombre;
nuevo[normalizar(seleccionado.nombre)] = item.enfermero.nombre;

    setCalendario({
  cambiosDia: {
    ...cambiosDia,
    [keyDia]: nuevo
  }
});

    setSeleccionado(null);
  };



//return principa

  return (
    <div className="min-h-fit">
      <h2 className="text-xl font-semibold text-slate-800">
  Distribución diaria
</h2>

      <input
  type="date"
  value={`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`}
  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
  onChange={(e) => {
    const [y, m, d] = e.target.value.split("-");
    setFecha(new Date(y, m - 1, d, 12));
  }}
/>

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
        onClick={() => {
    console.log("CLICK RAW");
    handleClick(item);
  }}
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
  {personalFiltrado.filter(esLibreReal).map(e => {
    const yaEsta = (extras[keyDia] || []).some(
      ex => ex.nombre === e.nombre
    );

    return (
      <button
        key={e.nombre}
        className={`px-3 py-1.5 rounded-lg text-sm text-white transition
          ${yaEsta ? "bg-green-600" : "bg-green-400 hover:bg-green-500"}`}
        onClick={() => {
          const lista = extras[keyDia] || [];

          const nueva = yaEsta
  ? lista.filter(ex => ex.nombre !== e.nombre)
  : [...lista, { ...e }];

          setCalendario(prev => ({
  ...prev,
  extras: {
    ...prev.extras,
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

<h4 className="text-sm font-semibold text-slate-700">
  Extras del día
</h4>

<div className="flex flex-wrap gap-2">
  {(extras[keyDia] || []).map(e => (
    <div
      key={e.nombre}
      className="flex items-center gap-2 bg-blue-100 px-3 py-1.5 rounded-lg text-sm"
    >
      <span>{e.nombre}</span>

      {e.temporal && (
        <button
          onClick={() => borrarExtra(e.nombre)}
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

      const lista = extras[keyDia] || [];

      const nuevoExtra = {
        nombre: nuevoNombre,
        categoria: tipo,
        libre: null,
        temporal: true
      };

      setCalendario(prev => ({
  ...prev,
  extras: {
    ...prev.extras,
    [keyDia]: [...lista, nuevoExtra]
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
  {personalFiltrado.map(e => {
    const activo = (noDisponibles[keyDia] || []).includes(e.nombre);

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
            ? lista.filter(n => n !== e.nombre)
            : [...lista, e.nombre];

          setCalendario(prev => ({
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
