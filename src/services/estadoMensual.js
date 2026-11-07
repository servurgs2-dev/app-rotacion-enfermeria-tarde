import { supabase } from "../supabase.js";
import { normalizarEstadoMensual } from "../utils/estadoMensual.js";
import { validarMes as validarMesCentral } from "../utils/periodosMensuales.js";
import { proyectarMesesEstadoMensualLegacy } from "../utils/descubrimientoMeses.js";

const validarMes = (mes) => {
  validarMesCentral(mes);
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

  const listarMesesEstadoMensual = async () => {
    const { data, error } = await clienteSupabase
      .from("estado_por_mes")
      .select("mes");

    if (error) throw error;
    return proyectarMesesEstadoMensualLegacy(data);
  };

  return { cargarEstadoMensual, guardarEstadoMensual, listarMesesEstadoMensual };
};

export const {
  cargarEstadoMensual,
  guardarEstadoMensual,
  listarMesesEstadoMensual
} = crearRepositorioEstadoMensual(supabase);
