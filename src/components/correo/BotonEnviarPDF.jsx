import { useState } from "react";
import ModalEnviarPDF from "./ModalEnviarPDF.jsx";

export default function BotonEnviarPDF({
  texto = "Enviar al mail institucional",
  ...props
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-sm transition hover:bg-blue-50"
      >
        {texto}
      </button>
      {abierto && (
        <ModalEnviarPDF
          {...props}
          abierto
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}
