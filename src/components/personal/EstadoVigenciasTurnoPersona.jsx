import { crearDetalleVigenciasPersonal } from "../../utils/presentacionVigenciasPersonal.js";

export default function EstadoVigenciasTurnoPersona({ mes, entrada, tieneDiagnostico }) {
  if (tieneDiagnostico || entrada?.invalida) {
    return (
      <p className="mt-1 max-w-64 rounded-md bg-amber-50 px-2 py-1 text-xs leading-4 text-amber-800" role="status">
        Hay un problema con la configuración de turno de este funcionario. No se aplicará automáticamente.
      </p>
    );
  }
  if (!entrada || entrada.origen !== "explicita") return null;

  const detalle = crearDetalleVigenciasPersonal({ mes, entrada });
  return (
    <div className="mt-1 max-w-64 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs leading-4 text-slate-700">
      <p className="font-medium text-blue-800">Turnos del mes</p>
      {detalle.rangos.map((rango) => <p key={rango.texto}>{rango.texto}</p>)}
      {detalle.huecos.map((hueco) => (
        <p key={hueco} className="text-amber-700">Sin turno base: {hueco}</p>
      ))}
    </div>
  );
}
