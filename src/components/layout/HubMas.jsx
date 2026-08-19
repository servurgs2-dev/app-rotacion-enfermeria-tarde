const OPCIONES_MAS = Object.freeze([
  {
    id: "personal",
    icono: "👥",
    titulo: "Personal",
    descripcion: "Gestionar funcionarios"
  },
  {
    id: "gestionMes",
    icono: "🗓️",
    titulo: "Gestión del mes",
    descripcion: "Preparar y administrar meses"
  },
  {
    id: "estadisticas",
    icono: "📈",
    titulo: "Estadísticas",
    descripcion: "Consultar datos del servicio"
  },
  {
    id: "historial",
    icono: "🕘",
    titulo: "Historial",
    descripcion: "Cambios y restauraciones",
    requiereSupervision: true
  }
]);

export function BotonVolverMas({ onVolver }) {
  return (
    <button
      type="button"
      onClick={onVolver}
      className="mb-4 inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
    >
      ← Más
    </button>
  );
}

function HubMas({ esSupervision, onAbrir }) {
  const opcionesVisibles = OPCIONES_MAS.filter(
    (opcion) => !opcion.requiereSupervision || esSupervision
  );

  return (
    <section aria-labelledby="titulo-hub-mas">
      <h2 id="titulo-hub-mas" className="text-xl font-semibold text-slate-800">
        Más
      </h2>
      <p className="mt-1 text-sm text-slate-600">Herramientas administrativas y de consulta.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {opcionesVisibles.map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            onClick={() => onAbrir(opcion.id)}
            className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
          >
            <span aria-hidden="true" className="text-xl">{opcion.icono}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-slate-900">{opcion.titulo}</span>
              <span className="mt-0.5 block text-sm text-slate-600">{opcion.descripcion}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default HubMas;
