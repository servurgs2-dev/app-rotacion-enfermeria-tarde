import {
  esCertificacionPorElDia,
  resolverPersonaDeCertificacion
} from "./certificacionesPersonas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import {
  crearReferenciaPersona,
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";
import {
  novedadCorrespondeTurnoEfectivo,
  novedadAfectaDisponibilidadEnFecha,
  obtenerEtiquetaTipoNovedad
} from "./novedadesPersonal.js";

export const MOTIVOS_NO_DISPONIBLE = Object.freeze({
  FALTA_CON_AVISO: "falta_con_aviso",
  CAMBIO_OTRO_TURNO: "cambio_otro_turno",
  SUPERVISION_OTRO_TURNO: "supervision_otro_turno",
  ADHESION_PARO: "adhesion_paro",
  CERTIFICACION_DIA: "certificacion_dia",
  OTRO: "otro"
});

export const OPCIONES_MOTIVO_NO_DISPONIBLE = Object.freeze([
  { valor: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO, etiqueta: "Falta con aviso" },
  {
    valor: MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO,
    etiqueta: "Supervisión solicitó otro turno"
  },
  {
    valor: MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA,
    etiqueta: "Certificación por el día"
  },
  { valor: MOTIVOS_NO_DISPONIBLE.ADHESION_PARO, etiqueta: "Adhesión a PARO" },
  { valor: MOTIVOS_NO_DISPONIBLE.OTRO, etiqueta: "Otro motivo" }
]);

const ETIQUETAS = Object.freeze({
  [MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO]: "Falta con aviso",
  [MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO]: "Cambio con otro turno",
  [MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO]: "Supervisión solicitó otro turno",
  [MOTIVOS_NO_DISPONIBLE.ADHESION_PARO]: "Adhesión a PARO",
  [MOTIVOS_NO_DISPONIBLE.OTRO]: "Otro motivo"
});

const ETIQUETAS_BREVES = Object.freeze({
  [MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO]: "Falta con aviso",
  [MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO]: "Cambio de turno",
  [MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO]: "Supervisión",
  [MOTIVOS_NO_DISPONIBLE.ADHESION_PARO]: "Adhesión a PARO",
  [MOTIVOS_NO_DISPONIBLE.OTRO]: "Otro motivo"
});

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const texto = (valor) => String(valor ?? "").trim();

export const obtenerEtiquetaTurnoDestino = (turno) => ({
  manana: "Mañana",
  tarde: "Tarde",
  vespertino: "Vespertino",
  noche: "Noche"
}[turno] || "");

export const obtenerEtiquetaMotivoNoDisponible = (registro, { breve = false } = {}) => {
  if (registro?.tipo === "certificacion") {
    return breve ? "Certificación" : "Certificación médica";
  }
  const etiquetas = breve ? ETIQUETAS_BREVES : ETIQUETAS;
  return etiquetas[registro?.motivo] || "Motivo no informado";
};

export const validarDatosNoDisponible = ({
  motivo,
  detalle,
  turnoDestino
} = {}) => {
  if (!Object.values(MOTIVOS_NO_DISPONIBLE).includes(motivo)) {
    return "Seleccioná un motivo.";
  }
  if (motivo === MOTIVOS_NO_DISPONIBLE.OTRO && !texto(detalle)) {
    return "Escribí una aclaración para Otro motivo.";
  }
  if (
    motivo === MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO &&
    !["manana", "tarde", "vespertino", "noche"].includes(turnoDestino)
  ) {
    return "Seleccioná el turno de destino.";
  }
  return "";
};

export const crearRegistroNoDisponible = ({
  persona,
  motivo,
  detalle = "",
  personaCobertura = null,
  turnoDestino = "",
  sectorOrigen = "",
  creadoEn = new Date().toISOString()
} = {}) => {
  const error = validarDatosNoDisponible({ motivo, detalle, turnoDestino });
  if (motivo === MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA) {
    return {
      registro: null,
      error: "La certificación por el día debe guardarse en Certificaciones."
    };
  }
  const referencia = crearReferenciaPersona(persona);
  if (!referencia) return { registro: null, error: "La persona seleccionada no es válida." };
  if (error) return { registro: null, error };

  const cobertura = crearReferenciaPersona(personaCobertura);
  return {
    registro: {
      ...referencia,
      motivo,
      detalle: texto(detalle),
      // El id del Extra identifica la relación incluso para cargas manuales,
      // cuyo personaId es intencionalmente nulo.
      personaCoberturaId: personaCobertura?.id || cobertura?.personaId || null,
      personaCoberturaNombre: cobertura?.nombre || "",
      turnoDestino: motivo === MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO
        ? turnoDestino
        : "",
      sectorOrigen: texto(sectorOrigen),
      creadoEn
    },
    error: ""
  };
};

export const reemplazarRegistroNoDisponible = ({
  lista,
  persona,
  registro,
  personal
}) => {
  const identidad = obtenerClaveIdentidadPersona(persona);
  let reemplazado = false;
  const resultado = (Array.isArray(lista) ? lista : []).map((actual) => {
    const personaActual = resolverPersonaDesdeReferencia(actual, personal);
    if (
      !reemplazado &&
      identidad &&
      obtenerClaveIdentidadPersona(personaActual) === identidad
    ) {
      reemplazado = true;
      return registro;
    }
    return actual;
  });
  return reemplazado ? resultado : [...resultado, registro];
};

const MOTIVOS_AUSENCIA_OPERATIVA_SIMPLE = new Set([
  MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO,
  MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO,
  MOTIVOS_NO_DISPONIBLE.ADHESION_PARO,
  MOTIVOS_NO_DISPONIBLE.OTRO
]);

export const obtenerNoDisponiblesOperativosPorTurnoEfectivo = ({
  estadosPorTurno,
  categoria,
  fecha,
  turno,
  padronVigencias,
  registrosActuales = []
} = {}) => {
  const estados = estadosPorTurno && typeof estadosPorTurno === "object"
    ? Object.entries(estadosPorTurno)
    : [];
  const fuentes = [
    [turno, Array.isArray(registrosActuales) ? registrosActuales : []],
    ...estados
      .filter(([turnoOrigenEstado]) => turnoOrigenEstado !== turno)
      .map(([turnoOrigenEstado, estado]) => [
        turnoOrigenEstado,
        estado?.calendario?.[categoria]?.noDisponibles?.[fecha]
      ])
  ];
  const porIdentidad = new Map();

  fuentes.forEach(([turnoOrigenEstado, registros]) => {
    (Array.isArray(registros) ? registros : []).forEach((registro) => {
      if (registro?.motivo === MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO) {
        if (turnoOrigenEstado !== turno) return;
      } else if (!MOTIVOS_AUSENCIA_OPERATIVA_SIMPLE.has(registro?.motivo)) {
        return;
      }

      if (registro?.motivo !== MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO) {
        const corresponde = novedadCorrespondeTurnoEfectivo({
          novedad: {
            personaId: registro?.personaId,
            personaNombre: registro?.nombre,
            fechaDesde: fecha,
            fechaHasta: fecha,
            turno: turnoOrigenEstado
          },
          turno,
          padronVigencias
        });
        if (!corresponde) return;
      }

      const clave = registro?.personaId
        ? `persona:${registro.personaId}`
        : registro?.id
          ? `registro:${registro.id}`
          : `legacy:${registro?.creadoEn || ""}:${registro?.motivo || ""}:${registro?.nombre || ""}:${registro?.personaCoberturaId || ""}`;
      if (!porIdentidad.has(clave)) porIdentidad.set(clave, { ...registro, turnoOrigenEstado });
    });
  });
  return [...porIdentidad.values()];
};

export const excluirAusenciasOperativasNoDisponiblesDeAsignaciones = ({
  asignaciones = [],
  registros = [],
  personal = []
} = {}) => (Array.isArray(asignaciones) ? asignaciones : []).map((asignacion) => {
  const ausenciaOperativa = asignacion?.enfermero && (Array.isArray(registros) ? registros : []).some(
    (registro) =>
      MOTIVOS_AUSENCIA_OPERATIVA_SIMPLE.has(registro?.motivo) &&
      referenciaCorrespondeAPersona(registro, asignacion.enfermero, personal)
  );
  return ausenciaOperativa
    ? { ...asignacion, enfermero: null, excluidoPorNoDisponible: true }
    : asignacion;
});

const certificacionVigente = (certificacion, fecha) =>
  esObjeto(certificacion) &&
  /^\d{4}-\d{2}-\d{2}$/.test(certificacion.desde || "") &&
  /^\d{4}-\d{2}-\d{2}$/.test(certificacion.hasta || "") &&
  certificacion.desde <= fecha &&
  fecha <= certificacion.hasta;

const formatearFechaCorta = (fecha) => {
  const [, mes, dia] = String(fecha || "").split("-");
  return dia && mes ? `${dia}/${mes}` : "";
};

export const obtenerNoDisponiblesDelDia = ({
  registros,
  certificaciones,
  novedades = [],
  personal,
  fecha,
  turno = "",
  categoria,
  obtenerSectorOrigen = () => ""
}) => {
  const porIdentidad = new Map();

  (Array.isArray(registros) ? registros : []).forEach((registro) => {
    const persona = resolverPersonaDesdeReferencia(registro, personal);
    const identidad = obtenerClaveIdentidadPersona(persona) ||
      `historico:${texto(registro?.nombre || registro)}`;
    if (!identidad) return;
    porIdentidad.set(identidad, {
      tipo: "manual",
      registro,
      persona,
      nombre: persona?.nombre || registro?.nombre || texto(registro),
      categoria: persona?.categoria || categoria,
      sectorOrigen: texto(registro?.sectorOrigen) || obtenerSectorOrigen(persona),
      motivo: registro?.motivo,
      motivoEtiqueta: obtenerEtiquetaMotivoNoDisponible(registro),
      motivoBreve: obtenerEtiquetaMotivoNoDisponible(registro, { breve: true }),
      detalle: texto(registro?.detalle),
      personaCoberturaNombre: texto(registro?.personaCoberturaNombre),
      turnoDestino: texto(registro?.turnoDestino)
    });
  });

  (Array.isArray(certificaciones) ? certificaciones : [])
    .filter((certificacion) => certificacionVigente(certificacion, fecha))
    .forEach((certificacion) => {
      const persona = resolverPersonaDeCertificacion(certificacion, personal);
      if (!persona || persona.categoria !== categoria) return;
      const identidad = obtenerClaveIdentidadPersona(persona);
      if (!identidad) return;
      const registro = { ...certificacion, tipo: "certificacion" };
      const certificacionRapida = esCertificacionPorElDia(certificacion);
      porIdentidad.set(identidad, {
        tipo: certificacionRapida ? "certificacion_rapida" : "certificacion",
        registro,
        persona,
        nombre: persona.nombre,
        categoria: persona.categoria,
        sectorOrigen: obtenerSectorOrigen(persona),
        motivoEtiqueta: certificacionRapida
          ? "Certificación por el día"
          : "Certificación médica",
        motivoBreve: "Certificación",
        detalle: `${formatearFechaCorta(certificacion.desde)} al ${formatearFechaCorta(certificacion.hasta)}`,
        personaCoberturaNombre: "",
        turnoDestino: ""
      });
    });

  (Array.isArray(novedades) ? novedades : []).forEach((novedad) => {
    if (turno && novedad?.turno && novedad.turno !== turno) return;
    const persona = resolverPersonaDesdeReferencia(
      { personaId: novedad?.personaId, nombre: novedad?.personaNombre },
      personal
    );
    if (!persona || persona.categoria !== categoria) return;
    if (!novedadAfectaDisponibilidadEnFecha(novedad, persona, fecha)) return;
    const identidad = obtenerClaveIdentidadPersona(persona);
    if (!identidad || porIdentidad.has(identidad)) return;
    porIdentidad.set(identidad, {
      tipo: "novedad",
      registro: novedad,
      persona,
      nombre: persona.nombre,
      categoria: persona.categoria,
      sectorOrigen: obtenerSectorOrigen(persona),
      motivoEtiqueta: obtenerEtiquetaTipoNovedad(novedad.tipo),
      motivoBreve: obtenerEtiquetaTipoNovedad(novedad.tipo),
      detalle: [
        `${formatearFechaCorta(novedad.fechaDesde)} al ${formatearFechaCorta(novedad.fechaHasta)}`,
        texto(novedad.observacion)
      ].filter(Boolean).join(" · "),
      personaCoberturaNombre: "",
      turnoDestino: ""
    });
  });

  return [...porIdentidad.values()];
};
