import { licenciaCorrespondeAPersona } from "./licenciasPersonas.js";

export const parsearFechaLocal = (fechaStr) => {
  const [y, m, d] = fechaStr.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d), 12);
};

export const keyDiaFromDate = (fecha) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

export const obtenerSemanasDelMes = (mesActivo) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesActivo || "")) return [];

  const [year, month] = mesActivo.split("-").map(Number);
  const primerDia = new Date(year, month - 1, 1, 12);
  const ultimoDiaDelMes = new Date(year, month, 0, 12);

  const inicio = new Date(primerDia);
  const dia = inicio.getDay();
  inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1));

  const crearSemana = (indice) => {
    const desde = new Date(inicio);
    desde.setDate(inicio.getDate() + indice * 7);

    const hasta = new Date(desde);
    hasta.setDate(desde.getDate() + 6);

    return {
      clave: `semana${indice + 1}`,
      indice,
      desde,
      hasta
    };
  };

  const semanas = Array.from({ length: 5 }, (_, indice) => crearSemana(indice));

  if (semanas[4].hasta < ultimoDiaDelMes) {
    semanas.push(crearSemana(5));
  }

  return semanas;
};

export const obtenerIniciosSemana = (mesActivo) =>
  obtenerSemanasDelMes(mesActivo).map((s) => s.desde);

export const semanaKeyFromDate = (fecha, mesActivo) => {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return null;

  const fechaUTC = Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const semana = obtenerSemanasDelMes(mesActivo).find(({ desde, hasta }) => {
    const desdeUTC = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
    const hastaUTC = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
    return fechaUTC >= desdeUTC && fechaUTC <= hastaUTC;
  });

  return semana?.clave || null;
};

export const estaDeLicencia = (licencias, persona, fecha, personal = []) =>
  (licencias || []).some((l) => {
    if (!licenciaCorrespondeAPersona(l, persona, personal)) return false;

    const desde = parsearFechaLocal(l.desde);
    const hasta = parsearFechaLocal(l.hasta);

    return fecha >= desde && fecha <= hasta;
  });

export const estaCertificado = (certificaciones, nombre, fecha) =>
  (certificaciones || []).some((certificacion) => {
    if (certificacion.nombre !== nombre) return false;

    const desde = parsearFechaLocal(certificacion.desde);
    const hasta = parsearFechaLocal(certificacion.hasta);

    return fecha >= desde && fecha <= hasta;
  });

// El 1/7/2026 es la referencia institucional de las cinco fases del régimen 4 y 1.
const FECHA_BASE_LIBRES_UTC = Date.UTC(2026, 6, 1);
const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export const esDiaLibre = (persona, fecha, esExtraHoy = false) => {
  const fasePersona = Number(persona?.libre);

  if (
    !persona ||
    !(fecha instanceof Date) ||
    Number.isNaN(fecha.getTime()) ||
    !Number.isInteger(fasePersona) ||
    fasePersona < 1 ||
    fasePersona > 5
  ) {
    return false;
  }
  if (esExtraHoy) return false;

  const fechaUTC = Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diasDesdeBase = (fechaUTC - FECHA_BASE_LIBRES_UTC) / MILISEGUNDOS_POR_DIA;
  const fase = ((diasDesdeBase % 5) + 5) % 5 + 1;

  return fase === fasePersona;
};

export const obtenerDiasLibresDelMes = (valorLibre, mesActivo) => {
  const grupo = Number(valorLibre);

  if (
    !Number.isInteger(grupo) ||
    grupo < 1 ||
    grupo > 5 ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(mesActivo || "")
  ) {
    return [];
  }

  const [anio, mes] = mesActivo.split("-").map(Number);
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const diasLibres = [];

  for (let dia = 1; dia <= ultimoDia; dia += 1) {
    const fecha = new Date(anio, mes - 1, dia, 12);
    if (esDiaLibre({ libre: grupo }, fecha)) {
      diasLibres.push(dia);
    }
  }

  return diasLibres;
};
