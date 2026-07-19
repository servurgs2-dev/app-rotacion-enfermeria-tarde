import { TURNOS } from "../../config/turnos.js";

const ORDEN_TURNOS = ["noche", "manana", "tarde", "vespertino"];

function SelectorTurno({ turnos = TURNOS, onSeleccionar }) {
  const opciones = ORDEN_TURNOS.map((turnoId) => turnos[turnoId]).filter(Boolean);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:px-6">
      <div className="mx-auto flex min-h-[75vh] max-w-5xl flex-col justify-center">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 sm:text-4xl">
            Rotación de Enfermería
          </h1>
          <p className="mt-3 text-lg text-slate-600">Seleccioná el turno</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {opciones.map((turno) => (
            <button
              key={turno.id}
              type="button"
              onClick={() => onSeleccionar(turno.id)}
              className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
            >
              <span className="block text-xl font-bold text-slate-800">
                {turno.nombre}
              </span>
              <span className="mt-3 block text-sm font-medium text-slate-500">
                Horario normal
              </span>
              <span className="mt-1 block text-base text-slate-700">
                {turno.horarioVisible}
              </span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

export default SelectorTurno;
