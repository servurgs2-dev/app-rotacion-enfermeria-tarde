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
  const [mesRecargando, setMesRecargando] = useState(null);
  const solicitudRef = useRef(0);
  const montadoRef = useRef(true);
  const mesValido = esMesConfiguracionDotacionValido(mes);
  const claveSolicitud = String(mes || "");

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      solicitudRef.current += 1;
    };
  }, []);

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

  const recargar = useCallback(async () => {
    if (!esMesConfiguracionDotacionValido(mes)) {
      throw new TypeError("El mes de configuración no es válido.");
    }
    const solicitud = solicitudRef.current + 1;
    solicitudRef.current = solicitud;
    setMesRecargando(claveSolicitud);
    try {
      const resultado = await cargarConfiguracionDotacionSupervisionEfectiva(mes);
      const datosRecargados = normalizarResultadoCarga(resultado, mes);
      if (montadoRef.current && solicitudRef.current === solicitud) {
        setRespuesta({ clave: claveSolicitud, datos: datosRecargados });
      }
      return datosRecargados;
    } catch (errorCarga) {
      if (montadoRef.current && solicitudRef.current === solicitud) {
        setRespuesta({
          clave: claveSolicitud,
          datos: crearEstadoFallback(mes, {
            error: normalizarErrorConfiguracionDotacion(errorCarga),
            advertencias: [{ codigo: CODIGO_CONFIGURACION_DOTACION_NO_CARGADA }]
          })
        });
      }
      throw errorCarga;
    } finally {
      if (montadoRef.current && solicitudRef.current === solicitud) {
        setMesRecargando(null);
      }
    }
  }, [claveSolicitud, mes]);
  const coincideMes = respuesta.datos.mes === mes;
  const tieneResultadoMes = coincideMes && respuesta.clave !== "";
  const cargaInicial = mesValido && respuesta.clave !== claveSolicitud;
  const recargando = mesRecargando === claveSolicitud;
  const datos = !mesValido
    ? crearEstadoFallback(mes, {
      error: { message: "El mes de configuración no es válido.", code: "MES_INVALIDO" },
      advertencias: [{ codigo: "MES_INVALIDO" }]
    })
    : coincideMes ? respuesta.datos : crearEstadoFallback(mes);

  return {
    ...datos,
    cargando: cargaInicial || recargando,
    cargaInicial,
    recargando: recargando && tieneResultadoMes,
    recargar
  };
}
