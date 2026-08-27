const TABLA = "vigencias_turno_personal_mes";
const RPC_GUARDAR = "guardar_vigencias_turno_personal_mes";
const RPC_GUARDAR_TURNO_PROPIO = "guardar_vigencias_turno_personal_mes_turno_propio";
const RPC_ELIMINAR = "eliminar_vigencias_turno_personal_mes";
const COLUMNAS = "mes, persona_id, vigencias, revision, creado_en, creado_por, actualizado_en, actualizado_por";

const validarCliente = (cliente) => {
  if (!cliente) throw new Error("Supabase no está configurado.");
};

export const crearRepositorioVigenciasTurnoPersonal = (cliente) => {
  const cargarFilaVigenciasTurnoPersonaMes = async ({ mes, personaId }) => {
    validarCliente(cliente);
    const { data, error } = await cliente
      .from(TABLA)
      .select(COLUMNAS)
      .eq("mes", mes)
      .eq("persona_id", personaId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  };

  const cargarFilasVigenciasTurnoMes = async (mes) => {
    validarCliente(cliente);
    const { data, error } = await cliente
      .from(TABLA)
      .select(COLUMNAS)
      .eq("mes", mes);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };

  const guardarFilaVigenciasTurnoPersonaMes = async ({
    mes,
    personaId,
    vigencias,
    revisionEsperada
  }) => {
    validarCliente(cliente);
    const { data, error } = await cliente.rpc(RPC_GUARDAR, {
      p_mes: mes,
      p_persona_id: personaId,
      p_vigencias: structuredClone(vigencias),
      p_revision_esperada: revisionEsperada
    });
    if (error) throw error;
    return data;
  };

  const eliminarFilaVigenciasTurnoPersonaMes = async ({
    mes,
    personaId,
    revisionEsperada
  }) => {
    validarCliente(cliente);
    const { data, error } = await cliente.rpc(RPC_ELIMINAR, {
      p_mes: mes,
      p_persona_id: personaId,
      p_revision_esperada: revisionEsperada
    });
    if (error) throw error;
    return data;
  };

  const guardarFilaVigenciasTurnoPersonaMesTurnoPropio = async ({
    mes,
    personaId,
    rangos,
    revisionEsperada
  }) => {
    validarCliente(cliente);
    const { data, error } = await cliente.rpc(RPC_GUARDAR_TURNO_PROPIO, {
      p_mes: mes,
      p_persona_id: personaId,
      p_rangos: structuredClone(rangos),
      p_revision_esperada: revisionEsperada
    });
    if (error) throw error;
    return data;
  };

  return {
    cargarFilaVigenciasTurnoPersonaMes,
    cargarFilasVigenciasTurnoMes,
    guardarFilaVigenciasTurnoPersonaMes,
    guardarFilaVigenciasTurnoPersonaMesTurnoPropio,
    eliminarFilaVigenciasTurnoPersonaMes
  };
};
