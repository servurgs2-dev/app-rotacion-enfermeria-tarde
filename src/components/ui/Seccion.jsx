import { useState } from "react";

function Seccion({
  titulo,
  children,
  className = "",
  cuerpoClassName = "",
  defaultAbierto = false
}) {
  const [abierto, setAbierto] = useState(defaultAbierto);

  return (
    <div className={`${className} bg-white rounded-2xl shadow-sm border border-slate-200`}>

      {/* HEADER */}
      <button
        type="button"
        onClick={() => setAbierto((actual) => !actual)}
        className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50"
        aria-expanded={abierto}
      >
        <h2 className="font-semibold text-slate-800">
          {titulo}
        </h2>

        {/* ICONO */}
        <span
          className={`text-slate-400 transition-transform duration-200 ${
            abierto ? "rotate-180" : ""
          }`}
        >
          ⌄
        </span>
      </button>

      {/* CONTENIDO */}
      <div className={abierto ? "block" : "hidden"}>
        <div className={`min-h-0 px-5 pb-5 ${cuerpoClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default Seccion;
