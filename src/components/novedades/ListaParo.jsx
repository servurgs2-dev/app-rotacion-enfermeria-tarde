import { useMemo, useState } from "react";
import {
  esAdhesionParoActiva,
  ESTADOS_NOVEDAD_PERSONAL,
  obtenerEtiquetaTipoNovedad,
  obtenerNovedadesPersonaEnFecha,
  TIPOS_NOVEDAD_PERSONAL
} from "../../utils/novedadesPersonal.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";

const CATEGORIAS = [
  ["enfermero", "Enfermeros"],
  ["licenciado", "Licenciados"]
];

const fechaDentroDelMes = (fecha, mes) =>
  Boolean(/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") && fecha.startsWith(`${mes}-`));

function ListaParo({
  personal = [],
  novedades = [],
  licencias = [],
  certificaciones = [],
  turnoActivo,
  padronVigencias,
  fechaInicial = "",
  mesActivo = "",
  soloLectura = false,
  onGuardar = async () => null
}) {
  const [fecha, setFecha] = useState(fechaInicial);
  const obtenerIdsActivos = (fechaElegida) => [...new Set(
    (Array.isArray(novedades) ? novedades : [])
      .filter((novedad) => esAdhesionParoActiva(novedad, {
        fecha: fechaElegida,
        turno: turnoActivo,
        padronVigencias
      }))
      .map((novedad) => novedad.personaId)
  )];
  const [seleccionados, setSeleccionados] = useState(() => obtenerIdsActivos(fechaInicial));
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cambiarFecha = (fechaElegida) => {
    setFecha(fechaElegida);
    setSeleccionados(obtenerIdsActivos(fechaElegida));
    setError("");
    setMensaje("");
  };

  const idsSeleccionados = useMemo(() => new Set(seleccionados), [seleccionados]);

  const obtenerOtrasAusencias = (persona) => obtenerNovedadesPersonaEnFecha({
    novedades,
    licencias,
    certificaciones,
    personal,
    persona,
    fecha,
    turno: turnoActivo,
    padronVigencias
  })
    .filter((novedad) => novedad.tipo !== TIPOS_NOVEDAD_PERSONAL.ADHESION_PARO)
    .filter((novedad) => novedad.afectaDisponibilidad === true)
    .filter((novedad) => novedad.estado === ESTADOS_NOVEDAD_PERSONAL.ACTIVA)
    .map((novedad) => obtenerEtiquetaTipoNovedad(novedad.tipo));

  const alternar = (personaId) => {
    if (soloLectura || guardando) return;
    setMensaje("");
    setSeleccionados((actuales) => actuales.includes(personaId)
      ? actuales.filter((id) => id !== personaId)
      : [...actuales, personaId]);
  };

  const seleccionarCategoria = (categoria, seleccionar) => {
    if (soloLectura || guardando) return;
    const idsCategoria = personal
      .filter((persona) => persona.categoria === categoria)
      .map((persona) => persona.id);
    setSeleccionados((actuales) => seleccionar
      ? [...new Set([...actuales, ...idsCategoria])]
      : actuales.filter((id) => !idsCategoria.includes(id)));
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    if (soloLectura || guardando) return;
    if (!fechaDentroDelMes(fecha, mesActivo)) {
      setError("Seleccioná una fecha válida del mes activo.");
      return;
    }
    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const personasSeleccionadas = personal.filter((persona) => idsSeleccionados.has(persona.id));
      const resultado = await onGuardar({ fecha, personasSeleccionadas, observacion });
      setMensaje(`Lista guardada: ${resultado?.creadas?.length || 0} altas y ${resultado?.canceladas?.length || 0} cancelaciones.`);
    } catch (err) {
      setError(err?.message || "No fue posible guardar la lista de paro.");
    } finally {
      setGuardando(false);
    }
  };

  const fechaValida = fechaDentroDelMes(fecha, mesActivo);
  const fechaMinima = mesActivo ? `${mesActivo}-01` : undefined;
  const ultimoDia = mesActivo
    ? new Date(Number(mesActivo.slice(0, 4)), Number(mesActivo.slice(5, 7)), 0).getDate()
    : 31;
  const fechaMaxima = mesActivo ? `${mesActivo}-${String(ultimoDia).padStart(2, "0")}` : undefined;

  return (
    <form onSubmit={guardar} className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Fecha del paro
          <input
            type="date"
            value={fecha}
            min={fechaMinima}
            max={fechaMaxima}
            onChange={(evento) => cambiarFecha(evento.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
          />
        </label>
        <p className="text-sm text-slate-600">
          {seleccionados.length} funcionario{seleccionados.length === 1 ? "" : "s"} seleccionado{seleccionados.length === 1 ? "" : "s"}
        </p>
      </div>

      {CATEGORIAS.map(([categoria, etiqueta]) => {
        const personasCategoria = personal.filter((persona) => persona.categoria === categoria);
        if (personasCategoria.length === 0) return null;
        return (
          <section key={categoria} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-800">{etiqueta}</h4>
              {!soloLectura && (
                <div className="flex gap-3 text-xs font-medium">
                  <button type="button" onClick={() => seleccionarCategoria(categoria, true)} className="min-h-10 text-violet-700">Seleccionar todos</button>
                  <button type="button" onClick={() => seleccionarCategoria(categoria, false)} className="min-h-10 text-slate-600">Limpiar</button>
                </div>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {personasCategoria.map((persona) => {
                const otrasAusencias = obtenerOtrasAusencias(persona);
                const marcado = idsSeleccionados.has(persona.id);
                return (
                  <label key={persona.id} className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 ${marcado ? "border-violet-400 bg-white" : "border-slate-200 bg-white/80"}`}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={soloLectura || guardando || !fechaValida}
                      onChange={() => alternar(persona.id)}
                      className="h-5 w-5 shrink-0 accent-violet-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">{obtenerEtiquetaPersona(persona)}</span>
                      {otrasAusencias.length > 0 && (
                        <span className="block text-xs text-amber-700">No disponible: {[...new Set(otrasAusencias)].join(", ")}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Observación del paro (opcional)
        <textarea value={observacion} onChange={(evento) => setObservacion(evento.target.value)} rows="2" disabled={soloLectura} className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
      </label>
      {soloLectura && <p className="text-sm text-amber-800">Mes histórico en modo solo lectura. La lista puede consultarse, pero no modificarse.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {mensaje && <p role="status" className="text-sm text-emerald-700">{mensaje}</p>}
      {!soloLectura && (
        <button type="submit" disabled={guardando || !fechaValida} className="min-h-11 w-full rounded-lg bg-violet-700 px-4 py-2 font-medium text-white disabled:bg-slate-300 sm:w-auto">
          {guardando ? "Guardando lista…" : "Confirmar lista de paro"}
        </button>
      )}
    </form>
  );
}

export default ListaParo;
