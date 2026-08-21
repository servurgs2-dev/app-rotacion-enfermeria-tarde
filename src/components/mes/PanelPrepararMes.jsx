import ConfiguracionPlanilla from "../configuracion/ConfiguracionPlanilla.jsx";
import AsignacionesFijasMes from "./AsignacionesFijasMes.jsx";
import PrioridadCoberturaMes from "./PrioridadCoberturaMes.jsx";

const CATEGORIAS_PRIORIDAD = Object.freeze(["enfermero", "licenciado"]);

function PanelPrepararMes({
  analisis,
  borradoresConfiguracionPlanilla,
  onActualizarBorradorConfiguracionPlanilla,
  error,
  onCancelar,
  onConfirmar
}) {
  const enfermeros = analisis.enfermeros;
  const flex = enfermeros.analisis;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-preparar-mes"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="titulo-preparar-mes" className="text-xl font-bold text-slate-900">
          Preparar mes siguiente
        </h3>
        <p className="mt-3 rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-950">
          Se copiará la base del mes anterior como referencia. Las semanas o
          bloques restantes quedarán vacíos hasta que revises el Personal y
          generes la rotación.
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <p><strong>Turno:</strong> {analisis.turnoNombre}</p>
          <p><strong>Origen:</strong> {analisis.mesOrigen}</p>
          <p><strong>Destino:</strong> {analisis.mesDestino}</p>
          <p><strong>Estado:</strong> {analisis.destino.clasificacion}</p>
          <p><strong>Revisión:</strong> {analisis.revisionDestino}</p>
        </div>

        <section className="mt-5 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Personal</h4>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-5">
            <p>Total: {analisis.conteosPersonal.total}</p>
            <p>Enfermeros: {analisis.conteosPersonal.enfermeros}</p>
            <p>Licenciados: {analisis.conteosPersonal.licenciados}</p>
            <p>Licencias vigentes: {analisis.licencias.length}</p>
            <p>Certificaciones vigentes: {analisis.certificaciones.length}</p>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <h4 className="font-semibold text-blue-950">Enfermeros</h4>
            <div className="mt-2 space-y-1 text-sm">
              <p>Estrategia: {enfermeros.estrategia.tipo === "cada_3_dias" ? "Cada tres días" : "Semanal"}</p>
              <p>Base: {enfermeros.claveBase}</p>
              <p>Posiciones: {enfermeros.filas.length}</p>
              <p>Personas válidas: {flex.cantidadPersonas}</p>
              <p>Posiciones vacías: {flex.filasVacias.join(", ") || "Ninguna"}</p>
              {enfermeros.estrategia.tipo === "semanal" ? (
                <>
                  <p>Se preparará Semana 1 con la última semana real del origen.</p>
                  <p>Semanas 2 a 6 quedarán vacías.</p>
                </>
              ) : (
                <>
                  <p>Se copiará asignacionBase como base editable.</p>
                  <p>
                    Bloques compartidos disponibles: {
                      enfermeros.bloquesDestino.filter((periodo) =>
                        Object.hasOwn(
                          analisis.rotacionEnfermerosOrigen.bloques || {},
                          periodo.clave
                        )
                      ).length
                    }
                  </p>
                  <p>Los bloques faltantes quedarán sin generar.</p>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <h4 className="font-semibold text-emerald-950">Licenciados</h4>
            <div className="mt-2 space-y-1 text-sm">
              <p>Estrategia: Semanal</p>
              <p>Base: {analisis.licenciados.claveBase}</p>
              <p>Posiciones: {analisis.licenciados.filas.length}</p>
              <p>Personas válidas: {analisis.licenciados.cantidadPersonas}</p>
              <p>Se preparará Semana 1 con la última semana real del origen.</p>
              <p>Semanas 2 a 6 quedarán vacías.</p>
              <p>Salud Mental conserva su comportamiento fijo.</p>
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Estructura de Planilla del mes a preparar</h4>
          <ConfiguracionPlanilla
            borradores={borradoresConfiguracionPlanilla}
            onActualizarBorrador={onActualizarBorradorConfiguracionPlanilla}
          />
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Prioridad de cobertura</h4>
          <p className="mt-2 text-sm text-slate-600">
            Define qué sectores se intentan cubrir primero cuando faltan funcionarios.
            No modifica la distribución base de la Planilla.
          </p>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {CATEGORIAS_PRIORIDAD.map((categoria) => {
              const borrador = borradoresConfiguracionPlanilla?.[categoria];
              return (
                <PrioridadCoberturaMes
                  key={categoria}
                  categoria={categoria}
                  filas={borrador?.filas || []}
                  prioridadCoberturaSectorIds={borrador?.prioridadCoberturaSectorIds || []}
                  onCambiarPrioridad={(prioridadCoberturaSectorIds) =>
                    onActualizarBorradorConfiguracionPlanilla?.(categoria, (actual) => ({
                      ...actual,
                      prioridadCoberturaSectorIds
                    }))
                  }
                />
              );
            })}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Asignaciones fijas del mes</h4>
          <div className="mt-3">
            <AsignacionesFijasMes
              borradores={borradoresConfiguracionPlanilla}
              personal={analisis.personal}
              onActualizarBorrador={onActualizarBorradorConfiguracionPlanilla}
            />
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
          <h4 className="font-semibold text-slate-900">No se copiará</h4>
          <p className="mt-2">
            Extras, no disponibles, asistencia, cambios diarios, días de paro,
            cierres ni el calendario del mes anterior.
          </p>
        </section>

        {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancelar} className="rounded-lg border px-4 py-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="rounded-lg bg-purple-600 px-4 py-2 text-white"
          >
            Confirmar preparación
          </button>
        </div>
      </div>
    </div>
  );
}

export default PanelPrepararMes;
