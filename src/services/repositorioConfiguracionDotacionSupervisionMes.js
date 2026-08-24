import {
  esMesConfiguracionDotacionValido,
  resolverConfiguracionDotacionSupervisionMes,
  validarConfiguracionDotacionMaterializada
} from "../utils/configuracionDotacionSupervisionMes.js";

const TABLA = "configuracion_dotacion_supervision_mes";
const RPC_GUARDADO = "guardar_configuracion_dotacion_supervision_mes";
const COLUMNAS = "mes, configuracion, revision, updated_at, updated_by";

const validarMes = (mes) => {
  if (!esMesConfiguracionDotacionValido(mes)) {
    throw new TypeError("El mes debe tener formato YYYY-MM y ser válido.");
  }
  return mes;
};

export const normalizarRevisionConfiguracionDotacion = (
  revision,
  { permitirCero = true } = {}
) => {
  const texto = typeof revision === "bigint"
    ? revision.toString()
    : typeof revision === "number" && Number.isSafeInteger(revision)
      ? String(revision)
      : typeof revision === "string" ? revision.trim() : "";
  if (!/^\d+$/.test(texto)) {
    throw new TypeError("La revisión esperada debe ser un entero decimal no negativo.");
  }
  const normalizada = texto.replace(/^0+(?=\d)/, "");
  if (!permitirCero && normalizada === "0") {
    throw new RangeError("La revisión de una fila persistida debe ser 1 o superior.");
  }
  return normalizada;
};

const normalizarFila = (fila) => {
  if (!fila) return null;
  return {
    mes: fila.mes,
    configuracion: structuredClone(fila.configuracion),
    revision: normalizarRevisionConfiguracionDotacion(fila.revision, { permitirCero: false }),
    updatedAt: typeof fila.updated_at === "string" ? fila.updated_at : null,
    updatedBy: typeof fila.updated_by === "string" ? fila.updated_by : null
  };
};

const validarCliente = (cliente) => {
  if (!cliente) throw new Error("Supabase no está configurado.");
};

export const interpretarRespuestaGuardadoConfiguracionDotacion = (respuesta) => {
  const contenido = Array.isArray(respuesta) ? respuesta[0] : respuesta;
  if (!contenido || typeof contenido !== "object") {
    throw new Error("La RPC de configuración devolvió una respuesta vacía.");
  }
  if (contenido.resultado === "guardado") {
    return {
      ok: true,
      conflicto: false,
      mes: contenido.mes,
      revision: normalizarRevisionConfiguracionDotacion(contenido.revision, { permitirCero: false }),
      updatedAt: typeof contenido.updated_at === "string" ? contenido.updated_at : null
    };
  }
  if (contenido.resultado === "conflicto" && contenido.codigo === "REVISION_CONFLICTO") {
    const existe = contenido.existe === true;
    const validacion = existe
      ? validarConfiguracionDotacionMaterializada(contenido.configuracion)
      : { ok: true, errores: [] };
    return {
      ok: false,
      conflicto: true,
      codigo: "REVISION_CONFLICTO",
      mes: contenido.mes,
      revisionActual: normalizarRevisionConfiguracionDotacion(
        existe ? contenido.revision : "0",
        { permitirCero: !existe }
      ),
      configuracionActual: existe && validacion.ok
        ? structuredClone(contenido.configuracion)
        : null,
      updatedAt: existe && typeof contenido.updated_at === "string"
        ? contenido.updated_at
        : null,
      advertencias: existe && !validacion.ok
        ? [{ codigo: "CONFIGURACION_CONFLICTO_INVALIDA", errores: validacion.errores }]
        : []
    };
  }
  throw new Error("La RPC de configuración devolvió un resultado desconocido.");
};

export const crearRepositorioConfiguracionDotacionSupervisionMes = (cliente) => {
  const cargarConfiguracionDotacionSupervisionMes = async (mes) => {
    validarCliente(cliente);
    const mesValidado = validarMes(mes);
    const { data, error } = await cliente
      .from(TABLA)
      .select(COLUMNAS)
      .eq("mes", mesValidado)
      .maybeSingle();
    if (error) throw error;
    return normalizarFila(data);
  };

  const cargarConfiguracionDotacionSupervisionAnterior = async (mes) => {
    validarCliente(cliente);
    const mesValidado = validarMes(mes);
    const { data, error } = await cliente
      .from(TABLA)
      .select(COLUMNAS)
      .lt("mes", mesValidado)
      .order("mes", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return normalizarFila(data);
  };

  const cargarConfiguracionDotacionSupervisionEfectiva = async (mes) => {
    const mesValidado = validarMes(mes);
    const filaExacta = await cargarConfiguracionDotacionSupervisionMes(mesValidado);
    if (filaExacta) {
      return resolverConfiguracionDotacionSupervisionMes({ mes: mesValidado, filaExacta });
    }
    const filaAnterior = await cargarConfiguracionDotacionSupervisionAnterior(mesValidado);
    return resolverConfiguracionDotacionSupervisionMes({ mes: mesValidado, filaAnterior });
  };

  const guardarConfiguracionDotacionSupervisionMes = async ({
    mes,
    configuracion,
    revisionEsperada
  } = {}) => {
    validarCliente(cliente);
    const mesValidado = validarMes(mes);
    const validacion = validarConfiguracionDotacionMaterializada(configuracion);
    if (!validacion.ok) {
      const error = new TypeError("La configuración mensual no es válida.");
      error.codigo = "CONFIGURACION_INVALIDA";
      error.detalles = validacion.errores;
      throw error;
    }
    const revision = normalizarRevisionConfiguracionDotacion(revisionEsperada);
    const { data, error } = await cliente.rpc(RPC_GUARDADO, {
      p_mes: mesValidado,
      p_configuracion: structuredClone(configuracion),
      p_revision_esperada: revision
    });
    if (error) throw error;
    return interpretarRespuestaGuardadoConfiguracionDotacion(data);
  };

  return {
    cargarConfiguracionDotacionSupervisionMes,
    cargarConfiguracionDotacionSupervisionAnterior,
    cargarConfiguracionDotacionSupervisionEfectiva,
    guardarConfiguracionDotacionSupervisionMes
  };
};
