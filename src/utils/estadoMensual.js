import { normalizarMaternal } from "./maternal.js";
import { asegurarIdPersona } from "./identidadPersonas.js";
import {
  esReferenciaPersona,
  normalizarCambiosPersonasPorDia,
  normalizarListaReferenciasPersonas,
  normalizarReferenciaPlanilla
} from "./referenciasPersonas.js";
import { normalizarLicenciasPersonas } from "./licenciasPersonas.js";
import { normalizarCertificacionesPersonas } from "./certificacionesPersonas.js";
import {
  asegurarIdExtraHistorico,
  resolverPersonaPermanenteParaExtra
} from "./extrasPersonas.js";
import { parsearFechaIsoUTC } from "./periodosRotacionPlanilla.js";

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
  semana6: {},
  coberturaLibreSM: {}
});

export const crearRotacion3DiasVacia = () => ({
  version: 1,
  fechaBase: "2026-07-02",
  duracionDias: 3,
  asignacionBase: {},
  bloques: {},
  coberturaLibreSM: {}
});

const crearCalendarioCategoriaVacio = () => ({
  cambiosDia: {},
  cambiosParoDia: {},
  extras: {},
  noDisponibles: {},
  asistenciaDia: {},
  cierresDia: {}
});

const normalizarPersona = (persona) => esObjetoValido(persona)
  ? asegurarIdPersona({
      ...persona,
      maternal: normalizarMaternal(persona.maternal)
    })
  : persona;

const normalizarExtrasPorDia = (extrasPorDia, categoria, personal) => Object.fromEntries(
  Object.entries(extrasPorDia).map(([fecha, extras]) => [
    fecha,
    Array.isArray(extras)
      ? extras.map((extra, indice) => {
          if (!esObjetoValido(extra)) return extra;
          const extraNormalizado = {
            ...extra,
            maternal: normalizarMaternal(extra.maternal)
          };
          if (String(extra.id ?? "").trim()) {
            const extraConId = asegurarIdPersona(extraNormalizado);
            if (extra.temporal === true) return extraConId;

            const personaPermanente = resolverPersonaPermanenteParaExtra(
              extraConId,
              personal
            );
            return personaPermanente
              ? {
                  ...extraConId,
                  id: personaPermanente.id,
                  nombre: personaPermanente.nombre
                }
              : extraConId;
          }
          if (extra.temporal === true) {
            return asegurarIdExtraHistorico(
              extraNormalizado,
              { fecha, categoria, indice }
            );
          }

          const personaPermanente = resolverPersonaPermanenteParaExtra(
            extra,
            personal
          );
          return personaPermanente
            ? {
                ...extraNormalizado,
                id: personaPermanente.id,
                nombre: personaPermanente.nombre
              }
            : asegurarIdExtraHistorico(
                extraNormalizado,
                { fecha, categoria, indice }
              );
        })
      : extras
  ])
);

const crearAliasesExtrasPorDia = (extrasOriginales, extrasNormalizados) =>
  Object.fromEntries(
    Object.entries(extrasOriginales).map(([fecha, extras]) => [
      fecha,
      Array.isArray(extras)
        ? extras.map((extra, indice) => {
            const extraNormalizado = extrasNormalizados?.[fecha]?.[indice];
            if (!esObjetoValido(extra) || !esObjetoValido(extraNormalizado)) {
              return extra;
            }
            return { ...extra, id: extraNormalizado.id };
          })
        : extras
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
    enfermeros: {
      ...crearPlanillaMensualVacia(),
      rotacion3Dias: crearRotacion3DiasVacia()
    },
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

const normalizarReferenciaLigera = (referencia, personal) => {
  const normalizada = normalizarReferenciaPlanilla(referencia, personal);
  if (!esReferenciaPersona(normalizada)) return null;
  return {
    personaId: String(normalizada.personaId).trim(),
    nombre: String(normalizada.nombre ?? "").trim()
  };
};

const normalizarDistribucionRotacion = (distribucion, personal) => {
  if (!esObjetoValido(distribucion)) return {};

  return Object.fromEntries(
    Object.entries(distribucion).flatMap(([sector, referencia]) => {
      if (referencia === "" || referencia === null || referencia === undefined) {
        return [[sector, ""]];
      }
      const ligera = normalizarReferenciaLigera(referencia, personal);
      return ligera ? [[sector, ligera]] : [];
    })
  );
};

const normalizarRotacion3Dias = (rotacion, personal) => {
  const normalizada = esObjetoValido(rotacion) ? clonarValor(rotacion) : {};
  const baseVacia = crearRotacion3DiasVacia();
  const bloques = esObjetoValido(normalizada.bloques) ? normalizada.bloques : {};
  const cobertura = esObjetoValido(normalizada.coberturaLibreSM)
    ? normalizada.coberturaLibreSM
    : {};

  return {
    ...normalizada,
    version: Number.isInteger(normalizada.version) ? normalizada.version : baseVacia.version,
    fechaBase: parsearFechaIsoUTC(normalizada.fechaBase)
      ? normalizada.fechaBase
      : baseVacia.fechaBase,
    duracionDias: Number.isInteger(normalizada.duracionDias) && normalizada.duracionDias > 0
      ? normalizada.duracionDias
      : baseVacia.duracionDias,
    asignacionBase: normalizarDistribucionRotacion(
      normalizada.asignacionBase,
      personal
    ),
    bloques: Object.fromEntries(
      Object.entries(bloques).flatMap(([clave, distribucion]) =>
        parsearFechaIsoUTC(clave)
          ? [[clave, normalizarDistribucionRotacion(distribucion, personal)]]
          : []
      )
    ),
    coberturaLibreSM: Object.fromEntries(
      Object.entries(cobertura).flatMap(([clave, referencia]) => {
        if (!parsearFechaIsoUTC(clave)) return [];
        const ligera = normalizarReferenciaLigera(referencia, personal);
        return ligera ? [[clave, ligera]] : [];
      })
    )
  };
};

const normalizarPlanilla = (
  planilla,
  personal,
  { incluirRotacion3Dias = false } = {}
) => {
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

  normalizada.coberturaLibreSM = Object.fromEntries(
    Object.entries(normalizada.coberturaLibreSM).map(([semana, referencia]) => [
      semana,
      normalizarReferenciaPlanilla(referencia, personal)
    ])
  );

  if (incluirRotacion3Dias) {
    normalizada.rotacion3Dias = normalizarRotacion3Dias(
      normalizada.rotacion3Dias,
      personal
    );
  }

  return normalizada;
};

const normalizarCalendarioCategoria = (calendario, personal, categoria) => {
  const normalizado = esObjetoValido(calendario) ? clonarValor(calendario) : {};

  Object.keys(crearCalendarioCategoriaVacio()).forEach((clave) => {
    if (!esObjetoValido(normalizado[clave])) normalizado[clave] = {};
  });

  const extrasOriginales = normalizado.extras;
  normalizado.extras = normalizarExtrasPorDia(
    extrasOriginales,
    categoria,
    personal
  );
  const aliasesExtras = crearAliasesExtrasPorDia(
    extrasOriginales,
    normalizado.extras
  );
  normalizado.cambiosDia = normalizarCambiosPersonasPorDia(
    normalizado.cambiosDia,
    personal,
    normalizado.extras,
    aliasesExtras
  );
  normalizado.cambiosParoDia = normalizarCambiosPersonasPorDia(
    normalizado.cambiosParoDia,
    personal,
    normalizado.extras,
    aliasesExtras
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
    ? normalizarCertificacionesPersonas(
        normalizado.certificaciones,
        normalizado.personal
      )
    : [];

  normalizado.planillas = {
    ...planillas,
    enfermeros: normalizarPlanilla(
      planillas.enfermeros,
      normalizado.personal,
      { incluirRotacion3Dias: true }
    ),
    licenciados: normalizarPlanilla(planillas.licenciados, normalizado.personal)
  };

  normalizado.calendario = {
    ...calendario,
    diasParo: esObjetoValido(calendario.diasParo) ? calendario.diasParo : {},
    enfermeros: normalizarCalendarioCategoria(
      calendario.enfermeros,
      normalizado.personal.filter((persona) => persona?.categoria === "enfermero"),
      "enfermero"
    ),
    licenciados: normalizarCalendarioCategoria(
      calendario.licenciados,
      normalizado.personal.filter((persona) => persona?.categoria === "licenciado"),
      "licenciado"
    )
  };

  return normalizado;
};
