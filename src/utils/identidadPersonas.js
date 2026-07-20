import { normalizar } from "./texto.js";

export const normalizarFuncionarioIdentidad = (funcionario) =>
  String(funcionario ?? "").trim().replace(/\s+/g, "");

const normalizarNombreIdentidad = (nombre) =>
  (normalizar(nombre) || "").replace(/\s+/g, " ");

export const obtenerClaveIdentidadPersona = (persona) => {
  if (!persona || typeof persona !== "object" || Array.isArray(persona)) return "";

  const id = String(persona.id ?? "").trim();
  if (id) return `id:${id}`;

  const funcionario = normalizarFuncionarioIdentidad(persona.funcionario);
  if (funcionario) return `funcionario:${funcionario}`;

  const nombre = normalizarNombreIdentidad(persona.nombre);
  return nombre ? `nombre:${nombre}` : "";
};

export const personasCompartenIdentidad = (personaA, personaB) => {
  const claveA = obtenerClaveIdentidadPersona(personaA);
  const claveB = obtenerClaveIdentidadPersona(personaB);
  return Boolean(claveA && claveB && claveA === claveB);
};

export const crearHashDeterministaIdentidad = (texto) => {
  let hashA = 0xdeadbeef ^ texto.length;
  let hashB = 0x41c6ce57 ^ texto.length;

  for (let indice = 0; indice < texto.length; indice += 1) {
    const codigo = texto.charCodeAt(indice);
    hashA = Math.imul(hashA ^ codigo, 2654435761);
    hashB = Math.imul(hashB ^ codigo, 1597334677);
  }

  hashA = Math.imul(hashA ^ (hashA >>> 16), 2246822507) ^
    Math.imul(hashB ^ (hashB >>> 13), 3266489909);
  hashB = Math.imul(hashB ^ (hashB >>> 16), 2246822507) ^
    Math.imul(hashA ^ (hashA >>> 13), 3266489909);

  return `${(hashA >>> 0).toString(16).padStart(8, "0")}${
    (hashB >>> 0).toString(16).padStart(8, "0")
  }`;
};

export const crearIdDeterministaPersona = (persona) => {
  const funcionario = normalizarFuncionarioIdentidad(persona?.funcionario);
  const fuente = funcionario
    ? `funcionario:${funcionario}`
    : `nombre:${normalizarNombreIdentidad(persona?.nombre)}`;

  return `persona-h-${crearHashDeterministaIdentidad(fuente)}`;
};

const crearUuidSeguro = () => {
  const cryptoDisponible = globalThis.crypto;

  if (typeof cryptoDisponible?.randomUUID === "function") {
    return cryptoDisponible.randomUUID();
  }

  if (typeof cryptoDisponible?.getRandomValues === "function") {
    const bytes = cryptoDisponible.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hexadecimal = [...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${
      hexadecimal.slice(12, 16)
    }-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${
    Math.random().toString(36).slice(2)
  }`;
};

export const crearIdPersonaNueva = (persona) => {
  if (normalizarFuncionarioIdentidad(persona?.funcionario)) {
    return crearIdDeterministaPersona(persona);
  }

  return `persona-${crearUuidSeguro()}`;
};

export const asegurarIdPersona = (persona) => {
  if (!persona || typeof persona !== "object" || Array.isArray(persona)) {
    return persona;
  }

  const idExistente = String(persona.id ?? "").trim();
  return {
    ...persona,
    id: idExistente || crearIdDeterministaPersona(persona)
  };
};
