const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const obtenerId = (valor) => String(valor ?? "").trim();

const renombrarReferencia = (referencia, personaId, nombre) => {
  if (!esObjeto(referencia) || obtenerId(referencia.personaId) !== personaId) {
    return referencia;
  }
  return referencia.nombre === nombre ? referencia : { ...referencia, nombre };
};

const renombrarPlanilla = (planilla, personaId, nombre) => {
  if (!esObjeto(planilla)) return planilla;
  return Object.fromEntries(
    Object.entries(planilla).map(([semana, celdas]) => [
      semana,
      esObjeto(celdas)
        ? Object.fromEntries(
            Object.entries(celdas).map(([sector, referencia]) => [
              sector,
              renombrarReferencia(referencia, personaId, nombre)
            ])
          )
        : celdas
    ])
  );
};

const renombrarReferenciasPorDia = (valoresPorDia, personaId, nombre) => {
  if (!esObjeto(valoresPorDia)) return valoresPorDia;
  return Object.fromEntries(
    Object.entries(valoresPorDia).map(([fecha, valor]) => {
      if (Array.isArray(valor)) {
        return [fecha, valor.map((item) => renombrarReferencia(item, personaId, nombre))];
      }
      if (esObjeto(valor)) {
        return [
          fecha,
          Object.fromEntries(
            Object.entries(valor).map(([clave, item]) => [
              clave,
              renombrarReferencia(item, personaId, nombre)
            ])
          )
        ];
      }
      return [fecha, valor];
    })
  );
};

const renombrarExtrasPorDia = (extrasPorDia, personaId, nombre) => {
  if (!esObjeto(extrasPorDia)) return extrasPorDia;
  return Object.fromEntries(
    Object.entries(extrasPorDia).map(([fecha, extras]) => [
      fecha,
      Array.isArray(extras)
        ? extras.map((extra) =>
            esObjeto(extra) &&
            !extra.temporal &&
            obtenerId(extra.id) === personaId
              ? { ...extra, nombre }
              : extra
          )
        : extras
    ])
  );
};

const renombrarCalendario = (calendario, personaId, nombre) => {
  if (!esObjeto(calendario)) return calendario;
  return Object.fromEntries(
    Object.entries(calendario).map(([categoria, datos]) => {
      if (!esObjeto(datos)) return [categoria, datos];
      return [
        categoria,
        {
          ...datos,
          ...(Object.hasOwn(datos, "noDisponibles")
            ? { noDisponibles: renombrarReferenciasPorDia(datos.noDisponibles, personaId, nombre) }
            : {}),
          ...(Object.hasOwn(datos, "cambiosDia")
            ? { cambiosDia: renombrarReferenciasPorDia(datos.cambiosDia, personaId, nombre) }
            : {}),
          ...(Object.hasOwn(datos, "cambiosParoDia")
            ? { cambiosParoDia: renombrarReferenciasPorDia(datos.cambiosParoDia, personaId, nombre) }
            : {}),
          ...(Object.hasOwn(datos, "extras")
            ? { extras: renombrarExtrasPorDia(datos.extras, personaId, nombre) }
            : {})
        }
      ];
    })
  );
};

const renombrarRegistros = (registros, personaId, nombre) =>
  Array.isArray(registros)
    ? registros.map((registro) =>
        esObjeto(registro) && obtenerId(registro.personaId) === personaId
          ? { ...registro, nombre }
          : registro
      )
    : registros;

export const renombrarPersonaEnEstado = (estado, personaId, nombreNuevo) => {
  if (!esObjeto(estado)) return estado;
  const id = obtenerId(personaId);
  if (!id) return estado;

  return {
    ...estado,
    personal: Array.isArray(estado.personal)
      ? estado.personal.map((persona) =>
          obtenerId(persona?.id) === id ? { ...persona, nombre: nombreNuevo } : persona
        )
      : estado.personal,
    planillas: esObjeto(estado.planillas)
      ? Object.fromEntries(
          Object.entries(estado.planillas).map(([categoria, planilla]) => [
            categoria,
            renombrarPlanilla(planilla, id, nombreNuevo)
          ])
        )
      : estado.planillas,
    calendario: renombrarCalendario(estado.calendario, id, nombreNuevo),
    licencias: renombrarRegistros(estado.licencias, id, nombreNuevo),
    certificaciones: renombrarRegistros(estado.certificaciones, id, nombreNuevo)
  };
};
