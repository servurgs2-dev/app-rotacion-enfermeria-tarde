export const obtenerSectoresCriticosSinCobertura = ({
  asignaciones,
  sectoresCriticosIds = [],
  sectoresCriticosLegacy = []
} = {}) => {
  const criticos = new Set(sectoresCriticosIds);
  const criticosLegacy = new Set(sectoresCriticosLegacy);
  return (Array.isArray(asignaciones) ? asignaciones : [])
    .filter((fila) => !fila?.enfermero && (
      fila?.tipo === "sector" && fila.sectorId
        ? criticos.has(fila.sectorId)
        : criticosLegacy.has(fila?.nombre)
    ))
    .map((fila) => fila.etiqueta || fila.nombre)
    .filter(Boolean);
};

export const formatearAlertaSectoresCriticos = (sectores) => {
  const lista = Array.isArray(sectores) ? sectores.filter(Boolean) : [];
  if (lista.length === 0) return "";
  const nombres = new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(lista);
  return lista.length === 1
    ? `Sector crítico sin cobertura: ${nombres}`
    : `Sectores críticos sin cobertura: ${nombres}`;
};
