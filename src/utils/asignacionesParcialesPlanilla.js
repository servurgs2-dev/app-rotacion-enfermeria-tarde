import {
  estaDeLicencia,
  keyDiaFromDate,
  parsearFechaLocal
} from "./fechas.js";
import { resolverPersonaDeLicencia } from "./licenciasPersonas.js";
import {
  crearReferenciaPersona,
  referenciaCorrespondeAPersona,
  resolverPersonaDesdeReferencia
} from "./referenciasPersonas.js";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const clonarAsignacion = (asignacion) => ({ ...asignacion });

export const crearMetadatosAsignacionParcial = () => ({
  id: globalThis.crypto?.randomUUID?.() || `parcial-${Date.now()}`,
  creadoEn: new Date().toISOString()
});

const sumarDias = (fecha, cantidad) => {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + cantidad);
  return resultado;
};

const limitesMes = (mesActivo) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesActivo || "")) return null;
  const [anio, mes] = mesActivo.split("-").map(Number);
  return {
    desde: new Date(anio, mes - 1, 1, 12),
    hasta: new Date(anio, mes, 0, 12)
  };
};

export const obtenerFechasPeriodoEnMes = ({ periodo, mesActivo } = {}) => {
  const limites = limitesMes(mesActivo);
  const valorDesde = periodo?.desde || periodo?.fechaInicio;
  const valorHasta = periodo?.hasta || periodo?.fechaFin;
  if (!limites || !valorDesde || !valorHasta) return [];

  const desdePeriodo = valorDesde instanceof Date
    ? new Date(valorDesde)
    : parsearFechaLocal(valorDesde);
  const hastaPeriodo = valorHasta instanceof Date
    ? new Date(valorHasta)
    : parsearFechaLocal(valorHasta);
  const desde = desdePeriodo > limites.desde ? desdePeriodo : limites.desde;
  const hasta = hastaPeriodo < limites.hasta ? hastaPeriodo : limites.hasta;
  if (desde > hasta) return [];

  const fechas = [];
  for (let actual = new Date(desde); actual <= hasta; actual = sumarDias(actual, 1)) {
    fechas.push(keyDiaFromDate(actual));
  }
  return fechas;
};

export const obtenerAsignacionesParcialesPeriodo = (planilla, periodoClave) =>
  Array.isArray(planilla?.asignacionesParciales?.[periodoClave])
    ? planilla.asignacionesParciales[periodoClave].map(clonarAsignacion)
    : [];

const obtenerLicenciasDePersonaEnMes = ({ persona, licencias, personal, mesActivo }) => {
  const limites = limitesMes(mesActivo);
  if (!limites) return [];

  return (Array.isArray(licencias) ? licencias : [])
    .filter((licencia) => resolverPersonaDeLicencia(licencia, personal)?.id === persona.id)
    .filter((licencia) => {
      const desde = parsearFechaLocal(licencia.desde);
      const hasta = parsearFechaLocal(licencia.hasta);
      return desde <= hasta && hasta >= limites.desde && desde <= limites.hasta;
    })
    .sort((a, b) => String(a.desde).localeCompare(String(b.desde)));
};

const personaEstaEnDistribucion = (persona, distribucion, personal) =>
  Object.values(esObjeto(distribucion) ? distribucion : {}).some((referencia) =>
    referenciaCorrespondeAPersona(referencia, persona, personal)
  );

export const detectarDisponiblesPorReintegro = ({
  personal = [],
  licencias = [],
  distribucionBase = {},
  asignacionesParciales = [],
  periodo,
  mesActivo,
  categoria
} = {}) => {
  const fechasPeriodo = obtenerFechasPeriodoEnMes({ periodo, mesActivo });
  if (!fechasPeriodo.length) return [];

  return personal
    .filter((persona) => persona?.categoria === categoria)
    .filter((persona) => !personaEstaEnDistribucion(persona, distribucionBase, personal))
    .flatMap((persona) => {
      const licenciasPersona = obtenerLicenciasDePersonaEnMes({
        persona,
        licencias,
        personal,
        mesActivo
      });
      if (!licenciasPersona.length) return [];

      const fechasDisponibles = fechasPeriodo.filter(
        (fecha) => {
          const fechaLocal = parsearFechaLocal(fecha);
          const existeLicenciaFinalizada = licenciasPersona.some(
            (licencia) => parsearFechaLocal(licencia.hasta) < fechaLocal
          );
          return existeLicenciaFinalizada &&
            !estaDeLicencia(licencias, persona, fechaLocal, personal);
        }
      );
      if (!fechasDisponibles.length) return [];

      const tramosDisponibles = [];
      fechasDisponibles.forEach((fecha) => {
        const ultimo = tramosDisponibles.at(-1);
        if (
          ultimo &&
          keyDiaFromDate(sumarDias(parsearFechaLocal(ultimo.hasta), 1)) === fecha
        ) {
          ultimo.hasta = fecha;
          ultimo.fechas.push(fecha);
        } else {
          tramosDisponibles.push({ desde: fecha, hasta: fecha, fechas: [fecha] });
        }
      });
      const disponibleDesde = fechasDisponibles[0];
      const licenciaPrevia = [...licenciasPersona]
        .filter((licencia) => licencia.hasta < disponibleDesde)
        .sort((a, b) => String(b.hasta).localeCompare(String(a.hasta)))[0];

      const parcialesPersona = asignacionesParciales.filter(
        (asignacion) => String(asignacion?.personaId) === String(persona.id)
      );
      const fechasAsignadas = new Set(
        parcialesPersona.flatMap((asignacion) =>
          fechasPeriodo.filter(
            (fecha) => fecha >= asignacion.desde && fecha <= asignacion.hasta
          )
        )
      );
      const fechasSinSector = fechasDisponibles.filter(
        (fecha) => !fechasAsignadas.has(fecha)
      );

      return [{
        persona,
        licenciaHasta: licenciaPrevia?.hasta || licenciasPersona[0].hasta,
        disponibleDesde,
        fechasDisponibles,
        tramosDisponibles,
        fechasSinSector,
        asignacionesParciales: parcialesPersona.map(clonarAsignacion)
      }];
    })
    .sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre, "es"));
};

const formatearFechaCorta = (fecha) => {
  const [, mes, dia] = String(fecha).split("-");
  return `${dia}/${mes}`;
};

export const validarAsignacionParcial = ({
  asignacion,
  asignacionIdEditada = "",
  periodo,
  mesActivo,
  filas = [],
  distribucionBase = {},
  asignacionesExistentes = [],
  personal = [],
  licencias = [],
  categoria
} = {}) => {
  const persona = personal.find(
    (actual) => String(actual?.id) === String(asignacion?.personaId)
  );
  if (!persona || persona.categoria !== categoria) {
    return { ok: false, mensaje: "La persona ya no existe en la categoría seleccionada." };
  }
  if (!filas.includes(asignacion?.sector)) {
    return { ok: false, mensaje: "La posición seleccionada no pertenece a esta planilla." };
  }
  if (personaEstaEnDistribucion(persona, distribucionBase, personal)) {
    return {
      ok: false,
      mensaje: "La persona ya tiene una asignación base en este período."
    };
  }

  const fechasPeriodo = obtenerFechasPeriodoEnMes({ periodo, mesActivo });
  const fechasRango = fechasPeriodo.filter(
    (fecha) => fecha >= asignacion.desde && fecha <= asignacion.hasta
  );
  if (
    !asignacion.desde ||
    !asignacion.hasta ||
    asignacion.desde > asignacion.hasta ||
    !fechasRango.length ||
    fechasRango[0] !== asignacion.desde ||
    fechasRango.at(-1) !== asignacion.hasta
  ) {
    return { ok: false, mensaje: "Las fechas deben quedar dentro del período y mes activos." };
  }

  const conflictosLicencia = fechasRango.filter((fecha) =>
    estaDeLicencia(licencias, persona, parsearFechaLocal(fecha), personal)
  );
  if (conflictosLicencia.length) {
    return {
      ok: false,
      mensaje: `La persona continúa de licencia los días ${conflictosLicencia.map(formatearFechaCorta).join(", ")}.`
    };
  }

  const referenciaBase = distribucionBase?.[asignacion.sector];
  const personaBase = resolverPersonaDesdeReferencia(referenciaBase, personal);
  const conflictosBase = personaBase
    ? fechasRango.filter(
        (fecha) =>
          !estaDeLicencia(licencias, personaBase, parsearFechaLocal(fecha), personal)
      )
    : [];
  if (conflictosBase.length) {
    return {
      ok: false,
      mensaje: `No se puede asignar del ${formatearFechaCorta(asignacion.desde)} al ${formatearFechaCorta(asignacion.hasta)}. ${asignacion.sector} ya está ocupado los días ${conflictosBase.map(formatearFechaCorta).join(", ")}.`
    };
  }

  const otras = asignacionesExistentes.filter(
    (actual) => String(actual?.id) !== String(asignacionIdEditada || asignacion?.id)
  );
  const conflictos = fechasRango.filter((fecha) =>
    otras.some((actual) => {
      if (fecha < actual.desde || fecha > actual.hasta) return false;
      return (
        String(actual.personaId) === String(persona.id) ||
        actual.sector === asignacion.sector
      );
    })
  );
  if (conflictos.length) {
    return {
      ok: false,
      mensaje: `Existe otra asignación parcial en ${conflictos.map(formatearFechaCorta).join(", ")}.`
    };
  }

  const referencia = crearReferenciaPersona(persona);
  return {
    ok: true,
    asignacion: {
      ...asignacion,
      ...referencia,
      motivo: "reintegro_licencia"
    },
    fechas: fechasRango
  };
};

export const guardarAsignacionParcial = ({
  planilla,
  periodoClave,
  asignacion
} = {}) => {
  const actual = esObjeto(planilla) ? planilla : {};
  const porPeriodo = esObjeto(actual.asignacionesParciales)
    ? actual.asignacionesParciales
    : {};
  const lista = Array.isArray(porPeriodo[periodoClave])
    ? porPeriodo[periodoClave]
    : [];
  const indice = lista.findIndex(
    (existente) => String(existente?.id) === String(asignacion?.id)
  );
  const nuevaLista = indice >= 0
    ? lista.map((existente, posicion) =>
        posicion === indice ? clonarAsignacion(asignacion) : clonarAsignacion(existente)
      )
    : [...lista.map(clonarAsignacion), clonarAsignacion(asignacion)];

  return {
    ...actual,
    asignacionesParciales: {
      ...porPeriodo,
      [periodoClave]: nuevaLista
    }
  };
};

export const eliminarAsignacionParcial = ({
  planilla,
  periodoClave,
  asignacionId
} = {}) => {
  const actual = esObjeto(planilla) ? planilla : {};
  const porPeriodo = esObjeto(actual.asignacionesParciales)
    ? actual.asignacionesParciales
    : {};
  return {
    ...actual,
    asignacionesParciales: {
      ...porPeriodo,
      [periodoClave]: (porPeriodo[periodoClave] || [])
        .filter((asignacion) => String(asignacion?.id) !== String(asignacionId))
        .map(clonarAsignacion)
    }
  };
};

export const evaluarAsignacionesParcialesDia = ({
  distribucionBase = {},
  asignacionesParciales = [],
  fecha,
  personal = [],
  esPersonaDisponible = () => true,
  estaPersonaBaseDeLicencia = () => false
} = {}) => {
  const resultado = { ...(esObjeto(distribucionBase) ? distribucionBase : {}) };
  const identidadesUsadas = new Set(
    Object.values(resultado)
      .map((referencia) => resolverPersonaDesdeReferencia(referencia, personal)?.id)
      .filter(Boolean)
      .map(String)
  );
  const sectoresUsados = new Set();
  const aplicadas = [];
  const conflictos = [];

  asignacionesParciales
    .filter((asignacion) => fecha >= asignacion.desde && fecha <= asignacion.hasta)
    .forEach((asignacion) => {
      const persona = personal.find(
        (actual) => String(actual?.id) === String(asignacion?.personaId)
      );
      const referencia = crearReferenciaPersona(persona);
      const personaBase = resolverPersonaDesdeReferencia(
        distribucionBase?.[asignacion.sector],
        personal
      );
      const referenciaBase = distribucionBase?.[asignacion.sector];
      const tieneReferenciaBase = Boolean(
        referenciaBase &&
        (
          typeof referenciaBase !== "string" ||
          referenciaBase.trim() !== ""
        )
      );
      let motivo = "";

      if (!persona || !referencia) motivo = "persona_inexistente";
      else if (!esPersonaDisponible(persona)) motivo = "persona_no_disponible";
      else if (identidadesUsadas.has(String(persona.id))) motivo = "persona_duplicada";
      else if (sectoresUsados.has(asignacion.sector)) motivo = "sector_duplicado";
      else if (tieneReferenciaBase && !personaBase) motivo = "titular_no_resuelto";
      else if (
        personaBase &&
        !estaPersonaBaseDeLicencia(personaBase, fecha)
      ) motivo = "titular_disponible";

      if (motivo) {
        conflictos.push({ asignacion: clonarAsignacion(asignacion), fecha, motivo });
        return;
      }

      resultado[asignacion.sector] = referencia;
      identidadesUsadas.add(String(persona.id));
      sectoresUsados.add(asignacion.sector);
      aplicadas.push(clonarAsignacion(asignacion));
    });

  return { distribucion: resultado, aplicadas, conflictos };
};

export const aplicarAsignacionesParcialesDia = (opciones = {}) =>
  evaluarAsignacionesParcialesDia(opciones).distribucion;

export const filtrarReintegradosSinSectorDia = ({
  reintegros = [],
  fecha,
  idsParcialesAplicadas = new Set(),
  esPersonaDisponible = () => true,
  categoria
} = {}) => reintegros
  .filter((reintegro) => reintegro.fechasDisponibles.includes(fecha))
  .map((reintegro) => reintegro.persona)
  .filter(
    (persona) =>
      persona?.categoria === categoria &&
      !idsParcialesAplicadas.has(String(persona.id)) &&
      esPersonaDisponible(persona)
  );

export const obtenerConflictosAsignacionesParcialesPeriodo = ({
  asignacionesParciales = [],
  fechas = [],
  evaluarDia
} = {}) => asignacionesParciales.flatMap((asignacion) =>
  fechas.flatMap((fecha) => {
    if (fecha < asignacion.desde || fecha > asignacion.hasta) return [];
    const resultado = evaluarDia(asignacion, fecha);
    return resultado?.ok === false
      ? [{ asignacionId: asignacion.id, fecha, motivo: resultado.motivo }]
      : [];
  })
);
