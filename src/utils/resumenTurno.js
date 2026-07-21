import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import {
  ESTADOS_ASISTENCIA,
  obtenerEstadoAsistencia,
  obtenerPersonasPrevistas,
  resumirAsistencia
} from "./asistenciaPersonas.js";
import { normalizar } from "./texto.js";

const clavesPersonas = (personas) => new Set(
  (Array.isArray(personas) ? personas : [])
    .map(obtenerClaveIdentidadPersona)
    .filter(Boolean)
);

const contarPersonas = (personas) => clavesPersonas(personas).size;

export const crearResumenTurno = ({
  asignaciones = [],
  asistencia = {},
  libres = [],
  licencias = [],
  certificaciones = [],
  noDisponibles = [],
  extras = [],
  sectoresReales = [],
  sectoresCriticos = [],
  sectoresSaludMental = []
} = {}) => {
  const previstas = obtenerPersonasPrevistas(asignaciones);
  const resumenAsistencia = resumirAsistencia(previstas, asistencia);
  const clavesLibres = clavesPersonas(libres);
  const clavesLicencias = clavesPersonas(licencias);
  const clavesCertificaciones = clavesPersonas(certificaciones);
  const clavesNoDisponibles = clavesPersonas(noDisponibles);
  const criticos = new Set(sectoresCriticos.map(normalizar));
  const saludMental = new Set(sectoresSaludMental.map(normalizar));
  const asignacionesPorSector = new Map();

  asignaciones.forEach((asignacion) => {
    const sector = normalizar(asignacion?.nombre);
    if (sector) asignacionesPorSector.set(sector, asignacion);
  });

  const sectoresVacios = sectoresReales
    .map((sector) => ({ sector, asignacion: asignacionesPorSector.get(normalizar(sector)) }))
    .filter(({ asignacion }) => !asignacion?.enfermero);

  const alertas = new Map();
  const agregarAlerta = (alerta) => {
    if (!alertas.has(alerta.id)) alertas.set(alerta.id, alerta);
  };

  sectoresVacios.forEach(({ sector }) => {
    const claveSector = normalizar(sector);
    if (saludMental.has(claveSector)) {
      agregarAlerta({
        id: `salud-mental-sin-cobertura:${claveSector}`,
        nivel: "critica",
        tipo: "salud_mental_sin_cobertura",
        mensaje: `${sector} está sin cobertura.`
      });
    } else if (criticos.has(claveSector)) {
      agregarAlerta({
        id: `sector-critico-sin-cobertura:${claveSector}`,
        nivel: "critica",
        tipo: "sector_critico_sin_cobertura",
        mensaje: `${sector} está sin cobertura.`
      });
    } else {
      agregarAlerta({
        id: `sector-sin-cobertura:${claveSector}`,
        nivel: "informacion",
        tipo: "sector_sin_cobertura",
        mensaje: `${sector} está sin cobertura.`
      });
    }
  });

  const apariciones = new Map();
  asignaciones.forEach((asignacion) => {
    const persona = asignacion?.enfermero;
    const clave = obtenerClaveIdentidadPersona(persona);
    if (!clave) return;
    const actual = apariciones.get(clave) || { persona, cantidad: 0 };
    actual.cantidad += 1;
    apariciones.set(clave, actual);
  });

  apariciones.forEach(({ persona, cantidad }, clave) => {
    const nombre = persona.nombre || "Persona sin nombre";
    if (cantidad > 1) {
      agregarAlerta({
        id: `persona-duplicada:${clave}`,
        nivel: "advertencia",
        tipo: "persona_duplicada",
        mensaje: `${nombre} aparece asignada más de una vez.`
      });
    }
    const condiciones = [
      [clavesLibres, "libre", "figura libre"],
      [clavesLicencias, "licencia", "tiene licencia vigente"],
      [clavesCertificaciones, "certificacion", "está certificada"],
      [clavesNoDisponibles, "no_disponible", "figura no disponible"]
    ];
    condiciones.forEach(([claves, tipo, texto]) => {
      if (claves.has(clave)) {
        agregarAlerta({
          id: `persona-${tipo}:${clave}`,
          nivel: "advertencia",
          tipo: `persona_${tipo}`,
          mensaje: `${nombre} está asignada pero ${texto}.`
        });
      }
    });
    if (obtenerEstadoAsistencia(asistencia, persona) === ESTADOS_ASISTENCIA.AUSENTE) {
      agregarAlerta({
        id: `persona-ausente:${clave}`,
        nivel: "advertencia",
        tipo: "persona_ausente_asignada",
        mensaje: `${nombre} está asignada pero marcada ausente.`
      });
    }
  });

  if (resumenAsistencia.pendiente > 0) {
    agregarAlerta({
      id: "asistencia-pendiente",
      nivel: "informacion",
      tipo: "asistencia_pendiente",
      mensaje: `${resumenAsistencia.pendiente} funcionario${resumenAsistencia.pendiente === 1 ? "" : "s"} todavía ${resumenAsistencia.pendiente === 1 ? "está pendiente" : "están pendientes"} de asistencia.`
    });
  }

  return {
    conteos: {
      previstos: resumenAsistencia.previstos,
      presentes: resumenAsistencia.presente,
      ausentes: resumenAsistencia.ausente,
      pendientes: resumenAsistencia.pendiente,
      libres: contarPersonas(libres),
      licencias: contarPersonas(licencias),
      certificaciones: contarPersonas(certificaciones),
      extras: contarPersonas(extras),
      sectoresSinCobertura: sectoresVacios.length
    },
    alertas: [...alertas.values()]
  };
};
