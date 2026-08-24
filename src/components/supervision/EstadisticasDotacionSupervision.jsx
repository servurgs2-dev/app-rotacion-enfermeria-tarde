import { useState } from "react";

const formatearFechaBreve = (fecha) => {
  const partes = String(fecha || "").split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : String(fecha || "");
};

const formatearFechas = (fechas, limite = 3) => {
  const valores = Array.isArray(fechas) ? fechas : [];
  const visibles = valores.slice(0, limite).map(formatearFechaBreve);
  const restantes = valores.length - visibles.length;
  return `${visibles.join(" \u00b7 ")}${restantes > 0 ? ` \u00b7 +${restantes}` : ""}`;
};

const formatearDecimal = (valor) => Number.isFinite(valor)
  ? new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(valor)
  : "\u2014";

function IndicadorEstado({ etiqueta, valor, clases }) {
  return (
    <div className={`min-w-0 rounded-xl border px-2 py-3 text-center ${clases}`}>
      <span className="block break-words text-xs font-bold">{etiqueta}</span>
      <strong className="mt-1 block text-xl tabular-nums">{valor}</strong>
    </div>
  );
}

function EstadisticasDotacionSupervision({ estadisticas, turnoSeleccionado, categorias }) {
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(() => categorias[0][0]);
  const resumen = estadisticas?.turnos?.[turnoSeleccionado]?.[categoriaSeleccionada];

  return (
    <section aria-label="Resumen estad&iacute;stico mensual" className="mt-4 min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <h3 className="text-base font-extrabold text-slate-900">Resumen del mes</h3>

      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Categor&iacute;a del resumen mensual">
        {categorias.map(([categoria, etiqueta]) => {
          const activa = categoria === categoriaSeleccionada;
          return (
            <button
              key={categoria}
              type="button"
              aria-pressed={activa}
              onClick={() => setCategoriaSeleccionada(categoria)}
              className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 ${activa ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {etiqueta}
            </button>
          );
        })}
      </div>

      {!resumen || resumen.diasConDatos === 0 ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-4 text-sm text-slate-600">
          Sin datos suficientes para generar estad&iacute;sticas de esta categor&iacute;a en el mes.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <span className="text-xs font-bold text-slate-600">D&iacute;as con datos</span>
            <strong className="block text-2xl text-slate-900 tabular-nums">{resumen.diasConDatos} / {resumen.diasTotales}</strong>
            {resumen.diasSinDatos > 0 && (
              <span className="mt-1 block text-xs text-slate-500">{resumen.diasSinDatos} d&iacute;as sin datos</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <IndicadorEstado etiqueta={"Cr\u00edticos"} valor={resumen.estados.criticos} clases="border-red-200 bg-red-50 text-red-900" />
            <IndicadorEstado etiqueta={"Bajo \u00f3ptimo"} valor={resumen.estados.bajoOptimo} clases="border-amber-200 bg-amber-50 text-amber-950" />
            <IndicadorEstado etiqueta={"\u00d3ptimos"} valor={resumen.estados.optimos} clases="border-emerald-200 bg-emerald-50 text-emerald-950" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
              <span className="block text-xs font-bold text-slate-600">Peor dotaci&oacute;n</span>
              <strong className="mt-1 block text-xl text-slate-900 tabular-nums">{resumen.minimoOperativo}</strong>
              <span className="mt-1 block break-words text-xs text-slate-500">{formatearFechas(resumen.fechasMinimoOperativo)}</span>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
              <span className="block text-xs font-bold text-slate-600">Promedio operativo</span>
              <strong className="mt-1 block text-xl text-slate-900 tabular-nums">{formatearDecimal(resumen.promedioOperativo)}</strong>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
              <span className="block text-xs font-bold text-slate-600">D&eacute;ficit m&aacute;ximo</span>
              <strong className="mt-1 block text-xl text-slate-900 tabular-nums">{resumen.deficitMaximo}</strong>
              {resumen.deficitMaximo > 0 && (
                <span className="mt-1 block break-words text-xs text-slate-500">{formatearFechas(resumen.fechasDeficitMaximo)}</span>
              )}
            </div>
          </div>

          <p className="break-words text-xs text-slate-600">
            {resumen.combinacionesConAdvertencias > 0
              ? `${resumen.combinacionesConAdvertencias} ${resumen.combinacionesConAdvertencias === 1 ? "d\u00eda con advertencias" : "d\u00edas con advertencias"}`
              : "Sin advertencias atribuidas"}
          </p>
        </div>
      )}

      <p className="mt-3 break-words text-xs text-slate-500">Calculado con los datos y umbrales actuales.</p>
    </section>
  );
}

export default EstadisticasDotacionSupervision;
