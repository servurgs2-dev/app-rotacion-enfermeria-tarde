import {
  crearReferenciaPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { tieneAsignacionesUtiles } from "./rotacionPlanilla.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const esVacia = (referencia) =>
  referencia === "" || referencia === null || referencia === undefined;

export const debeSincronizarAsignacionBase = ({
  rotacion3Dias,
  periodoClave
} = {}) =>
  Boolean(
    periodoClave &&
    periodoClave === rotacion3Dias?.fechaBase &&
    tieneAsignacionesUtiles(rotacion3Dias?.asignacionBase)
  );

export const obtenerDistribucionPeriodo = ({
  planilla,
  periodoClave,
  usaRotacionTresDias = false
} = {}) => {
  if (!esObjeto(planilla) || !periodoClave) return null;
  const distribucion = usaRotacionTresDias
    ? planilla.rotacion3Dias?.bloques?.[periodoClave]
    : planilla[periodoClave];
  return esObjeto(distribucion) ? distribucion : null;
};

const crearError = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

export const validarIntercambioPlanilla = ({
  planilla,
  periodoClave,
  filaOrigen,
  filaDestino,
  filas,
  personal,
  categoria,
  usaRotacionTresDias = false,
  personaIdOrigenEsperada,
  personaIdDestinoEsperada
} = {}) => {
  if (!esObjeto(planilla)) {
    return crearError("PLANILLA_AUSENTE", "La planilla no está disponible.");
  }
  const filasConfiguradas = Array.isArray(filas) ? filas : [];
  if (
    filasConfiguradas.length === 0 ||
    new Set(filasConfiguradas).size !== filasConfiguradas.length
  ) {
    return crearError(
      "FILAS_INVALIDAS",
      "La configuración de filas de la planilla no es válida."
    );
  }
  if (!filaOrigen || !filaDestino || filaOrigen === filaDestino) {
    return crearError(
      "FILAS_IGUALES",
      "Seleccioná dos posiciones diferentes."
    );
  }
  const filasPermitidas = new Set(filasConfiguradas);
  if (!filasPermitidas.has(filaOrigen) || !filasPermitidas.has(filaDestino)) {
    return crearError(
      "FILA_INEXISTENTE",
      "Una de las posiciones ya no pertenece a esta planilla."
    );
  }

  const distribucion = obtenerDistribucionPeriodo({
    planilla,
    periodoClave,
    usaRotacionTresDias
  });
  if (!distribucion) {
    return crearError(
      "PERIODO_INEXISTENTE",
      "El período seleccionado ya no está disponible."
    );
  }
  const referenciaOrigen = distribucion[filaOrigen];
  const referenciaDestino = distribucion[filaDestino];
  if (esVacia(referenciaOrigen) || esVacia(referenciaDestino)) {
    return crearError(
      "POSICION_VACIA",
      "Ambas posiciones deben tener una persona asignada."
    );
  }

  const candidatos = Array.isArray(personal) ? personal : [];
  const personaOrigen = resolverPersonaDesdeReferencia(referenciaOrigen, candidatos);
  const personaDestino = resolverPersonaDesdeReferencia(referenciaDestino, candidatos);
  if (!personaOrigen || !personaDestino) {
    return crearError(
      "PERSONA_INEXISTENTE",
      "Una de las personas ya no existe en Personal."
    );
  }
  if (
    personaOrigen.categoria !== categoria ||
    personaDestino.categoria !== categoria
  ) {
    return crearError(
      "CATEGORIA_INVALIDA",
      "Las personas no pertenecen a la categoría activa."
    );
  }
  const idOrigen = String(personaOrigen.id ?? "").trim();
  const idDestino = String(personaDestino.id ?? "").trim();
  if (!idOrigen || !idDestino || idOrigen === idDestino) {
    return crearError(
      "PERSONAS_IGUALES",
      "Las posiciones deben contener personas diferentes."
    );
  }
  if (
    (personaIdOrigenEsperada && idOrigen !== String(personaIdOrigenEsperada)) ||
    (personaIdDestinoEsperada && idDestino !== String(personaIdDestinoEsperada))
  ) {
    return crearError(
      "PLANILLA_CAMBIO",
      "La planilla cambió desde que seleccionaste las posiciones. Revisá nuevamente el intercambio."
    );
  }

  const idsVistos = new Set();
  for (const fila of filasConfiguradas) {
    const referencia = distribucion[fila];
    if (esVacia(referencia)) continue;
    const persona = resolverPersonaDesdeReferencia(referencia, candidatos);
    if (!persona) {
      return crearError(
        "REFERENCIA_INVALIDA",
        "La distribución contiene una referencia que no puede resolverse."
      );
    }
    if (persona.categoria !== categoria) {
      return crearError(
        "CATEGORIA_INVALIDA",
        "La distribución contiene una persona de otra categoría."
      );
    }
    const personaId = String(persona.id ?? "").trim();
    if (!personaId) {
      return crearError(
        "REFERENCIA_INVALIDA",
        "La distribución contiene una referencia que no puede resolverse."
      );
    }
    if (idsVistos.has(personaId)) {
      return crearError(
        "DUPLICADO_PREVIO",
        "La distribución contiene una persona duplicada. Corregila antes de intercambiar."
      );
    }
    idsVistos.add(personaId);
  }

  return {
    ok: true,
    distribucion,
    personaOrigen,
    personaDestino,
    referenciaNuevaOrigen: crearReferenciaPersona(personaDestino),
    referenciaNuevaDestino: crearReferenciaPersona(personaOrigen),
    resumen: {
      periodoClave,
      origen: {
        fila: filaOrigen,
        personaId: idOrigen,
        nombre: String(personaOrigen.nombre ?? "").trim()
      },
      destino: {
        fila: filaDestino,
        personaId: idDestino,
        nombre: String(personaDestino.nombre ?? "").trim()
      }
    }
  };
};

export const aplicarIntercambioPlanilla = (argumentos = {}) => {
  const validacion = validarIntercambioPlanilla(argumentos);
  if (!validacion.ok) return validacion;

  const {
    planilla,
    periodoClave,
    filaOrigen,
    filaDestino,
    usaRotacionTresDias = false
  } = argumentos;
  const distribucionIntercambiada = {
    ...validacion.distribucion,
    [filaOrigen]: { ...validacion.referenciaNuevaOrigen },
    [filaDestino]: { ...validacion.referenciaNuevaDestino }
  };

  if (!usaRotacionTresDias) {
    return {
      ...validacion,
      planilla: {
        ...planilla,
        [periodoClave]: distribucionIntercambiada
      }
    };
  }

  const rotacionActual = planilla.rotacion3Dias;
  const sincronizaBase = debeSincronizarAsignacionBase({
    rotacion3Dias: rotacionActual,
    periodoClave
  });
  return {
    ...validacion,
    planilla: {
      ...planilla,
      rotacion3Dias: {
        ...rotacionActual,
        bloques: {
          ...rotacionActual.bloques,
          [periodoClave]: distribucionIntercambiada
        },
        ...(sincronizaBase
          ? {
              asignacionBase: {
                ...rotacionActual.asignacionBase,
                [filaOrigen]: { ...validacion.referenciaNuevaOrigen },
                [filaDestino]: { ...validacion.referenciaNuevaDestino }
              }
            }
          : {})
      }
    }
  };
};

export const obtenerOpcionesOcupadas = ({
  planilla,
  periodoClave,
  filas,
  personal,
  categoria,
  usaRotacionTresDias = false
} = {}) => {
  const distribucion = obtenerDistribucionPeriodo({
    planilla,
    periodoClave,
    usaRotacionTresDias
  });
  if (!distribucion) return [];

  return (Array.isArray(filas) ? filas : []).flatMap((fila) => {
    const persona = resolverPersonaDesdeReferencia(distribucion[fila], personal);
    if (!persona || persona.categoria !== categoria) return [];
    return [{
      fila,
      personaId: String(persona.id),
      nombre: String(persona.nombre ?? "").trim()
    }];
  });
};
