import {
  FILAS_PLANILLA_LICENCIADOS_V2,
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "./estructuraLicenciadosDinamica.js";

const IDS_LEGACY_INCOMPATIBLES = new Set(["reanimacion_sillones", "explora"]);
const IDS_BASE_DINAMICOS = new Set(["reanimacion", "diagnostico"]);

const lista = (valor) => Array.isArray(valor) ? valor : [];
const copiarAsignaciones = (asignaciones) => lista(asignaciones).map((asignacion) => ({ ...asignacion }));

const buscarAsignacionFila = (asignaciones, fila) => asignaciones.find((asignacion) =>
  fila.tipo === "sector"
    ? asignacion?.sectorId === fila.sectorId
    : asignacion?.turnanteId === fila.turnanteId
);

const crearAsignacionDestino = ({ destino, asignacionBase, requiereCobertura }) => ({
  nombre: destino.nombre,
  etiqueta: destino.nombre,
  tipo: "sector",
  destinoId: destino.id,
  sectorId: destino.combinado || requiereCobertura ? null : destino.id,
  filaId: destino.combinado || requiereCobertura ? null : asignacionBase?.filaId || null,
  origenSectorBaseId: destino.sectorBaseOrigen,
  origenFilaId: asignacionBase?.filaId || null,
  combinado: destino.combinado,
  componentes: [...destino.componentes],
  enfermero: requiereCobertura ? null : asignacionBase?.enfermero || null,
  requiereCobertura
});

const noAplicar = ({
  asignacionesBase,
  motivo,
  diagnostico = null,
  delegarEscasez = false
}) => ({
  ok: true,
  aplicar: false,
  motivo,
  diagnostico,
  delegarEscasez,
  asignacionesOperativas: copiarAsignaciones(asignacionesBase),
  vacantesDinamicas: [],
  turnantesDisponibles: [],
  sectoresBasePreservados: []
});

export const proyectarAsignacionesOperativasLicenciados = ({
  perfil,
  asignacionesBase = [],
  versionEstructura
} = {}) => {
  const base = lista(asignacionesBase);
  if (
    resolverVersionEstructuraLicenciados(versionEstructura) !==
    VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
  ) {
    return noAplicar({
      asignacionesBase: base,
      motivo: "ESTRUCTURA_LICENCIADOS_LEGACY"
    });
  }

  if (perfil?.resultado?.ok === false) {
    return noAplicar({
      asignacionesBase: base,
      motivo: "PERFIL_ESTRUCTURA_LICENCIADOS_INVALIDO",
      diagnostico: perfil.resultado.codigo || perfil.diagnostico || null
    });
  }

  if (!perfil?.resultado?.ok || !Array.isArray(perfil.resultado.destinos)) {
    return noAplicar({
      asignacionesBase: base,
      motivo: "PERFIL_ESTRUCTURA_LICENCIADOS_INEXISTENTE",
      diagnostico: perfil?.diagnostico || null
    });
  }

  if (base.some((asignacion) => IDS_LEGACY_INCOMPATIBLES.has(asignacion?.sectorId))) {
    return noAplicar({
      asignacionesBase: base,
      motivo: "ASIGNACIONES_BASE_LICENCIADOS_NO_COMPATIBLES_V2",
      diagnostico: "REFERENCIA_ESTRUCTURAL_LICENCIADOS_LEGACY"
    });
  }

  const demanda = new Set(perfil.resultado.demandaAdicional || perfil.demandaAdicional || []);
  const destinosPorOrigen = new Map();
  perfil.resultado.destinos.forEach((destino) => {
    const actuales = destinosPorOrigen.get(destino.sectorBaseOrigen) || [];
    actuales.push(destino);
    destinosPorOrigen.set(destino.sectorBaseOrigen, actuales);
  });

  const asignacionesOperativas = [];
  const turnantesDisponibles = [];
  const sectoresBasePreservados = [];
  const filasV2Ids = new Set();

  FILAS_PLANILLA_LICENCIADOS_V2.forEach((fila) => {
    const asignacion = buscarAsignacionFila(base, fila);
    filasV2Ids.add(fila.tipo === "sector" ? `sector:${fila.sectorId}` : `turnante:${fila.turnanteId}`);
    if (fila.tipo === "turnante") {
      turnantesDisponibles.push({
        filaId: fila.filaId,
        turnanteId: fila.turnanteId,
        etiqueta: fila.etiqueta,
        referencia: asignacion?.enfermero || null,
        asignacionBase: asignacion ? { ...asignacion } : null
      });
      return;
    }
    if (IDS_BASE_DINAMICOS.has(fila.sectorId)) {
      (destinosPorOrigen.get(fila.sectorId) || []).forEach((destino) => {
        asignacionesOperativas.push(crearAsignacionDestino({
          destino,
          asignacionBase: asignacion,
          requiereCobertura: demanda.has(destino.id)
        }));
      });
      return;
    }
    const preservada = asignacion
      ? { ...asignacion }
      : {
          nombre: fila.etiqueta,
          etiqueta: fila.etiqueta,
          tipo: "sector",
          destinoId: fila.sectorId,
          sectorId: fila.sectorId,
          filaId: fila.filaId,
          enfermero: null
        };
    asignacionesOperativas.push(preservada);
    sectoresBasePreservados.push(fila.sectorId);
  });

  base.forEach((asignacion) => {
    const clave = asignacion?.tipo === "turnante" || asignacion?.turnanteId
      ? `turnante:${asignacion?.turnanteId}`
      : `sector:${asignacion?.sectorId}`;
    if (asignacion?.turnanteId === "turnante_4") {
      turnantesDisponibles.push({
        filaId: asignacion.filaId || "licenciado.turnante.4",
        turnanteId: "turnante_4",
        etiqueta: asignacion.etiqueta || asignacion.nombre || "T4",
        referencia: asignacion.enfermero || null,
        asignacionBase: { ...asignacion }
      });
      return;
    }
    if (!filasV2Ids.has(clave)) asignacionesOperativas.push({ ...asignacion });
  });

  return {
    ok: true,
    aplicar: true,
    modo: perfil.resultado.modo,
    delegarEscasez: false,
    asignacionesOperativas,
    vacantesDinamicas: [...demanda],
    turnantesDisponibles,
    sectoresBasePreservados
  };
};
