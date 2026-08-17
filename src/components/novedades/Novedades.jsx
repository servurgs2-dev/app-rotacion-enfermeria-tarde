import { useMemo, useState } from "react";
import {
  crearNovedadPersonal,
  crearNovedadesLegacy,
  contarOlvidosTarjetaPendientes,
  ESTADOS_NOVEDAD_PERSONAL,
  filtrarNovedadesPorTurnoActivo,
  obtenerConfiguracionTipoNovedad,
  obtenerEtiquetaEstadoNovedad,
  obtenerEtiquetaTipoNovedad,
  OPCIONES_TIPO_NOVEDAD
} from "../../utils/novedadesPersonal.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";
import FormularioOlvidoTarjeta from "./FormularioOlvidoTarjeta.jsx";
import ListaParo from "./ListaParo.jsx";

const TURNOS = [
  ["manana", "Mañana"],
  ["tarde", "Tarde"],
  ["vespertino", "Vespertino"],
  ["noche", "Noche"]
];

const fechaCorta = (fecha) => {
  const [anio, mes, dia] = String(fecha || "").split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : "Sin fecha";
};

const TIPOS_NO_DISPONIBLES_PARA_ALTA = new Set([
  "licencia",
  "certificacion",
  "adhesion_paro",
  "olvido_tarjeta"
]);
const OPCIONES_ALTA_NOVEDAD = OPCIONES_TIPO_NOVEDAD.filter(
  (opcion) => !TIPOS_NO_DISPONIBLES_PARA_ALTA.has(opcion.valor)
);

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
  onActualizarEstado = async () => null
}) {
  const [guardando, setGuardando] = useState(false);
  const [cancelandoId, setCancelandoId] = useState("");
  const [actualizandoId, setActualizandoId] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [errorFormulario, setErrorFormulario] = useState("");
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [listaParoAbierta, setListaParoAbierta] = useState(false);
  const [olvidoTarjetaAbierto, setOlvidoTarjetaAbierto] = useState(false);
  const [formulario, setFormulario] = useState({
    personaId: "",
    tipo: "suspension",
    fechaDesde: "",
    fechaHasta: "",
    observacion: "",
    afectaDisponibilidad: true,
    requiereSeguimiento: false,
    estado: ESTADOS_NOVEDAD_PERSONAL.ACTIVA
  });
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

  const lista = useMemo(() => filtrarNovedadesPorTurnoActivo(
    [...novedades, ...legacy],
    turnoActivo
  )
    .filter((novedad) => !filtros.fecha || (
      novedad.fechaDesde <= filtros.fecha && filtros.fecha <= novedad.fechaHasta
    ))
    .filter((novedad) => !filtros.tipo || novedad.tipo === filtros.tipo)
    .filter((novedad) => !filtros.categoria || novedad.categoria === filtros.categoria)
    .filter((novedad) => !filtros.funcionario ||
      novedad.personaNombre.toLocaleLowerCase("es").includes(
        filtros.funcionario.toLocaleLowerCase("es")
      ))
    .sort((a, b) => b.fechaDesde.localeCompare(a.fechaDesde)), [filtros, legacy, novedades, turnoActivo]);
  const olvidosPendientes = useMemo(
    () => contarOlvidosTarjetaPendientes(novedades, turnoActivo),
    [novedades, turnoActivo]
  );

  const actualizarFormulario = (campo, valor) => {
    setErrorFormulario("");
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  };

  const cambiarTipo = (tipo) => {
    const configuracion = obtenerConfiguracionTipoNovedad(tipo);
    setErrorFormulario("");
    setFormulario((actual) => ({
      ...actual,
      tipo,
      afectaDisponibilidad: Boolean(configuracion?.afectaDisponibilidad),
      estado: configuracion?.estado || ESTADOS_NOVEDAD_PERSONAL.PENDIENTE,
      requiereSeguimiento: tipo === "olvido_tarjeta" || tipo === "otra"
    }));
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    if (soloLectura || guardando) return;
    const persona = personal.find((actual) => actual.id === formulario.personaId);
    const esSuspension = formulario.tipo === "suspension";
    const resultado = crearNovedadPersonal({
      persona,
      tipo: formulario.tipo,
      fechaDesde: formulario.fechaDesde,
      fechaHasta: formulario.fechaHasta || formulario.fechaDesde,
      turno: turnoActivo,
      observacion: formulario.observacion,
      afectaDisponibilidad: esSuspension ? true : formulario.afectaDisponibilidad,
      requiereSeguimiento: esSuspension ? false : formulario.requiereSeguimiento,
      estado: esSuspension ? ESTADOS_NOVEDAD_PERSONAL.ACTIVA : formulario.estado
    });
    if (resultado.error) {
      setErrorFormulario(resultado.error);
      return;
    }
    setGuardando(true);
    try {
      await onRegistrar(resultado.novedad);
      setFormulario((actual) => ({
        ...actual,
        personaId: "",
        fechaDesde: "",
        fechaHasta: "",
        observacion: ""
      }));
      setFormularioAbierto(false);
    } catch (error) {
      setErrorFormulario(error?.message || "No fue posible guardar la novedad.");
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = async (novedad) => {
    if (soloLectura || cancelandoId || novedad.soloLectura) return;
    if (!window.confirm(`¿Cancelar la suspensión activa de ${novedad.personaNombre}?`)) return;
    setCancelandoId(novedad.id);
    setErrorAccion("");
    try {
      await onCancelar(novedad.id);
    } catch (error) {
      setErrorAccion(error?.message || "No fue posible cancelar la suspensión.");
    } finally {
      setCancelandoId("");
    }
  };

  const cambiarEstado = async (novedad, estado) => {
    if (soloLectura || actualizandoId || novedad.soloLectura) return;
    if (estado === ESTADOS_NOVEDAD_PERSONAL.CANCELADA && !window.confirm(`¿Cancelar el Olvido de tarjeta de ${novedad.personaNombre}?`)) return;
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setListaParoAbierta((actual) => !actual)}
            className="min-h-11 rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-800"
          >
            {listaParoAbierta ? "Cerrar lista de paro" : "Lista de paro"}
          </button>
          {!soloLectura && (
            <button
              type="button"
              onClick={() => setOlvidoTarjetaAbierto((actual) => !actual)}
              className="min-h-11 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800"
            >
              {olvidoTarjetaAbierto ? "Cerrar Olvido de tarjeta" : "Olvido de tarjeta"}
            </button>
          )}
        {!soloLectura && (
          <button
            type="button"
            onClick={() => setFormularioAbierto((actual) => !actual)}
            className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            {formularioAbierto ? "Cancelar" : "Agregar novedad"}
          </button>
        )}
        </div>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Las Suspensiones y Adhesiones a paro activas afectan el Calendario. Las
        Licencias y Certificaciones continúan gestionándose exclusivamente en sus
        secciones y se muestran aquí sin duplicarlas.
      </p>
      <p className="text-sm font-medium text-slate-700">
        Turno: {TURNOS.find(([valor]) => valor === turnoActivo)?.[1] || turnoActivo}
      </p>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Olvidos de tarjeta pendientes: {olvidosPendientes}
      </p>

      {listaParoAbierta && (
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

      {olvidoTarjetaAbierto && !soloLectura && (
        <FormularioOlvidoTarjeta
          key={`${turnoActivo}:${mesActivo}:${fechaActiva}`}
          personal={personal}
          fechaInicial={fechaActiva}
          mesActivo={mesActivo}
          soloLectura={soloLectura}
          onGuardar={onRegistrarOlvidoTarjeta}
          onCerrar={() => setOlvidoTarjetaAbierto(false)}
        />
      )}

      {formularioAbierto && (
        <form onSubmit={guardar} className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Funcionario
            <select value={formulario.personaId} onChange={(e) => actualizarFormulario("personaId", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
              <option value="">Seleccionar…</option>
              {personal.map((persona) => (
                <option key={persona.id} value={persona.id}>{obtenerEtiquetaPersona(persona)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Tipo
            <select value={formulario.tipo} onChange={(e) => cambiarTipo(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
              {OPCIONES_ALTA_NOVEDAD.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Desde
            <input type="date" value={formulario.fechaDesde} onChange={(e) => actualizarFormulario("fechaDesde", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Hasta
            <input type="date" value={formulario.fechaHasta} min={formulario.fechaDesde || undefined} onChange={(e) => actualizarFormulario("fechaHasta", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" />
          </label>
          {formulario.tipo !== "suspension" && (
            <>
              <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <input type="checkbox" checked={formulario.afectaDisponibilidad} onChange={(e) => actualizarFormulario("afectaDisponibilidad", e.target.checked)} />
                Afecta disponibilidad
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <input type="checkbox" checked={formulario.requiereSeguimiento} onChange={(e) => actualizarFormulario("requiereSeguimiento", e.target.checked)} />
                Requiere seguimiento
              </label>
            </>
          )}
          <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            Observación
            <textarea value={formulario.observacion} onChange={(e) => actualizarFormulario("observacion", e.target.value)} rows="2" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          {errorFormulario && <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{errorFormulario}</p>}
          <button type="submit" disabled={guardando} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300">
            {guardando ? "Guardando…" : "Guardar novedad"}
          </button>
        </form>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input aria-label="Filtrar por fecha" type="date" value={filtros.fecha} onChange={(e) => setFiltros((actual) => ({ ...actual, fecha: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3" />
        <select aria-label="Filtrar por tipo" value={filtros.tipo} onChange={(e) => setFiltros((actual) => ({ ...actual, tipo: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3">
          <option value="">Todos los tipos</option>
          {OPCIONES_TIPO_NOVEDAD.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
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
            <article key={`${novedad.origen || "central"}:${novedad.id}`} className={`rounded-xl border p-4 shadow-sm ${novedad.estado === "cancelada" ? "border-slate-200 bg-slate-50 opacity-75" : novedad.tipo === "olvido_tarjeta" && novedad.estado === "pendiente" ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
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
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {novedad.afectaDisponibilidad && <span className="rounded bg-red-50 px-2 py-1 text-red-700">Afecta disponibilidad</span>}
                {novedad.requiereSeguimiento && <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">Requiere seguimiento</span>}
                {novedad.tipo === "olvido_tarjeta" && novedad.estado === "pendiente" && <span className="rounded bg-amber-200 px-2 py-1 font-semibold text-amber-950">Pendiente · Requiere acción</span>}
                {novedad.soloLectura && <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">Registro histórico vigente</span>}
              </div>
              {!soloLectura && !novedad.soloLectura && novedad.tipo === "suspension" && novedad.estado === "activa" && (
                <button
                  type="button"
                  disabled={Boolean(cancelandoId)}
                  onClick={() => cancelar(novedad)}
                  className="mt-3 min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:text-slate-400"
                >
                  {cancelandoId === novedad.id ? "Cancelando…" : "Cancelar suspensión"}
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
                    Cancelar registro
                  </button>
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
