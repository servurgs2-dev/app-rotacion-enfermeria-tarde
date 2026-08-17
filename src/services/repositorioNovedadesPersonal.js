const mapearFila = (fila) => ({
  id: fila.id,
  personaId: fila.persona_id,
  personaNombre: fila.persona_nombre,
  tipo: fila.tipo,
  fechaDesde: fila.fecha_desde,
  fechaHasta: fila.fecha_hasta,
  turno: fila.turno,
  categoria: fila.categoria,
  observacion: fila.observacion || "",
  afectaDisponibilidad: fila.afecta_disponibilidad === true,
  requiereSeguimiento: fila.requiere_seguimiento === true,
  estado: fila.estado,
  datos: fila.datos || {},
  creadoEn: fila.created_at,
  actualizadoEn: fila.updated_at,
  origen: "novedades_personal",
  soloLectura: false
});

const crearPayload = (novedad) => ({
  persona_id: novedad.personaId,
  persona_nombre: novedad.personaNombre,
  tipo: novedad.tipo,
  fecha_desde: novedad.fechaDesde,
  fecha_hasta: novedad.fechaHasta,
  turno: novedad.turno,
  categoria: novedad.categoria,
  observacion: novedad.observacion,
  afecta_disponibilidad: novedad.afectaDisponibilidad,
  requiere_seguimiento: novedad.requiereSeguimiento,
  estado: novedad.estado,
  datos: novedad.datos
});

export const crearRepositorioNovedadesPersonal = (cliente) => ({
  async listar({ fechaDesde, fechaHasta } = {}) {
    if (!cliente) throw new Error("Supabase no está configurado.");
    let consulta = cliente
      .from("novedades_personal")
      .select("*")
      .order("fecha_desde", { ascending: false })
      .order("created_at", { ascending: false });
    if (fechaHasta) consulta = consulta.lte("fecha_desde", fechaHasta);
    if (fechaDesde) consulta = consulta.gte("fecha_hasta", fechaDesde);
    const { data, error } = await consulta;
    if (error) throw error;
    return (data || []).map(mapearFila);
  },

  async crear(novedad) {
    if (!cliente) throw new Error("Supabase no está configurado.");
    const { data, error } = await cliente
      .from("novedades_personal")
      .insert(crearPayload(novedad))
      .select("*")
      .single();
    if (error) throw error;
    return mapearFila(data);
  },

  async cancelar(id) {
    if (!cliente) throw new Error("Supabase no estÃ¡ configurado.");
    if (!String(id || "").trim()) throw new Error("La novedad no es vÃ¡lida.");
    const { data, error } = await cliente
      .from("novedades_personal")
      .update({ estado: "cancelada" })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapearFila(data);
  }
});
