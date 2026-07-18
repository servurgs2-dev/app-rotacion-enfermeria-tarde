import { supabase } from "../supabase.js";
import { normalizarEstadoMensual } from "../utils/estadoMensual.js";

const validarMes = (mes) => {
  if (typeof mes !== "string" || !mes.trim()) {
    throw new TypeError("El mes debe ser un string no vacío.");
  }
};

export const crearRepositorioEstadoMensual = (clienteSupabase) => {
  const cargarEstadoMensual = async (mes) => {
    validarMes(mes);

    const { data, error } = await clienteSupabase
      .from("estado_por_mes")
      .select("*")
      .eq("mes", mes)
      .maybeSingle();

    if (error) throw error;

    if (!data?.data) {
      return { existe: false, estado: null };
    }

    return {
      existe: true,
      estado: normalizarEstadoMensual(data.data)
    };
  };

  const guardarEstadoMensual = async (mes, estado) => {
    validarMes(mes);

    const { error } = await clienteSupabase
      .from("estado_por_mes")
      .upsert({ mes, data: estado }, { onConflict: "mes" });

    if (error) throw error;
  };

  return { cargarEstadoMensual, guardarEstadoMensual };
};

export const {
  cargarEstadoMensual,
  guardarEstadoMensual
} = crearRepositorioEstadoMensual(supabase);
