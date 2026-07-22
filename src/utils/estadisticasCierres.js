import { obtenerUltimaVersionCierre } from "./cierreTurno.js";

const CATEGORIAS = Object.freeze({
  enfermeros: { tipo: "enfermero", etiqueta: "Enfermeros" },
  licenciados: { tipo: "licenciado", etiqueta: "Licenciados" }
});
const numeroSeguro = (valor) => Number.isFinite(Number(valor)) ? Number(valor) : 0;
const listaSegura = (valor) => Array.isArray(valor) ? valor : [];
const esFechaIso = (valor) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(valor || ""));

export const calcularPorcentajeAsistencia = (presentes, previstos) => {
  const total = numeroSeguro(previstos);
  return total > 0 ? Math.round((numeroSeguro(presentes) / total) * 1000) / 10 : 0;
};

export const obtenerCierresEstadisticos = ({ calendario, categoria = "ambas" }) => {
  const ramas = categoria === "ambas"
    ? Object.entries(CATEGORIAS)
    : Object.entries(CATEGORIAS).filter(([, datos]) => datos.tipo === categoria);
  const filas = [];
  for (const [rama, datosCategoria] of ramas) {
    const cierresDia = calendario?.[rama]?.cierresDia;
    if (!cierresDia || typeof cierresDia !== "object" || Array.isArray(cierresDia)) continue;
    for (const [fecha, cierre] of Object.entries(cierresDia)) {
      if (cierre?.estado !== "cerrado") continue;
      const versionResuelta = obtenerUltimaVersionCierre(cierresDia, fecha);
      const version = versionResuelta && typeof versionResuelta === "object"
        ? versionResuelta
        : [...listaSegura(cierre.versiones)].reverse().find(
          (candidata) => candidata && typeof candidata === "object"
        );
      if (!version || typeof version !== "object") continue;
      const snapshot = version.snapshot && typeof version.snapshot === "object" ? version.snapshot : {};
      const conteosSnapshot = snapshot.resumen?.conteos || {};
      const alertas = listaSegura(snapshot.resumen?.alertas);
      const asignaciones = listaSegura(snapshot.asignaciones);
      const previstos = numeroSeguro(conteosSnapshot.previstos);
      const presentes = numeroSeguro(conteosSnapshot.presentes);
      const ausentes = numeroSeguro(conteosSnapshot.ausentes);
      const pendientes = numeroSeguro(conteosSnapshot.pendientes);
      const coberturasSaludMental = asignaciones.filter((item) => item?.coberturaLibreSM === true).length;
      filas.push({
        id: `${datosCategoria.tipo}:${fecha}:revision-${numeroSeguro(version.revision)}`,
        fecha,
        tipo: datosCategoria.tipo,
        categoria: datosCategoria.etiqueta,
        revision: numeroSeguro(version.revision),
        cerradoPor: String(version.cerradoPor || "").trim() || "No registrada",
        responsable: String(version.responsableCierre?.nombre || "").trim() || "No registrado",
        conteos: { previstos, presentes, ausentes, pendientes },
        porcentajeAsistencia: calcularPorcentajeAsistencia(presentes, previstos),
        extras: listaSegura(snapshot.extrasRegistrados).length,
        sectoresSinCobertura: listaSegura(snapshot.sectoresSinCobertura).length,
        alertasCriticas: alertas.filter((alerta) => alerta?.nivel === "critica").length,
        coberturasSaludMental
      });
    }
  }
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.tipo.localeCompare(b.tipo));
};

export const esRangoFechasInvalido = ({ fechaDesde = "", fechaHasta = "" } = {}) =>
  esFechaIso(fechaDesde) && esFechaIso(fechaHasta) && fechaDesde > fechaHasta;

export const filtrarCierresPorFecha = (filas, { fechaDesde = "", fechaHasta = "" } = {}) => {
  const desde = esFechaIso(fechaDesde) ? fechaDesde : "";
  const hasta = esFechaIso(fechaHasta) ? fechaHasta : "";
  if (desde && hasta && desde > hasta) return [];
  return listaSegura(filas).filter((fila) => {
    const fecha = String(fila?.fecha || "");
    return (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
  });
};

export const crearSerieTemporalEstadisticas = (filas) =>
  listaSegura(filas)
    .map((fila) => ({
      fecha: fila.fecha,
      categoria: fila.categoria,
      previstos: numeroSeguro(fila.conteos?.previstos),
      presentes: numeroSeguro(fila.conteos?.presentes),
      ausentes: numeroSeguro(fila.conteos?.ausentes),
      pendientes: numeroSeguro(fila.conteos?.pendientes),
      porcentajeAsistencia: numeroSeguro(fila.porcentajeAsistencia),
      sectoresSinCobertura: numeroSeguro(fila.sectoresSinCobertura),
      alertasCriticas: numeroSeguro(fila.alertasCriticas),
      coberturasSaludMental: numeroSeguro(fila.coberturasSaludMental)
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.categoria.localeCompare(b.categoria, "es"));

const agrupar = (filas, campo) => {
  const conteos = new Map();
  for (const fila of filas) conteos.set(fila[campo], (conteos.get(fila[campo]) || 0) + 1);
  return [...conteos.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, "es"));
};

export const agruparCierresPorResponsable = (filas) => agrupar(filas, "responsable");
export const agruparCierresPorCuenta = (filas) => agrupar(filas, "cerradoPor");

export const calcularEstadisticasCierres = (filasEntrada) => {
  const filas = listaSegura(filasEntrada);
  const totales = filas.reduce((total, fila) => ({
    cierres: total.cierres + 1,
    previstos: total.previstos + numeroSeguro(fila.conteos?.previstos),
    presentes: total.presentes + numeroSeguro(fila.conteos?.presentes),
    ausentes: total.ausentes + numeroSeguro(fila.conteos?.ausentes),
    pendientes: total.pendientes + numeroSeguro(fila.conteos?.pendientes),
    extras: total.extras + numeroSeguro(fila.extras),
    sectoresSinCobertura: total.sectoresSinCobertura + numeroSeguro(fila.sectoresSinCobertura),
    alertasCriticas: total.alertasCriticas + numeroSeguro(fila.alertasCriticas),
    cierresConAlertasCriticas: total.cierresConAlertasCriticas + (fila.alertasCriticas > 0 ? 1 : 0),
    coberturasSaludMental: total.coberturasSaludMental + numeroSeguro(fila.coberturasSaludMental),
    cierresConCoberturaSaludMental: total.cierresConCoberturaSaludMental + (fila.coberturasSaludMental > 0 ? 1 : 0)
  }), { cierres: 0, previstos: 0, presentes: 0, ausentes: 0, pendientes: 0, extras: 0, sectoresSinCobertura: 0, alertasCriticas: 0, cierresConAlertasCriticas: 0, coberturasSaludMental: 0, cierresConCoberturaSaludMental: 0 });
  return {
    filas,
    totales: { ...totales, porcentajeAsistencia: calcularPorcentajeAsistencia(totales.presentes, totales.previstos) },
    porResponsable: agruparCierresPorResponsable(filas),
    porCuenta: agruparCierresPorCuenta(filas)
  };
};

export const crearEstadisticasCierres = (opciones) => calcularEstadisticasCierres(obtenerCierresEstadisticos(opciones));
