import { useState } from "react";

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

    setCertificaciones([
      ...certificaciones,
      { nombre: persona, desde, hasta }
    ]);

    setPersona("");
    setDesde("");
    setHasta("");
    setError("");
  };

  const eliminarCertificacion = (certificacion) => {
    setCertificaciones(certificaciones.filter(
      (actual) => !(
        actual.nombre === certificacion.nombre &&
        actual.desde === certificacion.desde &&
        actual.hasta === certificacion.hasta
      )
    ));
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
              <option key={p.nombre} value={p.nombre}>
                {p.nombre}
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
            {certificaciones.map((certificacion) => (
              <tr
                key={`${certificacion.nombre}-${certificacion.desde}-${certificacion.hasta}`}
                className="hover:bg-slate-50"
              >
                <td className="px-3 py-2 font-medium text-slate-700">
                  {certificacion.nombre}
                </td>
                <td className="px-3 py-2 text-slate-500">{certificacion.desde}</td>
                <td className="px-3 py-2 text-slate-500">{certificacion.hasta}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => eliminarCertificacion(certificacion)}
                    className="text-red-500 hover:text-red-700"
                    aria-label={`Eliminar certificación de ${certificacion.nombre}`}
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

export default Certificaciones;
