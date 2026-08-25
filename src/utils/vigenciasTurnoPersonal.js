import { TURNOS } from "../config/turnos.js";
import { asegurarIdPersona } from "./identidadPersonas.js";

export const CODIGOS_VIGENCIA_TURNO = Object.freeze({
  PERSONA_ID_REQUERIDA: "PERSONA_ID_REQUERIDA",
  MES_INVALIDO: "MES_INVALIDO",
  TURNO_INVALIDO: "TURNO_INVALIDO",
  FECHA_DESDE_INVALIDA: "FECHA_DESDE_INVALIDA",
  FECHA_HASTA_INVALIDA: "FECHA_HASTA_INVALIDA",
  FECHA_FUERA_DE_MES: "FECHA_FUERA_DE_MES",
  RANGO_INVERTIDO: "RANGO_INVERTIDO",
  SOLAPAMIENTO_VIGENCIAS: "SOLAPAMIENTO_VIGENCIAS",
  SIN_VIGENCIA_EN_FECHA: "SIN_VIGENCIA_EN_FECHA",
  CONFLICTO_TURNOS_LEGACY: "CONFLICTO_TURNOS_LEGACY",
  CATEGORIA_LEGACY_INCOMPATIBLE: "CATEGORIA_LEGACY_INCOMPATIBLE"
});

const texto = (valor) => String(valor ?? "").trim();

const esMesValido = (mes) => /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(texto(mes));

const esFechaValida = (fecha) => {
  const valor = texto(fecha);
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!coincidencia || coincidencia[1] === "0000") return false;
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const esBisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const diasMes = [31, esBisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasMes[mes - 1];
};

const copiarVigencia = (vigencia) => ({
  personaId: texto(vigencia?.personaId),
  mes: texto(vigencia?.mes),
  turno: texto(vigencia?.turno),
  desde: texto(vigencia?.desde),
  hasta: texto(vigencia?.hasta)
});

const crearError = (codigo, campo, detalles = {}) => ({ codigo, campo, ...detalles });

const compararVigencias = (a, b) =>
  a.desde.localeCompare(b.desde) ||
  a.hasta.localeCompare(b.hasta) ||
  a.turno.localeCompare(b.turno);

export const validarVigenciaTurno = (vigencia) => {
  const normalizada = copiarVigencia(vigencia);
  const errores = [];

  if (!normalizada.personaId) {
    errores.push(crearError(CODIGOS_VIGENCIA_TURNO.PERSONA_ID_REQUERIDA, "personaId"));
  }
  if (!esMesValido(normalizada.mes)) {
    errores.push(crearError(CODIGOS_VIGENCIA_TURNO.MES_INVALIDO, "mes"));
  }
  if (!Object.hasOwn(TURNOS, normalizada.turno)) {
    errores.push(crearError(CODIGOS_VIGENCIA_TURNO.TURNO_INVALIDO, "turno"));
  }
  if (!esFechaValida(normalizada.desde)) {
    errores.push(crearError(CODIGOS_VIGENCIA_TURNO.FECHA_DESDE_INVALIDA, "desde"));
  }
  if (!esFechaValida(normalizada.hasta)) {
    errores.push(crearError(CODIGOS_VIGENCIA_TURNO.FECHA_HASTA_INVALIDA, "hasta"));
  }
  if (
    esMesValido(normalizada.mes) &&
    ((esFechaValida(normalizada.desde) && !normalizada.desde.startsWith(`${normalizada.mes}-`)) ||
      (esFechaValida(normalizada.hasta) && !normalizada.hasta.startsWith(`${normalizada.mes}-`)))
  ) {
    errores.push(crearError(CODIGOS_VIGENCIA_TURNO.FECHA_FUERA_DE_MES, "rango"));
  }
  if (
    esFechaValida(normalizada.desde) &&
    esFechaValida(normalizada.hasta) &&
    normalizada.desde > normalizada.hasta
  ) {
    errores.push(crearError(CODIGOS_VIGENCIA_TURNO.RANGO_INVERTIDO, "rango"));
  }

  return { valida: errores.length === 0, vigencia: normalizada, errores };
};

export const normalizarVigenciaTurno = (vigencia) => {
  const resultado = validarVigenciaTurno(vigencia);
  return resultado.valida
    ? { ok: true, vigencia: { ...resultado.vigencia }, errores: [] }
    : { ok: false, vigencia: null, errores: resultado.errores.map((error) => ({ ...error })) };
};

export const haySolapamientoVigencias = (vigencias = []) => {
  const grupos = new Map();
  (Array.isArray(vigencias) ? vigencias : []).map(copiarVigencia).forEach((vigencia) => {
    const clave = `${vigencia.personaId}|${vigencia.mes}`;
    grupos.set(clave, [...(grupos.get(clave) || []), vigencia]);
  });
  return [...grupos.values()].some((grupo) => {
    const ordenadas = grupo.sort(compararVigencias);
    return ordenadas.some((vigencia, indice) =>
      indice > 0 && vigencia.desde <= ordenadas[indice - 1].hasta
    );
  });
};

export const validarVigenciasPersonaMes = ({ personaId, mes, vigencias = [] } = {}) => {
  const identidad = texto(personaId);
  const periodo = texto(mes);
  const candidatas = (Array.isArray(vigencias) ? vigencias : [])
    .map(copiarVigencia)
    .filter((vigencia) => vigencia.personaId === identidad && vigencia.mes === periodo);
  const errores = [
    ...(!identidad
      ? [crearError(CODIGOS_VIGENCIA_TURNO.PERSONA_ID_REQUERIDA, "personaId")]
      : []),
    ...(!esMesValido(periodo)
      ? [crearError(CODIGOS_VIGENCIA_TURNO.MES_INVALIDO, "mes")]
      : [])
  ];
  errores.push(...candidatas.flatMap((vigencia, indice) =>
    validarVigenciaTurno(vigencia).errores.map((error) => ({ ...error, indice }))
  ));
  const ordenadas = candidatas.sort(compararVigencias);

  for (let indice = 1; indice < ordenadas.length; indice += 1) {
    const anterior = ordenadas[indice - 1];
    const actual = ordenadas[indice];
    if (actual.desde <= anterior.hasta) {
      errores.push(crearError(
        CODIGOS_VIGENCIA_TURNO.SOLAPAMIENTO_VIGENCIAS,
        "rango",
        { anterior: { ...anterior }, actual: { ...actual } }
      ));
    }
  }

  return {
    valido: errores.length === 0,
    personaId: identidad,
    mes: periodo,
    vigencias: ordenadas.map((vigencia) => ({ ...vigencia })),
    errores
  };
};

export const obtenerVigenciasPersonaMes = (argumentos = {}) =>
  validarVigenciasPersonaMes(argumentos);

export const obtenerVigenciaPersonaEnFecha = ({ personaId, fecha, vigencias = [] } = {}) => {
  const identidad = texto(personaId);
  const fechaNormalizada = texto(fecha);
  const mes = esFechaValida(fechaNormalizada) ? fechaNormalizada.slice(0, 7) : "";
  const validacion = validarVigenciasPersonaMes({ personaId: identidad, mes, vigencias });
  if (!identidad || !esFechaValida(fechaNormalizada) || !validacion.valido) {
    return {
      ok: false,
      vigencia: null,
      codigo: validacion.errores[0]?.codigo ||
        (!identidad
          ? CODIGOS_VIGENCIA_TURNO.PERSONA_ID_REQUERIDA
          : CODIGOS_VIGENCIA_TURNO.FECHA_DESDE_INVALIDA),
      errores: validacion.errores
    };
  }

  const coincidencias = validacion.vigencias.filter(
    (vigencia) => vigencia.desde <= fechaNormalizada && vigencia.hasta >= fechaNormalizada
  );
  if (coincidencias.length !== 1) {
    return {
      ok: coincidencias.length === 0,
      vigencia: null,
      codigo: coincidencias.length === 0
        ? CODIGOS_VIGENCIA_TURNO.SIN_VIGENCIA_EN_FECHA
        : CODIGOS_VIGENCIA_TURNO.SOLAPAMIENTO_VIGENCIAS,
      errores: coincidencias.length === 0 ? [] : validacion.errores
    };
  }
  return { ok: true, vigencia: { ...coincidencias[0] }, codigo: null, errores: [] };
};

export const resolverTurnoPersonaEnFecha = (argumentos = {}) => {
  const resultado = obtenerVigenciaPersonaEnFecha(argumentos);
  return {
    ...resultado,
    turno: resultado.vigencia?.turno || null
  };
};

const obtenerPersonaIdLegacy = (persona) => texto(asegurarIdPersona(persona)?.id);

const normalizarFuentesLegacy = (estadosPorTurno) => {
  if (Array.isArray(estadosPorTurno)) return estadosPorTurno;
  return Object.entries(estadosPorTurno || {}).map(([turno, estado]) => ({
    turno,
    personal: estado?.personal
  }));
};

const limitesMes = (mes) => {
  if (!esMesValido(mes)) return null;
  const [anio, numeroMes] = mes.split("-").map(Number);
  const esBisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const ultimoDia = [31, esBisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][numeroMes - 1];
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimoDia).padStart(2, "0")}`
  };
};

export const crearVigenciasImplicitasLegacy = ({
  mes,
  estadosPorTurno = [],
  vigenciasExplicitas = []
} = {}) => {
  const periodo = texto(mes);
  const limites = limitesMes(periodo);
  if (!limites) {
    return {
      ok: false,
      vigencias: [],
      errores: [crearError(CODIGOS_VIGENCIA_TURNO.MES_INVALIDO, "mes")]
    };
  }

  const identidadesExplicitas = new Set(
    (Array.isArray(vigenciasExplicitas) ? vigenciasExplicitas : [])
      .map(copiarVigencia)
      .filter((vigencia) => vigencia.mes === periodo && vigencia.personaId)
      .map((vigencia) => vigencia.personaId)
  );
  const apariciones = new Map();
  normalizarFuentesLegacy(estadosPorTurno).forEach(({ turno, personal }) => {
    (Array.isArray(personal) ? personal : []).forEach((persona) => {
      const personaId = obtenerPersonaIdLegacy(persona);
      if (!personaId) return;
      const existentes = apariciones.get(personaId) || [];
      existentes.push({ turno: texto(turno), categoria: texto(persona?.categoria), personaId });
      apariciones.set(personaId, existentes);
    });
  });

  const vigencias = [];
  const errores = [];
  apariciones.forEach((registros, personaId) => {
    const categorias = new Set(registros.map((registro) => registro.categoria).filter(Boolean));
    if (categorias.size > 1) {
      errores.push(crearError(
        CODIGOS_VIGENCIA_TURNO.CATEGORIA_LEGACY_INCOMPATIBLE,
        "categoria",
        { personaId, categorias: [...categorias].sort() }
      ));
    }
    if (identidadesExplicitas.has(personaId)) return;

    const turnos = [...new Set(registros.map((registro) => registro.turno))];
    if (turnos.length !== 1 || !Object.hasOwn(TURNOS, turnos[0])) {
      errores.push(crearError(
        CODIGOS_VIGENCIA_TURNO.CONFLICTO_TURNOS_LEGACY,
        "turno",
        { personaId, turnos: [...turnos].sort() }
      ));
      return;
    }
    vigencias.push({ personaId, mes: periodo, turno: turnos[0], ...limites });
  });

  return {
    ok: errores.length === 0,
    vigencias: vigencias.sort((a, b) =>
      a.personaId.localeCompare(b.personaId) || compararVigencias(a, b)
    ).map((vigencia) => ({ ...vigencia })),
    errores
  };
};

export const resolverVigenciasEfectivasPersonaMes = ({
  personaId,
  mes,
  vigenciasExplicitas = [],
  estadosPorTurno = []
} = {}) => {
  const identidad = texto(personaId);
  const periodo = texto(mes);
  const explicitas = validarVigenciasPersonaMes({
    personaId: identidad,
    mes: periodo,
    vigencias: vigenciasExplicitas
  });
  if (!explicitas.valido || explicitas.vigencias.length > 0) {
    return {
      ok: explicitas.valido,
      origen: "explicita",
      vigencias: explicitas.vigencias,
      errores: explicitas.errores
    };
  }

  const implicitas = crearVigenciasImplicitasLegacy({
    mes: periodo,
    estadosPorTurno,
    vigenciasExplicitas
  });
  return {
    ok: implicitas.ok,
    origen: "legacy_implicita",
    vigencias: implicitas.vigencias.filter((vigencia) => vigencia.personaId === identidad),
    errores: implicitas.errores.filter(
      (error) => !error.personaId || error.personaId === identidad
    )
  };
};
