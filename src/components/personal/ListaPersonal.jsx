import { useState } from "react";
import { normalizar } from "../../utils/texto";
import { obtenerDiasLibresDelMes } from "../../utils/fechas";

function ListaPersonal({ personal, setPersonal, mesActivo }) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("enfermero");
  const [rol, setRol] = useState("titular");
  const [libre, setLibre] = useState(1);
  const [horario, setHorario] = useState("normal");
  const [maternal, setMaternal] = useState(false);
  const [funcionario, setFuncionario] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [errorNombre, setErrorNombre] = useState("");

  const formatearDias = (dias) => {
    if (dias.length === 0) return "Sin días";
    if (dias.length === 1) return String(dias[0]);
    if (dias.length === 2) return `${dias[0]} y ${dias[1]}`;

    return `${dias.slice(0, -1).join(", ")} y ${dias[dias.length - 1]}`;
  };

  const nombreMes = (() => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesActivo || "")) return "";

    const [anio, mes] = mesActivo.split("-").map(Number);
    const nombre = new Intl.DateTimeFormat("es-UY", { month: "long" }).format(
      new Date(anio, mes - 1, 1, 12)
    );

    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  })();

  const textoDiasGrupo = (grupo) => {
    const dias = obtenerDiasLibresDelMes(grupo, mesActivo);
    return nombreMes ? `${nombreMes}: ${formatearDias(dias)}` : "";
  };

  const agregar = () => {
    const nombreLimpio = nombre.trim();

    if (!nombreLimpio) {
      setErrorNombre("Ingresá un nombre.");
      return;
    }

    // 🔴 evitar duplicados por nombre
    const existe = personal.some(
      (p) => normalizar(p.nombre) === normalizar(nombreLimpio)
    );

    if (existe) {
      setErrorNombre("Ya existe una persona con ese nombre.");
      return;
    }

    const nuevo = {
      nombre: nombreLimpio,
      categoria,
      rol,
      libre: Number(libre),
      horario,
      maternal,
      funcionario: funcionario.trim()
    };

    const nuevaLista = [...personal, nuevo].sort((a, b) =>
      a.nombre.localeCompare(b.nombre)
    );

    setPersonal(nuevaLista);

    // reset
    setNombre("");
    setFuncionario("");
    setMaternal(false);
    setHorario("normal");
    setErrorNombre("");
  };

  

  const limpiarTodo = () => {
    if (confirm("¿Seguro querés borrar todo?")) {
      setPersonal([]);
    }
  };

  const filtrados = personal.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const textoHorario = (h) => {
    if (h === "entraAntes") return "11:30 - 17:30";
    if (h === "entraDespues") return "12:30 - 18:30";
    return "12 - 18";
  };

  return (
    <div className="space-y-4">
      {/* 🔍 BUSCADOR */}
      <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        placeholder="Buscar..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        />

      {/* ➕ FORMULARIO */}
      <div className="flex flex-wrap gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            setErrorNombre("");
          }}
        />

        <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          placeholder="N° funcionario"
          value={funcionario}
          onChange={(e) => setFuncionario(e.target.value)}
        />

        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="enfermero">Enfermero</option>
          <option value="licenciado">Licenciado</option>
        </select>

        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="titular">Titular</option>
          <option value="suplente">Suplente</option>
        </select>

        <select className="max-w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={libre} onChange={(e) => setLibre(e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Grupo {n} — {textoDiasGrupo(n)}
            </option>
          ))}
        </select>

        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={horario} onChange={(e) => setHorario(e.target.value)}>
          <option value="normal">12 - 18</option>
          <option value="entraAntes">11:30 - 17:30</option>
          <option value="entraDespues">12:30 - 18:30</option>
        </select>

        <label className="flex items-center gap-1 text-sm">
          <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
             type="checkbox"
            checked={maternal}
            onChange={(e) => setMaternal(e.target.checked)}
          />
          Maternal
        </label>

        <button
  onClick={agregar}
  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
>
  Agregar
</button>

        {errorNombre && (
          <p className="w-full text-sm text-red-600" role="alert">
            {errorNombre}
          </p>
        )}
      </div>

      {/* 🧹 LIMPIAR */}
      <button
        onClick={limpiarTodo}
        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm transition"
      >
        🗑 Limpiar lista
      </button>

    <div className="overflow-x-auto">
  <table className="w-full text-sm">
    
    <thead className="bg-slate-100 text-slate-700">
      <tr>
        <th className="px-3 py-2 text-left">Nombre</th>
        <th className="px-3 py-2 text-left">Categoría</th>
        <th className="px-3 py-2 text-left">Rol</th>
        <th className="px-3 py-2 text-left">Grupo 4x1</th>
        <th className="px-3 py-2 text-left">Horario</th>
        <th className="px-3 py-2 text-left">M</th>
        <th className="px-3 py-2 text-left">Func.</th>
        <th className="px-3 py-2 text-left">❌</th>
      </tr>
    </thead>

    <tbody className="divide-y divide-slate-100">
      {filtrados.map((p) => (
        <tr key={p.nombre} className="hover:bg-slate-50 transition">
          <td className="px-3 py-2 font-medium text-slate-700">
  {p.nombre}
  <span className="text-slate-400 text-xs ml-1">
    ({textoHorario(p.horario)})
  </span>
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    value={p.categoria}
    onChange={(e) => {
      const nueva = personal.map((per) =>
        per.nombre === p.nombre
          ? { ...per, categoria: e.target.value }
          : per
      );
      setPersonal(nueva);
    }}
  >
    <option value="enfermero">Enfermero</option>
    <option value="licenciado">Licenciado</option>
  </select>
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    value={p.rol}
    onChange={(e) => {
      const nueva = personal.map((per) =>
        per.nombre === p.nombre
          ? { ...per, rol: e.target.value }
          : per
      );
      setPersonal(nueva);
    }}
  >
    <option value="titular">Titular</option>
    <option value="suplente">Suplente</option>
  </select>
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    value={p.libre}
    onChange={(e) => {
      const nueva = personal.map((per) =>
        per.nombre === p.nombre
          ? { ...per, libre: Number(e.target.value) }
          : per
      );
      setPersonal(nueva);
    }}
  >
    {[1,2,3,4,5].map(n => (
      <option key={n} value={n}>Grupo {n}</option>
    ))}
  </select>
  <p className="mt-1 max-w-48 text-xs leading-4 text-slate-500">
    {textoDiasGrupo(p.libre)}
  </p>
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    value={p.horario}
    onChange={(e) => {
      const nueva = personal.map((per) =>
        per.nombre === p.nombre
          ? { ...per, horario: e.target.value }
          : per
      );
      setPersonal(nueva);
    }}
  >
    <option value="normal">12-18</option>
    <option value="entraAntes">11:30-17:30</option>
    <option value="entraDespues">12:30-18:30</option>
  </select>
</td>

<td className="px-3 py-2">
  <input
    type="checkbox"
    checked={p.maternal}
    onChange={(e) => {
      const nueva = personal.map((per) =>
        per.nombre === p.nombre
          ? { ...per, maternal: e.target.checked }
          : per
      );
      setPersonal(nueva);
    }}
  />
</td>

<td className="px-3 py-2">
  <input
    className="w-20 border border-slate-200 rounded px-2 py-1 text-xs"
    value={p.funcionario || ""}
    onChange={(e) => {
      const nueva = personal.map((per) =>
        per.nombre === p.nombre
          ? { ...per, funcionario: e.target.value }
          : per
      );
      setPersonal(nueva);
    }}
  />
</td>

<td className="px-3 py-2">
  <button
    className="text-red-500 hover:text-red-700 transition"
    onClick={() => {
      const nueva = personal.filter(per => per.nombre !== p.nombre);
      setPersonal(nueva);
    }}
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

export default ListaPersonal;
