import { TURNOS } from "../config/turnos.js";

const dia = (fecha) => Number(String(fecha || "").slice(8, 10));

const ultimoDiaMes = (mes) => {
  const [anio, numeroMes] = String(mes || "").split("-").map(Number);
  if (!anio || numeroMes < 1 || numeroMes > 12) return 0;
  return new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
};
const textoRango = (desde, hasta) => desde === hasta ? String(desde) : `${desde}–${hasta}`;

export const crearDetalleVigenciasPersonal = ({ mes, entrada } = {}) => {
  if (!entrada || entrada.origen !== "explicita") return { rangos: [], huecos: [] };
  const vigencias = [...(entrada.vigencias || [])].sort((a, b) => a.desde.localeCompare(b.desde));
  const rangos = vigencias.map((vigencia) => ({
    texto: `${textoRango(dia(vigencia.desde), dia(vigencia.hasta))} ${
      TURNOS[vigencia.turno]?.nombre || vigencia.turno
    }`,
    turno: vigencia.turno
  }));
  const huecos = [];
  let siguiente = 1;
  vigencias.forEach((vigencia) => {
    const desde = dia(vigencia.desde);
    if (desde > siguiente) huecos.push(textoRango(siguiente, desde - 1));
    siguiente = Math.max(siguiente, dia(vigencia.hasta) + 1);
  });
  const ultimo = ultimoDiaMes(mes);
  if (ultimo && siguiente <= ultimo) huecos.push(textoRango(siguiente, ultimo));
  return { rangos, huecos };
};
