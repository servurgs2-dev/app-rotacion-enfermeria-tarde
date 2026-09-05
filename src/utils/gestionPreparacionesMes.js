import { analizarOrganizacionLegacy, normalizarPreparacionesMes } from "./preparacionesMes.js";
import { puedeEditarTurno } from "./permisos.js";
import { validarBorradoresConfiguracionPlanilla } from "./plantillasConfiguracionPlanilla.js";
import { clonarPreparacion } from "./preparacionesMes.js";
import { validarAsignacionesFijasMensuales } from "./asignacionesFijasMensuales.js";
import { validarPrioridadCoberturaMensual } from "./prioridadCoberturaMensual.js";
import { obtenerPosicionTurnanteMensual } from "./turnanteMensual.js";
import { reconciliarPlanillaConConfiguracion } from "./edicionPreparacionVersionada.js";

export const analizarDisponibilidadNuevaPreparacion = ({
  estado,
  mes,
  mesActual,
  turno,
  perfil,
  modoSoloLectura = false,
  cargando = false,
  conflicto = false,
  guardadosPendientes = false,
  bloqueadoTrasRestauracion = false
} = {}) => {
  const esVersionado = Object.hasOwn(estado || {}, "preparaciones");
  const organizacion = esVersionado
    ? normalizarPreparacionesMes({ preparaciones: estado.preparaciones, mes, exigirCoberturaCompleta: true })
    : analizarOrganizacionLegacy(estado);
  const razones = [];
  if (mes !== mesActual) razones.push("MES_NO_ACTUAL");
  if (esVersionado ? !organizacion.ok : !organizacion.materializable) razones.push(organizacion.codigo);
  if (!puedeEditarTurno(perfil, turno) || modoSoloLectura) razones.push("SIN_PERMISO");
  if (cargando) razones.push("CARGANDO");
  if (conflicto) razones.push("CONFLICTO");
  if (guardadosPendientes) razones.push("GUARDADOS_PENDIENTES");
  if (bloqueadoTrasRestauracion) razones.push("BLOQUEO_RESTAURACION");
  return {
    visible: razones.length === 0,
    codigo: razones[0] || (esVersionado ? "NUEVA_VIGENCIA_DISPONIBLE" : "NUEVA_PREPARACION_DISPONIBLE"),
    razones,
    organizacion,
    origen: esVersionado ? "versionado" : "legacy"
  };
};

const ETIQUETAS_ACTIVIDAD = Object.freeze({
  cierresDia: "cierre",
  cambiosDia: "cambio diario",
  procedenciaCambiosDia: "cambio diario",
  procedenciaCoberturaAutomaticaDia: "cobertura",
  cambiosParoDia: "cambio por paro",
  asistenciaDia: "asistencia",
  noDisponibles: "No disponible",
  extras: "Extra",
  diasParo: "día de paro",
  novedadExternaActiva: "novedad activa"
});

export const describirPrimerHallazgoPreparacion = (actividad) => {
  const primero = actividad?.hallazgos?.[0];
  if (!primero) return "";
  const etiqueta = ETIQUETAS_ACTIVIDAD[primero.campo] || "actividad operativa";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(primero.fecha || "")
    ? `${primero.fecha.slice(8, 10)}/${primero.fecha.slice(5, 7)}`
    : "";
  return fecha ? `${etiqueta} · ${fecha}` : etiqueta;
};

export const validarCategoriasBorradorNuevaPreparacion = ({
  categorias,
  personal = [],
  turno,
  mes
} = {}) => {
  if (!categorias?.enfermero?.planilla || !categorias?.licenciado?.planilla) {
    return { ok: false, mensaje: "La nueva organización debe incluir ambas categorías." };
  }
  const borradores = Object.fromEntries(["enfermero", "licenciado"].map((categoria) => [
    categoria,
    {
      ...clonarPreparacion(categorias[categoria].configuracion),
      turnoId: turno,
      categoria,
      mesOrigen: mes
    }
  ]));
  const validacion = validarBorradoresConfiguracionPlanilla({
    borradores,
    turno,
    mesOrigen: mes
  });
  if (!validacion.ok) return validacion;
  for (const categoria of ["enfermero", "licenciado"]) {
    const planilla = categorias[categoria].planilla;
    const configuracion = validacion.borradores[categoria];
    const posicionTurnante = obtenerPosicionTurnanteMensual(categoria, configuracion);
    const turnanteConfigurado = Boolean(posicionTurnante) && configuracion.filas.some((fila) =>
      fila.tipo === "turnante" && fila.etiqueta === posicionTurnante && fila.activo === true
    );
    const turnanteEnPlanilla = Boolean(posicionTurnante) &&
      (planilla.posicionesMensualesAdicionales || []).includes(posicionTurnante);
    if (turnanteConfigurado !== turnanteEnPlanilla) {
      return {
        ok: false,
        codigo: "TURNANTE_B_INCOHERENTE",
        mensaje: "La estructura de Turnantes no coincide con la Planilla de la nueva preparación."
      };
    }
    const fijas = validarAsignacionesFijasMensuales({
      asignaciones: configuracion.asignacionesFijas,
      personal,
      categoria,
      filas: configuracion.filas
    });
    if (!fijas.valido) {
      return {
        ok: false,
        codigo: "ASIGNACIONES_FIJAS_B_INVALIDAS",
        mensaje: "Revisá las asignaciones fijas de la nueva preparación."
      };
    }
    const prioridad = validarPrioridadCoberturaMensual({
      filas: configuracion.filas,
      prioridadConfigurada: configuracion.prioridadCoberturaSectorIds,
      versionEstructura: configuracion,
      categoria
    });
    if (!prioridad.valido) {
      return {
        ok: false,
        codigo: "PRIORIDAD_B_INVALIDA",
        mensaje: "Revisá la prioridad de cobertura de la nueva preparación."
      };
    }
  }
  return {
    ok: true,
    categorias: Object.fromEntries(["enfermero", "licenciado"].map((categoria) => {
      const original = categorias[categoria].configuracion;
      const validada = validacion.borradores[categoria];
      return [categoria, {
        planilla: reconciliarPlanillaConConfiguracion({
          planilla: categorias[categoria].planilla,
          configuracion: validada
        }),
        configuracion: {
          ...clonarPreparacion(original),
          filas: validada.filas,
          asignacionesFijas: validada.asignacionesFijas,
          prioridadCoberturaSectorIds: validada.prioridadCoberturaSectorIds,
          ...(Object.hasOwn(validada, "estructuraLicenciadosVersion")
            ? { estructuraLicenciadosVersion: validada.estructuraLicenciadosVersion }
            : {})
        }
      }];
    }))
  };
};
