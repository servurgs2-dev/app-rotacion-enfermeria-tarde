import { useEffect, useMemo, useRef, useState } from "react";
import { TURNOS } from "../../config/turnos.js";
import { guardarConfiguracionDotacionSupervisionMes } from "../../services/configuracionDotacionSupervisionMes.js";
import {
  CATEGORIAS_EDITOR_DOTACION_SUPERVISION,
  TURNOS_EDITOR_DOTACION_SUPERVISION,
  actualizarCampoBorradorDotacion,
  alternarValoresGeneralesTurno,
  configuracionesDotacionIguales,
  crearFuenteEdicionConfiguracionDotacion,
  crearBorradorConfiguracionDotacion,
  puedeEditarMesSupervision,
  mensajeHumanoErrorGuardadoConfiguracionDotacion,
  prepararGuardadoBorradorConfiguracionDotacion,
  resolverSincronizacionEditorConfiguracionDotacion,
  validarBorradorConfiguracionDotacion
} from "../../utils/borradorConfiguracionDotacionSupervision.js";
import EstadoConfiguracionDotacionSupervision from "./EstadoConfiguracionDotacionSupervision.jsx";

const ETIQUETAS_CATEGORIA = Object.freeze({
  licenciado: "Licenciados",
  enfermero: "Enfermeros"
});

function CamposUmbral({
  fuente,
  turno = null,
  categoria,
  umbral,
  errores,
  disabled,
  onCambiar
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
      {["minimo", "optimo"].map((campo) => {
        const id = `umbral-${fuente}-${turno || "general"}-${categoria}-${campo}`;
        const clave = fuente === "default"
          ? `defaults.${categoria}.${campo}`
          : `overridesTurno.${turno}.${categoria}.${campo}`;
        const error = errores[clave];
        return (
          <div key={campo} className="min-w-0">
            <label htmlFor={id} className="block text-xs font-bold text-slate-700">
              {campo === "minimo" ? "Mínimo" : "Óptimo"}
            </label>
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={umbral?.[campo] ?? ""}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(evento) => onCambiar(campo, evento.target.value)}
              className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
            />
            {error && (
              <p id={`${id}-error`} className="mt-1 text-xs font-semibold text-red-700">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TarjetaCategoriaGeneral({ categoria, borrador, errores, soloLectura, onCambiar }) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="font-extrabold text-slate-900">{ETIQUETAS_CATEGORIA[categoria]}</h4>
      <CamposUmbral
        fuente="default"
        categoria={categoria}
        umbral={borrador.defaults[categoria]}
        errores={errores}
        disabled={soloLectura}
        onCambiar={(campo, valor) => onCambiar({
          fuente: "default",
          categoria,
          campo,
          valor
        })}
      />
    </article>
  );
}

function TarjetaCategoriaTurno({
  turno,
  categoria,
  borrador,
  errores,
  soloLectura,
  onAlternarGenerales,
  onCambiar
}) {
  const override = borrador.overridesTurno?.[turno]?.[categoria];
  const usarGenerales = !override;
  const checkboxId = `usar-generales-${turno}-${categoria}`;
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="font-extrabold text-slate-900">{ETIQUETAS_CATEGORIA[categoria]}</h4>
      <label htmlFor={checkboxId} className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm font-semibold text-slate-700">
        <input
          id={checkboxId}
          type="checkbox"
          checked={usarGenerales}
          disabled={soloLectura}
          onChange={(evento) => onAlternarGenerales({
            turno,
            categoria,
            usarGenerales: evento.target.checked
          })}
          className="h-5 w-5 rounded border-slate-300 text-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
        />
        Usar valores generales
      </label>
      {usarGenerales ? (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-600">
          Mínimo {borrador.defaults[categoria].minimo} · Óptimo {borrador.defaults[categoria].optimo}
        </p>
      ) : (
        <CamposUmbral
          fuente="override"
          turno={turno}
          categoria={categoria}
          umbral={override}
          errores={errores}
          disabled={soloLectura}
          onCambiar={(campo, valor) => onCambiar({
            fuente: "override",
            turno,
            categoria,
            campo,
            valor
          })}
        />
      )}
    </article>
  );
}

function EditorConfiguracionDotacionSupervision({ configuracionMes }) {
  const configuracionCargada = configuracionMes.configuracion;
  const [fuenteEdicion, setFuenteEdicion] = useState(() =>
    crearFuenteEdicionConfiguracionDotacion(configuracionMes)
  );
  const [borrador, setBorrador] = useState(() =>
    crearBorradorConfiguracionDotacion(configuracionCargada)
  );
  const [turnoSeleccionado, setTurnoSeleccionado] = useState("noche");
  const [guardando, setGuardando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [conflicto, setConflicto] = useState(null);
  const [protegerFuente, setProtegerFuente] = useState(false);
  const avisoRef = useRef(null);

  const validacion = useMemo(
    () => validarBorradorConfiguracionDotacion(borrador),
    [borrador]
  );
  const fuenteEntrante = crearFuenteEdicionConfiguracionDotacion(configuracionMes);
  const sincronizacion = resolverSincronizacionEditorConfiguracionDotacion({
    fuenteBase: fuenteEdicion,
    borrador,
    fuenteEntrante,
    protegerFuente,
    guardando,
    conflicto: Boolean(conflicto)
  });
  const { fuenteActiva, borradorActivo, actualizacionRemotaPendiente } = sincronizacion;
  const conCambios = !configuracionesDotacionIguales(
    borradorActivo,
    fuenteActiva.configuracion
  );
  const soloLectura = !puedeEditarMesSupervision(configuracionMes.mes);
  const puedeGuardar = !soloLectura && conCambios && validacion.ok &&
    !guardando && !configuracionMes.recargando;

  useEffect(() => {
    if (conflicto || feedback?.tipo === "error") avisoRef.current?.focus();
  }, [conflicto, feedback]);

  const limpiarFeedbackEdicion = () => {
    if (feedback) setFeedback(null);
  };

  const cambiarCampo = (cambio) => {
    if (soloLectura) return;
    limpiarFeedbackEdicion();
    setFuenteEdicion(fuenteActiva);
    setBorrador(actualizarCampoBorradorDotacion(borradorActivo, cambio));
  };
  const alternarGenerales = (cambio) => {
    if (soloLectura) return;
    limpiarFeedbackEdicion();
    setFuenteEdicion(fuenteActiva);
    setBorrador(alternarValoresGeneralesTurno(borradorActivo, cambio));
  };
  const descartar = () => {
    setBorrador(crearBorradorConfiguracionDotacion(configuracionCargada));
    setFuenteEdicion(crearFuenteEdicionConfiguracionDotacion(configuracionMes));
    setFeedback(null);
    setConflicto(null);
    setProtegerFuente(false);
  };

  const guardar = async () => {
    if (guardando) return;
    const preparacion = prepararGuardadoBorradorConfiguracionDotacion({
      mes: configuracionMes.mes,
      origen: fuenteActiva.origen,
      revision: fuenteActiva.revision,
      borrador: borradorActivo,
      configuracionInicial: fuenteActiva.configuracion
    });
    if (!preparacion.ok) return;

    setGuardando(true);
    setFeedback(null);
    setConflicto(null);
    try {
      const resultado = await guardarConfiguracionDotacionSupervisionMes(preparacion);
      if (resultado.conflicto) {
        setConflicto(resultado);
        return;
      }
      setFeedback({ tipo: "informacion", mensaje: "Configuración guardada. Actualizando datos…" });
      try {
        const fuenteRecargada = await configuracionMes.recargar();
        setFuenteEdicion(crearFuenteEdicionConfiguracionDotacion(fuenteRecargada));
        setBorrador(crearBorradorConfiguracionDotacion(fuenteRecargada.configuracion));
        setProtegerFuente(false);
        setFeedback({ tipo: "exito", mensaje: "Configuración guardada." });
      } catch {
        setFeedback({
          tipo: "error",
          mensaje: "La configuración se guardó, pero no pudo recargarse. Tus cambios permanecen visibles."
        });
      }
    } catch (error) {
      setFeedback({
        tipo: "error",
        mensaje: mensajeHumanoErrorGuardadoConfiguracionDotacion(error)
      });
    } finally {
      setGuardando(false);
    }
  };

  const cargarVersionReciente = () => {
    const configuracionRemota = conflicto?.configuracionActual || configuracionCargada;
    const fuenteRemota = crearFuenteEdicionConfiguracionDotacion({
      ...configuracionMes,
      origen: conflicto?.configuracionActual ? "persistida" : configuracionMes.origen,
      revision: conflicto?.revisionActual || configuracionMes.revision
    }, configuracionRemota);
    setBorrador(crearBorradorConfiguracionDotacion(configuracionRemota));
    setFuenteEdicion(fuenteRemota);
    setConflicto(null);
    setFeedback(null);
    setProtegerFuente(true);
    configuracionMes.recargar()
      .then((fuenteRecargada) => {
        setFuenteEdicion(crearFuenteEdicionConfiguracionDotacion(fuenteRecargada));
        setBorrador(crearBorradorConfiguracionDotacion(fuenteRecargada.configuracion));
        setProtegerFuente(false);
      })
      .catch(() => {
        setFeedback({
          tipo: "error",
          mensaje: "No se pudo recargar la versión más reciente. Se conserva la versión informada por el conflicto."
        });
      });
  };

  const seguirRevisando = () => {
    setConflicto(null);
    setFeedback({
      tipo: "informacion",
      mensaje: "Tus cambios siguen sin guardar. Revisalos antes de intentar nuevamente."
    });
  };

  return (
    <section aria-label="Editor de umbrales de dotación" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <EstadoConfiguracionDotacionSupervision configuracionMes={configuracionMes} />

      {soloLectura && (
        <p role="status" className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          Los meses históricos son de solo lectura.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm font-bold ${conCambios ? "text-amber-700" : "text-slate-600"}`}>
          {conCambios ? "Cambios sin guardar" : "Sin cambios"}
        </p>
        {!soloLectura && conCambios && (
          <button
            type="button"
            onClick={descartar}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
          >
            Descartar cambios
          </button>
        )}
      </div>

      {!soloLectura && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">
          Los cambios se aplicarán a todo el mes seleccionado.
        </p>
      )}

      {conflicto && (
        <div ref={avisoRef} role="alert" tabIndex="-1" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-extrabold">La configuración cambió mientras la estabas editando.</p>
          <p className="mt-1 text-xs">Tus cambios no fueron guardados.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={cargarVersionReciente} className="min-h-11 rounded-lg border border-amber-400 bg-white px-3 py-2 font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/30">
              Cargar versión más reciente
            </button>
            <button type="button" onClick={seguirRevisando} className="min-h-11 rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/30">
              Seguir revisando mis cambios
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p ref={avisoRef} role={feedback.tipo === "error" ? "alert" : "status"} aria-live="polite" className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${feedback.tipo === "error"
          ? "border-red-300 bg-red-50 text-red-900"
          : feedback.tipo === "exito"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-slate-200 bg-slate-50 text-slate-700"}`}
        >
          {feedback.mensaje}
        </p>
      )}

      {actualizacionRemotaPendiente && !conflicto && (
        <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          Hay una versión más reciente cargada. Tus cambios locales se conservaron y se validarán al guardar.
        </p>
      )}

      <section aria-labelledby="valores-generales-titulo" className="mt-4">
        <h3 id="valores-generales-titulo" className="text-base font-extrabold text-slate-900">
          Valores generales
        </h3>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATEGORIAS_EDITOR_DOTACION_SUPERVISION.map((categoria) => (
            <TarjetaCategoriaGeneral
              key={categoria}
              categoria={categoria}
              borrador={borradorActivo}
              errores={validacion.erroresCampos}
              soloLectura={soloLectura}
              onCambiar={cambiarCampo}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="configuracion-turno-titulo" className="mt-5">
        <h3 id="configuracion-turno-titulo" className="text-base font-extrabold text-slate-900">
          Configuración por turno
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Seleccionar turno para configurar">
          {TURNOS_EDITOR_DOTACION_SUPERVISION.map((turno) => (
            <button
              key={turno}
              type="button"
              aria-pressed={turnoSeleccionado === turno}
              onClick={() => setTurnoSeleccionado(turno)}
              className={`min-h-11 min-w-0 rounded-lg border px-2 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 ${turnoSeleccionado === turno
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-300 bg-white text-slate-700"}`}
            >
              {TURNOS[turno]?.nombre || turno}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATEGORIAS_EDITOR_DOTACION_SUPERVISION.map((categoria) => (
            <TarjetaCategoriaTurno
              key={`${turnoSeleccionado}-${categoria}`}
              turno={turnoSeleccionado}
              categoria={categoria}
              borrador={borradorActivo}
              errores={validacion.erroresCampos}
              soloLectura={soloLectura}
              onAlternarGenerales={alternarGenerales}
              onCambiar={cambiarCampo}
            />
          ))}
        </div>
      </section>

      <button
        type="button"
        disabled={!puedeGuardar}
        onClick={guardar}
        className="mt-5 min-h-11 w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 sm:w-auto"
      >
        {guardando ? "Guardando…" : "Guardar configuración"}
      </button>
    </section>
  );
}

export default EditorConfiguracionDotacionSupervision;
