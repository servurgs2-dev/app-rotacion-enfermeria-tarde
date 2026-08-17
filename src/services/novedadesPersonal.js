import { supabase } from "../supabase.js";
import { crearRepositorioNovedadesPersonal } from "./repositorioNovedadesPersonal.js";

const repositorio = crearRepositorioNovedadesPersonal(supabase);

export const listarNovedadesPersonal = (filtros) => repositorio.listar(filtros);
export const registrarNovedadPersonal = (novedad) => repositorio.crear(novedad);
