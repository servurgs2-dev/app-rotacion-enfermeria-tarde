import { supabase } from "../supabase.js";
import { crearRepositorioNovedadesPersonal } from "./repositorioNovedadesPersonal.js";
import { crearSincronizadorListaParo } from "./sincronizadorListaParo.js";
import {
  crearActualizadorEstadoNovedad,
  crearRegistradorOlvidoTarjeta
} from "./seguimientoNovedadesPersonal.js";
import { crearGuardadorCambioHorario } from "./cambiosHorarioPersonal.js";

const repositorio = crearRepositorioNovedadesPersonal(supabase);

export const listarNovedadesPersonal = (filtros) => repositorio.listar(filtros);
export const registrarNovedadPersonal = (novedad) => repositorio.crear(novedad);
export const cancelarNovedadPersonal = (id) => repositorio.cancelar(id);

export const sincronizarListaParo = crearSincronizadorListaParo(repositorio);
export const registrarOlvidoTarjeta = crearRegistradorOlvidoTarjeta(repositorio);
export const actualizarEstadoNovedadPersonal = crearActualizadorEstadoNovedad(repositorio);
export const guardarCambioHorarioPersonal = crearGuardadorCambioHorario(repositorio);
