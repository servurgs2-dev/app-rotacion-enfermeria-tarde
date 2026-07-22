import { useMemo, useState } from "react";
import { crearEstadisticasCierres } from "../../utils/estadisticasCierres.js";

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

function Estadisticas({ calendario, mesActivo, nombreTurno }) {
  const [categoria, setCategoria] = useState("ambas");
  const { filas, totales, porResponsable, porCuenta } = useMemo(
    () => crearEstadisticasCierres({ calendario, categoria }),
    [calendario, categoria]
  );
  const tarjetas = [
    ["Cierres de categoría", totales.cierres], ["Personal previsto", totales.previstos],
    ["Presentes", totales.presentes], ["Ausentes", totales.ausentes],
    ["Pendientes", totales.pendientes], ["Asistencia", porcentaje(totales.porcentajeAsistencia)],
    ["Extras registrados", totales.extras], ["Sectores sin cobertura", totales.sectoresSinCobertura],
    ["Alertas críticas", totales.alertasCriticas], ["Cierres con alertas críticas", totales.cierresConAlertasCriticas],
    ["Coberturas de Salud Mental", totales.coberturasSaludMental], ["Cierres con cobertura de Salud Mental", totales.cierresConCoberturaSaludMental]
  ];

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h3 className="text-xl font-bold text-slate-800">Estadísticas históricas</h3><p className="mt-1 text-sm text-slate-600">{formatearMes(mesActivo)} · Turno {nombreTurno}</p></div>
      <label className="text-sm font-medium text-slate-700">Categoría
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
          <option value="enfermero">Enfermeros</option><option value="licenciado">Licenciados</option><option value="ambas">Ambas categorías</option>
        </select>
      </label>
    </div>
    {filas.length === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-600">No hay turnos cerrados para los filtros seleccionados.</p> : <>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{tarjetas.map(([etiqueta, valor]) => <div key={etiqueta} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{etiqueta}</p><p className="mt-1 text-2xl font-bold text-slate-800">{valor}</p></div>)}</div>
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[1250px] w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr>{["Fecha", "Categoría", "Revisión", "Cuenta de cierre", "Responsable", "Previstos", "Presentes", "Ausentes", "Pendientes", "Asistencia", "Extras", "Sin cobertura", "Alertas críticas", "Cobertura SM"].map((titulo) => <th key={titulo} className="px-3 py-2">{titulo}</th>)}</tr></thead>
        <tbody>{filas.map((fila) => <tr key={fila.id} className="border-t border-slate-100">
          <td className="whitespace-nowrap px-3 py-2">{formatearFecha(fila.fecha)}</td><td className="px-3 py-2">{fila.categoria}</td><td className="px-3 py-2">{fila.revision}</td><td className="px-3 py-2">{fila.cerradoPor}</td><td className="px-3 py-2">{fila.responsable}</td>
          <td className="px-3 py-2">{fila.conteos.previstos}</td><td className="px-3 py-2">{fila.conteos.presentes}</td><td className="px-3 py-2">{fila.conteos.ausentes}</td><td className="px-3 py-2">{fila.conteos.pendientes}</td><td className="px-3 py-2">{porcentaje(fila.porcentajeAsistencia)}</td>
          <td className="px-3 py-2">{fila.extras}</td><td className="px-3 py-2">{fila.sectoresSinCobertura}</td><td className="px-3 py-2">{fila.alertasCriticas}</td><td className="px-3 py-2">{fila.coberturasSaludMental || "No"}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">{[["Cierres por responsable", porResponsable], ["Cierres por cuenta", porCuenta]].map(([titulo, grupos]) => <div key={titulo} className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="font-semibold text-slate-800">{titulo}</h4><ul className="mt-2 space-y-1 text-sm text-slate-700">{grupos.map((grupo) => <li key={grupo.nombre} className="flex justify-between gap-3"><span>{grupo.nombre}</span><strong>{grupo.cantidad}</strong></li>)}</ul></div>)}</div>
    </>}
  </div>;
}

export default Estadisticas;
