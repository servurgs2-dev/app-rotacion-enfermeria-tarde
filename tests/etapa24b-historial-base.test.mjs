import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = (ruta) =>
  readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

const migracion = await leer(
  "supabase/migrations/20260724_crear_historial_estado_turno_mes.sql"
);
const concurrencia = await leer(
  "supabase/migrations/20260723_agregar_concurrencia_estado_turno_mes.sql"
);
const app = await leer("src/App.jsx");
const panel = await leer(
  "src/components/concurrencia/PanelConflictoEdicion.jsx"
);
const servicio = await leer("src/services/estadoTurnos.js");
const paquete = JSON.parse(await leer("package.json"));
const codigoPrueba = await leer("tests/etapa24b-historial-base.test.mjs");
const importsPrueba = codigoPrueba
  .split(/\r?\n/)
  .filter((linea) => linea.trimStart().startsWith("import "))
  .join("\n");

let cantidad = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  cantidad += 1;
  process.stdout.write(`✓ ${nombre}\n`);
};

const casos = [
  ["1. existe historial_estado_turno_mes", () =>
    assert.match(migracion, /create table if not exists public\.historial_estado_turno_mes/i)],
  ["2. primary key usa identity", () =>
    assert.match(migracion, /id bigint generated always as identity primary key/i)],
  ["3. contiene turno y mes", () => {
    assert.match(migracion, /\bturno text not null/i);
    assert.match(migracion, /\bmes text not null/i);
  }],
  ["4. contiene revisiones anterior y nueva", () => {
    assert.match(migracion, /\brevision bigint not null/i);
    assert.match(migracion, /\brevision_anterior bigint null/i);
  }],
  ["5. contiene data jsonb", () =>
    assert.match(migracion, /\bdata jsonb not null/i)],
  ["6. contiene acción controlada", () =>
    assert.match(migracion, /\baccion text not null/i)],
  ["7. contiene autor y snapshots", () => {
    assert.match(migracion, /\busuario_id uuid null/i);
    assert.match(migracion, /\busuario_snapshot text null/i);
    assert.match(migracion, /\brol_snapshot text null/i);
    assert.match(migracion, /\bturno_perfil_snapshot text null/i);
  }],
  ["8. contiene secciones cambiadas", () =>
    assert.match(migracion, /secciones_cambiadas text\[\] not null default array\[\]::text\[\]/i)],
  ["9. contiene created_at del servidor", () =>
    assert.match(migracion, /created_at timestamptz not null default now\(\)/i)],
  ["10. contiene metadata objeto", () =>
    assert.match(migracion, /metadata jsonb not null default '\{\}'::jsonb/i)],
  ["11. revisión es única por turno y mes", () =>
    assert.match(migracion, /unique \(turno, mes, revision\)/i)],
  ["12. no existe ON DELETE CASCADE", () =>
    assert.doesNotMatch(migracion, /on delete cascade/i)],
  ["13. no existe índice GIN", () =>
    assert.doesNotMatch(migracion, /using gin|create index[\s\S]{0,100}\bgin\b/i)],
  ["14. existe backfill desde estado operativo", () =>
    assert.match(migracion, /from public\.estado_por_turno_mes as estado/i)],
  ["15. backfill usa línea base", () =>
    assert.match(migracion, /'linea_base'/)],
  ["16. línea base no tiene usuario", () =>
    assert.match(migracion, /'linea_base',\s+null,\s+null,\s+null,\s+null,/i)],
  ["17. línea base no tiene revisión anterior", () =>
    assert.match(migracion, /estado\.revision,\s+null,\s+estado\.data/i)],
  ["18. no inventa UUID de sistema", () =>
    assert.doesNotMatch(migracion, /gen_random_uuid|uuid_generate|00000000-0000/i)],
  ["19. backfill es idempotente", () =>
    assert.match(migracion, /on conflict \(turno, mes, revision\) do nothing/i)],
  ["20. conserva revisión y data actuales", () => {
    assert.match(migracion, /estado\.revision/);
    assert.match(migracion, /estado\.data/);
  }],
  ["21. metadata conserva updated_at original", () =>
    assert.match(migracion, /'estado_updated_at', estado\.updated_at/i)],
  ["22. trigger histórico es AFTER INSERT OR UPDATE", () =>
    assert.match(migracion, /after insert or update on public\.estado_por_turno_mes/i)],
  ["23. función de trigger es SECURITY DEFINER", () =>
    assert.match(migracion, /registrar_historial_estado_turno_mes\(\)[\s\S]*security definer/i)],
  ["24. función de trigger usa search_path seguro", () =>
    assert.match(migracion, /registrar_historial_estado_turno_mes\(\)[\s\S]*set search_path = ''/i)],
  ["25. autor se obtiene con auth.uid", () =>
    assert.match(migracion, /autor_id uuid := \(select auth\.uid\(\)\)/i)],
  ["26. perfil se consulta server-side", () =>
    assert.match(migracion, /from public\.perfiles_usuario as perfil[\s\S]*perfil\.user_id = autor_id/i)],
  ["27. función no recibe autor", () =>
    assert.match(migracion, /registrar_historial_estado_turno_mes\(\)\s*returns trigger/i)],
  ["28. INSERT genera creación", () =>
    assert.match(migracion, /tg_op = 'INSERT'[\s\S]*accion_registrada := 'creacion'/i)],
  ["29. UPDATE genera actualización CAS", () =>
    assert.match(migracion, /else[\s\S]*accion_registrada := 'actualizacion_cas'/i)],
  ["30. UPDATE usa OLD y NEW revision", () => {
    assert.match(migracion, /new\.revision/);
    assert.match(migracion, /revision_previa := old\.revision/i);
  }],
  ["31. guarda NEW data", () =>
    assert.match(migracion, /new\.data/)],
  ["32. no silencia errores históricos", () =>
    assert.doesNotMatch(migracion, /exception\s+when|when others|raise notice/i)],
  ["33. conflicto no tiene rama histórica", () =>
    assert.doesNotMatch(migracion, /resultado.*conflicto|p_revision_esperada/i)],
  ["34. migración histórica no reemplaza RPC CAS", () =>
    assert.doesNotMatch(migracion, /create or replace function public\.guardar_estado_turno_mes_si_revision/i)],
  ["35. existe helper de secciones", () =>
    assert.match(migracion, /private\.secciones_cambiadas_estado_turno_mes/i)],
  ["36. helper recibe data anterior y nueva", () => {
    assert.match(migracion, /data_anterior jsonb/);
    assert.match(migracion, /data_nueva jsonb/);
  }],
  ["37. detecta claves agregadas", () =>
    assert.match(migracion, /jsonb_object_keys\(nueva\)/i)],
  ["38. detecta claves eliminadas", () =>
    assert.match(migracion, /jsonb_object_keys\(anterior\)/i)],
  ["39. resultado queda ordenado", () =>
    assert.match(migracion, /array_agg\(claves\.clave order by claves\.clave\)/i)],
  ["40. no implementa diff profundo", () =>
    assert.doesNotMatch(migracion, /jsonb_each|jsonb_path|#>|#>>/i)],
  ["41. RLS queda habilitado", () =>
    assert.match(migracion, /alter table public\.historial_estado_turno_mes enable row level security/i)],
  ["42. lectura usa permiso de Supervisión existente", () =>
    assert.match(migracion, /using \(\(select private\.usuario_app_es_supervision\(\)\)\)/i)],
  ["43. no hay política de lectura para Licenciado", () =>
    assert.doesNotMatch(migracion, /create policy[\s\S]{0,150}licenciado/i)],
  ["44. no hay política de lectura para Enfermería", () =>
    assert.doesNotMatch(migracion, /create policy[\s\S]{0,150}enfermeria/i)],
  ["45. authenticated no puede insertar", () =>
    assert.match(migracion, /revoke all privileges on table public\.historial_estado_turno_mes from authenticated/i)],
  ["46. authenticated no puede actualizar", () =>
    assert.doesNotMatch(migracion, /grant\s+update/i)],
  ["47. authenticated no puede eliminar", () =>
    assert.doesNotMatch(migracion, /grant\s+delete/i)],
  ["48. anon no puede acceder", () =>
    assert.match(migracion, /revoke all privileges on table public\.historial_estado_turno_mes from anon/i)],
  ["49. ejecución directa de helpers está revocada", () => {
    assert.match(migracion, /secciones_cambiadas_estado_turno_mes\([\s\S]*from authenticated/i);
    assert.match(migracion, /registrar_historial_estado_turno_mes\(\)[\s\S]*from authenticated/i);
  }],
  ["50. no existe RPC para borrar historial", () =>
    assert.doesNotMatch(migracion, /function[\s\S]{0,100}(borrar|eliminar).*historial/i)],
  ["51. trigger de revisión de Etapa 23 sigue declarado", () =>
    assert.match(concurrencia, /estado_turno_mes_revision_trigger/i)],
  ["52. RPC CAS de Etapa 23 sigue declarada", () =>
    assert.match(concurrencia, /guardar_estado_turno_mes_si_revision/i)],
  ["53. RPC CAS continúa SECURITY INVOKER", () =>
    assert.match(concurrencia, /guardar_estado_turno_mes_si_revision[\s\S]*security invoker/i)],
  ["54. App conserva carga y guardado versionados", () => {
    assert.match(app, /cargarEstadoTurnoMesConRevision/);
    assert.match(app, /guardarEstadoTurnoMesConRevision/);
  }],
  ["55. servicios activos conservan contrato versionado", () => {
    assert.match(servicio, /crearServicioEstadoTurnosConRevision/);
    assert.match(servicio, /guardarEstadoTurnoMesConRevision/);
  }],
  ["56. panel de conflicto conserva acciones", () => {
    assert.match(panel, /Usar versión del servidor/);
    assert.match(panel, /Conservar mi versión y guardar/);
  }],
  ["57. pruebas anteriores permanecen referenciadas", () => {
    assert.equal(paquete.scripts["test:etapa23d"], "node tests/etapa23d-resolucion-conflictos.test.mjs");
    assert.equal(paquete.scripts["test:etapa23c"], "node tests/etapa23c-integracion-concurrencia.test.mjs");
  }],
  ["58. no se agregó dependencia de historial", () =>
    assert.equal(Object.hasOwn(paquete.dependencies, "jsondiffpatch"), false)],
  ["59. prueba no importa cliente Supabase", () =>
    assert.doesNotMatch(importsPrueba, /supabase|createClient/i)],
  ["60. SQL de historial está contenido en su migración", () =>
    assert.equal(paquete.scripts["test:etapa24b"], "node tests/etapa24b-historial-base.test.mjs")],
  ["61. valida revisión positiva", () =>
    assert.match(migracion, /check \(revision >= 1\)/i)],
  ["62. valida revisión anterior", () =>
    assert.match(migracion, /revision_anterior is null or revision_anterior >= 0/i)],
  ["63. valida revisión de origen", () =>
    assert.match(migracion, /origen_revision is null or origen_revision >= 1/i)],
  ["64. valida formato de mes", () =>
    assert.match(migracion, /mes ~ '\^\[0-9\]\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$'/i)],
  ["65. valida los cuatro turnos", () =>
    assert.match(migracion, /turno in \('noche', 'manana', 'tarde', 'vespertino'\)/i)],
  ["66. valida data como objeto", () =>
    assert.match(migracion, /jsonb_typeof\(data\) = 'object'/i)],
  ["67. valida metadata como objeto", () =>
    assert.match(migracion, /jsonb_typeof\(metadata\) = 'object'/i)],
  ["68. acciones se limitan al alcance 24B", () =>
    assert.match(migracion, /accion in \('linea_base', 'creacion', 'actualizacion_cas'\)/i)],
  ["69. no incorpora acciones futuras", () =>
    assert.doesNotMatch(migracion, /'restauracion'|'copiar_mes'|'importacion'/i)],
  ["70. no crea índice para data o metadata", () =>
    assert.doesNotMatch(migracion, /create index[\s\S]{0,120}\((data|metadata)\)/i)],
  ["71. existe LOCK TABLE sobre el estado operativo", () =>
    assert.match(migracion, /lock table public\.estado_por_turno_mes/i)],
  ["72. usa SHARE ROW EXCLUSIVE MODE", () =>
    assert.match(migracion, /lock table public\.estado_por_turno_mes\s+in share row exclusive mode/i)],
  ["73. bloqueo aparece antes del backfill", () => {
    assert.ok(
      migracion.indexOf("lock table public.estado_por_turno_mes") <
        migracion.indexOf("insert into public.historial_estado_turno_mes")
    );
  }],
  ["74. bloqueo aparece antes del trigger histórico", () => {
    assert.ok(
      migracion.indexOf("lock table public.estado_por_turno_mes") <
        migracion.indexOf("create trigger estado_turno_mes_historial_trigger")
    );
  }],
  ["75. bloqueo permanece dentro de begin y commit", () => {
    const posicionLock = migracion.indexOf("lock table public.estado_por_turno_mes");
    assert.ok(migracion.indexOf("begin;") < posicionLock);
    assert.ok(posicionLock < migracion.lastIndexOf("commit;"));
  }],
  ["76. no usa ACCESS EXCLUSIVE", () =>
    assert.doesNotMatch(migracion, /access exclusive/i)],
  ["77. trigger AFTER continúa presente", () =>
    assert.match(migracion, /after insert or update on public\.estado_por_turno_mes/i)],
  ["78. migración no modifica RPC CAS", () =>
    assert.doesNotMatch(migracion, /create or replace function public\.guardar_estado_turno_mes_si_revision/i)],
  ["79. App conserva integración versionada", () => {
    assert.match(app, /cargarEstadoTurnoMesConRevision/);
    assert.match(app, /guardarEstadoTurnoMesConRevision/);
  }],
  ["80. servicios conservan integración versionada", () => {
    assert.match(servicio, /cargarEstadoTurnoMesConRevision/);
    assert.match(servicio, /guardarEstadoTurnoMesConRevision/);
  }]
];

for (const [nombre, prueba] of casos) await probar(nombre, prueba);
process.stdout.write(
  `\n${cantidad} pruebas permanentes de Etapa 24B superadas.\n`
);
