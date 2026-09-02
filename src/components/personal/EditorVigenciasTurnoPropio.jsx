import { useState } from "react";
import { TURNOS } from "../../config/turnos.js";
import { guardarVigenciasTurnoPersonaMesTurnoPropio } from "../../services/vigenciasTurnoPersonal.js";
import ModalMobileShell from "../ui/ModalMobileShell.jsx";
import {
  obtenerMensajeErrorVigenciasTurnoPropio,
  prepararEditorVigenciasTurnoPropio
} from "../../utils/editorVigenciasTurnoPropio.js";
import { validarRangosTurnoPropio } from "../../utils/vigenciasTurnoPersonal.js";

const textoPeriodo = ({ desde, hasta }) => `${desde.slice(8, 10)}/${desde.slice(5, 7)}–${
  hasta.slice(8, 10)
}/${hasta.slice(5, 7)}`;

export default function EditorVigenciasTurnoPropio({
  persona,
  personaId,
  mes,
  turnoPerfil,
  entrada,
  tieneDiagnostico,
  historico,
  onCerrar,
  onRecargar
}) {
  const [inicial] = useState(() => prepararEditorVigenciasTurnoPropio({
    mes,
    turnoPerfil,
    entrada,
    tieneDiagnostico
  }));
  const [rangos, setRangos] = useState(() => inicial.rangos.map((rango) => ({ ...rango })));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [conflicto, setConflicto] = useState(false);
  const validacion = validarRangosTurnoPropio({ mes, rangos });
  const limites = { min: `${mes}-01`, max: (() => {
    const [anio, numeroMes] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate()).padStart(2, "0")}`;
  })() };
  const cambios = JSON.stringify(rangos) !== JSON.stringify(inicial.rangos);
  const bloqueado = historico || !inicial.editable;

  const cambiarRango = (indice, campo, valor) => {
    setRangos((actuales) => actuales.map((rango, posicion) =>
      posicion === indice ? { ...rango, [campo]: valor } : rango
    ));
    setError("");
    setConflicto(false);
  };

  const guardar = async () => {
    if (bloqueado || guardando || !cambios || !validacion.valido) return;
    setGuardando(true);
    setError("");
    setConflicto(false);
    try {
      const resultado = await guardarVigenciasTurnoPersonaMesTurnoPropio({
        mes,
        personaId,
        rangos: validacion.rangos,
        revisionEsperada: inicial.revision
      });
      if (resultado.conflicto) {
        setConflicto(true);
        return;
      }
      onCerrar();
      onRecargar();
    } catch (errorGuardado) {
      setError(obtenerMensajeErrorVigenciasTurnoPropio(errorGuardado));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalMobileShell
      ariaLabelledby="titulo-vigencias-turno-propio"
      backdropClassName="bg-slate-950/40"
    >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="titulo-vigencias-turno-propio" className="font-semibold text-slate-900">Editar mi turno</h3>
            <p className="text-sm text-slate-600">{persona?.nombre} · {TURNOS[turnoPerfil]?.nombre}</p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg px-2 py-1 text-sm text-slate-600">Cerrar</button>
        </div>

        {historico && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Los meses históricos son de solo lectura.</p>}
        {!historico && inicial.codigo === "CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            Esta persona todavía usa la asignación mensual de {TURNOS[entrada?.turnoFuente]?.nombre || "otro turno"}. Para agregarla a tu turno primero debe crearse una configuración explícita desde su turno base o por Supervisión.
          </p>
        )}
        {!historico && !inicial.editable && inicial.codigo !== "CONFIGURACION_INICIAL_REQUIERE_TURNO_FUENTE" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            No se puede editar esta identidad con seguridad. Requiere revisión por Supervisión.
          </p>
        )}

        {!bloqueado && (
          <div className="mt-4 space-y-3">
            {rangos.map((rango, indice) => (
              <div key={`${indice}-${rango.desde}-${rango.hasta}`} className="rounded-xl border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
                  <label className="text-sm text-slate-700">Desde
                    <input type="date" min={limites.min} max={limites.max} value={rango.desde} onChange={(evento) => cambiarRango(indice, "desde", evento.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
                  </label>
                  <label className="text-sm text-slate-700">Hasta
                    <input type="date" min={limites.min} max={limites.max} value={rango.hasta} onChange={(evento) => cambiarRango(indice, "hasta", evento.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
                  </label>
                </div>
                <button type="button" onClick={() => { setRangos((actuales) => actuales.filter((_, posicion) => posicion !== indice)); setError(""); }} className="mt-2 text-sm font-medium text-red-600">Quitar período</button>
              </div>
            ))}
            <button type="button" onClick={() => setRangos((actuales) => [...actuales, { desde: limites.min, hasta: limites.max }])} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700">+ Agregar período</button>
            {!validacion.valido && <p className="text-sm text-red-700" role="alert">Revisá las fechas: deben pertenecer al mes y no pueden superponerse.</p>}
          </div>
        )}

        {inicial.rangosAjenos.length > 0 && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">Otros turnos</p>
            {inicial.rangosAjenos.map((rango) => <p key={`${rango.turno}-${rango.desde}-${rango.hasta}`} className="text-sm text-slate-600">{TURNOS[rango.turno]?.nombre}: {textoPeriodo(rango)}</p>)}
            <p className="mt-1 text-xs text-slate-500">Sólo lectura</p>
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
          {!bloqueado && <button type="button" onClick={guardar} disabled={guardando || !cambios || !validacion.valido || conflicto} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{guardando ? "Guardando…" : "Guardar"}</button>}
        </div>
    </ModalMobileShell>
  );
}
