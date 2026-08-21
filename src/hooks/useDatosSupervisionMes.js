import { useCallback, useEffect, useRef, useState } from "react";
import { cargarEstadosTurnosPorMes } from "../services/estadoPorTurnoMes.js";
import { listarNovedadesPersonal } from "../services/novedadesPersonal.js";
import { esSolicitudComparacionVigente } from "../utils/comparacionTurnos.js";
import {
  cargarDatosSupervisionMes,
  combinarEstadoLocalSupervision,
  crearResultadoSupervisionVacio
} from "../utils/datosSupervisionMes.js";

export function useDatosSupervisionMes({
  mes,
  habilitado = true,
  turnoActivo,
  mesActivo,
  estadoActivo
} = {}) {
  const [respuesta, setRespuesta] = useState(() => ({
    clave: "",
    datos: crearResultadoSupervisionVacio()
  }));
  const [intento, setIntento] = useState(0);
  const solicitudRef = useRef(0);
  const claveSolicitud = `${String(mes || "")}|${intento}`;

  useEffect(() => {
    if (!habilitado) return undefined;
    const solicitud = solicitudRef.current + 1;
    solicitudRef.current = solicitud;

    cargarDatosSupervisionMes({
      mes,
      cargarEstados: cargarEstadosTurnosPorMes,
      listarNovedades: listarNovedadesPersonal
    }).then((datos) => {
      if (!esSolicitudComparacionVigente(solicitudRef.current, solicitud)) return;
      setRespuesta({ clave: claveSolicitud, datos });
    });

    return () => {
      if (solicitudRef.current === solicitud) solicitudRef.current += 1;
    };
  }, [claveSolicitud, habilitado, mes]);

  const recargar = useCallback(() => setIntento((actual) => actual + 1), []);
  const datosMes = respuesta.datos.mes === mes
    ? respuesta.datos
    : crearResultadoSupervisionVacio(mes);

  return {
    ...datosMes,
    estadosPorTurno: combinarEstadoLocalSupervision({
      estadosPorTurno: datosMes.estadosPorTurno,
      turnoActivo,
      mesConsultado: mes,
      mesEstadoActivo: mesActivo,
      estadoActivo
    }),
    cargando: habilitado && respuesta.clave !== claveSolicitud,
    recargar
  };
}
