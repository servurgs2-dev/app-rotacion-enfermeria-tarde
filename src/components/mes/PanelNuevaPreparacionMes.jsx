import ModalMobileShell from "../ui/ModalMobileShell.jsx";
import ConfiguracionPlanilla from "../configuracion/ConfiguracionPlanilla.jsx";
import AsignacionesFijasMes from "./AsignacionesFijasMes.jsx";
import PrioridadCoberturaMes from "./PrioridadCoberturaMes.jsx";

const CATEGORIAS = ["enfermero", "licenciado"];
const fechaCorta = (fecha) => fecha
  ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
  : "";

export default function PanelNuevaPreparacionMes({
  flujo,
  fechaMinima,
  fechaMaxima,
  personal,
  onCambiarFecha,
  onContinuar,
  onActualizarConfiguracion,
  onCancelar,
  onConfirmar
}) {
  const esBorrador = flujo?.estado === "borrador" || flujo?.estado === "guardando";
  const categorias = flujo?.categoriasBorrador;
  const borradores = categorias
    ? {
        enfermero: categorias.enfermero.configuracion,
        licenciado: categorias.licenciado.configuracion
      }
    : null;

  return (
    <ModalMobileShell
      ariaLabelledby="titulo-nueva-preparacion"
      backdropClassName="bg-slate-900/50"
      maxWidthClassName="max-w-4xl"
      panelClassName="px-5 pt-5 sm:px-5 sm:pt-5 sm:pb-5"
    >
      <h3 id="titulo-nueva-preparacion" className="text-xl font-bold text-slate-900">
        Nueva preparación
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        Podés crear una nueva organización desde una fecha sin modificar los días anteriores.
      </p>

      {!esBorrador ? (
        <section className="mt-5 rounded-xl border border-slate-200 p-4">
          <label className="block text-sm font-medium text-slate-800">
            Vigencia desde
            <input
              type="date"
              min={fechaMinima}
              max={fechaMaxima}
              value={flujo?.desde || ""}
              onChange={(evento) => onCambiarFecha(evento.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {flujo?.error && <p role="alert" className="mt-3 text-sm text-rose-700">{flujo.error}</p>}
          {flujo?.detalleActividad && (
            <p className="mt-1 text-sm text-rose-700">Primer registro: {flujo.detalleActividad}.</p>
          )}
        </section>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold text-slate-900">Organización anterior</h4>
              <p className="mt-1 text-sm">{fechaCorta(flujo.preparacionA.desde)}–{fechaCorta(flujo.preparacionA.hasta)}</p>
              <p className="mt-2 text-xs text-slate-600">Se conservará exactamente y no puede editarse.</p>
            </section>
            <section className="rounded-xl border border-purple-200 bg-purple-50 p-4">
              <h4 className="font-semibold text-purple-950">Nueva organización</h4>
              <p className="mt-1 text-sm">{fechaCorta(flujo.preparacionB.desde)}–{fechaCorta(flujo.preparacionB.hasta)}</p>
              <p className="mt-2 text-xs text-purple-800">Comienza como copia de la organización anterior.</p>
            </section>
          </div>

          <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="font-semibold text-slate-900">Estructura de la nueva organización</h4>
            <p className="mt-1 text-sm text-slate-600">
              Podés configurar filas y sectores de la nueva organización. Los Turnantes mensuales adicionales T6/T4 se administran después desde Planilla.
            </p>
            <div className="mt-4">
              <ConfiguracionPlanilla
                modoPreparacionVersionada
                ocultarTurnanteMensual
                borradores={borradores}
                onActualizarBorrador={onActualizarConfiguracion}
              />
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold text-slate-900">Prioridad de cobertura</h4>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              {CATEGORIAS.map((categoria) => (
                <PrioridadCoberturaMes
                  key={categoria}
                  categoria={categoria}
                  filas={borradores?.[categoria]?.filas || []}
                  prioridadCoberturaSectorIds={borradores?.[categoria]?.prioridadCoberturaSectorIds || []}
                  versionEstructura={borradores?.[categoria]}
                  onCambiarPrioridad={(prioridad) =>
                    onActualizarConfiguracion(categoria, (actual) => ({
                      ...actual,
                      prioridadCoberturaSectorIds: prioridad
                    }))
                  }
                />
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold text-slate-900">Asignaciones fijas</h4>
            <div className="mt-3">
              <AsignacionesFijasMes
                borradores={borradores}
                personal={personal}
                onActualizarBorrador={onActualizarConfiguracion}
              />
            </div>
          </section>
          {flujo?.error && <p role="alert" className="mt-4 text-sm text-rose-700">{flujo.error}</p>}
        </>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancelar} disabled={flujo?.estado === "guardando"} className="min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={esBorrador ? onConfirmar : onContinuar}
          disabled={!flujo?.desde || flujo?.estado === "guardando"}
          className="min-h-11 rounded-lg bg-purple-600 px-4 py-2 text-white disabled:bg-slate-300"
        >
          {flujo?.estado === "guardando"
            ? "Guardando…"
            : esBorrador
              ? "Confirmar nueva preparación"
              : "Continuar"}
        </button>
      </div>
    </ModalMobileShell>
  );
}
