# Etapa 23 — Control de concurrencia por turno y mes

## Problema

El guardado histórico utiliza un `upsert` incondicional del JSON mensual
completo. Dos clientes que cargan la misma fila pueden guardar sucesivamente y
el último reemplaza silenciosamente los cambios del primero.

## Unidad de concurrencia

La unidad protegida es una fila completa identificada por:

```text
turno + mes
```

El JSON incluye Enfermeros, Licenciados, personal, planillas, calendario,
cierres, licencias y certificaciones. Las estadísticas se derivan de los
snapshots guardados dentro de ese mismo estado.

## Contrato de revisión

- Revisión `"0"`: el cliente espera que la fila todavía no exista.
- Revisión `"1"` o superior: el cliente espera exactamente esa versión.
- Una creación exitosa queda en revisión `"1"`.
- Una actualización exitosa incrementa la revisión.
- Un conflicto no modifica el servidor y devuelve la fila remota cuando existe.
- Las revisiones `bigint` se transportan como cadenas decimales.
- `updated_at` lo genera PostgreSQL mediante `now()`.

La RPC `public.guardar_estado_turno_mes_si_revision` ejecuta la decisión y la
escritura atómicamente, con `SECURITY INVOKER`, RLS y permisos existentes.

La tabla incorpora además el trigger
`estado_turno_mes_revision_trigger`. En inserciones fija autoritativamente
revisión 1 y `updated_at = now()`. En actualizaciones exige exactamente
`OLD.revision + 1` y vuelve a generar `updated_at` en PostgreSQL.

El trigger es una barrera adicional frente a clientes antiguos, no sustituye
la comparación atómica de la RPC. Una pestaña antigua que intente actualizar
mediante el `upsert` heredado sin incrementar la revisión recibirá un error en
lugar de sobrescribir silenciosamente. Después de aplicar la migración, el
guardado heredado deja de ser un rollback funcional salvo que también se
revierta el trigger.

## Rutas inactivas y compatibilidad de 23B

23B puede desplegarse sin aplicar la migración. La aplicación activa continúa
usando `cargarEstadoPorTurnoMes` y `guardarEstadoPorTurnoMes`, que no consultan
ni envían `revision`. La comparación entre turnos tampoco consulta esa columna.

`cargarEstadoPorTurnoMesConRevision` y
`guardarEstadoTurnoMesConRevision` quedan preparadas pero inactivas. En el
despliegue coordinado de 23C se cambiarán simultáneamente la carga y el
guardado activos.

## Fallback histórico de Tarde

Si Tarde se lee desde `estado_por_mes` porque todavía no tiene fila en
`estado_por_turno_mes`, el flujo heredado conserva su contrato actual y no
expone revisión. En 23C, la carga versionada deberá representar ese origen como
revisión `"0"` y sin `updatedAt`; su primer guardado intentará crear la fila.
Si otro cliente ya la creó, la RPC devolverá conflicto. No se inventará ni
copiará una revisión histórica.

## Compatibilidad temporal

Durante 23B, `App.jsx` sigue utilizando la carga y el `upsert` heredados. El
nuevo contrato se incorpora al servicio, pero todavía no controla el autosave.
La migración no debe aplicarse ni desplegarse separada de la integración 23C.

## Integración local de 23C

23C conecta localmente la carga y el guardado versionados. Por cada clave
`turno|mes`, App conserva revisión confirmada, fecha remota, existencia de fila,
origen, estado de persistencia, error y conflicto.

La carga registra esos metadatos sin marcar el JSON como modificado. El debounce
continúa siendo de 500 ms y conserva una única fotografía pendiente por clave.
La revisión esperada se consulta al iniciar la escritura, no al crear el
debounce.

En un guardado exitoso se actualiza la revisión confirmada. Si apareció un
cambio posterior, la siguiente fotografía se envía usando esa revisión nueva.

En conflicto:

- no se reemplaza el estado local;
- se guardan separadamente las copias local y remota;
- se cancelan debounce y cola únicamente para esa clave;
- se bloquea su autosave;
- las demás claves continúan procesándose.

Un error técnico no avanza la revisión ni se interpreta como conflicto. La
fotografía queda disponible para el mecanismo de reintento existente.

### Limitación de 23C

La resolución interactiva del conflicto queda pendiente para 23D. En 23C solo
se muestra un aviso y se detiene el autosave de la clave afectada.

La migración todavía no fue aplicada y esta versión 23C no debe desplegarse.
Migración, carga versionada, guardado versionado y despliegue deben coordinarse.
Las pestañas antiguas deberán recargarse; si intentan guardar antes de hacerlo,
el trigger rechazará su actualización.

## Resolución de conflictos de 23D

El panel ofrece tres acciones:

1. **Descargar mi copia**: genera un JSON local con turno, mes, revisión remota,
   fecha de detección y la última copia local. Puede contener datos personales y
   debe almacenarse de forma segura. No modifica ni desbloquea el conflicto.
2. **Usar versión del servidor**: vuelve a consultar el servidor y, tras
   confirmación, descarta únicamente la copia local de esa clave. No utiliza la
   copia remota antigua almacenada al detectar el conflicto.
3. **Conservar mi versión y guardar**: tras una confirmación fuerte, utiliza la
   última copia local y la revisión remota como nueva revisión esperada. El
   guardado vuelve a pasar por la cola CAS. Si el servidor cambió otra vez, se
   registra un segundo conflicto sin sobrescribirlo.

La tercera acción no limpia el conflicto al comenzar. La cola recibe una
entrada explícita de resolución con la revisión remota esperada, mientras el
autosave normal continúa bloqueado. Durante esa escritura se conservan ambas
copias, el panel y la protección del cierre de sesión; el contexto queda
temporalmente en solo lectura para impedir que una edición posterior quede
fuera de la fotografía enviada. Solamente una respuesta `guardado` limpia el
conflicto. Un error técnico conserva ambas copias y permite otro intento manual,
y un nuevo conflicto actualiza la copia y revisión remotas sin perder la copia
local enviada.

Una lista global muestra todos los conflictos pendientes y permite navegar a
cada turno y mes tanto antes de seleccionar turno como dentro de la vista
activa. La lista se basa en la existencia de la copia de conflicto, incluso
durante una resolución o después de un error. Mientras quede al menos uno, el
cierre de sesión permanece protegido. Los perfiles de solo lectura pueden
descargar una copia, pero no pueden ejecutar acciones de resolución que alteren
o guarden estado.

La resolución requiere validación real posterior con dos pestañas, permisos y
la migración aplicada coordinadamente. La migración todavía no fue ejecutada y
esta versión no debe desplegarse.

### Regresión manual de conflictos

- Una pestaña: provocar conflicto simulado, descargar y revisar el respaldo,
  usar servidor y comprobar limpieza, conservar local y verificar el nuevo
  guardado, editar antes de resolver y comprobar que se usa la copia reciente.
- Dos claves: conflicto en Noche/agosto, comprobar que Tarde/agosto sigue
  guardando, revisar el aviso global y volver con “Ir al conflicto”.
- Permisos: probar editor, solo lectura y licenciado viendo otro turno.
- Móvil y escritorio: comprobar panel, botones, scroll y confirmaciones.

## Despliegue coordinado

1. No ejecutar la migración durante 23B.
2. Completar la integración 23C.
3. Verificar pruebas y build.
4. Aplicar la migración.
5. Desplegar inmediatamente la versión con guardado versionado.
6. Solicitar que se recarguen las pestañas antiguas.
7. Probar el conflicto con dos pestañas.
8. No mantener durante horas clientes antiguos y nuevos editando a la vez.

## Pruebas

```powershell
npm.cmd run test:etapa23d
npm.cmd run test:etapa23c
npm.cmd run test:etapa23b
npm.cmd run test:etapa20
npm.cmd run lint
npm.cmd run build
```

Las pruebas de 23B usan clientes falsos y validación estática del SQL. No
ejecutan PostgreSQL ni se conectan a Supabase. La atomicidad real, RLS y la
creación simultánea deben verificarse después de aplicar coordinadamente la
migración en un entorno controlado.
