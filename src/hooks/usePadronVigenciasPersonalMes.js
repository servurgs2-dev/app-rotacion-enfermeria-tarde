import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TURNOS } from "../config/turnos.js";
import { cargarEstadosTurnosPorMes } from "../services/estadoPorTurnoMes.js";
import { cargarVigenciasTurnoMes } from "../services/vigenciasTurnoPersonal.js";
import { combinarEstadoActivoComparacion } from "../utils/comparacionTurnos.js";
import { resolverPadronVigenciasEfectivasMes } from "../utils/padronVigenciasTurnoPersonal.js";

const MENSAJE_ERROR = "No se pudo cargar la información de turnos del mes.";

export function usePadronVigenciasPersonalMes({
  mes,
  turnoActivo,
  estadoActivo,
  habilitado = true
} = {}) {
  const [respuesta, setRespuesta] = useState(() => ({
    clave: "",
    estadosPorTurno: {},
    configuracionesExplicitas: [],
    error: ""
  }));
  const [intento, setIntento] = useState(0);
  const solicitudRef = useRef(0);
  const clave = `${String(mes || "")}|${intento}`;

  useEffect(() => {
    if (!habilitado) return undefined;
    const solicitud = solicitudRef.current + 1;
    solicitudRef.current = solicitud;

    Promise.all([
      cargarEstadosTurnosPorMes(mes, Object.keys(TURNOS)),
      cargarVigenciasTurnoMes(mes)
    ]).then(([estadosPorTurno, configuracionesExplicitas]) => {
      if (solicitudRef.current !== solicitud) return;
      setRespuesta({ clave, estadosPorTurno, configuracionesExplicitas, error: "" });
    }).catch(() => {
      if (solicitudRef.current !== solicitud) return;
      setRespuesta({
        clave,
        estadosPorTurno: {},
        configuracionesExplicitas: [],
        error: MENSAJE_ERROR
      });
    });

    return () => {
      if (solicitudRef.current === solicitud) solicitudRef.current += 1;
    };
  }, [clave, habilitado, mes]);

  const vigente = respuesta.clave === clave;
  const estadosPorTurno = useMemo(() => combinarEstadoActivoComparacion({
    estadosRecuperados: respuesta.estadosPorTurno,
    turnoActivo,
    estadoActivo
  }), [estadoActivo, respuesta.estadosPorTurno, turnoActivo]);
  const padron = useMemo(() => {
    if (!vigente || respuesta.error) return null;
    return resolverPadronVigenciasEfectivasMes({
      mes,
      estadosPorTurno,
      configuracionesExplicitas: respuesta.configuracionesExplicitas
    });
  }, [estadosPorTurno, mes, respuesta.configuracionesExplicitas, respuesta.error, vigente]);

  const recargar = useCallback(() => setIntento((actual) => actual + 1), []);
  return {
    mes,
    padron,
    estadosPorTurno: vigente && !respuesta.error ? estadosPorTurno : null,
    cargando: habilitado && !vigente,
    error: vigente ? respuesta.error : "",
    recargar
  };
}
