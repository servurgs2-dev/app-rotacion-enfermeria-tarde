import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crearNovedadPersonal,
  crearNovedadesLegacy,
  ESTADOS_NOVEDAD_PERSONAL,
  obtenerConfiguracionTipoNovedad,
  obtenerEtiquetaEstadoNovedad,
  obtenerEtiquetaTipoNovedad,
  OPCIONES_ESTADO_NOVEDAD,
  OPCIONES_TIPO_NOVEDAD
} from "../../utils/novedadesPersonal.js";
import {
  listarNovedadesPersonal,
  registrarNovedadPersonal
} from "../../services/novedadesPersonal.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";

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

const rangoMes = (mes) => {
  const [anio, numeroMes] = String(mes || "").split("-").map(Number);
  if (!anio || !numeroMes) return { fechaDesde: "", fechaHasta: "" };
  const ultimoDia = new Date(anio, numeroMes, 0).getDate();
  return {
    fechaDesde: `${anio}-${String(numeroMes).padStart(2, "0")}-01`,
    fechaHasta: `${anio}-${String(numeroMes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`
  };
};

function Novedades({
  personal = [],
  licencias = [],
  certificaciones = [],
  mesActivo,
  turnoActivo,
  soloLectura = false
}) {
  const [novedades, setNovedades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [errorFormulario, setErrorFormulario] = useState("");
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [formulario, setFormulario] = useState({
    personaId: "",
    tipo: "otra",
    fechaDesde: "",
    fechaHasta: "",
    observacion: "",
    afectaDisponibilidad: false,
    requiereSeguimiento: true,
    estado: ESTADOS_NOVEDAD_PERSONAL.PENDIENTE
  });
  const [filtros, setFiltros] = useState({
    fecha: "",
    tipo: "",
    turno: "",
    categoria: "",
    funcionario: ""
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const resultado = await listarNovedadesPersonal(rangoMes(mesActivo));
      setNovedades(resultado);
    } catch (error) {
      setNovedades([]);
      setErrorCarga(error?.message || "No fue posible cargar las novedades.");
    } finally {
      setCargando(false);
    }
  }, [mesActivo]);

  useEffect(() => {
    let vigente = true;
    const ejecutar = async () => {
      setCargando(true);
      setErrorCarga("");
      try {
        const resultado = await listarNovedadesPersonal(rangoMes(mesActivo));
        if (vigente) setNovedades(resultado);
      } catch (error) {
        if (vigente) {
          setNovedades([]);
          setErrorCarga(error?.message || "No fue posible cargar las novedades.");
        }
      } finally {
        if (vigente) setCargando(false);
      }
    };
    ejecutar();
    return () => { vigente = false; };
  }, [mesActivo]);

  const legacy = useMemo(() => crearNovedadesLegacy({
    licencias,
    certificaciones,
    personal
  }), [certificaciones, licencias, personal]);

  const lista = useMemo(() => [...novedades, ...legacy]
    .filter((novedad) => !filtros.fecha || (
      novedad.fechaDesde <= filtros.fecha && filtros.fecha <= novedad.fechaHasta
    ))
    .filter((novedad) => !filtros.tipo || novedad.tipo === filtros.tipo)
    .filter((novedad) => !filtros.turno || novedad.turno === filtros.turno)
    .filter((novedad) => !filtros.categoria || novedad.categoria === filtros.categoria)
    .filter((novedad) => !filtros.funcionario ||
      novedad.personaNombre.toLocaleLowerCase("es").includes(
        filtros.funcionario.toLocaleLowerCase("es")
      ))
    .sort((a, b) => b.fechaDesde.localeCompare(a.fechaDesde)), [filtros, legacy, novedades]);

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
    const resultado = crearNovedadPersonal({
      persona,
      tipo: formulario.tipo,
      fechaDesde: formulario.fechaDesde,
      fechaHasta: formulario.fechaHasta || formulario.fechaDesde,
      turno: turnoActivo,
      observacion: formulario.observacion,
      afectaDisponibilidad: formulario.afectaDisponibilidad,
      requiereSeguimiento: formulario.requiereSeguimiento,
      estado: formulario.estado
    });
    if (resultado.error) {
      setErrorFormulario(resultado.error);
      return;
    }
    setGuardando(true);
    try {
      const creada = await registrarNovedadPersonal(resultado.novedad);
      setNovedades((actuales) => [creada, ...actuales]);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Registro central de novedades administrativas y ausencias.
        </p>
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

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        En esta primera etapa, las Licencias y Certificaciones existentes siguen
        gestionándose en sus secciones y son las que afectan el Calendario. Las
        nuevas novedades quedan registradas para su integración operativa progresiva.
      </p>

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
              {OPCIONES_TIPO_NOVEDAD.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Estado
            <select value={formulario.estado} onChange={(e) => actualizarFormulario("estado", e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
              {OPCIONES_ESTADO_NOVEDAD.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
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
          <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
            <input type="checkbox" checked={formulario.afectaDisponibilidad} onChange={(e) => actualizarFormulario("afectaDisponibilidad", e.target.checked)} />
            Afecta disponibilidad
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
            <input type="checkbox" checked={formulario.requiereSeguimiento} onChange={(e) => actualizarFormulario("requiereSeguimiento", e.target.checked)} />
            Requiere seguimiento
          </label>
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

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input aria-label="Filtrar por fecha" type="date" value={filtros.fecha} onChange={(e) => setFiltros((actual) => ({ ...actual, fecha: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3" />
        <select aria-label="Filtrar por tipo" value={filtros.tipo} onChange={(e) => setFiltros((actual) => ({ ...actual, tipo: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3">
          <option value="">Todos los tipos</option>
          {OPCIONES_TIPO_NOVEDAD.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
        </select>
        <select aria-label="Filtrar por turno" value={filtros.turno} onChange={(e) => setFiltros((actual) => ({ ...actual, turno: e.target.value }))} className="min-h-11 rounded-lg border border-slate-300 px-3">
          <option value="">Todos los turnos</option>
          {TURNOS.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
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
          <button type="button" onClick={cargar} className="font-medium underline">Reintentar</button>
        </div>
      )}
      {cargando ? (
        <p className="text-sm text-slate-500">Cargando novedades…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No hay novedades para los filtros seleccionados.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map((novedad) => (
            <article key={`${novedad.origen || "central"}:${novedad.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                {novedad.soloLectura && <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">Registro histórico vigente</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default Novedades;
