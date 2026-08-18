import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { obtenerPersonasPrevistas } from "./asistenciaPersonas.js";
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

const obtenerSinAsignar = (asignaciones) => personasUnicas(
  lista(asignaciones)
    .filter((asignacion) =>
      normalizar(asignacion?.nombre) === "SIN ASIGNAR" && asignacion?.enfermero
    )
    .map((asignacion) => asignacion.enfermero)
);

export const crearResumenCategoriaInicio = (datos = {}) => {
  const ausentes = personasUnicas(datos.ausentes);
  const libres = personasUnicas(datos.libres);
  const extras = personasUnicas(datos.extras);
  const sinAsignar = obtenerSinAsignar(datos.asignaciones);
  return {
    previstos: obtenerPersonasPrevistas(datos.asignaciones).length,
    ausentes: ausentes.length,
    libres: libres.length,
    extras: extras.length,
    sinAsignar: sinAsignar.length,
    personasSinAsignar: sinAsignar,
    personasAusentes: ausentes,
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

  return {
    fecha,
    porCategoria,
    general: {
      previstos: porCategoria.enfermero.previstos + porCategoria.licenciado.previstos,
      ausentes: todasLasPersonas("personasAusentes").length,
      libres: todasLasPersonas("personasLibres").length,
      extras: todasLasPersonas("personasExtras").length,
      sinAsignar: todasLasPersonas("personasSinAsignar").length
    },
    sectoresCriticos,
    novedadesDia: reporteDia.resumen.desglose
  };
};
