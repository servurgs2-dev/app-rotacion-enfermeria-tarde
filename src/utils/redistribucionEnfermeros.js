import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { crearReferenciaPersona } from "./referenciasPersonas.js";
import { obtenerSectorIdPorNombreHistorico } from "./configuracionPlanilla.js";
import {
  MODE_IDS_REDISTRIBUCION,
  obtenerModoRedistribucionPorId,
  resolverGrupoRedistribucion,
  SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION
} from "./gruposRedistribucion.js";
import { normalizar } from "./texto.js";

const MODO_OPCION_1 = obtenerModoRedistribucionPorId(
  MODE_IDS_REDISTRIBUCION.OPCION_1
);
const MODO_OPCION_2 = obtenerModoRedistribucionPorId(
  MODE_IDS_REDISTRIBUCION.OPCION_2
);

export const SECTORES_REDISTRIBUCION_OPCION_1 = MODO_OPCION_1.groups
  .map((grupo) => grupo.etiqueta);

export const SECTORES_REDISTRIBUCION_BOXES = MODO_OPCION_2.groups
  .map((grupo) => grupo.etiqueta);

const SECTOR_IDS_REEMPLAZADOS = new Set(SECTOR_IDS_REEMPLAZADOS_REDISTRIBUCION);

export const PRIORIDAD_REDISTRIBUCION_OPCION_1 = Object.freeze([
  Object.freeze({ tipo: "sector", sectorId: "rea_1" }),
  ...MODO_OPCION_1.groups.map((grupo) => Object.freeze({
    tipo: "grupo",
    groupId: grupo.groupId
  })),
  Object.freeze({ tipo: "sector", sectorId: "sillon_1" }),
  Object.freeze({ tipo: "sector", sectorId: "explora_1" }),
  Object.freeze({ tipo: "sector", sectorId: "pre_int_1" }),
  Object.freeze({ tipo: "sector", sectorId: "salud_mental" }),
  Object.freeze({ tipo: "sector", sectorId: "pre_int_2" }),
  Object.freeze({ tipo: "sector", sectorId: "sillon_2" }),
  Object.freeze({ tipo: "sector", sectorId: "explora_2" }),
  Object.freeze({ tipo: "sector", sectorId: "rea_2" })
]);

export const PRIORIDAD_REDISTRIBUCION_OPCION_2 = Object.freeze([
  Object.freeze({ tipo: "sector", sectorId: "rea_1" }),
  ...MODO_OPCION_2.groups.map((grupo) => Object.freeze({
    tipo: "grupo",
    groupId: grupo.groupId
  })),
  Object.freeze({ tipo: "sector", sectorId: "sillon_1" }),
  Object.freeze({ tipo: "sector", sectorId: "explora_1" }),
  Object.freeze({ tipo: "sector", sectorId: "pre_int_1" }),
  Object.freeze({ tipo: "sector", sectorId: "salud_mental" }),
  Object.freeze({ tipo: "sector", sectorId: "pre_int_2" }),
  Object.freeze({ tipo: "sector", sectorId: "sillon_2" }),
  Object.freeze({ tipo: "sector", sectorId: "explora_2" }),
  Object.freeze({ tipo: "sector", sectorId: "rea_2" })
]);

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

const claveDestino = (destino) => {
  if (typeof destino === "string") return `etiqueta:${normalizar(destino)}`;
  if (destino?.tipo === "sector" && destino.sectorId) return `sector:${destino.sectorId}`;
  if (destino?.tipo === "grupo" && destino.groupId) return `grupo:${destino.groupId}`;
  return `etiqueta:${normalizar(destino?.etiqueta)}`;
};

const etiquetaDestino = (destino) => typeof destino === "string"
  ? destino
  : destino?.etiqueta;

const crearRedistribucionPorIdentidades = ({ asignaciones, destinos, prioridad }) => {
  const visibles = (destinos || []).filter((destino) => esFilaVisible(etiquetaDestino(destino)));
  const porIdentidad = new Map(visibles.map((destino) => [claveDestino(destino), destino]));
  const orden = [];
  const identidadesAgregadas = new Set();
  [...(prioridad || []), ...visibles].forEach((identidad) => {
    const destino = porIdentidad.get(claveDestino(identidad));
    if (!destino) return;
    const clave = claveDestino(destino);
    if (identidadesAgregadas.has(clave)) return;
    identidadesAgregadas.add(clave);
    orden.push(destino);
  });
  const personas = obtenerPersonasUnicas(asignaciones);
  const cambios = {};
  const resultado = orden.map((destino, indice) => {
    const persona = personas[indice] || null;
    const etiqueta = etiquetaDestino(destino);
    cambios[normalizar(etiqueta)] = persona
      ? crearReferenciaPersona(persona)
      : "__EMPTY__";
    return { nombre: etiqueta, enfermero: persona, tipo: "sector" };
  });
  return { ok: true, asignaciones: resultado, cambios, personasConsideradas: personas.length };
};

export const obtenerDestinosVisiblesOpcion1 = ({
  ordenVisual = [],
  filasConfiguracion = []
} = {}) => {
  const filasPorEtiqueta = new Map(filasConfiguracion.map((fila) => [fila.etiqueta, fila]));
  const resultado = [];
  let gruposInsertados = false;
  ordenVisual.forEach((etiqueta) => {
    const fila = filasPorEtiqueta.get(etiqueta);
    const sectorId = fila?.tipo === "sector"
      ? fila.sectorId
      : obtenerSectorIdPorNombreHistorico(etiqueta);
    if (SECTOR_IDS_REEMPLAZADOS.has(sectorId)) {
      if (!gruposInsertados) {
        resultado.push(...MODO_OPCION_1.groups.map((grupo) => ({
          tipo: "grupo",
          groupId: grupo.groupId,
          etiqueta: grupo.etiqueta
        })));
        gruposInsertados = true;
      }
      return;
    }
    resultado.push(fila
      ? {
          tipo: fila.tipo,
          sectorId: fila.sectorId,
          turnanteId: fila.turnanteId,
          etiqueta
        }
      : sectorId
        ? { tipo: "sector", sectorId, etiqueta }
        : { tipo: "visual", etiqueta });
  });
  return resultado;
};

export const obtenerSectoresVisiblesOpcion1 = (ordenVisual = [], filasConfiguracion = []) =>
  obtenerDestinosVisiblesOpcion1({ ordenVisual, filasConfiguracion })
    .map((destino) => destino.etiqueta);

export const obtenerDestinosVisiblesOpcion2 = ({
  ordenVisual = [],
  filasConfiguracion = []
} = {}) => {
  const filasPorEtiqueta = new Map(filasConfiguracion.map((fila) => [fila.etiqueta, fila]));
  const resultado = [];
  let gruposInsertados = false;
  ordenVisual.forEach((etiqueta) => {
    const fila = filasPorEtiqueta.get(etiqueta);
    const sectorId = fila?.tipo === "sector"
      ? fila.sectorId
      : obtenerSectorIdPorNombreHistorico(etiqueta);
    if (SECTOR_IDS_REEMPLAZADOS.has(sectorId)) {
      if (!gruposInsertados) {
        resultado.push(...MODO_OPCION_2.groups.map((grupo) => ({
          tipo: "grupo",
          groupId: grupo.groupId,
          etiqueta: grupo.etiqueta
        })));
        gruposInsertados = true;
      }
      return;
    }
    resultado.push(fila
      ? {
          tipo: fila.tipo,
          sectorId: fila.sectorId,
          turnanteId: fila.turnanteId,
          etiqueta
        }
      : sectorId
        ? { tipo: "sector", sectorId, etiqueta }
        : { tipo: "visual", etiqueta });
  });
  return resultado;
};

export const obtenerSectoresVisiblesBoxes = (ordenVisual = [], filasConfiguracion = []) =>
  obtenerDestinosVisiblesOpcion2({ ordenVisual, filasConfiguracion })
    .map((destino) => destino.etiqueta);

export const esDistribucionOpcion1 = (cambiosFecha = {}) =>
  Object.keys(cambiosFecha || {}).some((clave) =>
    resolverGrupoRedistribucion(clave)?.modeId === MODE_IDS_REDISTRIBUCION.OPCION_1
  );

export const esDistribucionPorBoxes = (cambiosFecha = {}) =>
  Object.keys(cambiosFecha || {}).some((clave) =>
    resolverGrupoRedistribucion(clave)?.modeId === MODE_IDS_REDISTRIBUCION.OPCION_2
  );

export const quitarRedistribucionFecha = (calendario = {}, fecha) => {
  const cambiosDia = { ...(calendario.cambiosDia || {}) };
  const procedenciaCambiosDia = { ...(calendario.procedenciaCambiosDia || {}) };
  delete cambiosDia[fecha];
  delete procedenciaCambiosDia[fecha];

  return {
    ...calendario,
    cambiosDia,
    procedenciaCambiosDia
  };
};

export const redistribuirCritica = ({
  asignaciones,
  ordenVisual,
  filasConfiguracion = []
}) => crearRedistribucionPorIdentidades({
  asignaciones,
  destinos: obtenerDestinosVisiblesOpcion1({ ordenVisual, filasConfiguracion }),
  prioridad: PRIORIDAD_REDISTRIBUCION_OPCION_1
});

export const recalcularRedistribucionOpcion1Automatica = ({
  asignaciones,
  cambiosDia = {},
  procedenciaCambiosDia = {},
  ordenVisual,
  filasConfiguracion = [],
  procedenciaAutomatica = "redistribucion_automatica"
} = {}) => {
  if (!esDistribucionOpcion1(cambiosDia) || !Array.isArray(asignaciones)) {
    return Array.isArray(asignaciones) ? asignaciones.map((fila) => ({ ...fila })) : [];
  }
  const destinos = obtenerDestinosVisiblesOpcion1({ ordenVisual, filasConfiguracion });
  const asignacionesPorClave = new Map(asignaciones.map((fila) => [normalizar(fila?.nombre), fila]));
  const destinosAutomaticos = destinos.filter((destino) =>
    procedenciaCambiosDia?.[normalizar(etiquetaDestino(destino))] === procedenciaAutomatica
  );
  const clavesAutomaticas = new Set(destinosAutomaticos.map((destino) =>
    normalizar(etiquetaDestino(destino))
  ));
  const ordenAutomatico = crearRedistribucionPorIdentidades({
    asignaciones: [],
    destinos: destinosAutomaticos,
    prioridad: PRIORIDAD_REDISTRIBUCION_OPCION_1
  }).asignaciones;
  const candidatos = obtenerPersonasUnicas(ordenAutomatico.map((destino) =>
    asignacionesPorClave.get(normalizar(destino.nombre))
  ));
  const redistribucion = crearRedistribucionPorIdentidades({
    asignaciones: candidatos.map((enfermero) => ({ enfermero })),
    destinos: destinosAutomaticos,
    prioridad: PRIORIDAD_REDISTRIBUCION_OPCION_1
  });
  const personasPorDestino = new Map(redistribucion.asignaciones.map((fila) =>
    [normalizar(fila.nombre), fila.enfermero]
  ));
  return asignaciones.map((fila) => {
    const clave = normalizar(fila?.nombre);
    if (!clavesAutomaticas.has(clave) || !asignacionesPorClave.has(clave)) return { ...fila };
    return {
      ...fila,
      enfermero: personasPorDestino.get(clave) || null,
      vacioManual: false,
      cambioManualProtegido: false
    };
  });
};

export const redistribuirPorBoxes = ({
  asignaciones,
  ordenVisual,
  filasConfiguracion = []
}) => crearRedistribucionPorIdentidades({
  asignaciones,
  destinos: obtenerDestinosVisiblesOpcion2({ ordenVisual, filasConfiguracion }),
  prioridad: PRIORIDAD_REDISTRIBUCION_OPCION_2
});

export const recalcularRedistribucionOpcion2Automatica = ({
  asignaciones,
  cambiosDia = {},
  procedenciaCambiosDia = {},
  ordenVisual,
  filasConfiguracion = [],
  procedenciaAutomatica = "redistribucion_automatica"
} = {}) => {
  if (!esDistribucionPorBoxes(cambiosDia) || !Array.isArray(asignaciones)) {
    return Array.isArray(asignaciones) ? asignaciones.map((fila) => ({ ...fila })) : [];
  }
  const destinos = obtenerDestinosVisiblesOpcion2({ ordenVisual, filasConfiguracion });
  const asignacionesPorClave = new Map(asignaciones.map((fila) => [normalizar(fila?.nombre), fila]));
  const destinosAutomaticos = destinos.filter((destino) =>
    procedenciaCambiosDia?.[normalizar(etiquetaDestino(destino))] === procedenciaAutomatica
  );
  const clavesAutomaticas = new Set(destinosAutomaticos.map((destino) =>
    normalizar(etiquetaDestino(destino))
  ));
  const ordenAutomatico = crearRedistribucionPorIdentidades({
    asignaciones: [],
    destinos: destinosAutomaticos,
    prioridad: PRIORIDAD_REDISTRIBUCION_OPCION_2
  }).asignaciones;
  const candidatos = obtenerPersonasUnicas(ordenAutomatico.map((destino) =>
    asignacionesPorClave.get(normalizar(destino.nombre))
  ));
  const redistribucion = crearRedistribucionPorIdentidades({
    asignaciones: candidatos.map((enfermero) => ({ enfermero })),
    destinos: destinosAutomaticos,
    prioridad: PRIORIDAD_REDISTRIBUCION_OPCION_2
  });
  const personasPorDestino = new Map(redistribucion.asignaciones.map((fila) =>
    [normalizar(fila.nombre), fila.enfermero]
  ));
  return asignaciones.map((fila) => {
    const clave = normalizar(fila?.nombre);
    if (!clavesAutomaticas.has(clave)) return { ...fila };
    return {
      ...fila,
      enfermero: personasPorDestino.get(clave) || null,
      vacioManual: false,
      cambioManualProtegido: false
    };
  });
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
