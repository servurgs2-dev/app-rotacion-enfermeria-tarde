const textoId = (valor) => String(valor ?? "").trim();

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const compararAsignaciones = (a, b) =>
  a.sectorId.localeCompare(b.sectorId) || a.personaId.localeCompare(b.personaId);

export const normalizarAsignacionesFijasMensuales = (asignaciones) => {
  if (!Array.isArray(asignaciones)) return [];

  const unicas = new Map();
  asignaciones.forEach((asignacion) => {
    if (!esObjeto(asignacion)) return;
    const sectorId = textoId(asignacion.sectorId);
    const personaId = textoId(asignacion.personaId);
    if (!sectorId || !personaId) return;
    const normalizada = { sectorId, personaId };
    unicas.set(`${sectorId}\u0000${personaId}`, normalizada);
  });

  return [...unicas.values()].sort(compararAsignaciones);
};

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
