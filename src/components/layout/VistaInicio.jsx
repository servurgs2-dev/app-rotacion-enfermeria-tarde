const ACCESOS_RAPIDOS = Object.freeze([
  { id: "calendario", etiqueta: "Abrir Calendario", descripcion: "Distribución diaria" },
  { id: "planilla", etiqueta: "Abrir Planilla", descripcion: "Planificación mensual" },
  { id: "novedades", etiqueta: "Abrir Novedades", descripcion: "Ausencias y gestiones" }
]);

function VistaInicio({ turno, mes, onNavegar }) {
  const mesVisible = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric"
  }).format(new Date(`${mes}-01T12:00:00`));

  return (
    <section aria-labelledby="titulo-inicio" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Inicio</p>
      <h2 id="titulo-inicio" className="mt-1 text-2xl font-bold text-slate-900">Gestión de Urgencias</h2>
      <p className="mt-2 text-sm text-slate-600">
        Turno {turno} · <span className="capitalize">{mesVisible}</span>
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {ACCESOS_RAPIDOS.map((acceso) => (
          <button
            key={acceso.id}
            type="button"
            onClick={() => onNavegar(acceso.id)}
            className="min-h-20 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
          >
            <span className="block font-semibold text-slate-900">{acceso.etiqueta}</span>
            <span className="mt-1 block text-sm text-slate-600">{acceso.descripcion}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default VistaInicio;
