import { configuracionSectores } from "../data/sectores.js";
import { TURNOS, obtenerEstrategiaRotacionPlanilla } from "../config/turnos.js";
import {
  crearEstadoMensualVacio,
  crearPlanillaMensualVacia,
  normalizarEstadoMensual
} from "./estadoMensual.js";
import { obtenerSemanasDelMes } from "./fechas.js";
import { obtenerBloquesQueIntersectanMes } from "./periodosRotacionPlanilla.js";
import {
  resolverAsignacionBaseRotacion3DiasEfectiva,
  tieneAsignacionesUtiles
} from "./rotacionPlanilla.js";
import {
  analizarDistribucionBaseEnfermeros
} from "./generacionFlexiblePlanilla.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { tieneContenidoSignificativo } from "./limpiezaSegura.js";
import {
  obtenerFilasBasePlanilla,
  obtenerPosicionTurnanteMensual,
  quitarTurnanteMensualDeDistribucion
} from "./turnanteMensual.js";
import {
  copiarSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanillaDesdeFilas,
  esSnapshotConfiguracionPlanillaValido
} from "./configuracionPlanilla.js";
import {
  crearBorradoresConfiguracionPlanilla,
  validarBorradoresConfiguracionPlanilla
} from "./plantillasConfiguracionPlanilla.js";
import { validarAsignacionesFijasMensuales } from "./asignacionesFijasMensuales.js";
import { asegurarIdPersona } from "./identidadPersonas.js";
import { limpiarReferenciasDePersona } from "./integridadPersonas.js";
import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";
import { prepararTransicionLicenciadosV1aV2 } from "./transicionLicenciadosV1aV2.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const clonar = (valor) => {
  if (Array.isArray(valor)) return valor.map(clonar);
  if (!esObjeto(valor)) return valor;
  return Object.fromEntries(
    Object.entries(valor).map(([clave, contenido]) => [clave, clonar(contenido)])
  );
};

const obtenerPersonaIdCanonico = (persona) =>
  String(asegurarIdPersona(persona)?.id ?? "").trim();

export const reconciliarPersonalPreparacionMes = ({
  estadoOrigen,
  turnoDestino,
  estadosDestinoPorTurno
} = {}) => {
  if (!esObjeto(estadoOrigen)) {
    return { ok: false, codigo: "ORIGEN_AUSENTE", mensaje: "No existe el mes origen." };
  }
  const personalOrigen = Array.isArray(estadoOrigen.personal) ? estadoOrigen.personal : [];
  const origenPorId = new Map();
  for (const persona of personalOrigen) {
    const personaId = obtenerPersonaIdCanonico(persona);
    if (!personaId) {
      return {
        ok: false,
        codigo: "PERSONA_ORIGEN_NO_IDENTIFICABLE",
        mensaje: "Una persona del mes origen no puede identificarse con seguridad."
      };
    }
    const existentes = origenPorId.get(personaId) || [];
    existentes.push(persona);
    origenPorId.set(personaId, existentes);
  }
  const duplicadaOrigen = [...origenPorId.entries()].find(([, personas]) => personas.length > 1);
  if (duplicadaOrigen) {
    return {
      ok: false,
      codigo: "PERSONA_DUPLICADA_EN_ORIGEN",
      personaId: duplicadaOrigen[0],
      mensaje: "El mes origen contiene una identidad duplicada y debe revisarse antes de preparar."
    };
  }

  const destinoPorId = new Map();
  for (const [turnoId, estado] of Object.entries(estadosDestinoPorTurno || {})) {
    if (turnoId === turnoDestino || !estado) continue;
    for (const persona of Array.isArray(estado.personal) ? estado.personal : []) {
      const personaId = obtenerPersonaIdCanonico(persona);
      if (!personaId) {
        return {
          ok: false,
          codigo: "PERSONA_DESTINO_NO_IDENTIFICABLE",
          mensaje: "Una persona del mes destino no puede identificarse con seguridad."
        };
      }
      const existentes = destinoPorId.get(personaId) || [];
      existentes.push({ turnoId, persona });
      destinoPorId.set(personaId, existentes);
    }
  }
  const duplicadaDestino = [...destinoPorId.entries()].find(([, apariciones]) =>
    apariciones.length > 1
  );
  if (duplicadaDestino) {
    return {
      ok: false,
      codigo: "PERSONA_DUPLICADA_EN_DESTINO",
      personaId: duplicadaDestino[0],
      turnos: duplicadaDestino[1].map(({ turnoId }) => turnoId),
      mensaje: "El mes destino contiene una identidad duplicada y debe revisarse antes de preparar."
    };
  }

  const personasOmitidas = [];
  for (const [personaId, [persona]] of origenPorId.entries()) {
    const [aparicionDestino] = destinoPorId.get(personaId) || [];
    if (!aparicionDestino) continue;
    personasOmitidas.push({
      personaId,
      nombre: String(aparicionDestino.persona?.nombre || persona?.nombre || "").trim(),
      turnoId: aparicionDestino.turnoId,
      turnoNombre: TURNOS[aparicionDestino.turnoId]?.nombre || aparicionDestino.turnoId
    });
  }

  return {
    ok: true,
    personasOmitidas: personasOmitidas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    personaIdsOmitidos: personasOmitidas.map(({ personaId }) => personaId)
  };
};

export const aplicarOmisionesPersonalEstadoPreparado = ({
  estadoPreparado,
  personaIdsOmitidos
} = {}) => {
  if (!esObjeto(estadoPreparado)) return estadoPreparado;
  const ids = new Set(
    (Array.isArray(personaIdsOmitidos) ? personaIdsOmitidos : [])
      .map((personaId) => String(personaId ?? "").trim())
      .filter(Boolean)
  );
  let resultado = clonar(estadoPreparado);
  for (const persona of Array.isArray(resultado.personal) ? resultado.personal : []) {
    const personaId = obtenerPersonaIdCanonico(persona);
    if (ids.has(personaId)) {
      resultado = limpiarReferenciasDePersona(resultado, persona);
    }
  }
  return resultado;
};

export const obtenerFilasPlanilla = (configuracion, tipo = "") =>
  obtenerFilasBasePlanilla(configuracion, tipo);

const registrar = (contenido, clave, condicion) => {
  if (condicion) contenido.push(clave);
};

export const detectarContenidoMensual = (estado) => {
  if (!esObjeto(estado)) return [];
  const contenido = [];
  registrar(contenido, "Personal", tieneContenidoSignificativo(estado.personal));
  registrar(contenido, "Licencias", tieneContenidoSignificativo(estado.licencias));
  registrar(
    contenido,
    "Certificaciones",
    tieneContenidoSignificativo(estado.certificaciones)
  );

  for (const categoria of ["enfermeros", "licenciados"]) {
    const planilla = estado.planillas?.[categoria];
    if (!esObjeto(planilla)) continue;
    for (let semana = 1; semana <= 6; semana += 1) {
      registrar(
        contenido,
        `${categoria}.semana${semana}`,
        tieneContenidoSignificativo(planilla[`semana${semana}`])
      );
    }
    registrar(
      contenido,
      `${categoria}.coberturaLibreSM`,
      tieneContenidoSignificativo(planilla.coberturaLibreSM)
    );
    registrar(
      contenido,
      `${categoria}.generacionFlexible`,
      tieneContenidoSignificativo(planilla.generacionFlexible)
    );
    if (categoria === "enfermeros") {
      registrar(
        contenido,
        "enfermeros.asignacionBase",
        tieneContenidoSignificativo(planilla.rotacion3Dias?.asignacionBase)
      );
      registrar(
        contenido,
        "enfermeros.bloques",
        tieneContenidoSignificativo(planilla.rotacion3Dias?.bloques)
      );
      registrar(
        contenido,
        "enfermeros.coberturaNocturna",
        tieneContenidoSignificativo(planilla.rotacion3Dias?.coberturaLibreSM)
      );
    }
    const clavesPlanillaConocidas = new Set([
      "semana1", "semana2", "semana3", "semana4", "semana5", "semana6",
      "coberturaLibreSM", "generacionFlexible",
      "posicionesMensualesAdicionales",
      ...(categoria === "enfermeros" ? ["rotacion3Dias"] : [])
    ]);
    Object.entries(planilla).forEach(([clave, valor]) => {
      registrar(
        contenido,
        `${categoria}.${clave}`,
        !clavesPlanillaConocidas.has(clave) &&
          tieneContenidoSignificativo(valor)
      );
    });
  }

  registrar(
    contenido,
    "Días de paro",
    tieneContenidoSignificativo(estado.calendario?.diasParo)
  );
  for (const categoria of ["enfermeros", "licenciados"]) {
    const calendario = estado.calendario?.[categoria];
    for (const [clave, etiqueta] of [
      ["cambiosDia", "cambios diarios"],
      ["cambiosParoDia", "cambios por paro"],
      ["extras", "extras"],
      ["noDisponibles", "no disponibles"],
      ["asistenciaDia", "asistencia"],
      ["cierresDia", "cierres"]
    ]) {
      registrar(
        contenido,
        `${categoria}.${etiqueta}`,
        tieneContenidoSignificativo(calendario?.[clave])
      );
    }
  }
  const clavesEstadoConocidas = new Set([
    "personal", "planillas", "calendario", "licencias", "certificaciones",
    "configuracionPlanilla"
  ]);
  Object.entries(estado).forEach(([clave, valor]) => {
    registrar(
      contenido,
      clave,
      !clavesEstadoConocidas.has(clave) &&
        tieneContenidoSignificativo(valor)
    );
  });
  return contenido;
};

export const clasificarEstadoMesDestino = ({ existeRemoto = false, estado } = {}) => {
  const contenido = detectarContenidoMensual(estado);
  if (!existeRemoto && contenido.length === 0) {
    return { clasificacion: "inexistente", permitido: true, contenido };
  }
  if (contenido.length === 0) {
    return { clasificacion: "vacio", permitido: true, contenido };
  }
  const cerrado = contenido.some((item) => item.includes("cierres"));
  const operativo = contenido.some((item) =>
    /cambios|extras|disponibles|asistencia|paro/.test(item)
  );
  const configurado = contenido.some((item) =>
    /semana|asignacionBase|bloques|cobertura|generacionFlexible/.test(item)
  );
  return {
    clasificacion: cerrado
      ? "cerrado"
      : operativo
        ? "operativo"
        : configurado
          ? "configurado"
          : "parcial",
    permitido: false,
    contenido
  };
};

const formatearListaNumeros = (numeros) => {
  const ordenados = [...new Set(numeros)].sort((a, b) => a - b);
  if (
    ordenados.length > 1 &&
    ordenados.every((numero, indice) =>
      indice === 0 || numero === ordenados[indice - 1] + 1
    )
  ) {
    return `${ordenados[0]} a ${ordenados.at(-1)}`;
  }
  if (ordenados.length <= 1) return String(ordenados[0] ?? "");
  return `${ordenados.slice(0, -1).join(", ")} y ${ordenados.at(-1)}`;
};

export const formatearContenidoMes = (contenido) => {
  const claves = Array.isArray(contenido) ? contenido : [];
  const semanas = {
    enfermeros: [],
    licenciados: []
  };
  claves.forEach((clave) => {
    const coincidencia = /^(enfermeros|licenciados)\.semana([1-6])$/.exec(clave);
    if (coincidencia) semanas[coincidencia[1]].push(Number(coincidencia[2]));
  });

  const etiquetas = {
    Personal: "Personal cargado",
    Licencias: "Licencias",
    Certificaciones: "Certificaciones",
    "enfermeros.coberturaLibreSM": "Cobertura de Salud Mental de Enfermeros",
    "licenciados.coberturaLibreSM": "Cobertura de Salud Mental de Licenciados",
    "enfermeros.generacionFlexible": "Configuración flexible de Enfermeros",
    "enfermeros.extras": "Extras de Enfermeros",
    "licenciados.extras": "Extras de Licenciados",
    "enfermeros.no disponibles": "Personas no disponibles de Enfermeros",
    "licenciados.no disponibles": "Personas no disponibles de Licenciados",
    "enfermeros.cambios diarios": "Cambios diarios de Enfermeros",
    "licenciados.cambios diarios": "Cambios diarios de Licenciados",
    "enfermeros.cambios por paro": "Cambios por paro de Enfermeros",
    "licenciados.cambios por paro": "Cambios por paro de Licenciados",
    "enfermeros.asistencia": "Asistencia de Enfermeros",
    "licenciados.asistencia": "Asistencia de Licenciados",
    "Días de paro": "Días de paro",
    "enfermeros.asignacionBase": "Base de la rotación nocturna",
    "enfermeros.bloques": "Bloques de la rotación nocturna",
    "enfermeros.coberturaNocturna": "Cobertura nocturna de Salud Mental"
  };
  const resultado = [];
  const categoriasAgregadas = new Set();
  claves.forEach((clave) => {
    const semana = /^(enfermeros|licenciados)\.semana[1-6]$/.exec(clave);
    if (semana) {
      const categoria = semana[1];
      if (categoriasAgregadas.has(categoria)) return;
      categoriasAgregadas.add(categoria);
      const nombre = categoria === "enfermeros" ? "Enfermeros" : "Licenciados";
      resultado.push(
        `Planilla de ${nombre}: semanas ${formatearListaNumeros(semanas[categoria])}`
      );
      return;
    }
    const etiqueta = clave.endsWith(".cierres")
      ? "Cierres de guardia"
      : etiquetas[clave] || "Otra información del mes";
    if (!resultado.includes(etiqueta)) resultado.push(etiqueta);
  });
  return resultado;
};

const mesAIntervalo = (mes) => {
  const coincidencia = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes || "");
  if (!coincidencia) return null;
  const anio = Number(coincidencia[1]);
  const numeroMes = Number(coincidencia[2]);
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(new Date(anio, numeroMes, 0).getDate()).padStart(2, "0")}`
  };
};

export const filtrarRegistrosQueIntersectanMes = (registros, mes) => {
  const intervalo = mesAIntervalo(mes);
  if (!intervalo || !Array.isArray(registros)) return [];
  return registros
    .filter((registro) =>
      esObjeto(registro) &&
      /^\d{4}-\d{2}-\d{2}$/.test(registro.desde || "") &&
      /^\d{4}-\d{2}-\d{2}$/.test(registro.hasta || "") &&
      registro.desde <= intervalo.hasta &&
      registro.hasta >= intervalo.desde
    )
    .map(clonar);
};

const validarDistribucionCategoria = ({
  distribucion,
  filas,
  personal,
  categoria
}) => {
  if (!esObjeto(distribucion)) {
    return { ok: false, mensaje: `Falta la base de ${categoria}.` };
  }
  const vistos = new Set();
  for (const fila of filas) {
    const referencia = distribucion[fila];
    if (referencia === "" || referencia === null || referencia === undefined) continue;
    const persona = resolverPersonaDesdeReferencia(referencia, personal);
    if (!persona || persona.categoria !== categoria) {
      return {
        ok: false,
        mensaje: `La referencia de ${fila} no puede resolverse contra Personal.`
      };
    }
    const id = String(persona.id || "");
    if (vistos.has(id)) {
      return {
        ok: false,
        mensaje: `La base de ${categoria} contiene una persona duplicada.`
      };
    }
    vistos.add(id);
  }
  if (vistos.size === 0) return { ok: false, mensaje: `Falta la base de ${categoria}.` };
  return { ok: true, cantidadPersonas: vistos.size };
};

const obtenerUltimaBaseSemanal = ({ estadoOrigen, categoria, mesOrigen }) => {
  const planilla = estadoOrigen.planillas?.[categoria];
  const claves = obtenerSemanasDelMes(mesOrigen).map((semana) => semana.clave);
  const clave = [...claves].reverse().find((actual) =>
    tieneAsignacionesUtiles(planilla?.[actual])
  );
  if (clave) return { clave, distribucion: planilla[clave] };
  if (tieneAsignacionesUtiles(planilla?.semana5)) {
    return { clave: "semana5", distribucion: planilla.semana5 };
  }
  return null;
};

const obtenerCoberturaBase = (planilla, clave) =>
  planilla?.coberturaLibreSM?.[clave] || null;

export const analizarPreparacionMesNuevo = ({
  turnoId,
  mesOrigen,
  mesDestino,
  estadoOrigen,
  personalCanonicoOrigen,
  estadoDestino,
  existeDestinoRemoto = false,
  revisionDestino = "0"
} = {}) => {
  const destino = clasificarEstadoMesDestino({
    existeRemoto: existeDestinoRemoto,
    estado: estadoDestino
  });
  if (!destino.permitido) {
    return {
      ok: false,
      codigo: "DESTINO_CON_CONTENIDO",
      mensaje: "El mes destino ya contiene información y no puede prepararse.",
      destino
    };
  }
  if (!esObjeto(estadoOrigen)) {
    return { ok: false, codigo: "ORIGEN_AUSENTE", mensaje: "No existe el mes origen." };
  }
  const personal = clonar(Array.isArray(estadoOrigen.personal) ? estadoOrigen.personal : []);
  const personalCanonico = clonar(
    Array.isArray(personalCanonicoOrigen) ? personalCanonicoOrigen : personal
  );
  const borradoresConfiguracionPlanilla = crearBorradoresConfiguracionPlanilla({
    estadoMensual: estadoOrigen,
    turno: turnoId,
    mes: mesOrigen
  });
  let filasEnfermeros = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
  const configuracionLicenciadosOrigen = borradoresConfiguracionPlanilla.licenciado;
  const filasLicenciados = resolverVersionEstructuraLicenciados(
    configuracionLicenciadosOrigen
  ) === VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
    ? configuracionLicenciadosOrigen.filas
        .filter((fila) => fila.activo !== false)
        .sort((a, b) => a.orden - b.orden)
        .map((fila) => fila.etiqueta)
    : obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
  const estrategiaEnfermeros = obtenerEstrategiaRotacionPlanilla({
    turnoId,
    tipo: "enfermero",
    mesActivo: mesDestino
  });
  const estrategiaLicenciados = obtenerEstrategiaRotacionPlanilla({
    turnoId,
    tipo: "licenciado",
    mesActivo: mesDestino
  });

  let baseEnfermeros;
  let claveBaseEnfermeros;
  let bloquesDestino = [];
  let rotacionEnfermerosOrigen = clonar(
    estadoOrigen.planillas?.enfermeros?.rotacion3Dias || {}
  );
  if (estrategiaEnfermeros.tipo === "cada_3_dias") {
    const rotacion = estadoOrigen.planillas?.enfermeros?.rotacion3Dias;
    const configuracionEnfermeros = borradoresConfiguracionPlanilla.enfermero;
    const filasConfiguracion = [...(configuracionEnfermeros?.filas || [])]
      .sort((a, b) => a.orden - b.orden);
    const filasActivas = filasConfiguracion.filter((fila) => fila.activo !== false);
    filasEnfermeros = filasActivas.map((fila) => fila.etiqueta);
    const asignacionesFijas = configuracionEnfermeros?.asignacionesFijas || [];
    const sectoresFijos = new Set(asignacionesFijas.map(({ sectorId }) => sectorId));
    const filasFijas = filasActivas
      .filter((fila) => fila.tipo === "sector" && (
        sectoresFijos.has(fila.sectorId) ||
        (fila.sectorId === "salud_mental" && !sectoresFijos.has("salud_mental"))
      ))
      .map((fila) => fila.etiqueta);
    const periodosOrigen = obtenerBloquesQueIntersectanMes({
      mesActivo: mesOrigen,
      fechaBase: estrategiaEnfermeros.fechaBase,
      duracionDias: estrategiaEnfermeros.duracionDias
    });
    const baseEfectiva = resolverAsignacionBaseRotacion3DiasEfectiva({
      rotacion3Dias: rotacion,
      periodos: periodosOrigen,
      filas: filasEnfermeros,
      filasFijas,
      asignacionesFijas,
      filasConfiguracion,
      personal: personalCanonico,
      categoria: "enfermero",
      posicionesNoAplicables: []
    });
    if (!baseEfectiva.ok) {
      return { ok: false, codigo: "BASE_ENFERMEROS", mensaje: "Falta la asignación base de Enfermeros." };
    }
    baseEnfermeros = baseEfectiva.asignacionBase;
    claveBaseEnfermeros = "asignacionBase";
    rotacionEnfermerosOrigen = {
      ...clonar(rotacion || {}),
      asignacionBase: clonar(baseEfectiva.asignacionBase)
    };
    bloquesDestino = obtenerBloquesQueIntersectanMes({
      mesActivo: mesDestino,
      fechaBase: estrategiaEnfermeros.fechaBase,
      duracionDias: estrategiaEnfermeros.duracionDias
    });
  } else {
    const base = obtenerUltimaBaseSemanal({
      estadoOrigen,
      categoria: "enfermeros",
      mesOrigen
    });
    if (!base) {
      return { ok: false, codigo: "BASE_ENFERMEROS", mensaje: "Falta la base de Enfermeros." };
    }
    baseEnfermeros = base.distribucion;
    claveBaseEnfermeros = base.clave;
  }

  const baseLic = obtenerUltimaBaseSemanal({
    estadoOrigen,
    categoria: "licenciados",
    mesOrigen
  });
  if (!baseLic) {
    return { ok: false, codigo: "BASE_LICENCIADOS", mensaje: "Falta la base de Licenciados." };
  }
  const validacionLic = validarDistribucionCategoria({
    distribucion: baseLic.distribucion,
    filas: filasLicenciados,
    personal: personalCanonico,
    categoria: "licenciado"
  });
  if (!validacionLic.ok) return { ...validacionLic, codigo: "BASE_LICENCIADOS" };

  const analisisEnfermeros = analizarDistribucionBaseEnfermeros({
    distribucionBase: baseEnfermeros,
    filas: filasEnfermeros,
    personal: personalCanonico
  });
  if (!analisisEnfermeros.ok) {
    return { ...analisisEnfermeros, codigo: "BASE_ENFERMEROS" };
  }

  const licencias = filtrarRegistrosQueIntersectanMes(estadoOrigen.licencias, mesDestino);
  const certificaciones = filtrarRegistrosQueIntersectanMes(
    estadoOrigen.certificaciones,
    mesDestino
  );
  const obtenerPosicionesMensualesAdicionales = (categoria) => {
    const posiciones = estadoDestino?.planillas?.[categoria]
      ?.posicionesMensualesAdicionales;
    return Array.isArray(posiciones) ? [...posiciones] : [];
  };
  const copiarSnapshotDestinoValido = (categoria) => {
    const snapshot = estadoDestino?.configuracionPlanilla?.[categoria];
    return esSnapshotConfiguracionPlanillaValido(snapshot) &&
      snapshot.turnoId === turnoId &&
      snapshot.categoria === categoria &&
      snapshot.mes === mesDestino
      ? copiarSnapshotConfiguracionPlanilla(snapshot)
      : null;
  };
  return {
    ok: true,
    turnoId,
    mesOrigen,
    mesDestino,
    revisionDestino: String(revisionDestino),
    destino,
    personal,
    personalCanonicoOrigen: personalCanonico,
    conteosPersonal: {
      total: personal.length,
      enfermeros: personal.filter((persona) => persona.categoria === "enfermero").length,
      licenciados: personal.filter((persona) => persona.categoria === "licenciado").length
    },
    licencias,
    certificaciones,
    configuracionPlanillaDestino: {
      enfermero: copiarSnapshotDestinoValido("enfermero"),
      licenciado: copiarSnapshotDestinoValido("licenciado")
    },
    borradoresConfiguracionPlanilla,
    configuracionLicenciadosOrigen: clonar(configuracionLicenciadosOrigen),
    enfermeros: {
      estrategia: estrategiaEnfermeros,
      filas: filasEnfermeros,
      base: clonar(baseEnfermeros),
      claveBase: claveBaseEnfermeros,
      analisis: analisisEnfermeros,
      bloquesDestino,
      sectoresCriticos: configuracionSectores.enfermero.sectoresCriticos,
      posicionesMensualesAdicionales:
        obtenerPosicionesMensualesAdicionales("enfermeros")
    },
    licenciados: {
      estrategia: estrategiaLicenciados,
      filas: filasLicenciados,
      base: clonar(baseLic.distribucion),
      claveBase: baseLic.clave,
      cantidadPersonas: validacionLic.cantidadPersonas,
      posicionesMensualesAdicionales:
        obtenerPosicionesMensualesAdicionales("licenciados")
    },
    rotacionEnfermerosOrigen,
    coberturaEnfermerosBase: clonar(
      obtenerCoberturaBase(
        estadoOrigen.planillas?.enfermeros,
        claveBaseEnfermeros
      )
    ),
    coberturaLicenciadosBase: clonar(
      obtenerCoberturaBase(
        estadoOrigen.planillas?.licenciados,
        baseLic.clave
      )
    )
  };
};

const filtrarReferenciaParaPadronDestino = ({
  referencia,
  personalDestino,
  personalCanonicoOrigen
}) => {
  if (referencia === "" || referencia === null || referencia === undefined) return referencia;
  const personaOrigen = resolverPersonaDesdeReferencia(referencia, personalCanonicoOrigen);
  if (!personaOrigen) return "";
  return (personalDestino || []).some(
    (persona) => String(persona?.id || "") === String(personaOrigen.id)
  ) ? clonar(referencia) : "";
};

const filtrarDistribucionParaPadronDestino = ({
  distribucion,
  personalDestino,
  personalCanonicoOrigen
}) => Object.fromEntries(
  Object.entries(esObjeto(distribucion) ? distribucion : {}).map(([fila, referencia]) => [
    fila,
    filtrarReferenciaParaPadronDestino({
      referencia,
      personalDestino,
      personalCanonicoOrigen
    })
  ])
);

export const construirEstadoMesNuevo = ({
  analisis,
  borradoresConfiguracionPlanilla,
  transicionLicenciadosV2
} = {}) => {
  if (!analisis?.ok) {
    return { ok: false, mensaje: "La preparación del mes no es válida." };
  }
  const validacionBorradores = validarBorradoresConfiguracionPlanilla({
    borradores: borradoresConfiguracionPlanilla || analisis.borradoresConfiguracionPlanilla,
    turno: analisis.turnoId,
    mesOrigen: analisis.mesOrigen
  });
  if (!validacionBorradores.ok) return validacionBorradores;
  const activarTransicionLicenciadosV2 = transicionLicenciadosV2?.activar === true;
  let resultadoTransicionLicenciadosV2 = null;
  if (activarTransicionLicenciadosV2) {
    const fijasRevisadas = Object.hasOwn(
      transicionLicenciadosV2,
      "asignacionesFijas"
    )
      ? transicionLicenciadosV2.asignacionesFijas
      : validacionBorradores.borradores.licenciado.asignacionesFijas;
    resultadoTransicionLicenciadosV2 = prepararTransicionLicenciadosV1aV2({
      configuracionOrigen: analisis.configuracionLicenciadosOrigen ||
        analisis.borradoresConfiguracionPlanilla?.licenciado,
      baseSemanalOrigen: analisis.licenciados.base,
      ...(Object.hasOwn(transicionLicenciadosV2, "filas")
        ? { filasDestinoV2: transicionLicenciadosV2.filas }
        : {}),
      prioridadDestinoV2: transicionLicenciadosV2.prioridadCoberturaSectorIds,
      asignacionesFijasOrigen: fijasRevisadas,
      personalDestino: analisis.personal.filter((persona) => persona?.categoria === "licenciado")
    });
    if (!resultadoTransicionLicenciadosV2.ok || !resultadoTransicionLicenciadosV2.aplicar) {
      return {
        ok: false,
        codigo: resultadoTransicionLicenciadosV2.motivo ||
          "TRANSICION_LICENCIADOS_V2_INVALIDA",
        mensaje: "La transición de Licenciados v2 requiere una configuración válida.",
        transicionLicenciadosV2: resultadoTransicionLicenciadosV2
      };
    }
    if (resultadoTransicionLicenciadosV2.requiereRevisionFijas ||
        resultadoTransicionLicenciadosV2.finalizable === false) {
      return {
        ok: false,
        codigo: "ASIGNACIONES_FIJAS_LICENCIADOS_V2_REQUIEREN_REVISION",
        mensaje: "Revisá las asignaciones fijas incompatibles antes de preparar Licenciados v2.",
        transicionLicenciadosV2: resultadoTransicionLicenciadosV2
      };
    }
  }
  for (const categoria of ["enfermero", "licenciado"]) {
    const borrador = categoria === "licenciado" && resultadoTransicionLicenciadosV2
      ? resultadoTransicionLicenciadosV2.configuracionDestino
      : validacionBorradores.borradores[categoria];
    const validacionFijas = validarAsignacionesFijasMensuales({
      asignaciones: borrador.asignacionesFijas,
      personal: analisis.personalCanonicoOrigen || analisis.personal,
      categoria,
      filas: borrador.filas
    });
    if (!validacionFijas.valido) {
      return {
        ok: false,
        codigo: "ASIGNACIONES_FIJAS_INVALIDAS",
        categoria,
        errores: validacionFijas.errores,
        mensaje: `Revisá las asignaciones fijas de ${
          categoria === "enfermero" ? "Enfermeros" : "Licenciados"
        } antes de preparar el mes.`
      };
    }
  }
  const personaIdsDestino = new Set(
    analisis.personal.map((persona) => obtenerPersonaIdCanonico(persona)).filter(Boolean)
  );
  const configuracionPlanilla = Object.fromEntries(
    ["enfermero", "licenciado"].map((categoria) => [
      categoria,
      (() => {
        const borrador = categoria === "licenciado" && resultadoTransicionLicenciadosV2
          ? resultadoTransicionLicenciadosV2.configuracionDestino
          : validacionBorradores.borradores[categoria];
        const destinoExistente = analisis.configuracionPlanillaDestino?.[categoria];
        return crearSnapshotConfiguracionPlanillaDesdeFilas({
          turno: analisis.turnoId,
          categoria,
          mes: analisis.mesDestino,
          filas: destinoExistente?.filas || borrador.filas,
          asignacionesFijas: borrador.asignacionesFijas.filter(
            ({ personaId }) => personaIdsDestino.has(String(personaId ?? "").trim())
          ),
          prioridadCoberturaSectorIds: borrador.prioridadCoberturaSectorIds,
          ...(Object.hasOwn(borrador, "estructuraLicenciadosVersion")
            ? { estructuraLicenciadosVersion: borrador.estructuraLicenciadosVersion }
            : {})
        });
      })()
    ])
  );
  const posicionAdicionalActiva = (categoria) => {
    const etiqueta = obtenerPosicionTurnanteMensual(
      categoria,
      configuracionPlanilla[categoria]
    );
    return etiqueta &&
    configuracionPlanilla[categoria].filas.some((fila) =>
      fila.tipo === "turnante" && fila.etiqueta === etiqueta && fila.activo === true
    ) ? [etiqueta] : [];
  };
  const posicionesEnfermeros = posicionAdicionalActiva("enfermero");
  const posicionesLicenciados = resultadoTransicionLicenciadosV2
    ? [...resultadoTransicionLicenciadosV2.posicionesMensualesAdicionalesDestino]
    : posicionAdicionalActiva("licenciado");
  const filtrarBaseSemanal = (distribucion) => filtrarDistribucionParaPadronDestino({
    distribucion,
    personalDestino: analisis.personal,
    personalCanonicoOrigen: analisis.personalCanonicoOrigen || analisis.personal
  });
  const filtrarCoberturaSemanal = (referencia) => filtrarReferenciaParaPadronDestino({
    referencia,
    personalDestino: analisis.personal,
    personalCanonicoOrigen: analisis.personalCanonicoOrigen || analisis.personal
  });
  const planillaLicBase = {
    ...crearPlanillaMensualVacia(),
    semana1: resultadoTransicionLicenciadosV2
      ? clonar(resultadoTransicionLicenciadosV2.baseSemanalDestino)
      : quitarTurnanteMensualDeDistribucion(
          filtrarBaseSemanal(analisis.licenciados.base),
          "licenciado",
          configuracionPlanilla.licenciado
        ),
    coberturaLibreSM: {}
  };
  if (posicionesLicenciados.length) {
    planillaLicBase.posicionesMensualesAdicionales = posicionesLicenciados;
  }
  const coberturaLic = analisis.coberturaLicenciadosBase;
  if (coberturaLic) {
    planillaLicBase.coberturaLibreSM.semana1 = filtrarCoberturaSemanal(coberturaLic);
  }

  let planillaEnfermeros;
  if (analisis.enfermeros.estrategia.tipo === "cada_3_dias") {
    const rotacionOrigen = analisis.rotacionEnfermerosOrigen;
    const clavesDestino = new Set(
      analisis.enfermeros.bloquesDestino.map((periodo) => periodo.clave)
    );
    const bloquesCompartidos = Object.fromEntries(
      Object.entries(rotacionOrigen.bloques || {}).flatMap(([clave, bloque]) =>
        clavesDestino.has(clave)
          ? [[clave, quitarTurnanteMensualDeDistribucion(
              filtrarBaseSemanal(bloque),
              "enfermero"
            )]]
          : []
      )
    );
    const coberturasCompartidas = Object.fromEntries(
      Object.entries(rotacionOrigen.coberturaLibreSM || {}).flatMap(
        ([clave, cobertura]) =>
          clavesDestino.has(clave)
            ? [[clave, filtrarCoberturaSemanal(cobertura)]]
            : []
      )
    );
    const rotacion = {
      ...clonar(rotacionOrigen),
      version: rotacionOrigen.version ?? 1,
      fechaBase:
        rotacionOrigen.fechaBase || analisis.enfermeros.estrategia.fechaBase,
      duracionDias:
        rotacionOrigen.duracionDias ||
        analisis.enfermeros.estrategia.duracionDias,
      asignacionBase: quitarTurnanteMensualDeDistribucion(
        filtrarBaseSemanal(analisis.enfermeros.base),
        "enfermero"
      ),
      bloques: bloquesCompartidos,
      coberturaLibreSM: coberturasCompartidas
    };
    planillaEnfermeros = {
      ...crearPlanillaMensualVacia(),
      rotacion3Dias: rotacion
    };
  } else {
    planillaEnfermeros = {
      ...crearPlanillaMensualVacia(),
      semana1: quitarTurnanteMensualDeDistribucion(
        filtrarBaseSemanal(analisis.enfermeros.base),
        "enfermero"
      ),
      coberturaLibreSM: {}
    };
    const cobertura = analisis.coberturaEnfermerosBase;
    if (cobertura) {
      planillaEnfermeros.coberturaLibreSM.semana1 = filtrarCoberturaSemanal(cobertura);
    }
  }

  if (posicionesEnfermeros.length) {
    planillaEnfermeros.posicionesMensualesAdicionales = posicionesEnfermeros;
  }

  const vacio = crearEstadoMensualVacio();
  const estado = normalizarEstadoMensual({
    ...vacio,
    configuracionPlanilla,
    personal: clonar(analisis.personal),
    planillas: {
      enfermeros: planillaEnfermeros,
      licenciados: planillaLicBase
    },
    licencias: clonar(analisis.licencias),
    certificaciones: clonar(analisis.certificaciones)
  });
  return {
    ok: true,
    estado,
    ...(resultadoTransicionLicenciadosV2
      ? { transicionLicenciadosV2: resultadoTransicionLicenciadosV2 }
      : {})
  };
};

export const validarContextoPreparacion = (esperado, actual) =>
  Boolean(
    esperado &&
    actual &&
    esperado.turnoId === actual.turnoId &&
    esperado.mesOrigen === actual.mesOrigen &&
    esperado.mesDestino === actual.mesDestino &&
    String(esperado.revisionDestino) === String(actual.revisionDestino)
  );
