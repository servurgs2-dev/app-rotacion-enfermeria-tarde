import { TURNOS } from "../config/turnos.js";
import { asegurarIdPersona } from "./identidadPersonas.js";
import { parsearFechaIsoUTC } from "./periodosRotacionPlanilla.js";
import {
  CODIGOS_VIGENCIA_TURNO,
  obtenerVigenciaPersonaEnFecha,
  resolverVigenciasEfectivasPersonaMes,
  validarVigenciasPersonaMes
} from "./vigenciasTurnoPersonal.js";

export const CODIGOS_PADRON_VIGENCIAS = Object.freeze({
  PERSONA_DUPLICADA_ENTRE_TURNOS: "PERSONA_DUPLICADA_ENTRE_TURNOS",
  CATEGORIA_PERSONA_INCONSISTENTE: "CATEGORIA_PERSONA_INCONSISTENTE",
  VIGENCIA_PERSONA_NO_ENCONTRADA: "VIGENCIA_PERSONA_NO_ENCONTRADA",
  CONFIGURACION_EXPLICITA_DUPLICADA: "CONFIGURACION_EXPLICITA_DUPLICADA",
  PERSONA_PADRON_INVALIDA: "PERSONA_PADRON_INVALIDA",
  PADRON_EFECTIVO_INVALIDO: "PADRON_EFECTIVO_INVALIDO"
});

const texto = (valor) => String(valor ?? "").trim();
const clonar = (valor) => structuredClone(valor);

const normalizarEstados = (estadosPorTurno) => {
  if (Array.isArray(estadosPorTurno)) {
    return estadosPorTurno.map((fuente) => ({
      turno: texto(fuente?.turno),
      estado: fuente?.estado ?? { personal: fuente?.personal }
    }));
  }
  return Object.entries(estadosPorTurno || {}).map(([turno, estado]) => ({ turno, estado }));
};

const crearDiagnostico = (codigo, detalles = {}) => ({ codigo, ...detalles });

export const construirPadronPersonalMensual = ({ mes, estadosPorTurno = [] } = {}) => {
  const periodo = texto(mes);
  const apariciones = new Map();
  const contexto = validarVigenciasPersonaMes({
    personaId: "contexto-padron",
    mes: periodo,
    vigencias: []
  });
  const diagnosticos = contexto.errores.map((error) => clonar(error));

  normalizarEstados(estadosPorTurno).forEach(({ turno, estado }) => {
    (Array.isArray(estado?.personal) ? estado.personal : []).forEach((personaOriginal) => {
      const persona = asegurarIdPersona(personaOriginal);
      const personaId = texto(persona?.id);
      if (!personaId) return;
      apariciones.set(personaId, [
        ...(apariciones.get(personaId) || []),
        { persona: clonar(persona), turnoFuente: texto(turno) }
      ]);
    });
  });

  const personas = [];
  const invalidasPorPersonaId = {};
  apariciones.forEach((referencias, personaId) => {
    const turnosFuente = [...new Set(referencias.map(({ turnoFuente }) => turnoFuente))].sort();
    const categorias = [...new Set(
      referencias.map(({ persona }) => texto(persona?.categoria)).filter(Boolean)
    )].sort();
    if (turnosFuente.length > 1) {
      diagnosticos.push(crearDiagnostico(
        CODIGOS_PADRON_VIGENCIAS.PERSONA_DUPLICADA_ENTRE_TURNOS,
        { personaId, turnosFuente }
      ));
      invalidasPorPersonaId[personaId] = CODIGOS_PADRON_VIGENCIAS.PERSONA_DUPLICADA_ENTRE_TURNOS;
    }
    if (categorias.length > 1) {
      diagnosticos.push(crearDiagnostico(
        CODIGOS_PADRON_VIGENCIAS.CATEGORIA_PERSONA_INCONSISTENTE,
        { personaId, categorias }
      ));
      invalidasPorPersonaId[personaId] = CODIGOS_PADRON_VIGENCIAS.CATEGORIA_PERSONA_INCONSISTENTE;
    }
    if (turnosFuente.length === 1 && categorias.length <= 1) {
      personas.push({
        personaId,
        persona: clonar(referencias[0].persona),
        turnoFuente: turnosFuente[0]
      });
    }
  });

  personas.sort((a, b) => a.personaId.localeCompare(b.personaId));
  return {
    ok: diagnosticos.length === 0,
    mes: periodo,
    personas,
    porPersonaId: Object.fromEntries(personas.map((item) => [item.personaId, item])),
    invalidasPorPersonaId,
    diagnosticos
  };
};

export const resolverPadronVigenciasEfectivasMes = ({
  mes,
  estadosPorTurno = [],
  configuracionesExplicitas = []
} = {}) => {
  const periodo = texto(mes);
  const padron = construirPadronPersonalMensual({ mes: periodo, estadosPorTurno });
  const diagnosticos = padron.diagnosticos.map((item) => clonar(item));
  const identidadesFisicas = new Set();
  normalizarEstados(estadosPorTurno).forEach(({ estado }) => {
    (Array.isArray(estado?.personal) ? estado.personal : []).forEach((persona) => {
      const personaId = texto(asegurarIdPersona(persona)?.id);
      if (personaId) identidadesFisicas.add(personaId);
    });
  });

  const configuracionesPorPersona = new Map();
  const configuracionesInvalidas = new Set();
  const resolucionesInvalidas = new Set();
  (Array.isArray(configuracionesExplicitas) ? configuracionesExplicitas : [])
    .forEach((configuracion) => {
      const personaId = texto(configuracion?.personaId);
      if (!personaId || texto(configuracion?.mes) !== periodo) return;
      if (configuracionesInvalidas.has(personaId)) return;
      if (configuracionesPorPersona.has(personaId)) {
        diagnosticos.push(crearDiagnostico(
          CODIGOS_PADRON_VIGENCIAS.CONFIGURACION_EXPLICITA_DUPLICADA,
          { personaId }
        ));
        configuracionesPorPersona.delete(personaId);
        configuracionesInvalidas.add(personaId);
        return;
      }
      configuracionesPorPersona.set(personaId, clonar(configuracion));
      if (!identidadesFisicas.has(personaId)) {
        diagnosticos.push(crearDiagnostico(
          CODIGOS_PADRON_VIGENCIAS.VIGENCIA_PERSONA_NO_ENCONTRADA,
          { personaId }
        ));
      }
    });

  const personas = padron.personas.map((entrada) => {
    if (configuracionesInvalidas.has(entrada.personaId)) {
      return {
        personaId: entrada.personaId,
        persona: clonar(entrada.persona),
        turnoFuente: entrada.turnoFuente,
        origen: "configuracion_invalida",
        existeConfiguracionExplicita: true,
        revision: null,
        vigencias: [],
        invalida: true
      };
    }
    const configuracion = configuracionesPorPersona.get(entrada.personaId);
    const resolucion = resolverVigenciasEfectivasPersonaMes({
      personaId: entrada.personaId,
      mes: periodo,
      vigenciasExplicitas: configuracion?.vigencias || [],
      estadosPorTurno: normalizarEstados(estadosPorTurno).map(({ turno, estado }) => ({
        turno,
        personal: estado?.personal
      }))
    });
    if (!resolucion.ok) {
      resolucionesInvalidas.add(entrada.personaId);
      diagnosticos.push(...resolucion.errores.map((error) => ({
        ...clonar(error),
        personaId: entrada.personaId
      })));
    }
    return {
      personaId: entrada.personaId,
      persona: clonar(entrada.persona),
      turnoFuente: entrada.turnoFuente,
      origen: resolucion.origen,
      existeConfiguracionExplicita: Boolean(configuracion),
      revision: configuracion?.revision || "0",
      vigencias: resolucion.vigencias.map((vigencia) => clonar(vigencia)),
      ...(resolucion.ok ? {} : { invalida: true })
    };
  });

  return {
    ok: diagnosticos.length === 0,
    mes: periodo,
    personas,
    porPersonaId: Object.fromEntries(personas.map((item) => [item.personaId, item])),
    invalidasPorPersonaId: {
      ...padron.invalidasPorPersonaId,
      ...Object.fromEntries([...configuracionesInvalidas].map((personaId) => [
        personaId,
        CODIGOS_PADRON_VIGENCIAS.CONFIGURACION_EXPLICITA_DUPLICADA
      ])),
      ...Object.fromEntries([...resolucionesInvalidas].map((personaId) => [
        personaId,
        CODIGOS_PADRON_VIGENCIAS.PADRON_EFECTIVO_INVALIDO
      ]))
    },
    diagnosticos
  };
};

export const resolverPersonalMensualPorTurno = ({
  padron,
  turno,
  personalFisico = []
} = {}) => {
  const turnoConsultado = texto(turno);
  const fisicasPorId = new Map();
  (Array.isArray(personalFisico) ? personalFisico : []).forEach((personaOriginal) => {
    const persona = asegurarIdPersona(personaOriginal);
    const personaId = texto(persona?.id);
    if (personaId && !fisicasPorId.has(personaId)) {
      fisicasPorId.set(personaId, clonar(persona));
    }
  });

  if (!padron || !Object.hasOwn(TURNOS, turnoConsultado)) {
    return [...fisicasPorId.entries()].map(([personaId, persona]) => ({
      personaId,
      persona: clonar(persona),
      turnoFuente: turnoConsultado,
      esFisicaEnTurnoVisualizado: true,
      origen: "legacy_sin_padron"
    }));
  }

  const visibles = new Map();
  (Array.isArray(padron.personas) ? padron.personas : []).forEach((entrada) => {
    const personaId = texto(entrada?.personaId);
    if (!personaId) return;
    const invalida = Boolean(
      entrada?.invalida || padron.invalidasPorPersonaId?.[personaId]
    );
    const explicita = entrada?.origen === "explicita" &&
      entrada?.existeConfiguracionExplicita === true;
    const pertenece = invalida
      ? entrada.turnoFuente === turnoConsultado
      : explicita
        ? (entrada.vigencias || []).some((vigencia) => vigencia.turno === turnoConsultado)
        : entrada.turnoFuente === turnoConsultado;
    if (!pertenece) return;
    visibles.set(personaId, {
      personaId,
      persona: clonar(entrada.persona),
      turnoFuente: entrada.turnoFuente,
      esFisicaEnTurnoVisualizado: fisicasPorId.has(personaId),
      origen: invalida ? "configuracion_invalida" : entrada.origen
    });
  });

  fisicasPorId.forEach((persona, personaId) => {
    if (visibles.has(personaId)) return;
    const conocida = padron.porPersonaId?.[personaId];
    const invalida = Boolean(padron.invalidasPorPersonaId?.[personaId]);
    if (!conocida || invalida) {
      visibles.set(personaId, {
        personaId,
        persona: clonar(persona),
        turnoFuente: turnoConsultado,
        esFisicaEnTurnoVisualizado: true,
        origen: invalida ? "configuracion_invalida" : "legacy_sin_padron"
      });
    }
  });

  return [...visibles.values()]
    .sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre))
    .map((entrada) => clonar(entrada));
};

export const resolverPertenenciaPersonaEnFecha = ({
  personaId,
  fecha,
  padronEfectivo
} = {}) => {
  const identidad = texto(personaId);
  const entrada = padronEfectivo?.porPersonaId?.[identidad] ||
    padronEfectivo?.personas?.find((persona) => persona.personaId === identidad);
  const codigoInvalida = padronEfectivo?.invalidasPorPersonaId?.[identidad];
  if (codigoInvalida || entrada?.invalida) {
    return {
      ok: false,
      codigo: CODIGOS_PADRON_VIGENCIAS.PERSONA_PADRON_INVALIDA,
      diagnosticoOrigen: codigoInvalida || CODIGOS_PADRON_VIGENCIAS.CONFIGURACION_EXPLICITA_DUPLICADA,
      persona: entrada?.persona ? clonar(entrada.persona) : null,
      personaId: identidad,
      turnoFuente: entrada?.turnoFuente || null,
      turnoEfectivo: null,
      vigencia: null,
      origen: entrada?.origen || null
    };
  }
  if (!entrada) {
    return {
      ok: false,
      codigo: CODIGOS_PADRON_VIGENCIAS.VIGENCIA_PERSONA_NO_ENCONTRADA,
      persona: null,
      personaId: identidad,
      turnoFuente: null,
      turnoEfectivo: null,
      vigencia: null,
      origen: null
    };
  }
  if (texto(fecha).slice(0, 7) !== texto(padronEfectivo?.mes)) {
    return {
      ok: false,
      codigo: CODIGOS_VIGENCIA_TURNO.FECHA_FUERA_DE_MES,
      persona: clonar(entrada.persona),
      personaId: identidad,
      turnoFuente: entrada.turnoFuente,
      turnoEfectivo: null,
      vigencia: null,
      origen: entrada.origen
    };
  }
  const resultado = obtenerVigenciaPersonaEnFecha({
    personaId: identidad,
    fecha,
    vigencias: entrada.vigencias
  });
  return {
    ok: resultado.ok,
    codigo: resultado.codigo,
    persona: clonar(entrada.persona),
    personaId: identidad,
    turnoFuente: entrada.turnoFuente,
    turnoEfectivo: resultado.vigencia?.turno || null,
    vigencia: resultado.vigencia ? clonar(resultado.vigencia) : null,
    origen: entrada.origen
  };
};

export const resolverPersonalEfectivoEnFecha = ({
  mes,
  fecha,
  turno,
  padronEfectivo
} = {}) => {
  const turnoConsultado = texto(turno);
  const periodo = texto(mes || padronEfectivo?.mes);
  if (periodo !== texto(padronEfectivo?.mes) || texto(fecha).slice(0, 7) !== periodo) {
    return {
      ok: false,
      personas: [],
      diagnosticos: [crearDiagnostico(CODIGOS_VIGENCIA_TURNO.FECHA_FUERA_DE_MES)]
    };
  }
  if (!Object.hasOwn(TURNOS, turnoConsultado)) {
    return {
      ok: false,
      personas: [],
      diagnosticos: [crearDiagnostico(CODIGOS_VIGENCIA_TURNO.TURNO_INVALIDO)]
    };
  }
  const diagnosticos = (padronEfectivo?.diagnosticos || []).map((item) => clonar(item));
  const identidades = new Set();
  const personas = [];
  (padronEfectivo?.personas || []).forEach((entrada) => {
    const pertenencia = resolverPertenenciaPersonaEnFecha({
      personaId: entrada.personaId,
      fecha,
      padronEfectivo
    });
    if (!pertenencia.ok && pertenencia.codigo !== CODIGOS_VIGENCIA_TURNO.SIN_VIGENCIA_EN_FECHA) {
      diagnosticos.push({ codigo: pertenencia.codigo, personaId: entrada.personaId });
      return;
    }
    if (pertenencia.turnoEfectivo === turnoConsultado && !identidades.has(entrada.personaId)) {
      identidades.add(entrada.personaId);
      personas.push(pertenencia);
    }
  });
  return { ok: diagnosticos.length === 0, personas, diagnosticos };
};

export const resolverPersonalEfectivoPorTurnoFecha = ({
  padron,
  turno,
  fecha,
  personalFisico = []
} = {}) => {
  const turnoConsultado = texto(turno);
  const fisicas = (Array.isArray(personalFisico) ? personalFisico : [])
    .map((persona) => asegurarIdPersona(persona))
    .filter((persona) => texto(persona?.id));
  if (!padron) {
    return {
      ok: true,
      origen: "legacy_sin_padron",
      personas: fisicas.map((persona) => clonar(persona)),
      diagnosticos: []
    };
  }

  const resolucion = resolverPersonalEfectivoEnFecha({
    mes: padron.mes,
    fecha,
    turno: turnoConsultado,
    padronEfectivo: padron
  });
  if (texto(fecha).slice(0, 7) !== texto(padron.mes) || !Object.hasOwn(TURNOS, turnoConsultado)) {
    return resolucion;
  }

  const porId = new Map(
    resolucion.personas.map((pertenencia) => [
      pertenencia.personaId,
      clonar(pertenencia.persona)
    ])
  );
  // Una identidad corrupta se mantiene conservadoramente en su padrón físico;
  // nunca se adjudica a otro turno ni deja el Calendario vacío.
  fisicas.forEach((persona) => {
    const personaId = texto(persona.id);
    if (padron.invalidasPorPersonaId?.[personaId] && !porId.has(personaId)) {
      porId.set(personaId, clonar(persona));
    }
  });

  return {
    ...resolucion,
    origen: "padron_efectivo",
    personas: [...porId.values()]
      .sort((a, b) => texto(a.nombre).localeCompare(texto(b.nombre)))
      .map((persona) => clonar(persona))
  };
};

const limitesMes = (mes) => {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(texto(mes));
  if (!coincidencia) return null;
  const anio = Number(coincidencia[1]);
  const numeroMes = Number(coincidencia[2]);
  if (numeroMes < 1 || numeroMes > 12) return null;
  const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimoDia).padStart(2, "0")}`
  };
};

const validarPeriodoPlanilla = ({ mes, desde, hasta }) => {
  const inicio = texto(desde);
  const fin = texto(hasta);
  const limites = limitesMes(mes);
  if (!limites || !parsearFechaIsoUTC(inicio) || !parsearFechaIsoUTC(fin)) {
    return { ok: false, codigo: "PERIODO_PLANILLA_INVALIDO" };
  }
  if (inicio > fin) return { ok: false, codigo: "PERIODO_PLANILLA_INVERTIDO" };
  const desdeEfectivo = inicio < limites.desde ? limites.desde : inicio;
  const hastaEfectivo = fin > limites.hasta ? limites.hasta : fin;
  if (desdeEfectivo > hastaEfectivo) {
    return { ok: false, codigo: "PERIODO_PLANILLA_FUERA_DE_MES" };
  }
  return { ok: true, desde: inicio, hasta: fin, desdeEfectivo, hastaEfectivo };
};

const vigenciaIntersectaPeriodo = (vigencia, turno, periodo) =>
  vigencia?.turno === turno &&
  texto(vigencia.desde) <= periodo.hastaEfectivo &&
  texto(vigencia.hasta) >= periodo.desdeEfectivo;

export const resolverPersonalEfectivoPorTurnoPeriodo = ({
  padron,
  turno,
  desde,
  hasta,
  personalFisico = []
} = {}) => {
  const turnoConsultado = texto(turno);
  const periodo = validarPeriodoPlanilla({ mes: padron?.mes, desde, hasta });
  if (!Object.hasOwn(TURNOS, turnoConsultado)) {
    return {
      ok: false,
      origen: padron ? "padron_efectivo" : "legacy_sin_padron",
      personas: [],
      diagnosticos: [crearDiagnostico(CODIGOS_VIGENCIA_TURNO.TURNO_INVALIDO)]
    };
  }
  if (padron && !periodo.ok) {
    return {
      ok: false,
      origen: "padron_efectivo",
      personas: [],
      diagnosticos: [crearDiagnostico(periodo.codigo)]
    };
  }

  const fisicas = (Array.isArray(personalFisico) ? personalFisico : [])
    .map((persona) => asegurarIdPersona(persona))
    .filter((persona) => texto(persona?.id));
  if (!padron) {
    // Sin padrón remoto no hay mes autoritativo para validar el período; se
    // conserva la cohorte física completa como degradación explícita.
    return {
      ok: true,
      origen: "legacy_sin_padron",
      personas: fisicas.map((persona) => clonar(persona)),
      diagnosticos: []
    };
  }

  const porId = new Map();
  (Array.isArray(padron.personas) ? padron.personas : []).forEach((entrada) => {
    const personaId = texto(entrada?.personaId);
    if (!personaId || entrada?.invalida || padron.invalidasPorPersonaId?.[personaId]) return;
    if ((entrada.vigencias || []).some((vigencia) =>
      vigenciaIntersectaPeriodo(vigencia, turnoConsultado, periodo)
    )) {
      porId.set(personaId, clonar(entrada.persona));
    }
  });
  fisicas.forEach((persona) => {
    const personaId = texto(persona.id);
    if (padron.invalidasPorPersonaId?.[personaId] && !porId.has(personaId)) {
      porId.set(personaId, clonar(persona));
    }
  });

  return {
    ok: (padron.diagnosticos || []).length === 0,
    origen: "padron_efectivo",
    periodo: { ...periodo },
    personas: [...porId.values()]
      .sort((a, b) => texto(a.nombre).localeCompare(texto(b.nombre)))
      .map((persona) => clonar(persona)),
    diagnosticos: (padron.diagnosticos || []).map((item) => clonar(item))
  };
};

export const esPersonaEfectivaEnTurnoPeriodo = ({
  padron,
  personaId,
  turno,
  desde,
  hasta,
  personalFisico = []
} = {}) => {
  const identidad = texto(personaId);
  if (!identidad) {
    return {
      ok: false,
      pertenece: false,
      codigo: "PERSONA_NO_IDENTIFICABLE",
      diagnosticos: [crearDiagnostico("PERSONA_NO_IDENTIFICABLE")]
    };
  }
  const resolucion = resolverPersonalEfectivoPorTurnoPeriodo({
    padron,
    turno,
    desde,
    hasta,
    personalFisico
  });
  return {
    ok: resolucion.ok,
    pertenece: resolucion.personas.some((persona) => texto(persona?.id) === identidad),
    origen: resolucion.origen,
    diagnosticos: resolucion.diagnosticos
  };
};
