import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const esReferenciaVacia = (referencia) =>
  referencia === "" ||
  referencia === null ||
  referencia === undefined ||
  referencia === "__EMPTY__";

export const analizarDistribucionBaseEnfermeros = ({
  distribucionBase,
  filas,
  personal,
  cantidadEsperada = 20
} = {}) => {
  const filasValidas = Array.isArray(filas) ? filas : [];
  if (
    filasValidas.length !== cantidadEsperada ||
    new Set(filasValidas).size !== cantidadEsperada
  ) {
    return {
      ok: false,
      mensaje: `La configuración debe contener exactamente ${cantidadEsperada} posiciones distintas.`
    };
  }
  if (!esObjeto(distribucionBase)) {
    return { ok: false, mensaje: "No existe una distribución base válida para generar." };
  }

  const personas = Array.isArray(personal) ? personal : [];
  const asignaciones = [];
  const filasVacias = [];
  const referenciasInvalidas = [];

  filasValidas.forEach((fila) => {
    const referencia = distribucionBase[fila];
    if (esReferenciaVacia(referencia)) {
      filasVacias.push(fila);
      return;
    }
    const persona = resolverPersonaDesdeReferencia(referencia, personas);
    const personaId = String(persona?.id ?? "").trim();
    if (!personaId) {
      referenciasInvalidas.push(fila);
      return;
    }
    asignaciones.push({
      fila,
      personaId,
      nombre: String(persona.nombre ?? "").trim()
    });
  });

  if (referenciasInvalidas.length > 0) {
    return {
      ok: false,
      mensaje: `Hay referencias que no corresponden a personal existente: ${referenciasInvalidas.join(", ")}.`,
      referenciasInvalidas
    };
  }

  const posicionesPorPersona = new Map();
  asignaciones.forEach(({ fila, personaId }) => {
    posicionesPorPersona.set(
      personaId,
      [...(posicionesPorPersona.get(personaId) || []), fila]
    );
  });
  const duplicados = [...posicionesPorPersona.entries()]
    .filter(([, posiciones]) => posiciones.length > 1)
    .map(([personaId, posiciones]) => ({ personaId, posiciones }));
  if (duplicados.length > 0) {
    return {
      ok: false,
      mensaje: `Hay personas asignadas más de una vez en la distribución base: ${duplicados
        .map(({ posiciones }) => posiciones.join(" / "))
        .join("; ")}.`,
      duplicados
    };
  }

  const cantidadPersonas = asignaciones.length;
  const cantidadPosicionesNoAplicables = cantidadEsperada - cantidadPersonas;
  if (
    cantidadPosicionesNoAplicables < 0 ||
    filasVacias.length !== cantidadPosicionesNoAplicables
  ) {
    return {
      ok: false,
      mensaje: "La distribución base es inconsistente con las posiciones configuradas."
    };
  }

  return {
    ok: true,
    cantidadPersonas,
    cantidadPosicionesNoAplicables,
    filasVacias,
    nombresPorFila: Object.fromEntries(
      asignaciones.map(({ fila, nombre }) => [fila, nombre])
    )
  };
};

export const validarPosicionesNoAplicables = ({
  seleccionadas,
  filas,
  filasVacias,
  cantidadRequerida
} = {}) => {
  const seleccion = Array.isArray(seleccionadas) ? seleccionadas : [];
  const unicas = new Set(seleccion);
  const configuradas = new Set(Array.isArray(filas) ? filas : []);
  const vacias = new Set(Array.isArray(filasVacias) ? filasVacias : []);

  if (unicas.size !== seleccion.length) {
    return { ok: false, mensaje: "Una posición no puede seleccionarse más de una vez." };
  }
  if (seleccion.length !== cantidadRequerida) {
    return {
      ok: false,
      mensaje: `Seleccioná exactamente ${cantidadRequerida} ${
        cantidadRequerida === 1 ? "posición" : "posiciones"
      }.`
    };
  }
  if (seleccion.some((fila) => !configuradas.has(fila))) {
    return { ok: false, mensaje: "La selección contiene posiciones no configuradas." };
  }
  const ocupadas = seleccion.filter((fila) => !vacias.has(fila));
  if (ocupadas.length > 0) {
    return {
      ok: false,
      mensaje: `Solo pueden seleccionarse posiciones vacías: ${ocupadas.join(", ")}.`
    };
  }
  return { ok: true };
};

export const obtenerFilasParticipantes = ({
  filas,
  filasFijas = [],
  posicionesNoAplicables = []
} = {}) => {
  const fijas = new Set(Array.isArray(filasFijas) ? filasFijas : []);
  const excluidas = new Set(
    Array.isArray(posicionesNoAplicables) ? posicionesNoAplicables : []
  );
  return (Array.isArray(filas) ? filas : []).filter(
    (fila) => !fijas.has(fila) && !excluidas.has(fila)
  );
};

export const tieneAsignacionesEnPeriodos = (distribuciones = []) =>
  distribuciones.some(
    (distribucion) =>
      esObjeto(distribucion) &&
      Object.values(distribucion).some((referencia) => !esReferenciaVacia(referencia))
  );

export const quitarGeneracionFlexible = (planilla) => {
  if (!esObjeto(planilla) || !Object.hasOwn(planilla, "generacionFlexible")) {
    return planilla;
  }
  const { generacionFlexible: _omitida, ...sinMetadata } = planilla;
  return sinMetadata;
};

export const crearMetadataGeneracionFlexible = ({
  estrategia,
  turnoId,
  posicionesNoAplicables,
  cantidadPersonasConsideradas
}) => ({
  version: 1,
  estrategia,
  turnoId,
  posicionesNoAplicables: [...posicionesNoAplicables],
  cantidadPersonasConsideradas
});
