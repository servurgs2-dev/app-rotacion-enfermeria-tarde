import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { obtenerEtiquetaPersona } from "./nombresPersonas.js";
import { obtenerConfiguracionTurno } from "../config/turnos.js";
import { crearIntervaloRelativo, horaAMinutos, minutosAHora } from "./horarios.js";
import {
  TIPOS_MATERNAL,
  normalizarMaternal,
  obtenerAjusteMaternal
} from "./maternal.js";
import {
  crearIdentidadSector,
  crearIdentidadSintetica,
  obtenerClaveIdentidadOperativa,
  resolverIdentidadOperativaAsignacion
} from "./identidadOperativaAsignaciones.js";
import { SYNTHETIC_IDS_REANIMACION_SILLONES } from "./reanimacionSillones.js";
import { obtenerHorarioBaseEfectivoPersonaEnFecha } from "./horarioEfectivoPersonal.js";

const sectores = (...sectorIds) => sectorIds.map(crearIdentidadSector);
const sinteticos = (...syntheticIds) => syntheticIds.map(crearIdentidadSintetica);

export const gruposOperativos = [
  {
    nombre: "Triaje",
    licenciados: sectores("triage_1", "triage_2"),
    enfermeros: [],
    esTriaje: true
  },
  {
    nombre: "Reanimación y Sillones",
    licenciados: [
      ...sectores("reanimacion_sillones"),
      ...sinteticos(
        SYNTHETIC_IDS_REANIMACION_SILLONES.REANIMACION,
        SYNTHETIC_IDS_REANIMACION_SILLONES.SILLONES
      )
    ],
    enfermeros: sectores("rea_1", "rea_2", "sillon_1", "sillon_2", "sillones_3")
  },
  {
    nombre: "Estabiliza",
    licenciados: sectores("estabiliza"),
    enfermeros: sectores("boxes_1_3_21", "boxes_4_7")
  },
  {
    nombre: "Observación",
    licenciados: sectores("observacion_1", "observacion_2"),
    enfermeros: sectores("boxes_8_13", "boxes_14_19", "boxes_20_22_24")
  },
  {
    nombre: "Diagnóstico",
    licenciados: sectores("diagnostico"),
    enfermeros: sectores("dx_25_30")
  },
  {
    nombre: "Explora",
    licenciados: sectores("explora"),
    enfermeros: sectores("explora_1", "explora_2"),
    respaldoSiSinCobertura: {
      sector: crearIdentidadSector("explora"),
      responsable: crearIdentidadSector("diagnostico")
    }
  },
  {
    nombre: "Preinternación",
    licenciados: sectores("preinternacion"),
    enfermeros: sectores("pre_int_1", "pre_int_2")
  },
  {
    nombre: "Salud Mental",
    licenciados: sectores("salud_mental"),
    enfermeros: sectores("salud_mental")
  }
];

export const obtenerHorarioEfectivo = (
  persona,
  configTurno = obtenerConfiguracionTurno(),
  { fecha = "", turno = "", novedades = [] } = {}
) => {
  const horario = obtenerHorarioBaseEfectivoPersonaEnFecha({
    persona, fecha, turno, novedades, configTurno
  });
  const horarioEspecial = horario.esExcepcional || persona?.horario === "entraAntes" || persona?.horario === "entraDespues";
  const maternal = normalizarMaternal(persona?.maternal);
  const { minutosEntrada, minutosSalida } = obtenerAjusteMaternal(maternal);
  const inicioNormal = configTurno.horarios.normal.entrada;
  const intervalo = crearIntervaloRelativo(horario, inicioNormal);
  const inicioRelativo = intervalo.inicioRelativo + minutosEntrada;
  const finRelativo = intervalo.finRelativo + minutosSalida;
  const entradaEfectiva = minutosAHora(horaAMinutos(inicioNormal) + inicioRelativo);
  const salidaEfectiva = minutosAHora(horaAMinutos(inicioNormal) + finRelativo);
  const inicioAbsoluto = horaAMinutos(inicioNormal) + inicioRelativo;
  const finAbsoluto = horaAMinutos(inicioNormal) + finRelativo;

  return {
    entrada: entradaEfectiva,
    salida: salidaEfectiva,
    entradaEspecial:
      horarioEspecial || maternal === TIPOS_MATERNAL.ENTRA_UNA_HORA_DESPUES,
    salidaEspecial:
      horarioEspecial || maternal === TIPOS_MATERNAL.SALE_UNA_HORA_ANTES,
    inicioRelativo,
    finRelativo,
    duracion: finRelativo - inicioRelativo,
    cruzaMedianoche:
      Math.floor(finAbsoluto / (24 * 60)) > Math.floor(inicioAbsoluto / (24 * 60))
  };
};

const obtenerPersonaCanonica = (personaAsignada, personal) => {
  const identidad = obtenerClaveIdentidadPersona(personaAsignada);
  if (!identidad) return personaAsignada;
  return (Array.isArray(personal) ? personal : []).find(
    (persona) => obtenerClaveIdentidadPersona(persona) === identidad
  ) || personaAsignada;
};

const obtenerAsignados = (asignaciones, sectores, personal) => {
  const sectoresBuscados = new Set(sectores.map(obtenerClaveIdentidadOperativa).filter(Boolean));
  const personas = new Map();

  asignaciones.forEach((asignacion) => {
    if (
      !asignacion?.enfermero ||
      asignacion.activo === false ||
      asignacion.tipo === "divider" ||
      !sectoresBuscados.has(obtenerClaveIdentidadOperativa(
        resolverIdentidadOperativaAsignacion(asignacion)
      ))
    ) {
      return;
    }

    const persona = obtenerPersonaCanonica(asignacion.enfermero, personal);
    const clavePersona = obtenerClaveIdentidadPersona(persona);
    if (clavePersona && !personas.has(clavePersona)) {
      personas.set(clavePersona, persona);
    }
  });

  return [...personas.values()];
};

const listarNombres = (personas, candidatosEtiqueta = personas) => {
  const nombres = personas.map((persona) =>
    obtenerEtiquetaPersona(persona, candidatosEtiqueta)
  );
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  if (nombres.length > 2) return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return nombres[0];
};

const generarAlertaGrupo = (grupo, personas, configTurno, contextoHorario) => {
  const horaCierre = configTurno.horarios.normal.salida;
  const inicioNormal = configTurno.horarios.normal.entrada;
  const finCierre = crearIntervaloRelativo(
    configTurno.horarios.normal,
    inicioNormal
  ).finRelativo;
  const salidasAnticipadas = personas
    .map((persona) => ({ persona, ...obtenerHorarioEfectivo(persona, configTurno, contextoHorario) }))
    .filter(({ finRelativo }) => finRelativo < finCierre);

  const salidasPorHora = new Map();
  salidasAnticipadas.forEach(({ persona, salida, finRelativo }) => {
    const salidaAgrupada = salidasPorHora.get(finRelativo) || { hora: salida, personas: [] };
    salidaAgrupada.personas.push(persona);
    salidasPorHora.set(finRelativo, salidaAgrupada);
  });

  const momentosCriticos = [...salidasPorHora.entries()]
    .map(([finRelativo, { hora, personas: personasQueSalen }]) => {
      const personasRestantes = personas.filter(
        (persona) => obtenerHorarioEfectivo(persona, configTurno, contextoHorario).finRelativo > finRelativo
      ).length;

      return { hora, finRelativo, personasQueSalen, personasRestantes };
    })
    .filter(({ personasQueSalen, personasRestantes }) =>
      personasQueSalen.length >= 2 || personasRestantes === 0
    )
    .sort((a, b) =>
      a.personasRestantes - b.personasRestantes ||
      a.finRelativo - b.finRelativo
    );

  const momentoCritico = momentosCriticos[0];
  if (!momentoCritico) return null;

  const salidaDescripcion = `a las ${momentoCritico.hora} ${
    momentoCritico.personasQueSalen.length === 1 ? "se retira" : "se retiran"
  } ${listarNombres(momentoCritico.personasQueSalen, personas)}.`;

  if (momentoCritico.personasRestantes === 0) {
    return `⚠️ ${grupo.nombre}: ${salidaDescripcion} El sector queda sin cobertura hasta las ${horaCierre}.`;
  }

  const coberturaDescripcion = momentoCritico.personasRestantes === 1
    ? `Queda 1 persona hasta las ${horaCierre}.`
    : `Quedan ${momentoCritico.personasRestantes} personas hasta las ${horaCierre}.`;

  return `⚠️ ${grupo.nombre}: ${salidaDescripcion} ${coberturaDescripcion}`;
};

export const generarAlertasHorarios = ({
  enfermeros = [],
  licenciados = [],
  personal = [],
  configTurno = obtenerConfiguracionTurno(),
  novedades = [],
  fecha = "",
  turno = ""
}) =>
  gruposOperativos.flatMap((grupo) => {
    const responsablesHabituales = obtenerAsignados(licenciados, grupo.licenciados, personal);
    const sectorRespaldo = grupo.respaldoSiSinCobertura;
    const responsables = responsablesHabituales.length > 0 || !sectorRespaldo
      ? responsablesHabituales
      : obtenerAsignados(licenciados, [sectorRespaldo.responsable], personal);
    const personas = [
      ...responsables,
      ...obtenerAsignados(enfermeros, grupo.enfermeros, personal)
    ];
    const personasUnicas = [...new Map(
      personas
        .map((persona) => [obtenerClaveIdentidadPersona(persona), persona])
        .filter(([clave]) => Boolean(clave))
    ).values()];
    const alerta = generarAlertaGrupo(grupo, personasUnicas, configTurno, {
      novedades, fecha, turno
    });

    return alerta ? [alerta] : [];
  });
