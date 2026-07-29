import { normalizar } from "./texto.js";

export const obtenerSectoresCriticosSinCobertura = ({
  asignaciones,
  sectoresCriticos
} = {}) => {
  const criticosConfigurados = new Map(
    (Array.isArray(sectoresCriticos) ? sectoresCriticos : [])
      .map((sector) => [normalizar(sector), sector])
      .filter(([clave]) => Boolean(clave))
  );
  const encontrados = new Set();

  (Array.isArray(asignaciones) ? asignaciones : []).forEach((asignacion) => {
    const clave = normalizar(asignacion?.nombre);
    if (
      !clave ||
      asignacion?.tipo === "divider" ||
      asignacion?.tipo === "turnante" ||
      clave === normalizar("SIN ASIGNAR") ||
      asignacion?.enfermero ||
      !criticosConfigurados.has(clave)
    ) {
      return;
    }
    encontrados.add(clave);
  });

  return [...criticosConfigurados.entries()]
    .filter(([clave]) => encontrados.has(clave))
    .map(([, sector]) => sector);
};

export const formatearAlertaSectoresCriticos = (sectores) => {
  const lista = Array.isArray(sectores) ? sectores.filter(Boolean) : [];
  if (lista.length === 0) return "";
  const nombres = new Intl.ListFormat("es", {
    style: "long",
    type: "conjunction"
  }).format(lista);
  return lista.length === 1
    ? `Sector crítico sin cobertura: ${nombres}`
    : `Sectores críticos sin cobertura: ${nombres}`;
};
