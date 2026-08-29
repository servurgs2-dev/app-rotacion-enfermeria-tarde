import {
  crearConfiguracionPlanillaLicenciadosV2,
  validarConfiguracionPlanillaLicenciadosV2
} from "./configuracionPlanilla.js";
import {
  FILAS_PLANILLA_LICENCIADOS_V2,
  resolverVersionEstructuraLicenciados,
  TRANSICION_FILAS_LICENCIADOS_V1_A_V2,
  TRANSICION_TURNANTES_ADICIONALES_LICENCIADOS_V1_A_V2,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];
const objeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const copiar = (valor) => {
  if (Array.isArray(valor)) return valor.map(copiar);
  if (!objeto(valor)) return valor;
  return Object.fromEntries(Object.entries(valor).map(([clave, contenido]) => [clave, copiar(contenido)]));
};
const texto = (valor) => String(valor ?? "").trim();
const esLicenciado = (persona) => persona?.categoria === "licenciado";
const idFila = (fila) => fila?.tipo === "turnante" ? fila?.turnanteId : fila?.sectorId;
const tieneReferencia = (referencia) =>
  referencia !== "" && referencia !== null && referencia !== undefined;

const obtenerPersonaIdExplicito = (referencia, personalDestino) => {
  if (objeto(referencia)) return texto(referencia.personaId || referencia.id);
  const valor = texto(referencia);
  return lista(personalDestino).some((persona) => texto(persona?.id) === valor) ? valor : "";
};

const crearReferenciaDestino = (referencia, persona) => objeto(referencia)
  ? { ...copiar(referencia), personaId: texto(persona.id), nombre: texto(persona.nombre) }
  : { personaId: texto(persona.id), nombre: texto(persona.nombre) };

const obtenerReferenciaFila = ({ base, fila }) => {
  if (!fila) return undefined;
  if (Object.hasOwn(base, fila.etiqueta)) return base[fila.etiqueta];
  const identidad = idFila(fila);
  if (identidad && Object.hasOwn(base, identidad)) return base[identidad];
  if (fila.filaId && Object.hasOwn(base, fila.filaId)) return base[fila.filaId];
  return undefined;
};

const crearOmitida = ({ referencia, filaOrigen, destinoId, motivo, personaId = "" }) => ({
  personaId: personaId || obtenerPersonaIdExplicito(referencia, []),
  origen: idFila(filaOrigen) || filaOrigen?.etiqueta || null,
  destino: destinoId || null,
  motivo,
  referencia: copiar(referencia)
});

export const prepararTransicionLicenciadosV1aV2 = ({
  configuracionOrigen,
  baseSemanalOrigen = {},
  filasDestinoV2 = FILAS_PLANILLA_LICENCIADOS_V2,
  prioridadDestinoV2,
  asignacionesFijasOrigen = configuracionOrigen?.asignacionesFijas,
  personalDestino = []
} = {}) => {
  if (
    resolverVersionEstructuraLicenciados(configuracionOrigen) ===
    VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
  ) {
    return {
      ok: true,
      aplicar: false,
      motivo: "ORIGEN_LICENCIADOS_YA_V2"
    };
  }

  const filasDestino = lista(filasDestinoV2).map(copiar);
  const personalLicenciadosDestino = lista(personalDestino).filter(esLicenciado);
  const sectoresDestino = new Set(filasDestino
    .filter((fila) => fila?.tipo === "sector" && fila.activo !== false)
    .map((fila) => fila.sectorId));
  const fijasOrigen = lista(asignacionesFijasOrigen).map(copiar);
  const asignacionesFijasCompatibles = fijasOrigen.filter((asignacion) =>
    sectoresDestino.has(asignacion?.sectorId)
  );
  const asignacionesFijasIncompatibles = fijasOrigen.filter((asignacion) =>
    !sectoresDestino.has(asignacion?.sectorId)
  );
  const creacion = crearConfiguracionPlanillaLicenciadosV2({
    prioridadCoberturaSectorIds: prioridadDestinoV2,
    filas: filasDestino,
    asignacionesFijas: asignacionesFijasCompatibles
  });
  const validacion = validarConfiguracionPlanillaLicenciadosV2(creacion.configuracion);
  if (!creacion.ok || !validacion.ok) {
    return {
      ok: false,
      aplicar: false,
      motivo: "CONFIGURACION_DESTINO_LICENCIADOS_V2_INVALIDA",
      requierePrioridadV2: true,
      errores: [...(creacion.errores || []), ...(validacion.errores || [])]
    };
  }

  const filasOrigen = lista(configuracionOrigen?.filas);
  const filasOrigenPorId = new Map(filasOrigen.map((fila) => [idFila(fila), fila]));
  const personalPorId = new Map(personalLicenciadosDestino
    .map((persona) => [texto(persona?.id), persona])
    .filter(([personaId]) => Boolean(personaId)));
  const baseOrigen = objeto(baseSemanalOrigen) ? baseSemanalOrigen : {};
  const baseSemanalDestino = Object.fromEntries(
    filasDestino.filter((fila) => fila.activo !== false).map((fila) => [fila.etiqueta, ""])
  );
  const asignados = new Set();
  const referenciasTransformadas = [];
  const referenciasOmitidas = [];

  const asignar = ({ filaOrigen, filaDestino, referencia, motivo = null }) => {
    if (!tieneReferencia(referencia)) return;
    const personaId = obtenerPersonaIdExplicito(referencia, personalLicenciadosDestino);
    const persona = personalPorId.get(personaId);
    if (!persona) {
      referenciasOmitidas.push(crearOmitida({
        referencia,
        filaOrigen,
        destinoId: idFila(filaDestino),
        motivo: "PERSONA_FUERA_PADRON_DESTINO",
        personaId
      }));
      return;
    }
    if (!filaDestino || filaDestino.activo === false) {
      referenciasOmitidas.push(crearOmitida({
        referencia,
        filaOrigen,
        destinoId: idFila(filaDestino),
        motivo: "FILA_DESTINO_INACTIVA",
        personaId
      }));
      return;
    }
    if (asignados.has(personaId)) {
      referenciasOmitidas.push(crearOmitida({
        referencia,
        filaOrigen,
        destinoId: idFila(filaDestino),
        motivo: "IDENTIDAD_DUPLICADA_EN_ORIGEN",
        personaId
      }));
      return;
    }
    baseSemanalDestino[filaDestino.etiqueta] = crearReferenciaDestino(referencia, persona);
    asignados.add(personaId);
    if (motivo) {
      referenciasTransformadas.push({
        personaId,
        origen: idFila(filaOrigen),
        destino: idFila(filaDestino),
        motivo
      });
    }
  };

  filasDestino.forEach((filaDestino) => {
    if (filaDestino.turnanteId === "turnante_3") return;
    const filaOrigen = filasOrigenPorId.get(idFila(filaDestino));
    asignar({
      filaOrigen,
      filaDestino,
      referencia: obtenerReferenciaFila({ base: baseOrigen, fila: filaOrigen })
    });
  });

  const filaExplora = filasOrigenPorId.get("explora");
  const filaT3Destino = filasDestino.find((fila) =>
    fila.turnanteId === TRANSICION_FILAS_LICENCIADOS_V1_A_V2.explora
  );
  asignar({
    filaOrigen: filaExplora,
    filaDestino: filaT3Destino,
    referencia: obtenerReferenciaFila({ base: baseOrigen, fila: filaExplora }),
    motivo: "TRANSICION_EXPLORA_A_T3"
  });

  const filaT3Origen = filasOrigenPorId.get("turnante_3");
  const t3AdicionalActivo = Boolean(filaT3Origen && filaT3Origen.activo !== false) ||
    lista(configuracionOrigen?.posicionesMensualesAdicionales).includes("T3");
  const posicionesMensualesAdicionalesDestino = t3AdicionalActivo ? ["T4"] : [];
  if (t3AdicionalActivo) {
    const filaT4Destino = {
      filaId: "licenciado.turnante.4",
      tipo: "turnante",
      etiqueta: "T4",
      sectorId: null,
      turnanteId: TRANSICION_TURNANTES_ADICIONALES_LICENCIADOS_V1_A_V2.turnante_3,
      ordinalTurnante: 4,
      orden: filasDestino.length,
      activo: true
    };
    baseSemanalDestino.T4 = "";
    asignar({
      filaOrigen: filaT3Origen,
      filaDestino: filaT4Destino,
      referencia: obtenerReferenciaFila({ base: baseOrigen, fila: filaT3Origen }),
      motivo: "TRANSICION_T3_ADICIONAL_A_T4"
    });
  }

  for (const sectorId of ["reanimacion_sillones", "diagnostico_explora"]) {
    const filaOrigen = filasOrigenPorId.get(sectorId);
    const referencia = obtenerReferenciaFila({ base: baseOrigen, fila: filaOrigen });
    if (tieneReferencia(referencia)) {
      referenciasOmitidas.push(crearOmitida({
        referencia,
        filaOrigen,
        motivo: "FILA_LEGACY_SIN_CONVERSION_AUTOMATICA",
        personaId: obtenerPersonaIdExplicito(referencia, personalLicenciadosDestino)
      }));
    }
  }

  const personasSinAsignar = [...personalPorId.values()]
    .filter((persona) => !asignados.has(texto(persona.id)))
    .map(copiar);
  const requiereRevisionFijas = asignacionesFijasIncompatibles.length > 0;

  return {
    ok: true,
    aplicar: true,
    finalizable: !requiereRevisionFijas,
    configuracionDestino: creacion.configuracion,
    baseSemanalDestino,
    posicionesMensualesAdicionalesDestino,
    personasSinAsignar,
    referenciasTransformadas,
    referenciasOmitidas,
    asignacionesFijasCompatibles,
    asignacionesFijasIncompatibles,
    requiereRevisionFijas,
    requierePrioridadV2: false,
    diagnosticos: referenciasOmitidas.map(({ motivo, personaId, origen }) => ({
      codigo: motivo,
      personaId,
      origen
    }))
  };
};
