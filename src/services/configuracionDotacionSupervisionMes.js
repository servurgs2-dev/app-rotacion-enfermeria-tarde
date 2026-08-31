import { supabase } from "../supabase.js";
import { crearRepositorioConfiguracionDotacionSupervisionMes } from "./repositorioConfiguracionDotacionSupervisionMes.js";
import { puedeMutarPeriodoMensual } from "../utils/proteccionTemporalMensual.js";

const repositorioConfiguracionDotacionSupervisionMes =
  crearRepositorioConfiguracionDotacionSupervisionMes(supabase);

export const cargarConfiguracionDotacionSupervisionEfectiva =
  repositorioConfiguracionDotacionSupervisionMes.cargarConfiguracionDotacionSupervisionEfectiva;

export const guardarConfiguracionDotacionSupervisionMes = (argumentos = {}) => {
  if (!puedeMutarPeriodoMensual({
    mes: argumentos.mes,
    mesReferencia: argumentos.mesReferencia
  })) {
    return Promise.resolve({ ok: false, codigo: "MES_FUERA_DE_VENTANA" });
  }
  return repositorioConfiguracionDotacionSupervisionMes
    .guardarConfiguracionDotacionSupervisionMes(argumentos);
};
