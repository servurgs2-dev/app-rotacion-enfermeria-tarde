# Etapa 24B — Base histórica transaccional

## Alcance

La migración `20260724_crear_historial_estado_turno_mes.sql` crea un historial
inmutable con una copia completa del JSON realmente persistido para cada
revisión exitosa de `public.estado_por_turno_mes`.

No agrega interfaz, navegación, restauración ni escritura desde el cliente.

## Modelo

Cada fila histórica identifica `turno`, `mes`, revisión anterior y nueva,
acción objetiva, autor autenticado, fecha del servidor, secciones superiores
modificadas y el snapshot completo `data`.

Las acciones iniciales son `linea_base`, `creacion` y `actualizacion_cas`. La
restauración y los resúmenes semánticos quedan fuera de 24B.

## Línea base

Durante la migración se copia una sola línea base por cada fila operativa
existente. Conserva su revisión y JSON actuales, no inventa autor y registra en
`metadata` el motivo técnico y el `updated_at` original. El `ON CONFLICT DO
NOTHING` hace idempotente el backfill para `turno`, `mes` y revisión.

Las secciones de una línea base son todas las claves superiores del snapshot,
ordenadas alfabéticamente.

Antes del backfill, la migración toma un bloqueo transaccional `SHARE ROW
EXCLUSIVE` sobre `public.estado_por_turno_mes`. Las lecturas normales pueden
continuar, pero los INSERT, UPDATE y DELETE iniciados durante la activación
esperan hasta el `commit`. Así, la línea base observa el último estado
confirmado y el trigger histórico queda instalado antes de liberar nuevas
escrituras, evitando una revisión sin historial entre ambos pasos.

## Escritura transaccional

Un trigger `AFTER INSERT OR UPDATE` se ejecuta después del trigger `BEFORE` de
Etapa 23. Guarda `NEW.data` y las revisiones definitivas. Si la inserción del
historial falla, la escritura operativa también falla dentro de la misma
transacción. Si el CAS no actualiza ninguna fila, el trigger no se ejecuta.

El trigger usa una función `SECURITY DEFINER` acotada, con `search_path` vacío,
y es el único escritor. Los clientes no tienen permisos ni políticas de
INSERT, UPDATE o DELETE sobre el historial.

## Autoría

El UUID se obtiene mediante `auth.uid()`. Usuario visible, rol y turno del
perfil se consultan server-side en `public.perfiles_usuario`. Si el perfil no
existe, el UUID se conserva y los snapshots quedan nulos.

El historial identifica la cuenta autenticada. Las cuentas compartidas actuales
no permiten garantizar qué persona física utilizó esa cuenta.

No se almacena email y el cliente no envía autor, acción, revisión ni fecha.

## Diferencias

`private.secciones_cambiadas_estado_turno_mes()` compara únicamente claves
superiores agregadas, eliminadas o modificadas. Devuelve un `text[]` sin
duplicados y ordenado. Los resúmenes profundos y legibles pertenecen a 24C.

## Lectura y privacidad

RLS permite SELECT solamente a una cuenta activa de Supervisión reutilizando
`private.usuario_app_es_supervision()`. Licenciados, Enfermería y `anon` no
pueden consultar el historial. Nadie desde la aplicación puede modificarlo o
eliminarlo.

Los snapshots contienen información laboral y deben tratarse como datos
sensibles.

## Verificación posterior a la aplicación manual

Después de respaldar la tabla operativa y ejecutar manualmente la migración:

1. comprobar tabla, restricciones e índices;
2. comprobar una línea base por cada fila operativa existente;
3. verificar que no existan duplicados por turno, mes y revisión;
4. comprobar RLS y lectura únicamente con Supervisión;
5. hacer un guardado CAS controlado y verificar una fila histórica;
6. provocar un conflicto CAS y confirmar que no crea historial;
7. comprobar que una escritura directa del cliente al historial es rechazada.

La migración no se ejecuta como parte de 24B.

## Reversión antes de activar

Si la migración aún no fue aplicada, basta con retirar el archivo del conjunto
de despliegue. Si fue aplicada pero todavía no hubo uso productivo, la reversión
debe realizarse manualmente y en una transacción controlada:

1. detener ediciones;
2. respaldar el historial;
3. eliminar primero el trigger histórico;
4. eliminar sus funciones privadas;
5. eliminar la tabla histórica solamente después de confirmar el respaldo.

No debe revertirse el trigger de revisión ni la RPC CAS de Etapa 23.
