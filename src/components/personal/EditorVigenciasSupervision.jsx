import { useState } from "react";
import { TURNOS } from "../../config/turnos.js";
import {
  eliminarVigenciasTurnoPersonaMes,
  guardarVigenciasTurnoPersonaMes
} from "../../services/vigenciasTurnoPersonal.js";
import ModalMobileShell from "../ui/ModalMobileShell.jsx";
import {
  obtenerMensajeErrorVigenciasSupervision,
  prepararEditorVigenciasSupervision,
  validarBorradorVigenciasSupervision
} from "../../utils/editorVigenciasSupervision.js";

const obtenerLimitesMes = (mes) => {
  const [anio, numeroMes] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  return {
    min: `${mes}-01`,
    max: `${mes}-${String(ultimoDia).padStart(2, "0")}`
  };
};

export default function EditorVigenciasSupervision({
  persona,
  personaId,
  mes,
  entrada,
  tieneDiagnostico,
  historico,
  onCerrar,
  onRecargar
}) {
  const [inicial] = useState(() => prepararEditorVigenciasSupervision({
    mes,
    entrada,
    tieneDiagnostico
  }));
  const [rangos, setRangos] = useState(() => inicial.rangos.map((rango) => ({ ...rango })));
  const [operacion, setOperacion] = useState("");
  const [error, setError] = useState("");
  const [conflicto, setConflicto] = useState(false);
  const [confirmarFallback, setConfirmarFallback] = useState(false);
  const limites = obtenerLimitesMes(mes);
  const validacion = validarBorradorVigenciasSupervision({ mes, personaId, rangos });
  const cambios = JSON.stringify(rangos) !== JSON.stringify(inicial.rangos);
  const bloqueado = historico || !inicial.editable;
  const procesando = Boolean(operacion);

  const limpiarMensajes = () => {
    setError("");
    setConflicto(false);
    setConfirmarFallback(false);
  };

  const cambiarRango = (indice, campo, valor) => {
    setRangos((actuales) => actuales.map((rango, posicion) =>
      posicion === indice ? { ...rango, [campo]: valor } : rango
    ));
    limpiarMensajes();
  };

  const terminarConExito = () => {
    onCerrar();
    onRecargar();
  };

  const guardar = async () => {
    if (bloqueado || procesando || !cambios || !validacion.valido) return;
    setOperacion("guardar");
    setError("");
    setConflicto(false);
    try {
      const resultado = await guardarVigenciasTurnoPersonaMes({
        mes,
        personaId,
        vigencias: validacion.vigencias,
        revisionEsperada: inicial.revision
      });
      if (resultado.conflicto) {
        setConflicto(true);
        return;
      }
      terminarConExito();
    } catch (errorGuardado) {
      setError(obtenerMensajeErrorVigenciasSupervision(errorGuardado));
    } finally {
      setOperacion("");
    }
  };

  const volverAlPadronBase = async () => {
    if (bloqueado || procesando || !inicial.existeConfiguracionExplicita || !confirmarFallback) {
      return;
    }
    setOperacion("eliminar");
    setError("");
    setConflicto(false);
    try {
      const resultado = await eliminarVigenciasTurnoPersonaMes({
        mes,
        personaId,
        revisionEsperada: inicial.revision
      });
      if (resultado.conflicto) {
        setConflicto(true);
        setConfirmarFallback(false);
        return;
      }
      terminarConExito();
    } catch (errorEliminacion) {
      setError(obtenerMensajeErrorVigenciasSupervision(errorEliminacion));
    } finally {
      setOperacion("");
    }
  };

  return (
    <ModalMobileShell
      ariaLabelledby="titulo-vigencias-supervision"
      backdropClassName="bg-slate-950/40"
    >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="titulo-vigencias-supervision" className="font-semibold text-slate-900">Editar vigencias</h3>
            <p className="text-sm text-slate-600">{persona?.nombre}</p>
            <p className="mt-1 text-xs text-slate-500">
              Padrón base: {TURNOS[inicial.turnoFuente]?.nombre || "No disponible"}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg px-2 py-1 text-sm text-slate-600">Cerrar</button>
        </div>

        {historico && (
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            Los meses históricos son de solo lectura.
          </p>
        )}
        {!historico && !inicial.editable && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            No se puede editar esta configuración con seguridad. Requiere revisión de la identidad.
          </p>
        )}

        {!bloqueado && (
          <div className="mt-4 space-y-3">
            {rangos.map((rango, indice) => (
              <div key={`${indice}-${rango.turno}-${rango.desde}-${rango.hasta}`} className="rounded-xl border border-slate-200 p-3">
                <label className="block text-sm text-slate-700">Turno
                  <select value={rango.turno} onChange={(evento) => cambiarRango(indice, "turno", evento.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2">
                    {Object.entries(TURNOS).map(([turnoId, turno]) => (
                      <option key={turnoId} value={turnoId}>{turno.nombre}</option>
                    ))}
                  </select>
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
                  <label className="text-sm text-slate-700">Desde
                    <input type="date" min={limites.min} max={limites.max} value={rango.desde} onChange={(evento) => cambiarRango(indice, "desde", evento.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
                  </label>
                  <label className="text-sm text-slate-700">Hasta
                    <input type="date" min={limites.min} max={limites.max} value={rango.hasta} onChange={(evento) => cambiarRango(indice, "hasta", evento.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
                  </label>
                </div>
                <button type="button" onClick={() => { setRangos((actuales) => actuales.filter((_, posicion) => posicion !== indice)); limpiarMensajes(); }} className="mt-2 text-sm font-medium text-red-600">Quitar período</button>
              </div>
            ))}
            <button type="button" onClick={() => { setRangos((actuales) => [...actuales, { turno: inicial.turnoFuente, desde: limites.min, hasta: limites.max }]); limpiarMensajes(); }} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700">+ Agregar período</button>
            {!validacion.valido && rangos.length > 0 && (
              <p className="text-sm text-red-700" role="alert">Revisá los turnos y las fechas: deben pertenecer al mes y no pueden superponerse.</p>
            )}
            {rangos.length === 0 && (
              <p className="text-sm text-amber-800" role="status">
                La configuración completa no puede quedar vacía. Para quitar las vigencias específicas usá “Volver al padrón base”.
              </p>
            )}
          </div>
        )}

        {!bloqueado && inicial.existeConfiguracionExplicita && !confirmarFallback && (
          <button type="button" onClick={() => { setConfirmarFallback(true); setError(""); }} className="mt-5 text-sm font-semibold text-amber-800">
            Volver al padrón base
          </button>
        )}
        {!bloqueado && inicial.existeConfiguracionExplicita && confirmarFallback && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-labelledby="titulo-confirmar-fallback">
            <p id="titulo-confirmar-fallback" className="text-sm font-semibold text-amber-950">¿Volver al padrón base?</p>
            <p className="mt-1 text-sm text-amber-900">Se eliminarán las vigencias específicas de este mes y la persona volverá a pertenecer al turno de su padrón base.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={procesando} onClick={volverAlPadronBase} className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{operacion === "eliminar" ? "Eliminando…" : "Sí, volver al padrón base"}</button>
              <button type="button" disabled={procesando} onClick={() => setConfirmarFallback(false)} className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-900">Cancelar</button>
            </div>
          </div>
        )}

        {conflicto && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3" role="status">
            <p className="text-sm text-amber-900">La configuración cambió mientras la estabas editando. Recargá los datos antes de volver a guardar.</p>
            <button type="button" onClick={() => { onCerrar(); onRecargar(); }} className="mt-2 text-sm font-semibold text-amber-900">Recargar</button>
          </div>
        )}
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert" aria-live="polite">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button>
          {!bloqueado && (
            <button type="button" onClick={guardar} disabled={procesando || !cambios || !validacion.valido || conflicto} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
              {operacion === "guardar" ? "Guardando…" : "Guardar vigencias"}
            </button>
          )}
        </div>
    </ModalMobileShell>
  );
}
