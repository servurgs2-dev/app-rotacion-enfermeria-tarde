import { useEffect, useState } from "react";

const fechaCorta = (valor) => {
  const [, mes, dia] = String(valor || "").split("-");
  return dia && mes ? `${dia}/${mes}` : valor || "";
};

const listarFechas = (fechas = []) =>
  fechas.length
    ? fechas.map(fechaCorta).join(", ")
    : "Sin días disponibles sin sector";

function PanelReintegrosPlanilla({
  periodos,
  periodoClave,
  reintegros,
  filas,
  soloLectura,
  error,
  advertencias = [],
  onCambiarPeriodo,
  onGuardar,
  onEliminar
}) {
  const [formulario, setFormulario] = useState(null);
  const [eliminacion, setEliminacion] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFormulario(null);
      setEliminacion(null);
    }, 0);
    return () => clearTimeout(timeout);
  }, [periodoClave]);

  const abrirFormulario = (personaId = "", asignacion = null) => {
    const reintegro = reintegros.find(
      (actual) => String(actual.persona.id) === String(personaId || asignacion?.personaId)
    );
    setFormulario({
      id: asignacion?.id || "",
      personaId: personaId || asignacion?.personaId || "",
      sector: asignacion?.sector || "",
      desde: asignacion?.desde || reintegro?.fechasSinSector?.[0] || "",
      hasta: asignacion?.hasta || reintegro?.fechasSinSector?.at(-1) || "",
      creadoEn: asignacion?.creadoEn || ""
    });
  };

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-emerald-950">Disponibles por reintegro</h3>
          <p className="text-sm text-emerald-900">
            No desplazan asignaciones base y no se registran como Extras.
          </p>
        </div>
        <label className="text-sm text-slate-700">
          <span className="mr-2 font-medium">Período</span>
          <select
            value={periodoClave}
            onChange={(evento) => onCambiarPeriodo(evento.target.value)}
            className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5"
          >
            {periodos.map((periodo) => (
              <option key={periodo.clave} value={periodo.clave}>
                {periodo.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      {reintegros.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          No hay funcionarios disponibles por reintegro en este período.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {reintegros.map((reintegro) => (
            <article
              key={reintegro.persona.id}
              className="rounded-lg border border-emerald-100 bg-white p-3 text-sm"
            >
              <p className="font-semibold text-slate-900">{reintegro.persona.nombre}</p>
              <p className="text-slate-600">
                {reintegro.persona.categoria}
                {reintegro.persona.funcionario
                  ? ` · Func. ${reintegro.persona.funcionario}`
                  : ""}
              </p>
              <p>Licencia hasta: {fechaCorta(reintegro.licenciaHasta)}</p>
              <p>Disponible desde: {fechaCorta(reintegro.disponibleDesde)}</p>
              <p>
                Sin sector: {reintegro.fechasSinSector.length
                  ? listarFechas(reintegro.fechasSinSector)
                  : "Sin días disponibles sin sector"}
              </p>
              {reintegro.tramosDisponibles.length > 1 && (
                <p>
                  Tramos disponibles: {reintegro.tramosDisponibles.map(
                    (tramo) => tramo.desde === tramo.hasta
                      ? fechaCorta(tramo.desde)
                      : `${fechaCorta(tramo.desde)} al ${fechaCorta(tramo.hasta)}`
                  ).join(" · ")}
                </p>
              )}
              {reintegro.asignacionesParciales.map((asignacion) => (
                <div
                  key={asignacion.id}
                  className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5"
                >
                  <p>
                    Asignada parcialmente: {asignacion.sector} del{" "}
                    {fechaCorta(asignacion.desde)} al {fechaCorta(asignacion.hasta)}
                  </p>
                  {!soloLectura && (
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        className="text-blue-700 underline"
                        onClick={() => abrirFormulario("", asignacion)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-red-700 underline"
                        onClick={() => setEliminacion(asignacion)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!soloLectura && reintegro.fechasSinSector.length > 0 && (
                <button
                  type="button"
                  onClick={() => abrirFormulario(reintegro.persona.id)}
                  className="mt-2 rounded-lg border border-emerald-500 px-2 py-1 text-emerald-800"
                >
                  Asignar por fechas
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {advertencias.length > 0 && (
        <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Asignaciones parciales con conflictos actuales</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {advertencias.map((advertencia) => (
              <li key={advertencia.id}>{advertencia.mensaje}</li>
            ))}
          </ul>
        </div>
      )}

      {formulario && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3">
          <h4 className="font-semibold text-slate-900">Asignación parcial</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block">Funcionario</span>
              <select
                value={formulario.personaId}
                disabled={Boolean(formulario.id)}
                onChange={(evento) =>
                  setFormulario((actual) => ({ ...actual, personaId: evento.target.value }))
                }
                className="w-full rounded-lg border px-2 py-1.5"
              >
                <option value="">Seleccionar</option>
                {reintegros.map((reintegro) => (
                  <option key={reintegro.persona.id} value={reintegro.persona.id}>
                    {reintegro.persona.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block">Posición o sector</span>
              <select
                value={formulario.sector}
                onChange={(evento) =>
                  setFormulario((actual) => ({ ...actual, sector: evento.target.value }))
                }
                className="w-full rounded-lg border px-2 py-1.5"
              >
                <option value="">Seleccionar</option>
                {filas.map((fila) => <option key={fila}>{fila}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block">Desde</span>
              <input
                type="date"
                value={formulario.desde}
                onChange={(evento) =>
                  setFormulario((actual) => ({ ...actual, desde: evento.target.value }))
                }
                className="w-full rounded-lg border px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block">Hasta</span>
              <input
                type="date"
                value={formulario.hasta}
                onChange={(evento) =>
                  setFormulario((actual) => ({ ...actual, hasta: evento.target.value }))
                }
                className="w-full rounded-lg border px-2 py-1.5"
              />
            </label>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setFormulario(null)}
              className="rounded-lg border px-3 py-1.5"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onGuardar(formulario, () => setFormulario(null))}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-white"
            >
              Guardar asignación
            </button>
          </div>
        </div>
      )}

      {eliminacion && (
        <div role="dialog" aria-modal="true" className="mt-4 rounded-lg border border-red-200 bg-white p-3">
          <p className="font-semibold">¿Eliminar esta asignación parcial?</p>
          <p className="text-sm text-slate-600">
            La asignación base no se modificará y la persona volverá a SIN ASIGNAR.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setEliminacion(null)} className="rounded-lg border px-3 py-1.5">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onEliminar(eliminacion.id);
                setEliminacion(null);
              }}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-white"
            >
              Sí, eliminar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default PanelReintegrosPlanilla;
