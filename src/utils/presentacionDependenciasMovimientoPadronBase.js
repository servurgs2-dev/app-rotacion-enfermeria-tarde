const texto = (valor) => String(valor ?? "").trim();

const extraerPartesRuta = (ruta) => texto(ruta)
  .split("/")
  .map((parte) => parte.trim())
  .filter(Boolean);

const formatearFecha = (valor) => {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(valor));
  return coincidencia ? `${coincidencia[3]}/${coincidencia[2]}` : "";
};

const obtenerFechaRuta = (ruta) => formatearFecha(extraerPartesRuta(ruta)[0]);

const etiquetaBloqueo = ({ bloqueo, ruta, fechasConExtraVinculado }) => {
  if (bloqueo?.codigo === "REFERENCIA_LEGACY_AMBIGUA" ||
      bloqueo?.codigo === "EXTRA_REFERENCIA_LEGACY_AMBIGUA") {
    return "Registro anterior con identidad ambigua";
  }
  if (bloqueo?.codigo === "REFERENCIA_LEGACY_OPERATIVA_PENDIENTE") {
    return "Registro anterior pendiente de compatibilidad";
  }
  if (bloqueo?.ambito === "extras") return "Extra vinculado";

  const partes = extraerPartesRuta(ruta);
  const descripcion = partes.slice(1).join(" / ").toLocaleLowerCase("es");
  if (descripcion.includes("asistencia")) return "Asistencia registrada";
  if (descripcion.includes("cambio por paro")) return "Cambio por paro";
  if (descripcion.includes("cambio diario")) return "Cambio diario";
  if (descripcion.includes("no disponible")) {
    return fechasConExtraVinculado.has(obtenerFechaRuta(ruta))
      ? "Cambio con otro turno"
      : "No disponible con vínculo operativo";
  }
  return bloqueo?.ambito === "planilla"
    ? "Registro anterior de Planilla"
    : "Registro operativo pendiente";
};

const contextoRuta = (ruta) => {
  const partes = extraerPartesRuta(ruta);
  if (!formatearFecha(partes[0])) return "";
  return partes.slice(2).join(" · ");
};

export const presentarBloqueosMovimientoPadronBase = (bloqueos = []) => {
  const lista = Array.isArray(bloqueos) ? bloqueos : [];
  const fechasConExtraVinculado = new Set(
    lista
      .filter((bloqueo) => bloqueo?.ambito === "extras")
      .flatMap((bloqueo) => Array.isArray(bloqueo?.rutas) ? bloqueo.rutas : [])
      .map(obtenerFechaRuta)
      .filter(Boolean)
  );
  const lineas = lista.flatMap((bloqueo) => {
    const rutas = Array.isArray(bloqueo?.rutas) && bloqueo.rutas.length > 0
      ? bloqueo.rutas
      : [""];
    return rutas.map((ruta) => {
      const etiqueta = etiquetaBloqueo({ bloqueo, ruta, fechasConExtraVinculado });
      const fecha = obtenerFechaRuta(ruta);
      const contexto = contextoRuta(ruta);
      return [etiqueta, fecha && `— ${fecha}`, contexto && `· ${contexto}`]
        .filter(Boolean)
        .join(" ");
    });
  });
  return [...new Set(lineas)];
};
