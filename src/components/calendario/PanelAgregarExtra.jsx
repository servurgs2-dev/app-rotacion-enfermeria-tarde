import SelectorFuncionarioOtroTurno from "./SelectorFuncionarioOtroTurno.jsx";
import ModalMobileShell from "../ui/ModalMobileShell.jsx";

export default function PanelAgregarExtra({
  formulario,
  candidatos,
  personasCubribles = [],
  onCambiar,
  onCancelar,
  onConfirmar
}) {
  if (!formulario) return null;
  return (
    <ModalMobileShell
      ariaLabelledby="titulo-agregar-extra"
      panelClassName="px-5 pt-5 sm:px-5 sm:pt-5 sm:pb-5"
    >
        <h3 id="titulo-agregar-extra" className="text-lg font-semibold text-slate-900">
          Agregar Extra
        </h3>

        <SelectorFuncionarioOtroTurno
          modalidad={formulario.modalidad}
          candidatos={candidatos}
          cargando={formulario.cargando}
          personaId={formulario.personaId}
          nombre={formulario.nombre}
          funcionario={formulario.funcionario}
          onCambiar={onCambiar}
        />

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Tipo de extra
          <select
            value={formulario.tipoExtra}
            disabled={formulario.cargando}
            onChange={(evento) => onCambiar("tipoExtra", evento.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="cobertura">Cubre a un funcionario</option>
            <option value="refuerzo">Refuerzo sin reemplazo</option>
          </select>
        </label>

        {formulario.tipoExtra === "cobertura" && (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            ¿A quién cubre?
            <select
              value={formulario.personaCubiertaId}
              disabled={formulario.cargando}
              onChange={(evento) => onCambiar("personaCubiertaId", evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Seleccionar funcionario</option>
              {personasCubribles.map((opcion) => (
                <option key={opcion.persona.id} value={opcion.persona.id}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </label>
        )}

        {formulario.error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formulario.error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="rounded-lg border px-3 py-2">
            Cancelar
          </button>
          <button
            type="button"
            disabled={formulario.cargando}
            onClick={onConfirmar}
            className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
          >
            Agregar Extra
          </button>
        </div>
    </ModalMobileShell>
  );
}
