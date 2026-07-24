import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TURNOS } from "../../config/turnos.js";
import {
  cargarRevisionAnterior,
  cargarRevisionHistorial,
  compararRevisiones,
  listarHistorial
} from "../../services/historialEstadoTurnos.js";
import DetalleHistorial from "./DetalleHistorial.jsx";
import {
  ACCIONES_HISTORIAL,
  crearFiltrosConsultaHistorial,
  crearNombreSnapshotHistorial,
  crearSnapshotDescargable,
  formatearAccionHistorial,
  formatearAutorHistorial,
  formatearFechaHistorial,
  formatearSeccionHistorial,
  formatearTurnoHistorial,
  unirRegistrosHistorial
} from "./historialPresentacion.js";

const crearFiltrosIniciales = (turno, mes) => ({
  turno: turno || "",
  mes: mes || "",
  accion: "",
  usuarioId: "",
  fechaDesde: "",
  fechaHasta: ""
});

function HistorialCambios({ turnoInicial, mesInicial }) {
  const [filtros, setFiltros] = useState(() =>
    crearFiltrosIniciales(turnoInicial, mesInicial)
  );
  const [filtrosAplicados, setFiltrosAplicados] = useState(() =>
    crearFiltrosConsultaHistorial(crearFiltrosIniciales(turnoInicial, mesInicial))
  );
  const [items, setItems] = useState([]);
  const [siguienteCursor, setSiguienteCursor] = useState(null);
  const [estadoLista, setEstadoLista] = useState("cargando");
  const [errorLista, setErrorLista] = useState("");
  const [detalle, setDetalle] = useState({
    estado: "inactivo",
    id: null,
    revision: null,
    revisionAnterior: null,
    diferencias: null,
    error: ""
  });
  const solicitudListaRef = useRef(0);
  const solicitudDetalleRef = useRef(0);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      solicitudListaRef.current += 1;
      solicitudDetalleRef.current += 1;
    };
  }, []);

  const cargarPagina = useCallback(async ({
    reiniciar,
    consultaFiltros,
    cursor = null
  }) => {
    const solicitud = solicitudListaRef.current + 1;
    solicitudListaRef.current = solicitud;
    setEstadoLista(reiniciar ? "cargando" : "cargando_mas");
    setErrorLista("");
    if (reiniciar) {
      setItems([]);
      setSiguienteCursor(null);
    }
    try {
      const resultado = await listarHistorial({
        ...consultaFiltros,
        cursor: cursor || undefined
      });
      if (!montadoRef.current || solicitud !== solicitudListaRef.current) return;
      if (resultado.tipo === "sin_permiso") {
        setItems([]);
        setSiguienteCursor(null);
        setEstadoLista("sin_permiso");
        return;
      }
      if (resultado.tipo !== "ok") throw new Error("Resultado inválido");
      setItems((actuales) =>
        reiniciar
          ? unirRegistrosHistorial([], resultado.items)
          : unirRegistrosHistorial(actuales, resultado.items)
      );
      setSiguienteCursor(resultado.siguienteCursor);
      setEstadoLista("listo");
    } catch {
      if (!montadoRef.current || solicitud !== solicitudListaRef.current) return;
      setEstadoLista("error");
      setErrorLista("No se pudo cargar el historial. Intentá nuevamente.");
    }
  }, []);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      cargarPagina({ reiniciar: true, consultaFiltros: filtrosAplicados });
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [cargarPagina, filtrosAplicados]);

  const autoresDisponibles = useMemo(() => {
    const autores = new Map();
    items.forEach((item) => {
      if (item.usuarioId && item.usuarioSnapshot) {
        autores.set(item.usuarioId, item.usuarioSnapshot);
      }
    });
    return [...autores.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [items]);

  const actualizarFiltro = (campo, valor) =>
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }));

  const aplicarFiltros = () => {
    try {
      const consulta = crearFiltrosConsultaHistorial(filtros);
      solicitudListaRef.current += 1;
      solicitudDetalleRef.current += 1;
      setDetalle({
        estado: "inactivo",
        id: null,
        revision: null,
        revisionAnterior: null,
        diferencias: null,
        error: ""
      });
      setFiltrosAplicados(consulta);
    } catch {
      setErrorLista("Revisá las fechas seleccionadas.");
      setEstadoLista("error");
    }
  };

  const limpiarFiltros = () => {
    const vacios = crearFiltrosIniciales("", "");
    solicitudListaRef.current += 1;
    solicitudDetalleRef.current += 1;
    setFiltros(vacios);
    setDetalle({
      estado: "inactivo",
      id: null,
      revision: null,
      revisionAnterior: null,
      diferencias: null,
      error: ""
    });
    setFiltrosAplicados(crearFiltrosConsultaHistorial(vacios));
  };

  const abrirDetalle = useCallback(async (id) => {
    const solicitud = solicitudDetalleRef.current + 1;
    solicitudDetalleRef.current = solicitud;
    setDetalle({
      estado: "cargando",
      id,
      revision: null,
      revisionAnterior: null,
      diferencias: null,
      error: ""
    });
    try {
      const actual = await cargarRevisionHistorial(id);
      if (!montadoRef.current || solicitud !== solicitudDetalleRef.current) return;
      if (actual.tipo === "sin_permiso") {
        setDetalle((previo) => ({
          ...previo,
          estado: "error",
          error: "No tenés permiso para consultar el historial."
        }));
        return;
      }
      if (actual.tipo !== "ok") {
        setDetalle((previo) => ({
          ...previo,
          estado: "error",
          error: "La revisión seleccionada ya no está disponible."
        }));
        return;
      }

      const revision = actual.revision;
      const tieneAnterior =
        revision.revisionAnterior &&
        revision.revisionAnterior !== "0";
      let revisionAnterior = null;
      let diferencias = null;
      if (tieneAnterior) {
        const previa = await cargarRevisionAnterior({
          turno: revision.turno,
          mes: revision.mes,
          revision: revision.revisionAnterior
        });
        if (!montadoRef.current || solicitud !== solicitudDetalleRef.current) return;
        if (previa.tipo === "ok") {
          revisionAnterior = previa.revision;
          diferencias = compararRevisiones(revisionAnterior.data, revision.data);
        }
      }
      setDetalle({
        estado: "listo",
        id,
        revision,
        revisionAnterior,
        diferencias,
        error: ""
      });
    } catch {
      if (!montadoRef.current || solicitud !== solicitudDetalleRef.current) return;
      setDetalle((previo) => ({
        ...previo,
        estado: "error",
        error: "No se pudo cargar el detalle. Intentá nuevamente."
      }));
    }
  }, []);

  const cerrarDetalle = () => {
    solicitudDetalleRef.current += 1;
    setDetalle({
      estado: "inactivo",
      id: null,
      revision: null,
      revisionAnterior: null,
      diferencias: null,
      error: ""
    });
  };

  const descargarSnapshot = () => {
    if (!detalle.revision) return;
    const contenido = crearSnapshotDescargable(detalle.revision);
    const blob = new Blob([JSON.stringify(contenido, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = crearNombreSnapshotHistorial(detalle.revision);
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-bold text-slate-800">Historial de cambios</h3>
        <p className="mt-1 text-sm text-slate-600">
          Consulta de revisiones mensuales. Las cuentas pueden ser compartidas y no identifican necesariamente a la persona física.
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          Turno
          <select value={filtros.turno} onChange={(e) => actualizarFiltro("turno", e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value="">Todos</option>
            {Object.values(TURNOS).map((turno) => <option key={turno.id} value={turno.id}>{turno.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Mes
          <input type="month" value={filtros.mes} onChange={(e) => actualizarFiltro("mes", e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Acción
          <select value={filtros.accion} onChange={(e) => actualizarFiltro("accion", e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value="">Todas</option>
            {Object.entries(ACCIONES_HISTORIAL).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Cuenta
          <select value={filtros.usuarioId} onChange={(e) => actualizarFiltro("usuarioId", e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value="">Todas las cargadas</option>
            {autoresDisponibles.map((autor) => <option key={autor.id} value={autor.id}>{autor.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Desde
          <input type="date" value={filtros.fechaDesde} onChange={(e) => actualizarFiltro("fechaDesde", e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Hasta
          <input type="date" value={filtros.fechaHasta} onChange={(e) => actualizarFiltro("fechaHasta", e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button type="button" onClick={aplicarFiltros} disabled={estadoLista === "cargando"} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Aplicar filtros
          </button>
          <button type="button" onClick={limpiarFiltros} disabled={estadoLista === "cargando"} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
            Limpiar filtros
          </button>
        </div>
      </div>

      {estadoLista === "cargando" && (
        <p aria-live="polite" className="rounded-xl border border-slate-200 p-5 text-center text-slate-600">Cargando historial…</p>
      )}
      {estadoLista === "sin_permiso" && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">No tenés permiso para consultar el historial.</p>
      )}
      {estadoLista === "error" && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{errorLista || "No se pudo cargar el historial. Intentá nuevamente."}</p>
          <button type="button" onClick={() => cargarPagina({ reiniciar: true, consultaFiltros: filtrosAplicados })} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 font-medium">
            Reintentar
          </button>
        </div>
      )}
      {estadoLista === "listo" && items.length === 0 && (
        <p className="rounded-xl border border-slate-200 p-5 text-center text-slate-600">
          No hay cambios históricos para los filtros seleccionados.
        </p>
      )}

      {items.length > 0 && (
        <div className="grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">
                    {formatearAccionHistorial(item.accion)} · Revisión {item.revisionAnterior ?? "—"} → {item.revision}
                  </p>
                  <p className="text-sm text-slate-600">
                    {formatearFechaHistorial(item.createdAt)} · {formatearAutorHistorial(item)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatearTurnoHistorial(item.turno)} · {item.mes}
                    {item.rolSnapshot ? ` · ${item.rolSnapshot}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => abrirDetalle(item.id)} disabled={detalle.estado === "cargando"} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                  Ver detalles
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.seccionesCambiadas.slice(0, 4).map((seccion) => (
                  <span key={seccion} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {formatearSeccionHistorial(seccion)}
                  </span>
                ))}
                {item.seccionesCambiadas.length > 4 && (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    +{item.seccionesCambiadas.length - 4}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {siguienteCursor && (
        <button
          type="button"
          disabled={estadoLista === "cargando_mas"}
          onClick={() => cargarPagina({
            reiniciar: false,
            consultaFiltros: filtrosAplicados,
            cursor: siguienteCursor
          })}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 disabled:opacity-50"
        >
          {estadoLista === "cargando_mas" ? "Cargando…" : "Cargar más"}
        </button>
      )}

      <DetalleHistorial
        key={detalle.id || "sin-detalle"}
        estado={detalle.estado}
        error={detalle.error}
        revision={detalle.revision}
        revisionAnterior={detalle.revisionAnterior}
        diferencias={detalle.diferencias}
        onCerrar={cerrarDetalle}
        onReintentar={() => detalle.id && abrirDetalle(detalle.id)}
        onDescargar={descargarSnapshot}
      />
    </div>
  );
}

export default HistorialCambios;
