import { useState } from "react";
import { TURNOS } from "../../config/turnos.js";

const LIMITE_INICIAL = 5;
const FILTROS = Object.freeze([
  ["todas", "Todas"],
  ["atencion", "Atención"],
  ["error", "Errores"]
]);
const CATEGORIAS = Object.freeze({
  licenciado: "Licenciados",
  enfermero: "Enfermeros"
});
const SEVERIDADES = Object.freeze({
  error: { etiqueta: "Error", clases: "border-red-200 bg-red-50 text-red-900" },
  atencion: { etiqueta: "Atención", clases: "border-amber-200 bg-amber-50 text-amber-950" },
  informacion: { etiqueta: "Información", clases: "border-blue-200 bg-blue-50 text-blue-900" }
});
const ACCIONES = Object.freeze({
  revisar_extra: "Revisar el Extra registrado",
  revisar_identidad: "Revisar la identificación de la persona",
  revisar_registro: "Revisar el registro relacionado",
  preparar_planilla: "Revisar la preparación de la Planilla",
  reintentar_carga: "Volver a intentar la carga de los datos",
  revisar_configuracion: "Revisar la configuración de dotación",
  sin_accion: "Sin acción disponible desde esta pantalla"
});

const fechaBreve = (fecha) => {
  const partes = typeof fecha === "string" ? fecha.split("-") : [];
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : null;
};

const contextoAlerta = (alerta) => {
  const contexto = [];
  const fecha = fechaBreve(alerta.fecha);
  if (fecha) contexto.push(fecha);
  else contexto.push(alerta.alcance === "mensual" || alerta.alcance === "periodo" ? "Mes completo" : "General");
  if (alerta.turno && TURNOS[alerta.turno]) contexto.push(TURNOS[alerta.turno].nombre);
  if (alerta.categoria && CATEGORIAS[alerta.categoria]) contexto.push(CATEGORIAS[alerta.categoria]);
  return contexto.join(" · ");
};

function TarjetaAlertaCalidad({ alerta, abierta, onAlternar }) {
  const severidad = SEVERIDADES[alerta.severidad] || SEVERIDADES.informacion;
  const detalleId = `detalle-calidad-${alerta.id}`;
  const turnoOrigen = alerta.turnoOrigen && TURNOS[alerta.turnoOrigen]?.nombre;
  const accion = ACCIONES[alerta.accion];
  const causas = Array.isArray(alerta.causas)
    ? alerta.causas.filter((causa) => typeof causa === "string" && causa.trim())
    : [];

  return (
    <article className={`min-w-0 rounded-xl border p-3 ${severidad.clases}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs font-bold opacity-80">{contextoAlerta(alerta)}</p>
          <h4 className="mt-1 break-words text-sm font-extrabold">{alerta.titulo}</h4>
          <span className="mt-1 inline-block text-xs font-bold">{severidad.etiqueta}</span>
        </div>
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={detalleId}
          onClick={onAlternar}
          className="min-h-11 shrink-0 rounded-lg border border-current/30 bg-white/70 px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30"
        >
          {abierta ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>

      {abierta && (
        <div id={detalleId} className="mt-3 space-y-2 border-t border-current/20 pt-3 text-xs">
          {alerta.detalle && <p className="break-words">{alerta.detalle}</p>}
          {accion && <p><strong>Acción sugerida:</strong> {accion}</p>}
          {turnoOrigen && <p><strong>Origen:</strong> {turnoOrigen}</p>}
          {Number.isFinite(alerta.cantidad) && <p><strong>Registros involucrados:</strong> {alerta.cantidad}</p>}
          {alerta.clavePeriodo && <p className="break-words"><strong>Período:</strong> {alerta.clavePeriodo}</p>}
          {causas.length > 0 && <p className="break-words"><strong>Causas registradas:</strong> {causas.join(" · ")}</p>}
          {alerta.codigo != null && <p className="break-all opacity-70"><strong>Código técnico:</strong> {alerta.codigo}</p>}
        </div>
      )}
    </article>
  );
}

function CalidadDatosSupervision({ resultado }) {
  const [filtro, setFiltro] = useState("todas");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [alertaAbierta, setAlertaAbierta] = useState(null);
  const alertas = Array.isArray(resultado?.alertas) ? resultado.alertas : [];
  const filtradas = filtro === "todas"
    ? alertas
    : alertas.filter((alerta) => alerta.severidad === filtro);
  const visibles = mostrarTodas ? filtradas : filtradas.slice(0, LIMITE_INICIAL);
  const cantidadesFiltro = {
    todas: alertas.length,
    atencion: alertas.filter((alerta) => alerta.severidad === "atencion").length,
    error: alertas.filter((alerta) => alerta.severidad === "error").length
  };
  const idAbierto = alertas.some((alerta) => alerta.id === alertaAbierta) ? alertaAbierta : null;

  const cambiarFiltro = (nuevoFiltro) => {
    setFiltro(nuevoFiltro);
    setMostrarTodas(false);
    setAlertaAbierta(null);
  };

  return (
    <section aria-labelledby="titulo-calidad-datos" className="mt-6 min-w-0 border-t border-slate-200 pt-5">
      <div>
        <h2 id="titulo-calidad-datos" className="text-lg font-extrabold text-slate-900">Calidad de datos</h2>
        <p className="mt-1 break-words text-sm text-slate-600">Situaciones del mes que conviene revisar</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-lg bg-slate-100 p-2 text-center">
          <span className="block break-words text-[11px] font-bold text-slate-600">Alertas</span>
          <strong className="block text-lg tabular-nums text-slate-900">{resultado?.resumen?.alertasPresentadas ?? 0}</strong>
        </div>
        <div className="min-w-0 rounded-lg bg-slate-100 p-2 text-center">
          <span className="block break-words text-[11px] font-bold text-slate-600">Días afectados</span>
          <strong className="block text-lg tabular-nums text-slate-900">{resultado?.resumen?.diasAfectados ?? 0}</strong>
        </div>
        <div className="min-w-0 rounded-lg bg-red-50 p-2 text-center">
          <span className="block break-words text-[11px] font-bold text-red-700">Errores</span>
          <strong className="block text-lg tabular-nums text-red-900">{resultado?.resumen?.erroresPresentados ?? 0}</strong>
        </div>
      </div>

      {alertas.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">No hay alertas de calidad para este mes.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar alertas de calidad">
            {FILTROS.map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={filtro === valor}
                onClick={() => cambiarFiltro(valor)}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 ${filtro === valor ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}
              >
                {etiqueta} <span className="tabular-nums">{cantidadesFiltro[valor]}</span>
              </button>
            ))}
          </div>

          {filtradas.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">No hay alertas en este filtro.</p>
          ) : (
            <div className="mt-4 grid min-w-0 gap-3">
              {visibles.map((alerta) => (
                <TarjetaAlertaCalidad
                  key={alerta.id}
                  alerta={alerta}
                  abierta={idAbierto === alerta.id}
                  onAlternar={() => setAlertaAbierta((actual) => actual === alerta.id ? null : alerta.id)}
                />
              ))}
              {filtradas.length > LIMITE_INICIAL && (
                <button
                  type="button"
                  onClick={() => {
                    setMostrarTodas((actual) => !actual);
                    setAlertaAbierta(null);
                  }}
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30"
                >
                  {mostrarTodas ? "Ver menos" : `Ver todas (${filtradas.length})`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-xs text-slate-500">Basado en los datos actuales del mes.</p>
    </section>
  );
}

export default CalidadDatosSupervision;
