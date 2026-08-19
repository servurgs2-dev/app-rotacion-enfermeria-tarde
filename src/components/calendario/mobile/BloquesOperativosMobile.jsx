import { ESTADOS_ASISTENCIA } from "../../../utils/asistenciaPersonas.js";

function BloqueOperativoMobile({ titulo, cantidad, children, tono = "slate" }) {
  const tonos = {
    violet: "border-violet-200 bg-violet-50 text-violet-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900"
  };
  return (
    <details className={`group rounded-xl border ${tonos[tono] || tonos.slate}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="flex items-center gap-2">
          <span className="min-w-7 rounded-full bg-white/80 px-2 py-0.5 text-center text-xs font-bold">{cantidad}</span>
          <span aria-hidden="true" className="text-lg transition group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="border-t border-current/10 bg-white/70 px-3 py-2">{children}</div>
    </details>
  );
}

const MensajeVacio = ({ children }) => <p className="py-1 text-sm text-slate-500">{children}</p>;

function BloquesOperativosMobile({
  ausentes = [],
  noDisponibles = [],
  extras = [],
  libres = [],
  certificados = [],
  soloLectura = false,
  onCambiarAsistencia,
  onEditarNoDisponible,
  onQuitarNoDisponible,
  onQuitarCertificacionRapida,
  onAgregarExtra,
  onQuitarExtra,
  onAgregarExtraLibre
}) {
  return (
    <section className="mt-4 space-y-2 md:hidden" aria-label="Bloques operativos del día">
      <BloqueOperativoMobile titulo="No disponibles" cantidad={noDisponibles.length} tono="orange">
        {noDisponibles.length === 0 ? <MensajeVacio>Sin registros operativos.</MensajeVacio> : (
          <div className="divide-y divide-orange-100">
            {noDisponibles.map((item) => (
              <div key={item.clave} className="py-2">
                <p className="text-sm font-semibold text-slate-900">{item.nombre}</p>
                <p className="text-xs text-slate-600">{item.detalle}</p>
                {item.detalleAdicional && <p className="text-xs text-slate-600">{item.detalleAdicional}</p>}
                {!soloLectura && item.accion === "editar" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => onEditarNoDisponible(item)} className="min-h-11 rounded-lg border border-orange-300 bg-white px-3 text-xs font-semibold text-orange-900">Editar motivo</button>
                    <button type="button" onClick={() => onQuitarNoDisponible(item)} className="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700">Quitar</button>
                  </div>
                )}
                {!soloLectura && item.accion === "quitar_certificacion" && (
                  <button type="button" onClick={() => onQuitarCertificacionRapida(item)} className="mt-2 min-h-11 rounded-lg border border-blue-300 bg-white px-3 text-xs font-semibold text-blue-900">Eliminar certificación del día</button>
                )}
              </div>
            ))}
          </div>
        )}
      </BloqueOperativoMobile>

      <BloqueOperativoMobile titulo="Extras" cantidad={extras.length} tono="blue">
        <button type="button" disabled={soloLectura} onClick={onAgregarExtra} className="mb-2 min-h-11 w-full rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50">+ Agregar Extra</button>
        {extras.length === 0 ? <MensajeVacio>Sin Extras.</MensajeVacio> : (
          <div className="divide-y divide-blue-100">
            {extras.map((item) => (
              <div key={item.clave} className="flex min-w-0 items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.nombre}</p>
                  <p className="text-xs text-slate-600">{item.detalle}</p>
                </div>
                <button type="button" disabled={soloLectura} onClick={() => onQuitarExtra(item)} aria-label={`Quitar Extra ${item.nombre}`} className="min-h-11 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-50">Quitar</button>
              </div>
            ))}
          </div>
        )}
      </BloqueOperativoMobile>

      <BloqueOperativoMobile titulo="Libres" cantidad={libres.length} tono="green">
        {libres.length === 0 ? <MensajeVacio>Sin libres.</MensajeVacio> : (
          <div className="grid grid-cols-1 gap-1.5">
            {libres.map((item) => (
              <button key={item.clave} type="button" disabled={soloLectura || item.yaEsExtra} onClick={() => onAgregarExtraLibre(item)} className="min-h-11 rounded-lg bg-emerald-100 px-3 text-left text-sm text-emerald-900 disabled:opacity-60">
                {item.nombre}{item.yaEsExtra ? " · Agregado como Extra" : " · Agregar como Extra"}
              </button>
            ))}
          </div>
        )}
      </BloqueOperativoMobile>

      <BloqueOperativoMobile titulo="Certificados" cantidad={certificados.length} tono="rose">
        {certificados.length === 0 ? <MensajeVacio>Ninguno.</MensajeVacio> : certificados.map((item) => (
          <p key={item.clave} className="border-b border-rose-100 py-2 text-sm font-medium text-slate-800 last:border-0">{item.nombre}</p>
        ))}
      </BloqueOperativoMobile>

      <BloqueOperativoMobile titulo="Ausentes" cantidad={ausentes.length} tono="violet">
        {ausentes.length === 0 ? <MensajeVacio>Sin ausentes.</MensajeVacio> : (
          <div className="divide-y divide-violet-100">
            {ausentes.map((item) => (
              <div key={item.clave} className="flex min-w-0 items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.nombre}</p>
                  <p className="text-xs text-slate-600">{item.detalle}</p>
                </div>
                <select
                  aria-label={`Asistencia de ${item.nombre}`}
                  value={ESTADOS_ASISTENCIA.AUSENTE}
                  disabled={soloLectura || !item.persona}
                  onChange={(evento) => item.persona && onCambiarAsistencia(item.persona, evento.target.value)}
                  className="min-h-11 max-w-28 rounded-lg border border-violet-300 bg-white px-1.5 text-xs"
                >
                  <option value={ESTADOS_ASISTENCIA.PENDIENTE}>Pendiente</option>
                  <option value={ESTADOS_ASISTENCIA.PRESENTE}>✓ Presente</option>
                  <option value={ESTADOS_ASISTENCIA.AUSENTE}>✕ Ausente</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </BloqueOperativoMobile>
    </section>
  );
}

export { BloqueOperativoMobile };
export default BloquesOperativosMobile;
