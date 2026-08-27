import { supabase } from "../supabase.js";
import { crearRepositorioVigenciasTurnoPersonal } from "./repositorioVigenciasTurnoPersonal.js";
import { crearServicioVigenciasTurnoPersonal } from "./servicioVigenciasTurnoPersonal.js";

const servicioVigenciasTurnoPersonal = crearServicioVigenciasTurnoPersonal(
  crearRepositorioVigenciasTurnoPersonal(supabase)
);

export const {
  cargarVigenciasTurnoPersonaMes,
  cargarVigenciasTurnoMes,
  guardarVigenciasTurnoPersonaMes,
  guardarVigenciasTurnoPersonaMesTurnoPropio,
  eliminarVigenciasTurnoPersonaMes
} = servicioVigenciasTurnoPersonal;
