import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearRegistroNoDisponible,
  MOTIVOS_NO_DISPONIBLE,
  obtenerNoDisponiblesOperativosPorTurnoEfectivo
} from "../src/utils/noDisponiblesMotivos.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${total} ${nombre}`);
};

const persona = { id: "persona-a", nombre: "Persona A", categoria: "enfermero" };
const padron = (vigencias) => ({
  porPersonaId: { "persona-a": { persona, personaId: "persona-a", vigencias } }
});
const registro = (motivo, detalle = "") => crearRegistroNoDisponible({
  persona,
  motivo,
  detalle,
  turnoDestino: motivo === MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO ? "noche" : ""
}).registro;
const estados = ({ fecha, motivo, turnoOrigen = "tarde" }) => ({
  tarde: { calendario: { enfermeros: { noDisponibles: turnoOrigen === "tarde" ? { [fecha]: [registro(motivo, "detalle conservado")] } : {} } } },
  manana: { calendario: { enfermeros: { noDisponibles: turnoOrigen === "manana" ? { [fecha]: [registro(motivo, "detalle conservado")] } : {} } } }
});
const proyectar = ({ fecha, motivo, turno, vigencias, turnoOrigen = "tarde" }) => {
  const estadosPorTurno = estados({ fecha, motivo, turnoOrigen });
  return obtenerNoDisponiblesOperativosPorTurnoEfectivo({
    estadosPorTurno,
    categoria: "enfermeros",
    fecha,
    turno,
    padronVigencias: padron(vigencias),
    registrosActuales: estadosPorTurno[turno]?.calendario?.enfermeros?.noDisponibles?.[fecha] || []
  });
};

const vigenciasSeptiembre = [
  { turno: "tarde", desde: "2026-09-01", hasta: "2026-09-14" },
  { turno: "manana", desde: "2026-09-15", hasta: "2026-09-30" }
];

probar("Falta con aviso anterior al cambio permanece en Tarde", () => {
  assert.equal(proyectar({ fecha: "2026-09-10", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO, turno: "tarde", vigencias: vigenciasSeptiembre }).length, 1);
  assert.equal(proyectar({ fecha: "2026-09-10", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO, turno: "manana", vigencias: vigenciasSeptiembre }).length, 0);
});

probar("Falta con aviso futura deja el turno anterior y aparece en el efectivo", () => {
  assert.equal(proyectar({ fecha: "2026-09-20", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO, turno: "tarde", vigencias: vigenciasSeptiembre }).length, 0);
  const [proyectado] = proyectar({ fecha: "2026-09-20", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO, turno: "manana", vigencias: vigenciasSeptiembre });
  assert.equal(proyectado.personaId, "persona-a");
  assert.equal(proyectado.turnoOrigenEstado, "tarde");
});

probar("el calendario vivo activo incorpora inmediatamente un alta aunque la fotografía siga vacía", () => {
  const vivo = registro(MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO);
  const fotografiaAnterior = estados({ fecha: "2026-09-10", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO });
  fotografiaAnterior.tarde.calendario.enfermeros.noDisponibles["2026-09-10"] = [];
  const resultado = obtenerNoDisponiblesOperativosPorTurnoEfectivo({
    estadosPorTurno: fotografiaAnterior,
    categoria: "enfermeros",
    fecha: "2026-09-10",
    turno: "tarde",
    padronVigencias: padron(vigenciasSeptiembre),
    registrosActuales: [vivo]
  });
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].personaId, "persona-a");
  assert.equal(resultado[0].turnoOrigenEstado, "tarde");
});

probar("el calendario vivo activo no resucita una baja desde una fotografía anterior", () => {
  const fotografiaAnterior = estados({ fecha: "2026-09-10", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO });
  const resultado = obtenerNoDisponiblesOperativosPorTurnoEfectivo({
    estadosPorTurno: fotografiaAnterior,
    categoria: "enfermeros",
    fecha: "2026-09-10",
    turno: "tarde",
    padronVigencias: padron(vigenciasSeptiembre),
    registrosActuales: []
  });
  assert.deepEqual(resultado, []);
});

probar("la fuente viva reemplaza la versión antigua del turno activo sin duplicarla", () => {
  const fotografiaAnterior = estados({ fecha: "2026-09-10", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO });
  const vivo = { ...registro(MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO), detalle: "edición inmediata" };
  const resultado = obtenerNoDisponiblesOperativosPorTurnoEfectivo({
    estadosPorTurno: fotografiaAnterior,
    categoria: "enfermeros",
    fecha: "2026-09-10",
    turno: "tarde",
    padronVigencias: padron(vigenciasSeptiembre),
    registrosActuales: [vivo]
  });
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].detalle, "edición inmediata");
});

for (const motivo of [
  MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO,
  MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO,
  MOTIVOS_NO_DISPONIBLE.OTRO
]) {
  probar(`${motivo} local conserva respuesta inmediata desde registrosActuales`, () => {
    const vivo = registro(motivo, motivo === MOTIVOS_NO_DISPONIBLE.OTRO ? "detalle" : "");
    const resultado = obtenerNoDisponiblesOperativosPorTurnoEfectivo({
      estadosPorTurno: { tarde: { calendario: { enfermeros: { noDisponibles: {} } } } },
      categoria: "enfermeros",
      fecha: "2026-09-10",
      turno: "tarde",
      padronVigencias: padron(vigenciasSeptiembre),
      registrosActuales: [vivo]
    });
    assert.equal(resultado.length, 1);
  });
}

for (const motivo of [
  MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO,
  MOTIVOS_NO_DISPONIBLE.ADHESION_PARO,
  MOTIVOS_NO_DISPONIBLE.OTRO
]) {
  probar(`${motivo} sigue el turno efectivo y conserva metadata`, () => {
    const [proyectado] = proyectar({ fecha: "2026-09-20", motivo, turno: "manana", vigencias: vigenciasSeptiembre });
    assert.equal(proyectado.detalle, "detalle conservado");
    assert.equal(proyectado.turnoOrigenEstado, "tarde");
    if (motivo === MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO) assert.equal(proyectado.turnoDestino, "noche");
  });
}

probar("cambio entre meses no reinterpreta agosto y proyecta septiembre", () => {
  const agosto = [{ turno: "tarde", desde: "2026-08-01", hasta: "2026-08-31" }];
  const septiembre = [{ turno: "manana", desde: "2026-09-01", hasta: "2026-09-30" }];
  assert.equal(proyectar({ fecha: "2026-08-31", motivo: MOTIVOS_NO_DISPONIBLE.OTRO, turno: "tarde", vigencias: agosto }).length, 1);
  assert.equal(proyectar({ fecha: "2026-09-01", motivo: MOTIVOS_NO_DISPONIBLE.OTRO, turno: "manana", vigencias: septiembre }).length, 1);
});

probar("Cambio con otro turno no se proyecta fuera del calendario que contiene su Extra", () => {
  assert.equal(proyectar({ fecha: "2026-09-20", motivo: MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO, turno: "manana", vigencias: vigenciasSeptiembre }).length, 0);
  assert.equal(proyectar({ fecha: "2026-09-20", motivo: MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO, turno: "tarde", vigencias: vigenciasSeptiembre }).length, 1);
});

probar("Certificación del día no crea un No disponible auxiliar", () => {
  const resultado = crearRegistroNoDisponible({ persona, motivo: MOTIVOS_NO_DISPONIBLE.CERTIFICACION_DIA });
  assert.equal(resultado.registro, null);
  assert.match(resultado.error, /Certificaciones/);
});

probar("la proyección no muta ni duplica el registro persistido", () => {
  const origen = estados({ fecha: "2026-09-20", motivo: MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO });
  const original = origen.tarde.calendario.enfermeros.noDisponibles["2026-09-20"][0];
  const copia = structuredClone(origen);
  const resultado = obtenerNoDisponiblesOperativosPorTurnoEfectivo({ estadosPorTurno: origen, categoria: "enfermeros", fecha: "2026-09-20", turno: "manana", padronVigencias: padron(vigenciasSeptiembre) });
  assert.equal(resultado.length, 1);
  assert.notEqual(resultado[0], original);
  assert.deepEqual(origen, copia);
});

probar("App actualiza el calendario de origen y conserva la guarda de permisos", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(app, /actualizarCalendarioNoDisponibleEnOrigen[\s\S]*puedeMutarClaveMensual/);
  assert.match(app, /puedeMutarNoDisponibleOrigen=\{\(turnoOrigenEstado\)/);
});

probar("Calendario oculta acciones proyectadas sin permiso y no toca cierres", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(calendario, /puedeEditarNoDisponible\(registro\.registro\)/);
  assert.match(calendario, /actualizarNoDisponibleEnOrigen\(formularioNoDisponible\.registro/);
  assert.doesNotMatch(calendario, /crearSnapshotCierreTurno[\s\S]{0,120}turnoOrigenEstado/);
});

console.log(`\n${total} pruebas de No disponibles por turno efectivo pasaron.`);
