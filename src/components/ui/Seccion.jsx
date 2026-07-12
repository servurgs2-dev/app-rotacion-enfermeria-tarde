import { useState } from "react";

function Seccion({ titulo, children, className = "" }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className={`${className} bg-white rounded-2xl shadow-sm border border-slate-200`}>

      {/* HEADER */}
      <div
        onClick={() => setAbierto(!abierto)}
        className="cursor-pointer px-5 py-4 flex justify-between items-center hover:bg-slate-50 transition"
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
      </div>

      {/* CONTENIDO */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          abierto ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="px-5 pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Seccion;
