import { generarBloquesFaltantes } from "./rotacionPlanilla.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const clonarValor = (valor) => {
  if (Array.isArray(valor)) return valor.map(clonarValor);
  if (!esObjeto(valor)) return valor;
  return Object.fromEntries(
    Object.entries(valor).map(([clave, contenido]) => [clave, clonarValor(contenido)])
  );
};

const esReferenciaUtil = (referencia) =>
  esObjeto(referencia) && String(referencia.personaId ?? "").trim() !== "";

export const tieneAsignacionBaseRotacion3Dias = (rotacion) =>
  esObjeto(rotacion?.asignacionBase) &&
  Object.values(rotacion.asignacionBase).some(esReferenciaUtil);

export class ErrorContinuidadRotacionPlanilla extends Error {
  constructor(mensaje, codigo = "CONTINUIDAD_ROTACION_INVALIDA") {
    super(mensaje);
    this.name = "ErrorContinuidadRotacionPlanilla";
    this.codigo = codigo;
  }
}

export const esSolicitudContinuidadVigente = (claveSolicitud, claveActual) =>
  Boolean(claveSolicitud && claveSolicitud === claveActual);

export const continuarRotacion3DiasEntreMeses = ({
  rotacionAnterior,
  rotacionActual,
  periodosDestino,
  filas,
  filasFijas = [],
  estrategia
} = {}) => {
  if (!tieneAsignacionBaseRotacion3Dias(rotacionAnterior)) {
    throw new ErrorContinuidadRotacionPlanilla(
      "El mes anterior no tiene una asignación base válida para continuar la rotación.",
      "ASIGNACION_BASE_AUSENTE"
    );
  }

  const anterior = esObjeto(rotacionAnterior) ? rotacionAnterior : {};
  const actual = esObjeto(rotacionActual) ? rotacionActual : {};
  const periodos = (Array.isArray(periodosDestino) ? periodosDestino : [])
    .filter((periodo) => periodo?.clave && Number.isInteger(periodo.indice));
  const clavesDestino = new Set(periodos.map((periodo) => periodo.clave));
  const bloquesAnteriores = esObjeto(anterior.bloques) ? anterior.bloques : {};
  const bloquesActuales = esObjeto(actual.bloques) ? actual.bloques : {};
  const coberturasAnteriores = esObjeto(anterior.coberturaLibreSM)
    ? anterior.coberturaLibreSM
    : {};
  const coberturasActuales = esObjeto(actual.coberturaLibreSM)
    ? actual.coberturaLibreSM
    : {};
  const bloquesIniciales = {};
  const coberturas = {};

  clavesDestino.forEach((clave) => {
    if (Object.hasOwn(bloquesActuales, clave) && esObjeto(bloquesActuales[clave])) {
      bloquesIniciales[clave] = clonarValor(bloquesActuales[clave]);
    } else if (
      Object.hasOwn(bloquesAnteriores, clave) &&
      esObjeto(bloquesAnteriores[clave])
    ) {
      bloquesIniciales[clave] = clonarValor(bloquesAnteriores[clave]);
    }

    if (Object.hasOwn(coberturasActuales, clave)) {
      if (esReferenciaUtil(coberturasActuales[clave])) {
        coberturas[clave] = clonarValor(coberturasActuales[clave]);
      }
    } else if (esReferenciaUtil(coberturasAnteriores[clave])) {
      coberturas[clave] = clonarValor(coberturasAnteriores[clave]);
    }
  });

  const baseContinuada = {
    ...clonarValor(anterior),
    ...clonarValor(actual),
    version: actual.version ?? anterior.version ?? 1,
    fechaBase: estrategia?.fechaBase ?? actual.fechaBase ?? anterior.fechaBase,
    duracionDias:
      estrategia?.duracionDias ?? actual.duracionDias ?? anterior.duracionDias,
    asignacionBase: clonarValor(anterior.asignacionBase),
    bloques: bloquesIniciales,
    coberturaLibreSM: coberturas
  };

  const generada = generarBloquesFaltantes({
    rotacion3Dias: baseContinuada,
    periodos,
    filas,
    filasFijas
  });

  return {
    ...generada,
    bloques: Object.fromEntries(
      periodos.map(({ clave }) => [clave, generada.bloques[clave]])
    ),
    coberturaLibreSM: Object.fromEntries(
      periodos.flatMap(({ clave }) =>
        Object.hasOwn(generada.coberturaLibreSM, clave)
          ? [[clave, generada.coberturaLibreSM[clave]]]
          : []
      )
    )
  };
};
