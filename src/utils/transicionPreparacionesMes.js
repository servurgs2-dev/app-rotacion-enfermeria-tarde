import { tieneContenidoSignificativo } from "./limpiezaSegura.js";
import {
  CODIGOS_PREPARACIONES_MES,
  clonarPreparacion,
  crearNuevaPreparacionDesdeFecha,
  materializarPreparacionLegacy,
  normalizarPreparacionesMes,
  validarCategoriasPreparacionBorrador
} from "./preparacionesMes.js";
import { puedeEditarTurno } from "./permisos.js";
import {
  ESTADOS_NOVEDAD_PERSONAL,
  novedadCorrespondeTurnoEfectivo
} from "./novedadesPersonal.js";

export const CODIGOS_TRANSICION_PREPARACIONES = Object.freeze({
  ESTADO_YA_VERSIONADO: "ESTADO_YA_VERSIONADO",
  ACTIVIDAD_DESDE_FECHA: "ACTIVIDAD_DESDE_FECHA",
  MES_NO_ACTUAL: "MES_NO_ACTUAL",
  SIN_PERMISO: "SIN_PERMISO",
  REVISION_INVALIDA: "REVISION_INVALIDA",
  CONFLICTO_REVISION: "CONFLICTO_REVISION",
  TRANSICION_PREPARADA: "TRANSICION_PREPARADA"
});

const CAMPOS_DIARIOS_CATEGORIA = Object.freeze([
  "cambiosDia",
  "procedenciaCambiosDia",
  "procedenciaCoberturaAutomaticaDia",
  "cambiosParoDia",
  "asistenciaDia",
  "noDisponibles",
  "extras",
  "cierresDia"
]);

const fechaEnRangoDesde = (fecha, mes, desde) =>
  /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
  fecha.startsWith(`${mes}-`) &&
  fecha >= desde;

const registrarMapaDiario = ({ mapa, campo, categoria, mes, desde, hallazgos }) => {
  Object.entries(mapa && typeof mapa === "object" ? mapa : {}).forEach(
    ([fecha, contenido]) => {
      if (fechaEnRangoDesde(fecha, mes, desde) && tieneContenidoSignificativo(contenido)) {
        hallazgos.push({ campo, categoria, fecha });
      }
    }
  );
};

const novedadActivaEnFecha = (novedad, fecha) => {
  const puntual = String(novedad?.fecha || novedad?.fechaDia || "");
  if (puntual) return puntual === fecha;
  const desde = String(novedad?.desde || novedad?.fechaDesde || "");
  const hasta = String(novedad?.hasta || novedad?.fechaHasta || desde);
  return Boolean(desde && desde <= fecha && fecha <= hasta);
};

export const analizarActividadDesdeFechaPreparacion = ({
  estado,
  mes,
  desde,
  fechaReferencia,
  novedadesExternas = [],
  turno,
  padronVigencias = null
} = {}) => {
  const hallazgos = [];
  const calendario = estado?.calendario || {};
  for (const categoria of ["enfermeros", "licenciados"]) {
    const estadoCategoria = calendario?.[categoria] || {};
    CAMPOS_DIARIOS_CATEGORIA.forEach((campo) => registrarMapaDiario({
      mapa: estadoCategoria?.[campo],
      campo,
      categoria,
      mes,
      desde,
      hallazgos
    }));
  }
  registrarMapaDiario({
    mapa: calendario?.diasParo,
    campo: "diasParo",
    categoria: null,
    mes,
    desde,
    hallazgos
  });

  if (desde === fechaReferencia) {
    (Array.isArray(novedadesExternas) ? novedadesExternas : []).forEach((novedad) => {
      if (
        novedad?.estado === ESTADOS_NOVEDAD_PERSONAL.ACTIVA &&
        novedadActivaEnFecha(novedad, desde) &&
        novedadCorrespondeTurnoEfectivo({
          novedad,
          turno,
          padronVigencias,
          fechaDesde: desde,
          fechaHasta: desde
        })
      ) {
        hallazgos.push({
          campo: "novedadExternaActiva",
          categoria: novedad?.categoria || null,
          fecha: desde,
          id: novedad?.id || null
        });
      }
    });
  }

  hallazgos.sort((a, b) =>
    `${a.fecha}|${a.categoria || ""}|${a.campo}`.localeCompare(
      `${b.fecha}|${b.categoria || ""}|${b.campo}`
    )
  );
  return {
    actividadDetectada: hallazgos.length > 0,
    codigo: hallazgos.length > 0
      ? CODIGOS_TRANSICION_PREPARACIONES.ACTIVIDAD_DESDE_FECHA
      : "SIN_ACTIVIDAD_DESDE_FECHA",
    hallazgos
  };
};

export const crearEstadoVersionadoDesdeLegacy = ({
  estado,
  mes,
  desde,
  fechaReferencia,
  actividadDetectada = false,
  metadata = {},
  categoriasNuevaPreparacion
} = {}) => {
  if (Object.hasOwn(estado || {}, "preparaciones")) {
    return {
      ok: false,
      codigo: CODIGOS_TRANSICION_PREPARACIONES.ESTADO_YA_VERSIONADO,
      estado: null,
      preparaciones: [],
      preparacionNueva: null
    };
  }

  const creadaEn = metadata.creadaEn ?? null;
  const creadaPor = metadata.creadaPor ?? null;
  const idA = metadata.idPreparacionLegacy || `preparacion-${mes}-01`;
  const idB = metadata.idPreparacionNueva || `preparacion-${desde}`;
  const materializada = materializarPreparacionLegacy({
    estado,
    mes,
    id: idA,
    creadaEn,
    creadaPor
  });
  if (!materializada.ok) {
    return {
      ok: false,
      codigo: materializada.codigo,
      estado: null,
      preparaciones: [],
      preparacionNueva: null
    };
  }
  const preparacionA = {
    ...materializada.preparaciones[0],
    origen: "materializada_desde_legacy"
  };
  const creada = crearNuevaPreparacionDesdeFecha({
    preparaciones: [preparacionA],
    mes,
    desde,
    fechaReferencia,
    actividadDetectada,
    id: idB,
    creadaEn,
    creadaPor,
    origen: "nueva_preparacion_desde_fecha"
  });
  if (!creada.ok) {
    return {
      ...creada,
      estado: null,
      preparaciones: [],
      preparacionNueva: null
    };
  }
  let preparaciones = clonarPreparacion(creada.preparaciones);
  if (categoriasNuevaPreparacion !== undefined) {
    const validacionBorrador = validarCategoriasPreparacionBorrador(
      categoriasNuevaPreparacion
    );
    if (!validacionBorrador.ok) {
      return {
        ok: false,
        codigo: validacionBorrador.codigo,
        estado: null,
        preparaciones: [],
        preparacionNueva: null
      };
    }
    preparaciones = preparaciones.map((preparacion) =>
      preparacion.id === idB
        ? { ...preparacion, categorias: clonarPreparacion(categoriasNuevaPreparacion) }
        : preparacion
    );
    const validacionFinal = normalizarPreparacionesMes({
      preparaciones,
      mes,
      exigirCoberturaCompleta: true
    });
    if (!validacionFinal.ok) {
      return {
        ...validacionFinal,
        estado: null,
        preparaciones: [],
        preparacionNueva: null
      };
    }
    preparaciones = validacionFinal.preparaciones;
  }
  const preparacionNueva = preparaciones.find((preparacion) => preparacion.id === idB);
  return {
    ok: true,
    codigo: CODIGOS_TRANSICION_PREPARACIONES.TRANSICION_PREPARADA,
    estado: {
      ...clonarPreparacion(estado),
      preparaciones
    },
    preparaciones,
    preparacionNueva: clonarPreparacion(preparacionNueva)
  };
};

export const crearEstadoVersionadoDesdeVersionado = ({
  estado,
  mes,
  desde,
  fechaReferencia,
  actividadDetectada = false,
  metadata = {},
  categoriasNuevaPreparacion
} = {}) => {
  if (!Object.hasOwn(estado || {}, "preparaciones")) {
    return { ok: false, codigo: CODIGOS_PREPARACIONES_MES.SIN_PREPARACION, estado: null, preparaciones: [], preparacionNueva: null };
  }
  const creada = crearNuevaPreparacionDesdeFecha({
    preparaciones: estado.preparaciones,
    mes,
    desde,
    fechaReferencia,
    actividadDetectada,
    id: metadata.idPreparacionNueva || `preparacion-${desde}`,
    creadaEn: metadata.creadaEn ?? null,
    creadaPor: metadata.creadaPor ?? null,
    origen: "nueva_preparacion_desde_fecha"
  });
  if (!creada.ok) return { ...creada, estado: null, preparaciones: [], preparacionNueva: null };
  let preparaciones = clonarPreparacion(creada.preparaciones);
  const idNueva = metadata.idPreparacionNueva || `preparacion-${desde}`;
  if (categoriasNuevaPreparacion !== undefined) {
    const validacionBorrador = validarCategoriasPreparacionBorrador(categoriasNuevaPreparacion);
    if (!validacionBorrador.ok) return { ...validacionBorrador, estado: null, preparaciones: [], preparacionNueva: null };
    preparaciones = preparaciones.map((preparacion) => preparacion.id === idNueva
      ? { ...preparacion, categorias: clonarPreparacion(categoriasNuevaPreparacion) }
      : preparacion);
  }
  const validacionFinal = normalizarPreparacionesMes({ preparaciones, mes, exigirCoberturaCompleta: true });
  if (!validacionFinal.ok) return { ...validacionFinal, estado: null, preparaciones: [], preparacionNueva: null };
  const preparacionNueva = validacionFinal.preparaciones.find((preparacion) => preparacion.id === idNueva);
  const indiceNueva = validacionFinal.preparaciones.findIndex((preparacion) => preparacion.id === idNueva);
  return {
    ok: true,
    codigo: CODIGOS_TRANSICION_PREPARACIONES.TRANSICION_PREPARADA,
    estado: { ...clonarPreparacion(estado), preparaciones: validacionFinal.preparaciones },
    preparaciones: validacionFinal.preparaciones,
    preparacionAnterior: clonarPreparacion(validacionFinal.preparaciones[indiceNueva - 1]),
    preparacionNueva: clonarPreparacion(preparacionNueva)
  };
};

export const prepararAplicacionTransicionPreparaciones = ({
  estado,
  mes,
  turno,
  desde,
  fechaReferencia,
  novedadesExternas = [],
  padronVigencias = null,
  metadata,
  categoriasNuevaPreparacion,
  perfil,
  revisionEsperada,
  revisionActual
} = {}) => {
  if (!puedeEditarTurno(perfil, turno)) {
    return { ok: false, codigo: CODIGOS_TRANSICION_PREPARACIONES.SIN_PERMISO };
  }
  if (String(fechaReferencia || "").slice(0, 7) !== mes) {
    return { ok: false, codigo: CODIGOS_TRANSICION_PREPARACIONES.MES_NO_ACTUAL };
  }
  const esperada = String(revisionEsperada ?? "");
  const actual = String(revisionActual ?? "");
  if (!/^\d+$/.test(esperada) || !/^\d+$/.test(actual)) {
    return { ok: false, codigo: CODIGOS_TRANSICION_PREPARACIONES.REVISION_INVALIDA };
  }
  if (esperada !== actual) {
    return { ok: false, codigo: CODIGOS_TRANSICION_PREPARACIONES.CONFLICTO_REVISION };
  }
  const actividad = analizarActividadDesdeFechaPreparacion({
    estado,
    mes,
    desde,
    fechaReferencia,
    novedadesExternas,
    turno,
    padronVigencias
  });
  if (actividad.actividadDetectada) {
    return { ok: false, codigo: actividad.codigo, actividad };
  }
  const crearEstado = Object.hasOwn(estado || {}, "preparaciones")
    ? crearEstadoVersionadoDesdeVersionado
    : crearEstadoVersionadoDesdeLegacy;
  const resultado = crearEstado({
      estado,
      mes,
      desde,
      fechaReferencia,
      actividadDetectada: false,
      metadata,
      categoriasNuevaPreparacion
    });
  return {
    ...resultado,
    preparacionAnterior: resultado.preparacionAnterior || resultado.preparaciones?.[0] || null,
    revisionEsperada: esperada,
    actividad
  };
};
