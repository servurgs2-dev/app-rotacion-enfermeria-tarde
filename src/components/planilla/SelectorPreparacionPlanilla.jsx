const fechaCorta = (fecha) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const etiquetas = { pasada: "Anterior", vigente: "Vigente", futura: "Futura" };

export default function SelectorPreparacionPlanilla({ preparaciones, seleccionadaId, fechaReferencia, onSeleccionar }) {
  return (
    <section className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <h3 className="text-sm font-semibold text-blue-950">Organización del mes</h3>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {preparaciones.map((preparacion) => {
          const estado = preparacion.hasta < fechaReferencia ? "pasada" : preparacion.desde > fechaReferencia ? "futura" : "vigente";
          const seleccionada = preparacion.id === seleccionadaId;
          return (
            <button
              key={preparacion.id}
              type="button"
              onClick={() => onSeleccionar(preparacion.id)}
              aria-pressed={seleccionada}
              className={`min-h-11 shrink-0 rounded-lg border px-3 py-2 text-left text-sm ${seleccionada ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-900"}`}
            >
              <span className="block font-medium">{fechaCorta(preparacion.desde)}–{fechaCorta(preparacion.hasta)}</span>
              <span className="block text-xs opacity-80">{etiquetas[estado]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
