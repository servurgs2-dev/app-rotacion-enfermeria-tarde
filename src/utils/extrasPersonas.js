import {
  referenciaIdentificaPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import {
  crearHashDeterministaIdentidad,
  normalizarFuncionarioIdentidad
} from "./identidadPersonas.js";
import { normalizar } from "./texto.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const obtenerIdPersona = (persona) => String(persona?.id ?? "").trim();

export const asegurarIdExtraHistorico = (
  extra,
  { fecha = "", categoria = "", indice = 0 } = {}
) => {
  if (!esObjeto(extra)) return extra;

  const idExistente = obtenerIdPersona(extra);
  if (idExistente) return { ...extra, id: idExistente };

  const categoriaExtra = String(categoria || extra.categoria).trim();
  const nombre = (normalizar(extra.nombre) || "").replace(/\s+/g, " ");
  const fuente = ["extra", categoriaExtra, fecha, indice, nombre].join(":");

  return {
    ...extra,
    id: `persona-extra-h-${crearHashDeterministaIdentidad(fuente)}`
  };
};

export const personasCompartenId = (personaA, personaB) => {
  const idA = obtenerIdPersona(personaA);
  const idB = obtenerIdPersona(personaB);
  return Boolean(idA && idB && idA === idB);
};

const obtenerCoincidenciaUnicaPorFuncionario = (funcionario, personal) => {
  const identidades = new Map();

  (Array.isArray(personal) ? personal : []).forEach((persona) => {
    if (normalizarFuncionarioIdentidad(persona?.funcionario) !== funcionario) return;
    const personaId = obtenerIdPersona(persona);
    if (personaId && !identidades.has(personaId)) identidades.set(personaId, persona);
  });

  return identidades.size === 1 ? [...identidades.values()][0] : null;
};

export const resolverPersonaPermanenteParaExtra = (extra, personal) => {
  if (!esObjeto(extra)) return null;

  const extraId = obtenerIdPersona(extra);
  if (extraId) {
    return resolverPersonaDesdeReferencia(
      { personaId: extraId, nombre: extra.nombre },
      personal
    );
  }

  const funcionario = normalizarFuncionarioIdentidad(extra.funcionario);
  if (funcionario) {
    const porFuncionario = obtenerCoincidenciaUnicaPorFuncionario(
      funcionario,
      personal
    );
    if (porFuncionario) return porFuncionario;
  }

  return resolverPersonaDesdeReferencia(extra.nombre, personal);
};

export const agregarExtraALista = (lista, extra) => {
  const extras = Array.isArray(lista) ? lista : [];
  const extraId = obtenerIdPersona(extra);
  if (!extraId || extras.some((actual) => obtenerIdPersona(actual) === extraId)) {
    return extras;
  }

  return [...extras, { ...extra, id: extraId }];
};

const limpiarCambiosDelExtra = (
  cambiosPorDia,
  fecha,
  extra,
  candidatos
) => {
  if (!esObjeto(cambiosPorDia) || !esObjeto(cambiosPorDia[fecha])) {
    return cambiosPorDia;
  }

  const cambiosFecha = cambiosPorDia[fecha];
  const cambiosLimpios = Object.fromEntries(
    Object.entries(cambiosFecha).filter(([, referencia]) =>
      !referenciaIdentificaPersona(referencia, extra, candidatos)
    )
  );

  return Object.keys(cambiosLimpios).length === Object.keys(cambiosFecha).length
    ? cambiosPorDia
    : { ...cambiosPorDia, [fecha]: cambiosLimpios };
};

export const eliminarExtraDelDia = ({
  calendarioCategoria,
  fecha,
  extra,
  personal = []
}) => {
  if (!esObjeto(calendarioCategoria) || !fecha) return calendarioCategoria;

  const extrasPorDia = esObjeto(calendarioCategoria.extras)
    ? calendarioCategoria.extras
    : {};
  const extrasFecha = Array.isArray(extrasPorDia[fecha])
    ? extrasPorDia[fecha]
    : [];
  const extraId = obtenerIdPersona(extra);
  if (!extraId || !extrasFecha.some((actual) => obtenerIdPersona(actual) === extraId)) {
    return calendarioCategoria;
  }

  const candidatos = [...(Array.isArray(personal) ? personal : []), ...extrasFecha];
  const extrasLimpios = extrasFecha.filter(
    (actual) => obtenerIdPersona(actual) !== extraId
  );
  const cambiosDia = limpiarCambiosDelExtra(
    calendarioCategoria.cambiosDia,
    fecha,
    extra,
    candidatos
  );
  const cambiosParoDia = limpiarCambiosDelExtra(
    calendarioCategoria.cambiosParoDia,
    fecha,
    extra,
    candidatos
  );

  return {
    ...calendarioCategoria,
    extras: { ...extrasPorDia, [fecha]: extrasLimpios },
    ...(cambiosDia !== calendarioCategoria.cambiosDia ? { cambiosDia } : {}),
    ...(cambiosParoDia !== calendarioCategoria.cambiosParoDia
      ? { cambiosParoDia }
      : {})
  };
};
