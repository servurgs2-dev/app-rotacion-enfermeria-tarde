import { TURNOS } from "../config/turnos.js";
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
  if (
    typeof mes !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes.trim())
  ) {
    throw new TypeError("El mes debe tener formato YYYY-MM.");
  }

  return mes.trim();
};

export const normalizarRevisionConcurrencia = (
  revision,
  { permitirCero = true } = {}
) => {
  const revisionTexto =
    typeof revision === "bigint"
      ? revision.toString()
      : typeof revision === "number" && Number.isSafeInteger(revision)
        ? String(revision)
        : typeof revision === "string"
          ? revision.trim()
          : "";

  if (!/^\d+$/.test(revisionTexto)) {
    throw new TypeError("La revisión debe ser un entero decimal no negativo.");
  }

  const revisionNormalizada = revisionTexto.replace(/^0+(?=\d)/, "");
  if (!permitirCero && revisionNormalizada === "0") {
    throw new RangeError("Una fila existente debe tener revisión 1 o superior.");
  }

  return revisionNormalizada;
};

export const interpretarRespuestaGuardadoConRevision = (respuesta) => {
  const contenido = Array.isArray(respuesta) ? respuesta[0] : respuesta;
  if (!contenido || typeof contenido !== "object") {
    throw new Error("La RPC de guardado devolvió una respuesta vacía.");
  }

  if (contenido.resultado === "guardado") {
    return {
      tipo: "guardado",
      revision: normalizarRevisionConcurrencia(contenido.revision, {
        permitirCero: false
      }),
      updatedAt:
        typeof contenido.updated_at === "string" ? contenido.updated_at : null,
      estadoRemoto: null
    };
  }

  if (contenido.resultado === "conflicto") {
    const existeRemoto = contenido.existe === true;
    return {
      tipo: "conflicto",
      existeRemoto,
      revision: normalizarRevisionConcurrencia(
        existeRemoto ? contenido.revision : "0",
        { permitirCero: !existeRemoto }
      ),
      updatedAt:
        existeRemoto && typeof contenido.updated_at === "string"
          ? contenido.updated_at
          : null,
      estadoRemoto:
        existeRemoto && contenido.data
          ? normalizarEstadoMensual(contenido.data)
          : null
    };
  }

  throw new Error("La RPC de guardado devolvió un resultado desconocido.");
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
      .select("turno, mes, data, updated_at")
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

  const cargarEstadoPorTurnoMesConRevision = async (turnoId, mes) => {
    const turnoValidado = validarTurno(turnoId);
    const mesValidado = validarMes(mes);

    const { data, error } = await clienteSupabase
      .from("estado_por_turno_mes")
      .select("turno, mes, data, revision, updated_at")
      .eq("turno", turnoValidado)
      .eq("mes", mesValidado)
      .maybeSingle();

    if (error) throw error;

    if (!data?.data) {
      return {
        existe: false,
        estado: null,
        revision: "0",
        updatedAt: null
      };
    }

    return {
      existe: true,
      estado: normalizarEstadoMensual(data.data),
      revision: normalizarRevisionConcurrencia(data.revision, {
        permitirCero: false
      }),
      updatedAt: typeof data.updated_at === "string" ? data.updated_at : null
    };
  };

  // Implementación heredada: App la reemplazará por el guardado versionado en 23C.
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

  const guardarEstadoTurnoMesConRevision = async ({
    turnoId,
    mes,
    estado,
    revisionEsperada
  }) => {
    const turnoValidado = validarTurno(turnoId);
    const mesValidado = validarMes(mes);
    const revisionValidada = normalizarRevisionConcurrencia(revisionEsperada);

    const { data, error } = await clienteSupabase.rpc(
      "guardar_estado_turno_mes_si_revision",
      {
        p_turno: turnoValidado,
        p_mes: mesValidado,
        p_data: estado,
        p_revision_esperada: revisionValidada
      }
    );

    if (error) throw error;
    return interpretarRespuestaGuardadoConRevision(data);
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

  return {
    cargarEstadoPorTurnoMes,
    cargarEstadoPorTurnoMesConRevision,
    guardarEstadoPorTurnoMes,
    guardarEstadoTurnoMesConRevision,
    cargarEstadosTurnosPorMes
  };
};
