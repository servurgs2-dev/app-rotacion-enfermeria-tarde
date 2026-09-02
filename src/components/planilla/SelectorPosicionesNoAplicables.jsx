import ModalMobileShell from "../ui/ModalMobileShell.jsx";

function SelectorPosicionesNoAplicables({
  filas,
  filasVacias,
  nombresPorFila,
  seleccionadas,
  cantidadRequerida,
  sectoresCriticos,
  advertenciaSobrescritura,
  error,
  onAlternar,
  onCancelar,
  onConfirmar
}) {
  const vacias = new Set(filasVacias);
  const seleccion = new Set(seleccionadas);
  const criticos = seleccionadas.filter((fila) => sectoresCriticos.includes(fila));

  return (
    <ModalMobileShell
      ariaLabelledby="titulo-posiciones-no-aplicables"
      backdropClassName="bg-slate-900/50"
      maxWidthClassName="max-w-2xl"
      panelClassName="px-5 pt-5 sm:px-5 sm:pt-5 sm:pb-5"
    >
        <h3 id="titulo-posiciones-no-aplicables" className="text-lg font-semibold text-slate-900">
          Posiciones no aplicables
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Seleccioná exactamente {cantidadRequerida} {
            cantidadRequerida === 1 ? "posición vacía" : "posiciones vacías"
          }. Las posiciones ocupadas no pueden excluirse.
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Para excluir una posición ocupada, cancelá, reorganizá manualmente la
          distribución base y volvé a generar.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {filas.map((fila, indice) => {
            const estaVacia = vacias.has(fila);
            const id = `no-aplicable-${indice}`;
            return (
              <label
                key={fila}
                htmlFor={id}
                className={`flex gap-3 rounded-lg border p-3 ${
                  estaVacia ? "border-slate-200" : "border-slate-100 bg-slate-50"
                }`}
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={seleccion.has(fila)}
                  disabled={!estaVacia}
                  onChange={() => onAlternar(fila)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800">{fila}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {estaVacia ? "Vacía" : nombresPorFila[fila] || "Ocupada"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {criticos.length > 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="alert">
            Advertencia: seleccionaste sectores críticos: {criticos.join(", ")}.
            Podés continuar si la selección es intencional.
          </p>
        )}
        {advertenciaSobrescritura && (
          <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">
            {advertenciaSobrescritura}
          </p>
        )}
        {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancelar} className="rounded-lg border px-4 py-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={seleccionadas.length !== cantidadRequerida}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:bg-slate-300"
          >
            Confirmar y generar
          </button>
        </div>
    </ModalMobileShell>
  );
}

export default SelectorPosicionesNoAplicables;
