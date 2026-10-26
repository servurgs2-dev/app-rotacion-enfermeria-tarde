import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import {
  obtenerPersonasPrevistas,
  resumirAsistencia
} from "./asistenciaPersonas.js";
import { construirReporteNovedades } from "./reporteNovedades.js";
import { normalizar } from "./texto.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

const personasUnicas = (personas) => [
  ...new Map(
    lista(personas)
      .map((persona) => [obtenerClaveIdentidadPersona(persona), persona])
      .filter(([clave]) => Boolean(clave))
  ).values()
];

const detallesNoDisponiblesUnicos = (detalles) => [
  ...new Map(
    lista(detalles).map((detalle, indice) => {
      const clave = obtenerClaveIdentidadPersona(detalle?.persona || detalle) ||
        detalle?.registro?.id || detalle?.id || `detalle:${indice}`;
      return [clave, detalle];
    })
  ).values()
];

const obtenerSinAsignar = (asignaciones) => personasUnicas(
  lista(asignaciones)
    .filter((asignacion) =>
      normalizar(asignacion?.nombre) === "SIN ASIGNAR" && asignacion?.enfermero
    )
    .map((asignacion) => asignacion.enfermero)
);

export const crearResumenCategoriaInicio = (datos = {}) => {
  const ausentes = personasUnicas(datos.ausentes);
  const noDisponibles = personasUnicas(datos.noDisponibles);
  const licencias = personasUnicas(datos.licencias);
  const certificaciones = personasUnicas(datos.certificaciones);
  const noDisponiblesDetalle = detallesNoDisponiblesUnicos(datos.noDisponiblesDetalle);
  const libres = personasUnicas(datos.libres);
  const extras = personasUnicas(datos.extras);
  const sinAsignar = obtenerSinAsignar(datos.asignaciones);
  const personasPrevistas = Array.isArray(datos.personasPrevistas)
    ? personasUnicas(datos.personasPrevistas)
    : obtenerPersonasPrevistas(datos.asignaciones);
  const asistencia = resumirAsistencia(personasPrevistas, datos.asistencia);
  return {
    previstos: asistencia.previstos,
    presentes: asistencia.presente,
    pendientes: asistencia.pendiente,
    ausentesAsistencia: asistencia.ausente,
    ausentes: ausentes.length,
    noDisponibles: noDisponibles.length,
    licencias: licencias.length,
    certificaciones: certificaciones.length,
    libres: libres.length,
    extras: extras.length,
    sinAsignar: sinAsignar.length,
    personasSinAsignar: sinAsignar,
    personasAusentes: ausentes,
    personasNoDisponibles: noDisponibles,
    personasLicencias: licencias,
    personasCertificaciones: certificaciones,
    noDisponiblesDetalle,
    personasLibres: libres,
    personasExtras: extras,
    sectoresCriticos: [...new Set(lista(datos.sectoresCriticosSinCobertura).filter(Boolean))]
  };
};

export const crearResumenInicioTurno = ({
  enfermeros,
  licenciados,
  novedades = [],
  fecha = "",
  turnoActivo = ""
} = {}) => {
  const porCategoria = {
    enfermero: crearResumenCategoriaInicio(enfermeros),
    licenciado: crearResumenCategoriaInicio(licenciados)
  };
  const todasLasPersonas = (campo) => personasUnicas([
    ...porCategoria.enfermero[campo],
    ...porCategoria.licenciado[campo]
  ]);
  const reporteDia = construirReporteNovedades({
    novedades,
    turnoActivo,
    desde: fecha,
    hasta: fecha
  });
  const sectoresCriticos = [...new Set([
    ...porCategoria.enfermero.sectoresCriticos,
    ...porCategoria.licenciado.sectoresCriticos
  ])];
  const noDisponiblesDetalle = detallesNoDisponiblesUnicos([
    ...porCategoria.enfermero.noDisponiblesDetalle,
    ...porCategoria.licenciado.noDisponiblesDetalle
  ]);

  return {
    fecha,
    porCategoria,
    general: {
      previstos: porCategoria.enfermero.previstos + porCategoria.licenciado.previstos,
      presentes: porCategoria.enfermero.presentes + porCategoria.licenciado.presentes,
      pendientes: porCategoria.enfermero.pendientes + porCategoria.licenciado.pendientes,
      ausentesAsistencia: porCategoria.enfermero.ausentesAsistencia + porCategoria.licenciado.ausentesAsistencia,
      ausentes: todasLasPersonas("personasAusentes").length,
      noDisponibles: todasLasPersonas("personasNoDisponibles").length,
      licencias: todasLasPersonas("personasLicencias").length,
      certificaciones: todasLasPersonas("personasCertificaciones").length,
      ...(noDisponiblesDetalle.length > 0 ? { noDisponiblesDetalle } : {}),
      libres: todasLasPersonas("personasLibres").length,
      extras: todasLasPersonas("personasExtras").length,
      sinAsignar: todasLasPersonas("personasSinAsignar").length
    },
    sectoresCriticos,
    novedadesDia: reporteDia.resumen.desglose
  };
};
