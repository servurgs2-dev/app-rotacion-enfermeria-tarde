import { normalizar } from "./texto.js";
import { obtenerConfiguracionTurno } from "../config/turnos.js";
import { crearIntervaloRelativo, horaAMinutos, minutosAHora } from "./horarios.js";

export const gruposOperativos = [
  {
    nombre: "Triaje",
    licenciados: ["Triage 1", "Triage 2"],
    enfermeros: [],
    esTriaje: true
  },
  {
    nombre: "Reanimación y Sillones",
    licenciados: ["Reanimación + Sillones", "Reanimación", "Sillones"],
    enfermeros: ["REA 1", "REA 2", "SILLÓN 1", "SILLON 2", "SILLONES 3"]
  },
  {
    nombre: "Estabiliza",
    licenciados: ["Estabiliza"],
    enfermeros: ["1-3 + 21", "4-7"]
  },
  {
    nombre: "Observación",
    licenciados: ["Observación 1", "Observación 2"],
    enfermeros: ["8-13", "14-19", "20-22-24"]
  },
  {
    nombre: "Diagnóstico",
    licenciados: ["Diagnostico"],
    enfermeros: ["DX 25-30"]
  },
  {
    nombre: "Explora",
    licenciados: ["Explora"],
    enfermeros: ["EXPLORA 1", "EXPLORA 2"],
    respaldoSiSinCobertura: {
      sector: "Explora",
      responsable: "Diagnostico"
    }
  },
  {
    nombre: "Preinternación",
    licenciados: ["Preinternación"],
    enfermeros: ["PRE INT 1", "PRE INT 2"]
  },
  {
    nombre: "Salud Mental",
    licenciados: ["Salud Mental"],
    enfermeros: ["SM"]
  }
];

export const obtenerHorarioEfectivo = (persona, configTurno = obtenerConfiguracionTurno()) => {
  const horario = configTurno.horarios[persona?.horario] || configTurno.horarios.normal;
  const horarioEspecial = persona?.horario === "entraAntes" || persona?.horario === "entraDespues";
  const inicioNormal = configTurno.horarios.normal.entrada;
  const intervalo = crearIntervaloRelativo(horario, inicioNormal);
  const finRelativo = intervalo.finRelativo - (persona?.maternal ? 60 : 0);
  const salidaEfectiva = minutosAHora(horaAMinutos(inicioNormal) + finRelativo);

  return {
    entrada: horario.entrada,
    salida: salidaEfectiva,
    entradaEspecial: horarioEspecial,
    salidaEspecial: horarioEspecial || Boolean(persona?.maternal),
    inicioRelativo: intervalo.inicioRelativo,
    finRelativo,
    duracion: finRelativo - intervalo.inicioRelativo,
    cruzaMedianoche: horaAMinutos(salidaEfectiva) <= horaAMinutos(horario.entrada)
  };
};

const obtenerAsignados = (asignaciones, sectores) => {
  const sectoresBuscados = new Set(sectores.map(normalizar));
  const personas = new Map();

  asignaciones.forEach((asignacion) => {
    if (
      !asignacion?.enfermero ||
      asignacion.tipo === "divider" ||
      normalizar(asignacion.nombre) === "SIN ASIGNAR" ||
      !sectoresBuscados.has(normalizar(asignacion.nombre))
    ) {
      return;
    }

    const clavePersona = normalizar(asignacion.enfermero.nombre);
    if (clavePersona && !personas.has(clavePersona)) {
      personas.set(clavePersona, asignacion.enfermero);
    }
  });

  return [...personas.values()];
};

const listarNombres = (personas) => {
  const nombres = personas.map((persona) => persona.nombre);
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  if (nombres.length > 2) return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return nombres[0];
};

const generarAlertaGrupo = (grupo, personas, configTurno) => {
  const horaCierre = configTurno.horarios.normal.salida;
  const inicioNormal = configTurno.horarios.normal.entrada;
  const finCierre = crearIntervaloRelativo(
    configTurno.horarios.normal,
    inicioNormal
  ).finRelativo;
  const salidasAnticipadas = personas
    .map((persona) => ({ persona, ...obtenerHorarioEfectivo(persona, configTurno) }))
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
        (persona) => obtenerHorarioEfectivo(persona, configTurno).finRelativo > finRelativo
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

  const todasLasPersonasSalen = momentoCritico.personasQueSalen.length === personas.length;
  const salidaDescripcion = todasLasPersonasSalen
    ? `a las ${momentoCritico.hora} se retiran las ${personas.length} personas asignadas.`
    : `a las ${momentoCritico.hora} ${
      momentoCritico.personasQueSalen.length === 1 ? "se retira" : "se retiran"
    } ${listarNombres(momentoCritico.personasQueSalen)}.`;

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
  configTurno = obtenerConfiguracionTurno()
}) =>
  gruposOperativos.flatMap((grupo) => {
    const responsablesHabituales = obtenerAsignados(licenciados, grupo.licenciados);
    const sectorRespaldo = grupo.respaldoSiSinCobertura;
    const responsables = responsablesHabituales.length > 0 || !sectorRespaldo
      ? responsablesHabituales
      : obtenerAsignados(licenciados, [sectorRespaldo.responsable]);
    const personas = [
      ...responsables,
      ...obtenerAsignados(enfermeros, grupo.enfermeros)
    ];
    const personasUnicas = [...new Map(
      personas.map((persona) => [normalizar(persona.nombre), persona])
    ).values()];
    const alerta = generarAlertaGrupo(grupo, personasUnicas, configTurno);

    return alerta ? [alerta] : [];
  });
