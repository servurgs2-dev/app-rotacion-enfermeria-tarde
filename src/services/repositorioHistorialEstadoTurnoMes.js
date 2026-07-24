import { TURNOS } from "../config/turnos.js";
import { normalizarRevisionConcurrencia } from "./repositorioEstadoPorTurnoMes.js";

const ACCIONES_HISTORIAL = new Set([
  "linea_base",
  "creacion",
  "actualizacion_cas",
  "restauracion"
]);
const LIMITE_PREDETERMINADO = 25;
const LIMITE_MAXIMO = 100;
const CAMPOS_LISTADO = [
  "id",
  "turno",
  "mes",
  "revision",
  "revision_anterior",
  "accion",
  "usuario_id",
  "usuario_snapshot",
  "rol_snapshot",
  "turno_perfil_snapshot",
  "secciones_cambiadas",
  "origen_revision",
  "created_at"
].join(", ");
const CAMPOS_DETALLE = `${CAMPOS_LISTADO}, data, metadata`;

const validarEnteroPositivo = (valor, nombre) => {
  const texto =
    typeof valor === "bigint"
      ? valor.toString()
      : typeof valor === "number" && Number.isSafeInteger(valor)
        ? String(valor)
        : typeof valor === "string"
          ? valor.trim()
          : "";
  if (!/^[1-9]\d*$/.test(texto)) {
    throw new TypeError(`${nombre} debe ser un entero positivo.`);
  }
  return texto;
};

const validarTurno = (turno) => {
  if (turno === undefined || turno === null || turno === "") return null;
  const normalizado = String(turno).trim();
  if (!Object.hasOwn(TURNOS, normalizado)) {
    throw new RangeError("El turno del historial no es válido.");
  }
  return normalizado;
};

const validarMes = (mes) => {
  if (mes === undefined || mes === null || mes === "") return null;
  const normalizado = String(mes).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizado)) {
    throw new TypeError("El mes del historial debe tener formato YYYY-MM.");
  }
  return normalizado;
};

const validarFecha = (fecha, nombre) => {
  if (fecha === undefined || fecha === null || fecha === "") return null;
  const normalizada = String(fecha).trim();
  const coincidencia = normalizada.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/
  );
  if (!coincidencia) {
    throw new TypeError(`${nombre} no es una fecha válida.`);
  }
  const [, anio, mes, dia, hora, minuto, segundo, , zona] = coincidencia;
  const fechaCivil = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  const civilValida =
    fechaCivil.getUTCFullYear() === Number(anio) &&
    fechaCivil.getUTCMonth() === Number(mes) - 1 &&
    fechaCivil.getUTCDate() === Number(dia);
  const horaValida = Number(hora) <= 23 &&
    Number(minuto) <= 59 &&
    Number(segundo) <= 59;
  const offsetValido = zona === "Z" || (() => {
    const [horasOffset, minutosOffset] = zona.slice(1).split(":").map(Number);
    return horasOffset <= 14 && minutosOffset <= 59 &&
      (horasOffset < 14 || minutosOffset === 0);
  })();
  const fechaInterpretada = new Date(normalizada);
  if (
    !civilValida ||
    !horaValida ||
    !offsetValido ||
    Number.isNaN(fechaInterpretada.getTime())
  ) {
    throw new TypeError(`${nombre} no es una fecha válida.`);
  }
  return fechaInterpretada.toISOString();
};

const validarUsuarioId = (usuarioId) => {
  if (usuarioId === undefined || usuarioId === null || usuarioId === "") {
    return null;
  }
  const normalizado = String(usuarioId).trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalizado
    )
  ) {
    throw new TypeError("usuarioId debe ser un UUID válido.");
  }
  return normalizado;
};

const normalizarAccion = (accion) => {
  if (accion === undefined || accion === null || accion === "") return null;
  const normalizada = String(accion).trim();
  if (!ACCIONES_HISTORIAL.has(normalizada)) {
    throw new RangeError("La acción histórica no es válida.");
  }
  return normalizada;
};

const normalizarLimite = (limite) => {
  if (limite === undefined) return LIMITE_PREDETERMINADO;
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO) {
    throw new RangeError(`El límite debe estar entre 1 y ${LIMITE_MAXIMO}.`);
  }
  return limite;
};

const normalizarFila = (fila, { incluirData = false } = {}) => ({
  id: validarEnteroPositivo(fila.id, "El id"),
  turno: fila.turno,
  mes: fila.mes,
  revision: normalizarRevisionConcurrencia(fila.revision, { permitirCero: false }),
  revisionAnterior:
    fila.revision_anterior === null
      ? null
      : normalizarRevisionConcurrencia(fila.revision_anterior),
  accion: fila.accion,
  usuarioId: fila.usuario_id ?? null,
  usuarioSnapshot: fila.usuario_snapshot ?? null,
  rolSnapshot: fila.rol_snapshot ?? null,
  turnoPerfilSnapshot: fila.turno_perfil_snapshot ?? null,
  seccionesCambiadas: Array.isArray(fila.secciones_cambiadas)
    ? [...fila.secciones_cambiadas]
    : [],
  origenRevision:
    fila.origen_revision === null
      ? null
      : normalizarRevisionConcurrencia(fila.origen_revision, {
          permitirCero: false
        }),
  createdAt: typeof fila.created_at === "string" ? fila.created_at : null,
  ...(incluirData
    ? {
        data: fila.data,
        metadata:
          fila.metadata && typeof fila.metadata === "object"
            ? fila.metadata
            : {}
      }
    : {})
});

const esErrorPermiso = (error) =>
  error?.code === "42501" ||
  /permission|permiso|row-level security/i.test(String(error?.message ?? ""));

export const interpretarRespuestaRestauracion = (respuesta) => {
  const contenido = Array.isArray(respuesta) ? respuesta[0] : respuesta;
  if (!contenido || typeof contenido !== "object") {
    throw new Error("La restauración devolvió una respuesta vacía.");
  }
  if (contenido.resultado === "no_encontrado") {
    return { tipo: "no_encontrado" };
  }
  if (contenido.resultado === "restaurado") {
    return {
      tipo: "restaurado",
      turno: contenido.turno,
      mes: contenido.mes,
      revision: normalizarRevisionConcurrencia(contenido.revision, {
        permitirCero: false
      }),
      revisionAnterior: normalizarRevisionConcurrencia(
        contenido.revision_anterior,
        { permitirCero: false }
      ),
      origenRevision: normalizarRevisionConcurrencia(
        contenido.origen_revision,
        { permitirCero: false }
      ),
      updatedAt:
        typeof contenido.updated_at === "string" ? contenido.updated_at : null
    };
  }
  if (contenido.resultado === "conflicto") {
    const existeRemoto = contenido.existe === true;
    return {
      tipo: "conflicto",
      existeRemoto,
      turno: contenido.turno,
      mes: contenido.mes,
      revision: normalizarRevisionConcurrencia(
        existeRemoto ? contenido.revision : "0"
      ),
      updatedAt:
        existeRemoto && typeof contenido.updated_at === "string"
          ? contenido.updated_at
          : null
    };
  }
  throw new Error("La restauración devolvió un resultado desconocido.");
};

export const crearRepositorioHistorialEstadoTurnoMes = (clienteSupabase) => {
  const listarHistorial = async ({
    turno,
    mes,
    accion,
    usuarioId,
    fechaDesde,
    fechaHasta,
    limite,
    cursor
  } = {}) => {
    const limiteValidado = normalizarLimite(limite);
    const turnoValidado = validarTurno(turno);
    const mesValidado = validarMes(mes);
    const accionValidada = normalizarAccion(accion);
    const usuarioValidado = validarUsuarioId(usuarioId);
    const desde = validarFecha(fechaDesde, "fechaDesde");
    const hasta = validarFecha(fechaHasta, "fechaHasta");
    if (desde && hasta && desde > hasta) {
      throw new RangeError("fechaDesde no puede ser posterior a fechaHasta.");
    }
    const cursorValidado = cursor
      ? {
          createdAt: validarFecha(cursor.createdAt, "cursor.createdAt"),
          id: validarEnteroPositivo(cursor.id, "El id del cursor")
        }
      : null;
    let consulta = clienteSupabase
      .from("historial_estado_turno_mes")
      .select(CAMPOS_LISTADO)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limiteValidado + 1);

    if (turnoValidado) consulta = consulta.eq("turno", turnoValidado);
    if (mesValidado) consulta = consulta.eq("mes", mesValidado);
    if (accionValidada) consulta = consulta.eq("accion", accionValidada);
    if (usuarioValidado) consulta = consulta.eq("usuario_id", usuarioValidado);
    if (desde) consulta = consulta.gte("created_at", desde);
    if (hasta) consulta = consulta.lte("created_at", hasta);
    if (cursorValidado) {
      consulta = consulta.or(
        `created_at.lt.${cursorValidado.createdAt},and(created_at.eq.${cursorValidado.createdAt},id.lt.${cursorValidado.id})`
      );
    }

    const { data, error } = await consulta;
    if (error) {
      if (esErrorPermiso(error)) return { tipo: "sin_permiso", items: [] };
      throw error;
    }
    const filas = Array.isArray(data) ? data : [];
    const hayMas = filas.length > limiteValidado;
    const items = filas.slice(0, limiteValidado).map((fila) => normalizarFila(fila));
    const ultima = items.at(-1);
    return {
      tipo: "ok",
      items,
      siguienteCursor:
        hayMas && ultima ? { createdAt: ultima.createdAt, id: ultima.id } : null
    };
  };

  const cargarRevisionHistorial = async (historialId) => {
    const id = validarEnteroPositivo(historialId, "El id histórico");
    const { data, error } = await clienteSupabase
      .from("historial_estado_turno_mes")
      .select(CAMPOS_DETALLE)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (esErrorPermiso(error)) return { tipo: "sin_permiso" };
      throw error;
    }
    return data
      ? { tipo: "ok", revision: normalizarFila(data, { incluirData: true }) }
      : { tipo: "no_encontrado" };
  };

  const cargarRevisionHistorialPorContexto = async ({
    turno,
    mes,
    revision
  }) => {
    const turnoValidado = validarTurno(turno);
    const mesValidado = validarMes(mes);
    const revisionValidada = normalizarRevisionConcurrencia(revision, {
      permitirCero: false
    });
    const { data, error } = await clienteSupabase
      .from("historial_estado_turno_mes")
      .select(CAMPOS_DETALLE)
      .eq("turno", turnoValidado)
      .eq("mes", mesValidado)
      .eq("revision", revisionValidada)
      .maybeSingle();
    if (error) {
      if (esErrorPermiso(error)) return { tipo: "sin_permiso" };
      throw error;
    }
    return data
      ? { tipo: "ok", revision: normalizarFila(data, { incluirData: true }) }
      : { tipo: "no_encontrado" };
  };

  const restaurarRevision = async ({ historialId, revisionEsperada }) => {
    const id = validarEnteroPositivo(historialId, "El id histórico");
    const revision = normalizarRevisionConcurrencia(revisionEsperada, {
      permitirCero: false
    });
    const { data, error } = await clienteSupabase.rpc(
      "restaurar_estado_turno_mes_desde_historial",
      {
        p_historial_id: id,
        p_revision_esperada: revision
      }
    );
    if (error) {
      if (esErrorPermiso(error)) return { tipo: "sin_permiso" };
      return {
        tipo: "error",
        mensaje: "No fue posible restaurar la revisión histórica."
      };
    }
    try {
      return interpretarRespuestaRestauracion(data);
    } catch {
      return {
        tipo: "error",
        mensaje: "La restauración devolvió una respuesta inválida."
      };
    }
  };

  return {
    listarHistorial,
    cargarRevisionHistorial,
    cargarRevisionHistorialPorContexto,
    restaurarRevision
  };
};

export const LIMITES_HISTORIAL = Object.freeze({
  predeterminado: LIMITE_PREDETERMINADO,
  maximo: LIMITE_MAXIMO
});
