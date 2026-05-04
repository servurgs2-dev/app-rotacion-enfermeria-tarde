import { useState } from "react";

function Licencias({ personal, licencias, setLicencias }) {
  const [persona, setPersona] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const agregarLicencia = () => {
    if (!persona || !desde || !hasta) return;

    setLicencias([
      ...licencias,
      {
        nombre: persona,
        desde,
        hasta
      }
    ]);

    setPersona("");
    setDesde("");
    setHasta("");
  };

  const eliminarLicencia = (licencia) => {
    const nueva = licencias.filter(
      (l) =>
        !(
          l.nombre === licencia.nombre &&
          l.desde === licencia.desde &&
          l.hasta === licencia.hasta
        )
    );
    setLicencias(nueva);
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
            onChange={(e) => setPersona(e.target.value)}
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
            onChange={(e) => setDesde(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />

          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />

          <button
            onClick={agregarLicencia}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            Agregar
          </button>
        </div>
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
            {licencias.map((l) => (
              <tr key={`${l.nombre}-${l.desde}-${l.hasta}`} className="hover:bg-slate-50">
                
                <td className="px-3 py-2 font-medium text-slate-700">
                  {l.nombre}
                </td>

                <td className="px-3 py-2 text-slate-500">
                  {l.desde}
                </td>

                <td className="px-3 py-2 text-slate-500">
                  {l.hasta}
                </td>

                <td className="px-3 py-2">
                  <button
                    onClick={() => eliminarLicencia(l)}
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