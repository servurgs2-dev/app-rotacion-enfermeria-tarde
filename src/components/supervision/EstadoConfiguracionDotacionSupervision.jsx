const PRESENTACION_ORIGEN = Object.freeze({
  persistida: {
    titulo: "Configuración guardada para este mes",
    detalle: "Los cálculos usan los umbrales guardados para el mes seleccionado."
  },
  fallback_codigo: {
    titulo: "Valores generales",
    detalle: "No existe una configuración mensual previa."
  }
});

function EstadoConfiguracionDotacionSupervision({ configuracionMes }) {
  const conError = Boolean(configuracionMes?.error);
  const heredada = configuracionMes?.origen === "heredada";
  const presentacion = conError
    ? {
      titulo: "Valores generales por fallo de carga",
      detalle: "No se pudo cargar la configuración mensual de dotación. Se están usando los valores generales."
    }
    : heredada
      ? {
        titulo: `Valores heredados de ${configuracionMes.heredadaDesdeMes || "un mes anterior"}`,
        detalle: "Aún no están guardados para este mes."
      }
      : PRESENTACION_ORIGEN[configuracionMes?.origen] || PRESENTACION_ORIGEN.fallback_codigo;

  return (
    <section
      aria-label="Umbrales de dotación"
      role={conError ? "status" : undefined}
      className={`min-w-0 rounded-xl border px-3 py-2 text-sm ${conError
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-slate-200 bg-white text-slate-700"}`}
    >
      <p className="font-bold">Umbrales de dotación</p>
      <p className="mt-0.5 break-words font-semibold">{presentacion.titulo}</p>
      <p className="mt-0.5 break-words text-xs opacity-80">{presentacion.detalle}</p>
    </section>
  );
}

export default EstadoConfiguracionDotacionSupervision;
