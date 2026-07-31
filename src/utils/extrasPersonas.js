import {
  referenciaIdentificaPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import {
  crearIdPersonaNueva,
  crearHashDeterministaIdentidad,
  obtenerClaveIdentidadPersona,
  personasCompartenIdentidad,
  normalizarFuncionarioIdentidad
} from "./identidadPersonas.js";
import { normalizar } from "./texto.js";
import {
  limpiarNombrePersona,
  normalizarNombrePersona
} from "./nombresPersonas.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const TIPOS_EXTRA = Object.freeze({
  COBERTURA: "cobertura",
  REFUERZO: "refuerzo"
});

export const obtenerTipoExtra = (extra) =>
  extra?.tipoExtra === TIPOS_EXTRA.COBERTURA
    ? TIPOS_EXTRA.COBERTURA
    : TIPOS_EXTRA.REFUERZO;

export const esExtraCobertura = (extra) =>
  obtenerTipoExtra(extra) === TIPOS_EXTRA.COBERTURA;

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

export const normalizarExtraCompatible = (
  extra,
  { fecha = "", categoria = "", indice = 0 } = {}
) => {
  if (typeof extra === "string") {
    const nombre = limpiarNombrePersona(extra);
    if (!nombre) return extra;
    return asegurarIdExtraHistorico({
      nombre,
      personaId: null,
      categoria,
      temporal: true,
      origenExtra: "historico",
      tipoExtra: TIPOS_EXTRA.REFUERZO
    }, { fecha, categoria, indice });
  }
  if (!esObjeto(extra)) return extra;
  return {
    ...extra,
    tipoExtra: obtenerTipoExtra(extra)
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
  if (esExtraCobertura(extra)) {
    const cubierta = String(extra?.personaCubiertaNombre || "").trim() ||
      "persona no identificada";
    const sector = String(extra?.sectorCubiertoNombre || "").trim();
    return `Cubre a ${cubierta}${sector ? ` — ${sector}` : ""}`;
  }
  const partes = extra?.origenExtra === "personal_otro_turno"
    ? ["Refuerzo", "Personal de otro turno", obtenerNombreTurno(extra.turnoOrigen)]
    : ["Refuerzo", "Extra manual"];
  const funcionario = String(extra?.funcionario ?? "").trim();
  if (funcionario) partes.push(`Func. ${funcionario}`);
  return partes.filter(Boolean).join(" · ");
};

export const resolverPersonaCubiertaExtra = (extra, personal = []) => {
  if (!esExtraCobertura(extra)) return null;
  return resolverPersonaDesdeReferencia({
    personaId: String(extra?.personaCubiertaId || "").trim(),
    nombre: String(extra?.personaCubiertaNombre || "").trim()
  }, personal);
};

export const obtenerIdentidadesPersonasCubiertas = (extras, personal = []) =>
  new Set(
    (Array.isArray(extras) ? extras : [])
      .map((extra) => resolverPersonaCubiertaExtra(extra, personal))
      .map(obtenerClaveIdentidadPersona)
      .filter(Boolean)
  );

export const configurarTipoExtra = ({
  extra,
  tipoExtra = TIPOS_EXTRA.COBERTURA,
  personaCubierta,
  sectorCubierto = "",
  extrasDia = [],
  personal = []
} = {}) => {
  if (!extra) return { extra: null, error: "Ingresá un Extra válido." };
  if (tipoExtra === TIPOS_EXTRA.REFUERZO) {
    return { extra: { ...extra, tipoExtra: TIPOS_EXTRA.REFUERZO }, error: "" };
  }
  if (!personaCubierta || !String(sectorCubierto).trim()) {
    return { extra: null, error: "Seleccioná a quién cubre este extra." };
  }
  if (extra.categoria !== personaCubierta.categoria) {
    return { extra: null, error: "La persona seleccionada no corresponde a esta categoría." };
  }
  if (personasCompartenIdentidad(extra, personaCubierta)) {
    return { extra: null, error: "El extra no puede cubrirse a sí mismo." };
  }
  const identidadCubierta = obtenerClaveIdentidadPersona(personaCubierta);
  const yaCubierta = obtenerIdentidadesPersonasCubiertas(extrasDia, personal)
    .has(identidadCubierta);
  if (!identidadCubierta || yaCubierta) {
    return {
      extra: null,
      error: yaCubierta
        ? `${personaCubierta.nombre} ya está cubierto por otro extra.`
        : "La persona seleccionada ya no está disponible para ser cubierta."
    };
  }
  return {
    extra: {
      ...extra,
      tipoExtra: TIPOS_EXTRA.COBERTURA,
      personaCubiertaId: String(personaCubierta.id || "").trim(),
      personaCubiertaNombre: String(personaCubierta.nombre || "").trim(),
      sectorCubiertoNombre: String(sectorCubierto).trim()
    },
    error: ""
  };
};

export const aplicarCoberturasDirectasExtras = ({
  asignaciones,
  extras,
  personal,
  esPersonaDisponible = () => true
} = {}) => {
  let resultado = (Array.isArray(asignaciones) ? asignaciones : []).map(
    (asignacion) => ({ ...asignacion })
  );
  const coberturasAplicadas = [];

  (Array.isArray(extras) ? extras : []).filter(esExtraCobertura).forEach((extra) => {
    const cubierta = resolverPersonaCubiertaExtra(extra, personal);
    if (!cubierta || !esPersonaDisponible(cubierta)) return;
    const indiceExtraAsignado = resultado.findIndex((item) =>
      personasCompartenIdentidad(item?.enfermero, extra)
    );
    const indiceCubierta = resultado.findIndex((item) =>
      item?.tipo === "sector" && personasCompartenIdentidad(item?.enfermero, cubierta)
    );
    if (indiceCubierta < 0 && indiceExtraAsignado < 0) return;

    const indiceDestino = indiceExtraAsignado >= 0
      ? indiceExtraAsignado
      : indiceCubierta;

    resultado = resultado.map((item, indice) => {
      if (indiceExtraAsignado < 0 && indice === indiceCubierta) {
        return { ...item, enfermero: extra, coberturaExtra: true };
      }
      if (!personasCompartenIdentidad(item?.enfermero, cubierta)) return item;
      return { ...item, enfermero: null };
    });
    coberturasAplicadas.push({
      extra,
      personaCubierta: cubierta,
      sector: resultado[indiceDestino]?.nombre || extra.sectorCubiertoNombre || ""
    });
  });

  return { asignaciones: resultado, coberturasAplicadas };
};

export const obtenerOpcionesCoberturaExtra = ({
  asignaciones,
  extras,
  categoria,
  esPersonaDisponible = () => true
} = {}) => {
  const identidadesExtras = new Set(
    (Array.isArray(extras) ? extras : [])
      .map(obtenerClaveIdentidadPersona)
      .filter(Boolean)
  );
  const vistas = new Set();
  return (Array.isArray(asignaciones) ? asignaciones : []).flatMap((item) => {
    const persona = item?.enfermero;
    const identidad = obtenerClaveIdentidadPersona(persona);
    if (
      item?.tipo === "divider" ||
      normalizar(item?.nombre) === "SIN ASIGNAR" ||
      !persona ||
      persona.categoria !== categoria ||
      !identidad ||
      vistas.has(identidad) ||
      identidadesExtras.has(identidad) ||
      !esPersonaDisponible(persona)
    ) return [];
    vistas.add(identidad);
    return [{
      persona,
      sector: item.nombre,
      etiqueta: `${persona.nombre} — ${item.nombre}`
    }];
  });
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
