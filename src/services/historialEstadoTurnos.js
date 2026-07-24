import { supabase } from "../supabase.js";
import { compararSnapshotsMensuales } from "../utils/diferenciasHistorial.js";
import { crearRepositorioHistorialEstadoTurnoMes } from "./repositorioHistorialEstadoTurnoMes.js";

export const crearServicioHistorialEstadoTurnos = (clienteSupabase) => {
  const repositorio = crearRepositorioHistorialEstadoTurnoMes(clienteSupabase);
  return {
    listarHistorial: repositorio.listarHistorial,
    cargarRevisionHistorial: repositorio.cargarRevisionHistorial,
    compararRevisiones: compararSnapshotsMensuales,
    restaurarRevision: repositorio.restaurarRevision
  };
};

export const {
  listarHistorial,
  cargarRevisionHistorial,
  compararRevisiones,
  restaurarRevision
} = crearServicioHistorialEstadoTurnos(supabase);
