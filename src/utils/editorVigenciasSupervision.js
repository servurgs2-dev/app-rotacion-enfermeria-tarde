import { TURNOS } from "../config/turnos.js";
import { validarVigenciasPersonaMes } from "./vigenciasTurnoPersonal.js";

const ultimoDiaMes = (mes) => {
  const coincidencia = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(mes || ""));
  if (!coincidencia || coincidencia[1] === "0000") return null;
  const ultimo = new Date(Date.UTC(Number(coincidencia[1]), Number(coincidencia[2]), 0))
    .getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
};

export const prepararEditorVigenciasSupervision = ({
  mes,
  entrada,
  tieneDiagnostico = false
} = {}) => {
  const ultimoDia = ultimoDiaMes(mes);
  const turnoFuente = String(entrada?.turnoFuente || "").trim();
  const contextoValido = Boolean(
    ultimoDia &&
    entrada &&
    Object.hasOwn(TURNOS, turnoFuente) &&
    !entrada.invalida &&
    !tieneDiagnostico
  );
  if (!contextoValido) {
    return {
      editable: false,
      codigo: "IDENTIDAD_O_CONTEXTO_INVALIDO",
      turnoFuente,
      existeConfiguracionExplicita: Boolean(entrada?.existeConfiguracionExplicita),
      revision: String(entrada?.revision || "0"),
      rangos: []
    };
  }

  const explicita = entrada.origen === "explicita" &&
    entrada.existeConfiguracionExplicita === true;
  const vigencias = Array.isArray(entrada.vigencias) ? entrada.vigencias : [];

  return {
    editable: true,
    codigo: null,
    turnoFuente,
    existeConfiguracionExplicita: explicita,
    revision: explicita ? String(entrada.revision || "0") : "0",
    rangos: explicita
      ? vigencias.map(({ turno, desde, hasta }) => ({ turno, desde, hasta }))
      : [{ turno: turnoFuente, desde: `${mes}-01`, hasta: ultimoDia }]
  };
};

export const validarBorradorVigenciasSupervision = ({
  mes,
  personaId,
  rangos
} = {}) => {
  if (!Array.isArray(rangos) || rangos.length === 0) {
    return {
      valido: false,
      codigo: "CONFIGURACION_EXPLICITA_VACIA",
      errores: [],
      vigencias: []
    };
  }
  const vigencias = rangos.map(({ turno, desde, hasta }) => ({
    personaId,
    mes,
    turno,
    desde,
    hasta
  }));
  const validacion = validarVigenciasPersonaMes({ personaId, mes, vigencias });
  return {
    ...validacion,
    codigo: validacion.valido ? null : validacion.errores[0]?.codigo || "VIGENCIAS_INVALIDAS"
  };
};

const MENSAJES_ERROR = {
  REVISION_CONFLICTO:
    "La configuración cambió mientras la estabas editando. Recargá los datos antes de volver a guardar.",
  VIGENCIAS_REMOTAS_INVALIDAS:
    "La configuración guardada contiene datos que no se pueden interpretar con seguridad.",
  VIGENCIAS_RESULTANTES_INVALIDAS:
    "Los períodos ingresados producen una configuración inválida.",
  SOLAPAMIENTO_VIGENCIAS:
    "Los períodos no pueden superponerse.",
  MES_HISTORICO_PROTEGIDO:
    "Los meses históricos son de solo lectura.",
  PERMISO_SUPERVISION_REQUERIDO:
    "La sesión actual no tiene permiso de Supervisión para realizar este cambio.",
  VIGENCIAS_INVALIDAS:
    "Revisá los turnos, las fechas y los períodos ingresados."
};

export const obtenerCodigoErrorVigenciasSupervision = (error) => {
  const candidatos = [error?.codigo, error?.code, error?.message, error?.details]
    .map((valor) => String(valor || ""));
  return Object.keys(MENSAJES_ERROR).find((codigo) =>
    candidatos.some((valor) => valor.includes(codigo))
  ) || "ERROR_DESCONOCIDO";
};

export const obtenerMensajeErrorVigenciasSupervision = (error) =>
  MENSAJES_ERROR[obtenerCodigoErrorVigenciasSupervision(error)] ||
  "No se pudo actualizar la configuración de turnos. Intentá nuevamente.";
