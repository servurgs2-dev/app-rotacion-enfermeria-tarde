
function PlanillaMensual({ personal, planilla, setPlanilla, tipo, licencias, mesActivo }) {

    const personalFiltrado = personal.filter(
  (p) => p.categoria === tipo
);

let sectoresFijos = [];
let turnantes = [];
let posicionesTurnantes = [];

if (tipo === "enfermero") {
  sectoresFijos = [
    "REA 1",
    "EXPLORA 1",
    "1-3 + 21",
    "PRE INT 1",
    "DX 25-30",
    "8-13",
    "4-7",
    "SILLÓN 1",
    "14-19",
    "REA 2",
    "SILLON 2",
    "20-22-24",
    "PRE INT 2",
    "EXPLORA 2",
    "SM"
  ];

  turnantes = ["T1", "T2", "T3", "T4", "T5"];
  posicionesTurnantes = [2, 7, 10, 13, 14];

} else if (tipo === "licenciado") {
  sectoresFijos = [
    "Triage 1",
    "Estabiliza",
    "Reanimación + Sillones",
    "Observación 1",
    "Explora",
    "Triage 2",
    "Diagnostico",
    "Observación 2",
    "Preinternación",
    "Salud Mental"
  ];

  turnantes = ["T1", "T2", "T3"];
  posicionesTurnantes = [1, 7, 10];
}

  const filas = [];
  let tIndex = 0;

  sectoresFijos.forEach((s, i) => {
    filas.push(s);
    if (posicionesTurnantes.includes(i)) {
      filas.push(turnantes[tIndex]);
      tIndex++;
    }
  });

  function rotarArray(array, pasos) {
    const copia = [...array];
    for (let i = 0; i < pasos; i++) {
      copia.unshift(copia.pop());
    }
    return copia;
  }

  function mapear(array) {
    const obj = {};
    filas.forEach((f, i) => {
      obj[f] = array[i];
    });
    return obj;
  }

  function generarMes() {
    const base = filas.map(f => planilla.semana1?.[f] || "");

    setPlanilla({
      semana1: planilla.semana1,
      semana2: mapear(rotarArray(base, 1)),
      semana3: mapear(rotarArray(base, 2)),
      semana4: mapear(rotarArray(base, 3)),
      semana5: mapear(rotarArray(base, 4))
    });
  }

  
  function actualizarCelda(semana, sector, valor) {
    setPlanilla(prev => ({
      ...prev,
      [semana]: {
        ...(prev?.[semana] ||{}),
        [sector]: valor
      }
    }));
  }
      function estaDeLicencia(nombre, fecha) {
  return licencias.some((l) => {
    if (l.nombre !== nombre) return false;

    const f = new Date(fecha);
    const desde = new Date(l.desde);
    const hasta = new Date(l.hasta);

    return f >= desde && f <= hasta;
  });
}

function obtenerSemanasDelMes(mesActivo) {
  if (!mesActivo) return [];
  const [year, month] = mesActivo.split("-").map(Number);

  const primerDia = new Date(year, month - 1, 1);

  // ir al lunes anterior (o el mismo si ya es lunes)
  const inicio = new Date(primerDia);
  const dia = inicio.getDay();
  inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1));

  const semanas = [];

  for (let i = 0; i < 5; i++) {
    const desde = new Date(inicio);
    desde.setDate(inicio.getDate() + i * 7);

    const hasta = new Date(desde);
    hasta.setDate(desde.getDate() + 6);

    semanas.push({ desde, hasta });
  }

  return semanas;
}

const semanas = obtenerSemanasDelMes(mesActivo);

//return principal
return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">
  Planilla Mensual
</h2>
<div className="overflow-x-auto">
      <table className="min-w-full border border-slate-200 rounded-xl overflow-hidden text-sm">
<thead className="bg-slate-100 text-slate-700">
  <tr>
    <th className="px-4 py-3 text-left font-semibold">Sector</th>

    {semanas.map((s, i) => (
      <th key={i} className="px-4 py-3 text-left font-semibold">
        {`${s.desde.getDate()}/${s.desde.getMonth() + 1} - ${s.hasta.getDate()}/${s.hasta.getMonth() + 1}`}
      </th>
    ))}
  </tr>
</thead>

        <tbody className="divide-y divide-slate-100">
          {filas.map((sector) => (
            <tr key={sector} className="hover:bg-slate-50 transition">
              <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50">
  {sector}
</td>

              {/* SEMANA 1 editable */}
              <td className="px-3 py-2">
                <select
  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={planilla.semana1?.[sector] || ""}
                  onChange={(e) =>
                    actualizarCelda("semana1", sector, e.target.value)
                  }
                >
                  <option value="">-- elegir --</option>

                  {personalFiltrado
  .filter((p) => {
  const usados = Object.values(planilla.semana1 ||{});

  const disponible =
    !usados.includes(p.nombre) ||
    planilla.semana1?.[sector] === p.nombre;

const noLicencia = !estaDeLicencia(p.nombre, semanas[0].desde);

  return disponible && noLicencia;
})
  .map((p) => (
                    <option key={p.nombre} value={p.nombre}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </td>

              {/* SEMANAS AUTOMÁTICAS */}
              {["semana2", "semana3", "semana4", "semana5"].map((sem, index) => (
  <td key={sem} className="px-3 py-2">
    <select
  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      value={planilla[sem]?.[sector] || ""}
      onChange={(e) =>
        actualizarCelda(sem, sector, e.target.value)
      }
    >
      <option value="">-- elegir --</option>

      {personalFiltrado
        .filter((p) => {
          const usados = Object.values(planilla[sem] || {});

          const disponible =
            !usados.includes(p.nombre) ||
            planilla[sem]?.[sector] === p.nombre;

          const fechaSemana = semanas[index + 1].desde;

          const noLicencia = !estaDeLicencia(
            p.nombre,
            fechaSemana
          );

          return disponible && noLicencia;
        })
        .map((p) => (
          <option key={p.nombre} value={p.nombre}>
            {p.nombre}
          </option>
        ))}
    </select>
  </td>
))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
<div className="pt-2"></div>
      

      <button
  onClick={generarMes}
  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-sm transition"
>
        🔄 Generar rotación automática
      </button>
    </div>
  );
}

export default PlanillaMensual;