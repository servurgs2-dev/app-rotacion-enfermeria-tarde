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
      semana === "asignacionesParciales" && esObjeto(celdas)
        ? Object.fromEntries(
            Object.entries(celdas).map(([periodo, asignaciones]) => [
              periodo,
              Array.isArray(asignaciones)
                ? asignaciones.map((asignacion) =>
                    esObjeto(asignacion) &&
                    obtenerId(asignacion.personaId) === personaId
                      ? { ...asignacion, nombre }
                      : asignacion
                  )
                : asignaciones
            ])
          )
        : esObjeto(celdas)
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

const renombrarNoDisponiblesPorDia = (valoresPorDia, personaId, nombre) => {
  if (!esObjeto(valoresPorDia)) return valoresPorDia;
  return Object.fromEntries(
    Object.entries(valoresPorDia).map(([fecha, valor]) => [
      fecha,
      Array.isArray(valor)
        ? valor.map((item) => {
            const referencia = renombrarReferencia(item, personaId, nombre);
            if (
              esObjeto(referencia) &&
              obtenerId(referencia.personaCoberturaId) === personaId
            ) {
              return { ...referencia, personaCoberturaNombre: nombre };
            }
            return referencia;
          })
        : valor
    ])
  );
};

const renombrarExtrasPorDia = (extrasPorDia, personaId, nombre) => {
  if (!esObjeto(extrasPorDia)) return extrasPorDia;
  return Object.fromEntries(
    Object.entries(extrasPorDia).map(([fecha, extras]) => [
      fecha,
      Array.isArray(extras)
        ? extras.map((extra) => {
            if (!esObjeto(extra)) return extra;
            const esExtraPermanente =
              !extra.temporal &&
              (
                obtenerId(extra.personaId) === personaId ||
                obtenerId(extra.id) === personaId
              );
            const esPersonaCubierta =
              obtenerId(extra.personaCubiertaId) === personaId;
            if (!esExtraPermanente && !esPersonaCubierta) return extra;
            return {
              ...extra,
              ...(esExtraPermanente ? { nombre } : {}),
              ...(esPersonaCubierta ? { personaCubiertaNombre: nombre } : {})
            };
          })
        : extras
    ])
  );
};

const renombrarAsistenciaPorDia = (asistenciaPorDia, personaId, nombre) => {
  if (!esObjeto(asistenciaPorDia)) return asistenciaPorDia;
  return Object.fromEntries(
    Object.entries(asistenciaPorDia).map(([fecha, registros]) => [
      fecha,
      esObjeto(registros)
        ? Object.fromEntries(
            Object.entries(registros).map(([clave, registro]) => [
              clave,
              esObjeto(registro)
                ? {
                    ...registro,
                    persona: renombrarReferencia(registro.persona, personaId, nombre)
                  }
                : registro
            ])
          )
        : registros
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
            ? { noDisponibles: renombrarNoDisponiblesPorDia(datos.noDisponibles, personaId, nombre) }
            : {}),
          ...(Object.hasOwn(datos, "cambiosDia")
            ? { cambiosDia: renombrarReferenciasPorDia(datos.cambiosDia, personaId, nombre) }
            : {}),
          ...(Object.hasOwn(datos, "cambiosParoDia")
            ? { cambiosParoDia: renombrarReferenciasPorDia(datos.cambiosParoDia, personaId, nombre) }
            : {}),
          ...(Object.hasOwn(datos, "extras")
            ? { extras: renombrarExtrasPorDia(datos.extras, personaId, nombre) }
            : {}),
          ...(Object.hasOwn(datos, "asistenciaDia")
            ? { asistenciaDia: renombrarAsistenciaPorDia(datos.asistenciaDia, personaId, nombre) }
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
