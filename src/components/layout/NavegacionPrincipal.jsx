const DESTINOS_NAVEGACION = Object.freeze([
  { id: "inicio", etiqueta: "Inicio", icono: "⌂" },
  { id: "calendario", etiqueta: "Calendario", icono: "▦" },
  { id: "planilla", etiqueta: "Planilla", icono: "▤" },
  { id: "novedades", etiqueta: "Novedades", icono: "!" },
  { id: "mas", etiqueta: "Más", icono: "•••" }
]);

function NavegacionPrincipal({ vistaActiva, onCambiarVista }) {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-4px_18px_rgba(15,23,42,0.08)] backdrop-blur"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
        {DESTINOS_NAVEGACION.map((destino) => {
          const activo = vistaActiva === destino.id;
          return (
            <button
              key={destino.id}
              type="button"
              aria-current={activo ? "page" : undefined}
              onClick={() => onCambiarVista(destino.id)}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 ${
                activo
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden="true" className="text-lg leading-none">{destino.icono}</span>
              <span className="truncate">{destino.etiqueta}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default NavegacionPrincipal;
