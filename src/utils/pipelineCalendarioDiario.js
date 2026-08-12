import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";
import { resolverClaveDistribucionParaFila } from "./resolucionIdentidadesPlanilla.js";
import { normalizar } from "./texto.js";
import { VACANTE_OPERATIVA } from "./cambiosCalendario.js";

export const construirAsignacionesDiariasCalendario = ({
  filasCalendario,
  filasConfiguracion,
  planillaPeriodoEfectiva,
  cambiosDia,
  procedenciaCambiosDia = {},
  personal,
  personalDisponibleParaOverrides = personal,
  turnantes
} = {}) => (Array.isArray(filasCalendario) ? filasCalendario : []).map((etiqueta) => {
  const fila = (filasConfiguracion || []).find((item) => item.etiqueta === etiqueta);
  const claveDistribucion = fila
    ? resolverClaveDistribucionParaFila({ distribucion: planillaPeriodoEfectiva, fila })
    : etiqueta;
  const override = cambiosDia?.[normalizar(etiqueta)];
  let persona;

  if (override && override !== "__EMPTY__" && override !== VACANTE_OPERATIVA) {
    persona = resolverPersonaDesdeReferencia(override, personalDisponibleParaOverrides);
  } else if (!override) {
    persona = resolverPersonaDesdeReferencia(
      planillaPeriodoEfectiva?.[claveDistribucion],
      personal
    );
  }

  return {
    nombre: etiqueta,
    etiqueta,
    filaId: fila?.filaId || null,
    sectorId: fila?.sectorId || null,
    turnanteId: fila?.turnanteId || null,
    enfermero: persona || null,
    vacioManual: override === "__EMPTY__",
    vacioOperativo: override === VACANTE_OPERATIVA,
    cambioManualProtegido: Boolean(override) &&
      override !== VACANTE_OPERATIVA &&
      procedenciaCambiosDia?.[normalizar(etiqueta)] !== "redistribucion_automatica",
    tipo: (turnantes || []).includes(etiqueta) ? "turnante" : "sector"
  };
});
