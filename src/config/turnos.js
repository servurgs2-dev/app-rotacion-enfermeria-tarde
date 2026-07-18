const crearHorario = (id, nombre, entrada, salida, cruzaMedianoche = false) => ({
  id,
  nombre,
  entrada,
  salida,
  textoVisible: `${entrada} a ${salida}`,
  cruzaMedianoche
});

export const TURNOS = {
  noche: {
    id: "noche",
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
