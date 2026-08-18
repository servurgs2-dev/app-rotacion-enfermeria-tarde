import { useState } from "react";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";
import {
  obtenerClaveRenderPersona,
  obtenerIdsPersonalDuplicados
} from "../../utils/validacionPersonal.js";

function FormularioRangoPersona({
  titulo,
  personal = [],
  fechaInicial = "",
  registroInicial = null,
  soloLectura = false,
  permiteObservacion = false,
  crearRegistro,
  onGuardar = async () => null,
  onCerrar = () => {}
}) {
  const editando = Boolean(registroInicial);
  const [personaId, setPersonaId] = useState(registroInicial?.personaId || "");
  const [desde, setDesde] = useState(registroInicial?.fechaDesde || fechaInicial);
  const [hasta, setHasta] = useState(registroInicial?.fechaHasta || fechaInicial);
  const [observacion, setObservacion] = useState(registroInicial?.observacion || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const idsDuplicados = obtenerIdsPersonalDuplicados(personal);

  const guardar = async (evento) => {
    evento.preventDefault();
    if (soloLectura || guardando) return;
    const persona = personal.find((actual) => String(actual.id) === String(personaId));
    if (!persona) return setError("Seleccioná una persona.");
    if (!desde || !hasta) return setError("Completá las fechas desde y hasta.");
    if (hasta < desde) return setError("La fecha hasta no puede ser anterior a la fecha desde.");
    const resultado = crearRegistro({ persona, desde, hasta, observacion });
    if (!resultado?.registro) return setError(resultado?.error || "No se pudo identificar a la persona seleccionada.");
    setGuardando(true);
    setError("");
    try {
      await onGuardar(resultado.registro);
      onCerrar();
    } catch (err) {
      setError(err?.message || `No fue posible guardar ${titulo.toLocaleLowerCase("es")}.`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <h3 className="font-semibold text-slate-800 sm:col-span-2 lg:col-span-3">{titulo}</h3>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Funcionario
        <select value={personaId} onChange={(e) => { setPersonaId(e.target.value); setError(""); }} disabled={soloLectura || editando} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
          <option value="">Seleccionar…</option>
          {personal.map((persona, indice) => <option key={obtenerClaveRenderPersona(persona, indice, idsDuplicados)} value={persona.id}>{obtenerEtiquetaPersona(persona, personal)}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Desde
        <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setError(""); }} disabled={soloLectura} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Hasta
        <input type="date" value={hasta} min={desde || undefined} onChange={(e) => { setHasta(e.target.value); setError(""); }} disabled={soloLectura} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      {permiteObservacion && (
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
          Observación (opcional)
          <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} disabled={soloLectura} rows="2" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{error}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
        <button type="submit" disabled={soloLectura || guardando} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:bg-slate-300">{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar"}</button>
        <button type="button" onClick={onCerrar} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700">Cerrar</button>
      </div>
    </form>
  );
}

export default FormularioRangoPersona;
