import { useState } from "react";
import {
  crearLicenciaPersona,
  obtenerNombreDeLicencia
} from "../../utils/licenciasPersonas.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";

function Licencias({ personal, licencias, setLicencias }) {
  const [persona, setPersona] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState("");

  const agregarLicencia = () => {
    if (!persona) {
      setError("Seleccioná una persona.");
      return;
    }

    if (!desde || !hasta) {
      setError("Completá las fechas desde y hasta.");
      return;
    }

    if (hasta < desde) {
      setError("La fecha hasta no puede ser anterior a la fecha desde.");
      return;
    }

    const personaSeleccionada = personal.find((actual) => actual.id === persona);
    const nuevaLicencia = crearLicenciaPersona(personaSeleccionada, desde, hasta);
    if (!nuevaLicencia) {
      setError("No se pudo identificar a la persona seleccionada.");
      return;
    }

    setLicencias([...licencias, nuevaLicencia]);

    setPersona("");
    setDesde("");
    setHasta("");
    setError("");
  };

  const eliminarLicencia = (indice) => {
    setLicencias(licencias.filter((_, posicion) => posicion !== indice));
  };

  return (
    <div className="space-y-4">

      {/* ➕ FORMULARIO */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-slate-700">
          Agregar licencia
        </h3>

        <div className="flex flex-wrap gap-2">
          
          <select
            value={persona}
            onChange={(e) => {
              setPersona(e.target.value);
              setError("");
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Seleccionar persona</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {obtenerEtiquetaPersona(p, personal)}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value);
              setError("");
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />

          <input
            type="date"
            value={hasta}
            onChange={(e) => {
              setHasta(e.target.value);
              setError("");
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />

          <button
            onClick={agregarLicencia}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            Agregar
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* 📋 TABLA */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">

          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Desde</th>
              <th className="px-3 py-2 text-left">Hasta</th>
              <th className="px-3 py-2 text-left">❌</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {licencias.map((l, indice) => (
              <tr key={`${l.personaId || l.nombre}-${l.desde}-${l.hasta}-${indice}`} className="hover:bg-slate-50">
                
                <td className="px-3 py-2 font-medium text-slate-700">
                  {obtenerNombreDeLicencia(l, personal)}
                </td>

                <td className="px-3 py-2 text-slate-500">
                  {l.desde}
                </td>

                <td className="px-3 py-2 text-slate-500">
                  {l.hasta}
                </td>

                <td className="px-3 py-2">
                  <button
                    onClick={() => eliminarLicencia(indice)}
                    className="text-red-500 hover:text-red-700"
                  >
                    ❌
                  </button>
                </td>

              </tr>
            ))}
          </tbody>

        </table>
      </div>

    </div>
  );
}

export default Licencias;
