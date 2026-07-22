import { crearReferenciaPersona } from "./referenciasPersonas.js";
import {
  obtenerClaveIdentidadPersona
} from "./identidadPersonas.js";
import {
  obtenerEstadoAsistencia,
  obtenerPersonasPrevistas
} from "./asistenciaPersonas.js";
import { normalizar } from "./texto.js";

const esObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const clonarSerializable = (valor) => JSON.parse(JSON.stringify(valor));
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
  sectoresReales = []
}) => {
  const previstas = obtenerPersonasPrevistas(asignaciones);
  const asistenciaPrevistas = Object.fromEntries(
    previstas.map((persona) => [
      obtenerClaveIdentidadPersona(persona),
      obtenerEstadoAsistencia(asistencia, persona)
    ])
  );
  const sectoresSinCobertura = (Array.isArray(sectoresReales) ? sectoresReales : [])
    .filter((sector) => !asignaciones.some(
      (asignacion) => normalizar(asignacion?.nombre) === normalizar(sector) && asignacion?.enfermero
    ));

  return clonarSerializable({
    fecha,
    tipo,
    resumen: {
      conteos: { ...(resumen?.conteos || {}) },
      alertas: Array.isArray(resumen?.alertas) ? resumen.alertas : []
    },
    asignaciones: (Array.isArray(asignaciones) ? asignaciones : [])
      .filter((asignacion) => asignacion?.tipo !== "divider")
      .map((asignacion) => ({
        sector: asignacion.nombre,
        persona: crearReferenciaPersona(asignacion.enfermero),
        tipo: asignacion.tipo || "sector",
        ...(asignacion.reemplazo ? { reemplazo: true } : {}),
        ...(asignacion.sacrificado ? { sacrificado: true } : {}),
        ...(asignacion.coberturaLibreSM ? { coberturaLibreSM: true } : {})
      })),
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

export const snapshotAAsignacionesVisibles = (snapshot) =>
  (Array.isArray(snapshot?.asignaciones) ? snapshot.asignaciones : []).map(
    (asignacion) => ({
      nombre: asignacion.sector,
      enfermero: asignacion.persona
        ? { id: asignacion.persona.personaId, nombre: asignacion.persona.nombre }
        : null,
      tipo: asignacion.tipo,
      reemplazo: asignacion.reemplazo,
      sacrificado: asignacion.sacrificado,
      coberturaLibreSM: asignacion.coberturaLibreSM
    })
  );

export const quitarCierresDeEstadoCopiado = (estado) => {
  const copia = clonarSerializable(estado);
  for (const categoria of ["enfermeros", "licenciados"]) {
    if (esObjeto(copia?.calendario?.[categoria])) {
      copia.calendario[categoria].cierresDia = {};
    }
  }
  return copia;
};
