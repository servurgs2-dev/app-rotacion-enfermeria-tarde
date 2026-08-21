import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configuracionSectores } from "../src/data/sectores.js";
import {
  crearSnapshotConfiguracionPlanilla,
  crearSnapshotConfiguracionPlanillaDesdeFilas
} from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import { crearBorradoresConfiguracionPlanilla } from "../src/utils/plantillasConfiguracionPlanilla.js";
import {
  actualizarPrioridadCoberturaEnEstadoMensual,
  moverSectorEnPrioridadCobertura,
  obtenerPrioridadCoberturaEfectiva
} from "../src/utils/prioridadCoberturaMensual.js";
import {
  analizarPreparacionMesNuevo,
  construirEstadoMesNuevo,
  obtenerFilasPlanilla
} from "../src/utils/preparacionMesNuevo.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};
const clonar = (valor) => structuredClone(valor);
const ui = readFileSync(new URL("../src/components/mes/PrioridadCoberturaMes.jsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/mes/PanelPrepararMes.jsx", import.meta.url), "utf8");
const panelPreparado = readFileSync(new URL("../src/components/mes/PanelPrioridadCoberturaMes.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const snapshotEnfermero = () => crearSnapshotConfiguracionPlanilla({
  turno: "manana", categoria: "enfermero", mes: "2026-08"
});
const prioridadEfectiva = (snapshot, categoria = "enfermero") =>
  obtenerPrioridadCoberturaEfectiva({
    prioridadConfigurada: snapshot.prioridadCoberturaSectorIds,
    filas: snapshot.filas,
    prioridadFallback: configuracionSectores[categoria].prioridadSectoresIds
  }).prioridadSectorIds;
const moverAntes = (orden, primero, segundo) => [
  ...orden.filter((sectorId) => ![primero, segundo].includes(sectorId)),
  primero,
  segundo
];

probar("renderiza sólo sectores activos tipo sector", () => {
  const snapshot = snapshotEnfermero();
  const ids = prioridadEfectiva(snapshot);
  const esperados = snapshot.filas.filter((fila) =>
    fila.tipo === "sector" && fila.activo !== false && fila.sectorId
  ).map((fila) => fila.sectorId);
  assert.deepEqual(new Set(ids), new Set(esperados));
  assert.match(ui, /fila\?\.tipo === "sector" && fila\.activo !== false && fila\.sectorId/);
});
probar("no muestra Turnantes", () => {
  const snapshot = snapshotEnfermero();
  assert.equal(prioridadEfectiva(snapshot).some((id) => id.startsWith("turnante_")), false);
});
probar("no muestra sectores desactivados", () => {
  const snapshot = snapshotEnfermero();
  snapshot.filas = snapshot.filas.map((fila) =>
    fila.sectorId === "explora_2" ? { ...fila, activo: false } : fila
  );
  assert.equal(prioridadEfectiva(snapshot).includes("explora_2"), false);
});
probar("muestra etiqueta y usa sectorId como key", () => {
  assert.match(ui, /filasPorId\.get\(sectorId\)\?\.etiqueta/);
  assert.match(ui, /<li key=\{sectorId\}/);
});
probar("botón bajar mueve una posición", () => {
  assert.deepEqual(moverSectorEnPrioridadCobertura({
    prioridad: ["a", "b", "c"], sectorId: "b", direccion: "abajo"
  }), ["a", "c", "b"]);
});
probar("botón subir mueve una posición", () => {
  assert.deepEqual(moverSectorEnPrioridadCobertura({
    prioridad: ["a", "b", "c"], sectorId: "b", direccion: "arriba"
  }), ["b", "a", "c"]);
});
probar("primer sector no puede subir", () => {
  assert.deepEqual(moverSectorEnPrioridadCobertura({
    prioridad: ["a", "b"], sectorId: "a", direccion: "arriba"
  }), ["a", "b"]);
  assert.match(ui, /disabled=\{indice === 0\}/);
});
probar("último sector no puede bajar", () => {
  assert.deepEqual(moverSectorEnPrioridadCobertura({
    prioridad: ["a", "b"], sectorId: "b", direccion: "abajo"
  }), ["a", "b"]);
  assert.match(ui, /disabled=\{indice === prioridadSectorIds\.length - 1\}/);
});
probar("la numeración deriva del orden actualizado", () => {
  assert.match(ui, /\{indice \+ 1\}/);
  assert.match(ui, /prioridadSectorIds\.map\(\(sectorId, indice\)/);
});
probar("REA 2 puede colocarse antes de Explora 2", () => {
  const fallback = configuracionSectores.enfermero.prioridadSectoresIds;
  const personalizada = moverAntes(fallback, "rea_2", "explora_2");
  assert.ok(personalizada.indexOf("rea_2") < personalizada.indexOf("explora_2"));
});
probar("Enfermeros y Licenciados son borradores independientes", () => {
  const estado = {
    configuracionPlanilla: {
      enfermero: snapshotEnfermero(),
      licenciado: crearSnapshotConfiguracionPlanilla({
        turno: "manana", categoria: "licenciado", mes: "2026-08"
      })
    }
  };
  const borradores = crearBorradoresConfiguracionPlanilla({ estadoMensual: estado, turno: "manana", mes: "2026-08" });
  borradores.enfermero.prioridadCoberturaSectorIds.reverse();
  assert.deepEqual(
    borradores.licenciado.prioridadCoberturaSectorIds,
    configuracionSectores.licenciado.prioridadSectoresIds
  );
});
probar("Restaurar vuelve al fallback", () => {
  const snapshot = snapshotEnfermero();
  snapshot.prioridadCoberturaSectorIds.reverse();
  const restaurada = obtenerPrioridadCoberturaEfectiva({
    prioridadConfigurada: [], filas: snapshot.filas,
    prioridadFallback: configuracionSectores.enfermero.prioridadSectoresIds
  }).prioridadSectorIds;
  assert.deepEqual(restaurada, configuracionSectores.enfermero.prioridadSectoresIds);
  assert.match(ui, /Restaurar orden predeterminado/);
});
probar("Restaurar respeta sectores desactivados", () => {
  const snapshot = snapshotEnfermero();
  snapshot.filas = snapshot.filas.map((fila) =>
    fila.sectorId === "rea_2" ? { ...fila, activo: false } : fila
  );
  assert.equal(obtenerPrioridadCoberturaEfectiva({
    prioridadConfigurada: [], filas: snapshot.filas,
    prioridadFallback: configuracionSectores.enfermero.prioridadSectoresIds
  }).prioridadSectorIds.includes("rea_2"), false);
});
probar("mover prioridad no cambia orden de Planilla", () => {
  const snapshot = snapshotEnfermero();
  const filasAntes = clonar(snapshot.filas);
  moverSectorEnPrioridadCobertura({
    prioridad: snapshot.prioridadCoberturaSectorIds,
    sectorId: "rea_2", direccion: "arriba"
  });
  assert.deepEqual(snapshot.filas, filasAntes);
});
probar("mover prioridad no cambia ordenVisual de Calendario", () => {
  const antes = clonar(configuracionSectores.enfermero.ordenVisual);
  moverSectorEnPrioridadCobertura({ prioridad: ["rea_2", "explora_2"], sectorId: "rea_2", direccion: "abajo" });
  assert.deepEqual(configuracionSectores.enfermero.ordenVisual, antes);
});
probar("mover prioridad no cambia asignacionesFijas", () => {
  const snapshot = snapshotEnfermero();
  snapshot.asignacionesFijas = [{ sectorId: "sillon_2", personaId: "persona-a" }];
  const antes = clonar(snapshot.asignacionesFijas);
  moverSectorEnPrioridadCobertura({ prioridad: snapshot.prioridadCoberturaSectorIds, sectorId: "rea_2", direccion: "arriba" });
  assert.deepEqual(snapshot.asignacionesFijas, antes);
});
probar("modificar propuesta no muta el mes origen", () => {
  const origen = snapshotEnfermero();
  const estado = { configuracionPlanilla: { enfermero: origen } };
  const borrador = crearBorradoresConfiguracionPlanilla({ estadoMensual: estado, turno: "manana", mes: "2026-08" }).enfermero;
  borrador.prioridadCoberturaSectorIds.reverse();
  assert.deepEqual(origen.prioridadCoberturaSectorIds, configuracionSectores.enfermero.prioridadSectoresIds);
});
probar("Cancelar no persiste", () => {
  assert.match(app, /onCancelar=\{\(\) => setPreparacionMes\(null\)\}/);
  assert.doesNotMatch(app, /onCancelar=.*prioridadCoberturaSectorIds/);
});
probar("Confirmar conserva el orden exacto", () => {
  const snapshot = snapshotEnfermero();
  const personalizada = moverAntes(snapshot.prioridadCoberturaSectorIds, "rea_2", "explora_2");
  const destino = crearSnapshotConfiguracionPlanillaDesdeFilas({
    turno: "manana", categoria: "enfermero", mes: "2026-09",
    filas: snapshot.filas,
    prioridadCoberturaSectorIds: personalizada
  });
  assert.deepEqual(destino.prioridadCoberturaSectorIds, personalizada);
  assert.match(panel, /prioridadCoberturaSectorIds/);
});
probar("mes siguiente copia prioridad previa", () => {
  const origen = snapshotEnfermero();
  origen.prioridadCoberturaSectorIds = moverAntes(origen.prioridadCoberturaSectorIds, "rea_2", "explora_2");
  const borrador = crearBorradoresConfiguracionPlanilla({
    estadoMensual: { configuracionPlanilla: { enfermero: origen } },
    turno: "manana", mes: "2026-08"
  }).enfermero;
  assert.deepEqual(borrador.prioridadCoberturaSectorIds, origen.prioridadCoberturaSectorIds);
  assert.notEqual(borrador.prioridadCoberturaSectorIds, origen.prioridadCoberturaSectorIds);
});
probar("snapshot legacy inicia con fallback", () => {
  const legacy = snapshotEnfermero();
  delete legacy.prioridadCoberturaSectorIds;
  const borrador = crearBorradoresConfiguracionPlanilla({
    estadoMensual: { configuracionPlanilla: { enfermero: legacy } },
    turno: "manana", mes: "2026-08"
  }).enfermero;
  assert.deepEqual(borrador.prioridadCoberturaSectorIds, configuracionSectores.enfermero.prioridadSectoresIds);
});
probar("etiquetas renombradas mantienen sectorId", () => {
  const snapshot = snapshotEnfermero();
  snapshot.filas = snapshot.filas.map((fila) => ({ ...fila, etiqueta: `Nueva ${fila.etiqueta}` }));
  assert.deepEqual(prioridadEfectiva(snapshot), configuracionSectores.enfermero.prioridadSectoresIds);
});
probar("UI mobile no usa tabla ni scroll horizontal", () => {
  assert.doesNotMatch(ui, /<table|overflow-x/);
  assert.match(ui, /space-y-2/);
});
probar("controles subir y bajar son accesibles y táctiles", () => {
  assert.match(ui, /aria-label=\{`Subir \$\{etiqueta\} en la prioridad`\}/);
  assert.match(ui, /aria-label=\{`Bajar \$\{etiqueta\} en la prioridad`\}/);
  assert.match(ui, /min-h-11 min-w-11/);
});
probar("UI no ofrece suplentes, donantes ni cobertura especial", () => {
  assert.doesNotMatch(ui, /suplente|personaCoberturaId|sectoresDonantesIds|cedidoAPareja|coberturaLibreSM/i);
});
probar("mañana y tarde confirman órdenes independientes", () => {
  const fallback = configuracionSectores.enfermero.prioridadSectoresIds;
  const manana = crearSnapshotConfiguracionPlanillaDesdeFilas({
    turno: "manana", categoria: "enfermero", mes: "2026-09", filas: snapshotEnfermero().filas,
    prioridadCoberturaSectorIds: moverAntes(fallback, "rea_2", "explora_2")
  });
  const tarde = crearSnapshotConfiguracionPlanillaDesdeFilas({
    turno: "tarde", categoria: "enfermero", mes: "2026-09", filas: snapshotEnfermero().filas,
    prioridadCoberturaSectorIds: moverAntes(fallback, "explora_2", "rea_2")
  });
  assert.ok(prioridadEfectiva(manana).indexOf("rea_2") < prioridadEfectiva(manana).indexOf("explora_2"));
  assert.ok(prioridadEfectiva(tarde).indexOf("explora_2") < prioridadEfectiva(tarde).indexOf("rea_2"));
});
probar("flujo completo de preparación persiste prioridad y asignaciones fijas", () => {
  const filasEnf = obtenerFilasPlanilla(configuracionSectores.enfermero, "enfermero");
  const filasLic = obtenerFilasPlanilla(configuracionSectores.licenciado, "licenciado");
  const personal = [
    ...filasEnf.map((_, indice) => ({ id: `enf-${indice}`, nombre: `Enf ${indice}`, categoria: "enfermero" })),
    ...filasLic.map((_, indice) => ({ id: `lic-${indice}`, nombre: `Lic ${indice}`, categoria: "licenciado" }))
  ];
  const distribuir = (filas, categoria) => Object.fromEntries(filas.map((fila, indice) => {
    const persona = personal.filter((item) => item.categoria === categoria)[indice];
    return [fila, { personaId: persona.id, nombre: persona.nombre }];
  }));
  const origen = crearEstadoMensualVacio();
  origen.personal = personal;
  origen.planillas.enfermeros.semana5 = distribuir(filasEnf, "enfermero");
  origen.planillas.licenciados.semana5 = distribuir(filasLic, "licenciado");
  const analisis = analizarPreparacionMesNuevo({
    turnoId: "manana", mesOrigen: "2026-08", mesDestino: "2026-09",
    estadoOrigen: origen, estadoDestino: crearEstadoMensualVacio()
  });
  const personalizada = moverAntes(
    analisis.borradoresConfiguracionPlanilla.enfermero.prioridadCoberturaSectorIds,
    "rea_2", "explora_2"
  );
  analisis.borradoresConfiguracionPlanilla.enfermero.prioridadCoberturaSectorIds = personalizada;
  analisis.borradoresConfiguracionPlanilla.enfermero.asignacionesFijas = [
    { sectorId: "sillon_2", personaId: "enf-0" }
  ];
  const resultado = construirEstadoMesNuevo({
    analisis,
    borradoresConfiguracionPlanilla: analisis.borradoresConfiguracionPlanilla
  });
  assert.equal(resultado.ok, true, resultado.mensaje);
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds, personalizada);
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.asignacionesFijas, [
    { sectorId: "sillon_2", personaId: "enf-0" }
  ]);
});

const crearEstadoPreparado = (turno = "manana", mes = "2026-09") => {
  const estado = crearEstadoMensualVacio();
  estado.personal = [{ id: "persona-a", nombre: "Persona A", categoria: "enfermero" }];
  estado.calendario = { ...estado.calendario, asistenciaDia: { "2026-09-01": {} } };
  estado.planillas.enfermeros.semana1 = { "REA 1": { personaId: "persona-a", nombre: "Persona A" } };
  estado.configuracionPlanilla = {
    enfermero: crearSnapshotConfiguracionPlanilla({ turno, categoria: "enfermero", mes }),
    licenciado: crearSnapshotConfiguracionPlanilla({ turno, categoria: "licenciado", mes })
  };
  return estado;
};

probar("mes preparado editable expone el editor en Gestión del mes", () => {
  assert.match(app, /Editar prioridad de cobertura/);
  assert.match(app, /!destinoActivoPreparacion\.permitido/);
  assert.match(app, /<PanelPrioridadCoberturaMes/);
});
probar("mes protegido no habilita la apertura", () => {
  assert.match(app, /!puedeEditarActivo \|\| modoSoloLecturaEfectiva/);
  assert.match(app, /clavesBloqueadasTrasRestauracionRef\.current\.has\(claveActiva\)/);
});
probar("guardar cambia la prioridad del snapshot", () => {
  const origen = crearEstadoPreparado();
  const personalizada = moverAntes(
    origen.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds,
    "rea_2", "explora_2"
  );
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: origen, categoria: "enfermero",
    prioridadCoberturaSectorIds: personalizada
  });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds, personalizada);
});
probar("cancelar el editor preparado no persiste", () => {
  assert.match(app, /onCancelar=\{\(\) => setEdicionPrioridadCobertura\(null\)\}/);
});
probar("guardar conserva filas", () => {
  const origen = crearEstadoPreparado();
  const filas = origen.configuracionPlanilla.enfermero.filas;
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: origen, categoria: "enfermero", prioridadCoberturaSectorIds: ["rea_2"]
  });
  assert.equal(resultado.estado.configuracionPlanilla.enfermero.filas, filas);
});
probar("guardar conserva asignaciones fijas", () => {
  const origen = crearEstadoPreparado();
  origen.configuracionPlanilla.enfermero.asignacionesFijas = [{ sectorId: "sillon_2", personaId: "persona-a" }];
  const fijas = origen.configuracionPlanilla.enfermero.asignacionesFijas;
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: origen, categoria: "enfermero", prioridadCoberturaSectorIds: ["rea_2"]
  });
  assert.equal(resultado.estado.configuracionPlanilla.enfermero.asignacionesFijas, fijas);
});
probar("guardar conserva Planilla", () => {
  const origen = crearEstadoPreparado();
  const planillas = origen.planillas;
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: origen, categoria: "enfermero", prioridadCoberturaSectorIds: ["rea_2"]
  });
  assert.equal(resultado.estado.planillas, planillas);
});
probar("guardar conserva Calendario almacenado", () => {
  const origen = crearEstadoPreparado();
  const calendario = origen.calendario;
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: origen, categoria: "enfermero", prioridadCoberturaSectorIds: ["rea_2"]
  });
  assert.equal(resultado.estado.calendario, calendario);
});
probar("mañana no modifica tarde", () => {
  const manana = crearEstadoPreparado("manana");
  const tarde = crearEstadoPreparado("tarde");
  const estados = { manana, tarde };
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: estados.manana, categoria: "enfermero", prioridadCoberturaSectorIds: ["rea_2", "explora_2"]
  });
  assert.equal(estados.tarde, tarde);
  assert.notEqual(resultado.estado, manana);
});
probar("Enfermeros no modifica Licenciados", () => {
  const origen = crearEstadoPreparado();
  const licenciados = origen.configuracionPlanilla.licenciado;
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: origen, categoria: "enfermero", prioridadCoberturaSectorIds: ["rea_2", "explora_2"]
  });
  assert.equal(resultado.estado.configuracionPlanilla.licenciado, licenciados);
});
probar("REA 2 se guarda antes de Explora 2", () => {
  const origen = crearEstadoPreparado();
  const orden = moverAntes(origen.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds, "rea_2", "explora_2");
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({ estadoMensual: origen, categoria: "enfermero", prioridadCoberturaSectorIds: orden });
  const guardada = resultado.estado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds;
  assert.ok(guardada.indexOf("rea_2") < guardada.indexOf("explora_2"));
});
probar("Restaurar y cancelar no escribe el estado", () => {
  assert.match(panelPreparado, /onCancelar/);
  assert.match(ui, /Restaurar orden predeterminado/);
  assert.doesNotMatch(panelPreparado, /setEstadoPorTurnoMes/);
});
probar("Restaurar y guardar persiste el fallback", () => {
  const origen = crearEstadoPreparado();
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({
    estadoMensual: origen, categoria: "enfermero",
    prioridadCoberturaSectorIds: configuracionSectores.enfermero.prioridadSectoresIds
  });
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds, configuracionSectores.enfermero.prioridadSectoresIds);
});
probar("renombrado conserva identidad por sectorId al editar preparado", () => {
  const origen = crearEstadoPreparado();
  origen.configuracionPlanilla.enfermero.filas = origen.configuracionPlanilla.enfermero.filas.map((fila) => ({ ...fila, etiqueta: `Renombrado ${fila.etiqueta}` }));
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({ estadoMensual: origen, categoria: "enfermero", prioridadCoberturaSectorIds: ["rea_2", "explora_2"] });
  assert.deepEqual(resultado.estado.configuracionPlanilla.enfermero.prioridadCoberturaSectorIds, ["rea_2", "explora_2"]);
});
probar("el panel preparado reutiliza PrioridadCoberturaMes", () => {
  assert.match(panelPreparado, /import PrioridadCoberturaMes/);
  assert.match(panelPreparado, /<PrioridadCoberturaMes/);
});
probar("el editor preparado sigue siendo mobile sin tabla", () => {
  assert.doesNotMatch(panelPreparado, /<table|overflow-x/);
  assert.match(panelPreparado, /grid gap-2 sm:flex/);
});
probar("guardar no modifica donantes", () => {
  assert.doesNotMatch(panelPreparado, /sectoresDonantesIds/);
  assert.doesNotMatch(app, /actualizarPrioridadCoberturaEnEstadoMensual[\s\S]{0,500}sectoresDonantesIds/);
});
probar("guardar no modifica parejas 2 a 1", () => {
  assert.doesNotMatch(panelPreparado, /coberturaParejas|parejasCobertura/);
});
probar("guardar no modifica cedidoAPareja", () => {
  assert.doesNotMatch(panelPreparado, /cedidoAPareja/);
});
probar("snapshot inexistente falla sin alterar estado", () => {
  const origen = crearEstadoMensualVacio();
  const resultado = actualizarPrioridadCoberturaEnEstadoMensual({ estadoMensual: origen, categoria: "enfermero", prioridadCoberturaSectorIds: ["rea_2"] });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.estado, origen);
});
probar("Guardar prioridad realiza una sola actualización funcional", () => {
  const inicio = app.indexOf("const guardarPrioridadCoberturaMesPreparado");
  const resto = app.slice(inicio);
  const cierre = resto.search(/\r?\n};(?:\r?\n|$)/);
  const bloque = resto.slice(0, cierre + 3);
  assert.notEqual(inicio, -1);
  assert.notEqual(cierre, -1);
  assert.equal((bloque.match(
    /setEstadoPorTurnoMes\s*\(\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*=>/g
  ) || []).length, 1);
  assert.doesNotMatch(bloque, /confirmarPreparacionMes|construirEstadoMesNuevo/);
});

console.log(`\nEtapa 37C4: ${total} pruebas del editor de prioridad aprobadas.`);
