import { normalizarFuncionarioIdentidad } from "./identidadPersonas.js";

const obtenerId = (persona) => String(persona?.id ?? "").trim();

export const existeFuncionarioDuplicado = (
  personal,
  funcionario,
  personaIdExcluida = ""
) => {
  const buscado = normalizarFuncionarioIdentidad(funcionario);
  const idExcluido = String(personaIdExcluida ?? "").trim();
  if (!buscado) return false;

  return (Array.isArray(personal) ? personal : []).some(
    (persona) =>
      obtenerId(persona) !== idExcluido &&
      normalizarFuncionarioIdentidad(persona?.funcionario) === buscado
  );
};

export const obtenerIdsPersonalDuplicados = (personal) => {
  const cantidades = new Map();
  (Array.isArray(personal) ? personal : []).forEach((persona) => {
    const id = obtenerId(persona);
    if (id) cantidades.set(id, (cantidades.get(id) || 0) + 1);
  });

  return new Set(
    [...cantidades.entries()]
      .filter(([, cantidad]) => cantidad > 1)
      .map(([id]) => id)
  );
};

export const personaTieneIdDuplicado = (personal, persona) =>
  obtenerIdsPersonalDuplicados(personal).has(obtenerId(persona));

export const obtenerClaveRenderPersona = (
  persona,
  indice,
  idsDuplicados = new Set()
) => {
  const id = obtenerId(persona);
  return idsDuplicados.has(id) ? `${id}-duplicado-${indice}` : id;
};
