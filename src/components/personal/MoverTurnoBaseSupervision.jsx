import { useEffect, useMemo, useRef, useState } from "react";
import { TURNOS } from "../../config/turnos.js";
import { obtenerMensajeMovimientoPadronBase } from "../../services/servicioMovimientoPadronBase.js";

const nombreMes = (mes) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || "")) return mes || "";
  const [anio, numero] = mes.split("-").map(Number);
  const nombre = new Intl.DateTimeFormat("es-UY", { month: "long" })
    .format(new Date(anio, numero - 1, 1, 12));
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
};

const resumirInformativas = (informativas) => {
  const ambitos = new Set((informativas || []).map((item) => item.ambito));
  return [
    ambitos.has("planilla") ? "asignaciones de Planilla" : "",
    ambitos.has("licencias") ? "licencias" : "",
    ambitos.has("certificaciones") ? "certificaciones" : "",
    ambitos.has("extras") ? "Extras" : ""
  ].filter(Boolean);
};

function MoverTurnoBaseSupervision({
  persona,
  personaId,
  mes,
  turnoOrigen,
  historico = false,
  onAnalizar,
  onMover,
  onCerrar
}) {
  const opciones = useMemo(() => Object.values(TURNOS).filter(
    (turno) => turno.id !== turnoOrigen
  ), [turnoOrigen]);
  const [turnoDestino, setTurnoDestino] = useState(() => opciones[0]?.id || "");
  const [analisis, setAnalisis] = useState(null);
  const [cargandoAnalisis, setCargandoAnalisis] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const solicitudRef = useRef(0);

  const analizar = async () => {
    const solicitud = solicitudRef.current + 1;
    solicitudRef.current = solicitud;
    setCargandoAnalisis(true);
    setConfirmando(false);
    setError("");
    try {
      const resultado = await onAnalizar({ personaId, turnoOrigen, turnoDestino, mes });
      if (solicitudRef.current === solicitud) setAnalisis(resultado);
    } catch (err) {
      if (solicitudRef.current === solicitud) {
        setAnalisis(null);
        setError(err?.message || "No se pudo revisar el movimiento.");
      }
    } finally {
      if (solicitudRef.current === solicitud) setCargandoAnalisis(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(analizar, 0);
    return () => {
      clearTimeout(timeout);
      solicitudRef.current += 1;
    };
    // El análisis se fija por identidad, mes y destino del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, personaId, turnoDestino, turnoOrigen]);

  const bloqueos = analisis?.bloqueos || [];
  const informativas = resumirInformativas(analisis?.informativas);
  const bloqueado = historico || cargandoAnalisis ||
    analisis?.ok !== true || bloqueos.length > 0;

  const ejecutar = async () => {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    if (bloqueado || guardando) return;
    setGuardando(true);
    setError("");
    try {
      await onMover({ personaId, turnoOrigen, turnoDestino, mes });
      onCerrar();
    } catch (err) {
      setConfirmando(false);
      setError(err?.message || obtenerMensajeMovimientoPadronBase(err?.codigo));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-mover-turno-base">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-6">
        <h3 id="titulo-mover-turno-base" className="text-lg font-semibold text-slate-900">
          Cambio de padrón base — {nombreMes(mes)}
        </h3>
        <p className="mt-2 text-sm text-slate-700"><strong>{persona?.nombre}</strong></p>
        <p className="mt-1 text-sm text-slate-600">
          Turno base actual: <strong>{TURNOS[turnoOrigen]?.nombre || "No identificado"}</strong>
        </p>
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
          <p>Esto cambia el turno base mensual de la persona. No modifica sus vigencias, licencias, certificaciones ni registros operativos.</p>
          <p className="mt-2">Si existen vigencias explícitas para este mes, seguirán teniendo prioridad sobre el turno base.</p>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="destino-turno-base">
          Nuevo turno base
        </label>
        <select
          id="destino-turno-base"
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base"
          value={turnoDestino}
          disabled={guardando}
          onChange={(event) => setTurnoDestino(event.target.value)}
        >
          {opciones.map((turno) => (
            <option key={turno.id} value={turno.id}>
              {turno.nombre}
            </option>
          ))}
        </select>

        {cargandoAnalisis && <p className="mt-3 text-sm text-slate-500" role="status">Revisando dependencias…</p>}
        {!cargandoAnalisis && bloqueos.map((bloqueo) => (
          <p key={`${bloqueo.codigo}-${bloqueo.ambito}`} className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {obtenerMensajeMovimientoPadronBase(bloqueo.codigo)}
          </p>
        ))}
        {!cargandoAnalisis && informativas.length > 0 && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Se conservarán sin mover: {informativas.join(", ")}.
          </p>
        )}
        {confirmando && !bloqueado && (
          <p className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-medium text-violet-950">
            ¿Cambiar el turno base de {persona?.nombre} de {TURNOS[turnoOrigen]?.nombre} a {TURNOS[turnoDestino]?.nombre} para {nombreMes(mes)}?
          </p>
        )}
        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <p>{error}</p>
            {/cambiaron mientras/.test(error) && (
              <button type="button" className="mt-2 font-semibold underline" onClick={analizar}>Recargar</button>
            )}
          </div>
        )}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700" disabled={guardando} onClick={onCerrar}>Cancelar</button>
          <button type="button" className="min-h-11 rounded-xl bg-violet-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300" disabled={bloqueado || guardando} onClick={ejecutar}>
            {guardando ? "Cambiando turno base…" : confirmando ? "Confirmar cambio" : "Cambiar turno base"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MoverTurnoBaseSupervision;
