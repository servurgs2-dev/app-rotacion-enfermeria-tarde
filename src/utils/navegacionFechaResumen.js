const PATRON_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const PATRON_FECHA = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export const obtenerLimitesFechaMes = (mes) => {
  if (!PATRON_MES.test(String(mes || ""))) return { minima: "", maxima: "" };
  const [anio, numeroMes] = mes.split("-").map(Number);
  const ultimoDia = new Date(anio, numeroMes, 0, 12).getDate();
  return {
    minima: `${mes}-01`,
    maxima: `${mes}-${String(ultimoDia).padStart(2, "0")}`
  };
};

export const fechaPerteneceAlMes = (fecha, mes) => {
  if (!PATRON_FECHA.test(String(fecha || ""))) return false;
  const { minima, maxima } = obtenerLimitesFechaMes(mes);
  return Boolean(minima) && fecha >= minima && fecha <= maxima;
};

export const desplazarFechaDentroMes = ({ fecha, mes, dias } = {}) => {
  if (!fechaPerteneceAlMes(fecha, mes) || !Number.isInteger(dias)) return fecha;
  const [anio, numeroMes, dia] = fecha.split("-").map(Number);
  const desplazada = new Date(anio, numeroMes - 1, dia + dias, 12);
  const nuevaFecha = `${desplazada.getFullYear()}-${String(desplazada.getMonth() + 1).padStart(2, "0")}-${String(desplazada.getDate()).padStart(2, "0")}`;
  return fechaPerteneceAlMes(nuevaFecha, mes) ? nuevaFecha : fecha;
};
