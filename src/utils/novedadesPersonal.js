import { crearReferenciaPersona } from "./referenciasPersonas.js";
import {
  resolverPersonaDeCertificacion
} from "./certificacionesPersonas.js";
import { resolverPersonaDeLicencia } from "./licenciasPersonas.js";
import { horaAMinutos } from "./horarios.js";

export const TIPOS_NOVEDAD_PERSONAL = Object.freeze({
  LICENCIA: "licencia",
  CERTIFICACION: "certificacion",
  SUSPENSION: "suspension",
  ADHESION_PARO: "adhesion_paro",
  OLVIDO_TARJETA: "olvido_tarjeta",
  CAMBIO_HORARIO: "cambio_horario",
  EXCEDENTE: "excedente",
  OTRA: "otra"
});

export const ESTADOS_NOVEDAD_PERSONAL = Object.freeze({
  ACTIVA: "activa",
  PENDIENTE: "pendiente",
  REVISADA: "revisada",
  RESUELTA: "resuelta",
  CANCELADA: "cancelada"
});

export const OPCIONES_TIPO_NOVEDAD = Object.freeze([
  { valor: TIPOS_NOVEDAD_PERSONAL.LICENCIA, etiqueta: "Licencia", afectaDisponibilidad: true, estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA },
  { valor: TIPOS_NOVEDAD_PERSONAL.CERTIFICACION, etiqueta: "Certificación", afectaDisponibilidad: true, estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA },
  { valor: TIPOS_NOVEDAD_PERSONAL.SUSPENSION, etiqueta: "Suspensión", afectaDisponibilidad: true, estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA },
  { valor: TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO, etiqueta: "Adhesión a paro", afectaDisponibilidad: true, estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA },
  { valor: TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA, etiqueta: "Olvido de tarjeta", afectaDisponibilidad: false, estado: ESTADOS_NOVEDAD_PERSONAL.PENDIENTE },
  { valor: TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO, etiqueta: "Cambio excepcional de horario", afectaDisponibilidad: false, estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA },
  { valor: TIPOS_NOVEDAD_PERSONAL.EXCEDENTE, etiqueta: "Excedente", afectaDisponibilidad: false, estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA },
  { valor: TIPOS_NOVEDAD_PERSONAL.OTRA, etiqueta: "Otra", afectaDisponibilidad: false, estado: ESTADOS_NOVEDAD_PERSONAL.PENDIENTE }
]);

export const OPCIONES_ESTADO_NOVEDAD = Object.freeze([
  { valor: ESTADOS_NOVEDAD_PERSONAL.ACTIVA, etiqueta: "Activa" },
  { valor: ESTADOS_NOVEDAD_PERSONAL.PENDIENTE, etiqueta: "Pendiente" },
  { valor: ESTADOS_NOVEDAD_PERSONAL.REVISADA, etiqueta: "Revisada" },
  { valor: ESTADOS_NOVEDAD_PERSONAL.RESUELTA, etiqueta: "Resuelta" },
  { valor: ESTADOS_NOVEDAD_PERSONAL.CANCELADA, etiqueta: "Cancelada" }
]);

const TIPOS_VALIDOS = new Set(Object.values(TIPOS_NOVEDAD_PERSONAL));
const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_NOVEDAD_PERSONAL));
const TURNOS_VALIDOS = new Set(["manana", "tarde", "vespertino", "noche"]);
const CATEGORIAS_VALIDAS = new Set(["enfermero", "licenciado"]);

const texto = (valor) => String(valor ?? "").trim();
const esObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

export const validarHorarioExcepcional = ({ horaEntrada, horaSalida } = {}) => {
  try {
    horaAMinutos(horaEntrada);
    horaAMinutos(horaSalida);
  } catch {
    return "Ingresá horas de entrada y salida válidas.";
  }
  return horaEntrada === horaSalida ? "La entrada y la salida no pueden ser iguales." : "";
};

export const esFechaIsoValida = (fecha) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return false;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const valor = new Date(anio, mes - 1, dia, 12);
  return valor.getFullYear() === anio && valor.getMonth() === mes - 1 && valor.getDate() === dia;
};

export const obtenerConfiguracionTipoNovedad = (tipo) =>
  OPCIONES_TIPO_NOVEDAD.find((opcion) => opcion.valor === tipo) || null;

export const validarNovedadPersonal = ({
  personaId,
  tipo,
  fechaDesde,
  fechaHasta,
  turno,
  categoria,
  estado,
  datos
} = {}) => {
  if (!texto(personaId)) return "Seleccioná un funcionario.";
  if (!TIPOS_VALIDOS.has(tipo)) return "Seleccioná un tipo de novedad.";
  if (!esFechaIsoValida(fechaDesde)) return "Ingresá una fecha desde válida.";
  if (!esFechaIsoValida(fechaHasta)) return "Ingresá una fecha hasta válida.";
  if (fechaHasta < fechaDesde) return "La fecha hasta no puede ser anterior a la fecha desde.";
  if (turno && !TURNOS_VALIDOS.has(turno)) return "El turno no es válido.";
  if (categoria && !CATEGORIAS_VALIDAS.has(categoria)) return "La categoría no es válida.";
  if (!ESTADOS_VALIDOS.has(estado)) return "El estado no es válido.";
  if (datos !== undefined && !esObjeto(datos)) return "Los datos adicionales no son válidos.";
  return "";
};

export const crearNovedadPersonal = ({
  persona,
  tipo,
  fechaDesde,
  fechaHasta = fechaDesde,
  turno = "",
  categoria = persona?.categoria || "",
  observacion = "",
  afectaDisponibilidad,
  requiereSeguimiento = false,
  estado,
  datos = {}
} = {}) => {
  const referencia = crearReferenciaPersona(persona);
  const configuracionTipo = obtenerConfiguracionTipoNovedad(tipo);
  const esAusenciaOperativaForzada = [
    TIPOS_NOVEDAD_PERSONAL.SUSPENSION,
    TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO
  ].includes(tipo);
  const esOlvidoTarjeta = tipo === TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA;
  const esCambioHorario = tipo === TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO;
  const novedad = {
    personaId: referencia?.personaId || "",
    personaNombre: referencia?.nombre || "",
    tipo,
    fechaDesde,
    fechaHasta: fechaHasta || fechaDesde,
    turno: texto(turno) || null,
    categoria: texto(categoria) || null,
    observacion: texto(observacion),
    afectaDisponibilidad: esOlvidoTarjeta || esCambioHorario
      ? false
      : esAusenciaOperativaForzada
      ? true
      : typeof afectaDisponibilidad === "boolean"
      ? afectaDisponibilidad
      : Boolean(configuracionTipo?.afectaDisponibilidad),
    requiereSeguimiento: esOlvidoTarjeta || esCambioHorario
      ? esOlvidoTarjeta
      : esAusenciaOperativaForzada ? false : Boolean(requiereSeguimiento),
    estado: esOlvidoTarjeta || esCambioHorario
      ? esOlvidoTarjeta ? ESTADOS_NOVEDAD_PERSONAL.PENDIENTE : ESTADOS_NOVEDAD_PERSONAL.ACTIVA
      : esAusenciaOperativaForzada
      ? ESTADOS_NOVEDAD_PERSONAL.ACTIVA
      : estado || configuracionTipo?.estado || ESTADOS_NOVEDAD_PERSONAL.PENDIENTE,
    datos: esObjeto(datos) ? { ...datos } : datos
  };
  const error = validarNovedadPersonal(novedad);
  return error ? { novedad: null, error } : { novedad, error: "" };
};

export const crearCambioHorarioPersonal = ({
  persona,
  fecha,
  turno,
  horaEntrada,
  horaSalida,
  observacion = ""
} = {}) => {
  const errorHorario = validarHorarioExcepcional({ horaEntrada, horaSalida });
  if (errorHorario) return { novedad: null, error: errorHorario };
  return crearNovedadPersonal({
    persona,
    tipo: TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO,
    fechaDesde: fecha,
    fechaHasta: fecha,
    turno,
    categoria: persona?.categoria,
    observacion,
    afectaDisponibilidad: false,
    requiereSeguimiento: false,
    estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA,
    datos: { horaEntrada, horaSalida }
  });
};

export const obtenerCambioHorarioActivo = ({ novedades = [], persona, fecha, turno = "" } = {}) =>
  (Array.isArray(novedades) ? novedades : []).find((novedad) =>
    novedadCorrespondeAPersona(novedad, persona) &&
    novedad.tipo === TIPOS_NOVEDAD_PERSONAL.CAMBIO_HORARIO &&
    novedad.estado === ESTADOS_NOVEDAD_PERSONAL.ACTIVA &&
    novedad.fechaDesde === fecha &&
    novedad.fechaHasta === fecha &&
    (!turno || novedad.turno === turno) &&
    !validarHorarioExcepcional(novedad.datos)
  ) || null;

export const crearOlvidoTarjetaPersonal = ({
  persona,
  fecha,
  turno,
  observacion = ""
} = {}) => crearNovedadPersonal({
  persona,
  tipo: TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA,
  fechaDesde: fecha,
  fechaHasta: fecha,
  turno,
  categoria: persona?.categoria,
  observacion,
  afectaDisponibilidad: false,
  requiereSeguimiento: true,
  estado: ESTADOS_NOVEDAD_PERSONAL.PENDIENTE
});

const TRANSICIONES_OLVIDO_TARJETA = Object.freeze({
  [ESTADOS_NOVEDAD_PERSONAL.PENDIENTE]: new Set([
    ESTADOS_NOVEDAD_PERSONAL.REVISADA,
    ESTADOS_NOVEDAD_PERSONAL.RESUELTA,
    ESTADOS_NOVEDAD_PERSONAL.CANCELADA
  ]),
  [ESTADOS_NOVEDAD_PERSONAL.REVISADA]: new Set([
    ESTADOS_NOVEDAD_PERSONAL.RESUELTA,
    ESTADOS_NOVEDAD_PERSONAL.CANCELADA
  ]),
  [ESTADOS_NOVEDAD_PERSONAL.RESUELTA]: new Set(),
  [ESTADOS_NOVEDAD_PERSONAL.CANCELADA]: new Set()
});

export const validarTransicionEstadoNovedad = (novedad, estadoDestino) => {
  if (!novedad?.id) return "La novedad no es válida.";
  if (!ESTADOS_VALIDOS.has(estadoDestino)) return "El estado de destino no es válido.";
  if (novedad.tipo !== TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA) return "";
  return TRANSICIONES_OLVIDO_TARJETA[novedad.estado]?.has(estadoDestino)
    ? ""
    : `No se puede cambiar un Olvido de tarjeta de ${novedad.estado} a ${estadoDestino}.`;
};

export const contarOlvidosTarjetaPendientes = (novedades = [], turnoActivo = "") =>
  (Array.isArray(novedades) ? novedades : []).filter((novedad) =>
    novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.OLVIDO_TARJETA &&
    novedad?.estado === ESTADOS_NOVEDAD_PERSONAL.PENDIENTE &&
    Boolean(turnoActivo && novedad?.turno === turnoActivo)
  ).length;

export const crearAdhesionParoPersonal = ({
  persona,
  fecha,
  turno,
  observacion = ""
} = {}) => crearNovedadPersonal({
  persona,
  tipo: TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO,
  fechaDesde: fecha,
  fechaHasta: fecha,
  turno,
  categoria: persona?.categoria,
  observacion,
  afectaDisponibilidad: true,
  requiereSeguimiento: false,
  estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA
});

export const esAdhesionParoActiva = (novedad, { fecha, turno } = {}) =>
  novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO &&
  novedad?.estado === ESTADOS_NOVEDAD_PERSONAL.ACTIVA &&
  novedad?.fechaDesde === fecha &&
  novedad?.fechaHasta === fecha &&
  (!turno || novedad?.turno === turno);

export const planificarListaAdhesionParo = ({
  novedades = [],
  personasSeleccionadas = [],
  fecha,
  turno,
  observacion = ""
} = {}) => {
  const seleccionadas = new Map(
    (Array.isArray(personasSeleccionadas) ? personasSeleccionadas : [])
      .filter((persona) => texto(persona?.id))
      .map((persona) => [texto(persona.id), persona])
  );
  const activasPorPersona = new Map();
  (Array.isArray(novedades) ? novedades : [])
    .filter((novedad) => esAdhesionParoActiva(novedad, { fecha, turno }))
    .forEach((novedad) => {
      const personaId = texto(novedad.personaId);
      if (!personaId) return;
      const actuales = activasPorPersona.get(personaId) || [];
      activasPorPersona.set(personaId, [...actuales, novedad]);
    });

  const crear = [];
  const cancelar = [];
  seleccionadas.forEach((persona, personaId) => {
    const activas = activasPorPersona.get(personaId) || [];
    if (activas.length === 0) {
      const resultado = crearAdhesionParoPersonal({ persona, fecha, turno, observacion });
      if (resultado.error) throw new Error(resultado.error);
      crear.push(resultado.novedad);
    } else if (activas.length > 1) {
      cancelar.push(...activas.slice(1));
    }
    activasPorPersona.delete(personaId);
  });
  activasPorPersona.forEach((activas) => cancelar.push(...activas));

  return { crear, cancelar };
};

export const obtenerEtiquetaTipoNovedad = (tipo) =>
  obtenerConfiguracionTipoNovedad(tipo)?.etiqueta || "Novedad";

export const obtenerEtiquetaEstadoNovedad = (estado) =>
  OPCIONES_ESTADO_NOVEDAD.find((opcion) => opcion.valor === estado)?.etiqueta || estado || "";

const crearLegacy = ({ registro, persona, tipo, indice, origen }) => ({
  id: `${origen}:${registro?.personaId || persona?.id || indice}:${registro?.desde || ""}:${registro?.hasta || ""}`,
  personaId: registro?.personaId || persona?.id || "",
  personaNombre: persona?.nombre || registro?.nombre || "Persona no disponible",
  tipo,
  fechaDesde: registro?.desde || "",
  fechaHasta: registro?.hasta || registro?.desde || "",
  turno: null,
  categoria: persona?.categoria || registro?.categoria || null,
  observacion: "",
  afectaDisponibilidad: true,
  requiereSeguimiento: false,
  estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA,
  datos: {},
  origen,
  soloLectura: true
});

export const crearNovedadesLegacy = ({ licencias = [], certificaciones = [], personal = [] } = {}) => [
  ...(Array.isArray(licencias) ? licencias : []).map((registro, indice) => crearLegacy({
    registro,
    persona: resolverPersonaDeLicencia(registro, personal),
    tipo: TIPOS_NOVEDAD_PERSONAL.LICENCIA,
    indice,
    origen: "licencias_legacy"
  })),
  ...(Array.isArray(certificaciones) ? certificaciones : []).map((registro, indice) => crearLegacy({
    registro,
    persona: resolverPersonaDeCertificacion(registro, personal),
    tipo: TIPOS_NOVEDAD_PERSONAL.CERTIFICACION,
    indice,
    origen: "certificaciones_legacy"
  }))
];

export const novedadCorrespondeAPersona = (novedad, persona) =>
  Boolean(texto(novedad?.personaId) && texto(persona?.id)) &&
  texto(novedad.personaId) === texto(persona.id);

export const novedadAfectaDisponibilidadEnFecha = (novedad, persona, fecha) =>
  Boolean(
    novedadCorrespondeAPersona(novedad, persona) &&
    novedad?.afectaDisponibilidad === true &&
    novedad?.estado === ESTADOS_NOVEDAD_PERSONAL.ACTIVA &&
    esFechaIsoValida(fecha) &&
    novedad.fechaDesde <= fecha &&
    fecha <= novedad.fechaHasta
  );

export const obtenerNovedadesPersonaEnFecha = ({
  novedades = [],
  licencias = [],
  certificaciones = [],
  personal = [],
  persona,
  fecha,
  turno = ""
} = {}) => [...novedades, ...crearNovedadesLegacy({ licencias, certificaciones, personal })]
  .filter((novedad) => novedadCorrespondeAPersona(novedad, persona))
  .filter((novedad) => novedad.fechaDesde <= fecha && fecha <= novedad.fechaHasta)
  .filter((novedad) => !turno || !novedad.turno || novedad.turno === turno);

export const evaluarDisponibilidadPorNovedades = (contexto = {}) => {
  const novedades = obtenerNovedadesPersonaEnFecha(contexto);
  const bloqueantes = novedades.filter((novedad) =>
    novedadAfectaDisponibilidadEnFecha(novedad, contexto.persona, contexto.fecha)
  );
  return { disponible: bloqueantes.length === 0, novedades, bloqueantes };
};

export const excluirNoDisponiblesPorNovedadesDeAsignaciones = ({
  asignaciones = [],
  novedades = [],
  fecha,
  turno = ""
} = {}) => (Array.isArray(asignaciones) ? asignaciones : []).map((asignacion) => {
  if (!asignacion?.enfermero) return asignacion;
  const evaluacion = evaluarDisponibilidadPorNovedades({
    novedades,
    persona: asignacion.enfermero,
    fecha,
    turno
  });
  return evaluacion.disponible
    ? asignacion
    : {
        ...asignacion,
        enfermero: null,
        excluidoPorNovedad: true,
        novedadesBloqueantes: evaluacion.bloqueantes
      };
});

export const obtenerRangoMesNovedades = (mes) => {
  const [anio, numeroMes] = String(mes || "").split("-").map(Number);
  if (!anio || !numeroMes || numeroMes < 1 || numeroMes > 12) {
    return { fechaDesde: "", fechaHasta: "" };
  }
  const ultimoDia = new Date(anio, numeroMes, 0).getDate();
  return {
    fechaDesde: `${anio}-${String(numeroMes).padStart(2, "0")}-01`,
    fechaHasta: `${anio}-${String(numeroMes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`
  };
};

export const filtrarNovedadesPorTurnoActivo = (novedades = [], turnoActivo = "") =>
  (Array.isArray(novedades) ? novedades : []).filter((novedad) =>
    novedad?.soloLectura === true ||
    Boolean(turnoActivo && novedad?.turno === turnoActivo)
  );
