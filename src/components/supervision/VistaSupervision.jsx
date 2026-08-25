import { useMemo, useState } from "react";
import { TURNOS } from "../../config/turnos.js";
import { useConfiguracionDotacionSupervision } from "../../hooks/useConfiguracionDotacionSupervision.js";
import { useDatosSupervisionMes } from "../../hooks/useDatosSupervisionMes.js";
import {
  proyectarSupervisionDia,
  TURNOS_AGREGADO_SUPERVISION
} from "../../utils/agregadoSupervisionDia.js";
import { keyDiaFromDate, parsearFechaLocal } from "../../utils/fechas.js";
import DetalleCategoriaSupervision from "./DetalleCategoriaSupervision.jsx";
import DotacionMensualSupervision from "./DotacionMensualSupervision.jsx";
import EditorConfiguracionDotacionSupervision from "./EditorConfiguracionDotacionSupervision.jsx";
import NovedadesSupervisionDia from "./NovedadesSupervisionDia.jsx";

const CATEGORIAS = Object.freeze([
  ["licenciado", "Licenciados"],
  ["enfermero", "Enfermeros"]
]);

const PRESENTACION_ESTADO = Object.freeze({
  critico: {
    etiqueta: "Cr\u00edtico",
    clases: "border-red-200 bg-red-50 text-red-900",
    insignia: "bg-red-100 text-red-800"
  },
  bajo_optimo: {
    etiqueta: "Bajo \u00f3ptimo",
    clases: "border-amber-200 bg-amber-50 text-amber-950",
    insignia: "bg-amber-100 text-amber-900"
  },
  optimo: {
    etiqueta: "\u00d3ptimo",
    clases: "border-emerald-200 bg-emerald-50 text-emerald-950",
    insignia: "bg-emerald-100 text-emerald-900"
  },
  sin_datos: {
    etiqueta: "Sin datos",
    clases: "border-slate-200 bg-slate-50 text-slate-800",
    insignia: "bg-slate-200 text-slate-700"
  }
});

const RESUMEN = Object.freeze([
  ["criticos", "Cr\u00edticos", "text-red-700"],
  ["bajoOptimo", "Bajo \u00f3ptimo", "text-amber-700"],
  ["optimos", "\u00d3ptimos", "text-emerald-700"],
  ["sinDatos", "Sin datos", "text-slate-600"]
]);

const obtenerMesFecha = (fecha) => String(fecha || "").slice(0, 7);

function CategoriaDotacion({ titulo, datos, detalleId, abierto, onAlternar }) {
  const estado = datos?.estadoDotacion?.estado || "sin_datos";
  const presentacion = PRESENTACION_ESTADO[estado] || PRESENTACION_ESTADO.sin_datos;
  const cantidad = datos?.proyeccion?.dotacionPrevistaOperativa?.cantidad;
  const disponible = datos?.disponible === true && Number.isInteger(cantidad);

  return (
    <section className={`rounded-xl border p-3 ${presentacion.clases}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold">{titulo}</h3>
          <p className="mt-1 text-xl font-extrabold">
            {disponible ? `${cantidad} previstos` : "Sin datos"}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${presentacion.insignia}`}>
          {presentacion.etiqueta}
        </span>
      </div>
      {disponible && (
        <p className="mt-2 text-xs font-semibold opacity-80">
          M&iacute;n. {datos.umbral.minimo} &middot; &Oacute;pt. {datos.umbral.optimo}
        </p>
      )}
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={detalleId}
        onClick={onAlternar}
        className="mt-3 min-h-11 w-full rounded-lg border border-current/20 bg-white/70 px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
      >
        {abierto ? "Ocultar detalle" : "Ver detalle"}
      </button>
      {abierto && (
        <DetalleCategoriaSupervision
          id={detalleId}
          disponible={disponible}
          proyeccion={datos?.proyeccion}
        />
      )}
    </section>
  );
}

function TarjetaTurno({ turnoId, datos, detalleAbierto, onAlternarDetalle }) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-extrabold text-slate-900">{TURNOS[turnoId]?.nombre || turnoId}</h2>
      <div className="mt-3 grid gap-3">
        {CATEGORIAS.map(([categoria, titulo]) => {
          const claveDetalle = `${turnoId}-${categoria}`;
          const detalleId = `detalle-supervision-${claveDetalle}`;
          return (
            <CategoriaDotacion
              key={categoria}
              titulo={titulo}
              datos={datos?.[categoria]}
              detalleId={detalleId}
              abierto={detalleAbierto === claveDetalle}
              onAlternar={() => onAlternarDetalle(claveDetalle)}
            />
          );
        })}
      </div>
    </article>
  );
}

function VistaSupervision({
  turnoActivo = null,
  mesActivo = "",
  estadoActivo = null,
  onVolver,
  controlSesion = null
}) {
  const [fecha, setFecha] = useState(() => keyDiaFromDate(new Date()));
  const [detalleAbierto, setDetalleAbierto] = useState(null);
  const mes = obtenerMesFecha(fecha);
  const datos = useDatosSupervisionMes({
    mes,
    habilitado: true,
    turnoActivo,
    mesActivo,
    estadoActivo
  });
  const configuracionMes = useConfiguracionDotacionSupervision(mes);
  const resultado = useMemo(() => proyectarSupervisionDia({
    estadosPorTurno: datos.estadosPorTurno,
    novedadesModernas: datos.novedadesModernas,
    fecha,
    mes,
    configuracionDotacion: configuracionMes.configuracion
  }), [datos.estadosPorTurno, datos.novedadesModernas, fecha, mes, configuracionMes.configuracion]);
  const cargandoPanel = datos.cargando || configuracionMes.cargaInicial;
  const errorTotal = Boolean(datos.errores?.estados) && !resultado.disponible;
  const erroresParciales = [datos.errores?.estados, datos.errores?.novedades]
    .filter(Boolean);
  const cambiarFecha = (nuevaFecha) => {
    setDetalleAbierto(null);
    setFecha(nuevaFecha);
  };
  const moverDia = (dias) => {
    const siguiente = parsearFechaLocal(fecha);
    siguiente.setDate(siguiente.getDate() + dias);
    cambiarFecha(keyDiaFromDate(siguiente));
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 px-3 py-3 sm:px-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onVolver}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
          >
            &larr; Volver
          </button>
          {controlSesion}
        </div>

        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm font-bold uppercase tracking-wide text-indigo-600">Supervisi&oacute;n</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Resumen diario del servicio
          </h1>
          <p className="mt-2 text-sm text-slate-600">Dotaci&oacute;n prevista de todos los turnos.</p>
          <div className="mt-4 grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2" aria-label={"Fecha de Supervisi\u00f3n"}>
            <button type="button" aria-label={"D\u00eda anterior"} onClick={() => moverDia(-1)} className="min-h-11 rounded-lg border border-slate-300 bg-white text-xl font-bold text-slate-700">&lsaquo;</button>
            <input
              type="date"
              aria-label={"Seleccionar fecha de Supervisi\u00f3n"}
              value={fecha}
              onChange={(evento) => evento.target.value && cambiarFecha(evento.target.value)}
              className="min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800"
            />
            <button type="button" aria-label={"D\u00eda siguiente"} onClick={() => moverDia(1)} className="min-h-11 rounded-lg border border-slate-300 bg-white text-xl font-bold text-slate-700">&rsaquo;</button>
          </div>
        </header>

        {cargandoPanel ? (
          <section role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm font-medium text-slate-600 shadow-sm">
            Cargando informaci&oacute;n de Supervisi&oacute;n&hellip;
          </section>
        ) : errorTotal ? (
          <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm">
            <p className="font-bold">No se pudo cargar la informaci&oacute;n de Supervisi&oacute;n.</p>
            <button type="button" onClick={datos.recargar} className="mt-3 min-h-11 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-800">
              Reintentar
            </button>
          </section>
        ) : (
          <>
            <EditorConfiguracionDotacionSupervision
              key={configuracionMes.mes}
              configuracionMes={configuracionMes}
            />
            {erroresParciales.length > 0 && (
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Parte de la informaci&oacute;n no pudo cargarse. Se muestran los datos disponibles.
              </p>
            )}
            <section aria-label={"Resumen general de dotaci\u00f3n"} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RESUMEN.map(([clave, etiqueta, color]) => (
                <div key={clave} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <strong className={`block text-2xl font-extrabold ${color}`}>{resultado.resumen[clave]}</strong>
                  <span className="mt-1 block text-xs font-semibold text-slate-600">{etiqueta}</span>
                </div>
              ))}
            </section>
            <section aria-label={"Dotaci\u00f3n por turno"} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {TURNOS_AGREGADO_SUPERVISION.map((turnoId) => (
                <TarjetaTurno
                  key={turnoId}
                  turnoId={turnoId}
                  datos={resultado.turnos[turnoId]}
                  detalleAbierto={detalleAbierto}
                  onAlternarDetalle={(clave) => setDetalleAbierto((actual) => actual === clave ? null : clave)}
                />
              ))}
            </section>
            <NovedadesSupervisionDia
              key={fecha}
              fecha={fecha}
              estadosPorTurno={datos.estadosPorTurno}
              novedadesModernas={datos.novedadesModernas}
              erroresCarga={datos.errores}
              cargando={cargandoPanel}
              errorModernas={datos.errores?.novedades}
            />
            <DotacionMensualSupervision
              mes={mes}
              fechaSeleccionada={fecha}
              estadosPorTurno={datos.estadosPorTurno}
              novedadesModernas={datos.novedadesModernas}
              configuracionDotacion={configuracionMes.configuracion}
              erroresCarga={datos.errores}
              cargando={cargandoPanel}
              errorTotal={errorTotal}
            />
          </>
        )}
      </div>
    </main>
  );
}

export default VistaSupervision;
