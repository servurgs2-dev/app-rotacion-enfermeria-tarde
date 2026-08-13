import { personasCompartenIdentidad, obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";

export const SECTOR_ID_REANIMACION_SILLONES = "reanimacion_sillones";

export const SYNTHETIC_IDS_REANIMACION_SILLONES = Object.freeze({
  REANIMACION: "reanimacion_sillones.reanimacion",
  SILLONES: "reanimacion_sillones.sillones"
});

export const DESTINOS_SINTETICOS_REANIMACION_SILLONES = Object.freeze([
  Object.freeze({
    syntheticId: SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION,
    etiqueta: "Reanimación",
    aliases: Object.freeze(["Reanimacion"])
  }),
  Object.freeze({
    syntheticId: SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES,
    etiqueta: "Sillones",
    aliases: Object.freeze([])
  })
]);

const destinosPorId = new Map(DESTINOS_SINTETICOS_REANIMACION_SILLONES.map(
  (destino) => [destino.syntheticId, destino]
));
const destinosPorClave = new Map(DESTINOS_SINTETICOS_REANIMACION_SILLONES.flatMap(
  (destino) => [destino.etiqueta, ...destino.aliases]
    .map((clave) => [normalizar(clave), destino])
));
const copiarDestino = (destino) => destino ? {
  syntheticId: destino.syntheticId,
  etiqueta: destino.etiqueta,
  aliases: [...destino.aliases]
} : null;

export const obtenerDestinoSinteticoReanimacionSillonesPorId = (syntheticId) =>
  copiarDestino(destinosPorId.get(syntheticId));

export const obtenerDestinoSinteticoReanimacionSillonesPorClave = (clave) =>
  copiarDestino(destinosPorClave.get(normalizar(clave)));

export const resolverDestinoSinteticoReanimacionSillones = (identidad) =>
  obtenerDestinoSinteticoReanimacionSillonesPorId(identidad) ||
  obtenerDestinoSinteticoReanimacionSillonesPorClave(identidad);

export const obtenerClaveHistoricaDestinoSintetico = (syntheticId) => {
  const destino = destinosPorId.get(syntheticId);
  return destino ? normalizar(destino.etiqueta) : null;
};

export const esDestinoSinteticoReanimacionSillones = (fila) =>
  Boolean(fila?.syntheticId && destinosPorId.has(fila.syntheticId));

const aplicarCambiosSinteticos = ({ asignaciones, cambiosDia, personalDisponible }) => {
  const resultado = asignaciones.map((fila) => ({ ...fila }));
  const operaciones = [];
  const personasSolicitadas = new Set();

  DESTINOS_SINTETICOS_REANIMACION_SILLONES.forEach((destinoDefinido) => {
    const destino = resultado.find((fila) => fila.syntheticId === destinoDefinido.syntheticId);
    const referencia = cambiosDia?.[obtenerClaveHistoricaDestinoSintetico(destinoDefinido.syntheticId)];
    if (!destino || !referencia || referencia === "__EMPTY__") return;
    const personaSolicitada = resolverPersonaDesdeReferencia(referencia, personalDisponible);
    const enfermero = resultado.find((fila) =>
      personasCompartenIdentidad(fila.enfermero, personaSolicitada)
    )?.enfermero;
    const identidad = obtenerClaveIdentidadPersona(enfermero);
    if (!enfermero || !identidad || personasSolicitadas.has(identidad)) return;
    const fuente = resultado.find((fila) =>
      obtenerClaveIdentidadPersona(fila.enfermero) === identidad
    );
    if (!fuente) return;
    personasSolicitadas.add(identidad);
    operaciones.push({ destino, fuente, enfermero, desplazado: destino.enfermero });
  });

  const destinosConCambio = new Set(operaciones.map(({ destino }) => destino.syntheticId));
  operaciones.forEach(({ fuente }) => { fuente.enfermero = null; });
  operaciones.forEach(({ destino, enfermero }) => { destino.enfermero = enfermero; });
  const paraReubicar = operaciones.map(({ desplazado }) => desplazado).filter((persona) =>
    persona && !personasSolicitadas.has(obtenerClaveIdentidadPersona(persona))
  );
  const asignadas = new Set(resultado.map((fila) =>
    obtenerClaveIdentidadPersona(fila.enfermero)
  ).filter(Boolean));
  operaciones.forEach(({ fuente }) => {
    if (destinosConCambio.has(fuente.syntheticId) || fuente.enfermero) return;
    const persona = paraReubicar.find((candidata) =>
      !asignadas.has(obtenerClaveIdentidadPersona(candidata))
    );
    if (!persona) return;
    fuente.enfermero = persona;
    asignadas.add(obtenerClaveIdentidadPersona(persona));
  });
  return resultado;
};

export const dividirReanimacionSillones = ({
  asignaciones = [],
  sobrantes = [],
  categoria,
  esDiaParo = false,
  cambiosDia = {},
  personalDisponible = [],
  ordenVisual = []
} = {}) => {
  const base = Array.isArray(asignaciones) ? asignaciones.map((fila) => ({ ...fila })) : [];
  const filaBase = base.find((fila) => fila?.sectorId === SECTOR_ID_REANIMACION_SILLONES);
  const hayHuecos = base.some((fila) => !fila.enfermero);
  const seDivide = categoria === "licenciado" &&
    !esDiaParo &&
    !hayHuecos &&
    Boolean(filaBase?.enfermero) &&
    Array.isArray(sobrantes) && sobrantes.length > 0;
  if (!seDivide) return { seDivide: false, asignaciones: base, ordenVisual: [...ordenVisual] };

  const sinteticas = [
    {
      nombre: "Reanimación",
      etiqueta: "Reanimación",
      syntheticId: SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION,
      enfermero: filaBase.enfermero,
      tipo: "sector"
    },
    {
      nombre: "Sillones",
      etiqueta: "Sillones",
      syntheticId: SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES,
      enfermero: sobrantes[0],
      tipo: "sector"
    },
    ...sobrantes.slice(1).map((enfermero) => ({
      nombre: "SIN ASIGNAR",
      enfermero,
      tipo: "sector"
    }))
  ];
  const asignacionesDivididas = aplicarCambiosSinteticos({
    asignaciones: [
      ...base.filter((fila) => fila?.sectorId !== SECTOR_ID_REANIMACION_SILLONES),
      ...sinteticas
    ],
    cambiosDia,
    personalDisponible
  });
  const ordenDividido = ordenVisual.flatMap((etiqueta) =>
    etiqueta === filaBase.nombre
      ? DESTINOS_SINTETICOS_REANIMACION_SILLONES.map((destino) => destino.etiqueta)
      : [etiqueta]
  );
  return { seDivide: true, asignaciones: asignacionesDivididas, ordenVisual: ordenDividido };
};
