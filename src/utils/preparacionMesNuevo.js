import { configuracionSectores } from "../data/sectores.js";
import { obtenerEstrategiaRotacionPlanilla } from "../config/turnos.js";
import {
  crearEstadoMensualVacio,
  crearPlanillaMensualVacia,
  normalizarEstadoMensual
} from "./estadoMensual.js";
import { obtenerSemanasDelMes } from "./fechas.js";
import { obtenerBloquesQueIntersectanMes } from "./periodosRotacionPlanilla.js";
import {
  tieneAsignacionBaseRotacion3Dias
} from "./continuidadRotacionPlanilla.js";
import { tieneAsignacionesUtiles } from "./rotacionPlanilla.js";
import {
  analizarDistribucionBaseEnfermeros
} from "./generacionFlexiblePlanilla.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { tieneContenidoSignificativo } from "./limpiezaSegura.js";
import {
  obtenerFilasBasePlanilla,
  quitarTurnanteMensualDeDistribucion
} from "./turnanteMensual.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const clonar = (valor) => {
  if (Array.isArray(valor)) return valor.map(clonar);
  if (!esObjeto(valor)) return valor;
  return Object.fromEntries(
    Object.entries(valor).map(([clave, contenido]) => [clave, clonar(contenido)])
  );
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
    "personal", "planillas", "calendario", "licencias", "certificaciones"
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
  const filasEnfermeros = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
  const filasLicenciados = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
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
  if (estrategiaEnfermeros.tipo === "cada_3_dias") {
    const rotacion = estadoOrigen.planillas?.enfermeros?.rotacion3Dias;
    if (!tieneAsignacionBaseRotacion3Dias(rotacion)) {
      return { ok: false, codigo: "BASE_ENFERMEROS", mensaje: "Falta la asignación base de Enfermeros." };
    }
    baseEnfermeros = rotacion.asignacionBase;
    claveBaseEnfermeros = "asignacionBase";
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
    personal,
    categoria: "licenciado"
  });
  if (!validacionLic.ok) return { ...validacionLic, codigo: "BASE_LICENCIADOS" };

  const analisisEnfermeros = analizarDistribucionBaseEnfermeros({
    distribucionBase: baseEnfermeros,
    filas: filasEnfermeros,
    personal
  });
  if (!analisisEnfermeros.ok) {
    return { ...analisisEnfermeros, codigo: "BASE_ENFERMEROS" };
  }

  const licencias = filtrarRegistrosQueIntersectanMes(estadoOrigen.licencias, mesDestino);
  const certificaciones = filtrarRegistrosQueIntersectanMes(
    estadoOrigen.certificaciones,
    mesDestino
  );
  return {
    ok: true,
    turnoId,
    mesOrigen,
    mesDestino,
    revisionDestino: String(revisionDestino),
    destino,
    personal,
    conteosPersonal: {
      total: personal.length,
      enfermeros: personal.filter((persona) => persona.categoria === "enfermero").length,
      licenciados: personal.filter((persona) => persona.categoria === "licenciado").length
    },
    licencias,
    certificaciones,
    enfermeros: {
      estrategia: estrategiaEnfermeros,
      filas: filasEnfermeros,
      base: clonar(baseEnfermeros),
      claveBase: claveBaseEnfermeros,
      analisis: analisisEnfermeros,
      bloquesDestino,
      sectoresCriticos: configuracionSectores.enfermero.sectoresCriticos
    },
    licenciados: {
      estrategia: estrategiaLicenciados,
      filas: filasLicenciados,
      base: clonar(baseLic.distribucion),
      claveBase: baseLic.clave,
      cantidadPersonas: validacionLic.cantidadPersonas
    },
    rotacionEnfermerosOrigen: clonar(
      estadoOrigen.planillas?.enfermeros?.rotacion3Dias || {}
    ),
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

export const construirEstadoMesNuevo = ({ analisis } = {}) => {
  if (!analisis?.ok) {
    return { ok: false, mensaje: "La preparación del mes no es válida." };
  }
  const planillaLicBase = {
    ...crearPlanillaMensualVacia(),
    semana1: quitarTurnanteMensualDeDistribucion(
      clonar(analisis.licenciados.base),
      "licenciado"
    ),
    coberturaLibreSM: {}
  };
  const coberturaLic = analisis.coberturaLicenciadosBase;
  if (coberturaLic) planillaLicBase.coberturaLibreSM.semana1 = clonar(coberturaLic);

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
              clonar(bloque),
              "enfermero"
            )]]
          : []
      )
    );
    const coberturasCompartidas = Object.fromEntries(
      Object.entries(rotacionOrigen.coberturaLibreSM || {}).flatMap(
        ([clave, cobertura]) =>
          clavesDestino.has(clave) ? [[clave, clonar(cobertura)]] : []
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
        clonar(analisis.enfermeros.base),
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
        clonar(analisis.enfermeros.base),
        "enfermero"
      ),
      coberturaLibreSM: {}
    };
    const cobertura = analisis.coberturaEnfermerosBase;
    if (cobertura) {
      planillaEnfermeros.coberturaLibreSM.semana1 = clonar(cobertura);
    }
  }

  const vacio = crearEstadoMensualVacio();
  const estado = normalizarEstadoMensual({
    ...vacio,
    personal: clonar(analisis.personal),
    planillas: {
      enfermeros: planillaEnfermeros,
      licenciados: planillaLicBase
    },
    licencias: clonar(analisis.licencias),
    certificaciones: clonar(analisis.certificaciones)
  });
  return { ok: true, estado };
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
