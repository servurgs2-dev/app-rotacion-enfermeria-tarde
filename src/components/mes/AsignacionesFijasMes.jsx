import { useMemo, useState } from "react";
import { validarAsignacionesFijasMensuales } from "../../utils/asignacionesFijasMensuales.js";

const CATEGORIAS = Object.freeze([
  { id: "enfermero", etiqueta: "Enfermeros" },
  { id: "licenciado", etiqueta: "Licenciados" }
]);

const MENSAJES_ERROR = Object.freeze({
  PERSONA_REPETIDA: "Este funcionario ya tiene otro sector fijo.",
  SECTOR_REPETIDO: "Este sector ya tiene un funcionario fijo.",
  PERSONA_INEXISTENTE: "El funcionario seleccionado ya no está disponible.",
  CATEGORIA_INCORRECTA: "El funcionario no corresponde a esta categoría.",
  SECTOR_INEXISTENTE: "El sector ya no está disponible en esta configuración.",
  SECTOR_DESACTIVADO: "El sector ya no está disponible en esta configuración.",
  DESTINO_TURNANTE: "Los puestos Turnante no pueden ser asignaciones fijas.",
  PERSONA_ID_DUPLICADO: "La identidad del funcionario no es válida.",
  FILA_SIN_SECTOR_ID: "La configuración contiene un sector sin identidad estable."
});

const mensajeError = (errores) =>
  MENSAJES_ERROR[errores?.[0]?.codigo] || "No se pudo guardar la asignación fija.";

function AsignacionesFijasMes({ borradores = {}, personal = [], onActualizarBorrador, soloLectura = false }) {
  const [categoriaFormulario, setCategoriaFormulario] = useState(null);
  const [sectorId, setSectorId] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [error, setError] = useState("");

  const abrirFormulario = (categoria) => {
    setCategoriaFormulario(categoria);
    setSectorId("");
    setPersonaId("");
    setError("");
  };
  const cancelar = () => abrirFormulario(null);

  const datosFormulario = useMemo(() => {
    const borrador = borradores?.[categoriaFormulario];
    const asignaciones = borrador?.asignacionesFijas || [];
    const sectoresOcupados = new Set(asignaciones.map((item) => item.sectorId));
    const personasOcupadas = new Set(asignaciones.map((item) => item.personaId));
    return {
      borrador,
      sectores: (borrador?.filas || []).filter((fila) =>
        fila.tipo === "sector" && fila.activo === true && fila.sectorId &&
        !sectoresOcupados.has(fila.sectorId)
      ),
      personas: personal.filter((persona) =>
        persona?.id && persona.categoria === categoriaFormulario &&
        !personasOcupadas.has(persona.id)
      )
    };
  }, [borradores, categoriaFormulario, personal]);

  const validacionesActuales = useMemo(() => Object.fromEntries(
    CATEGORIAS.map(({ id }) => {
      const borrador = borradores?.[id];
      return [id, validarAsignacionesFijasMensuales({
        asignaciones: borrador?.asignacionesFijas,
        personal,
        categoria: id,
        filas: borrador?.filas
      })];
    })
  ), [borradores, personal]);

  const guardar = () => {
    const borrador = datosFormulario.borrador;
    if (!borrador || !sectorId || !personaId) {
      setError("Seleccioná un sector y un funcionario.");
      return;
    }
    const asignaciones = [
      ...(borrador.asignacionesFijas || []),
      { sectorId, personaId }
    ];
    const validacion = validarAsignacionesFijasMensuales({
      asignaciones,
      personal,
      categoria: categoriaFormulario,
      filas: borrador.filas
    });
    if (!validacion.valido) {
      setError(mensajeError(validacion.errores));
      return;
    }
    onActualizarBorrador?.(categoriaFormulario, (actual) => ({
      ...actual,
      asignacionesFijas: validacion.asignaciones
    }));
    cancelar();
  };

  const quitar = (categoria, sectorIdQuitado) => {
    onActualizarBorrador?.(categoria, (actual) => ({
      ...actual,
      asignacionesFijas: (actual.asignacionesFijas || []).filter(
        (item) => item.sectorId !== sectorIdQuitado
      )
    }));
  };

  return (
    <div className="space-y-5">
      {!soloLectura && <p className="text-sm text-slate-600">
        Esta propuesta corresponde al mes destino. Podés revisarla antes de confirmar.
      </p>}
      {CATEGORIAS.map(({ id, etiqueta }) => {
        const borrador = borradores?.[id];
        const filasPorId = new Map((borrador?.filas || []).map((fila) => [fila.sectorId, fila]));
        const personasPorId = new Map(personal.map((persona) => [persona.id, persona]));
        const asignaciones = borrador?.asignacionesFijas || [];
        return (
          <section key={id} aria-labelledby={`fijas-${id}`}>
            <h5 id={`fijas-${id}`} className="font-semibold text-slate-800">{etiqueta}</h5>
            <div className="mt-2 space-y-2">
              {!validacionesActuales[id]?.valido && (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {mensajeError(validacionesActuales[id].errores)}
                </p>
              )}
              {asignaciones.length === 0 && (
                <p className="text-sm text-slate-500">Sin asignaciones fijas</p>
              )}
              {asignaciones.map((asignacion) => (
                <div key={asignacion.sectorId}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {filasPorId.get(asignacion.sectorId)?.etiqueta || "Sector no disponible"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {personasPorId.get(asignacion.personaId)?.nombre || "Funcionario no disponible"}
                    </p>
                  </div>
                  {!soloLectura && <button type="button" onClick={() => quitar(id, asignacion.sectorId)}
                    className="min-h-11 rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700">
                    Quitar
                  </button>}
                </div>
              ))}
            </div>
            {!soloLectura && (categoriaFormulario === id ? (
              <div className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                <label className="block text-sm font-medium text-slate-700">
                  Sector
                  <select value={sectorId} onChange={(evento) => setSectorId(evento.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
                    <option value="">Seleccionar sector</option>
                    {datosFormulario.sectores.map((fila) => (
                      <option key={fila.sectorId} value={fila.sectorId}>{fila.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Funcionario
                  <select value={personaId} onChange={(evento) => setPersonaId(evento.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
                    <option value="">Seleccionar funcionario</option>
                    {datosFormulario.personas.map((persona) => (
                      <option key={persona.id} value={persona.id}>{persona.nombre}</option>
                    ))}
                  </select>
                </label>
                {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button type="button" onClick={cancelar}
                    className="min-h-11 rounded-lg border border-slate-300 px-4 py-2">Cancelar</button>
                  <button type="button" onClick={guardar}
                    className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Guardar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => abrirFormulario(id)}
                className="mt-3 min-h-11 w-full rounded-lg border border-blue-300 px-4 py-2 font-medium text-blue-700 sm:w-auto">
                + Agregar asignación
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export default AsignacionesFijasMes;
