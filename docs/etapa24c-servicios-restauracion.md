# Etapa 24C — Servicios y restauración histórica

Esta etapa prepara, sin conectarla todavía a la interfaz, la consulta paginada
del historial, la carga de snapshots, un comparador legible y la restauración
segura de una revisión.

## Consulta y snapshots

El listado consulta únicamente metadatos y usa un cursor estable compuesto por
`created_at` e `id`, ambos descendentes. El límite predeterminado es 25 y el
máximo es 100. Los filtros iniciales son turno, mes, acción, usuario y rango de
fechas. La carga individual por `id` conserva `data` tal como fue almacenado;
no lo mezcla ni lo normaliza contra el estado operativo.

Las fechas y el cursor aceptan exclusivamente timestamps ISO con zona horaria
y se normalizan mediante `toISOString()` antes de construir filtros. Un rango
invertido se rechaza antes de consultar. `usuarioId`, cuando se proporciona,
debe ser un UUID válido y se normaliza a minúsculas.

RLS continúa limitando ambas lecturas a cuentas activas de Supervisión.

## Restauración CAS

La RPC recibe solamente el `id` histórico y la revisión operativa esperada.
Obtiene desde PostgreSQL el turno, mes, snapshot y revisión de origen. Valida
Supervisión server-side y actualiza la fila operativa únicamente cuando la
revisión coincide. La restauración incrementa la revisión: nunca retrocede el
contador, modifica el snapshot de origen ni elimina versiones posteriores.

Un conflicto devuelve la revisión y fecha remotas sin actualizar ni crear
historial. No se reintenta automáticamente.

La RPC fija mediante `set_config(..., true)` un contexto privado, local a la
transacción. El trigger histórico solamente acepta `restauracion` cuando la
revisión de origen existe para el mismo turno y mes y su `data` coincide con
el `NEW.data`; en cualquier otro UPDATE mantiene `actualizacion_cas`.
`origen_revision` identifica el snapshot restaurado. El autor continúa
obteniéndose con `auth.uid()` y el perfil se consulta server-side.

Las cuentas compartidas identifican la cuenta autenticada, no garantizan la
identidad física de quien la utilizó.

## Diferencias legibles

El comparador puro detecta altas, bajas y modificaciones de personal,
licencias y certificaciones. En planillas y calendario informa rutas legibles
de asignaciones, semanas, bloques, fechas, asistencia, extras y otras ramas.
Las secciones desconocidas reciben un resumen conservador, sin inventar una
interpretación.

El índice de un array nunca se considera identidad estable. Solo `id`,
`personaId`, `uuid` o `key` vinculan dos registros. Los elementos sin una de
esas claves se comparan como un multiconjunto de firmas canónicas: se ignora el
orden, se conserva la cantidad de duplicados y un cambio se informa
conservadoramente como baja más alta, no como modificación o renombrado.

La comparación:

- tolera snapshots nulos o históricos incompletos;
- no muta las entradas;
- limita la profundidad a 12 niveles;
- limita globalmente el detalle almacenado a 200 entradas de forma
  predeterminada;
- utiliza además un presupuesto global predeterminado de 10.000 nodos y un
  máximo absoluto de 100.000 para limitar el trabajo real;
- ninguna vista previa de `anterior` o `nuevo` clona datos sin límite: cada
  campo dispone de hasta 50 nodos y todas las vistas previas juntas de hasta
  1.000 nodos;
- cuando una vista previa excede su límite, conserva el cambio y usa
  `[contenido omitido por límite]`, además de `contenidoOmitido: true`;
- informa `truncado` cuando no se conservó todo el detalle o se agotó el
  presupuesto;
- informa `analisisIncompleto` cuando el presupuesto detuvo la comparación,
  por lo que secciones y totales pueden ser parciales;
- no incorpora bibliotecas externas.

El presupuesto de detección y el de vista previa son independientes. Limitar
solo una vista previa marca `truncado`, pero no `analisisIncompleto`, porque los
totales detectados siguen siendo completos. `analisisIncompleto` se activa
únicamente si la detección se detuvo por presupuesto o profundidad; en ese caso
los totales y las secciones también pueden ser parciales. Al superar la
profundidad máxima, la rama se detiene y nunca se clona el contenido restante.

## Activación posterior

Todavía no existe pantalla, navegación ni botón público de restauración. La
migración no debe aplicarse ni la funcionalidad publicarse hasta revisar 24D.
Antes de activarla deben probarse manualmente en una base controlada:

1. lectura paginada como Supervisión;
2. rechazo de lectura y restauración para Enfermería y Licenciado;
3. restauración exitosa y creación de una nueva revisión histórica;
4. conflicto CAS sin escritura histórica;
5. autoría mediante la sesión real;
6. `origen_revision` y `secciones_cambiadas`;
7. convivencia con autosave, trigger de revisión y clientes antiguos.
