import { useMemo, useState } from "react";
import { obtenerConfiguracionTurno } from "../../config/turnos.js";
import { obtenerHorarioHabitualPersona } from "../../utils/horarioEfectivoPersonal.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";
import { validarHorarioExcepcional } from "../../utils/novedadesPersonal.js";

const fechaDentroDelMes = (fecha, mes) =>
  Boolean(/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") && fecha.startsWith(`${mes}-`));

function FormularioCambioHorario({
  personal = [],
  turnoActivo,
  fechaInicial = "",
  mesActivo = "",
  soloLectura = false,
  novedadInicial = null,
  onGuardar = async () => null,
  onCerrar = () => {}
}) {
  const [personaId, setPersonaId] = useState(novedadInicial?.personaId || "");
  const [fecha, setFecha] = useState(novedadInicial?.fechaDesde || fechaInicial);
  const [horaEntrada, setHoraEntrada] = useState(novedadInicial?.datos?.horaEntrada || "");
  const [horaSalida, setHoraSalida] = useState(novedadInicial?.datos?.horaSalida || "");
  const [observacion, setObservacion] = useState(novedadInicial?.observacion || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const persona = personal.find((actual) => actual.id === personaId);
  const configTurno = useMemo(() => obtenerConfiguracionTurno(turnoActivo), [turnoActivo]);
  const habitual = persona ? obtenerHorarioHabitualPersona(persona, configTurno) : null;
  const ultimoDia = mesActivo
    ? new Date(Number(mesActivo.slice(0, 4)), Number(mesActivo.slice(5, 7)), 0).getDate()
    : 31;

  const guardar = async (evento) => {
    evento.preventDefault();
    if (soloLectura || guardando) return;
    if (!persona) return setError("Seleccioná un funcionario.");
    if (!fechaDentroDelMes(fecha, mesActivo)) return setError("Seleccioná una fecha válida del mes activo.");
    const errorHorario = validarHorarioExcepcional({ horaEntrada, horaSalida });
    if (errorHorario) return setError(errorHorario);
    setGuardando(true);
    setError("");
    try {
      await onGuardar({ persona, fecha, horaEntrada, horaSalida, observacion });
      onCerrar();
    } catch (err) {
      setError(err?.message || "No fue posible guardar el Cambio de horario.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="grid gap-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Funcionario
        <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} disabled={soloLectura || Boolean(novedadInicial)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
          <option value="">Seleccionar…</option>
          {personal.map((actual) => <option key={actual.id} value={actual.id}>{obtenerEtiquetaPersona(actual)}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Fecha
        <input type="date" value={fecha} min={mesActivo ? `${mesActivo}-01` : undefined} max={mesActivo ? `${mesActivo}-${String(ultimoDia).padStart(2, "0")}` : undefined} onChange={(e) => setFecha(e.target.value)} disabled={soloLectura || Boolean(novedadInicial)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <p className="self-end rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
        Horario habitual: <strong>{habitual?.textoVisible || "No disponible"}</strong>
      </p>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Entrada excepcional
        <input type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} disabled={soloLectura} required className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Salida excepcional
        <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} disabled={soloLectura} required className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
        Observación (opcional)
        <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} disabled={soloLectura} rows="2" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{error}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
        <button type="submit" disabled={soloLectura || guardando} className="min-h-11 rounded-lg bg-cyan-700 px-4 py-2 font-medium text-white disabled:bg-slate-300">{guardando ? "Guardando…" : novedadInicial ? "Guardar cambios" : "Registrar Cambio de horario"}</button>
        <button type="button" onClick={onCerrar} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700">Cancelar</button>
      </div>
    </form>
  );
}

export default FormularioCambioHorario;
