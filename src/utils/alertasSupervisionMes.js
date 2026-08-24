const catalogo = (titulo, detalle, severidad, accion, alcance = "diario") => ({
  titulo, detalle, severidad, accion, alcance
});

const CATALOGO = Object.freeze({
  ASIGNACION_PARCIAL_NO_APLICADA: catalogo("Asignaci\u00f3n parcial no aplicada", "La asignaci\u00f3n parcial no pudo incorporarse al c\u00e1lculo del d\u00eda.", "atencion", "revisar_registro"),
  IDENTIDAD_AMBIGUA: catalogo("Referencia con identidad ambigua", "La referencia coincide con m\u00e1s de una persona.", "atencion", "revisar_identidad"),
  REFERENCIA_NO_RESUELTA: catalogo("Persona de Planilla no encontrada", "No se pudo asociar la referencia de Planilla con una persona.", "atencion", "revisar_identidad"),
  PERSONA_SIN_IDENTIDAD: catalogo("Persona sin identidad estable", "La persona no posee una identidad suficiente para el c\u00e1lculo.", "atencion", "revisar_identidad"),
  LICENCIA_PERSONA_NO_RESUELTA: catalogo("Licencia sin persona identificable", "No se pudo asociar una Licencia activa con una persona.", "atencion", "revisar_registro"),
  CERTIFICACION_PERSONA_NO_RESUELTA: catalogo("Certificaci\u00f3n sin persona identificable", "No se pudo asociar una Certificaci\u00f3n activa con una persona.", "atencion", "revisar_registro"),
  NOVEDAD_PERSONA_NO_RESUELTA: catalogo("Novedad sin persona identificable", "No se pudo asociar la Novedad con una persona.", "atencion", "revisar_registro"),
  NO_DISPONIBLE_PERSONA_NO_RESUELTA: catalogo("No disponible sin persona identificable", "No se pudo asociar el registro de No disponible con una persona.", "atencion", "revisar_registro"),
  EXTRA_SIN_IDENTIDAD: catalogo("Extra sin identidad suficiente", "El Extra no contiene datos suficientes para identificar a la persona.", "atencion", "revisar_extra"),
  EXTRA_INDISPONIBLE_EN_TURNO_ORIGEN: catalogo("Extra bloqueado por indisponibilidad en origen", "La persona posee una indisponibilidad activa en su turno de origen.", "atencion", "revisar_extra"),
  EXTRA_ORIGEN_NO_VERIFICABLE: catalogo("Extra de otro turno sin verificaci\u00f3n completa", "No se pudo confirmar autom\u00e1ticamente la disponibilidad en su turno de origen.", "informacion", "revisar_extra"),
  EXTRA_CON_INDISPONIBILIDAD_ACTIVA: catalogo("Extra con indisponibilidad activa", "El Extra coincide con una persona que posee una indisponibilidad activa.", "atencion", "revisar_extra"),
  ASISTENCIA_FUERA_DE_DOTACION: catalogo("Asistencia registrada fuera de la dotaci\u00f3n", "Existen registros de asistencia que no pertenecen a la dotaci\u00f3n calculada.", "atencion", "revisar_registro"),
  TURNO_INVALIDO: catalogo("Turno de Supervisi\u00f3n inv\u00e1lido", "El turno recibido no pertenece al contrato vigente.", "error", "revisar_configuracion", "mensual"),
  CATEGORIA_INVALIDA: catalogo("Categor\u00eda de Supervisi\u00f3n inv\u00e1lida", "La categor\u00eda recibida no pertenece al contrato vigente.", "error", "revisar_configuracion", "mensual"),
  MES_INVALIDO: catalogo("Mes de Supervisi\u00f3n inv\u00e1lido", "El mes no posee el formato esperado.", "error", "revisar_configuracion", "mensual"),
  FECHA_INVALIDA: catalogo("Fecha de Supervisi\u00f3n inv\u00e1lida", "La fecha no pudo interpretarse de forma segura.", "error", "revisar_registro"),
  FECHA_FUERA_DEL_MES: catalogo("Fecha fuera del mes consultado", "La fecha no pertenece al mes de la proyecci\u00f3n.", "error", "revisar_registro"),
  ESTADO_MENSUAL_INEXISTENTE: catalogo("Estado mensual no disponible", "No existe un estado mensual utilizable para esta combinaci\u00f3n.", "error", "preparar_planilla", "mensual"),
  PLANILLA_NO_PREPARADA: catalogo("Planilla mensual no preparada", "La Planilla de la categor\u00eda no fue preparada para el mes.", "error", "preparar_planilla", "mensual"),
  PERIODO_NO_PREPARADO: catalogo("Per\u00edodo de Planilla no preparado", "El per\u00edodo correspondiente no contiene una distribuci\u00f3n preparada.", "error", "preparar_planilla", "periodo"),
  CONFIGURACION_INVALIDA: catalogo("Configuraci\u00f3n de dotaci\u00f3n inv\u00e1lida", "La configuraci\u00f3n de dotaci\u00f3n no tiene una estructura v\u00e1lida.", "error", "revisar_configuracion", "mensual"),
  UMBRAL_INCOMPLETO: catalogo("Umbral de dotaci\u00f3n incompleto", "Falta el m\u00ednimo o el \u00f3ptimo de la configuraci\u00f3n.", "error", "revisar_configuracion", "mensual"),
  MINIMO_INVALIDO: catalogo("M\u00ednimo de dotaci\u00f3n inv\u00e1lido", "El m\u00ednimo configurado no es v\u00e1lido.", "error", "revisar_configuracion", "mensual"),
  OPTIMO_INVALIDO: catalogo("\u00d3ptimo de dotaci\u00f3n inv\u00e1lido", "El \u00f3ptimo configurado no es v\u00e1lido.", "error", "revisar_configuracion", "mensual"),
  OPTIMO_MENOR_QUE_MINIMO: catalogo("Umbral de dotaci\u00f3n inconsistente", "El \u00f3ptimo configurado es menor que el m\u00ednimo.", "error", "revisar_configuracion", "mensual"),
  CANTIDAD_INVALIDA: catalogo("Cantidad de dotaci\u00f3n inv\u00e1lida", "La cantidad recibida no puede evaluarse con los umbrales vigentes.", "error", "revisar_configuracion", "mensual")
});

const CAMPOS_OPCIONALES = Object.freeze([
  "fecha", "turno", "categoria", "personaId", "turnoOrigen", "motivo",
  "clavePeriodo", "asignacionId", "novedadId", "indice", "cantidad",
  "filaId", "sectorId", "turnanteId", "campo", "valor"
]);

const texto = (valor) => typeof valor === "string" ? valor.trim() : "";
const lista = (valor) => Array.isArray(valor) ? valor : [];
const copiar = (valor) => valor && typeof valor === "object" ? structuredClone(valor) : valor;

const configuracionDesconocida = (tipo) => tipo === "advertencia"
  ? catalogo("Advertencia de calidad de datos", "Se detect\u00f3 una situaci\u00f3n que requiere revisi\u00f3n.", "atencion", "revisar_registro")
  : catalogo("Error de datos", "No se pudo procesar completamente parte de la informaci\u00f3n.", "error", "sin_accion");

const clavePresentacion = ({ mes, codigo, origen, alcance, datos }) => {
  const partes = [alcance, mes, codigo || origen];
  if (alcance === "diario") partes.push(datos.fecha || "");
  partes.push(datos.turno || "", datos.categoria || "");
  if (alcance === "periodo") partes.push(datos.clavePeriodo || "");
  if (alcance === "diario") {
    partes.push(
      datos.personaId || "", datos.turnoOrigen || "", datos.novedadId || "",
      datos.asignacionId || "", datos.indice ?? "", datos.motivo || "",
      lista(datos.causas).slice().sort().join(",")
    );
  }
  return partes.map((parte) => String(parte)).join("|");
};

const crearAlerta = ({ item = {}, tipo, origen, mes, fecha, resultadoUtilizable }) => {
  const codigo = texto(item?.codigo) || null;
  const conocida = codigo ? CATALOGO[codigo] : null;
  const presentacion = conocida || configuracionDesconocida(tipo);
  const alcance = presentacion.alcance;
  const datos = {};
  CAMPOS_OPCIONALES.forEach((campo) => {
    const valor = campo === "fecha" ? fecha : item?.[campo];
    if (valor !== undefined && valor !== null && valor !== "") datos[campo] = copiar(valor);
  });
  if (alcance !== "diario") delete datos.fecha;
  if (alcance === "periodo" && !datos.clavePeriodo) delete datos.fecha;
  if (Array.isArray(item?.causas)) datos.causas = [...item.causas];
  const clave = clavePresentacion({ mes, codigo, origen, alcance, datos });
  const detalleExistente = texto(item?.mensaje);
  return {
    id: `alerta:${clave}`,
    origen,
    codigo,
    tipo: tipo === "advertencia"
      ? "advertencia"
      : (!resultadoUtilizable && origen === "proyeccion_mensual" ? "error_total" : "error_parcial"),
    severidad: presentacion.severidad,
    alcance,
    titulo: presentacion.titulo,
    detalle: detalleExistente || presentacion.detalle,
    accion: presentacion.accion,
    ...datos,
    _clave: clave
  };
};

const crearAlertaCarga = ({ origen, mensaje, mes }) => {
  const esEstados = origen === "carga_estados";
  const clave = `global|${mes}|${origen}`;
  return {
    id: `alerta:${clave}`,
    origen,
    codigo: null,
    tipo: "error_parcial",
    severidad: "error",
    alcance: "global",
    titulo: esEstados ? "No se pudieron cargar los estados mensuales" : "No se pudieron cargar todas las Novedades",
    detalle: mensaje,
    accion: "reintentar_carga",
    _clave: clave
  };
};

const ordenarAlertas = (a, b) => {
  const prioridad = { error: 0, atencion: 1, informacion: 2 };
  const porPrioridad = prioridad[a.severidad] - prioridad[b.severidad];
  if (porPrioridad !== 0) return porPrioridad;
  const porFecha = texto(b.fecha).localeCompare(texto(a.fecha));
  if (porFecha !== 0) return porFecha;
  return [a.turno, a.categoria, a.titulo, a.id].map((v) => texto(v)).join("|")
    .localeCompare([b.turno, b.categoria, b.titulo, b.id].map((v) => texto(v)).join("|"));
};

export const construirAlertasSupervisionMes = (resultadoMensual, erroresCarga = {}) => {
  const mes = texto(resultadoMensual?.mes);
  const resultadoUtilizable = resultadoMensual?.ok === true && Array.isArray(resultadoMensual?.dias);
  const candidatas = [];
  let advertenciasCrudas = 0;
  let erroresCrudos = 0;

  lista(resultadoMensual?.dias).forEach((dia) => {
    const fecha = texto(dia?.fecha);
    lista(dia?.advertencias).forEach((item) => {
      advertenciasCrudas += 1;
      candidatas.push(crearAlerta({ item, tipo: "advertencia", origen: "proyeccion_diaria", mes, fecha, resultadoUtilizable }));
    });
    lista(dia?.errores).forEach((item) => {
      erroresCrudos += 1;
      candidatas.push(crearAlerta({ item, tipo: "error", origen: "proyeccion_diaria", mes, fecha, resultadoUtilizable }));
    });
  });
  lista(resultadoMensual?.errores).forEach((item) => {
    erroresCrudos += 1;
    candidatas.push(crearAlerta({ item, tipo: "error", origen: "proyeccion_mensual", mes, resultadoUtilizable }));
  });
  [
    ["carga_estados", erroresCarga?.estados],
    ["carga_novedades", erroresCarga?.novedades]
  ].forEach(([origen, valor]) => {
    const mensaje = texto(valor);
    if (!mensaje) return;
    erroresCrudos += 1;
    candidatas.push(crearAlertaCarga({ origen, mensaje, mes }));
  });

  const unicas = new Map();
  candidatas.forEach((alerta) => {
    if (!unicas.has(alerta._clave)) unicas.set(alerta._clave, alerta);
  });
  const alertas = [...unicas.values()].map((alerta) => {
    const salida = { ...alerta };
    delete salida._clave;
    return salida;
  }).sort(ordenarAlertas);
  const diasAfectados = new Set(alertas.map((alerta) => alerta.fecha).filter(Boolean));

  return {
    ok: resultadoUtilizable,
    mes,
    fuente: "proyeccion_supervision_mes",
    alertas,
    resumen: {
      alertasPresentadas: alertas.length,
      advertenciasPresentadas: alertas.filter((alerta) => alerta.tipo === "advertencia").length,
      erroresPresentados: alertas.filter((alerta) => alerta.tipo !== "advertencia").length,
      diasAfectados: diasAfectados.size
    },
    conteosCrudos: {
      advertencias: advertenciasCrudas,
      errores: erroresCrudos
    }
  };
};
