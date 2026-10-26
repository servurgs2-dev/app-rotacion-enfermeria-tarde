import { obtenerEstadoAsistencia, ESTADOS_ASISTENCIA } from "./asistenciaPersonas.js";
import { esCambioOtroTurnoVinculado } from "./cambioOtroTurno.js";
import { obtenerHorarioBaseEfectivoPersonaEnFecha } from "./horarioEfectivoPersonal.js";
import { personasCompartenIdentidad } from "./identidadPersonas.js";
import {
  MOTIVOS_NO_DISPONIBLE,
  obtenerConfiguracionMotivoNoDisponible
} from "./noDisponiblesMotivos.js";
import {
  TIPOS_NOVEDAD_PERSONAL,
  novedadAfectaDisponibilidadEnFecha,
  obtenerNovedadesPersonaEnFecha
} from "./novedadesPersonal.js";
import {
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import { resolverTurnoPersonaEnFecha } from "./vigenciasTurnoPersonal.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];
const texto = (valor) => String(valor ?? "").trim();

const obtenerVigencias = (padronVigencias, personaId) => {
  if (Array.isArray(padronVigencias)) return padronVigencias;
  const entrada = padronVigencias?.porPersonaId?.[personaId] ||
    lista(padronVigencias?.personas).find((item) => texto(item?.personaId) === personaId);
  return lista(entrada?.vigencias);
};

const crearPadronVigencias = (padronVigencias, personaId, vigencias) => {
  if (padronVigencias && !Array.isArray(padronVigencias)) return padronVigencias;
  return {
    porPersonaId: {
      [personaId]: { personaId, vigencias, invalida: false }
    }
  };
};

const coincidePersona = (registro, persona, personal) => {
  if (!registro || !persona) return false;
  if (texto(registro.personaId)) return texto(registro.personaId) === texto(persona.id);
  const resuelta = resolverPersonaDesdeReferencia(registro, personal);
  return Boolean(resuelta && texto(resuelta.id) === texto(persona.id));
};

const referenciaEsPersona = (referencia, persona, personal) =>
  personasCompartenIdentidad(referencia, persona) ||
  referenciaCorrespondeAPersona(referencia, persona, personal);

const codigoNovedad = (novedad) => {
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.LICENCIA) return "licencia";
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.CERTIFICACION) return "certificacion";
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.SUSPENSION) return "suspension";
  if (novedad?.tipo === TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO) return "adhesion_paro";
  return texto(novedad?.tipo) || "novedad";
};

const claveCausa = (causa) => [
  causa.codigo,
  causa.desde || "",
  causa.hasta || ""
].join("|");

const agregarCausa = (mapa, causa) => {
  const clave = claveCausa(causa);
  const existente = mapa.get(clave);
  if (!existente) {
    mapa.set(clave, causa);
    return;
  }
  const origenes = new Set([
    ...(existente.origenes || [existente.origen]),
    ...(causa.origenes || [causa.origen])
  ].filter(Boolean));
  mapa.set(clave, { ...existente, origenes: [...origenes] });
};

export const resolverDisponibilidadPersonalPorFecha = ({
  persona,
  personal = persona ? [persona] : [],
  fecha,
  turnoConsultado,
  turnoBaseContexto,
  padronVigencias = [],
  novedadesModernas = [],
  licenciasLegacy = [],
  certificacionesLegacy = [],
  noDisponiblesDiaTurno = [],
  asistenciaDia = {},
  libresTurno = [],
  extrasDiaTurno = [],
  cambiosHorario = [],
  configTurno
} = {}) => {
  const personaId = texto(persona?.id);
  const advertencias = [];
  if (!personaId) advertencias.push({ codigo: "persona_sin_id" });

  const vigencias = obtenerVigencias(padronVigencias, personaId);
  const resolucionTurno = resolverTurnoPersonaEnFecha({ personaId, fecha, vigencias });
  if (!resolucionTurno.ok && resolucionTurno.codigo) {
    advertencias.push({ codigo: "vigencia_turno_invalida", detalle: resolucionTurno.codigo });
  }
  const turnoEfectivo = resolucionTurno.turno ||
    texto(persona?.turno || persona?.turnoBase || turnoBaseContexto) || null;
  const perteneceAlTurnoConsultado = Boolean(
    turnoEfectivo && texto(turnoConsultado) && turnoEfectivo === texto(turnoConsultado)
  );
  const padronParaNovedades = crearPadronVigencias(padronVigencias, personaId, vigencias);

  const novedades = obtenerNovedadesPersonaEnFecha({
    novedades: novedadesModernas,
    licencias: licenciasLegacy,
    certificaciones: certificacionesLegacy,
    personal,
    persona,
    fecha,
    turno: turnoEfectivo || turnoConsultado,
    padronVigencias: padronParaNovedades
  });
  const causasBloqueantes = new Map();
  const causasInformativas = [];

  novedades.forEach((novedad) => {
    const causa = {
      codigo: codigoNovedad(novedad),
      origen: novedad.origen || "novedades_personal",
      registroId: novedad.id || null,
      desde: novedad.fechaDesde || null,
      hasta: novedad.fechaHasta || null
    };
    if (novedadAfectaDisponibilidadEnFecha(novedad, persona, fecha)) {
      agregarCausa(causasBloqueantes, causa);
    } else {
      causasInformativas.push(causa);
    }
  });

  let noDisponible = false;
  lista(noDisponiblesDiaTurno).forEach((registro) => {
    if (!coincidePersona(registro, persona, personal)) {
      if (!texto(registro?.personaId) && texto(registro?.nombre)) {
        const resuelta = resolverPersonaDesdeReferencia(registro, personal);
        if (!resuelta) advertencias.push({ codigo: "referencia_legacy_no_resuelta", origen: "no_disponible" });
      }
      return;
    }
    const configuracion = obtenerConfiguracionMotivoNoDisponible(registro.motivo);
    if (!configuracion?.afectaDisponibilidad) return;
    noDisponible = true;
    const codigo = registro.motivo === MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA
      ? "certificacion"
      : registro.motivo;
    agregarCausa(causasBloqueantes, {
      codigo,
      origen: "no_disponible",
      registroId: registro.id || null,
      desde: fecha || null,
      hasta: fecha || null
    });
  });

  const estadoAsistencia = obtenerEstadoAsistencia(asistenciaDia, persona);
  const ausente = estadoAsistencia === ESTADOS_ASISTENCIA.AUSENTE;
  if (ausente) agregarCausa(causasBloqueantes, { codigo: "ausente", origen: "asistencia" });

  const libre = lista(libresTurno).some((referencia) =>
    referenciaEsPersona(referencia, persona, personal)
  );
  if (libre) agregarCausa(causasBloqueantes, { codigo: "libre", origen: "calendario" });

  const extraEnTurno = lista(extrasDiaTurno).some((extra) =>
    referenciaEsPersona(extra, persona, personal)
  );

  const cambioOtroTurnoVinculado = esCambioOtroTurnoVinculado({
    persona,
    registros: noDisponiblesDiaTurno,
    extras: extrasDiaTurno,
    personal
  });
  const causasSinCambioVinculado = [...causasBloqueantes.values()].filter(
    (causa) => causa.codigo !== MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO
  );
  const participaEnTurnoConsultado = perteneceAlTurnoConsultado || extraEnTurno;
  const disponibleEnTurno = participaEnTurnoConsultado && causasBloqueantes.size === 0;
  const disponibleParaCobertura = participaEnTurnoConsultado && (
    disponibleEnTurno || (cambioOtroTurnoVinculado && causasSinCambioVinculado.length === 0)
  );

  const novedadesHorario = [...lista(novedadesModernas), ...lista(cambiosHorario)];
  const horario = turnoEfectivo
    ? obtenerHorarioBaseEfectivoPersonaEnFecha({
        persona,
        fecha,
        turno: turnoEfectivo,
        novedades: novedadesHorario,
        ...(configTurno ? { configTurno } : {})
      })
    : null;
  const horarioEfectivo = horario
    ? {
        horaEntrada: horario.entrada,
        horaSalida: horario.salida,
        origen: horario.esExcepcional ? "cambio_horario" : "horario_base",
        registroId: horario.novedadId || null
      }
    : null;

  return {
    personaId: personaId || null,
    turnoEfectivo,
    horarioEfectivo,
    perteneceAlTurnoConsultado,
    disponibleEnTurno,
    disponibleParaCobertura,
    causasBloqueantes: [...causasBloqueantes.values()],
    causasInformativas,
    contextoOperativo: {
      libre,
      ausente,
      noDisponible,
      extraEnTurno,
      cambioOtroTurnoVinculado
    },
    advertencias
  };
};
