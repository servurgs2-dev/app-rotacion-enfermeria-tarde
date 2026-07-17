import { normalizar } from "./texto";

const HORARIOS_BASE = {
  normal: { entrada: "12:00", salida: "18:00" },
  entraAntes: { entrada: "11:30", salida: "17:30" },
  entraDespues: { entrada: "12:30", salida: "18:30" }
};

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

const restarUnaHora = (hora) => {
  const [horas, minutos] = hora.split(":").map(Number);
  const totalMinutos = horas * 60 + minutos - 60;
  const horasAjustadas = Math.floor(totalMinutos / 60);

  return `${String(horasAjustadas).padStart(2, "0")}:${String(totalMinutos % 60).padStart(2, "0")}`;
};

export const obtenerHorarioEfectivo = (persona) => {
  const horario = HORARIOS_BASE[persona?.horario] || HORARIOS_BASE.normal;
  const horarioEspecial = persona?.horario === "entraAntes" || persona?.horario === "entraDespues";

  return {
    entrada: horario.entrada,
    salida: persona?.maternal ? restarUnaHora(horario.salida) : horario.salida,
    entradaEspecial: horarioEspecial,
    salidaEspecial: horarioEspecial || Boolean(persona?.maternal)
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

const minutosDesdeMedianoche = (hora) => {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
};

const MINUTOS_CIERRE = 18 * 60;

const generarAlertaGrupo = (grupo, personas) => {
  const salidasAnticipadas = personas
    .map((persona) => ({ persona, salida: obtenerHorarioEfectivo(persona).salida }))
    .filter(({ salida }) => minutosDesdeMedianoche(salida) < MINUTOS_CIERRE);

  const salidasPorHora = new Map();
  salidasAnticipadas.forEach(({ persona, salida }) => {
    const personasEnHora = salidasPorHora.get(salida) || [];
    personasEnHora.push(persona);
    salidasPorHora.set(salida, personasEnHora);
  });

  const momentosCriticos = [...salidasPorHora.entries()]
    .map(([hora, personasQueSalen]) => {
      const personasRestantes = personas.filter(
        (persona) => minutosDesdeMedianoche(obtenerHorarioEfectivo(persona).salida) > minutosDesdeMedianoche(hora)
      ).length;

      return { hora, personasQueSalen, personasRestantes };
    })
    .filter(({ personasQueSalen, personasRestantes }) =>
      personasQueSalen.length >= 2 || personasRestantes === 0
    )
    .sort((a, b) =>
      a.personasRestantes - b.personasRestantes ||
      minutosDesdeMedianoche(a.hora) - minutosDesdeMedianoche(b.hora)
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
    return `⚠️ ${grupo.nombre}: ${salidaDescripcion} El sector queda sin cobertura hasta las 18:00.`;
  }

  const coberturaDescripcion = momentoCritico.personasRestantes === 1
    ? "Queda 1 persona hasta las 18:00."
    : `Quedan ${momentoCritico.personasRestantes} personas hasta las 18:00.`;

  return `⚠️ ${grupo.nombre}: ${salidaDescripcion} ${coberturaDescripcion}`;
};

export const generarAlertasHorarios = ({ enfermeros = [], licenciados = [] }) =>
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
    const alerta = generarAlertaGrupo(grupo, personasUnicas);

    return alerta ? [alerta] : [];
  });
