import assert from "node:assert/strict";
import fs from "node:fs";
import { ESTADOS_ASISTENCIA } from "../src/utils/asistenciaPersonas.js";
import { obtenerCohortePresentacionAsistenciaV2 } from "../src/utils/asistenciaV2.js";
import { crearResumenTurno } from "../src/utils/resumenTurno.js";
import { crearResumenCategoriaInicio, crearResumenInicioTurno } from "../src/utils/resumenInicioTurno.js";
import {
  compararDisponibilidadCalendario,
  crearPredicadosDisponibilidadNormalizada,
  prepararContextoOperativoDisponibilidad
} from "../src/utils/comparacionDisponibilidadCalendario.js";
import {
  crearSnapshotCierreTurno,
  resolverDatosPresentacionCierreTurno
} from "../src/utils/cierreTurno.js";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${String(aprobadas).padStart(2, "0")} ${nombre}`);
};

const ana = { id: "ana", nombre: "Ana", categoria: "enfermero" };
const beto = { id: "beto", nombre: "Beto", categoria: "enfermero" };
const extra = { id: "extra", nombre: "Extra", categoria: "enfermero", esExtra: true };
const asignaciones = [
  { nombre: "REA 1", tipo: "sector", enfermero: ana },
  { nombre: "SIN ASIGNAR", tipo: "sector", enfermero: beto },
  { nombre: "Apoyo", tipo: "sector", enfermero: extra }
];
const asistencia = {
  "id:ana": ESTADOS_ASISTENCIA.PRESENTE,
  "id:extra": ESTADOS_ASISTENCIA.PRESENTE
};
const resumen = (personasPrevistas, opciones = {}) => crearResumenTurno({
  asignaciones,
  personasPrevistas,
  asistencia,
  destinosOperativos: asignaciones,
  ...opciones
});

const proyectarParticipantesSinTurnoEmbebido = ({ personas, noDisponibles = [], asistenciaDia = {} }) => {
  const diagnostico = compararDisponibilidadCalendario({
    personas,
    contextoOperativo: prepararContextoOperativoDisponibilidad({
      noDisponiblesDiaTurno: noDisponibles,
      asistenciaDia
    }),
    contextoAdministrativo: {
      personal: personas,
      fecha: "2026-10-25",
      turnoConsultado: "tarde",
      turnoBaseContexto: "tarde"
    },
    comparar: false
  });
  const predicados = crearPredicadosDisponibilidadNormalizada(
    diagnostico.disponibilidadNormalizadaPorPersonaId
  );
  return obtenerCohortePresentacionAsistenciaV2({
    cohorteConfirmable: personas.filter(predicados.esPersonaDisponibleNormalizada)
  });
};

probar("participante sin registro queda pendiente", () => assert.equal(resumen([beto]).conteos.pendientes, 1));
probar("bloqueado fuera de cohorte no queda pendiente", () => assert.equal(resumen([ana]).conteos.pendientes, 0));
probar("presente cuenta una sola vez", () => assert.equal(resumen([ana, ana]).conteos.presentes, 1));
probar("No Disponible separado no cuenta presente", () => assert.equal(resumen([], { noDisponibles: [ana] }).conteos.presentes, 0));
probar("No Disponible separado no cuenta pendiente", () => assert.equal(resumen([], { noDisponibles: [ana] }).conteos.pendientes, 0));
probar("No Disponible tiene contador propio", () => assert.equal(resumen([], { noDisponibles: [ana] }).conteos.noDisponibles, 1));
probar("Ausente legacy conserva su contador", () => {
  const r = crearResumenTurno({ personasPrevistas: [ana], asistencia: { "id:ana": "ausente" } });
  assert.equal(r.conteos.ausentes, 1);
});
probar("ausente legacy no se convierte en No Disponible", () => {
  const r = crearResumenTurno({ personasPrevistas: [ana], asistencia: { "id:ana": "ausente" } });
  assert.equal(r.conteos.noDisponibles, 0);
});
probar("certificado fuera de cohorte no queda pendiente", () => assert.equal(resumen([], { certificaciones: [ana] }).conteos.pendientes, 0));
probar("licenciado fuera de cohorte no queda pendiente", () => assert.equal(resumen([], { licencias: [ana] }).conteos.pendientes, 0));
probar("Extra participante integra cohorte", () => assert.equal(resumen([extra]).conteos.presentes, 1));
probar("cohorte deduplica identidad", () => assert.equal(resumen([ana, ana, beto]).conteos.previstos, 2));

probar("Inicio separa No Disponibles", () => {
  assert.equal(crearResumenCategoriaInicio({ personasPrevistas: [], noDisponibles: [ana] }).noDisponibles, 1);
});
probar("Inicio no mezcla No Disponible con Ausente", () => {
  assert.equal(crearResumenCategoriaInicio({ personasPrevistas: [], noDisponibles: [ana] }).ausentes, 0);
});
probar("Inicio no mezcla No Disponible con pendiente", () => {
  assert.equal(crearResumenCategoriaInicio({ personasPrevistas: [], noDisponibles: [ana] }).pendientes, 0);
});
probar("Inicio conserva Ausente legacy", () => {
  const r = crearResumenCategoriaInicio({ personasPrevistas: [ana], asistencia: { "id:ana": "ausente" }, ausentes: [ana] });
  assert.deepEqual([r.ausentesAsistencia, r.ausentes], [1, 1]);
});
probar("Inicio separa licencias", () => assert.equal(crearResumenCategoriaInicio({ licencias: [ana] }).licencias, 1));
probar("Inicio separa certificaciones", () => assert.equal(crearResumenCategoriaInicio({ certificaciones: [ana] }).certificaciones, 1));
probar("Inicio cuenta Extra una vez", () => assert.equal(crearResumenCategoriaInicio({ extras: [extra, extra] }).extras, 1));
probar("Inicio cuenta Sin asignar una vez", () => assert.equal(crearResumenCategoriaInicio({ asignaciones: [asignaciones[1], asignaciones[1]] }).sinAsignar, 1));
probar("Inicio conserva el motivo real de No Disponible", () => {
  const detalle = { persona: ana, motivo: "falta_sin_aviso", motivoEtiqueta: "Falta sin aviso" };
  assert.equal(crearResumenCategoriaInicio({ noDisponiblesDetalle: [detalle] }).noDisponiblesDetalle[0].motivoEtiqueta, "Falta sin aviso");
});

const legacy = { persona: ana, sectorOrigen: "REA 1" };
probar("cohorte de presentacion incluye confirmables", () => {
  assert.equal(obtenerCohortePresentacionAsistenciaV2({ cohorteConfirmable: [beto] }).length, 1);
});
probar("cohorte de presentacion incluye Ausente legacy", () => {
  assert.equal(obtenerCohortePresentacionAsistenciaV2({ ausentesLegacy: [legacy] })[0].id, "ana");
});
probar("cohorte de presentacion deduplica legacy y confirmable", () => {
  assert.equal(obtenerCohortePresentacionAsistenciaV2({ cohorteConfirmable: [ana], ausentesLegacy: [legacy] }).length, 1);
});
probar("tres participantes sin turno embebido quedan previstos y pendientes", () => {
  const personas = [ana, beto, extra];
  const cohorte = proyectarParticipantesSinTurnoEmbebido({ personas });
  const conteos = crearResumenTurno({ personasPrevistas: cohorte }).conteos;
  assert.deepEqual([conteos.previstos, conteos.presentes, conteos.pendientes], [3, 0, 3]);
});
probar("un Presente entre tres participantes conserva dos Pendientes", () => {
  const personas = [ana, beto, extra];
  const cohorte = proyectarParticipantesSinTurnoEmbebido({ personas });
  const conteos = crearResumenTurno({ personasPrevistas: cohorte, asistencia: { "id:ana": "presente" } }).conteos;
  assert.deepEqual([conteos.previstos, conteos.presentes, conteos.pendientes], [3, 1, 2]);
});
probar("un No Disponible excluye solo a esa persona", () => {
  const personas = [ana, beto, extra];
  const cohorte = proyectarParticipantesSinTurnoEmbebido({
    personas,
    noDisponibles: [{ personaId: "beto", motivo: "falta_sin_aviso" }]
  });
  const conteos = crearResumenTurno({ personasPrevistas: cohorte, noDisponibles: [beto] }).conteos;
  assert.deepEqual([conteos.previstos, conteos.pendientes, conteos.noDisponibles], [2, 2, 1]);
});
probar("Enfermeros y Licenciados conservan cohortes independientes", () => {
  const licenciado = { id: "lic-1", nombre: "Licenciada", categoria: "licenciado" };
  const resultado = crearResumenInicioTurno({
    enfermeros: { personasPrevistas: proyectarParticipantesSinTurnoEmbebido({ personas: [ana, beto] }) },
    licenciados: { personasPrevistas: proyectarParticipantesSinTurnoEmbebido({ personas: [licenciado] }) }
  });
  assert.deepEqual([
    resultado.porCategoria.enfermero.previstos,
    resultado.porCategoria.licenciado.previstos,
    resultado.general.previstos,
    resultado.general.pendientes
  ], [2, 1, 3, 3]);
});

const snapshot = crearSnapshotCierreTurno({
  fecha: "2026-10-25",
  tipo: "enfermero",
  resumen: resumen([ana, beto, extra], { noDisponibles: [beto] }),
  asignaciones: [{ nombre: "REA 1", tipo: "sector", etiquetaVacio: "Sin cobertura — Falta sin aviso" }],
  asistencia,
  personasPrevistas: [ana, beto, extra],
  noDisponibles: [beto],
  noDisponiblesDetalle: [{
    persona: beto,
    motivo: "falta_sin_aviso",
    motivoEtiqueta: "Falta sin aviso",
    motivoBreve: "Falta sin aviso",
    sectorOrigen: "REA 1"
  }]
});

probar("snapshot nuevo conserva Presente", () => assert.equal(snapshot.asistencia["id:ana"], "presente"));
probar("snapshot nuevo resuelve Pendiente", () => assert.equal(snapshot.asistencia["id:beto"], "pendiente"));
probar("snapshot nuevo conserva Extra presente", () => assert.equal(snapshot.asistencia["id:extra"], "presente"));
probar("snapshot nuevo conserva No Disponible", () => assert.equal(snapshot.noDisponibles[0].personaId, "beto"));
probar("snapshot nuevo conserva codigo de motivo", () => assert.equal(snapshot.noDisponiblesDetalle[0].motivo, "falta_sin_aviso"));
probar("snapshot nuevo conserva texto del motivo", () => assert.equal(snapshot.noDisponiblesDetalle[0].motivoEtiqueta, "Falta sin aviso"));
probar("snapshot nuevo conserva sector de origen", () => assert.equal(snapshot.noDisponiblesDetalle[0].sectorOrigen, "REA 1"));
probar("snapshot nuevo no inventa Ausente", () => assert.equal(Object.values(snapshot.asistencia).includes("ausente"), false));
probar("snapshot nuevo congela motivo para PDF", () => assert.match(snapshot.asignaciones[0].etiquetaVacio, /Falta sin aviso/));
probar("snapshot presentado conserva detalle literal", () => {
  assert.deepEqual(resolverDatosPresentacionCierreTurno({ snapshot }).noDisponiblesDetalle, snapshot.noDisponiblesDetalle);
});
probar("snapshot viejo permanece literal", () => {
  const viejo = { asistencia: { "id:ana": "ausente" }, personasPrevistas: [{ personaId: "ana", nombre: "Ana" }] };
  const antes = structuredClone(viejo);
  resolverDatosPresentacionCierreTurno({ snapshot: viejo });
  assert.deepEqual(viejo, antes);
});

const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
const vistaInicio = fs.readFileSync("src/components/layout/VistaInicio.jsx", "utf8");
const supervision = fs.readFileSync("src/utils/proyeccionDotacionSupervision.js", "utf8");
const controles = fs.readFileSync("src/components/calendario/ControlesAsistenciaV2.jsx", "utf8");

probar("Calendario entrega cohorte canonica a resumen", () => assert.match(calendario, /personasPrevistas:\s*cohortePresentacionAsistencia/));
probar("Calendario entrega motivos al cierre", () => assert.match(calendario, /noDisponiblesDetalle:\s*noDisponiblesPresentacion/));
probar("PDF vivo conserva motivo real", () => assert.match(calendario, /Sin cobertura[^`]*\$\{noDisponible\.motivoBreve\}/));
probar("Inicio presenta Pendientes de confirmar", () => assert.match(vistaInicio, /Pendientes de confirmar/));
probar("Inicio presenta No disponibles separado", () => assert.match(vistaInicio, /etiqueta="No disponibles"/));
probar("Supervision separa bajas de asistencia", () => {
  assert.match(supervision, /bajasConocidas:/);
  assert.match(supervision, /asistenciaRegistrada:/);
});
probar("Supervision conserva Ausente legacy", () => assert.match(supervision, /ESTADOS_ASISTENCIA\.AUSENTE/));
probar("UI D2B conserva controles iconicos", () => {
  assert.match(controles, /aria-label=\{presente/);
  assert.match(controles, /IconoSacarDeDistribucion/);
});
probar("motores 40H no fueron importados por resumen", () => {
  const fuente = fs.readFileSync("src/utils/resumenTurno.js", "utf8");
  assert.doesNotMatch(fuente, /resolverDistribucionDiaria|resolverDistribucionLicenciadosLegacy/);
});

assert.equal(aprobadas, 48);
console.log(`\n${aprobadas} comprobaciones de presentacion y cierre de asistencia v2 aprobadas.`);
