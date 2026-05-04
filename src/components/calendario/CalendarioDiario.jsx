import { useState} from "react";

const normalizar = (str) =>
  str
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

function CalendarioDiario({ personal, planilla, tipo, mesActivo, licencias, calendario, setCalendario }) {
 //console.log(JSON.stringify(personal, null, 2));
  const personalFiltrado = personal.filter(
  (p) => p.categoria === tipo
);


  const getFechaInicial = () => {
  if (!mesActivo) return new Date();

  const [year, month] = mesActivo.split("-").map(Number);
  return new Date(year, month - 1, 1);
};

const [fecha, setFecha] = useState(getFechaInicial);



const {
  cambiosDia = {},
  noDisponibles = {},
  extras = {}
} = calendario || {};

console.log("🧠 cambiosDia actual:", cambiosDia);
//const [nuevoExtra, setNuevoExtra] = useState("");
const [nuevoNombre, setNuevoNombre] = useState("");

  const [seleccionado, setSeleccionado] = useState(null);

  let sectoresFijos = [];
let sectoresCriticos = [];
let sectoresBajaPrioridad = [];
let turnantesLabels = [];
let posicionesTurnantes = [];



if (tipo === "enfermero") {
  sectoresFijos = [
    "REA 1","EXPLORA 1","1-3 + 21","PRE INT 1","DX 25-30",
    "8-13","4-7","SILLÓN 1","14-19","REA 2",
    "SILLON 2","20-22-24","PRE INT 2","EXPLORA 2","SM"
  ];

  sectoresCriticos = [
    "REA 1","EXPLORA 1","1-3 + 21","PRE INT 1","DX 25-30",
    "8-13","4-7","SILLÓN 1","14-19","20-22-24","SM"
  ];

  sectoresBajaPrioridad = [
    "REA 2","PRE INT 2","EXPLORA 2","SILLON 2"
  ];

  turnantesLabels = ["T1","T2","T3","T4","T5"];
   posicionesTurnantes = [2, 7, 10, 13, 14]; // 👈 MISMAS que planilla
}

if (tipo === "licenciado") {
  sectoresFijos = [
    "Triage 1",
    "Estabiliza",
    "Reanimación + Sillones",
    "Observación 1",
    "Explora",
    "Triage 2",
    "Diagnostico",
    "Observación 2",
    "Preinternación",
    "Salud Mental"
  ];

  sectoresCriticos = [
    "Triage 1",
    "Estabiliza",
    "Reanimación + Sillones"
  ];

  sectoresBajaPrioridad = [
    "Observación 2",
    "Preinternación",
    "Salud Mental"
  ];

  turnantesLabels = ["T1","T2","T3"];

   posicionesTurnantes = [1, 7, 10]; // 👈 MISMAS que planilla
}

  const filas = [];
let tIndex = 0;

sectoresFijos.forEach((s, i) => {
  filas.push(s);

  if (posicionesTurnantes.includes(i)) {
    filas.push(turnantesLabels[tIndex]);
    tIndex++;
  }
});


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

const semanaIndex = semanas.findIndex((inicioSemana) => {
  const fin = new Date(inicioSemana);
  fin.setDate(fin.getDate() + 6);

  return fecha >= inicioSemana && fecha <= fin;
});

const semanaKey =
  semanaIndex === -1 ? "semana1" : `semana${semanaIndex + 1}`;


const keyDia = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,"0")}-${String(fecha.getDate()).padStart(2,"0")}`;

const esLibreReal = (e) => {
  if (!e || e.libre == null) return false;

  const base = new Date(2026, 0, e.libre, 12);
  const actual = new Date(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate(),
    12
  );

  const diff = Math.floor(
    (actual - base) / (1000 * 60 * 60 * 24)
  );

  return diff % 5 === 0;
};
const estaDeLicencia = (e) => {
  if (!e) return false;

  return (licencias || []).some(l => {
    if (l.nombre !== e.nombre) return false;

    const [yd, md, dd] = l.desde.split("-");
    const [yh, mh, dh] = l.hasta.split("-");

    const desde = new Date(yd, md - 1, dd, 12);
    const hasta = new Date(yh, mh - 1, dh, 12);

    return fecha >= desde && fecha <= hasta;
  });
};
const estaLibre = (e) => {
  if (!e || e.libre == null) return false;

  // 🔥 FIX: si está como extra hoy → NO está libre
  const esExtraHoy = (extras[keyDia] || []).some(
    ex => ex.nombre === e.nombre
  );

  if (esExtraHoy) return false;

  const base = new Date(2026, 0, e.libre, 12);
  const actual = new Date(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate(),
    12
  );

  const diff = Math.floor(
    (actual - base) / (1000 * 60 * 60 * 24)
  );

  return diff % 5 === 0;
};

  const estaNoDisponible = (e) =>
    e && (noDisponibles[keyDia] || []).includes(e.nombre);

 const extrasDia = extras[keyDia] || [];
const estaAusente = (e) =>
  e &&
  (
    (esLibreReal(e) && !extrasDia.some(ex => ex.nombre === e.nombre)) ||
    estaNoDisponible(e) ||
    estaDeLicencia(e)
  );
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

  const enfermero = [...personal, ...extrasDia].find(
    e => normalizar(e.nombre) === normalizar(nombre)
  );

  return {
    nombre: fila,
    enfermero: enfermero || null,
    tipo: fila.startsWith("T") ? "turnante" : "sector"
  };
});

  let turnantesDisponibles = asignacionCompleta
    .filter(f => f.tipo === "turnante")
    .map(f => f.enfermero)
    .filter(e => e && !estaAusente(e));

  let turnoIndex = 0;
const usadosSet = new Set();
const usarEnfermero = (e) => {
  if (!e) return null;

  //if (usadosSet.has(e.nombre)) return null;

  usadosSet.add(e.nombre);
  return e;
};
  const asignacionBase = asignacionCompleta
    .filter(f => f.tipo === "sector")
    .map(item => {
      if (!item.enfermero) return { ...item, enfermero: null };

      if (estaAusente(item.enfermero)) {
        const reemplazo = turnantesDisponibles[turnoIndex++];
        const eFinal = usarEnfermero(reemplazo);
return { ...item, enfermero: eFinal, reemplazo: true };
      }

    const eFinal = usarEnfermero(item.enfermero);
return { ...item, enfermero: eFinal, reemplazo: false };
    });

  // extras
  let extraIndex = 0;
// ✅ extras SIN repetir
asignacionBase.forEach(item => {
  if (!item.enfermero) {
    const extra = extrasDia
      .filter(e => !estaAusente(e))[extraIndex];

   if (extra) {
  const eFinal = usarEnfermero(extra);
  if (eFinal) {
    item.enfermero = eFinal;
    extraIndex++;
  }
}
  }
});

// turnantes
asignacionBase.forEach(item => {
  if (!item.enfermero) {
    const reemplazo = turnantesDisponibles[turnoIndex++];
    const eFinal = usarEnfermero(reemplazo);
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
  const eFinal = usarEnfermero(d.enfermero);

  if (eFinal) {
    c.enfermero = eFinal;
    d.enfermero = null;
    d.sacrificado = true;
    break;
  }
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

const sobrantes = [...personalFiltrado, ...extrasDia].filter(
  e => e && !usados.includes(e.nombre) && !estaAusente(e)
);

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

let ordenVisual = [];

if (tipo === "enfermero") {
  ordenVisual = [
    "REA 1","REA 2",
    "DIVIDER",

    "1-3 + 21","4-7","8-13","14-19","20-22-24","DX 25-30",
    "DIVIDER",

    "EXPLORA 1","EXPLORA 2",
    "DIVIDER",

    "SILLÓN 1","SILLON 2","SILLONES 3",
    "DIVIDER",

    "PRE INT 1","PRE INT 2","SM",
    "DIVIDER",

    "SIN ASIGNAR"
  ];
}

if (tipo === "licenciado") {
  ordenVisual = [
    "Triage 1","Triage 2",
    "DIVIDER",

    "Estabiliza","Reanimación + Sillones",
    "DIVIDER",

    "Observación 1","Observación 2",
    "DIVIDER",

    "Explora","Diagnostico",
    "DIVIDER",

    "Preinternación","Salud Mental",
    "DIVIDER",

    "SIN ASIGNAR"
  ];
}

const asignacionOrdenada = [];

ordenVisual.forEach(item => {
  if (item === "DIVIDER") {
    asignacionOrdenada.push({ tipo: "divider" });
  } else {
   const encontrados = asignacionFinal.filter(a => a.nombre === item);
asignacionOrdenada.push(...encontrados);
  }
});


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





  return (
    <div className="min-h-fit">
      <h2 className="text-xl font-semibold text-slate-800">
  Distribución diaria
</h2>

      <input
  type="date"
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