const crearHorario = (id, nombre, entrada, salida, cruzaMedianoche = false) => ({
  id,
  nombre,
  entrada,
  salida,
  textoVisible: `${entrada} a ${salida}`,
  cruzaMedianoche
});

const ROTACION_SEMANAL = { tipo: "semanal" };
const ROTACION_NOCTURNA_ENFERMEROS = {
  tipo: "cada_3_dias",
  fechaBase: "2026-07-02",
  duracionDias: 3,
  vigenteDesdeMes: "2026-07"
};

const crearRotacionSemanalPorCategoria = () => ({
  enfermero: { ...ROTACION_SEMANAL },
  licenciado: { ...ROTACION_SEMANAL }
});

const esFechaIsoValida = (fechaIso) => {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso || "");
  if (!coincidencia) return false;
  const fecha = new Date(Date.UTC(
    Number(coincidencia[1]),
    Number(coincidencia[2]) - 1,
    Number(coincidencia[3])
  ));
  return fecha.toISOString().slice(0, 10) === fechaIso;
};

export const TURNOS = {
  noche: {
    id: "noche",
    rotacionPlanilla: {
      enfermero: { ...ROTACION_NOCTURNA_ENFERMEROS },
      licenciado: { ...ROTACION_SEMANAL }
    },
    nombre: "Noche",
    horarioVisible: "00:00 a 06:00",
    horarios: {
      normal: crearHorario("normal", "Normal", "00:00", "06:00"),
      entraAntes: crearHorario("entraAntes", "Entra antes", "23:30", "05:30", true),
      entraDespues: crearHorario("entraDespues", "Entra después", "00:30", "06:30")
    }
  },
  manana: {
    id: "manana",
    rotacionPlanilla: crearRotacionSemanalPorCategoria(),
    nombre: "Mañana",
    horarioVisible: "06:00 a 12:00",
    horarios: {
      normal: crearHorario("normal", "Normal", "06:00", "12:00"),
      entraAntes: crearHorario("entraAntes", "Entra antes", "05:30", "11:30"),
      entraDespues: crearHorario("entraDespues", "Entra después", "06:30", "12:30")
    }
  },
  tarde: {
    id: "tarde",
    rotacionPlanilla: crearRotacionSemanalPorCategoria(),
    nombre: "Tarde",
    horarioVisible: "12:00 a 18:00",
    horarios: {
      normal: crearHorario("normal", "Normal", "12:00", "18:00"),
      entraAntes: crearHorario("entraAntes", "Entra antes", "11:30", "17:30"),
      entraDespues: crearHorario("entraDespues", "Entra después", "12:30", "18:30")
    }
  },
  vespertino: {
    id: "vespertino",
    rotacionPlanilla: crearRotacionSemanalPorCategoria(),
    nombre: "Vespertino",
    horarioVisible: "18:00 a 00:00",
    horarios: {
      normal: crearHorario("normal", "Normal", "18:00", "00:00", true),
      entraAntes: crearHorario("entraAntes", "Entra antes", "17:30", "23:30"),
      entraDespues: crearHorario("entraDespues", "Entra después", "18:30", "00:30", true)
    }
  }
};

export const TURNO_POR_DEFECTO = "tarde";

export const obtenerConfiguracionTurno = (turnoId = TURNO_POR_DEFECTO) =>
  TURNOS[turnoId] || TURNOS[TURNO_POR_DEFECTO];

export const obtenerEstrategiaRotacionPlanilla = ({
  turnoId,
  tipo,
  mesActivo
} = {}) => {
  const estrategia = TURNOS[turnoId]?.rotacionPlanilla?.[tipo];
  const esCadaTresDias =
    estrategia?.tipo === "cada_3_dias" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(mesActivo || "") &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(estrategia.vigenteDesdeMes || "") &&
    mesActivo >= estrategia.vigenteDesdeMes &&
    esFechaIsoValida(estrategia.fechaBase) &&
    Number.isInteger(estrategia.duracionDias) &&
    estrategia.duracionDias > 0;

  return esCadaTresDias
    ? {
        tipo: estrategia.tipo,
        fechaBase: estrategia.fechaBase,
        duracionDias: estrategia.duracionDias,
        vigenteDesdeMes: estrategia.vigenteDesdeMes
      }
    : { tipo: "semanal" };
};
