# Etapa 24D1 — Historial en modo solo lectura

La sección principal **Historial** está disponible únicamente para perfiles
activos de Supervisión. La interfaz también permanece protegida por la RLS
definida para la tabla histórica; Licenciado y Enfermería no reciben enlaces
ni mensajes que revelen su contenido.

## Consulta

La sección inicia cerrada, conserva su estado al contraerse y utiliza scroll
vertical interno. Permite filtrar por turno, mes, acción, cuenta ya presente
en los resultados y rango de fechas. Los controles `date` se interpretan en
la zona horaria local del navegador: Desde comienza a las 00:00 y Hasta
termina a las 23:59:59.999. Antes de consultar se convierten expresamente a
ISO.

El listado carga únicamente metadatos, nunca snapshots. La paginación usa el
cursor estable del repositorio, conserva resultados anteriores y elimina
duplicados por `id`. Aplicar o limpiar filtros invalida solicitudes anteriores
y reinicia lista y detalle.

## Detalle y comparación

“Ver detalles” carga una sola revisión histórica. Cuando existe
`revisionAnterior`, se consulta una única fila por turno, mes y revisión. La
comparación utiliza el comparador acotado de 24C y presenta:

- secciones modificadas;
- totales agregados, eliminados y modificados;
- cambios por sección;
- vistas previas colapsables de valores anteriores y nuevos.

Si solo se limitan vistas o detalles, se informa que los totales siguen
completos. Si `analisisIncompleto` es verdadero, se advierte expresamente que
secciones y cantidades pueden ser parciales. La primera revisión y una versión
anterior no disponible se tratan como estados informativos, no como errores.

## Opciones avanzadas y privacidad

El snapshot completo no se muestra al abrir el detalle. “Opciones avanzadas”
permanece cerrado y permite ver únicamente sus secciones superiores o
descargar, por acción explícita, un respaldo JSON completo. El archivo puede
contener datos laborales y personales y debe conservarse de forma segura.

`usuario_snapshot` identifica la cuenta autenticada. Dado que actualmente
pueden existir cuentas compartidas, no garantiza identificar a la persona
física que realizó el cambio.

## Concurrencia de lectura

Listado y detalle mantienen secuencias independientes. Una respuesta tardía no
reemplaza filtros o detalles más recientes; cerrar un detalle invalida su
solicitud y el desmontaje impide actualizaciones posteriores.

## Exclusión intencional

24D1 no importa ni ejecuta restauración, no modifica el estado mensual y no
interactúa con la cola CAS. No existe botón para restaurar, aplicar, recuperar
o reemplazar una versión. La restauración visual, sus confirmaciones y la
sincronización posterior del estado local quedan pendientes para 24D2.

La migración 24C todavía no debe aplicarse ni publicarse. Antes de activar esta
interfaz deben validarse consultas, RLS y comparaciones en un entorno
controlado, sin datos reales.
