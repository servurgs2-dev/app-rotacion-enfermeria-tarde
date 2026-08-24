import { supabase } from "../supabase.js";
import { crearRepositorioConfiguracionDotacionSupervisionMes } from "./repositorioConfiguracionDotacionSupervisionMes.js";

const repositorioConfiguracionDotacionSupervisionMes =
  crearRepositorioConfiguracionDotacionSupervisionMes(supabase);

export const {
  cargarConfiguracionDotacionSupervisionEfectiva
} = repositorioConfiguracionDotacionSupervisionMes;
