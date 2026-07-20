import { useState } from "react";
import {
  crearCertificacionPersona,
  obtenerNombreDeCertificacion
} from "../../utils/certificacionesPersonas.js";
import { obtenerEtiquetaPersona } from "../../utils/nombresPersonas.js";

function Certificaciones({ personal, certificaciones, setCertificaciones }) {
  const [persona, setPersona] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState("");

  const agregarCertificacion = () => {
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
    const nuevaCertificacion = crearCertificacionPersona(personaSeleccionada, {
      desde,
      hasta
    });
    if (!nuevaCertificacion) {
      setError("No se pudo identificar a la persona seleccionada.");
      return;
    }

    setCertificaciones([...certificaciones, nuevaCertificacion]);

    setPersona("");
    setDesde("");
    setHasta("");
    setError("");
  };

  const eliminarCertificacion = (indice) => {
    setCertificaciones(
      certificaciones.filter((_, posicion) => posicion !== indice)
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-slate-700">
          Agregar certificación médica
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
            onClick={agregarCertificacion}
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Desde</th>
              <th className="px-3 py-2 text-left">Hasta</th>
              <th className="px-3 py-2 text-left">Eliminar</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {certificaciones.map((certificacion, indice) => {
              const nombreVisible = obtenerNombreDeCertificacion(
                certificacion,
                personal
              );
              return (
                <tr
                  key={`${certificacion.personaId || certificacion.nombre}-${certificacion.desde}-${certificacion.hasta}-${indice}`}
                  className="hover:bg-slate-50"
                >
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {nombreVisible}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{certificacion.desde}</td>
                  <td className="px-3 py-2 text-slate-500">{certificacion.hasta}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => eliminarCertificacion(indice)}
                      className="text-red-500 hover:text-red-700"
                      aria-label={`Eliminar certificación de ${nombreVisible}`}
                    >
                      ❌
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Certificaciones;
