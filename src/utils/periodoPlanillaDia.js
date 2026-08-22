import { obtenerEstrategiaRotacionPlanilla, TURNOS } from "../config/turnos.js";
import {
  keyDiaFromDate,
  obtenerSemanasDelMes,
  parsearFechaLocal,
  semanaKeyFromDate
} from "./fechas.js";
import { obtenerBloqueParaFecha } from "./periodosRotacionPlanilla.js";

const CATEGORIAS = new Set(["enfermero", "licenciado"]);
const MESES = /^\d{4}-(0[1-9]|1[0-2])$/;
const FECHAS = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;

const error = (codigo, detalle = {}, contexto = {}) => ({
  ok: false,
  disponible: false,
  estrategia: contexto.estrategia || null,
  tipoPeriodo: contexto.tipoPeriodo || null,
  clavePeriodo: contexto.clavePeriodo || null,
  periodo: contexto.periodo || null,
  distribucion: null,
  coberturasSaludMental: contexto.coberturasSaludMental || null,
  errores: [{ codigo, ...detalle }]
});

const resolverFecha = (fecha) => {
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    return { fecha, clave: keyDiaFromDate(fecha) };
  }
  if (typeof fecha !== "string" || !FECHAS.test(fecha)) return null;
  const fechaLocal = parsearFechaLocal(fecha);
  return keyDiaFromDate(fechaLocal) === fecha
    ? { fecha: fechaLocal, clave: fecha }
    : null;
};

export const obtenerPlanillaCategoriaEstado = (estadoMensual, categoria) =>
  estadoMensual?.planillas?.[
    categoria === "enfermero" ? "enfermeros" : "licenciados"
  ] || null;

export const resolverPeriodoPlanillaDia = ({
  estadoMensual,
  planilla,
  fecha,
  turno,
  categoria,
  mes
} = {}) => {
  if (!TURNOS[turno]) return error("TURNO_INVALIDO", { turno });
  if (!CATEGORIAS.has(categoria)) return error("CATEGORIA_INVALIDA", { categoria });
  if (!MESES.test(mes || "")) return error("MES_INVALIDO", { mes });

  const fechaResuelta = resolverFecha(fecha);
  if (!fechaResuelta) return error("FECHA_INVALIDA", { fecha });
  if (!fechaResuelta.clave.startsWith(`${mes}-`)) {
    return error("FECHA_FUERA_DEL_MES", { fecha: fechaResuelta.clave, mes });
  }
  if (!planilla && !estadoMensual) return error("ESTADO_MENSUAL_INEXISTENTE");

  const planillaCategoria = planilla || obtenerPlanillaCategoriaEstado(
    estadoMensual,
    categoria
  );
  if (!planillaCategoria) return error("PLANILLA_NO_PREPARADA", { categoria });

  const estrategia = obtenerEstrategiaRotacionPlanilla({
    turnoId: turno,
    tipo: categoria,
    mesActivo: mes
  });

  if (estrategia.tipo === "cada_3_dias") {
    const periodo = obtenerBloqueParaFecha({
      fecha: fechaResuelta.clave,
      fechaBase: estrategia.fechaBase,
      duracionDias: estrategia.duracionDias
    });
    const clavePeriodo = periodo?.clave || null;
    const bloques = planillaCategoria?.rotacion3Dias?.bloques;
    const existePeriodo = Boolean(
      clavePeriodo && bloques && Object.hasOwn(bloques, clavePeriodo)
    );
    const distribucion = existePeriodo ? bloques[clavePeriodo] : null;
    if (!existePeriodo || !distribucion || typeof distribucion !== "object") {
      return error(
        "PERIODO_NO_PREPARADO",
        { estrategia: "cada_3_dias", clavePeriodo },
        {
          estrategia,
          tipoPeriodo: "cada_3_dias",
          clavePeriodo,
          periodo,
          coberturasSaludMental: {
            ...(planillaCategoria?.rotacion3Dias?.coberturaLibreSM || {})
          }
        }
      );
    }
    return {
      ok: true,
      disponible: true,
      estrategia,
      tipoPeriodo: "cada_3_dias",
      clavePeriodo,
      periodo,
      distribucion: { ...distribucion },
      coberturasSaludMental: {
        ...(planillaCategoria?.rotacion3Dias?.coberturaLibreSM || {})
      },
      errores: []
    };
  }

  const clavePeriodo = semanaKeyFromDate(fechaResuelta.fecha, mes);
  const periodo = obtenerSemanasDelMes(mes).find(
    (semana) => semana.clave === clavePeriodo
  ) || null;
  const existePeriodo = Boolean(
    clavePeriodo && Object.hasOwn(planillaCategoria, clavePeriodo)
  );
  const distribucion = existePeriodo ? planillaCategoria[clavePeriodo] : null;
  if (!periodo || !existePeriodo || !distribucion || typeof distribucion !== "object") {
    return error(
      "PERIODO_NO_PREPARADO",
      { estrategia: "semanal", clavePeriodo },
      {
        estrategia,
        tipoPeriodo: "semanal",
        clavePeriodo,
        periodo,
        coberturasSaludMental: { ...(planillaCategoria?.coberturaLibreSM || {}) }
      }
    );
  }
  return {
    ok: true,
    disponible: true,
    estrategia,
    tipoPeriodo: "semanal",
    clavePeriodo,
    periodo,
    distribucion: { ...distribucion },
    coberturasSaludMental: { ...(planillaCategoria?.coberturaLibreSM || {}) },
    errores: []
  };
};
