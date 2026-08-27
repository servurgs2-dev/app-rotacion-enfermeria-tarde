import { TURNOS } from "../config/turnos.js";

const ultimoDiaMes = (mes) => {
  const coincidencia = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(mes || ""));
  if (!coincidencia || coincidencia[1] === "0000") return null;
  const ultimo = new Date(Date.UTC(Number(coincidencia[1]), Number(coincidencia[2]), 0))
    .getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
};

export const prepararEditorVigenciasTurnoPropio = ({
  mes,
  turnoPerfil,
  entrada,
  tieneDiagnostico = false
} = {}) => {
  const ultimoDia = ultimoDiaMes(mes);
  const turnoValido = Object.hasOwn(TURNOS, turnoPerfil);
  if (!ultimoDia || !turnoValido || tieneDiagnostico || entrada?.invalida) {
    return {
      editable: false,
      codigo: "IDENTIDAD_O_CONTEXTO_INVALIDO",
      existeConfiguracionExplicita: Boolean(entrada?.existeConfiguracionExplicita),
      revision: entrada?.revision || "0",
      rangos: [],
      rangosAjenos: []
    };
  }
  if (!entrada) {
    return {
      editable: false,
      codigo: "INFORMACION_NO_DISPONIBLE",
      existeConfiguracionExplicita: false,
      revision: "0",
      rangos: [],
      rangosAjenos: []
    };
  }

  const explicita = entrada.origen === "explicita" && entrada.existeConfiguracionExplicita;
  const vigencias = Array.isArray(entrada.vigencias) ? entrada.vigencias : [];
  if (!explicita && entrada.turnoFuente !== turnoPerfil) {
    return {
      editable: false,
      codigo: "CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE",
      existeConfiguracionExplicita: false,
      revision: "0",
      rangos: [],
      rangosAjenos: []
    };
  }

  return {
    editable: true,
    codigo: null,
    existeConfiguracionExplicita: explicita,
    revision: explicita ? String(entrada.revision || "0") : "0",
    rangos: explicita
      ? vigencias.filter((vigencia) => vigencia.turno === turnoPerfil)
        .map(({ desde, hasta }) => ({ desde, hasta }))
      : [{ desde: `${mes}-01`, hasta: ultimoDia }],
    rangosAjenos: explicita
      ? vigencias.filter((vigencia) => vigencia.turno !== turnoPerfil)
        .map(({ turno, desde, hasta }) => ({ turno, desde, hasta }))
      : []
  };
};

const MENSAJES_ERROR = {
  CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE:
    "Esta persona todavía usa la asignación mensual de su turno base. La configuración debe iniciarse desde ese turno o por Supervisión.",
  CONFIGURACION_EXPLICITA_VACIA_NO_PERMITIDA:
    "No se puede quitar el último período porque eso restauraría automáticamente la asignación mensual. Ese cambio debe hacerlo Supervisión.",
  PERSONA_LEGACY_NO_IDENTIFICABLE:
    "No se puede identificar a esta persona con seguridad. Requiere revisión por Supervisión.",
  PERSONA_DUPLICADA_ENTRE_TURNOS:
    "La persona aparece más de una vez en el mes. Requiere revisión antes de editar sus períodos.",
  PERMISO_LICENCIADO_REQUERIDO:
    "La sesión actual no tiene permiso para editar períodos de este turno.",
  RANGOS_PROPIOS_INVALIDOS:
    "Revisá las fechas y los períodos ingresados.",
  VIGENCIAS_RESULTANTES_INVALIDAS:
    "Los períodos entrarían en conflicto con otra vigencia del mes.",
  RANGOS_AJENOS_NO_MODIFICABLES:
    "No se pueden modificar períodos pertenecientes a otros turnos."
};

export const obtenerCodigoErrorVigenciasTurnoPropio = (error) => {
  const candidatos = [error?.codigo, error?.code, error?.message, error?.details]
    .map((valor) => String(valor || ""));
  return Object.keys(MENSAJES_ERROR).find((codigo) =>
    candidatos.some((valor) => valor.includes(codigo))
  ) || "ERROR_DESCONOCIDO";
};

export const obtenerMensajeErrorVigenciasTurnoPropio = (error) =>
  MENSAJES_ERROR[obtenerCodigoErrorVigenciasTurnoPropio(error)] ||
  "No se pudieron guardar los períodos. Intentá nuevamente.";
