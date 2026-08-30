import {
  resolverAsignacionPorSectorId
} from "./resolucionIdentidadesPlanilla.js";
import { normalizar } from "./texto.js";
import { VACANTE_OPERATIVA } from "./cambiosCalendario.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { personasCompartenIdentidad } from "./identidadPersonas.js";

export const PROCEDENCIA_REDISTRIBUCION_AUTOMATICA = "redistribucion_automatica";

export const PAREJAS_COBERTURA_ENFERMEROS = Object.freeze([
  Object.freeze({ destinoSectorId: "rea_1", origenSectorId: "rea_2" }),
  Object.freeze({ destinoSectorId: "explora_1", origenSectorId: "explora_2" }),
  Object.freeze({ destinoSectorId: "sillon_1", origenSectorId: "sillon_2" }),
  Object.freeze({ destinoSectorId: "pre_int_1", origenSectorId: "pre_int_2" })
]);

const crearDistribucionAsignaciones = (asignaciones) => Object.fromEntries(
  asignaciones.flatMap((asignacion) =>
    typeof asignacion?.nombre === "string" && asignacion.nombre
      ? [[asignacion.nombre, asignacion]]
      : []
  )
);

const normalizarClaves = (objeto) => Object.fromEntries(
  Object.entries(objeto || {})
    .filter(([, valor]) => valor !== VACANTE_OPERATIVA)
    .map(([clave, valor]) => [normalizar(clave), valor])
);

const resolverAsignacionPareja = ({ asignaciones, sectorId, distribucion, contexto }) => {
  const enriquecida = asignaciones.find((asignacion) => asignacion?.sectorId === sectorId);
  if (enriquecida) return { referencia: enriquecida };
  return resolverAsignacionPorSectorId({ ...contexto, distribucion, sectorId });
};

export const aplicarPrioridadCoberturaParejas = ({
  asignaciones,
  distribucionBase,
  personal = [],
  cambiosDia = {},
  procedenciaCambiosDia = {},
  esPersonaDisponible = () => true,
  estadoMensual,
  turno = "legacy",
  categoria = "enfermero",
  mes = "legacy"
}) => {
  if (!Array.isArray(asignaciones)) return [];
  const resultado = asignaciones.map((asignacion) => ({ ...asignacion }));
  if (categoria !== "enfermero") return resultado;

  const contexto = { estadoMensual, turno, categoria, mes };
  const distribucion = crearDistribucionAsignaciones(resultado);
  const cambiosNormalizados = normalizarClaves(cambiosDia);
  const procedenciasNormalizadas = Object.fromEntries(
    Object.entries(procedenciaCambiosDia || {}).map(([clave, valor]) => [normalizar(clave), valor])
  );
  const esCambioProtegido = (resuelto) => {
    if (!resuelto) return false;
    return procedenciasNormalizadas[normalizar(resuelto.claveDistribucion)] !==
      PROCEDENCIA_REDISTRIBUCION_AUTOMATICA;
  };

  PAREJAS_COBERTURA_ENFERMEROS.forEach(({ destinoSectorId, origenSectorId }) => {
    const destinoResuelto = resolverAsignacionPareja({
      asignaciones: resultado, contexto, distribucion, sectorId: destinoSectorId
    });
    const origenResuelto = resolverAsignacionPareja({
      asignaciones: resultado, contexto, distribucion, sectorId: origenSectorId
    });
    if (!destinoResuelto || !origenResuelto) return;

    const cambioDestino = resolverAsignacionPorSectorId({
      ...contexto, distribucion: cambiosNormalizados, sectorId: destinoSectorId
    });
    const cambioOrigen = resolverAsignacionPorSectorId({
      ...contexto, distribucion: cambiosNormalizados, sectorId: origenSectorId
    });
    if (esCambioProtegido(cambioDestino) || esCambioProtegido(cambioOrigen)) return;

    const destino = destinoResuelto.referencia;
    const origenFisico = origenResuelto.referencia;
    const originalResuelto = resolverAsignacionPorSectorId({
      ...contexto, distribucion: distribucionBase, sectorId: origenSectorId
    });
    const personaOriginal = resolverPersonaDesdeReferencia(
      originalResuelto?.referencia,
      personal
    );
    const ubicacionActual = personaOriginal
      ? resultado.find((fila) => personasCompartenIdentidad(fila?.enfermero, personaOriginal))
      : null;
    const origen = ubicacionActual || origenFisico;
    const cambioUbicacion = ubicacionActual
      ? cambiosNormalizados[normalizar(ubicacionActual.nombre)]
      : null;
    const ubicacionProtegida = cambioUbicacion &&
      procedenciasNormalizadas[normalizar(ubicacionActual.nombre)] !==
        PROCEDENCIA_REDISTRIBUCION_AUTOMATICA;
    if (
      destino.enfermero ||
      destino.vacioManual ||
      ubicacionProtegida ||
      !origen.enfermero ||
      !esPersonaDisponible(origen.enfermero)
    ) return;

    destino.enfermero = origen.enfermero;
    destino.coberturaDesdePareja = origen.nombre;
    destino.origenLogicoPareja = origenSectorId;
    destino.origenCoberturaAutomaticaSectorId = origenSectorId;
    origen.enfermero = null;
    delete origen.origenCoberturaAutomaticaSectorId;
    origen.cedidoAPareja = destino.nombre;
  });

  return resultado;
};
