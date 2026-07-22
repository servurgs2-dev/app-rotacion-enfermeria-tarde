import { useMemo, useState } from "react";
import {
  calcularEstadisticasCierres,
  crearSerieTemporalEstadisticas,
  esRangoFechasInvalido,
  filtrarCierresPorFecha,
  obtenerCierresEstadisticos
} from "../../utils/estadisticasCierres.js";
import { TURNOS } from "../../config/turnos.js";
import { useEstadosTurnosMes } from "../../hooks/useEstadosTurnosMes.js";
import { crearComparacionTurnos } from "../../utils/comparacionTurnos.js";

const formatearMes = (valor) => {
  const [anio, mes] = String(valor || "").split("-").map(Number);
  if (!anio || !mes) return valor;
  const texto = new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(new Date(anio, mes - 1, 1, 12));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const formatearFecha = (valor) => {
  const [anio, mes, dia] = String(valor || "").split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : valor;
};
const porcentaje = (valor) => `${Number(valor || 0).toLocaleString("es-UY", { maximumFractionDigits: 1 })} %`;
const anchoPorcentaje = (valor) => `${Math.min(100, Math.max(0, Number(valor) || 0))}%`;
const anchoRelativo = (valor, maximo) => `${Math.min(100, (Number(valor || 0) / Math.max(1, maximo)) * 100)}%`;

const EtiquetaSerie = ({ item }) => <span className="font-medium text-slate-700">{formatearFecha(item.fecha)} · {item.categoria}</span>;
const TURNOS_COMPARACION = Object.values(TURNOS);

const etiquetaRango = (fechaDesde, fechaHasta) => {
  if (fechaDesde && fechaHasta) return `Desde ${formatearFecha(fechaDesde)} hasta ${formatearFecha(fechaHasta)}`;
  if (fechaDesde) return `Desde ${formatearFecha(fechaDesde)}`;
  if (fechaHasta) return `Hasta ${formatearFecha(fechaHasta)}`;
  return "Mes completo";
};

function VistaComparacion({ comparacion, mesActivo, categoria, fechaDesde, fechaHasta, cargando, error, onActualizar }) {
  const maximo = (campo) => Math.max(1, comparacion.maximos[campo] || 0);
  const sinCierres = comparacion.filas.every((fila) => !fila.tieneCierres);
  const nombreCategoria = categoria === "ambas" ? "Ambas categorías" : categoria === "enfermero" ? "Enfermeros" : "Licenciados";
  if (cargando) return <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-600">Cargando comparación de turnos…</p>;
  if (error) return <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-700"><p>{error}</p><button type="button" onClick={onActualizar} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium">Reintentar</button></div>;
  return <div className="mt-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-lg font-bold text-slate-800">Comparación entre turnos</h4><p className="text-sm text-slate-600">{formatearMes(mesActivo)} · {nombreCategoria}</p><p className="text-xs text-slate-500">{etiquetaRango(fechaDesde, fechaHasta)}</p></div><button type="button" onClick={onActualizar} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Actualizar comparación</button></div>
    {sinCierres && <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-slate-600">No hay cierres históricos para los filtros seleccionados.</p>}
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{comparacion.filas.map((fila) => <article key={fila.turnoId} className={`rounded-xl border p-4 ${fila.esTurnoActivo ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}><div className="flex flex-wrap justify-between gap-2"><h5 className="font-bold text-slate-800">{fila.turnoNombre}</h5>{fila.esTurnoActivo && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">Turno activo</span>}</div><p className="mt-1 text-xs font-medium text-slate-500">{!fila.tieneEstado ? "Sin datos para este mes" : fila.tieneCierres ? "Con cierres" : "Sin cierres para los filtros seleccionados"}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Cierres</dt><dd className="font-bold">{fila.cierres}</dd></div><div><dt className="text-slate-500">Asistencia</dt><dd className="font-bold">{porcentaje(fila.porcentajeAsistencia)}</dd></div><div><dt className="text-slate-500">Presentes</dt><dd>{fila.presentes}</dd></div><div><dt className="text-slate-500">Ausentes</dt><dd>{fila.ausentes}</dd></div><div><dt className="text-slate-500">Pendientes</dt><dd>{fila.pendientes}</dd></div><div><dt className="text-slate-500">Sin cobertura</dt><dd>{fila.sectoresSinCobertura}</dd></div><div><dt className="text-slate-500">Alertas críticas</dt><dd>{fila.alertasCriticas}</dd></div></dl></article>)}</div>
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[1350px] w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr>{["Turno", "Estado", "Cierres de categoría", "Previstos", "Presentes", "Ausentes", "Pendientes", "Asistencia", "Extras", "Sin cobertura", "Alertas críticas", "Cierres con alertas críticas", "Coberturas SM", "Cierres con cobertura SM"].map((titulo) => <th key={titulo} className="px-3 py-2">{titulo}</th>)}</tr></thead><tbody>{comparacion.filas.map((fila) => <tr key={fila.turnoId} className="border-t border-slate-100"><td className="px-3 py-2 font-medium">{fila.turnoNombre}</td><td className="px-3 py-2">{!fila.tieneEstado ? "Sin datos" : fila.tieneCierres ? "Con cierres" : "Sin cierres"}</td><td className="px-3 py-2">{fila.cierres}</td><td className="px-3 py-2">{fila.previstos}</td><td className="px-3 py-2">{fila.presentes}</td><td className="px-3 py-2">{fila.ausentes}</td><td className="px-3 py-2">{fila.pendientes}</td><td className="px-3 py-2">{porcentaje(fila.porcentajeAsistencia)}</td><td className="px-3 py-2">{fila.extras}</td><td className="px-3 py-2">{fila.sectoresSinCobertura}</td><td className="px-3 py-2">{fila.alertasCriticas}</td><td className="px-3 py-2">{fila.cierresConAlertasCriticas}</td><td className="px-3 py-2">{fila.coberturasSaludMental}</td><td className="px-3 py-2">{fila.cierresConCoberturaSaludMental}</td></tr>)}</tbody></table></div>
    <div className="mt-6 grid gap-4 md:grid-cols-2">{[["Asistencia por turno", "porcentajeAsistencia", 100, "bg-emerald-500", porcentaje], ["Ausentes por turno", "ausentes", maximo("ausentes"), "bg-red-500", String], ["Sectores sin cobertura", "sectoresSinCobertura", maximo("sectoresSinCobertura"), "bg-blue-500", String], ["Alertas críticas", "alertasCriticas", maximo("alertasCriticas"), "bg-red-600", String]].map(([titulo, campo, escala, color, formatear]) => <div key={campo} className="rounded-xl border border-slate-200 bg-white p-4"><h5 className="font-semibold text-slate-800">{titulo}</h5><div className="mt-3 space-y-3">{comparacion.filas.map((fila) => <div key={fila.turnoId}><div className="flex justify-between gap-2 text-sm"><span>{fila.turnoNombre}</span><strong>{formatear(fila[campo])}</strong></div><div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: campo === "porcentajeAsistencia" ? anchoPorcentaje(fila[campo]) : anchoRelativo(fila[campo], escala) }} /></div></div>)}</div></div>)}</div>
  </div>;
}

function Estadisticas({ calendario, estadoActivo, mesActivo, nombreTurno, turnoActivo }) {
  const [modoVista, setModoVista] = useState("actual");
  const [categoria, setCategoria] = useState("ambas");
  const [rangoLocal, setRangoLocal] = useState({ mes: "", fechaDesde: "", fechaHasta: "" });
  const fechaDesde = rangoLocal.mes === mesActivo ? rangoLocal.fechaDesde : "";
  const fechaHasta = rangoLocal.mes === mesActivo ? rangoLocal.fechaHasta : "";
  const rangoInvalido = esRangoFechasInvalido({ fechaDesde, fechaHasta });
  const comparacionRemota = useEstadosTurnosMes({
    mesActivo,
    turnoActivo,
    estadoActivo,
    habilitado: modoVista === "comparar"
  });
  const filasCategoria = useMemo(
    () => obtenerCierresEstadisticos({ calendario, categoria }),
    [calendario, categoria]
  );
  const filasFiltradas = useMemo(
    () => rangoInvalido ? [] : filtrarCierresPorFecha(filasCategoria, { fechaDesde, fechaHasta }),
    [fechaDesde, fechaHasta, filasCategoria, rangoInvalido]
  );
  const { filas, totales, porResponsable, porCuenta } = useMemo(
    () => calcularEstadisticasCierres(filasFiltradas),
    [filasFiltradas]
  );
  const serie = useMemo(() => crearSerieTemporalEstadisticas(filas), [filas]);
  const comparacion = useMemo(() => rangoInvalido
    ? { filas: [], maximos: {} }
    : crearComparacionTurnos({
      estadosPorTurno: comparacionRemota.estadosPorTurno,
      turnos: TURNOS_COMPARACION,
      turnoActivo,
      categoria,
      fechaDesde,
      fechaHasta
    }), [categoria, comparacionRemota.estadosPorTurno, fechaDesde, fechaHasta, rangoInvalido, turnoActivo]);
  const maxAusencias = Math.max(1, ...serie.flatMap((item) => [item.ausentes, item.pendientes]));
  const maxIncidencias = Math.max(1, ...serie.flatMap((item) => [item.sectoresSinCobertura, item.alertasCriticas]));
  const maxResponsables = Math.max(1, ...porResponsable.map((item) => item.cantidad));
  const tarjetas = [
    ["Cierres de categoría", totales.cierres], ["Personal previsto", totales.previstos], ["Presentes", totales.presentes],
    ["Ausentes", totales.ausentes], ["Pendientes", totales.pendientes], ["Asistencia", porcentaje(totales.porcentajeAsistencia)],
    ["Extras registrados", totales.extras], ["Sectores sin cobertura", totales.sectoresSinCobertura], ["Alertas críticas", totales.alertasCriticas],
    ["Cierres con alertas críticas", totales.cierresConAlertasCriticas], ["Coberturas de Salud Mental", totales.coberturasSaludMental],
    ["Cierres con cobertura de Salud Mental", totales.cierresConCoberturaSaludMental]
  ];
  const actualizarRango = (campo, valor) => setRangoLocal({ mes: mesActivo, fechaDesde, fechaHasta, [campo]: valor });

  return <div>
    <div className="mb-4 flex gap-2" role="group" aria-label="Vista de estadísticas">
      <button type="button" onClick={() => setModoVista("actual")} className={`rounded-lg px-4 py-2 text-sm font-medium ${modoVista === "actual" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>Turno actual</button>
      <button type="button" onClick={() => setModoVista("comparar")} className={`rounded-lg px-4 py-2 text-sm font-medium ${modoVista === "comparar" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>Comparar turnos</button>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h3 className="text-xl font-bold text-slate-800">Estadísticas históricas</h3><p className="mt-1 text-sm text-slate-600">{formatearMes(mesActivo)} · Turno {nombreTurno}</p></div>
      <label className="text-sm font-medium text-slate-700">Categoría
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
          <option value="enfermero">Enfermeros</option><option value="licenciado">Licenciados</option><option value="ambas">Ambas categorías</option>
        </select>
      </label>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="text-sm font-medium text-slate-700">Desde<input type="date" value={fechaDesde} onChange={(e) => actualizarRango("fechaDesde", e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
      <label className="text-sm font-medium text-slate-700">Hasta<input type="date" value={fechaHasta} onChange={(e) => actualizarRango("fechaHasta", e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
      <button type="button" onClick={() => setRangoLocal({ mes: mesActivo, fechaDesde: "", fechaHasta: "" })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Limpiar fechas</button>
    </div>
    {rangoInvalido ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">La fecha Desde no puede ser posterior a la fecha Hasta.</p>
      : modoVista === "comparar" ? <VistaComparacion comparacion={comparacion} mesActivo={mesActivo} categoria={categoria} fechaDesde={fechaDesde} fechaHasta={fechaHasta} cargando={comparacionRemota.cargando} error={comparacionRemota.error} onActualizar={comparacionRemota.actualizar} />
      : filas.length === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-600">{filasCategoria.length === 0 ? "No hay turnos cerrados para los filtros seleccionados." : "No hay cierres dentro del rango de fechas seleccionado."}</p> : <>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{tarjetas.map(([etiqueta, valor]) => <div key={etiqueta} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{etiqueta}</p><p className="mt-1 text-2xl font-bold text-slate-800">{valor}</p></div>)}</div>

      <section className="mt-6"><h4 className="text-lg font-bold text-slate-800">Evolución histórica</h4><p className="text-sm text-slate-500">Cada fila representa un cierre de categoría, ordenado cronológicamente.</p>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><h5 className="font-semibold text-slate-800">Asistencia por fecha</h5><p className="text-xs text-slate-500">Porcentaje de presentes sobre previstos.</p><div className="mt-3 space-y-3">{serie.map((item) => <div key={`asistencia-${item.fecha}-${item.categoria}`}><div className="flex justify-between gap-2 text-xs"><EtiquetaSerie item={item} /><strong>{porcentaje(item.porcentajeAsistencia)}</strong></div><div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: anchoPorcentaje(item.porcentajeAsistencia) }} /></div></div>)}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><h5 className="font-semibold text-slate-800">Ausentes y pendientes</h5><p className="text-xs text-slate-500">Valores absolutos por cierre.</p><div className="mt-3 space-y-4">{serie.map((item) => <div key={`ausencias-${item.fecha}-${item.categoria}`}><EtiquetaSerie item={item} /><div className="mt-1 grid gap-1 text-xs"><div className="flex items-center gap-2"><span className="w-24">Ausentes: {item.ausentes}</span><div className="h-2 flex-1 rounded bg-slate-100"><div className="h-full rounded bg-red-500" style={{ width: anchoRelativo(item.ausentes, maxAusencias) }} /></div></div><div className="flex items-center gap-2"><span className="w-24">Pendientes: {item.pendientes}</span><div className="h-2 flex-1 rounded bg-slate-100"><div className="h-full rounded bg-amber-500" style={{ width: anchoRelativo(item.pendientes, maxAusencias) }} /></div></div></div></div>)}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2"><h5 className="font-semibold text-slate-800">Sin cobertura y alertas críticas</h5><p className="text-xs text-slate-500">Incidencias registradas en cada fotografía histórica.</p><div className="mt-3 grid gap-4 md:grid-cols-2">{serie.map((item) => <div key={`incidencias-${item.fecha}-${item.categoria}`}><EtiquetaSerie item={item} /><div className="mt-1 space-y-1 text-xs"><div className="flex items-center gap-2"><span className="w-32">Sin cobertura: {item.sectoresSinCobertura}</span><div className="h-2 flex-1 rounded bg-slate-100"><div className="h-full rounded bg-blue-500" style={{ width: anchoRelativo(item.sectoresSinCobertura, maxIncidencias) }} /></div></div><div className="flex items-center gap-2"><span className="w-32">Críticas: {item.alertasCriticas}</span><div className="h-2 flex-1 rounded bg-slate-100"><div className="h-full rounded bg-red-600" style={{ width: anchoRelativo(item.alertasCriticas, maxIncidencias) }} /></div></div></div></div>)}</div></div>
        </div>
      </section>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[1250px] w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr>{["Fecha", "Categoría", "Revisión", "Cuenta de cierre", "Responsable", "Previstos", "Presentes", "Ausentes", "Pendientes", "Asistencia", "Extras", "Sin cobertura", "Alertas críticas", "Cobertura SM"].map((titulo) => <th key={titulo} className="px-3 py-2">{titulo}</th>)}</tr></thead><tbody>{filas.map((fila) => <tr key={fila.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-2">{formatearFecha(fila.fecha)}</td><td className="px-3 py-2">{fila.categoria}</td><td className="px-3 py-2">{fila.revision}</td><td className="px-3 py-2">{fila.cerradoPor}</td><td className="px-3 py-2">{fila.responsable}</td><td className="px-3 py-2">{fila.conteos.previstos}</td><td className="px-3 py-2">{fila.conteos.presentes}</td><td className="px-3 py-2">{fila.conteos.ausentes}</td><td className="px-3 py-2">{fila.conteos.pendientes}</td><td className="px-3 py-2">{porcentaje(fila.porcentajeAsistencia)}</td><td className="px-3 py-2">{fila.extras}</td><td className="px-3 py-2">{fila.sectoresSinCobertura}</td><td className="px-3 py-2">{fila.alertasCriticas}</td><td className="px-3 py-2">{fila.coberturasSaludMental || "No"}</td></tr>)}</tbody></table></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="font-semibold text-slate-800">Cierres por responsable</h4><div className="mt-3 space-y-3">{porResponsable.map((grupo) => <div key={grupo.nombre}><div className="flex justify-between gap-2 text-sm"><span>{grupo.nombre}</span><strong>{grupo.cantidad}</strong></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-full rounded bg-blue-500" style={{ width: anchoRelativo(grupo.cantidad, maxResponsables) }} /></div></div>)}</div></div><div className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="font-semibold text-slate-800">Cierres por cuenta</h4><ul className="mt-2 space-y-1 text-sm text-slate-700">{porCuenta.map((grupo) => <li key={grupo.nombre} className="flex justify-between gap-3"><span>{grupo.nombre}</span><strong>{grupo.cantidad}</strong></li>)}</ul></div></div>
    </>}
  </div>;
}

export default Estadisticas;
