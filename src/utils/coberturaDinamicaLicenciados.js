import { resolverTurnantesYCoberturasOperativas } from "./distribucionTurnantesCoberturas.js";
import { obtenerClaveIdentidadPersona } from "./identidadPersonas.js";
import { resolverPersonaDesdeReferencia } from "./referenciasPersonas.js";

const lista = (valor) => Array.isArray(valor) ? valor : [];

export const resolverPrioridadDestinosOperativosLicenciados = ({
  prioridadTurno = [],
  asignacionesOperativas = []
} = {}) => {
  const destinoPorComponente = new Map();
  lista(asignacionesOperativas).forEach((fila) => {
    const destinoId = fila?.destinoId || fila?.sectorId;
    if (!destinoId) return;
    const componentes = lista(fila?.componentes);
    (componentes.length > 0 ? componentes : [destinoId]).forEach((componenteId) => {
      if (!destinoPorComponente.has(componenteId)) {
        destinoPorComponente.set(componenteId, destinoId);
      }
    });
  });

  const vistos = new Set();
  return lista(prioridadTurno).reduce((prioridad, sectorId) => {
    const destinoId = destinoPorComponente.get(sectorId) || sectorId;
    if (vistos.has(destinoId)) return prioridad;
    vistos.add(destinoId);
    return [...prioridad, destinoId];
  }, []);
};

const copiarProyeccionSinAplicar = (proyeccion) => ({
  ok: proyeccion?.ok !== false,
  aplicar: false,
  asignacionesOperativas: lista(proyeccion?.asignacionesOperativas).map((fila) => ({ ...fila })),
  coberturasDinamicas: [],
  vacantesSinCobertura: lista(proyeccion?.vacantesDinamicas),
  turnantesUtilizados: [],
  turnantesRestantes: lista(proyeccion?.turnantesDisponibles).map((turnante) => ({ ...turnante }))
});

export const resolverCoberturaDinamicaLicenciados = ({
  proyeccion,
  prioridadTurno = [],
  extras = [],
  personal = [],
  esPersonaDisponible = () => true,
  esPersonaDisponibleParaCobertura = esPersonaDisponible,
  sectorIdsDonantes = []
} = {}) => {
  if (!proyeccion?.aplicar) return copiarProyeccionSinAplicar(proyeccion);

  const originalesPorDestino = new Map();
  const sectoresMotor = lista(proyeccion.asignacionesOperativas).map((fila) => {
    const sectorIdMotor = fila?.destinoId || fila?.sectorId || "";
    if (fila?.destinoId) originalesPorDestino.set(fila.destinoId, fila);
    return { ...fila, tipo: "sector", sectorId: sectorIdMotor };
  });
  const turnantesMotor = lista(proyeccion.turnantesDisponibles).map((turnante) => ({
    tipo: "turnante",
    filaId: turnante.filaId,
    turnanteId: turnante.turnanteId,
    nombre: turnante.etiqueta,
    etiqueta: turnante.etiqueta,
    enfermero: resolverPersonaDesdeReferencia(turnante.referencia, personal) || turnante.referencia || null
  }));
  const prioridadDestinosOperativos = proyeccion.modo === "combinados"
    ? resolverPrioridadDestinosOperativosLicenciados({
        prioridadTurno,
        asignacionesOperativas: sectoresMotor
      })
    : lista(prioridadTurno);

  const resultadoMotor = resolverTurnantesYCoberturasOperativas({
    asignaciones: [...sectoresMotor, ...turnantesMotor],
    extras,
    personal,
    esPersonaDisponible,
    esPersonaDisponibleParaCobertura,
    prioridadSectorIds: prioridadDestinosOperativos,
    sectorIdsDonantes: lista(sectorIdsDonantes)
  });

  const turnantePorIdentidad = new Map(turnantesMotor.flatMap((turnante) => {
    const identidad = obtenerClaveIdentidadPersona(turnante.enfermero);
    return identidad ? [[identidad, turnante.turnanteId]] : [];
  }));
  const turnantesUsadosIds = new Set();
  const asignacionesOperativas = resultadoMotor.asignaciones.map((fila) => {
    const original = originalesPorDestino.get(fila.sectorId);
    const identidad = obtenerClaveIdentidadPersona(fila.enfermero);
    const cubiertoPorTurnanteId = turnantePorIdentidad.get(identidad) || null;
    if (cubiertoPorTurnanteId) turnantesUsadosIds.add(cubiertoPorTurnanteId);
    if (!original) return { ...fila, ...(cubiertoPorTurnanteId ? { cubiertoPorTurnanteId } : {}) };
    return {
      ...original,
      enfermero: fila.enfermero || null,
      requiereCobertura: original.requiereCobertura && !fila.enfermero,
      ...(cubiertoPorTurnanteId ? { cubiertoPorTurnanteId } : {})
    };
  });

  const vacantesDinamicas = new Set(lista(proyeccion.vacantesDinamicas));
  const filasDinamicas = asignacionesOperativas.filter((fila) =>
    vacantesDinamicas.has(fila.destinoId)
  );
  const turnantesUtilizados = lista(proyeccion.turnantesDisponibles)
    .filter((turnante) => turnantesUsadosIds.has(turnante.turnanteId))
    .map((turnante) => ({ ...turnante }));
  const turnantesRestantes = lista(proyeccion.turnantesDisponibles)
    .filter((turnante) => !turnantesUsadosIds.has(turnante.turnanteId))
    .map((turnante) => ({ ...turnante }));

  return {
    ok: true,
    aplicar: true,
    asignacionesOperativas,
    coberturasDinamicas: filasDinamicas.filter((fila) => Boolean(fila.enfermero)),
    vacantesSinCobertura: filasDinamicas
      .filter((fila) => !fila.enfermero)
      .map((fila) => fila.destinoId),
    turnantesUtilizados,
    turnantesRestantes
  };
};
