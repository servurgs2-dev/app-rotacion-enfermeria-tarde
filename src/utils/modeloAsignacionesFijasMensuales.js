const textoId = (valor) => String(valor ?? "").trim();

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const compararAsignaciones = (a, b) =>
  a.sectorId.localeCompare(b.sectorId) || a.personaId.localeCompare(b.personaId);

export const normalizarAsignacionesFijasMensuales = (asignaciones) => {
  if (!Array.isArray(asignaciones)) return [];

  const unicas = new Map();
  asignaciones.forEach((asignacion) => {
    if (!esObjeto(asignacion)) return;
    const sectorId = textoId(asignacion.sectorId);
    const personaId = textoId(asignacion.personaId);
    if (!sectorId || !personaId) return;
    const normalizada = { sectorId, personaId };
    unicas.set(`${sectorId}\u0000${personaId}`, normalizada);
  });

  return [...unicas.values()].sort(compararAsignaciones);
};
