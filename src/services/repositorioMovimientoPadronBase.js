const RPC_MOVER = "mover_persona_padron_base_turno_mes";

const validarCliente = (cliente) => {
  if (!cliente || typeof cliente.rpc !== "function") {
    throw new Error("Supabase no está configurado.");
  }
};
export const crearRepositorioMovimientoPadronBase = ({ cliente } = {}) => {
  const moverPersonaPadronBaseTurnoMes = async ({
    mes,
    personaId,
    turnoOrigen,
    turnoDestino,
    revisionOrigenEsperada,
    revisionDestinoEsperada
  } = {}) => {
    validarCliente(cliente);
    const { data, error } = await cliente.rpc(RPC_MOVER, {
      p_mes: mes,
      p_persona_id: personaId,
      p_turno_origen: turnoOrigen,
      p_turno_destino: turnoDestino,
      p_revision_origen_esperada: revisionOrigenEsperada,
      p_revision_destino_esperada: revisionDestinoEsperada
    });
    if (error) throw error;
    return data;
  };

  return { moverPersonaPadronBaseTurnoMes };
};
