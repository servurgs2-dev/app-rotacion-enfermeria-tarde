import { crearReferenciaPersona } from "./referenciasPersonas.js";
import {
  resolverPersonaDeCertificacion
} from "./certificacionesPersonas.js";
import { resolverPersonaDeLicencia } from "./licenciasPersonas.js";

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
  const esSuspension = tipo === TIPOS_NOVEDAD_PERSONAL.SUSPENSION;
  const novedad = {
    personaId: referencia?.personaId || "",
    personaNombre: referencia?.nombre || "",
    tipo,
    fechaDesde,
    fechaHasta: fechaHasta || fechaDesde,
    turno: texto(turno) || null,
    categoria: texto(categoria) || null,
    observacion: texto(observacion),
    afectaDisponibilidad: esSuspension
      ? true
      : typeof afectaDisponibilidad === "boolean"
      ? afectaDisponibilidad
      : Boolean(configuracionTipo?.afectaDisponibilidad),
    requiereSeguimiento: esSuspension ? false : Boolean(requiereSeguimiento),
    estado: esSuspension
      ? ESTADOS_NOVEDAD_PERSONAL.ACTIVA
      : estado || configuracionTipo?.estado || ESTADOS_NOVEDAD_PERSONAL.PENDIENTE,
    datos: esObjeto(datos) ? { ...datos } : datos
  };
  const error = validarNovedadPersonal(novedad);
  return error ? { novedad: null, error } : { novedad, error: "" };
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
