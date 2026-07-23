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
npm.cmd run test:etapa23b
npm.cmd run test:etapa20
npm.cmd run lint
npm.cmd run build
```

Las pruebas de 23B usan clientes falsos y validación estática del SQL. No
ejecutan PostgreSQL ni se conectan a Supabase. La atomicidad real, RLS y la
creación simultánea deben verificarse después de aplicar coordinadamente la
migración en un entorno controlado.
