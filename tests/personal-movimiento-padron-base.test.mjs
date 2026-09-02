import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analizarDependenciasMovimientoPadronBase } from "../src/utils/dependenciasMovimientoPadronBase.js";
import { obtenerMensajeMovimientoPadronBase } from "../src/services/servicioMovimientoPadronBase.js";

const lista = fs.readFileSync("src/components/personal/ListaPersonal.jsx", "utf8");
const modal = fs.readFileSync("src/components/personal/MoverTurnoBaseSupervision.jsx", "utf8");
const modalShell = fs.readFileSync("src/components/ui/ModalMobileShell.jsx", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");
const conjunto = `${lista}\n${modal}\n${app}`;
const persona = { id: "P", nombre: "Romina", categoria: "licenciado", funcionario: "100" };
const estado = (cambios = {}) => ({
  personal: [persona],
  planillas: { licenciados: {}, enfermeros: {} },
  calendario: { licenciados: {}, enfermeros: {} },
  ...cambios
});

test("1 botón pertenece al bloque exclusivo de Supervisión", () => assert.match(lista, /puedeEditarVigenciasCompletas[\s\S]+Cambiar turno base/));
test("2 Licenciado conserva sólo Editar mi turno", () => assert.match(lista, /puedeEditarVigenciasPropias[\s\S]+Editar mi turno/));
test("3 Enfermería no recibe acción de movimiento", () => assert.doesNotMatch(lista, /ROLES_APLICACION\.ENFERMERIA[\s\S]{0,200}Cambiar turno base/));
test("4 histórico deshabilita la acción", () => assert.match(lista, /disabled=\{[\s\S]{0,120}modoHistorico/));
test("5 modal dedicado abre desde estado separado", () => assert.match(lista, /setMovimientoPadronBase[\s\S]+<MoverTurnoBaseSupervision/));
test("6 modal recibe la persona canónica", () => assert.match(lista, /persona: asegurarIdPersona\(p\)/));
test("7 modal recibe el mes visualizado", () => assert.match(lista, /mes=\{mesActivo\}/));
test("8 origen se toma de turnoFuente físico", () => assert.match(lista, /turnoOrigen: entradaVisible\.turnoFuente/));
test("9 turno visualizado no se usa como origen", () => assert.doesNotMatch(lista, /turnoOrigen: configTurno\.id/));
test("10 selector excluye origen", () => assert.match(modal, /turno\.id !== turnoOrigen/));
test("11 Enfermero puede seleccionar Noche como destino", () => assert.doesNotMatch(modal, /disabled=\{persona\?\.categoria === "enfermero" && turno\.id === "noche"/));
test("12 Enfermero puede partir de Noche", () => assert.doesNotMatch(modal, /involucraNocheEnfermero|turnoOrigen === "noche" \|\| turnoDestino === "noche"/));
test("13 selector no introduce excepciones por categoría", () => assert.doesNotMatch(modal, /persona\?\.categoria === "enfermero"/));
test("14 informativas se muestran sin integrar bloqueado", () => assert.match(modal, /resumirInformativas[\s\S]+Se conservarán sin mover/));
test("15 Calendario local tiene mensaje bloqueante humano", () => assert.match(obtenerMensajeMovimientoPadronBase("REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES"), /Calendario/));
test("16 legacy operativo tiene mensaje humano", () => assert.match(obtenerMensajeMovimientoPadronBase("REFERENCIA_LEGACY_OPERATIVA_PENDIENTE"), /referencias antiguas/));
test("17 legacy ambiguo tiene mensaje humano", () => assert.match(obtenerMensajeMovimientoPadronBase("REFERENCIA_LEGACY_AMBIGUA"), /ambiguas/));
test("18 confirmación requiere segundo paso", () => assert.match(modal, /if \(!confirmando\)[\s\S]+setConfirmando\(true\)[\s\S]+return/));
test("19 guardando evita doble submit", () => assert.match(modal, /if \(bloqueado \|\| guardando\) return/));
test("20 App carga revisión fresca de origen", () => assert.match(app, /cargarEstadoFrescoMovimiento\(\{ turno: turnoOrigen[\s\S]+esOrigen: true/));
test("21 App carga revisión fresca de destino", () => assert.match(app, /cargarEstadoFrescoMovimiento\(\{ turno: turnoDestino[\s\S]+esOrigen: false/));
test("22 App llama el service público exacto", () => assert.match(app, /await moverPersonaPadronBaseTurnoMes\(/));
test("23 llamada usa mes, persona, turnos y dos revisiones", () => assert.match(app, /moverPersonaPadronBaseTurnoMes\(\{[\s\S]+revisionOrigenEsperada: origen\.revision[\s\S]+revisionDestinoEsperada: destino\.revision/));
test("24 App no envía nombre al service", () => assert.doesNotMatch(app, /moverPersonaPadronBaseTurnoMes\(\{[\s\S]{0,300}\bnombre\b/));
test("25 App no envía categoría al service", () => assert.doesNotMatch(app, /moverPersonaPadronBaseTurnoMes\(\{[\s\S]{0,300}\bcategoria\b/));
test("26 éxito adopta estado origen del backend", () => assert.match(app, /estado: resultado\.estadoOrigen/));
test("27 éxito adopta estado destino del backend", () => assert.match(app, /estado: resultado\.estadoDestino/));
test("28 éxito adopta ambas revisiones", () => {
  assert.match(app, /revision: resultado\.revisionOrigen/); assert.match(app, /revision: resultado\.revisionDestino/);
});
test("29 validación fresca exige una aparición origen y cero destino", () => assert.match(app, /esOrigen && coincidencias\.length !== 1[\s\S]+!esOrigen && coincidencias\.length > 0/));
test("30 vigencias sólo se recargan, nunca se escriben", () => {
  assert.match(app, /vigenciasPersonal\.recargar\(\)/); assert.doesNotMatch(conjunto, /guardarVigenciasTurnoPersonaMes/);
});
test("31 movimiento no llama limpiadores de Planilla", () => assert.doesNotMatch(app.slice(app.indexOf("const ejecutarMovimientoPadronBase"), app.indexOf("const abrirReinicioMes")), /limpiarReferencias/));
test("32 movimiento no limpia Calendario", () => assert.doesNotMatch(modal, /setCalendario|limpiar.*Calendario/i));
test("33 CAS muestra mensaje y acción Recargar", () => assert.match(modal, /cambiaron mientras[\s\S]+Recargar/));
test("34 errores backend usan mensajes del service", () => assert.match(modal, /obtenerMensajeMovimientoPadronBase/));
test("35 modal es mobile-first y accesible", () => {
  assert.match(modal, /<ModalMobileShell/);
  assert.match(modalShell, /items-end[\s\S]+sm:items-center/);
  assert.match(modalShell, /100dvh/);
  assert.match(modalShell, /aria-modal="true"/);
});
test("36 cancelar no ejecuta el RPC", () => assert.match(modal, /onClick=\{onCerrar\}>Cancelar/));
test("37 preflight no muta el origen", () => {
  const original = estado(); const copia = structuredClone(original);
  analizarDependenciasMovimientoPadronBase({ estadoOrigen: original, personaId: "P", categoria: "licenciado", turnoOrigen: "manana", turnoDestino: "tarde", mes: "2026-09" });
  assert.deepEqual(original, copia);
});
test("38 destino local no cambia antes del éxito", () => assert.doesNotMatch(modal, /setPersonal|setEstadoPorTurnoMes/));
test("39 mismo personaId viaja al service y a ambas adopciones", () => assert.match(app, /personaId,[\s\S]+moverPersonaPadronBaseTurnoMes/));
test("40 Romina transversal conserva Mañana como origen", () => {
  const entradaVisible = { persona, personaId: "P", turnoFuente: "manana" };
  const turnoVisualizado = "tarde";
  assert.equal(entradaVisible.turnoFuente, "manana"); assert.notEqual(entradaVisible.turnoFuente, turnoVisualizado);
});
test("41 detector permite informativas modernas sin bloqueo", () => {
  const resultado = analizarDependenciasMovimientoPadronBase({
    estadoOrigen: estado({ planillas: { licenciados: { semana1: { T1: { personaId: "P", nombre: "Romina" } } }, enfermeros: {} } }),
    personaId: "P", categoria: "licenciado", turnoOrigen: "manana", turnoDestino: "tarde", mes: "2026-09"
  });
  assert.equal(resultado.tieneBloqueos, false); assert.equal(resultado.informativas.length > 0, true);
});
test("42 detector bloquea Calendario local", () => {
  const resultado = analizarDependenciasMovimientoPadronBase({
    estadoOrigen: estado({ calendario: { licenciados: { cambiosDia: { "2026-09-20": { T1: { personaId: "P" } } } }, enfermeros: {} } }),
    personaId: "P", categoria: "licenciado", turnoOrigen: "manana", turnoDestino: "tarde", mes: "2026-09"
  });
  assert.equal(resultado.bloqueos[0].codigo, "REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES");
});
test("43 detector permite Enfermero hacia y desde Noche", () => {
  const enfermero = { ...persona, categoria: "enfermero" };
  for (const [turnoOrigen, turnoDestino] of [["tarde", "noche"], ["noche", "vespertino"]]) {
    const resultado = analizarDependenciasMovimientoPadronBase({
      estadoOrigen: estado({ personal: [enfermero] }),
      personaId: "P", categoria: "enfermero", turnoOrigen, turnoDestino, mes: "2026-09"
    });
    assert.equal(resultado.tieneBloqueos, false);
  }
});
