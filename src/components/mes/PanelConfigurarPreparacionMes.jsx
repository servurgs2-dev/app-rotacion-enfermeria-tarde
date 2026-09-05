import ConfiguracionPlanilla from "../configuracion/ConfiguracionPlanilla.jsx";
import ModalMobileShell from "../ui/ModalMobileShell.jsx";
import AsignacionesFijasMes from "./AsignacionesFijasMes.jsx";
import PrioridadCoberturaMes from "./PrioridadCoberturaMes.jsx";

const CATEGORIAS = ["enfermero", "licenciado"];
const fechaCorta = (fecha) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;

export default function PanelConfigurarPreparacionMes({ flujo, personal, onCancelar }) {
  const borradores = Object.fromEntries(CATEGORIAS.map((categoria) => [
    categoria,
    flujo.categorias[categoria].configuracion
  ]));
  return (
    <ModalMobileShell
      ariaLabelledby="titulo-configurar-preparacion"
      maxWidthClassName="max-w-5xl"
      panelClassName="px-4 pt-4 sm:px-5 sm:pt-5 sm:pb-5"
    >
      <h3 id="titulo-configurar-preparacion" className="text-xl font-bold text-slate-900">
        Ver organización
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Vigencia {fechaCorta(flujo.preparacion.desde)}–{fechaCorta(flujo.preparacion.hasta)}.
      </p>
      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        Esta organización ya fue confirmada y no puede modificarse. Cualquier cambio posterior requiere una nueva preparación.
      </p>
      <div className="mt-4">
        <ConfiguracionPlanilla
          modoPreparacionVersionada
          ocultarTurnanteMensual
          soloLectura
          borradores={borradores}
        />
      </div>
      <>
          <section className="mt-5 rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold text-slate-900">Prioridad de cobertura</h4>
            <div className="mt-3 grid gap-5 lg:grid-cols-2">
              {CATEGORIAS.map((categoria) => (
                <PrioridadCoberturaMes
                  key={categoria}
                  categoria={categoria}
                  filas={borradores[categoria].filas || []}
                  prioridadCoberturaSectorIds={borradores[categoria].prioridadCoberturaSectorIds || []}
                  versionEstructura={borradores[categoria]}
                  soloLectura
                />
              ))}
            </div>
          </section>
          <section className="mt-4 rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold text-slate-900">Asignaciones fijas</h4>
            <div className="mt-3">
              <AsignacionesFijasMes borradores={borradores} personal={personal} soloLectura />
            </div>
          </section>
        </>
      {flujo.error && <p role="alert" className="mt-4 text-sm text-rose-700">{flujo.error}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancelar} className="min-h-11 rounded-lg border px-4 py-2">
          Cerrar
        </button>
      </div>
    </ModalMobileShell>
  );
}
