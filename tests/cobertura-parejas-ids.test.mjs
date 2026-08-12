import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla
} from "../src/utils/configuracionPlanilla.js";
import {
  aplicarPrioridadCoberturaParejas,
  PAREJAS_COBERTURA_ENFERMEROS,
  PROCEDENCIA_REDISTRIBUCION_AUTOMATICA
} from "../src/utils/coberturaParejasEnfermeros.js";
import { resolverTurnantesYCoberturasOperativas } from "../src/utils/distribucionTurnantesCoberturas.js";
import {
  aplicarMovimientosCalendario,
  crearMovimientosEntreFilasCalendario,
  VACANTE_OPERATIVA
} from "../src/utils/cambiosCalendario.js";
import { configurarTipoExtra, TIPOS_EXTRA } from "../src/utils/extrasPersonas.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { construirAsignacionesDiariasCalendario } from "../src/utils/pipelineCalendarioDiario.js";
import { aplicarPrioridadGeneralPorSectorId } from "../src/utils/prioridadesSectores.js";
import { excluirCertificadosDeAsignaciones } from "../src/utils/disponibilidadCertificacionesCalendario.js";
import { crearReferenciaPersona } from "../src/utils/referenciasPersonas.js";
import { normalizar } from "../src/utils/texto.js";
import {
  crearRegistroNoDisponible,
  excluirAusenciasOperativasNoDisponiblesDeAsignaciones,
  MOTIVOS_NO_DISPONIBLE
} from "../src/utils/noDisponiblesMotivos.js";

const contexto = { turno: "tarde", categoria: "enfermero", mes: "2026-09" };
const persona = (id) => ({ id, nombre: id });
const nombres = {
  rea_1: "REA 1", rea_2: "REA 2", explora_1: "EXPLORA 1", explora_2: "EXPLORA 2",
  sillon_1: "SILLÓN 1", sillon_2: "SILLON 2", pre_int_1: "PRE INT 1", pre_int_2: "PRE INT 2"
};
const estado = () => {
  const valor = crearEstadoMensualVacio();
  valor.configuracionPlanilla = { enfermero: crearSnapshotConfiguracionPlanilla({ ...contexto }) };
  return valor;
};
const asignacionesPareja = ({ destinoSectorId, origenSectorId }, etiquetas = nombres) => [
  { nombre: etiquetas[destinoSectorId], enfermero: null, tipo: "sector" },
  { nombre: etiquetas[origenSectorId], enfermero: persona(origenSectorId), tipo: "sector" }
];
const aplicar = (pareja, opciones = {}) => aplicarPrioridadCoberturaParejas({
  asignaciones: asignacionesPareja(pareja, opciones.etiquetas),
  estadoMensual: opciones.estadoMensual ?? estado(), ...contexto, ...opciones
});
let total = 0;
const probar = (nombre, fn) => { fn(); total++; console.log(`✓ ${total} ${nombre}`); };

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`${pareja.origenSectorId} cubre ${pareja.destinoSectorId} por IDs`, () => {
    const resultado = aplicar(pareja);
    assert.equal(resultado[0].enfermero.id, pareja.origenSectorId);
    assert.equal(resultado[1].enfermero, null);
  });
}

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`etiquetas renombradas no rompen ${pareja.destinoSectorId}`, () => {
    const mensual = estado();
    const etiquetas = { ...nombres };
    for (const sectorId of [pareja.destinoSectorId, pareja.origenSectorId]) {
      const nueva = `Nombre nuevo ${sectorId}`;
      mensual.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === sectorId).etiqueta = nueva;
      etiquetas[sectorId] = nombres[sectorId];
    }
    const resultado = aplicar(pareja, { estadoMensual: mensual, etiquetas });
    assert.equal(resultado[0].enfermero.id, pareja.origenSectorId);
  });
}

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`fila inactiva omite ${pareja.origenSectorId} → ${pareja.destinoSectorId}`, () => {
    for (const inactivo of [pareja.origenSectorId, pareja.destinoSectorId]) {
      const mensual = estado();
      mensual.configuracionPlanilla.enfermero.filas.find((fila) => fila.sectorId === inactivo).activo = false;
      const resultado = aplicar(pareja, { estadoMensual: mensual });
      assert.equal(resultado[0].enfermero, null);
      assert.equal(resultado[1].enfermero.id, pareja.origenSectorId);
    }
  });
}

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`orden invertido no altera ${pareja.destinoSectorId}`, () => {
    const mensual = estado();
    mensual.configuracionPlanilla.enfermero.filas.reverse().forEach((fila, orden) => { fila.orden = orden; });
    assert.equal(aplicar(pareja, { estadoMensual: mensual })[0].enfermero.id, pareja.origenSectorId);
  });
}

probar("destino cubierto no se sobrescribe", () => {
  const asignaciones = asignacionesPareja(PAREJAS_COBERTURA_ENFERMEROS[0]);
  asignaciones[0].enfermero = persona("titular");
  const resultado = aplicarPrioridadCoberturaParejas({ asignaciones, estadoMensual: estado(), ...contexto });
  assert.equal(resultado[0].enfermero.id, "titular"); assert.equal(resultado[1].enfermero.id, "rea_2");
});
probar("origen vacío o no disponible no aplica", () => {
  const pareja = PAREJAS_COBERTURA_ENFERMEROS[0]; const asignaciones = asignacionesPareja(pareja);
  asignaciones[1].enfermero = null;
  assert.equal(aplicarPrioridadCoberturaParejas({ asignaciones, estadoMensual: estado(), ...contexto })[0].enfermero, null);
  assert.equal(aplicar(pareja, { esPersonaDisponible: () => false })[0].enfermero, null);
});
probar("cambio manual en cualquiera de ambas filas bloquea", () => {
  const pareja = PAREJAS_COBERTURA_ENFERMEROS[0];
  for (const clave of ["rea 1", "REA 2"]) assert.equal(
    aplicar(pareja, { cambiosDia: { [clave]: "__EMPTY__" } })[0].enfermero, null
  );
});
probar("agosto legacy funciona y no crea snapshot", () => {
  const legacy = crearEstadoMensualVacio(); const antes = JSON.stringify(legacy);
  const resultado = aplicar(PAREJAS_COBERTURA_ENFERMEROS[0], { estadoMensual: legacy, mes: "2026-08" });
  assert.equal(resultado[0].enfermero.id, "rea_2"); assert.equal(JSON.stringify(legacy), antes);
});
probar("Licenciados no recibe las reglas", () => {
  const resultado = aplicarPrioridadCoberturaParejas({
    asignaciones: asignacionesPareja(PAREJAS_COBERTURA_ENFERMEROS[0]),
    estadoMensual: crearEstadoMensualVacio(), turno: "tarde", categoria: "licenciado", mes: "2026-09"
  });
  assert.equal(resultado[0].enfermero, null); assert.equal(resultado[1].enfermero.id, "rea_2");
});
for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`${pareja.origenSectorId} gana al Turnante para cubrir ${pareja.destinoSectorId}`, () => {
    const resultado = resolverTurnantesYCoberturasOperativas({
      asignaciones: [
        { nombre: "T1", enfermero: persona("turnante"), tipo: "turnante" },
        ...asignacionesPareja(pareja).map((fila, indice) =>
          indice === 0 ? { ...fila, reemplazo: true } : fila
        ),
        { nombre: "14-19", enfermero: null, tipo: "sector" }
      ], extras: [], personal: [], esPersonaDisponible: () => true,
      ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({
        asignaciones: sectores, estadoMensual: estado(), ...contexto
      })
    }).asignaciones;
    assert.equal(resultado.find((fila) => fila.nombre === nombres[pareja.destinoSectorId]).enfermero.id,
      pareja.origenSectorId);
    assert.equal(resultado.find((fila) => fila.nombre === nombres[pareja.origenSectorId]).enfermero.id,
      "turnante");
  });
}
probar("la pareja no consume Turnante y el refuerzo precede al Turnante restante", () => {
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      { nombre: "T1", enfermero: persona("turnante-1"), tipo: "turnante" },
      { nombre: "REA 1", enfermero: null, tipo: "sector", reemplazo: true },
      { nombre: "REA 2", enfermero: persona("rea2"), tipo: "sector" },
      { nombre: "EXPLORA 1", enfermero: null, tipo: "sector" },
      { nombre: "EXPLORA 2", enfermero: null, tipo: "sector" }
    ], extras: [{ ...persona("refuerzo"), tipoExtra: TIPOS_EXTRA.REFUERZO }],
    personal: [], esPersonaDisponible: () => true,
    ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({
      asignaciones: sectores, estadoMensual: estado(), ...contexto
    })
  }).asignaciones;
  assert.equal(resultado.find((fila) => fila.nombre === "REA 1").enfermero.id, "rea2");
  assert.equal(resultado.find((fila) => fila.nombre === "REA 2").enfermero.id, "refuerzo");
  assert.equal(resultado.find((fila) => fila.nombre === "EXPLORA 1").enfermero.id, "turnante-1");
  assert.equal(resultado.find((fila) => fila.nombre === "EXPLORA 2").enfermero, null);
});
probar("el flujo enriquecido de Calendario aplica rea_2 antes que T1 sin depender de etiquetas ni orden", () => {
  const funcionarioRea2 = persona("funcionario-rea-2");
  const turnante = persona("turnante-1");
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [
      { nombre: "Turnante disponible", etiqueta: "Turnante disponible", filaId: "enfermero.turnante.1", turnanteId: "turnante_1", sectorId: null, orden: 2, enfermero: turnante, tipo: "turnante" },
      { nombre: "Destino renombrado", etiqueta: "Destino renombrado", filaId: "enfermero.sector.rea_1", sectorId: "rea_1", turnanteId: null, orden: 99, enfermero: null, tipo: "sector" },
      { nombre: "Origen renombrado", etiqueta: "Origen renombrado", filaId: "enfermero.sector.rea_2", sectorId: "rea_2", turnanteId: null, orden: 0, enfermero: funcionarioRea2, tipo: "sector" },
      { nombre: "Flujo posterior", etiqueta: "Flujo posterior", filaId: "enfermero.sector.boxes_14_19", sectorId: "boxes_14_19", turnanteId: null, orden: 1, enfermero: null, tipo: "sector" }
    ],
    extras: [],
    personal: [funcionarioRea2, turnante],
    esPersonaDisponible: () => true,
    ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({
      asignaciones: sectores,
      estadoMensual: estado(),
      ...contexto
    })
  }).asignaciones;

  assert.equal(resultado.find((fila) => fila.sectorId === "rea_1").enfermero, funcionarioRea2);
  assert.equal(resultado.filter((fila) => fila.enfermero === funcionarioRea2).length, 1);
  assert.equal(resultado.find((fila) => fila.sectorId === "rea_2").enfermero, turnante);
  assert.equal(resultado.filter((fila) => fila.enfermero === turnante).length, 1);
  assert.equal(resultado.find((fila) => fila.sectorId === "boxes_14_19").enfermero, null);
});
const ejecutarFlujoProductivoCalendario = ({ pareja, personaOrigen = persona("B"), cambios }) => {
  const mensual = estado();
  const filasConfiguracion = mensual.configuracionPlanilla.enfermero.filas;
  const etiquetas = filasConfiguracion.map((fila) => fila.etiqueta);
  const etiquetaDestino = filasConfiguracion.find((fila) => fila.sectorId === pareja.destinoSectorId).etiqueta;
  const etiquetaOrigen = filasConfiguracion.find((fila) => fila.sectorId === pareja.origenSectorId).etiqueta;
  const personaA = persona("A");
  const turnante = persona("C");
  const planilla = { [etiquetaDestino]: personaA, [etiquetaOrigen]: personaOrigen, T1: turnante };
  const personal = [personaA, personaOrigen, turnante].filter(Boolean);
  const asignaciones = construirAsignacionesDiariasCalendario({
    filasCalendario: etiquetas,
    filasConfiguracion,
    planillaPeriodoEfectiva: planilla,
    cambiosDia: cambios,
    personal,
    turnantes: filasConfiguracion.filter((fila) => fila.tipo === "turnante").map((fila) => fila.etiqueta)
  });
  return {
    cambios,
    personaA,
    personaOrigen,
    turnante,
    resultado: resolverTurnantesYCoberturasOperativas({
      asignaciones,
      extras: [],
      personal,
      esPersonaDisponible: () => true,
      ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({
        asignaciones: sectores,
        cambiosDia: cambios,
        estadoMensual: mensual,
        ...contexto
      })
    }).asignaciones
  };
};

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`sacar hacia SIN ASIGNAR deja hueco operativo y aplica ${pareja.origenSectorId}`, () => {
    const seleccionado = { nombre: nombres[pareja.destinoSectorId], enfermero: persona("A"), tipo: "sector" };
    const destino = { nombre: "SIN ASIGNAR", enfermero: persona("C"), tipo: "sector" };
    const movimientos = crearMovimientosEntreFilasCalendario({ seleccionado, destino });
    const cambios = aplicarMovimientosCalendario({ cambios: {}, movimientos });
    const flujo = ejecutarFlujoProductivoCalendario({ pareja, cambios });
    assert.equal(cambios[nombres[pareja.destinoSectorId].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()], VACANTE_OPERATIVA);
    assert.equal(flujo.resultado.find((fila) => fila.sectorId === pareja.destinoSectorId).enfermero, flujo.personaOrigen);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.personaOrigen).length, 1);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.turnante).length, 1);
    assert.equal(flujo.resultado.find((fila) => fila.sectorId === pareja.origenSectorId).enfermero === flujo.personaOrigen, false);
  });
}

probar("seleccionar C desde SIN ASIGNAR y asignarlo a REA 1 conserva la decisión manual", () => {
  const seleccionado = { nombre: "SIN ASIGNAR", enfermero: persona("C"), tipo: "sector" };
  const destino = { nombre: "REA 1", enfermero: persona("A"), tipo: "sector" };
  const cambios = aplicarMovimientosCalendario({
    cambios: {},
    movimientos: crearMovimientosEntreFilasCalendario({ seleccionado, destino })
  });
  const flujo = ejecutarFlujoProductivoCalendario({ pareja: PAREJAS_COBERTURA_ENFERMEROS[0], cambios });
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "rea_1").enfermero.id, "C");
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "rea_2").enfermero.id, "B");
});

probar("sin REA 2 disponible el hueco operativo puede recibir al Turnante", () => {
  const movimientos = crearMovimientosEntreFilasCalendario({
    seleccionado: { nombre: "REA 1", enfermero: persona("A"), tipo: "sector" },
    destino: { nombre: "SIN ASIGNAR", enfermero: persona("C"), tipo: "sector" }
  });
  const cambios = aplicarMovimientosCalendario({ cambios: {}, movimientos });
  const flujo = ejecutarFlujoProductivoCalendario({
    pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
    personaOrigen: null,
    cambios
  });
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "rea_1").enfermero.id, "C");
});
const ejecutarDesplazadoDesdeSector2 = ({
  pareja,
  disponibleOrigen = true,
  inactivarOrigen = false,
  protegerDestino = false,
  protegerUbicacion = false,
  renombrar = false,
  invertirOrden = false,
  legacy = false,
  ausencia = "certificacion"
} = {}) => {
  const mensual = estado();
  const snapshot = mensual.configuracionPlanilla.enfermero;
  const destinoFila = snapshot.filas.find((fila) => fila.sectorId === pareja.destinoSectorId);
  const origenFila = snapshot.filas.find((fila) => fila.sectorId === pareja.origenSectorId);
  const ubicacionFila = snapshot.filas.find((fila) => fila.sectorId === "boxes_20_22_24");
  const turnanteFila = snapshot.filas.find((fila) => fila.turnanteId === "turnante_1");
  const apoyoFila = snapshot.filas.find((fila) => fila.sectorId === "explora_2" && fila !== origenFila) ||
    snapshot.filas.find((fila) => fila.sectorId === "salud_mental");
  if (inactivarOrigen) origenFila.activo = false;
  if (renombrar) {
    destinoFila.etiqueta = `Destino ${pareja.destinoSectorId}`;
    origenFila.etiqueta = `Origen ${pareja.origenSectorId}`;
  }
  if (invertirOrden) snapshot.filas.reverse().forEach((fila, indice) => { fila.orden = indice; });
  const A = persona("A-desplazado");
  const B = persona(`B-${pareja.origenSectorId}`);
  const C = persona("C-turnante");
  const base = {
    [nombres[pareja.destinoSectorId]]: crearReferenciaPersona(A),
    [nombres[pareja.origenSectorId]]: crearReferenciaPersona(B),
    T1: crearReferenciaPersona(C)
  };
  const cambios = {
    [normalizar(destinoFila.etiqueta)]: protegerDestino ? crearReferenciaPersona(C) : crearReferenciaPersona(A),
    [normalizar(origenFila.etiqueta)]: "__EMPTY__",
    [normalizar(ubicacionFila.etiqueta)]: crearReferenciaPersona(B),
    [normalizar(apoyoFila.etiqueta)]: crearReferenciaPersona(C)
  };
  const auxiliares = snapshot.filas
    .filter((fila) =>
      fila.tipo === "sector" &&
      fila !== destinoFila &&
      fila !== origenFila &&
      fila !== ubicacionFila &&
      fila !== apoyoFila
    )
    .map((fila) => ({ fila, persona: persona(`aux-${fila.sectorId}`) }));
  auxiliares.forEach(({ fila, persona: auxiliar }) => {
    cambios[normalizar(fila.etiqueta)] = crearReferenciaPersona(auxiliar);
  });
  const procedencia = Object.fromEntries(
    Object.keys(cambios).map((clave) => [clave, PROCEDENCIA_REDISTRIBUCION_AUTOMATICA])
  );
  if (protegerDestino) delete procedencia[normalizar(destinoFila.etiqueta)];
  if (protegerUbicacion) delete procedencia[normalizar(ubicacionFila.etiqueta)];
  const filas = snapshot.filas.filter((fila) => fila.activo !== false).sort((a, b) => a.orden - b.orden);
  let asignaciones = construirAsignacionesDiariasCalendario({
    filasCalendario: filas.map((fila) => fila.etiqueta),
    filasConfiguracion: filas,
    planillaPeriodoEfectiva: base,
    cambiosDia: cambios,
    procedenciaCambiosDia: procedencia,
    personal: [A, B, C, ...auxiliares.map((item) => item.persona)],
    turnantes: filas.filter((fila) => fila.tipo === "turnante").map((fila) => fila.etiqueta)
  });
  if (["falta_con_aviso", "supervision_otro_turno", "adhesion_paro", "otro"].includes(ausencia)) {
    const registro = crearRegistroNoDisponible({
      persona: A,
      motivo: ausencia === "supervision_otro_turno"
        ? MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO
        : ausencia === "adhesion_paro"
          ? MOTIVOS_NO_DISPONIBLE.ADHESION_PARO
          : ausencia === "otro"
            ? MOTIVOS_NO_DISPONIBLE.OTRO
            : MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO,
      detalle: ausencia === "otro" ? "Ausencia informada" : "",
      turnoDestino: ausencia === "supervision_otro_turno" ? "noche" : "",
      sectorOrigen: destinoFila.etiqueta
    }).registro;
    asignaciones = excluirAusenciasOperativasNoDisponiblesDeAsignaciones({
      asignaciones,
      registros: [registro],
      personal: [A, B, C, ...auxiliares.map((item) => item.persona)]
    });
  } else {
    asignaciones = excluirCertificadosDeAsignaciones({
      asignaciones,
      estaCertificada: (actual) => actual === A
    });
  }
  const contextoPrueba = legacy
    ? { estadoMensual: crearEstadoMensualVacio(), ...contexto, mes: "2026-08" }
    : { estadoMensual: mensual, ...contexto };
  let resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones,
    extras: [],
    personal: [A, B, C, ...auxiliares.map((item) => item.persona)],
    esPersonaDisponible: (actual) => actual !== A && (actual !== B || disponibleOrigen),
    ajustarSectores: (sectores) => aplicarPrioridadCoberturaParejas({
      asignaciones: sectores,
      distribucionBase: base,
      personal: [A, B, C, ...auxiliares.map((item) => item.persona)],
      cambiosDia: cambios,
      procedenciaCambiosDia: procedencia,
      esPersonaDisponible: (actual) => actual !== A && (actual !== B || disponibleOrigen),
      ...contextoPrueba
    })
  }).asignaciones;
  resultado = aplicarPrioridadGeneralPorSectorId({
    asignaciones: resultado,
    prioridadSectorIds: configuracionSectores.enfermero.prioridadSectoresIds,
    esPersonaDisponible: (actual) => actual !== A && (actual !== B || disponibleOrigen)
  });
  return { resultado, A, B, C, destinoFila, origenFila, ubicacionFila };
};

for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`titular original desplazado ${pareja.origenSectorId} vuelve a ${pareja.destinoSectorId}`, () => {
    const flujo = ejecutarDesplazadoDesdeSector2({ pareja });
    assert.equal(flujo.resultado.find((fila) => fila.sectorId === pareja.destinoSectorId).enfermero, flujo.B);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.B).length, 1);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.C).length, 1);
    assert.notEqual(flujo.resultado.find((fila) => fila.sectorId === "boxes_20_22_24").enfermero, flujo.B);
    if (pareja.origenSectorId === "rea_2") {
      assert.equal(flujo.resultado.find((fila) => fila.sectorId === "boxes_20_22_24").enfermero, flujo.C);
    }
  });
}

probar("protecciones del titular desplazado respetan ausencia, fila inactiva y ubicación manual", () => {
  const pareja = PAREJAS_COBERTURA_ENFERMEROS[0];
  for (const opciones of [{ disponibleOrigen: false }, { inactivarOrigen: true }, { protegerUbicacion: true }]) {
    const flujo = ejecutarDesplazadoDesdeSector2({ pareja, ...opciones });
    assert.notEqual(
      flujo.resultado.find((fila) => fila.sectorId === "rea_1").origenLogicoPareja,
      "rea_2"
    );
  }
});

probar("destino manual no se sobrescribe por titular desplazado", () => {
  const flujo = ejecutarDesplazadoDesdeSector2({
    pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
    protegerDestino: true
  });
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "rea_1").enfermero, flujo.C);
});

probar("titular desplazado funciona con etiquetas renombradas, drag and drop y agosto legacy", () => {
  for (const opciones of [{ renombrar: true }, { invertirOrden: true }, { legacy: true }]) {
    const flujo = ejecutarDesplazadoDesdeSector2({
      pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
      ...opciones
    });
    assert.equal(flujo.resultado.find((fila) => fila.sectorId === "rea_1")?.enfermero, flujo.B);
  }
});
probar("REA 14/8 iguala Certificación y cuatro ausencias operativas simples", () => {
  const certificacion = ejecutarDesplazadoDesdeSector2({
    pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
    ausencia: "certificacion"
  });
  const falta = ejecutarDesplazadoDesdeSector2({
    pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
    ausencia: "falta_con_aviso"
  });
  const supervision = ejecutarDesplazadoDesdeSector2({
    pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
    ausencia: "supervision_otro_turno"
  });
  const adhesionParo = ejecutarDesplazadoDesdeSector2({
    pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
    ausencia: "adhesion_paro"
  });
  const otro = ejecutarDesplazadoDesdeSector2({
    pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
    ausencia: "otro"
  });
  for (const flujo of [certificacion, falta, supervision, adhesionParo, otro]) {
    assert.equal(flujo.resultado.find((fila) => fila.sectorId === "rea_1").enfermero, flujo.B);
    assert.equal(flujo.resultado.find((fila) => fila.sectorId === "boxes_20_22_24").enfermero, flujo.C);
    assert.equal(flujo.resultado.some((fila) => fila.enfermero === flujo.A), false);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.B).length, 1);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.C).length, 1);
  }
});
for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`Supervisión libera ${pareja.destinoSectorId} para el titular desplazado`, () => {
    const flujo = ejecutarDesplazadoDesdeSector2({ pareja, ausencia: "supervision_otro_turno" });
    assert.equal(flujo.resultado.find((fila) => fila.sectorId === pareja.destinoSectorId).enfermero, flujo.B);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.B).length, 1);
  });
}
for (const pareja of PAREJAS_COBERTURA_ENFERMEROS) {
  probar(`Otro motivo libera ${pareja.destinoSectorId} para el titular desplazado`, () => {
    const flujo = ejecutarDesplazadoDesdeSector2({ pareja, ausencia: "otro" });
    assert.equal(flujo.resultado.find((fila) => fila.sectorId === pareja.destinoSectorId).enfermero, flujo.B);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.B).length, 1);
    assert.equal(flujo.resultado.filter((fila) => fila.enfermero === flujo.C).length, 1);
    assert.equal(flujo.resultado.some((fila) => fila.enfermero === flujo.A), false);
  });
}
probar("Adhesión a PARO libera REA 1 para Gabriela antes que el Turnante", () => {
  const flujo = ejecutarDesplazadoDesdeSector2({
    pareja: PAREJAS_COBERTURA_ENFERMEROS[0],
    ausencia: "adhesion_paro"
  });
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "rea_1").enfermero, flujo.B);
  assert.equal(flujo.resultado.find((fila) => fila.sectorId === "boxes_20_22_24").enfermero, flujo.C);
  assert.equal(flujo.resultado.some((fila) => fila.enfermero === flujo.A), false);
});

probar("Cambio con otro turno no se clasifica como ausencia operativa simple", () => {
  const titular = persona("titular-cambio-vinculado");
  const registro = crearRegistroNoDisponible({
    persona: titular,
    motivo: MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO,
    personaCobertura: persona("cobertura-vinculada"),
    sectorOrigen: "REA 1"
  }).registro;
  const [resultado] = excluirAusenciasOperativasNoDisponiblesDeAsignaciones({
    asignaciones: [{ nombre: "REA 1", enfermero: titular }],
    registros: [registro],
    personal: [titular]
  });
  assert.equal(resultado.enfermero, titular);
  assert.equal(resultado.excluidoPorNoDisponible, undefined);
});
probar("cobertura directa posterior continúa funcionando", () => {
  const titular = persona("titular");
  const extra = configurarTipoExtra({
    extra: persona("extra"), tipoExtra: TIPOS_EXTRA.COBERTURA,
    personaCubierta: titular, sectorCubierto: "REA 1", personal: [titular]
  }).extra;
  const resultado = resolverTurnantesYCoberturasOperativas({
    asignaciones: [{ nombre: "REA 1", enfermero: titular, tipo: "sector" }],
    extras: [extra], personal: [titular], esPersonaDisponible: () => false,
    esPersonaDisponibleParaCobertura: () => true
  }).asignaciones;
  assert.equal(resultado[0].enfermero.id, "extra");
});
probar("no cambia formato persistido ni muta configuración", () => {
  const mensual = estado(); const configAntes = JSON.stringify(mensual);
  const sectoresAntes = JSON.stringify(configuracionSectores);
  const distribucion = { "REA 1": null, "REA 2": persona("rea2") };
  aplicarPrioridadCoberturaParejas({
    asignaciones: Object.entries(distribucion).map(([nombre, enfermero]) => ({ nombre, enfermero, tipo: "sector" })),
    estadoMensual: mensual, ...contexto
  });
  assert.deepEqual(Object.keys(distribucion), ["REA 1", "REA 2"]);
  assert.equal(JSON.stringify(mensual), configAntes);
  assert.equal(JSON.stringify(configuracionSectores), sectoresAntes);
  assert.equal(Object.values(distribucion).some((valor) => valor?.sectorId), false);
});
probar("catálogo no contiene etiquetas como identidad", async () => {
  const fuente = await readFile(new URL("../src/utils/coberturaParejasEnfermeros.js", import.meta.url), "utf8");
  assert.doesNotMatch(fuente, /principal|secundario|"REA 1"|"EXPLORA 1"|"SILL[ÓO]N 1"|"PRE INT 1"/);
  assert.match(fuente, /resolverAsignacionPorSectorId/);
});

console.log(`\n${total} pruebas de prioridades por sectorId superadas.`);
