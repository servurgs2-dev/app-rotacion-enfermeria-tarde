import {
  resolverAsignacionPorSectorId
} from "./resolucionIdentidadesPlanilla.js";
import { normalizar } from "./texto.js";

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
  Object.entries(objeto || {}).map(([clave, valor]) => [normalizar(clave), valor])
);

export const aplicarPrioridadCoberturaParejas = ({
  asignaciones,
  cambiosDia = {},
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

  PAREJAS_COBERTURA_ENFERMEROS.forEach(({ destinoSectorId, origenSectorId }) => {
    const destinoResuelto = resolverAsignacionPorSectorId({
      ...contexto, distribucion, sectorId: destinoSectorId
    });
    const origenResuelto = resolverAsignacionPorSectorId({
      ...contexto, distribucion, sectorId: origenSectorId
    });
    if (!destinoResuelto || !origenResuelto) return;

    const cambioDestino = resolverAsignacionPorSectorId({
      ...contexto, distribucion: cambiosNormalizados, sectorId: destinoSectorId
    });
    const cambioOrigen = resolverAsignacionPorSectorId({
      ...contexto, distribucion: cambiosNormalizados, sectorId: origenSectorId
    });
    if (cambioDestino || cambioOrigen) return;

    const destino = destinoResuelto.referencia;
    const origen = origenResuelto.referencia;
    if (
      destino.enfermero ||
      destino.vacioManual ||
      !origen.enfermero ||
      !esPersonaDisponible(origen.enfermero)
    ) return;

    destino.enfermero = origen.enfermero;
    destino.coberturaDesdePareja = origen.nombre;
    origen.enfermero = null;
    origen.cedidoAPareja = destino.nombre;
  });

  return resultado;
};
