import {
  MOTIVOS_NO_DISPONIBLE,
  OPCIONES_MOTIVO_NO_DISPONIBLE
} from "../../utils/noDisponiblesMotivos.js";

const TURNOS = [
  ["manana", "Mañana"],
  ["tarde", "Tarde"],
  ["vespertino", "Vespertino"],
  ["noche", "Noche"]
];

export default function PanelNoDisponible({
  formulario,
  extras,
  onCambiar,
  onCancelar,
  onConfirmar,
  onQuitar
}) {
  if (!formulario) return null;
  const cambio = formulario.motivo === MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO;
  const supervision = formulario.motivo === MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO;
  const requiereDetalle = formulario.motivo === MOTIVOS_NO_DISPONIBLE.OTRO;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-no-disponible"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 id="titulo-no-disponible" className="text-lg font-semibold text-slate-900">
          {formulario.editando ? "Editar No disponible" : "Marcar No disponible"}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          <strong>{formulario.persona.nombre}</strong> ·{" "}
          {formulario.persona.categoria === "licenciado" ? "Licenciados" : "Enfermeros"}
        </p>
        <p className="text-sm text-slate-600">
          Fecha: {formulario.fecha} · Sector: {formulario.sectorOrigen || "No identificado"}
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Motivo
          <select
            value={formulario.motivo}
            onChange={(evento) => onCambiar("motivo", evento.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Seleccionar motivo</option>
            {OPCIONES_MOTIVO_NO_DISPONIBLE.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
            ))}
          </select>
        </label>

        {cambio && (
          <>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Persona que cubre
              <select
                value={formulario.personaCoberturaId}
                onChange={(evento) => onCambiar("personaCoberturaId", evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">Cobertura aún no indicada</option>
                {extras.map((extra) => (
                  <option key={extra.id} value={extra.id}>{extra.nombre}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Aclaración opcional
              <textarea
                value={formulario.detalle}
                onChange={(evento) => onCambiar("detalle", evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </>
        )}

        {supervision && (
          <>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Turno destino
              <select
                value={formulario.turnoDestino}
                onChange={(evento) => onCambiar("turnoDestino", evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">Seleccionar turno</option>
                {TURNOS.map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>{etiqueta}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Detalle opcional
              <textarea
                value={formulario.detalle}
                onChange={(evento) => onCambiar("detalle", evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </>
        )}

        {requiereDetalle && (
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Aclaración
            <textarea
              required
              value={formulario.detalle}
              onChange={(evento) => onCambiar("detalle", evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        )}

        {formulario.error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formulario.error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <div>
            {formulario.editando && (
              <button
                type="button"
                onClick={onQuitar}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700"
              >
                Quitar No disponible
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onCancelar} className="rounded-lg border px-3 py-2">
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              className="rounded-lg bg-blue-600 px-3 py-2 text-white"
            >
              Guardar motivo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
