import { useMemo, useState } from "react";
import {
  obtenerClaveRenderNovedad,
  obtenerEtiquetaTipoNovedad,
  obtenerRangoMesNovedades
} from "../../utils/novedadesPersonal.js";
import {
  construirReporteNovedades,
  obtenerDetalleReporteNovedad,
  presentarEstadoReporteNovedad,
  TIPOS_REPORTE_NOVEDADES
} from "../../utils/reporteNovedades.js";
import { exportarReporteNovedadesPDF } from "../../utils/exportReporteNovedadesPDF.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";

const TURNOS = {
  manana: "Mañana",
  tarde: "Tarde",
  vespertino: "Vespertino",
  noche: "Noche"
};

const CATEGORIAS = {
  enfermero: "Enfermero",
  licenciado: "Licenciado"
};

const IMPACTOS = {
  ausencia: "Sólo ausencias",
  administrativa: "Sólo administrativas"
};

const fechaCorta = (fecha) => {
  const [anio, mes, dia] = String(fecha || "").split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : "Sin fecha";
};

function ReporteNovedades({ novedades = [], personal = [], turnoActivo = "", mesActivo = "" }) {
  const limitesMes = useMemo(() => obtenerRangoMesNovedades(mesActivo), [mesActivo]);
  const [filtros, setFiltros] = useState({
    desde: limitesMes.fechaDesde,
    hasta: limitesMes.fechaHasta,
    categoria: "",
    personaId: "",
    tipo: "",
    impacto: ""
  });
  const reporte = useMemo(() => construirReporteNovedades({
    novedades,
    turnoActivo,
    ...filtros
  }), [filtros, novedades, turnoActivo]);
  const turnoEtiqueta = TURNOS[turnoActivo] || turnoActivo;
  const personaSeleccionada = personal.find((persona) => String(persona.id) === String(filtros.personaId));

  const cambiarFiltro = (campo, valor) => setFiltros((actuales) => ({ ...actuales, [campo]: valor }));
  const exportar = () => exportarReporteNovedadesPDF({
    reporte,
    mesActivo,
    turnoEtiqueta,
    filtros,
    personaEtiqueta: personaSeleccionada ? obtenerEtiquetaPersona(personaSeleccionada, personal) : "Todos",
    categoriaEtiqueta: CATEGORIAS[filtros.categoria] || "Todas",
    tipoEtiqueta: filtros.tipo ? obtenerEtiquetaTipoNovedad(filtros.tipo) : "Todos",
    impactoEtiqueta: IMPACTOS[filtros.impacto] || "Todas"
  });

  return (
    <section className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Reporte de Novedades / Ausencias</h3>
          <p className="text-sm text-slate-600">Mes {mesActivo} · Turno {turnoEtiqueta}</p>
        </div>
        <button type="button" onClick={exportar} disabled={!reporte.registros.length || !reporte.rangoValido} className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
          Exportar PDF
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Desde
          <input type="date" value={filtros.desde} min={limitesMes.fechaDesde} max={limitesMes.fechaHasta} onChange={(e) => cambiarFiltro("desde", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Hasta
          <input type="date" value={filtros.hasta} min={limitesMes.fechaDesde} max={limitesMes.fechaHasta} onChange={(e) => cambiarFiltro("hasta", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Categoría
          <select value={filtros.categoria} onChange={(e) => cambiarFiltro("categoria", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
            <option value="">Todas</option>
            <option value="enfermero">Enfermeros</option>
            <option value="licenciado">Licenciados</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Funcionario
          <select value={filtros.personaId} onChange={(e) => cambiarFiltro("personaId", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
            <option value="">Todos</option>
            {personal.map((persona) => <option key={persona.id} value={persona.id}>{obtenerEtiquetaPersona(persona, personal)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Tipo
          <select value={filtros.tipo} onChange={(e) => cambiarFiltro("tipo", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
            <option value="">Todos</option>
            {TIPOS_REPORTE_NOVEDADES.map((tipo) => <option key={tipo} value={tipo}>{obtenerEtiquetaTipoNovedad(tipo)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Impacto
          <select value={filtros.impacto} onChange={(e) => cambiarFiltro("impacto", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
            <option value="">Todas</option>
            <option value="ausencia">Sólo ausencias</option>
            <option value="administrativa">Sólo administrativas</option>
          </select>
        </label>
      </div>

      {!reporte.rangoValido && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">El rango seleccionado no es válido.</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Total de registros", reporte.resumen.total],
          ["Ausencias", reporte.resumen.ausencias],
          ["Administrativas", reporte.resumen.administrativas],
          ["Jornadas/persona afectadas", reporte.resumen.jornadasAfectadas]
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{etiqueta}</p>
            <p className="text-xl font-semibold text-slate-900">{valor}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {TIPOS_REPORTE_NOVEDADES.filter((tipo) => reporte.resumen.desglose[tipo] > 0).map((tipo) => (
          <span key={tipo} className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {obtenerEtiquetaTipoNovedad(tipo)}: {reporte.resumen.desglose[tipo]}
          </span>
        ))}
      </div>

      {!reporte.registros.length ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No hay registros para los filtros seleccionados.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reporte.registros.map((novedad) => {
            const detalle = obtenerDetalleReporteNovedad(novedad);
            const estado = presentarEstadoReporteNovedad(novedad);
            return (
              <article key={obtenerClaveRenderNovedad(novedad)} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{novedad.personaNombre}</p>
                    <p className="text-sm font-medium text-indigo-700">{obtenerEtiquetaTipoNovedad(novedad.tipo)}</p>
                  </div>
                  {estado && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{estado}</span>}
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {fechaCorta(novedad.fechaDesde)}{novedad.fechaHasta !== novedad.fechaDesde ? ` – ${fechaCorta(novedad.fechaHasta)}` : ""}
                </p>
                <p className="text-xs text-slate-500">{CATEGORIAS[novedad.categoria] || "Sin categoría"}</p>
                {detalle && <p className="mt-2 text-sm text-slate-600">{detalle}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ReporteNovedades;
