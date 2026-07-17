export const parsearFechaLocal = (fechaStr) => {
  const [y, m, d] = fechaStr.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d), 12);
};

export const keyDiaFromDate = (fecha) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

export const obtenerSemanasDelMes = (mesActivo) => {
  if (!mesActivo) return [];

  const [year, month] = mesActivo.split("-").map(Number);
  const primerDia = new Date(year, month - 1, 1);

  const inicio = new Date(primerDia);
  const dia = inicio.getDay();
  inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1));

  const semanas = [];

  for (let i = 0; i < 5; i++) {
    const desde = new Date(inicio);
    desde.setDate(inicio.getDate() + i * 7);

    const hasta = new Date(desde);
    hasta.setDate(desde.getDate() + 6);

    semanas.push({ desde, hasta });
  }

  return semanas;
};

export const obtenerIniciosSemana = (mesActivo) =>
  obtenerSemanasDelMes(mesActivo).map((s) => s.desde);

export const semanaKeyFromDate = (fecha, mesActivo) => {
  const semanas = obtenerIniciosSemana(mesActivo);
  const semanaIndex = semanas.findIndex((inicioSemana) => {
    const fin = new Date(inicioSemana);
    fin.setDate(fin.getDate() + 6);
    return fecha >= inicioSemana && fecha <= fin;
  });

  return semanaIndex === -1 ? "semana1" : `semana${semanaIndex + 1}`;
};

export const estaDeLicencia = (licencias, nombre, fecha) =>
  (licencias || []).some((l) => {
    if (l.nombre !== nombre) return false;

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

export const esDiaLibre = (persona, diaDelMes, esExtraHoy = false) => {
  if (!persona || persona.libre == null) return false;
  if (esExtraHoy) return false;

  return ((diaDelMes - persona.libre) % 5 + 5) % 5 === 0;
};
