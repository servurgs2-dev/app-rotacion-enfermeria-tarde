import { normalizar } from "./texto.js";
import {
  quitarPersonaDeListaReferencias,
  referenciaIdentificaPersona,
  referenciaCorrespondeAPersona
} from "./referenciasPersonas.js";
import { licenciaCorrespondeAPersona } from "./licenciasPersonas.js";
import { certificacionCorrespondeAPersona } from "./certificacionesPersonas.js";
import { personasCompartenId } from "./extrasPersonas.js";

const esObjetoPlano = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const coincidePersona = (nombre, persona) => {
  const nombreNormalizado = normalizar(nombre);
  const personaNormalizada = normalizar(persona?.nombre);

  return Boolean(nombreNormalizado && personaNormalizada) &&
    nombreNormalizado === personaNormalizada;
};

export const limpiarPersonaDePlanilla = (planilla, persona, personal = []) => {
  if (!esObjetoPlano(planilla)) return planilla;

  let huboCambios = false;
  const planillaLimpia = {};

  Object.entries(planilla).forEach(([clave, semana]) => {
    if (!clave.startsWith("semana") || !esObjetoPlano(semana)) {
      planillaLimpia[clave] = semana;
      return;
    }

    let semanaCambio = false;
    const semanaLimpia = {};

    Object.entries(semana).forEach(([sector, referencia]) => {
      if (referenciaCorrespondeAPersona(referencia, persona, personal)) {
        semanaLimpia[sector] = "";
        semanaCambio = true;
        huboCambios = true;
      } else {
        semanaLimpia[sector] = referencia;
      }
    });

    planillaLimpia[clave] = semanaCambio ? semanaLimpia : semana;
  });

  return huboCambios ? planillaLimpia : planilla;
};

const limpiarCambiosPorDia = (
  cambiosPorDia,
  persona,
  personal,
  usarReferencias = false,
  extrasPorDia = {}
) => {
  if (!esObjetoPlano(cambiosPorDia)) return cambiosPorDia;

  let huboCambios = false;
  const cambiosLimpios = {};

  Object.entries(cambiosPorDia).forEach(([fecha, cambiosDia]) => {
    if (!esObjetoPlano(cambiosDia)) {
      cambiosLimpios[fecha] = cambiosDia;
      return;
    }

    const candidatos = usarReferencias && Array.isArray(extrasPorDia?.[fecha])
      ? [...personal, ...extrasPorDia[fecha]]
      : personal;
    const cambiosDelDia = Object.fromEntries(
      Object.entries(cambiosDia).filter(([, referencia]) =>
        usarReferencias
          ? !referenciaIdentificaPersona(referencia, persona, candidatos)
          : !coincidePersona(referencia, persona)
      )
    );

    if (Object.keys(cambiosDelDia).length !== Object.keys(cambiosDia).length) {
      huboCambios = true;
    }

    if (Object.keys(cambiosDelDia).length > 0) {
      cambiosLimpios[fecha] = cambiosDelDia;
    } else if (Object.keys(cambiosDia).length === 0) {
      cambiosLimpios[fecha] = cambiosDia;
    }
  });

  return huboCambios ? cambiosLimpios : cambiosPorDia;
};

const limpiarExtrasPorDia = (extrasPorDia, persona) => {
  if (!esObjetoPlano(extrasPorDia)) return extrasPorDia;

  let huboCambios = false;
  const extrasLimpios = {};

  Object.entries(extrasPorDia).forEach(([fecha, extras]) => {
    if (!Array.isArray(extras)) {
      extrasLimpios[fecha] = extras;
      return;
    }

    const personaId = String(persona?.id ?? "").trim();
    const extrasDelDia = extras.filter((extra) => {
      const extraId = String(extra?.id ?? "").trim();
      return extra?.temporal || !personaId || extraId !== personaId;
    });
    if (extrasDelDia.length !== extras.length) huboCambios = true;

    if (extrasDelDia.length > 0) {
      extrasLimpios[fecha] = extrasDelDia;
    } else if (extras.length === 0) {
      extrasLimpios[fecha] = extras;
    }
  });

  return huboCambios ? extrasLimpios : extrasPorDia;
};

const limpiarNoDisponiblesPorDia = (noDisponiblesPorDia, persona, personal) => {
  if (!esObjetoPlano(noDisponiblesPorDia)) return noDisponiblesPorDia;

  let huboCambios = false;
  const noDisponiblesLimpios = {};

  Object.entries(noDisponiblesPorDia).forEach(([fecha, nombres]) => {
    if (!Array.isArray(nombres)) {
      noDisponiblesLimpios[fecha] = nombres;
      return;
    }

    const nombresDelDia = quitarPersonaDeListaReferencias(nombres, persona, personal);
    if (nombresDelDia.length !== nombres.length) huboCambios = true;

    if (nombresDelDia.length > 0) {
      noDisponiblesLimpios[fecha] = nombresDelDia;
    } else if (nombres.length === 0) {
      noDisponiblesLimpios[fecha] = nombres;
    }
  });

  return huboCambios ? noDisponiblesLimpios : noDisponiblesPorDia;
};

export const limpiarPersonaDeCalendario = (calendario, persona, personal = []) => {
  if (!esObjetoPlano(calendario)) return calendario;

  const cambiosDia = limpiarCambiosPorDia(
    calendario.cambiosDia,
    persona,
    personal,
    true,
    calendario.extras
  );
  const cambiosParoDia = limpiarCambiosPorDia(
    calendario.cambiosParoDia,
    persona,
    personal,
    true,
    calendario.extras
  );
  const extras = limpiarExtrasPorDia(calendario.extras, persona);
  const noDisponibles = limpiarNoDisponiblesPorDia(
    calendario.noDisponibles,
    persona,
    personal
  );

  if (
    cambiosDia === calendario.cambiosDia &&
    cambiosParoDia === calendario.cambiosParoDia &&
    extras === calendario.extras &&
    noDisponibles === calendario.noDisponibles
  ) {
    return calendario;
  }

  return {
    ...calendario,
    ...(cambiosDia !== calendario.cambiosDia ? { cambiosDia } : {}),
    ...(cambiosParoDia !== calendario.cambiosParoDia ? { cambiosParoDia } : {}),
    ...(extras !== calendario.extras ? { extras } : {}),
    ...(noDisponibles !== calendario.noDisponibles ? { noDisponibles } : {})
  };
};

const clavesPorCategoria = {
  enfermero: "enfermeros",
  licenciado: "licenciados"
};

export const limpiarReferenciasDeCategoria = (mesData, categoria, persona) => {
  const claveCategoria = clavesPorCategoria[categoria];
  if (!claveCategoria) return mesData;

  const planillas = mesData.planillas || {};
  const calendario = mesData.calendario || {};
  const planillaLimpia = limpiarPersonaDePlanilla(
    planillas[claveCategoria],
    persona,
    mesData.personal || []
  );
  const calendarioLimpio = limpiarPersonaDeCalendario(
    calendario[claveCategoria],
    persona,
    mesData.personal || []
  );

  if (
    planillaLimpia === planillas[claveCategoria] &&
    calendarioLimpio === calendario[claveCategoria]
  ) {
    return mesData;
  }

  return {
    ...mesData,
    planillas: {
      ...planillas,
      ...(planillaLimpia !== planillas[claveCategoria]
        ? { [claveCategoria]: planillaLimpia }
        : {})
    },
    calendario: {
      ...calendario,
      ...(calendarioLimpio !== calendario[claveCategoria]
        ? { [claveCategoria]: calendarioLimpio }
        : {})
    }
  };
};

export const limpiarReferenciasDePersona = (mesData, persona) => {
  const sinEnfermeria = limpiarReferenciasDeCategoria(mesData, "enfermero", persona);
  const sinReferenciasDiarias = limpiarReferenciasDeCategoria(
    sinEnfermeria,
    "licenciado",
    persona
  );

  const licencias = Array.isArray(sinReferenciasDiarias.licencias)
    ? sinReferenciasDiarias.licencias.filter(
      (licencia) => !licenciaCorrespondeAPersona(
        licencia,
        persona,
        sinReferenciasDiarias.personal || []
      )
    )
    : sinReferenciasDiarias.licencias;
  const certificaciones = Array.isArray(sinReferenciasDiarias.certificaciones)
    ? sinReferenciasDiarias.certificaciones.filter(
      (certificacion) => !certificacionCorrespondeAPersona(
        certificacion,
        persona,
        sinReferenciasDiarias.personal || []
      )
    )
    : sinReferenciasDiarias.certificaciones;

  return {
    ...sinReferenciasDiarias,
    personal: (sinReferenciasDiarias.personal || []).filter(
      (actual) => !personasCompartenId(actual, persona)
    ),
    ...(licencias !== sinReferenciasDiarias.licencias ? { licencias } : {}),
    ...(certificaciones !== sinReferenciasDiarias.certificaciones ? { certificaciones } : {})
  };
};
