import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { MOTIVOS_NO_DISPONIBLE } from "../src/utils/noDisponiblesMotivos.js";

const ruta = "supabase/migrations/20260901120000_alinear_rpc_movimiento_padron_dependencias.sql";
const sql = fs.readFileSync(ruta, "utf8");
const definicion = sql.slice(sql.indexOf("create or replace function public.mover_persona_padron_base_turno_mes"));

test("RPC conserva nombre, firma, retorno y security definer", () => {
  assert.match(definicion, /mover_persona_padron_base_turno_mes\(\s*p_mes text,\s*p_persona_id text,\s*p_turno_origen text,\s*p_turno_destino text,\s*p_revision_origen_esperada bigint,\s*p_revision_destino_esperada bigint\s*\)/);
  assert.match(definicion, /returns jsonb[\s\S]+language plpgsql[\s\S]+security definer/);
});

test("motivos proyectables mantienen paridad explícita entre cliente y RPC", () => {
  const proyectables = [
    MOTIVOS_NO_DISPONIBLE.FALTA_CON_AVISO,
    MOTIVOS_NO_DISPONIBLE.SUPERVISION_OTRO_TURNO,
    MOTIVOS_NO_DISPONIBLE.ADHESION_PARO,
    MOTIVOS_NO_DISPONIBLE.OTRO
  ];
  for (const motivo of proyectables) assert.match(definicion, new RegExp(`'${motivo}'`));
  assert.equal(proyectables.includes(MOTIVOS_NO_DISPONIBLE.CAMBIO_OTRO_TURNO), false);
  assert.doesNotMatch(
    definicion.slice(definicion.indexOf("and btrim(coalesce(v_referencia_json ->> 'motivo'"), definicion.indexOf("elsif btrim(coalesce(v_referencia_json ->> 'personaCoberturaId'")),
    /cambio_otro_turno/
  );
});

test("sólo titular moderno sin cobertura ni vínculo puede proyectarse", () => {
  assert.match(definicion, /v_referencia_json ->> 'personaId'[\s\S]+v_persona_id/);
  assert.match(definicion, /v_referencia_json ->> 'personaCoberturaId'[\s\S]+<>? '?'/);
  assert.match(definicion, /vinculacionCambioOtroTurno'[\s\S]+false/);
});

test("Cambio con otro turno y personaCoberturaId conservan bloqueo", () => {
  assert.doesNotMatch(definicion, /'cambio_otro_turno'\s*[,)]/);
  assert.match(definicion, /personaCoberturaId'[\s\S]+REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES/);
});

test("Extra vinculado se audita en todos los estados del mes", () => {
  assert.match(definicion, /for v_estado in[\s\S]+where e\.mes = p_mes[\s\S]+v_calendario/);
  assert.match(definicion, /v_calendario -> 'extras'/);
  assert.match(definicion, /vinculacionCambioOtroTurno/);
  assert.match(definicion, /personaCubiertaId/);
  assert.match(definicion, /detail = v_estado\.turno \|\| '\/extras\/'/);
});

test("cambios diarios y asistencia continúan bloqueando", () => {
  assert.match(definicion, /where key in \('cambiosDia', 'cambiosParoDia'\)[\s\S]+REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES/);
  assert.match(definicion, /v_calendario -> 'asistenciaDia'[\s\S]+REFERENCIAS_CALENDARIO_LOCAL_PENDIENTES/);
});

test("legacy ambiguo e inestable conserva protección", () => {
  assert.match(definicion, /movimiento_padron_referencia_legacy_ambigua/);
  assert.match(definicion, /REFERENCIA_LEGACY_AMBIGUA/);
  assert.match(definicion, /REFERENCIA_LEGACY_OPERATIVA_PENDIENTE/);
});

test("Planilla moderna, Licencias y Certificaciones no se convierten en bloqueos", () => {
  assert.match(definicion, /movimiento_padron_referencia_legacy_coincide/);
  assert.doesNotMatch(definicion, /data -> 'licencias'|data -> 'certificaciones'/);
});

test("conserva locking, CAS y movimiento atómico de ambos estados", () => {
  assert.match(definicion, /lock table public\.estado_por_turno_mes in share row exclusive mode/);
  assert.match(definicion, /order by e\.turno\s+for update/);
  assert.match(definicion, /REVISION_ORIGEN_CONFLICTO/);
  assert.match(definicion, /REVISION_DESTINO_CONFLICTO/);
  assert.equal((definicion.match(/update public\.estado_por_turno_mes/g) || []).length, 2);
  assert.match(sql, /^begin;[\s\S]+commit;\s*$/);
});

test("conserva respuesta completa y permisos públicos existentes", () => {
  for (const campo of ["ok", "mes", "personaId", "turnoOrigen", "turnoDestino", "revisionOrigen", "revisionDestino", "estadoOrigen", "estadoDestino"]) {
    assert.match(definicion, new RegExp(`'${campo}'`));
  }
  assert.match(definicion, /revoke all on function public\.mover_persona_padron_base_turno_mes/);
  assert.match(definicion, /grant execute on function public\.mover_persona_padron_base_turno_mes[\s\S]+to authenticated/);
});

test("migración no altera tablas, columnas, RLS ni datos existentes", () => {
  assert.doesNotMatch(sql, /alter table|create table|drop table|enable row level security|create policy|update\s+public\.estado_por_turno_mes\s+set\s+data\s*=(?!\s*jsonb_set)/i);
  assert.equal((sql.match(/create or replace function public\.mover_persona_padron_base_turno_mes/g) || []).length, 1);
});
