import { VACANTE_OPERATIVA } from "./cambiosCalendario.js";
import { personasCompartenIdentidad } from "./identidadPersonas.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";

export const DESTINOS_DINAMICOS_ENFERMEROS = Object.freeze([
  Object.freeze({
    sectorId: "sillones_3",
    etiqueta: "SILLONES 3",
    aliases: Object.freeze(["SILLONES 3", "SILLÓN 3", "SILLON 3"]),
    despuesDeSectorId: "sillon_2"
  })
]);

const obtenerCambio = (cambiosDia, destino) => {
  const claves = [destino.etiqueta, ...(destino.aliases || [])]
    .map(normalizar)
    .filter(Boolean);
  const clave = [...new Set(claves)].find((actual) =>
    Object.hasOwn(cambiosDia || {}, actual)
  );
  return clave
    ? { existe: true, valor: cambiosDia[clave] }
    : { existe: false, valor: undefined };
};

const quitarPersona = (personas, persona) => personas.filter(
  (actual) => !personasCompartenIdentidad(actual, persona)
);

export const resolverDestinosDinamicosCalendario = ({
  destinos = [],
  cambiosDia = {},
  sobrantes = [],
  habilitarAutomaticos = false
} = {}) => {
  let disponibles = [...sobrantes];
  const asignaciones = [];

  destinos.forEach((destino) => {
    const cambio = obtenerCambio(cambiosDia, destino);
    const referenciaManual = cambio.valor !== "__EMPTY__" &&
      cambio.valor !== VACANTE_OPERATIVA
      ? cambio.valor
      : null;
    const personaManual = referenciaManual
      ? resolverPersonaDesdeReferencia(referenciaManual, disponibles)
      : null;
    const persona = personaManual || (
      !cambio.existe && habilitarAutomaticos ? disponibles[0] || null : null
    );

    if (!cambio.existe && !persona) return;

    asignaciones.push({
      nombre: destino.etiqueta,
      etiqueta: destino.etiqueta,
      sectorId: destino.sectorId,
      filaId: null,
      enfermero: persona,
      tipo: "sector",
      vacioManual: cambio.valor === "__EMPTY__",
      vacioOperativo: cambio.valor === VACANTE_OPERATIVA,
      cambioManualProtegido: cambio.existe && cambio.valor !== VACANTE_OPERATIVA
    });

    if (persona) disponibles = quitarPersona(disponibles, persona);
  });

  return { asignaciones, sobrantes: disponibles };
};

export const incorporarDestinosDinamicosAlOrden = ({
  ordenVisual = [],
  destinosPresentes = [],
  filasConfiguracion = [],
  definiciones = DESTINOS_DINAMICOS_ENFERMEROS
} = {}) => {
  const resultado = [...ordenVisual];

  destinosPresentes.forEach((destino) => {
    if (resultado.includes(destino.etiqueta)) return;
    const definicion = definiciones.find(
      (actual) => actual.sectorId === destino.sectorId
    );
    const etiquetaAnterior = filasConfiguracion.find(
      (fila) => fila.sectorId === definicion?.despuesDeSectorId
    )?.etiqueta;
    const indiceAnterior = etiquetaAnterior ? resultado.indexOf(etiquetaAnterior) : -1;
    const indiceSinAsignar = resultado.indexOf("SIN ASIGNAR");
    const indiceInsercion = indiceAnterior >= 0
      ? indiceAnterior + 1
      : indiceSinAsignar >= 0 ? indiceSinAsignar : resultado.length;
    resultado.splice(indiceInsercion, 0, destino.etiqueta);
  });

  return resultado;
};
