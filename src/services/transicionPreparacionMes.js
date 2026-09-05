import { prepararAplicacionTransicionPreparaciones } from "../utils/transicionPreparacionesMes.js";

export const ejecutarTransicionPreparacionMes = async ({
  guardar,
  ...argumentos
} = {}) => {
  const preparacion = prepararAplicacionTransicionPreparaciones(argumentos);
  if (!preparacion.ok) return preparacion;
  if (typeof guardar !== "function") {
    throw new TypeError("Se requiere un guardado mensual con control de revisión.");
  }

  const resultadoGuardado = await guardar({
    turnoId: argumentos.turno,
    mes: argumentos.mes,
    estado: preparacion.estado,
    revisionEsperada: preparacion.revisionEsperada
  });
  return {
    ...preparacion,
    persistencia: resultadoGuardado,
    aplicado: resultadoGuardado?.tipo === "guardado"
  };
};
