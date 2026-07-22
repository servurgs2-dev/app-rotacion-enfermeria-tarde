import { TURNOS } from "../config/turnos.js";
import { supabase } from "../supabase.js";
import { normalizarEstadoMensual } from "../utils/estadoMensual.js";

const validarTurno = (turnoId) => {
  if (typeof turnoId !== "string" || !turnoId.trim()) {
    throw new TypeError("El turno debe ser un string no vacío.");
  }

  const turnoNormalizado = turnoId.trim();
  if (!Object.hasOwn(TURNOS, turnoNormalizado)) {
    throw new RangeError(`El turno "${turnoNormalizado}" no es válido.`);
  }

  return turnoNormalizado;
};

const validarMes = (mes) => {
  if (typeof mes !== "string" || !mes.trim()) {
    throw new TypeError("El mes debe ser un string no vacío.");
  }

  return mes.trim();
};

export const crearRepositorioEstadoPorTurnoMes = (
  clienteSupabase,
  obtenerFechaActual = () => new Date().toISOString()
) => {
  const cargarEstadoPorTurnoMes = async (turnoId, mes) => {
    const turnoValidado = validarTurno(turnoId);
    const mesValidado = validarMes(mes);

    const { data, error } = await clienteSupabase
      .from("estado_por_turno_mes")
      .select("*")
      .eq("turno", turnoValidado)
      .eq("mes", mesValidado)
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

  const guardarEstadoPorTurnoMes = async (turnoId, mes, estado) => {
    const turnoValidado = validarTurno(turnoId);
    const mesValidado = validarMes(mes);
    const updatedAt = obtenerFechaActual();

    const { error } = await clienteSupabase
      .from("estado_por_turno_mes")
      .upsert(
        {
          turno: turnoValidado,
          mes: mesValidado,
          data: estado,
          updated_at: updatedAt
        },
        { onConflict: "turno,mes" }
      );

    if (error) throw error;
  };

  const cargarEstadosTurnosPorMes = async (mes, turnos = Object.keys(TURNOS)) => {
    const mesValidado = validarMes(mes);
    const turnosValidados = turnos.map(validarTurno);
    const { data, error } = await clienteSupabase
      .from("estado_por_turno_mes")
      .select("turno, mes, data")
      .eq("mes", mesValidado)
      .in("turno", turnosValidados);

    if (error) throw error;
    return Object.fromEntries(
      (Array.isArray(data) ? data : [])
        .filter((fila) => fila?.data && turnosValidados.includes(fila.turno))
        .map((fila) => [fila.turno, normalizarEstadoMensual(fila.data)])
    );
  };

  return { cargarEstadoPorTurnoMes, guardarEstadoPorTurnoMes, cargarEstadosTurnosPorMes };
};

export const {
  cargarEstadoPorTurnoMes,
  guardarEstadoPorTurnoMes,
  cargarEstadosTurnosPorMes
} = crearRepositorioEstadoPorTurnoMes(supabase);
