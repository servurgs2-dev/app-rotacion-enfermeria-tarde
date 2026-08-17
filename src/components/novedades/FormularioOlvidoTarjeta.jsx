import { useState } from "react";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";

const fechaDentroDelMes = (fecha, mes) =>
  Boolean(/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") && fecha.startsWith(`${mes}-`));

function FormularioOlvidoTarjeta({
  personal = [],
  fechaInicial = "",
  mesActivo = "",
  soloLectura = false,
  onGuardar = async () => null,
  onCerrar = () => {}
}) {
  const [personaId, setPersonaId] = useState("");
  const [fecha, setFecha] = useState(fechaInicial);
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const ultimoDia = mesActivo
    ? new Date(Number(mesActivo.slice(0, 4)), Number(mesActivo.slice(5, 7)), 0).getDate()
    : 31;

  const guardar = async (evento) => {
    evento.preventDefault();
    if (soloLectura || guardando) return;
    const persona = personal.find((actual) => actual.id === personaId);
    if (!persona) {
      setError("Seleccioná un funcionario.");
      return;
    }
    if (!fechaDentroDelMes(fecha, mesActivo)) {
      setError("Seleccioná una fecha válida del mes activo.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onGuardar({ persona, fecha, observacion });
      onCerrar();
    } catch (err) {
      setError(err?.message || "No fue posible registrar el Olvido de tarjeta.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Funcionario
        <select value={personaId} onChange={(evento) => setPersonaId(evento.target.value)} disabled={soloLectura} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
          <option value="">Seleccionar…</option>
          {personal.map((persona) => <option key={persona.id} value={persona.id}>{obtenerEtiquetaPersona(persona)}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Fecha
        <input type="date" value={fecha} min={mesActivo ? `${mesActivo}-01` : undefined} max={mesActivo ? `${mesActivo}-${String(ultimoDia).padStart(2, "0")}` : undefined} onChange={(evento) => setFecha(evento.target.value)} disabled={soloLectura} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
        Observación (opcional)
        <textarea value={observacion} onChange={(evento) => setObservacion(evento.target.value)} disabled={soloLectura} rows="2" placeholder="Ej.: olvidó marcar entrada" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{error}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
        <button type="submit" disabled={soloLectura || guardando} className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white disabled:bg-slate-300">
          {guardando ? "Guardando…" : "Registrar Olvido de tarjeta"}
        </button>
        <button type="button" onClick={onCerrar} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700">Cancelar</button>
      </div>
    </form>
  );
}

export default FormularioOlvidoTarjeta;
