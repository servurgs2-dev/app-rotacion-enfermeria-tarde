import { TURNOS } from "../config/turnos.js";
import {
  CATEGORIAS_DOTACION_SUPERVISION,
  resolverEstadoDotacion,
  resolverUmbralDotacion
} from "./dotacionSupervision.js";
import { proyectarDotacionDiaSupervision } from "./proyeccionDotacionSupervision.js";
import { crearValidadorExtrasOrigenDia } from "./indisponibilidadesSupervision.js";

export const TURNOS_AGREGADO_SUPERVISION = Object.freeze(Object.keys(TURNOS));

const estadoSinDatos = () => ({
  ok: false,
  cantidad: null,
  minimo: null,
  optimo: null,
  estado: "sin_datos",
  faltanParaMinimo: null,
  faltanParaOptimo: null,
  excedenteSobreOptimo: null,
  errores: []
});

export const proyectarSupervisionDia = ({
  estadosPorTurno = {},
  novedadesModernas = [],
  fecha,
  mes,
  configuracionDotacion
} = {}) => {
  const resumen = { criticos: 0, bajoOptimo: 0, optimos: 0, sinDatos: 0 };
  const advertencias = [];
  const errores = [];
  let disponibles = 0;
  const validarExtraOrigen = crearValidadorExtrasOrigenDia({
    estadosPorTurno,
    novedadesModernas,
    fecha
  });

  const turnos = Object.fromEntries(TURNOS_AGREGADO_SUPERVISION.map((turno) => {
    const estadoMensual = estadosPorTurno?.[turno] ?? null;
    const categorias = Object.fromEntries(CATEGORIAS_DOTACION_SUPERVISION.map((categoria) => {
      const proyeccion = proyectarDotacionDiaSupervision({
        estadoMensual,
        novedadesModernas,
        fecha,
        turno,
        categoria,
        mes,
        validarExtraOrigen
      });
      const umbral = resolverUmbralDotacion({
        configuracion: configuracionDotacion,
        turno,
        categoria
      });
      const disponible = proyeccion?.disponible === true &&
        Number.isInteger(proyeccion?.dotacionPrevistaOperativa?.cantidad);
      const estadoDotacion = disponible
        ? resolverEstadoDotacion({
            cantidad: proyeccion.dotacionPrevistaOperativa.cantidad,
            minimo: umbral.minimo,
            optimo: umbral.optimo
          })
        : estadoSinDatos();

      if (disponible) disponibles += 1;
      if (estadoDotacion.estado === "critico") resumen.criticos += 1;
      else if (estadoDotacion.estado === "bajo_optimo") resumen.bajoOptimo += 1;
      else if (estadoDotacion.estado === "optimo") resumen.optimos += 1;
      else resumen.sinDatos += 1;

      (Array.isArray(proyeccion?.advertencias) ? proyeccion.advertencias : [])
        .forEach((advertencia) => advertencias.push({ turno, categoria, ...advertencia }));
      (Array.isArray(proyeccion?.errores) ? proyeccion.errores : [])
        .forEach((error) => errores.push({ turno, categoria, ...error }));
      (Array.isArray(umbral?.errores) ? umbral.errores : [])
        .forEach((error) => errores.push({ turno, categoria, fuente: "umbral", ...error }));

      return [categoria, { disponible, proyeccion, umbral, estadoDotacion }];
    }));
    return [turno, { disponible: Object.values(categorias).some((item) => item.disponible), ...categorias }];
  }));

  return {
    ok: disponibles > 0,
    disponible: disponibles > 0,
    fecha,
    mes,
    turnos,
    resumen,
    advertencias,
    errores
  };
};
