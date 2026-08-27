import {
  asegurarIdPersona,
  normalizarFuncionarioIdentidad
} from "./identidadPersonas.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { normalizar } from "./texto.js";

const texto = (valor) => String(valor ?? "").trim();
const esObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const nombreNormalizado = (valor) => (normalizar(valor) || "").replace(/\s+/g, " ");

const resolverRelacionReferencia = (referencia, personaId, personal) => {
  if (!personaId) return { coincide: false, ambigua: false, moderna: false };

  const idExplicito = esObjeto(referencia)
    ? texto(referencia.personaId || referencia.id)
    : "";
  if (idExplicito) {
    return { coincide: idExplicito === personaId, ambigua: false, moderna: true };
  }
  if (typeof referencia !== "string" && !esObjeto(referencia)) {
    return { coincide: false, ambigua: false, moderna: false };
  }

  const resuelta = resolverPersonaDesdeReferencia(referencia, personal);
  if (resuelta?.id) {
    return { coincide: texto(resuelta.id) === personaId, ambigua: false, moderna: false };
  }

  const funcionario = esObjeto(referencia)
    ? normalizarFuncionarioIdentidad(referencia.funcionario)
    : "";
  const nombre = nombreNormalizado(
    esObjeto(referencia) ? referencia.nombre : referencia
  );
  const candidatas = personal.filter((persona) => funcionario
    ? normalizarFuncionarioIdentidad(persona?.funcionario) === funcionario
    : nombre && nombreNormalizado(persona?.nombre) === nombre
  );
  const ids = new Set(candidatas.map((persona) => texto(persona?.id)).filter(Boolean));
  return {
    coincide: ids.has(personaId),
    ambigua: ids.size > 1 && ids.has(personaId),
    moderna: false
  };
};

const datosDiagnosticoReferencia = (relacion, codigo, detalle) => relacion.ambigua
  ? {
      codigo: "REFERENCIA_LEGACY_AMBIGUA",
      detalle: "Existe una referencia legacy ambigua que podría depender de esta persona."
    }
  : relacion.moderna
    ? { codigo, detalle }
    : {
        codigo: "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE",
        detalle: "La referencia legacy debe estabilizarse antes de mover el padrón base."
      };

const agregar = (mapa, {
  codigo,
  ambito,
  categoria,
  detalle,
  ruta,
  rutaInterna
}) => {
  const clave = `${codigo}\u0000${ambito}\u0000${categoria || ""}`;
  const actual = mapa.get(clave) || {
    codigo,
    ambito,
    ...(categoria ? { categoria } : {}),
    detalle,
    rutas: [],
    rutasInternas: []
  };
  if (ruta && !actual.rutas.includes(ruta)) actual.rutas.push(ruta);
  if (rutaInterna && !actual.rutasInternas.includes(rutaInterna)) {
    actual.rutasInternas.push(rutaInterna);
  }
  mapa.set(clave, actual);
};

const etiquetaCategoria = (categoria) =>
  categoria === "enfermero" ? "Enfermeros" : "Licenciados";

const auditarDistribucion = ({
  distribucion,
  personaId,
  personal,
  bloqueos,
  informativas,
  categoria,
  etiqueta,
  rutaBase
}) => {
  if (!esObjeto(distribucion)) return;
  Object.entries(distribucion).forEach(([fila, referencia]) => {
    const relacion = resolverRelacionReferencia(referencia, personaId, personal);
    if (!relacion.coincide) return;
    agregar(relacion.moderna ? informativas : bloqueos, {
      ...datosDiagnosticoReferencia(
        relacion,
        "PLANILLA_REFERENCIA_PERSONA",
        "La referencia moderna se conserva por personaId y se resuelve por cohorte."
      ),
      ambito: "planilla",
      categoria,
      ruta: `${etiqueta} / ${fila}`,
      rutaInterna: `${rutaBase}.${fila}`
    });
  });
};

const auditarPlanilla = ({
  estado,
  personaId,
  personal,
  categoria,
  bloqueos,
  informativas
}) => {
  const clave = categoria === "enfermero" ? "enfermeros" : "licenciados";
  const planilla = estado?.planillas?.[clave];
  if (!esObjeto(planilla)) return;

  Object.entries(planilla).forEach(([seccion, valor]) => {
    if (/^semana\d+$/.test(seccion)) {
      auditarDistribucion({
        distribucion: valor,
        personaId,
        personal,
        bloqueos,
        informativas,
        categoria,
        etiqueta: `${etiquetaCategoria(categoria)} / ${seccion}`,
        rutaBase: `planillas.${clave}.${seccion}`
      });
    }
  });

  Object.entries(planilla.asignacionesParciales || {}).forEach(([periodo, asignaciones]) => {
    (Array.isArray(asignaciones) ? asignaciones : []).forEach((asignacion, indice) => {
      const relacion = resolverRelacionReferencia(asignacion, personaId, personal);
      if (!relacion.coincide) return;
      agregar(relacion.moderna ? informativas : bloqueos, {
        ...datosDiagnosticoReferencia(
          relacion,
          "PLANILLA_REFERENCIA_PERSONA",
          "La referencia moderna se conserva por personaId y se resuelve por cohorte."
        ),
        ambito: "planilla",
        categoria,
        ruta: `${etiquetaCategoria(categoria)} / ${periodo} / reintegro ${indice + 1}`,
        rutaInterna: `planillas.${clave}.asignacionesParciales.${periodo}.${indice}`
      });
    });
  });

  auditarDistribucion({
    distribucion: planilla.coberturaLibreSM,
    personaId,
    personal,
    bloqueos,
    informativas,
    categoria,
    etiqueta: `${etiquetaCategoria(categoria)} / cobertura de Salud Mental`,
    rutaBase: `planillas.${clave}.coberturaLibreSM`
  });

  if (categoria === "enfermero") {
    const rotacion = planilla.rotacion3Dias || {};
    auditarDistribucion({
      distribucion: rotacion.asignacionBase,
      personaId,
      personal,
      bloqueos,
      informativas,
      categoria,
      etiqueta: "Enfermeros / rotación Noche / asignación base",
      rutaBase: "planillas.enfermeros.rotacion3Dias.asignacionBase"
    });
    Object.entries(rotacion.bloques || {}).forEach(([fecha, bloque]) => {
      auditarDistribucion({
        distribucion: bloque,
        personaId,
        personal,
        bloqueos,
        informativas,
        categoria,
        etiqueta: `Enfermeros / rotación Noche / bloque ${fecha}`,
        rutaBase: `planillas.enfermeros.rotacion3Dias.bloques.${fecha}`
      });
    });
    auditarDistribucion({
      distribucion: rotacion.coberturaLibreSM,
      personaId,
      personal,
      bloqueos,
      informativas,
      categoria,
      etiqueta: "Enfermeros / rotación Noche / cobertura de Salud Mental",
      rutaBase: "planillas.enfermeros.rotacion3Dias.coberturaLibreSM"
    });
  }

  const fijas = estado?.configuracionPlanilla?.[categoria]?.asignacionesFijas;
  (Array.isArray(fijas) ? fijas : []).forEach((asignacion, indice) => {
    if (texto(asignacion?.personaId) !== personaId) return;
    agregar(informativas, {
      codigo: "PLANILLA_REFERENCIA_PERSONA",
      ambito: "planilla",
      categoria,
      detalle: "La asignación fija moderna se conserva y se aplica sólo en cohortes efectivas.",
      ruta: `${etiquetaCategoria(categoria)} / asignación fija / ${texto(asignacion?.sectorId) || indice + 1}`,
      rutaInterna: `configuracionPlanilla.${categoria}.asignacionesFijas.${indice}`
    });
  });
};

const auditarCalendario = ({ estado, personaId, personal, categoria, bloqueos, informativas }) => {
  const clave = categoria === "enfermero" ? "enfermeros" : "licenciados";
  const calendario = estado?.calendario?.[clave];
  if (!esObjeto(calendario)) return;

  const contenedores = [
    ["cambiosDia", "cambio diario"],
    ["cambiosParoDia", "cambio por paro"]
  ];
  contenedores.forEach(([campo, etiqueta]) => {
    Object.entries(calendario[campo] || {}).forEach(([fecha, distribucion]) => {
      if (!esObjeto(distribucion)) return;
      Object.entries(distribucion).forEach(([destino, referencia]) => {
        const relacion = resolverRelacionReferencia(referencia, personaId, personal);
        if (!relacion.coincide) return;
        agregar(bloqueos, {
          ...datosDiagnosticoReferencia(
            relacion,
            "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES",
            "La persona tiene una distribución diaria ligada al padrón del turno."
          ),
          ambito: "calendario",
          categoria,
          ruta: `${fecha} / ${etiqueta} / ${destino}`,
          rutaInterna: `calendario.${clave}.${campo}.${fecha}.${destino}`
        });
      });
    });
  });

  Object.entries(calendario.noDisponibles || {}).forEach(([fecha, registros]) => {
    (Array.isArray(registros) ? registros : []).forEach((registro, indice) => {
      const relacion = resolverRelacionReferencia(registro, personaId, personal);
      const esTitular = relacion.coincide;
      const esCobertura = texto(registro?.personaCoberturaId) === personaId;
      if (!esTitular && !esCobertura) return;
      agregar(bloqueos, {
        ...datosDiagnosticoReferencia(
          relacion.ambigua && esTitular
            ? relacion
            : { ambigua: false, moderna: true },
          "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES",
          "La no disponibilidad se aplica usando el padrón físico del turno."
        ),
        ambito: "calendario",
        categoria,
        ruta: `${fecha} / no disponible${esCobertura ? " / cobertura" : ""}`,
        rutaInterna: `calendario.${clave}.noDisponibles.${fecha}.${indice}`
      });
    });
  });

  Object.entries(calendario.asistenciaDia || {}).forEach(([fecha, registros]) => {
    if (!esObjeto(registros)) return;
    Object.entries(registros).forEach(([identidad, registro]) => {
      const coincideClave = identidad === `id:${personaId}` || identidad === personaId;
      const coincideRegistro = esObjeto(registro) &&
        resolverRelacionReferencia(registro.persona, personaId, personal).coincide;
      if (!coincideClave && !coincideRegistro) return;
      agregar(bloqueos, {
        codigo: "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES",
        ambito: "calendario",
        categoria,
        detalle: "La asistencia registrada depende de la identidad prevista en este turno.",
        ruta: `${fecha} / asistencia`,
        rutaInterna: `calendario.${clave}.asistenciaDia.${fecha}.${identidad}`
      });
    });
  });

  Object.entries(calendario.extras || {}).forEach(([fecha, extras]) => {
    (Array.isArray(extras) ? extras : []).forEach((extra, indice) => {
      const referencias = [
        extra?.personaId ? { personaId: extra.personaId } : null,
        !extra?.temporal && extra?.id ? { personaId: extra.id } : null,
        extra?.personaCubiertaId ? { personaId: extra.personaCubiertaId } : null,
        extra
      ].filter(Boolean);
      const relaciones = referencias.map((referencia) =>
        resolverRelacionReferencia(referencia, personaId, personal)
      );
      if (!relaciones.some(({ coincide }) => coincide)) return;
      agregar(informativas, {
        codigo: relaciones.some(({ ambigua }) => ambigua)
          ? "EXTRA_REFERENCIA_LEGACY_AMBIGUA"
          : "EXTRA_RELACIONADO_PERSONA",
        ambito: "extras",
        categoria,
        detalle: "El Extra conserva identidad y contexto propios; no se mueve ni se reescribe.",
        ruta: `${fecha} / Extra`,
        rutaInterna: `calendario.${clave}.extras.${fecha}.${indice}`
      });
    });
  });
};

const auditarAusencias = ({ estado, personaId, personal, informativas }) => {
  [
    ["licencias", "LICENCIA_REFERENCIA_PERSONA", "Licencia"],
    ["certificaciones", "CERTIFICACION_REFERENCIA_PERSONA", "Certificación"]
  ].forEach(([campo, codigo, etiqueta]) => {
    (Array.isArray(estado?.[campo]) ? estado[campo] : []).forEach((registro, indice) => {
      // En Licencias/Certificaciones `id` identifica el registro, no a la persona.
      const referencia = registro?.personaId
        ? { personaId: registro.personaId }
        : { nombre: registro?.nombre, funcionario: registro?.funcionario };
      const relacion = resolverRelacionReferencia(referencia, personaId, personal);
      if (!relacion.coincide) return;
      agregar(informativas, {
        ...datosDiagnosticoReferencia(
          { ...relacion, moderna: true },
          codigo,
          `${etiqueta} mensual que se resuelve contra el padrón físico del turno.`
        ),
        ambito: campo,
        ruta: `${etiqueta} ${texto(registro.desde) || indice + 1}${registro.hasta ? ` a ${registro.hasta}` : ""}`,
        rutaInterna: `${campo}.${indice}`
      });
    });
  });
};

export const analizarDependenciasMovimientoPadronBase = ({
  estadoOrigen,
  personaId,
  categoria,
  turnoOrigen,
  turnoDestino,
  mes
} = {}) => {
  const id = texto(personaId);
  if (!id) {
    return {
      ok: false,
      codigo: "PERSONA_NO_IDENTIFICABLE",
      tieneBloqueos: true,
      bloqueos: [],
      informativas: []
    };
  }

  const personal = Array.isArray(estadoOrigen?.personal) ? estadoOrigen.personal : [];
  const coincidencias = personal
    .map((persona) => asegurarIdPersona(persona))
    .filter((persona) => texto(persona?.id) === id);
  if (coincidencias.length === 0) {
    return {
      ok: false,
      codigo: "PERSONA_NO_ENCONTRADA_EN_PADRON_ORIGEN",
      personaId: id,
      tieneBloqueos: true,
      bloqueos: [],
      informativas: []
    };
  }
  if (coincidencias.length > 1) {
    return {
      ok: false,
      codigo: "PERSONA_DUPLICADA_EN_PADRON_ORIGEN",
      personaId: id,
      tieneBloqueos: true,
      bloqueos: [],
      informativas: []
    };
  }

  const persona = coincidencias[0];
  const categoriaEfectiva = texto(categoria || persona.categoria);
  if (!['enfermero', 'licenciado'].includes(categoriaEfectiva) ||
      (texto(categoria) && texto(persona.categoria) !== categoriaEfectiva)) {
    return {
      ok: false,
      codigo: "CATEGORIA_PERSONA_INCONSISTENTE",
      personaId: id,
      tieneBloqueos: true,
      bloqueos: [],
      informativas: []
    };
  }

  const bloqueos = new Map();
  const informativas = new Map();
  const personalCanonico = personal.map((actual) => asegurarIdPersona(actual));
  auditarPlanilla({
    estado: estadoOrigen,
    personaId: id,
    personal: personalCanonico,
    categoria: categoriaEfectiva,
    bloqueos,
    informativas
  });
  auditarCalendario({
    estado: estadoOrigen,
    personaId: id,
    personal: personalCanonico,
    categoria: categoriaEfectiva,
    bloqueos,
    informativas
  });
  auditarAusencias({
    estado: estadoOrigen,
    personaId: id,
    personal: personalCanonico,
    informativas
  });

  const listaBloqueos = [...bloqueos.values()];
  return {
    ok: true,
    personaId: id,
    persona: { ...persona },
    categoria: categoriaEfectiva,
    turnoOrigen: texto(turnoOrigen),
    ...(texto(turnoDestino) ? { turnoDestino: texto(turnoDestino) } : {}),
    mes: texto(mes),
    tieneBloqueos: listaBloqueos.length > 0,
    bloqueos: listaBloqueos,
    informativas: [...informativas.values()]
  };
};
