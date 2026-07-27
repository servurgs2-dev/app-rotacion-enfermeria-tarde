import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { crearReferenciaPersona } from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";

export const SECTORES_REDISTRIBUCION_OPCION_1 = [
  "1–3 + 19–22",
  "4–10",
  "11–18",
  "23–30"
];

export const SECTORES_REDISTRIBUCION_BOXES = [
  "1–3 + 21 y 22",
  "4–7 + 30",
  "8–14",
  "15–20",
  "DX 23–29"
];

const SECTORES_REEMPLAZADOS_POR_BOXES = new Set([
  "1-3 + 21",
  "4-7",
  "8-13",
  "14-19",
  "20-22-24",
  "DX 25-30"
].map(normalizar));

const esFilaVisible = (fila) =>
  Boolean(fila) && fila !== "DIVIDER" && normalizar(fila) !== "SIN ASIGNAR";

const obtenerPersonasUnicas = (asignaciones = []) => {
  const identidades = new Set();
  const personas = [];

  asignaciones.forEach((asignacion) => {
    const persona = asignacion?.enfermero;
    const identidad = obtenerClaveIdentidadPersona(persona);

    if (!persona || !identidad || identidades.has(identidad)) return;
    identidades.add(identidad);
    personas.push(persona);
  });

  return personas;
};

const crearRedistribucion = ({
  asignaciones,
  sectoresVisibles,
  prioridad
}) => {
  const filas = [...new Set((sectoresVisibles || []).filter(esFilaVisible))];
  const filasNormalizadas = new Set(filas.map(normalizar));
  const orden = [
    ...(prioridad || []).filter((fila) => filasNormalizadas.has(normalizar(fila))),
    ...filas
  ].filter((fila, indice, lista) =>
    lista.findIndex((otra) => normalizar(otra) === normalizar(fila)) === indice
  );
  const personas = obtenerPersonasUnicas(asignaciones);
  const cambios = {};
  const resultado = orden.map((sector, indice) => {
    const persona = personas[indice] || null;
    cambios[normalizar(sector)] = persona
      ? crearReferenciaPersona(persona)
      : "__EMPTY__";

    return { nombre: sector, enfermero: persona, tipo: "sector" };
  });

  return {
    ok: true,
    asignaciones: resultado,
    cambios,
    personasConsideradas: personas.length
  };
};

const obtenerSectoresVisiblesAgrupados = (ordenVisual = [], grupos = []) => {
  const resultado = [];
  let boxesInsertados = false;

  ordenVisual.forEach((fila) => {
    if (SECTORES_REEMPLAZADOS_POR_BOXES.has(normalizar(fila))) {
      if (!boxesInsertados) {
        resultado.push(...grupos);
        boxesInsertados = true;
      }
      return;
    }

    resultado.push(fila);
  });

  return resultado;
};

export const obtenerSectoresVisiblesOpcion1 = (ordenVisual = []) =>
  obtenerSectoresVisiblesAgrupados(
    ordenVisual,
    SECTORES_REDISTRIBUCION_OPCION_1
  );

export const obtenerSectoresVisiblesBoxes = (ordenVisual = []) =>
  obtenerSectoresVisiblesAgrupados(
    ordenVisual,
    SECTORES_REDISTRIBUCION_BOXES
  );

export const esDistribucionOpcion1 = (cambiosFecha = {}) =>
  SECTORES_REDISTRIBUCION_OPCION_1.some((sector) =>
    Object.hasOwn(cambiosFecha || {}, normalizar(sector))
  );

export const esDistribucionPorBoxes = (cambiosFecha = {}) =>
  SECTORES_REDISTRIBUCION_BOXES.some((sector) =>
    Object.hasOwn(cambiosFecha || {}, normalizar(sector))
  );

export const quitarRedistribucionFecha = (calendario = {}, fecha) => {
  const cambiosDia = { ...(calendario.cambiosDia || {}) };
  delete cambiosDia[fecha];

  return {
    ...calendario,
    cambiosDia
  };
};

export const redistribuirCritica = ({
  asignaciones,
  ordenVisual
}) => crearRedistribucion({
  asignaciones,
  sectoresVisibles: obtenerSectoresVisiblesOpcion1(ordenVisual),
  prioridad: [
    "REA 1",
    ...SECTORES_REDISTRIBUCION_OPCION_1,
    "SILLÓN 1",
    "EXPLORA 1",
    "PRE INT 1",
    "SM",
    "PRE INT 2",
    "SILLON 2",
    "EXPLORA 2",
    "REA 2"
  ]
});

export const redistribuirPorBoxes = ({
  asignaciones,
  ordenVisual
}) => {
  const sectoresVisibles = obtenerSectoresVisiblesBoxes(ordenVisual);
  const prioridad = [
    "REA 1",
    ...SECTORES_REDISTRIBUCION_BOXES,
    "SILLÓN 1",
    "EXPLORA 1",
    "PRE INT 1",
    "SM",
    "PRE INT 2",
    "SILLON 2",
    "EXPLORA 2",
    "REA 2"
  ];

  return crearRedistribucion({ asignaciones, sectoresVisibles, prioridad });
};

export const validarContextoRedistribucion = (esperado, actual) =>
  Boolean(
    esperado &&
    actual &&
    esperado.turno === actual.turno &&
    esperado.mes === actual.mes &&
    esperado.fecha === actual.fecha &&
    esperado.categoria === actual.categoria &&
    esperado.tipo === actual.tipo &&
    esperado.calendario === actual.calendario &&
    esperado.soloLectura === actual.soloLectura &&
    actual.categoria === "enfermero" &&
    actual.soloLectura === false
  );

export const describirRedistribucion = (tipo) =>
  tipo === "comun"
    ? "Se eliminará la redistribución aplicada en esta fecha y se recuperará la distribución habitual calculada desde la Planilla mensual."
    : tipo === "boxes"
    ? "Se reorganizarán los Enfermeros utilizando los grupos 1–3 + 21 y 22, 4–7 + 30, 8–14, 15–20 y DX 23–29. REA 1 tendrá prioridad y todos los demás sectores continuarán visibles. Algunos podrán quedar sin asignación."
    : "Se reorganizarán los Enfermeros utilizando los grupos 1–3 + 19–22, 4–10, 11–18 y 23–30. REA 1 tendrá prioridad y todos los demás sectores continuarán visibles. Algunos podrán quedar sin asignación.";
