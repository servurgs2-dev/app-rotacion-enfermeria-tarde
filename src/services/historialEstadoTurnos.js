import { supabase } from "../supabase.js";
import { compararSnapshotsMensuales } from "../utils/diferenciasHistorial.js";
import { crearRepositorioHistorialEstadoTurnoMes } from "./repositorioHistorialEstadoTurnoMes.js";
import { puedeMutarPeriodoMensual } from "../utils/proteccionTemporalMensual.js";

export const crearServicioHistorialEstadoTurnos = (clienteSupabase) => {
  const repositorio = crearRepositorioHistorialEstadoTurnoMes(clienteSupabase);
  const restaurarRevision = ({ mes, mesReferencia, ...argumentos } = {}) => {
    if (!puedeMutarPeriodoMensual({ mes, mesReferencia })) {
      return Promise.resolve({ tipo: "periodo_protegido" });
    }
    return repositorio.restaurarRevision(argumentos);
  };
  return {
    listarHistorial: repositorio.listarHistorial,
    cargarRevisionHistorial: repositorio.cargarRevisionHistorial,
    cargarRevisionAnterior: repositorio.cargarRevisionHistorialPorContexto,
    compararRevisiones: compararSnapshotsMensuales,
    restaurarRevision
  };
};

export const {
  listarHistorial,
  cargarRevisionHistorial,
  cargarRevisionAnterior,
  compararRevisiones,
  restaurarRevision
} = crearServicioHistorialEstadoTurnos(supabase);
