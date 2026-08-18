import {
  desplazarFechaDentroMes,
  fechaPerteneceAlMes,
  obtenerLimitesFechaMes
} from "../../utils/navegacionFechaResumen.js";

const ACCESOS_RAPIDOS = Object.freeze([
  { id: "calendario", etiqueta: "Calendario", descripcion: "Ver distribución del día" },
  { id: "planilla", etiqueta: "Planilla", descripcion: "Ver planificación mensual" },
  { id: "novedades", etiqueta: "Novedades", descripcion: "Gestionar ausencias y novedades" }
]);

const TIPOS_NOVEDAD_DIA = Object.freeze([
  ["licencia", "Licencias"],
  ["certificacion", "Certificaciones"],
  ["suspension", "Suspensiones"],
  ["adhesion_paro", "Adhesiones a paro"],
  ["olvido_tarjeta", "Olvidos de tarjeta"],
  ["cambio_horario", "Cambios de horario"]
]);

const formatearFecha = (fecha) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""))) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(`${fecha}T12:00:00`));
};

function Metrica({ etiqueta, valor, destacada = false }) {
  return (
    <div className={`rounded-xl border p-3 ${destacada ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <strong className="block text-2xl font-bold text-slate-900">{valor}</strong>
      <span className="mt-0.5 block text-xs font-medium text-slate-600">{etiqueta}</span>
    </div>
  );
}

function ResumenCategoria({ titulo, datos }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-bold text-slate-900">{titulo}</h3>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metrica etiqueta="Previstos" valor={datos.previstos} />
        <Metrica etiqueta="Ausentes" valor={datos.ausentes} destacada={datos.ausentes > 0} />
        <Metrica etiqueta="Libres" valor={datos.libres} />
        <Metrica etiqueta="Extras" valor={datos.extras} />
        <Metrica etiqueta="Sin asignar" valor={datos.sinAsignar} />
      </div>
    </article>
  );
}

function VistaInicio({
  turno,
  mes,
  fecha,
  modoHistorico = false,
  resumen,
  onCambiarFecha,
  onNavegar
}) {
  const mesVisible = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric"
  }).format(new Date(`${mes}-01T12:00:00`));
  const general = resumen?.general || {};
  const enfermeros = resumen?.porCategoria?.enfermero || {};
  const licenciados = resumen?.porCategoria?.licenciado || {};
  const sectoresCriticos = resumen?.sectoresCriticos || [];
  const novedadesDia = resumen?.novedadesDia || {};
  const sinAsignar = [
    ...(enfermeros.personasSinAsignar || []),
    ...(licenciados.personasSinAsignar || [])
  ];
  const { minima: fechaMinima, maxima: fechaMaxima } = obtenerLimitesFechaMes(mes);
  const cambiarDia = (dias) => {
    const nuevaFecha = desplazarFechaDentroMes({ fecha, mes, dias });
    if (nuevaFecha !== fecha) onCambiarFecha(nuevaFecha);
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="titulo-inicio" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Inicio</p>
            <h2 id="titulo-inicio" className="mt-1 text-2xl font-bold text-slate-900">Resumen del turno</h2>
          </div>
          {modoHistorico && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Modo histórico</span>
          )}
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold capitalize text-slate-800">{formatearFecha(fecha)}</p>
          <div className="mt-2 grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2" aria-label="Fecha del resumen">
            <button
              type="button"
              aria-label="Día anterior"
              disabled={fecha === fechaMinima}
              onClick={() => cambiarDia(-1)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white text-xl font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹
            </button>
            <input
              type="date"
              aria-label="Seleccionar fecha del resumen"
              value={fecha}
              min={fechaMinima}
              max={fechaMaxima}
              onChange={(evento) => {
                if (fechaPerteneceAlMes(evento.target.value, mes)) {
                  onCambiarFecha(evento.target.value);
                }
              }}
              className="min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800"
            />
            <button
              type="button"
              aria-label="Día siguiente"
              disabled={fecha === fechaMaxima}
              onClick={() => cambiarDia(1)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white text-xl font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Turno {turno} · <span className="capitalize">{mesVisible}</span>
        </p>
      </section>

      <section aria-label="Resumen general" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Metrica etiqueta="Dotación prevista" valor={general.previstos || 0} />
        <Metrica etiqueta="Ausentes / No disponibles" valor={general.ausentes || 0} destacada={general.ausentes > 0} />
        <Metrica etiqueta="Libres" valor={general.libres || 0} />
        <Metrica etiqueta="Extras" valor={general.extras || 0} />
        <Metrica etiqueta="Sin asignar" valor={general.sinAsignar || 0} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ResumenCategoria titulo="Enfermeros" datos={enfermeros} />
        <ResumenCategoria titulo="Licenciados" datos={licenciados} />
      </div>

      <section className={`rounded-2xl border p-4 shadow-sm ${sectoresCriticos.length > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
        <h3 className="font-bold text-slate-900">Sectores críticos</h3>
        {sectoresCriticos.length === 0 ? (
          <p className="mt-1 text-sm text-emerald-800">Sin alertas críticas</p>
        ) : (
          <>
            <p className="mt-1 text-sm font-semibold text-red-800">
              {sectoresCriticos.length} sector{sectoresCriticos.length === 1 ? "" : "es"} sin cobertura
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-red-800">
              {sectoresCriticos.map((sector) => <li key={sector}>{sector}</li>)}
            </ul>
          </>
        )}
      </section>

      {sinAsignar.length > 0 && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <h3 className="font-bold text-slate-900">Sin asignar</h3>
          <p className="mt-1 text-sm text-slate-700">
            {sinAsignar.slice(0, 3).map((persona) => persona.nombre).filter(Boolean).join(", ")}
            {sinAsignar.length > 3 ? ` + ${sinAsignar.length - 3} más` : ""}
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-slate-900">Novedades del día</h3>
          <button type="button" onClick={() => onNavegar("novedades")} className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
            Ver Novedades
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TIPOS_NOVEDAD_DIA.map(([tipo, etiqueta]) => (
            <div key={tipo} className="rounded-lg bg-slate-50 px-3 py-2">
              <strong className="text-lg text-slate-900">{novedadesDia[tipo] || 0}</strong>
              <span className="ml-2 text-xs text-slate-600">{etiqueta}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Accesos rápidos" className="grid gap-3 sm:grid-cols-3">
        {ACCESOS_RAPIDOS.map((acceso) => (
          <button
            key={acceso.id}
            type="button"
            onClick={() => onNavegar(acceso.id)}
            className="min-h-20 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
          >
            <span className="block font-semibold text-slate-900">{acceso.etiqueta}</span>
            <span className="mt-1 block text-sm text-slate-600">{acceso.descripcion}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

export default VistaInicio;
