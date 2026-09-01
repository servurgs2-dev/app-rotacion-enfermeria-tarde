import { crearReferenciaPersona } from "./referenciasPersonas.js";
import {
  obtenerClaveIdentidadPersona
} from "./identidadPersonas.js";
import {
  obtenerEstadoAsistencia,
  obtenerPersonasPrevistas
} from "./asistenciaPersonas.js";
import { normalizar } from "./texto.js";
import { quitarGeneracionFlexible } from "./generacionFlexiblePlanilla.js";
import {
  obtenerClaveIdentidadOperativa,
  resolverIdentidadOperativaAsignacion
} from "./identidadOperativaAsignaciones.js";

const esObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const clonarSerializable = (valor) => JSON.parse(JSON.stringify(valor));
export const VERSION_SNAPSHOT_CIERRE_ACTUAL = 2;

const CAMPOS_IDENTIDAD_ASIGNACION_V2 = Object.freeze([
  "sectorId",
  "filaId",
  "turnanteId",
  "groupId",
  "syntheticId",
  "destinoId"
]);

const copiarCamposDefinidos = (origen, campos) => Object.fromEntries(
  campos
    .filter((campo) => origen?.[campo] !== undefined && origen?.[campo] !== null)
    .map((campo) => [campo, origen[campo]])
);

const crearReferenciaPersonaSnapshotV2 = (persona) => {
  const referencia = crearReferenciaPersona(persona);
  if (!referencia) return null;
  return {
    ...referencia,
    ...(persona?.esTurnante === true ? { esTurnante: true } : {}),
    ...(persona?.esExtra === true ? { esExtra: true } : {})
  };
};

const crearAsignacionSnapshotV2 = (asignacion) => ({
  sector: asignacion.nombre,
  ...(asignacion.etiqueta !== undefined ? { etiqueta: asignacion.etiqueta } : {}),
  persona: crearReferenciaPersonaSnapshotV2(asignacion.enfermero),
  tipo: asignacion.tipo || "sector",
  ...copiarCamposDefinidos(asignacion, CAMPOS_IDENTIDAD_ASIGNACION_V2),
  ...(asignacion.origenCoberturaAutomaticaSectorId
    ? { origenCoberturaAutomaticaSectorId: asignacion.origenCoberturaAutomaticaSectorId }
    : {}),
  ...(asignacion.reemplazo ? { reemplazo: true } : {}),
  ...(asignacion.sacrificado ? { sacrificado: true } : {}),
  ...(asignacion.coberturaLibreSM ? { coberturaLibreSM: true } : {}),
  ...(asignacion.vacioManual ? { vacioManual: true } : {}),
  ...(asignacion.etiquetaVacio !== undefined ? { etiquetaVacio: asignacion.etiquetaVacio } : {})
});
const normalizarResponsableCierre = (referencia) => {
  const personaId = String(referencia?.personaId ?? "").trim();
  if (!personaId) return null;
  return {
    personaId,
    nombre: String(referencia?.nombre ?? "").trim()
  };
};

const referenciasUnicas = (personas) => [
  ...new Map(
    (Array.isArray(personas) ? personas : [])
      .map((persona) => [obtenerClaveIdentidadPersona(persona), persona])
      .filter(([clave]) => Boolean(clave))
  ).values()
].map(crearReferenciaPersona).filter(Boolean);

export const obtenerResponsablesCierre = (personal) =>
  (Array.isArray(personal) ? personal : [])
    .filter((persona) => persona?.categoria === "licenciado" && String(persona?.id ?? "").trim())
    .sort((a, b) => String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es"));

export const crearSnapshotCierreTurno = ({
  fecha,
  tipo,
  resumen,
  asignaciones,
  asistencia,
  libres,
  licencias,
  certificaciones,
  noDisponibles,
  extrasRegistrados,
  destinosOperativos,
  sectoresReales = []
}) => {
  const previstas = obtenerPersonasPrevistas(asignaciones);
  const asistenciaPrevistas = Object.fromEntries(
    previstas.map((persona) => [
      obtenerClaveIdentidadPersona(persona),
      obtenerEstadoAsistencia(asistencia, persona)
    ])
  );
  const asignacionesPorIdentidad = new Map((Array.isArray(asignaciones) ? asignaciones : [])
    .flatMap((asignacion) => {
      const clave = obtenerClaveIdentidadOperativa(
        resolverIdentidadOperativaAsignacion(asignacion)
      );
      return clave ? [[clave, asignacion]] : [];
    }));
  const destinosUnicos = new Map();
  if (Array.isArray(destinosOperativos)) {
    destinosOperativos.forEach((destino) => {
      if (!destino || destino.tipo === "divider") return;
      const identidad = resolverIdentidadOperativaAsignacion(destino);
      const clave = obtenerClaveIdentidadOperativa(identidad);
      if (!clave || identidad?.tipoIdentidad === "turnante" || destinosUnicos.has(clave)) return;
      destinosUnicos.set(clave, {
        etiqueta: destino.etiqueta || destino.nombre,
        asignacion: asignacionesPorIdentidad.get(clave)
      });
    });
  }
  const sectoresSinCobertura = Array.isArray(destinosOperativos)
    ? [...destinosUnicos.values()]
      .filter(({ asignacion }) => !asignacion?.enfermero)
      .map(({ etiqueta }) => etiqueta)
    : (Array.isArray(sectoresReales) ? sectoresReales : [])
      .filter((sector) => !asignaciones.some(
        (asignacion) => normalizar(asignacion?.nombre) === normalizar(sector) && asignacion?.enfermero
      ));

  return clonarSerializable({
    versionSnapshot: VERSION_SNAPSHOT_CIERRE_ACTUAL,
    fecha,
    tipo,
    resumen: {
      conteos: { ...(resumen?.conteos || {}) },
      alertas: Array.isArray(resumen?.alertas) ? resumen.alertas : []
    },
    asignaciones: (Array.isArray(asignaciones) ? asignaciones : [])
      .filter((asignacion) => asignacion?.tipo !== "divider")
      .map(crearAsignacionSnapshotV2),
    asistencia: asistenciaPrevistas,
    personasPrevistas: referenciasUnicas(previstas),
    libres: referenciasUnicas(libres),
    licencias: referenciasUnicas(licencias),
    certificaciones: referenciasUnicas(certificaciones),
    noDisponibles: referenciasUnicas(noDisponibles),
    extrasRegistrados: referenciasUnicas(extrasRegistrados),
    sectoresSinCobertura
  });
};

export const estaFechaCategoriaCerrada = (cierresDia, fecha) =>
  cierresDia?.[fecha]?.estado === "cerrado";

export const obtenerUltimaVersionCierre = (cierresDia, fecha) => {
  const cierre = cierresDia?.[fecha];
  if (!esObjeto(cierre) || !Array.isArray(cierre.versiones)) return null;
  return cierre.versiones.find(
    (version) => version?.revision === cierre.revisionActual
  ) || cierre.versiones.at(-1) || null;
};

export const cerrarFechaCategoria = ({
  cierresDia,
  fecha,
  usuario,
  responsableCierre,
  snapshot,
  fechaHora = new Date().toISOString()
}) => {
  const responsable = normalizarResponsableCierre(responsableCierre);
  if (!responsable) return esObjeto(cierresDia) ? cierresDia : {};
  const base = esObjeto(cierresDia) ? cierresDia : {};
  const anterior = esObjeto(base[fecha]) ? base[fecha] : {};
  const revision = Number(anterior.revisionActual || 0) + 1;
  const version = {
    revision,
    cerradoEn: fechaHora,
    cerradoPor: usuario,
    responsableCierre: responsable,
    snapshot: clonarSerializable(snapshot)
  };
  return {
    ...base,
    [fecha]: {
      ...anterior,
      estado: "cerrado",
      revisionActual: revision,
      versiones: [...(Array.isArray(anterior.versiones) ? anterior.versiones : []), version],
      historial: [
        ...(Array.isArray(anterior.historial) ? anterior.historial : []),
        { accion: "cerrado", revision, fechaHora, usuario, responsableCierre: responsable }
      ]
    }
  };
};

export const reabrirFechaCategoria = ({
  cierresDia,
  fecha,
  usuario,
  fechaHora = new Date().toISOString()
}) => {
  const base = esObjeto(cierresDia) ? cierresDia : {};
  const anterior = base[fecha];
  if (!esObjeto(anterior) || anterior.estado !== "cerrado") return base;
  return {
    ...base,
    [fecha]: {
      ...anterior,
      estado: "reabierto",
      historial: [
        ...(Array.isArray(anterior.historial) ? anterior.historial : []),
        {
          accion: "reabierto",
          revision: anterior.revisionActual,
          fechaHora,
          usuario
        }
      ]
    }
  };
};

export const snapshotAAsignacionesVisibles = (snapshot) => {
  const esVersion2 = Number(snapshot?.versionSnapshot) === VERSION_SNAPSHOT_CIERRE_ACTUAL;
  return (Array.isArray(snapshot?.asignaciones) ? snapshot.asignaciones : []).map(
    (asignacion) => ({
      nombre: asignacion.sector,
      enfermero: asignacion.persona
        ? {
            id: asignacion.persona.personaId,
            nombre: asignacion.persona.nombre,
            ...(esVersion2 && asignacion.persona.esTurnante === true ? { esTurnante: true } : {}),
            ...(esVersion2 && asignacion.persona.esExtra === true ? { esExtra: true } : {})
          }
        : null,
      tipo: asignacion.tipo,
      ...(esVersion2 ? copiarCamposDefinidos(asignacion, [
        "etiqueta",
        ...CAMPOS_IDENTIDAD_ASIGNACION_V2,
        "origenCoberturaAutomaticaSectorId",
        "etiquetaVacio"
      ]) : {}),
      reemplazo: asignacion.reemplazo,
      sacrificado: asignacion.sacrificado,
      coberturaLibreSM: asignacion.coberturaLibreSM,
      ...(esVersion2 && asignacion.vacioManual ? { vacioManual: true } : {})
    })
  );
};

const copiarListaSnapshot = (valor) => clonarSerializable(Array.isArray(valor) ? valor : []);

export const resolverDatosPresentacionCierreTurno = ({
  snapshot,
  reconstruccion = {}
} = {}) => {
  if (!snapshot) {
    return {
      fuente: "reconstruccion_operativa",
      ...reconstruccion
    };
  }
  return {
    fuente: "snapshot_cierre",
    asignaciones: snapshotAAsignacionesVisibles(snapshot),
    resumen: esObjeto(snapshot.resumen) ? clonarSerializable(snapshot.resumen) : null,
    asistencia: esObjeto(snapshot.asistencia) ? clonarSerializable(snapshot.asistencia) : {},
    personasPrevistas: copiarListaSnapshot(snapshot.personasPrevistas),
    libres: copiarListaSnapshot(snapshot.libres),
    licencias: copiarListaSnapshot(snapshot.licencias),
    certificaciones: copiarListaSnapshot(snapshot.certificaciones),
    noDisponibles: copiarListaSnapshot(snapshot.noDisponibles),
    extrasRegistrados: copiarListaSnapshot(snapshot.extrasRegistrados),
    sectoresSinCobertura: copiarListaSnapshot(snapshot.sectoresSinCobertura)
  };
};

export const quitarCierresDeEstadoCopiado = (estado) => {
  const copia = clonarSerializable(estado);
  if (esObjeto(copia?.planillas?.enfermeros)) {
    copia.planillas.enfermeros = quitarGeneracionFlexible(
      copia.planillas.enfermeros
    );
  }
  for (const categoria of ["enfermeros", "licenciados"]) {
    if (esObjeto(copia?.calendario?.[categoria])) {
      copia.calendario[categoria].cierresDia = {};
    }
  }
  return copia;
};
