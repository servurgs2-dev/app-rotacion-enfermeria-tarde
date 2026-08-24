import { useCallback, useEffect, useRef, useState } from "react";
import { cargarConfiguracionDotacionSupervisionEfectiva } from "../services/configuracionDotacionSupervisionMes.js";
import {
  crearConfiguracionDotacionFallback,
  esMesConfiguracionDotacionValido,
  ORIGEN_CONFIGURACION_DOTACION_MES
} from "../utils/configuracionDotacionSupervisionMes.js";

export const CODIGO_CONFIGURACION_DOTACION_NO_CARGADA =
  "CONFIGURACION_DOTACION_NO_CARGADA";

const crearEstadoFallback = (mes, { error = null, advertencias = [] } = {}) => ({
  mes: typeof mes === "string" ? mes : null,
  configuracion: crearConfiguracionDotacionFallback(),
  origen: ORIGEN_CONFIGURACION_DOTACION_MES.FALLBACK_CODIGO,
  revision: "0",
  updatedAt: null,
  updatedBy: null,
  heredadaDesdeMes: null,
  heredadaDesdeRevision: null,
  error,
  advertencias
});

export const normalizarErrorConfiguracionDotacion = (error) => ({
  message: typeof error?.message === "string" && error.message.trim()
    ? error.message
    : "No se pudo cargar la configuración mensual de dotación.",
  code: typeof error?.code === "string" && error.code.trim()
    ? error.code
    : null
});

const normalizarResultadoCarga = (resultado, mes) => ({
  ...crearEstadoFallback(mes),
  ...resultado,
  mes,
  error: null,
  advertencias: Array.isArray(resultado?.advertencias)
    ? structuredClone(resultado.advertencias)
    : []
});

export function useConfiguracionDotacionSupervision(mes) {
  const [respuesta, setRespuesta] = useState(() => ({
    clave: "",
    datos: crearEstadoFallback(mes)
  }));
  const [intento, setIntento] = useState(0);
  const solicitudRef = useRef(0);
  const mesValido = esMesConfiguracionDotacionValido(mes);
  const claveSolicitud = `${String(mes || "")}|${intento}`;

  useEffect(() => {
    const solicitud = solicitudRef.current + 1;
    solicitudRef.current = solicitud;

    if (!mesValido) {
      return () => {
        if (solicitudRef.current === solicitud) solicitudRef.current += 1;
      };
    }

    cargarConfiguracionDotacionSupervisionEfectiva(mes)
      .then((resultado) => {
        if (solicitudRef.current !== solicitud) return;
        setRespuesta({
          clave: claveSolicitud,
          datos: normalizarResultadoCarga(resultado, mes)
        });
      })
      .catch((errorCarga) => {
        if (solicitudRef.current !== solicitud) return;
        setRespuesta({
          clave: claveSolicitud,
          datos: crearEstadoFallback(mes, {
            error: normalizarErrorConfiguracionDotacion(errorCarga),
            advertencias: [{ codigo: CODIGO_CONFIGURACION_DOTACION_NO_CARGADA }]
          })
        });
      });

    return () => {
      if (solicitudRef.current === solicitud) solicitudRef.current += 1;
    };
  }, [claveSolicitud, mes, mesValido]);

  const recargar = useCallback(() => setIntento((actual) => actual + 1), []);
  const coincideMes = respuesta.datos.mes === mes;
  const datos = !mesValido
    ? crearEstadoFallback(mes, {
      error: { message: "El mes de configuración no es válido.", code: "MES_INVALIDO" },
      advertencias: [{ codigo: "MES_INVALIDO" }]
    })
    : coincideMes ? respuesta.datos : crearEstadoFallback(mes);

  return {
    ...datos,
    cargando: mesValido && respuesta.clave !== claveSolicitud,
    recargar
  };
}
