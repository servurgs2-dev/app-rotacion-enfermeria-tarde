import { useMemo, useState } from "react";
import {
  crearNovedadPersonal,
  crearNovedadesLegacy,
  contarOlvidosTarjetaPendientes,
  ESTADOS_NOVEDAD_PERSONAL,
  filtrarNovedadesPorTurnoActivo,
  filtrarNovedadesVisibles,
  obtenerEtiquetaEstadoNovedad,
  obtenerEtiquetaTipoNovedad,
  OPCIONES_TIPO_NOVEDAD,
  TIPOS_NOVEDAD_PERSONAL
} from "../../utils/novedadesPersonal.js";
import { crearLicenciaPersona } from "../../utils/licenciasPersonas.js";
import { crearCertificacionPersona } from "../../utils/certificacionesPersonas.js";
import FormularioOlvidoTarjeta from "./FormularioOlvidoTarjeta.jsx";
import ListaParo from "./ListaParo.jsx";
import FormularioCambioHorario from "./FormularioCambioHorario.jsx";
import FormularioRangoPersona from "./FormularioRangoPersona.jsx";
import ReporteNovedades from "./ReporteNovedades.jsx";

const TURNOS = [
  ["manana", "Mañana"],
  ["tarde", "Tarde"],
  ["vespertino", "Vespertino"],
  ["noche", "Noche"]
];

const TIPOS_OCULTOS_EN_UI = new Set([
  TIPOS_NOVEDAD_PERSONAL.OTRA,
  TIPOS_NOVEDAD_PERSONAL.EXCEDENTE
]);
const OPCIONES_TIPO_NOVEDAD_OPERATIVAS = OPCIONES_TIPO_NOVEDAD.filter(
  (opcion) => !TIPOS_OCULTOS_EN_UI.has(opcion.valor)
);

const fechaCorta = (fecha) => {
  const [anio, mes, dia] = String(fecha || "").split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : "Sin fecha";
};

function Novedades({
  personal = [],
  licencias = [],
  certificaciones = [],
  turnoActivo,
  fechaActiva = "",
  mesActivo = "",
  soloLectura = false,
  novedades = [],
  cargando = false,
  errorCarga = "",
  onRecargar = () => {},
  onRegistrar = async () => null,
  onCancelar = async () => null,
  onGuardarListaParo = async () => null,
  onRegistrarOlvidoTarjeta = async () => null,
  onActualizarEstado = async () => null,
  onGuardarCambioHorario = async () => null,
  onGuardarLicencia = async () => null,
  onGuardarCertificacion = async () => null,
  onEditarLicencia = async () => null,
  onEliminarLicencia = async () => null,
  onEditarCertificacion = async () => null,
  onEliminarCertificacion = async () => null
}) {
  const [cancelandoId, setCancelandoId] = useState("");
  const [actualizandoId, setActualizandoId] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [accionAbierta, setAccionAbierta] = useState("");
  const [cambioHorarioEditando, setCambioHorarioEditando] = useState(null);
  const [registroLegacyEditando, setRegistroLegacyEditando] = useState(null);
  const [procesandoLegacyId, setProcesandoLegacyId] = useState("");
  const [reporteAbierto, setReporteAbierto] = useState(false);
  const [filtros, setFiltros] = useState({
    fecha: "",
    tipo: "",
    categoria: "",
    funcionario: ""
  });

  const legacy = useMemo(() => crearNovedadesLegacy({
    licencias,
    certificaciones,
    personal
  }), [certificaciones, licencias, personal]);
  const novedadesConsolidadas = useMemo(() => [...novedades, ...legacy], [legacy, novedades]);

  const lista = useMemo(() => filtrarNovedadesVisibles(filtrarNovedadesPorTurnoActivo(
    novedadesConsolidadas,
    turnoActivo
  ))
    .filter((novedad) => !filtros.fecha || (
      novedad.fechaDesde <= filtros.fecha && filtros.fecha <= novedad.fechaHasta
    ))
    .filter((novedad) => !filtros.tipo || novedad.tipo === filtros.tipo)
    .filter((novedad) => !filtros.categoria || novedad.categoria === filtros.categoria)
    .filter((novedad) => !filtros.funcionario ||
      novedad.personaNombre.toLocaleLowerCase("es").includes(
        filtros.funcionario.toLocaleLowerCase("es")
      ))
    .sort((a, b) => b.fechaDesde.localeCompare(a.fechaDesde)), [filtros, novedadesConsolidadas, turnoActivo]);
  const olvidosPendientes = useMemo(
    () => contarOlvidosTarjetaPendientes(novedades, turnoActivo),
    [novedades, turnoActivo]
  );

  const abrirAccion = (accion) => {
    setCambioHorarioEditando(null);
    setRegistroLegacyEditando(null);
    setAccionAbierta((actual) => actual === accion ? "" : accion);
  };

  const editarLegacy = (novedad) => {
    if (soloLectura) return;
    setCambioHorarioEditando(null);
    setRegistroLegacyEditando(novedad);
    setAccionAbierta(novedad.tipo);
  };

  const eliminarLegacy = async (novedad) => {
    if (soloLectura || procesandoLegacyId) return;
    const etiqueta = novedad.tipo === "licencia" ? "licencia" : "certificación";
    if (!window.confirm(`¿Eliminar la ${etiqueta} de ${novedad.personaNombre}?`)) return;
    setProcesandoLegacyId(novedad.id);
    setErrorAccion("");
    try {
      await (novedad.tipo === "licencia" ? onEliminarLicencia : onEliminarCertificacion)(novedad);
      if (registroLegacyEditando?.id === novedad.id) {
        setRegistroLegacyEditando(null);
        setAccionAbierta("");
      }
    } catch (error) {
      setErrorAccion(error?.message || `No fue posible eliminar la ${etiqueta}.`);
    } finally {
      setProcesandoLegacyId("");
    }
  };

  const cancelar = async (novedad) => {
    if (soloLectura || cancelandoId || novedad.soloLectura) return;
    const descripcion = novedad.tipo === "cambio_horario" ? "el Cambio de horario" : "la suspensión";
    if (!window.confirm(`¿Eliminar ${descripcion} de ${novedad.personaNombre}?`)) return;
    setCancelandoId(novedad.id);
    setErrorAccion("");
    try {
      await onCancelar(novedad.id);
    } catch (error) {
      setErrorAccion(error?.message || "No fue posible cancelar la novedad.");
    } finally {
      setCancelandoId("");
    }
  };

  const cambiarEstado = async (novedad, estado) => {
    if (soloLectura || actualizandoId || novedad.soloLectura) return;
    if (estado === ESTADOS_NOVEDAD_PERSONAL.CANCELADA && !window.confirm(`¿Eliminar el Olvido de tarjeta de ${novedad.personaNombre}?`)) return;
    setActualizandoId(novedad.id);
    setErrorAccion("");
    try {
      await onActualizarEstado(novedad.id, estado);
    } catch (error) {
      setErrorAccion(error?.message || "No fue posible actualizar el estado de la novedad.");
    } finally {
      setActualizandoId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Registro central de novedades administrativas y ausencias.
        </p>
        {!soloLectura && (
          <div className="flex flex-wrap gap-2">
            {[
              ["licencia", "Licencia", "border-blue-300 text-blue-800"],
              ["certificacion", "Certificación", "border-emerald-300 text-emerald-800"],
              ["suspension", "Suspensión", "border-red-300 text-red-800"],
              ["paro", "Lista de paro", "border-violet-300 text-violet-800"],
              ["cambio_horario", "Cambio de horario", "border-cyan-300 text-cyan-800"],
              ["olvido_tarjeta", "Olvido de tarjeta", "border-amber-300 text-amber-800"]
            ].map(([accion, etiqueta, color]) => (
              <button key={accion} type="button" onClick={() => abrirAccion(accion)} className={`min-h-11 rounded-lg border bg-white px-4 py-2 text-sm font-medium ${color}`}>
                {accionAbierta === accion ? "Cerrar" : etiqueta}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Licencias, Certificaciones, Suspensiones y Adhesiones a paro pueden afectar
        el Calendario. Olvido de tarjeta y Cambio de horario no bloquean disponibilidad.
      </p>
      <p className="text-sm font-medium text-slate-700">
        Turno: {TURNOS.find(([valor]) => valor === turnoActivo)?.[1] || turnoActivo}
      </p>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Olvidos de tarjeta pendientes: {olvidosPendientes}
      </p>

      <div className="flex justify-end">
        <button type="button" onClick={() => setReporteAbierto((abierto) => !abierto)} className="min-h-11 rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-800">
          {reporteAbierto ? "Cerrar reporte" : "Reporte"}
        </button>
      </div>

      {reporteAbierto && (
        <ReporteNovedades
          key={`${turnoActivo}:${mesActivo}`}
          novedades={novedadesConsolidadas}
          personal={personal}
          turnoActivo={turnoActivo}
          mesActivo={mesActivo}
        />
      )}

      {accionAbierta === "licencia" && !soloLectura && (
        <FormularioRangoPersona
          key={`licencia:${turnoActivo}:${fechaActiva}:${registroLegacyEditando?.id || "nueva"}`}
          titulo={registroLegacyEditando ? "Editar licencia" : "Agregar licencia"}
          personal={personal}
          fechaInicial={fechaActiva}
          registroInicial={registroLegacyEditando}
          soloLectura={soloLectura}
          crearRegistro={({ persona, desde, hasta }) => ({
            registro: crearLicenciaPersona(persona, desde, hasta),
            error: "No se pudo identificar a la persona seleccionada."
          })}
          onGuardar={(registro) => registroLegacyEditando
            ? onEditarLicencia(registroLegacyEditando, registro)
            : onGuardarLicencia(registro)}
          onCerrar={() => { setAccionAbierta(""); setRegistroLegacyEditando(null); }}
        />
      )}

      {accionAbierta === "certificacion" && !soloLectura && (
        <FormularioRangoPersona
          key={`certificacion:${turnoActivo}:${fechaActiva}:${registroLegacyEditando?.id || "nueva"}`}
          titulo={registroLegacyEditando ? "Editar certificación médica" : "Agregar certificación médica"}
          personal={personal}
          fechaInicial={fechaActiva}
          registroInicial={registroLegacyEditando}
          soloLectura={soloLectura}
          crearRegistro={({ persona, desde, hasta }) => ({
            registro: crearCertificacionPersona(persona, { desde, hasta }),
            error: "No se pudo identificar a la persona seleccionada."
          })}
          onGuardar={(registro) => registroLegacyEditando
            ? onEditarCertificacion(registroLegacyEditando, registro)
            : onGuardarCertificacion(registro)}
          onCerrar={() => { setAccionAbierta(""); setRegistroLegacyEditando(null); }}
        />
      )}

      {accionAbierta === "suspension" && !soloLectura && (
        <FormularioRangoPersona
          key={`suspension:${turnoActivo}:${fechaActiva}`}
          titulo="Agregar suspensión"
          personal={personal}
          fechaInicial={fechaActiva}
          soloLectura={soloLectura}
          permiteObservacion
          crearRegistro={({ persona, desde, hasta, observacion }) => {
            const resultado = crearNovedadPersonal({
              persona,
              tipo: "suspension",
              fechaDesde: desde,
              fechaHasta: hasta,
              turno: turnoActivo,
              observacion,
              afectaDisponibilidad: true,
              requiereSeguimiento: false,
              estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA
            });
            return { registro: resultado.novedad, error: resultado.error };
          }}
          onGuardar={onRegistrar}
          onCerrar={() => setAccionAbierta("")}
        />
      )}

      {accionAbierta === "paro" && (
        <ListaParo
          key={`${turnoActivo}:${mesActivo}:${fechaActiva}`}
          personal={personal}
          novedades={novedades}
          licencias={licencias}
          certificaciones={certificaciones}
          turnoActivo={turnoActivo}
          fechaInicial={fechaActiva}
          mesActivo={mesActivo}
          soloLectura={soloLectura}
          onGuardar={onGuardarListaParo}
        />
      )}

      {accionAbierta === "olvido_tarjeta" && !soloLectura && (
        <FormularioOlvidoTarjeta
          key={`${turnoActivo}:${mesActivo}:${fechaActiva}`}
          personal={personal}
          fechaInicial={fechaActiva}
          mesActivo={mesActivo}
          soloLectura={soloLectura}
          onGuardar={onRegistrarOlvidoTarjeta}
          onCerrar={() => setAccionAbierta("")}
        />
      )}

      {accionAbierta === "cambio_horario" && !soloLectura && (
        <FormularioCambioHorario
          key={`${turnoActivo}:${mesActivo}:${fechaActiva}:${cambioHorarioEditando?.id || "nuevo"}`}
          personal={personal}
          turnoActivo={turnoActivo}
          fechaInicial={fechaActiva}
          mesActivo={mesActivo}
          soloLectura={soloLectura}
          novedadInicial={cambioHorarioEditando}
          onGuardar={onGuardarCambioHorario}
          onCerrar={() => { setAccionAbierta(""); setCambioHorarioEditando(null); }}
        />
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input aria-label="Filtrar por fecha" type="date" value={filtros.fecha} onChange={(e) => setFiltros((actual) => ({ ...actual, fecha: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3" />
        <select aria-label="Filtrar por tipo" value={filtros.tipo} onChange={(e) => setFiltros((actual) => ({ ...actual, tipo: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3">
          <option value="">Todos los tipos</option>
          {OPCIONES_TIPO_NOVEDAD_OPERATIVAS.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
        </select>
        <select aria-label="Filtrar por categoría" value={filtros.categoria} onChange={(e) => setFiltros((actual) => ({ ...actual, categoria: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3">
          <option value="">Todas las categorías</option>
          <option value="enfermero">Enfermeros</option>
          <option value="licenciado">Licenciados</option>
        </select>
        <input aria-label="Filtrar por funcionario" type="search" placeholder="Funcionario" value={filtros.funcionario} onChange={(e) => setFiltros((actual) => ({ ...actual, funcionario: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3" />
      </div>

      {errorCarga && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{errorCarga}</span>
          <button type="button" onClick={onRecargar} className="font-medium underline">Reintentar</button>
        </div>
      )}
      {errorAccion && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{errorAccion}</p>}
      {cargando ? (
        <p className="text-sm text-slate-500">Cargando novedades…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No hay novedades para los filtros seleccionados.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map((novedad) => (
            <article key={`${novedad.origen || "central"}:${novedad.id}`} className={`rounded-xl border p-4 shadow-sm ${novedad.tipo === "olvido_tarjeta" && novedad.estado === "pendiente" ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{novedad.personaNombre}</h3>
                  <p className="text-sm font-medium text-blue-700">{obtenerEtiquetaTipoNovedad(novedad.tipo)}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{obtenerEtiquetaEstadoNovedad(novedad.estado)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {fechaCorta(novedad.fechaDesde)}{novedad.fechaHasta !== novedad.fechaDesde ? ` – ${fechaCorta(novedad.fechaHasta)}` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {[TURNOS.find(([valor]) => valor === novedad.turno)?.[1], novedad.categoria === "enfermero" ? "Enfermero" : novedad.categoria === "licenciado" ? "Licenciado" : ""].filter(Boolean).join(" · ") || "Sin turno/categoría específica"}
              </p>
              {novedad.observacion && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{novedad.observacion}</p>}
              {novedad.tipo === "certificacion" && novedad.datos?.creadaDesdeNoDisponibles && (
                <p className="mt-2 text-xs font-medium text-blue-700">Creada desde No disponibles</p>
              )}
              {novedad.tipo === "cambio_horario" && (
                <p className="mt-2 text-sm font-medium text-cyan-800">
                  Horario excepcional: {novedad.datos?.horaEntrada || "--:--"}–{novedad.datos?.horaSalida || "--:--"}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {novedad.afectaDisponibilidad && <span className="rounded bg-red-50 px-2 py-1 text-red-700">Afecta disponibilidad</span>}
                {novedad.requiereSeguimiento && <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">Requiere seguimiento</span>}
                {novedad.tipo === "olvido_tarjeta" && novedad.estado === "pendiente" && <span className="rounded bg-amber-200 px-2 py-1 font-semibold text-amber-950">Pendiente · Requiere acción</span>}
                {novedad.soloLectura && <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">Registro histórico vigente</span>}
              </div>
              {!soloLectura && ["licencia", "certificacion"].includes(novedad.tipo) && ["licencias_legacy", "certificaciones_legacy"].includes(novedad.origen) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => editarLegacy(novedad)} className="min-h-11 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700">
                    Editar {novedad.tipo === "licencia" ? "licencia" : "certificación"}
                  </button>
                  <button type="button" disabled={Boolean(procesandoLegacyId)} onClick={() => eliminarLegacy(novedad)} className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:text-slate-400">
                    {procesandoLegacyId === novedad.id ? "Eliminando…" : `Eliminar ${novedad.tipo === "licencia" ? "licencia" : "certificación"}`}
                  </button>
                </div>
              )}
              {!soloLectura && !novedad.soloLectura && novedad.tipo === "suspension" && novedad.estado === "activa" && (
                <button
                  type="button"
                  disabled={Boolean(cancelandoId)}
                  onClick={() => cancelar(novedad)}
                  className="mt-3 min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:text-slate-400"
                >
                  {cancelandoId === novedad.id ? "Eliminando…" : "Eliminar suspensión"}
                </button>
              )}
              {!soloLectura && !novedad.soloLectura && novedad.tipo === "olvido_tarjeta" && ["pendiente", "revisada"].includes(novedad.estado) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {novedad.estado === "pendiente" && (
                    <button type="button" disabled={Boolean(actualizandoId)} onClick={() => cambiarEstado(novedad, ESTADOS_NOVEDAD_PERSONAL.REVISADA)} className="min-h-11 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 disabled:text-slate-400">
                      Marcar revisada
                    </button>
                  )}
                  <button type="button" disabled={Boolean(actualizandoId)} onClick={() => cambiarEstado(novedad, ESTADOS_NOVEDAD_PERSONAL.RESUELTA)} className="min-h-11 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 disabled:text-slate-400">
                    Marcar resuelta
                  </button>
                  <button type="button" disabled={Boolean(actualizandoId)} onClick={() => cambiarEstado(novedad, ESTADOS_NOVEDAD_PERSONAL.CANCELADA)} className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:text-slate-400">
                    Eliminar olvido
                  </button>
                </div>
              )}
              {!soloLectura && !novedad.soloLectura && novedad.tipo === "cambio_horario" && novedad.estado === "activa" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setCambioHorarioEditando(novedad); setAccionAbierta("cambio_horario"); }} className="min-h-11 rounded-lg border border-cyan-200 px-3 py-2 text-sm font-medium text-cyan-800">Editar horario</button>
                  <button type="button" disabled={Boolean(cancelandoId)} onClick={() => cancelar(novedad)} className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:text-slate-400">{cancelandoId === novedad.id ? "Eliminando…" : "Eliminar cambio"}</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default Novedades;
