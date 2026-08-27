import { supabase } from "../supabase.js";
import { crearRepositorioMovimientoPadronBase } from "./repositorioMovimientoPadronBase.js";
import { crearServicioMovimientoPadronBase } from "./servicioMovimientoPadronBase.js";

const servicioMovimientoPadronBase = crearServicioMovimientoPadronBase(
  crearRepositorioMovimientoPadronBase({ cliente: supabase })
);

export const { moverPersonaPadronBaseTurnoMes } = servicioMovimientoPadronBase;
