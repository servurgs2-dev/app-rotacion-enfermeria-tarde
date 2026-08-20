import {
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { resolverClaveDistribucionParaFila } from "./resolucionIdentidadesPlanilla.js";
import { normalizarAsignacionesFijasMensuales } from "./modeloAsignacionesFijasMensuales.js";

export { normalizarAsignacionesFijasMensuales } from "./modeloAsignacionesFijasMensuales.js";

const textoId = (valor) => String(valor ?? "").trim();

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const limpiarAsignacionesFijasDePersona = (asignaciones, personaId) => {
  const id = textoId(personaId);
  return normalizarAsignacionesFijasMensuales(asignaciones)
    .filter((asignacion) => asignacion.personaId !== id);
};

export const obtenerAsignacionFijaPorSectorId = (asignaciones, sectorId) => {
  const id = textoId(sectorId);
  return normalizarAsignacionesFijasMensuales(asignaciones)
    .find((asignacion) => asignacion.sectorId === id) || null;
};

export const obtenerAsignacionFijaPorPersonaId = (asignaciones, personaId) => {
  const id = textoId(personaId);
  return normalizarAsignacionesFijasMensuales(asignaciones)
    .find((asignacion) => asignacion.personaId === id) || null;
};

const crearError = (codigo, datos = {}) => ({ codigo, ...datos });

export const validarAsignacionesFijasMensuales = ({
  asignaciones,
  personal,
  categoria,
  filas
} = {}) => {
  const entradas = Array.isArray(asignaciones) ? asignaciones : [];
  const personas = Array.isArray(personal) ? personal : [];
  const filasConfiguradas = Array.isArray(filas) ? filas : [];
  const errores = [];
  const personasPorId = new Map();

  personas.forEach((persona) => {
    const personaId = textoId(persona?.id);
    if (!personaId) return;
    const coincidencias = personasPorId.get(personaId) || [];
    coincidencias.push(persona);
    personasPorId.set(personaId, coincidencias);
  });
  personasPorId.forEach((coincidencias, personaId) => {
    if (coincidencias.length > 1) {
      errores.push(crearError("PERSONA_ID_DUPLICADO", { personaId }));
    }
  });

  filasConfiguradas.forEach((fila) => {
    if (fila?.tipo === "sector" && !textoId(fila.sectorId)) {
      errores.push(crearError("FILA_SIN_SECTOR_ID", {
        filaId: textoId(fila.filaId)
      }));
    }
  });

  const sectoresVistos = new Map();
  const personasVistas = new Map();
  const paresVistos = new Set();
  entradas.forEach((asignacion, indice) => {
    const sectorId = textoId(asignacion?.sectorId);
    const personaId = textoId(asignacion?.personaId);
    if (!esObjeto(asignacion) || !sectorId || !personaId) {
      errores.push(crearError("ASIGNACION_INVALIDA", { indice }));
      return;
    }
    const clavePar = `${sectorId}\u0000${personaId}`;
    if (paresVistos.has(clavePar)) return;
    paresVistos.add(clavePar);

    if (sectoresVistos.has(sectorId)) {
      errores.push(crearError("SECTOR_REPETIDO", { sectorId }));
    } else {
      sectoresVistos.set(sectorId, indice);
    }
    if (personasVistas.has(personaId)) {
      errores.push(crearError("PERSONA_REPETIDA", { personaId }));
    } else {
      personasVistas.set(personaId, indice);
    }

    const coincidenciasPersona = personasPorId.get(personaId) || [];
    if (coincidenciasPersona.length === 0) {
      errores.push(crearError("PERSONA_INEXISTENTE", { personaId }));
    } else if (
      coincidenciasPersona.length === 1 &&
      textoId(coincidenciasPersona[0]?.categoria) !== textoId(categoria)
    ) {
      errores.push(crearError("CATEGORIA_INCORRECTA", { personaId }));
    }

    const filaSector = filasConfiguradas.find(
      (fila) => fila?.tipo === "sector" && textoId(fila.sectorId) === sectorId
    );
    const filaTurnante = filasConfiguradas.find(
      (fila) => fila?.tipo === "turnante" &&
        [fila.turnanteId, fila.filaId].some((id) => textoId(id) === sectorId)
    );
    if (filaTurnante) {
      errores.push(crearError("DESTINO_TURNANTE", { sectorId }));
    } else if (!filaSector) {
      errores.push(crearError("SECTOR_INEXISTENTE", { sectorId }));
    } else if (filaSector.activo === false) {
      errores.push(crearError("SECTOR_DESACTIVADO", { sectorId }));
    }
  });

  return {
    valido: errores.length === 0,
    errores,
    asignaciones: normalizarAsignacionesFijasMensuales(entradas)
  };
};

const clonarReferencia = (referencia) =>
  esObjeto(referencia) ? { ...referencia } : referencia;

const clonarDistribucion = (distribucion) => Object.fromEntries(
  Object.entries(esObjeto(distribucion) ? distribucion : {}).map(([clave, referencia]) => [
    clave,
    clonarReferencia(referencia)
  ])
);

const obtenerIdentidadReferencia = (referencia, personal) =>
  textoId(resolverPersonaDesdeReferencia(referencia, personal)?.id);

const obtenerIdentidadesDistribucion = (distribucion, personal) =>
  Object.values(distribucion)
    .map((referencia) => obtenerIdentidadReferencia(referencia, personal))
    .filter(Boolean)
    .sort();

export const aplicarAsignacionesFijasADistribucion = ({
  distribucion,
  asignacionesFijas,
  filas,
  personal,
  categoria
} = {}) => {
  const original = clonarDistribucion(distribucion);
  const asignaciones = normalizarAsignacionesFijasMensuales(asignacionesFijas);
  if (asignaciones.length === 0) {
    return { ok: true, distribucion: original, clavesFijas: [], errores: [] };
  }

  const validacion = validarAsignacionesFijasMensuales({
    asignaciones: asignacionesFijas,
    personal,
    categoria,
    filas
  });
  if (!validacion.valido) {
    return {
      ok: false,
      codigo: "ASIGNACIONES_FIJAS_INVALIDAS",
      errores: validacion.errores,
      distribucion: original,
      clavesFijas: []
    };
  }

  const filasPorSector = new Map(
    filas
      .filter((fila) => fila?.tipo === "sector" && fila.activo !== false)
      .map((fila) => [textoId(fila.sectorId), fila])
  );
  const destinos = new Map();
  const fuentes = new Map();
  const referenciasPorPersona = new Map();
  const errores = [];

  Object.entries(original).forEach(([clave, referencia]) => {
    const persona = resolverPersonaDesdeReferencia(referencia, personal);
    const personaId = textoId(persona?.id);
    if (!personaId) return;
    if (fuentes.has(personaId)) {
      errores.push({ codigo: "PERSONA_DUPLICADA_EN_BASE", personaId });
      return;
    }
    fuentes.set(personaId, clave);
    referenciasPorPersona.set(personaId, clonarReferencia(referencia));
  });

  asignaciones.forEach(({ sectorId, personaId }) => {
    const fila = filasPorSector.get(sectorId);
    const claveDestino = resolverClaveDistribucionParaFila({
      distribucion: original,
      fila
    });
    if (claveDestino === null) {
      errores.push({ codigo: "SECTOR_AUSENTE_EN_BASE", sectorId });
    } else {
      destinos.set(personaId, claveDestino);
    }
    if (!fuentes.has(personaId)) {
      errores.push({ codigo: "PERSONA_AUSENTE_EN_BASE", personaId });
    }
  });

  if (errores.length > 0) {
    return {
      ok: false,
      codigo: "BASE_INCOMPATIBLE_CON_ASIGNACIONES_FIJAS",
      errores,
      distribucion: original,
      clavesFijas: []
    };
  }

  const aristas = new Map();
  asignaciones.forEach(({ personaId }) => {
    aristas.set(fuentes.get(personaId), destinos.get(personaId));
  });
  const clavesDestino = new Set(destinos.values());
  const resultado = clonarDistribucion(original);

  [...aristas.keys()]
    .filter((claveFuente) => !clavesDestino.has(claveFuente))
    .sort()
    .forEach((inicio) => {
      let final = inicio;
      const visitadas = new Set();
      while (aristas.has(final) && !visitadas.has(final)) {
        visitadas.add(final);
        final = aristas.get(final);
      }
      resultado[inicio] = clonarReferencia(original[final] ?? "");
    });

  asignaciones.forEach(({ personaId }) => {
    resultado[destinos.get(personaId)] = clonarReferencia(
      referenciasPorPersona.get(personaId)
    );
  });

  const identidadesAntes = obtenerIdentidadesDistribucion(original, personal);
  const identidadesDespues = obtenerIdentidadesDistribucion(resultado, personal);
  const fijasCorrectas = asignaciones.every(({ personaId }) =>
    obtenerIdentidadReferencia(resultado[destinos.get(personaId)], personal) === personaId
  );
  const sinDuplicados = new Set(identidadesDespues).size === identidadesDespues.length;
  if (
    !fijasCorrectas ||
    !sinDuplicados ||
    identidadesAntes.length !== identidadesDespues.length ||
    identidadesAntes.some((personaId, indice) => personaId !== identidadesDespues[indice])
  ) {
    return {
      ok: false,
      codigo: "INVARIANTES_ASIGNACIONES_FIJAS",
      errores: [{ codigo: "DISTRIBUCION_NO_CONSERVADA" }],
      distribucion: original,
      clavesFijas: []
    };
  }

  return {
    ok: true,
    distribucion: resultado,
    clavesFijas: [...clavesDestino].sort(),
    errores: []
  };
};

export class ErrorGeneracionAsignacionesFijas extends Error {
  constructor(resultado) {
    super("No se pudo generar la Planilla porque las asignaciones fijas son inválidas.");
    this.name = "ErrorGeneracionAsignacionesFijas";
    this.codigo = resultado?.codigo || "ASIGNACIONES_FIJAS_INVALIDAS";
    this.errores = Array.isArray(resultado?.errores) ? resultado.errores : [];
  }
}
