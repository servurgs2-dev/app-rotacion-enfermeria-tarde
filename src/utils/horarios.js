const MINUTOS_POR_DIA = 24 * 60;
const PATRON_HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const horaAMinutos = (hora) => {
  if (typeof hora !== "string" || !PATRON_HORA.test(hora)) {
    throw new TypeError(`La hora "${String(hora)}" debe tener formato HH:mm válido.`);
  }

  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
};

export const minutosAHora = (minutos) => {
  if (!Number.isInteger(minutos)) {
    throw new TypeError("Los minutos deben ser un número entero.");
  }

  const minutosNormalizados = ((minutos % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA;
  const horas = Math.floor(minutosNormalizados / 60);
  const restoMinutos = minutosNormalizados % 60;

  return `${String(horas).padStart(2, "0")}:${String(restoMinutos).padStart(2, "0")}`;
};

export const duracionIntervalo = (entrada, salida) => {
  const inicio = horaAMinutos(entrada);
  let fin = horaAMinutos(salida);

  if (fin <= inicio) fin += MINUTOS_POR_DIA;

  return fin - inicio;
};

const diferenciaRelativa = (minutos, referencia) => {
  const diferencia = minutos - referencia;
  return ((diferencia + MINUTOS_POR_DIA / 2) % MINUTOS_POR_DIA + MINUTOS_POR_DIA) %
    MINUTOS_POR_DIA - MINUTOS_POR_DIA / 2;
};

export const crearIntervaloRelativo = (horario, horaInicioNormal) => {
  if (!horario || typeof horario !== "object" || Array.isArray(horario)) {
    throw new TypeError("El horario debe ser un objeto con entrada y salida.");
  }

  const inicioReloj = horaAMinutos(horario.entrada);
  const finReloj = horaAMinutos(horario.salida);
  const inicioNormal = horaAMinutos(horaInicioNormal);
  const duracion = duracionIntervalo(horario.entrada, horario.salida);
  const inicioRelativo = diferenciaRelativa(inicioReloj, inicioNormal);

  return {
    inicioRelativo,
    finRelativo: inicioRelativo + duracion,
    duracion,
    cruzaMedianoche: finReloj <= inicioReloj
  };
};
