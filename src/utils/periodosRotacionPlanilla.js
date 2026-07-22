const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;
const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic"
];

const esFechaValida = (fecha) =>
  fecha instanceof Date && !Number.isNaN(fecha.getTime());

const fechaUtcAiso = (fecha) => esFechaValida(fecha)
  ? fecha.toISOString().slice(0, 10)
  : "";

const sumarDiasUtc = (fecha, dias) =>
  new Date(fecha.getTime() + dias * MILISEGUNDOS_POR_DIA);

export const parsearFechaIsoUTC = (fechaIso) => {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso || "");
  if (!coincidencia) return null;

  const [, anioTexto, mesTexto, diaTexto] = coincidencia;
  const fecha = new Date(Date.UTC(
    Number(anioTexto),
    Number(mesTexto) - 1,
    Number(diaTexto)
  ));

  return fechaUtcAiso(fecha) === fechaIso ? fecha : null;
};

const resolverFechaUtc = (fecha) => {
  if (typeof fecha === "string") return parsearFechaIsoUTC(fecha);
  if (!esFechaValida(fecha)) return null;
  return new Date(Date.UTC(
    fecha.getUTCFullYear(),
    fecha.getUTCMonth(),
    fecha.getUTCDate()
  ));
};

const esDuracionValida = (duracionDias) =>
  Number.isInteger(duracionDias) && duracionDias > 0;

export const calcularIndiceBloque = ({ fecha, fechaBase, duracionDias } = {}) => {
  const fechaUtc = resolverFechaUtc(fecha);
  const baseUtc = parsearFechaIsoUTC(fechaBase);
  if (!fechaUtc || !baseUtc || !esDuracionValida(duracionDias)) return null;

  const diasDesdeBase = Math.floor(
    (fechaUtc.getTime() - baseUtc.getTime()) / MILISEGUNDOS_POR_DIA
  );
  return Math.floor(diasDesdeBase / duracionDias);
};

export const crearClaveBloque = (fechaInicio) =>
  fechaUtcAiso(resolverFechaUtc(fechaInicio));

export const formatearEtiquetaBloque = ({ fechaInicio, fechaFin } = {}) => {
  const inicio = resolverFechaUtc(fechaInicio);
  const fin = resolverFechaUtc(fechaFin);
  if (!inicio || !fin) return "";

  const diaInicio = inicio.getUTCDate();
  const diaFin = fin.getUTCDate();
  const mesInicio = MESES_CORTOS[inicio.getUTCMonth()];
  const mesFin = MESES_CORTOS[fin.getUTCMonth()];

  return inicio.getUTCMonth() === fin.getUTCMonth() &&
    inicio.getUTCFullYear() === fin.getUTCFullYear()
    ? `${diaInicio}\u2013${diaFin} ${mesFin}`
    : `${diaInicio} ${mesInicio}\u2013${diaFin} ${mesFin}`;
};

export const obtenerBloqueParaFecha = ({
  fecha,
  fechaBase,
  duracionDias
} = {}) => {
  const baseUtc = parsearFechaIsoUTC(fechaBase);
  const indice = calcularIndiceBloque({ fecha, fechaBase, duracionDias });
  if (!baseUtc || indice === null) return null;

  const inicio = sumarDiasUtc(baseUtc, indice * duracionDias);
  const fin = sumarDiasUtc(inicio, duracionDias - 1);
  const fechaInicio = fechaUtcAiso(inicio);
  const fechaFin = fechaUtcAiso(fin);

  return {
    clave: crearClaveBloque(inicio),
    indice,
    fechaInicio,
    fechaFin,
    etiqueta: formatearEtiquetaBloque({ fechaInicio, fechaFin })
  };
};

export const obtenerBloquesQueIntersectanMes = ({
  mesActivo,
  fechaBase,
  duracionDias
} = {}) => {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(mesActivo || "");
  if (!coincidencia || !esDuracionValida(duracionDias)) return [];

  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  if (mes < 1 || mes > 12) return [];

  const inicioMes = new Date(Date.UTC(anio, mes - 1, 1));
  const finMes = new Date(Date.UTC(anio, mes, 0));
  const primerBloque = obtenerBloqueParaFecha({
    fecha: inicioMes,
    fechaBase,
    duracionDias
  });
  if (!primerBloque) return [];

  const periodos = [];
  let bloque = primerBloque;
  while (parsearFechaIsoUTC(bloque.fechaInicio) <= finMes) {
    periodos.push(bloque);
    bloque = obtenerBloqueParaFecha({
      fecha: sumarDiasUtc(parsearFechaIsoUTC(bloque.fechaInicio), duracionDias),
      fechaBase,
      duracionDias
    });
  }

  return periodos;
};
