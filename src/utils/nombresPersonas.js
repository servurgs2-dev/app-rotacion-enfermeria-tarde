import { normalizar } from "./texto.js";

export const limpiarNombrePersona = (nombre) =>
  String(nombre ?? "").trim().replace(/\s+/g, " ");

export const normalizarNombrePersona = (nombre) =>
  (normalizar(limpiarNombrePersona(nombre)) || "").replace(/\s+/g, " ");

const obtenerId = (persona) => String(persona?.id ?? "").trim();

export const existeNombrePersona = (personal, nombre, personaIdExcluida = "") => {
  const buscado = normalizarNombrePersona(nombre);
  const idExcluida = String(personaIdExcluida ?? "").trim();
  if (!buscado) return false;

  return (Array.isArray(personal) ? personal : []).some(
    (persona) =>
      obtenerId(persona) !== idExcluida &&
      normalizarNombrePersona(persona?.nombre) === buscado
  );
};

export const obtenerNombresDuplicados = (personal) => {
  const cantidades = new Map();
  (Array.isArray(personal) ? personal : []).forEach((persona) => {
    const nombre = normalizarNombrePersona(persona?.nombre);
    if (nombre) cantidades.set(nombre, (cantidades.get(nombre) || 0) + 1);
  });
  return new Set(
    [...cantidades.entries()]
      .filter(([, cantidad]) => cantidad > 1)
      .map(([nombre]) => nombre)
  );
};

const etiquetaCategoria = (categoria) => {
  if (categoria === "enfermero") return "Enfermero";
  if (categoria === "licenciado") return "Licenciado";
  return limpiarNombrePersona(categoria);
};

export const obtenerEtiquetaPersona = (persona, personal) => {
  const nombre = limpiarNombrePersona(persona?.nombre);
  if (!obtenerNombresDuplicados(personal).has(normalizarNombrePersona(nombre))) {
    return nombre;
  }

  const funcionario = String(persona?.funcionario ?? "").trim();
  if (funcionario) return `${nombre} — Func. ${funcionario}`;

  const categoria = etiquetaCategoria(persona?.categoria);
  return categoria ? `${nombre} — ${categoria}` : nombre;
};
