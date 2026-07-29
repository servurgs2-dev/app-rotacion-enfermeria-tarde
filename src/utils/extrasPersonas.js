import {
  referenciaIdentificaPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import {
  crearIdPersonaNueva,
  crearHashDeterministaIdentidad,
  normalizarFuncionarioIdentidad
} from "./identidadPersonas.js";
import { normalizar } from "./texto.js";
import {
  limpiarNombrePersona,
  normalizarNombrePersona
} from "./nombresPersonas.js";

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

const obtenerPersonaIdExtra = (extra) =>
  String(extra?.personaId ?? (!extra?.temporal ? extra?.id : "") ?? "").trim();

const esExtraManual = (extra) =>
  extra?.origenExtra === "manual" || extra?.temporal === true;

export const buscarExtraDuplicado = (lista, candidato) => {
  const extras = Array.isArray(lista) ? lista : [];
  const personaId = obtenerPersonaIdExtra(candidato);
  if (personaId) {
    return extras.find((extra) => obtenerPersonaIdExtra(extra) === personaId) || null;
  }

  const funcionario = normalizarFuncionarioIdentidad(candidato?.funcionario);
  if (funcionario) {
    return extras.find(
      (extra) =>
        esExtraManual(extra) &&
        normalizarFuncionarioIdentidad(extra?.funcionario) === funcionario
    ) || null;
  }

  const nombre = normalizarNombrePersona(candidato?.nombre);
  return extras.find(
    (extra) =>
      esExtraManual(extra) &&
      !normalizarFuncionarioIdentidad(extra?.funcionario) &&
      normalizarNombrePersona(extra?.nombre) === nombre
  ) || null;
};

export const crearExtraTemporal = ({
  nombre,
  funcionario = "",
  categoria,
  personal = [],
  extrasDia = [],
  crearId = crearIdPersonaNueva
}) => {
  const nombreLimpio = limpiarNombrePersona(nombre);
  const nombreNormalizado = normalizarNombrePersona(nombreLimpio);
  const funcionarioNormalizado = normalizarFuncionarioIdentidad(funcionario);
  const nombreRepetidoEnPersonal = Boolean(nombreNormalizado) &&
    (Array.isArray(personal) ? personal : []).some(
    (persona) => normalizarNombrePersona(persona?.nombre) === nombreNormalizado
  );
  const extraDuplicado = buscarExtraDuplicado(extrasDia, {
    nombre: nombreLimpio,
    funcionario: funcionarioNormalizado,
    origenExtra: "manual",
    temporal: true
  });
  const nombreRepetido = nombreRepetidoEnPersonal || Boolean(extraDuplicado);

  if (!nombreNormalizado || nombreRepetido) {
    return {
      extra: null,
      error: extraDuplicado
        ? "Esta persona ya está agregada como Extra para esta fecha."
        : nombreRepetido
        ? "Ya existe una persona con ese nombre para este día. Agregá el segundo apellido para diferenciarla."
        : "Ingresá un nombre válido."
    };
  }

  return {
    extra: {
      id: crearId({ nombre: nombreLimpio, funcionario: funcionarioNormalizado }),
      personaId: null,
      nombre: nombreLimpio,
      funcionario: funcionarioNormalizado,
      categoria,
      libre: null,
      temporal: true,
      origenExtra: "manual",
      turnoOrigen: "",
      creadoEn: new Date().toISOString()
    },
    error: ""
  };
};

export const crearExtraDesdePersonal = ({
  persona,
  turnoOrigen,
  categoria,
  extrasDia = [],
  creadoEn = new Date().toISOString()
}) => {
  const personaId = String(persona?.id ?? "").trim();
  if (!personaId || persona?.categoria !== categoria || !turnoOrigen) {
    return { extra: null, error: "La persona seleccionada no es válida." };
  }
  const extra = {
    id: personaId,
    personaId,
    nombre: persona.nombre,
    funcionario: String(persona.funcionario ?? "").trim(),
    categoria,
    origenExtra: "personal_otro_turno",
    turnoOrigen,
    creadoEn
  };
  return buscarExtraDuplicado(extrasDia, extra)
    ? { extra: null, error: "Esta persona ya está agregada como Extra para esta fecha." }
    : { extra, error: "" };
};

export const obtenerDescripcionExtra = (
  extra,
  obtenerNombreTurno = (turno) => turno
) => {
  const partes = extra?.origenExtra === "personal_otro_turno"
    ? ["Personal de otro turno", obtenerNombreTurno(extra.turnoOrigen)]
    : ["Extra manual"];
  const funcionario = String(extra?.funcionario ?? "").trim();
  if (funcionario) partes.push(`Func. ${funcionario}`);
  return partes.filter(Boolean).join(" · ");
};

export const prepararCandidatosExtraOtroTurno = ({
  candidatos,
  categoria,
  turnoActivo
}) =>
  (Array.isArray(candidatos) ? candidatos : [])
    .filter(
      (candidato) =>
        candidato?.persona?.categoria === categoria &&
        candidato.turnoOrigen &&
        candidato.turnoOrigen !== turnoActivo
    )
    .map((candidato) => {
      const funcionario = String(candidato.persona.funcionario ?? "").trim();
      return {
        ...candidato,
        etiqueta: [
          candidato.persona.nombre,
          funcionario ? `Func. ${funcionario}` : "",
          candidato.turnoNombre
        ].filter(Boolean).join(" · ")
      };
    })
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));

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

  const extraId = String(extra.personaId ?? extra.id ?? "").trim();
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
  if (
    !extraId ||
    extras.some((actual) => obtenerIdPersona(actual) === extraId) ||
    buscarExtraDuplicado(extras, extra)
  ) {
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
