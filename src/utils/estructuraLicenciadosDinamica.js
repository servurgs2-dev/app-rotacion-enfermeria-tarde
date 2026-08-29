export const VERSION_ESTRUCTURA_LICENCIADOS_LEGACY = 1;
export const VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA = 2;

export const CODIGO_PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA =
  "PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA";

export const TRANSICION_FILAS_LICENCIADOS_V1_A_V2 = Object.freeze({
  explora: "turnante_3"
});

export const TRANSICION_TURNANTES_ADICIONALES_LICENCIADOS_V1_A_V2 = Object.freeze({
  turnante_3: "turnante_4"
});

export const resolverVersionEstructuraLicenciados = (configuracion) => {
  const version = typeof configuracion === "number"
    ? configuracion
    : configuracion?.estructuraLicenciadosVersion;
  return version === VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
    ? VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
    : VERSION_ESTRUCTURA_LICENCIADOS_LEGACY;
};

const crearFilaSector = (sectorId, etiqueta, orden) => Object.freeze({
  filaId: `licenciado.sector.${sectorId}`,
  tipo: "sector",
  etiqueta,
  sectorId,
  turnanteId: null,
  ordinalTurnante: null,
  orden,
  activo: true
});

const crearFilaTurnante = (ordinal, orden) => Object.freeze({
  filaId: `licenciado.turnante.${ordinal}`,
  tipo: "turnante",
  etiqueta: `T${ordinal}`,
  sectorId: null,
  turnanteId: `turnante_${ordinal}`,
  ordinalTurnante: ordinal,
  orden,
  activo: true
});

export const FILAS_PLANILLA_LICENCIADOS_V2 = Object.freeze([
  crearFilaSector("triage_1", "Triage 1", 0),
  crearFilaSector("estabiliza", "Estabiliza", 1),
  crearFilaTurnante(1, 2),
  crearFilaSector("reanimacion", "Reanimación", 3),
  crearFilaSector("observacion_1", "Observación 1", 4),
  crearFilaTurnante(3, 5),
  crearFilaSector("triage_2", "Triage 2", 6),
  crearFilaSector("diagnostico", "Diagnóstico", 7),
  crearFilaSector("observacion_2", "Observación 2", 8),
  crearFilaTurnante(2, 9),
  crearFilaSector("preinternacion", "Preinternación", 10),
  crearFilaSector("salud_mental", "Salud Mental", 11)
]);

const crearDestino = ({
  id,
  nombre,
  componentes,
  sectorBaseOrigen,
  configurablePrioridad = false
}) => Object.freeze({
  id,
  nombre,
  combinado: componentes.length > 1,
  componentes: Object.freeze([...componentes]),
  sectorBaseOrigen,
  configurablePrioridad
});

export const CATALOGO_DESTINOS_OPERATIVOS_LICENCIADOS_V2 = Object.freeze({
  reanimacion: crearDestino({
    id: "reanimacion",
    nombre: "Reanimación",
    componentes: ["reanimacion"],
    sectorBaseOrigen: "reanimacion"
  }),
  sillones: crearDestino({
    id: "sillones",
    nombre: "Sillones",
    componentes: ["sillones"],
    sectorBaseOrigen: "reanimacion",
    configurablePrioridad: true
  }),
  diagnostico: crearDestino({
    id: "diagnostico",
    nombre: "Diagnóstico",
    componentes: ["diagnostico"],
    sectorBaseOrigen: "diagnostico"
  }),
  explora: crearDestino({
    id: "explora",
    nombre: "Explora",
    componentes: ["explora"],
    sectorBaseOrigen: "diagnostico",
    configurablePrioridad: true
  }),
  reanimacion_sillones: crearDestino({
    id: "reanimacion_sillones",
    nombre: "Reanimación + Sillones",
    componentes: ["reanimacion", "sillones"],
    sectorBaseOrigen: "reanimacion"
  }),
  diagnostico_explora: crearDestino({
    id: "diagnostico_explora",
    nombre: "Diagnóstico + Explora",
    componentes: ["diagnostico", "explora"],
    sectorBaseOrigen: "diagnostico"
  })
});

const crearResultado = ({
  dotacionEfectiva,
  modo,
  destinos,
  demandaAdicional = [],
  reanimacionSillones,
  diagnosticoExplora,
  delegarEscasez = false
}) => ({
  ok: true,
  version: VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA,
  dotacionEfectiva,
  modo,
  delegarEscasez,
  destinos: destinos.map((id) => CATALOGO_DESTINOS_OPERATIVOS_LICENCIADOS_V2[id]),
  demandaAdicional: [...demandaAdicional],
  pares: {
    reanimacionSillones,
    diagnosticoExplora
  }
});

const resolverPrioridadDiez = (prioridadTurno) => {
  if (!Array.isArray(prioridadTurno)) return null;
  const posicionesSillones = prioridadTurno.reduce(
    (indices, id, indice) => id === "sillones" ? [...indices, indice] : indices,
    []
  );
  const posicionesExplora = prioridadTurno.reduce(
    (indices, id, indice) => id === "explora" ? [...indices, indice] : indices,
    []
  );
  if (posicionesSillones.length !== 1 || posicionesExplora.length !== 1) return null;
  return posicionesSillones[0] < posicionesExplora[0] ? "sillones" : "explora";
};

export const resolverEstructuraOperativaLicenciadosDia = ({
  dotacionEfectiva,
  prioridadTurno = []
} = {}) => {
  if (!Number.isInteger(dotacionEfectiva) || dotacionEfectiva < 0) {
    return {
      ok: false,
      version: VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA,
      codigo: "DOTACION_EFECTIVA_LICENCIADOS_INVALIDA"
    };
  }

  if (dotacionEfectiva <= 9) {
    return crearResultado({
      dotacionEfectiva,
      modo: "combinados",
      destinos: ["reanimacion_sillones", "diagnostico_explora"],
      reanimacionSillones: "combinado",
      diagnosticoExplora: "combinado"
    });
  }

  if (dotacionEfectiva === 10) {
    const prioridad = resolverPrioridadDiez(prioridadTurno);
    if (!prioridad) {
      return {
        ok: false,
        version: VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA,
        dotacionEfectiva,
        codigo: CODIGO_PRIORIDAD_LICENCIADOS_DINAMICA_INCOMPLETA
      };
    }
    return prioridad === "sillones"
      ? crearResultado({
          dotacionEfectiva,
          modo: "separa_sillones",
          destinos: ["reanimacion", "sillones", "diagnostico_explora"],
          demandaAdicional: ["sillones"],
          reanimacionSillones: "separado",
          diagnosticoExplora: "combinado"
        })
      : crearResultado({
          dotacionEfectiva,
          modo: "separa_explora",
          destinos: ["reanimacion_sillones", "diagnostico", "explora"],
          demandaAdicional: ["explora"],
          reanimacionSillones: "combinado",
          diagnosticoExplora: "separado"
        });
  }

  return crearResultado({
    dotacionEfectiva,
    modo: "separados",
    destinos: ["reanimacion", "sillones", "diagnostico", "explora"],
    demandaAdicional: ["sillones", "explora"],
    reanimacionSillones: "separado",
    diagnosticoExplora: "separado"
  });
};
