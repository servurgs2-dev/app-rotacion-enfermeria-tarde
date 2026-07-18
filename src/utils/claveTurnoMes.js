export const crearClaveTurnoMes = (turnoId, mes) => {
  if (typeof turnoId !== "string" || !turnoId.trim()) {
    throw new TypeError("El turno debe ser un string no vacío.");
  }

  if (typeof mes !== "string" || !mes.trim()) {
    throw new TypeError("El mes debe ser un string no vacío.");
  }

  return `${turnoId.trim()}|${mes.trim()}`;
};
