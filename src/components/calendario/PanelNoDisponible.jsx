import { useEffect } from "react";
import {
  MOTIVOS_NO_DISPONIBLE,
  OPCIONES_MOTIVO_NO_DISPONIBLE
} from "../../utils/noDisponiblesMotivos.js";
import SelectorFuncionarioOtroTurno from "./SelectorFuncionarioOtroTurno.jsx";

const TURNOS = [
  ["manana", "Mañana"],
  ["tarde", "Tarde"],
  ["vespertino", "Vespertino"],
  ["noche", "Noche"]
];

export default function PanelNoDisponible({
  formulario,
  extras,
  candidatos,
  onCambiar,
  onCancelar,
  onConfirmar,
  onQuitar
}) {
  useEffect(() => {
    if (!formulario) return undefined;
    const alPresionarTecla = (evento) => {
      if (evento.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [formulario, onCancelar]);

  if (!formulario) return null;
  const cambio = formulario.motivo === MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO;
  const supervision = formulario.motivo === MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO;
  const requiereDetalle = formulario.motivo === MOTIVOS_NO_DISPONIBLE.OTRO;
  const certificacionDia = formulario.motivo === MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA;

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
                  <option key={extra.id} value={extra.id}>
                    {extra.nombre} (E) — {extra.sectorCubiertoNombre || extra.turnoOrigen || "Extra del día"}
                  </option>
                ))}
                <option value="__AGREGAR_OTRO_TURNO__">+ Agregar funcionario de otro turno</option>
              </select>
            </label>
            {formulario.personaCoberturaId === "__AGREGAR_OTRO_TURNO__" && (
              <>
                <SelectorFuncionarioOtroTurno
                  modalidad={formulario.modalidadCobertura}
                  candidatos={candidatos}
                  cargando={formulario.cargandoCandidatos}
                  personaId={formulario.coberturaExternaPersonaId}
                  nombre={formulario.coberturaExternaNombre}
                  funcionario={formulario.coberturaExternaFuncionario}
                  onCambiar={(campo, valor) => onCambiar({
                    modalidad: "modalidadCobertura",
                    personaId: "coberturaExternaPersonaId",
                    nombre: "coberturaExternaNombre",
                    funcionario: "coberturaExternaFuncionario"
                  }[campo], valor)}
                />
                {formulario.modalidadCobertura === "manual" && (
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Turno de origen (opcional)
                  <select value={formulario.coberturaExternaTurno || ""} onChange={(evento) => onCambiar("coberturaExternaTurno", evento.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                    <option value="">No indicado</option>
                    {TURNOS.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                  </select>
                </label>
                )}
              </>
            )}
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

        {certificacionDia && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Se registrará una certificación únicamente para esta fecha.
          </p>
        )}

        {formulario.error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formulario.error}
          </p>
        )}

        {formulario.confirmarEliminacion && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">¿Qué querés hacer con el Extra vinculado?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onQuitar("eliminar")} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-red-700">Eliminar también el Extra</button>
              <button type="button" onClick={() => onQuitar("mantener_refuerzo")} className="rounded-lg border border-amber-400 bg-white px-3 py-2">Mantener al Extra como refuerzo</button>
              <button type="button" onClick={() => onCambiar("confirmarEliminacion", false)} className="rounded-lg border bg-white px-3 py-2">Cancelar</button>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 mt-5 flex flex-wrap justify-between gap-2 bg-white pt-3">
          <div>
            {formulario.editando && (
              <button
                type="button"
                onClick={() => onQuitar()}
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
              {certificacionDia ? "Registrar certificación del día" : "Guardar motivo"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
