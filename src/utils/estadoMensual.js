import { normalizarMaternal } from "./maternal.js";
import { asegurarIdPersona } from "./identidadPersonas.js";
import {
  normalizarCambiosPersonasPorDia,
  normalizarListaReferenciasPersonas,
  normalizarReferenciaPlanilla
} from "./referenciasPersonas.js";
import { normalizarLicenciasPersonas } from "./licenciasPersonas.js";

const esObjetoValido = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const clonarValor = (valor) => {
  if (Array.isArray(valor)) return valor.map(clonarValor);

  if (esObjetoValido(valor)) {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, contenido]) => [clave, clonarValor(contenido)])
    );
  }

  return valor;
};

export const crearPlanillaMensualVacia = () => ({
  semana1: {},
  semana2: {},
  semana3: {},
  semana4: {},
  semana5: {},
  semana6: {}
});

const crearCalendarioCategoriaVacio = () => ({
  cambiosDia: {},
  cambiosParoDia: {},
  extras: {},
  noDisponibles: {}
});

const normalizarPersona = (persona) => esObjetoValido(persona)
  ? asegurarIdPersona({
      ...persona,
      maternal: normalizarMaternal(persona.maternal)
    })
  : persona;

const normalizarExtrasPorDia = (extrasPorDia) => Object.fromEntries(
  Object.entries(extrasPorDia).map(([fecha, extras]) => [
    fecha,
    Array.isArray(extras) ? extras.map(normalizarPersona) : extras
  ])
);

const normalizarNoDisponiblesPorDia = (noDisponiblesPorDia, personal) =>
  Object.fromEntries(
    Object.entries(noDisponiblesPorDia).map(([fecha, referencias]) => [
      fecha,
      Array.isArray(referencias)
        ? normalizarListaReferenciasPersonas(referencias, personal)
        : referencias
    ])
  );

export const crearEstadoMensualVacio = () => ({
  personal: [],
  planillas: {
    enfermeros: crearPlanillaMensualVacia(),
    licenciados: crearPlanillaMensualVacia()
  },
  calendario: {
    diasParo: {},
    enfermeros: crearCalendarioCategoriaVacio(),
    licenciados: crearCalendarioCategoriaVacio()
  },
  licencias: [],
  certificaciones: []
});

const normalizarPlanilla = (planilla, personal) => {
  const normalizada = esObjetoValido(planilla) ? clonarValor(planilla) : {};

  Object.keys(normalizada).forEach((clave) => {
    if (clave.startsWith("semana") && !esObjetoValido(normalizada[clave])) {
      normalizada[clave] = {};
    } else if (clave.startsWith("semana")) {
      normalizada[clave] = Object.fromEntries(
        Object.entries(normalizada[clave]).map(([sector, referencia]) => [
          sector,
          normalizarReferenciaPlanilla(referencia, personal)
        ])
      );
    }
  });

  Object.keys(crearPlanillaMensualVacia()).forEach((clave) => {
    if (!esObjetoValido(normalizada[clave])) normalizada[clave] = {};
  });

  return normalizada;
};

const normalizarCalendarioCategoria = (calendario, personal) => {
  const normalizado = esObjetoValido(calendario) ? clonarValor(calendario) : {};

  Object.keys(crearCalendarioCategoriaVacio()).forEach((clave) => {
    if (!esObjetoValido(normalizado[clave])) normalizado[clave] = {};
  });

  normalizado.extras = normalizarExtrasPorDia(normalizado.extras);
  normalizado.cambiosDia = normalizarCambiosPersonasPorDia(
    normalizado.cambiosDia,
    personal,
    normalizado.extras
  );
  normalizado.cambiosParoDia = normalizarCambiosPersonasPorDia(
    normalizado.cambiosParoDia,
    personal,
    normalizado.extras
  );
  normalizado.noDisponibles = normalizarNoDisponiblesPorDia(
    normalizado.noDisponibles,
    personal
  );

  return normalizado;
};

export const normalizarEstadoMensual = (estado) => {
  if (!esObjetoValido(estado)) return crearEstadoMensualVacio();

  const normalizado = clonarValor(estado);
  const planillas = esObjetoValido(normalizado.planillas) ? normalizado.planillas : {};
  const calendario = esObjetoValido(normalizado.calendario) ? normalizado.calendario : {};

  normalizado.personal = Array.isArray(normalizado.personal)
    ? normalizado.personal.map(normalizarPersona)
    : [];
  normalizado.licencias = Array.isArray(normalizado.licencias)
    ? normalizarLicenciasPersonas(normalizado.licencias, normalizado.personal)
    : [];
  normalizado.certificaciones = Array.isArray(normalizado.certificaciones)
    ? normalizado.certificaciones
    : [];

  normalizado.planillas = {
    ...planillas,
    enfermeros: normalizarPlanilla(planillas.enfermeros, normalizado.personal),
    licenciados: normalizarPlanilla(planillas.licenciados, normalizado.personal)
  };

  normalizado.calendario = {
    ...calendario,
    diasParo: esObjetoValido(calendario.diasParo) ? calendario.diasParo : {},
    enfermeros: normalizarCalendarioCategoria(
      calendario.enfermeros,
      normalizado.personal.filter((persona) => persona?.categoria === "enfermero")
    ),
    licenciados: normalizarCalendarioCategoria(
      calendario.licenciados,
      normalizado.personal.filter((persona) => persona?.categoria === "licenciado")
    )
  };

  return normalizado;
};
