import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TURNOS } from "../config/turnos.js";
import { cargarEstadosTurnosPorMes } from "../services/estadoPorTurnoMes.js";
import {
  combinarEstadoActivoComparacion,
  crearClaveCacheComparacion,
  debeConsultarComparacion,
  esSolicitudComparacionVigente
} from "../utils/comparacionTurnos.js";

export function useEstadosTurnosMes({ mesActivo, turnoActivo, estadoActivo, habilitado }) {
  const [cache, setCache] = useState(() => new Map());
  const [intento, setIntento] = useState(0);
  const solicitudRef = useRef(0);
  const turnos = useMemo(() => Object.keys(TURNOS), []);
  const claveSolicitud = crearClaveCacheComparacion(mesActivo, intento);

  useEffect(() => {
    if (!debeConsultarComparacion({ habilitado, cache, claveSolicitud })) return undefined;
    const solicitud = solicitudRef.current + 1;
    solicitudRef.current = solicitud;

    cargarEstadosTurnosPorMes(mesActivo, turnos)
      .then((estados) => {
        if (!esSolicitudComparacionVigente(solicitudRef.current, solicitud)) return;
        setCache((actual) => new Map(actual).set(
          claveSolicitud,
          { estado: "exito", estados, error: "" }
        ));
      })
      .catch(() => {
        if (!esSolicitudComparacionVigente(solicitudRef.current, solicitud)) return;
        setCache((actual) => new Map(actual).set(
          claveSolicitud,
          {
            estado: "error",
            estados: {},
            error: "No fue posible cargar la comparación de turnos."
          }
        ));
      });

    return () => {
      if (solicitudRef.current !== solicitud) return;
      solicitudRef.current += 1;
    };
  }, [cache, claveSolicitud, habilitado, mesActivo, turnos]);

  const actualizar = useCallback(() => setIntento((valor) => valor + 1), []);
  const resultado = cache.get(claveSolicitud);
  const resuelto = resultado?.estado === "exito" || resultado?.estado === "error";

  return {
    estadosPorTurno: combinarEstadoActivoComparacion({
      estadosRecuperados: resultado?.estado === "exito" ? resultado.estados : {},
      turnoActivo,
      estadoActivo
    }),
    cargando: habilitado && !resuelto,
    error: resultado?.estado === "error" ? resultado.error : "",
    actualizar
  };
}
