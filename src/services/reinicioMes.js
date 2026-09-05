export const ejecutarReinicioMesCompleto = async ({
  guardar,
  crearEstadoVacio,
  turnoId,
  mes,
  revisionEsperada
} = {}) => {
  if (typeof guardar !== "function") {
    throw new TypeError("Se requiere un guardado mensual con control de revisión.");
  }
  if (typeof crearEstadoVacio !== "function") {
    throw new TypeError("Se requiere el constructor del estado mensual vacío.");
  }

  const estado = crearEstadoVacio();
  const persistencia = await guardar({ turnoId, mes, estado, revisionEsperada });
  return { estado, persistencia, aplicado: persistencia?.tipo === "guardado" };
};
