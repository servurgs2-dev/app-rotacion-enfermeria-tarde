import { planificarListaAdhesionParo } from "../utils/novedadesPersonal.js";

export const crearSincronizadorListaParo = (repositorioNovedades) => async ({
  fecha,
  turno,
  padronVigencias,
  personasSeleccionadas,
  observacion = ""
} = {}) => {
  const existentes = await repositorioNovedades.listar({
    fechaDesde: fecha,
    fechaHasta: fecha
  });
  const plan = planificarListaAdhesionParo({
    novedades: existentes,
    personasSeleccionadas,
    fecha,
    turno,
    padronVigencias,
    observacion
  });
  const canceladas = [];
  for (const novedad of plan.cancelar) {
    canceladas.push(await repositorioNovedades.cancelar(novedad.id));
  }
  const creadas = [];
  for (const novedad of plan.crear) {
    creadas.push(await repositorioNovedades.crear(novedad));
  }
  return { creadas, canceladas };
};
