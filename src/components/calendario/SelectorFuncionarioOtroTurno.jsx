export default function SelectorFuncionarioOtroTurno({
  modalidad,
  candidatos = [],
  cargando = false,
  personaId = "",
  nombre = "",
  funcionario = "",
  onCambiar
}) {
  const esPersonal = modalidad === "personal_otro_turno";
  return (
    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onCambiar("modalidad", "personal_otro_turno")} className={`rounded-lg border px-3 py-2 text-sm ${esPersonal ? "border-blue-500 bg-white text-blue-800" : "border-slate-300"}`}>
          Personal de otro turno
        </button>
        <button type="button" onClick={() => onCambiar("modalidad", "manual")} className={`rounded-lg border px-3 py-2 text-sm ${!esPersonal ? "border-blue-500 bg-white text-blue-800" : "border-slate-300"}`}>
          Cargar Extra manual
        </button>
      </div>
      {esPersonal ? (
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Funcionario de otro turno
          <select value={personaId} disabled={cargando} onChange={(evento) => {
            if (evento.target.value === "__MANUAL__") onCambiar("modalidad", "manual");
            else onCambiar("personaId", evento.target.value);
          }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value="">{cargando ? "Cargando Personal…" : "Seleccionar persona"}</option>
            {candidatos.map((candidato) => (
              <option key={`${candidato.turnoOrigen}|${candidato.persona.id}`} value={`${candidato.turnoOrigen}|${candidato.persona.id}`}>
                {candidato.etiqueta}
              </option>
            ))}
            <option value="__MANUAL__">+ Cargar Extra manual</option>
          </select>
        </label>
      ) : (
        <>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Nombre
            <input value={nombre} onChange={(evento) => onCambiar("nombre", evento.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Número de funcionario (opcional)
            <input value={funcionario} onChange={(evento) => onCambiar("funcionario", evento.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
        </>
      )}
    </div>
  );
}
