# Etapa 24D2 — Restauración histórica protegida

La restauración está disponible únicamente para cuentas activas con rol Supervisión y solo cuando el detalle pertenece al turno y mes actualmente abiertos. Licenciado y Enfermería no reciben acceso a la sección Historial por interfaz y PostgreSQL mantiene la autorización server-side.

## Flujo seguro

1. La aplicación verifica que el contexto esté cargado, tenga una revisión confirmada y no posea debounce, cola, escritura, error ni conflicto pendientes.
2. “Preparar restauración” vuelve a leer el estado operativo desde el servidor. La copia local no se usa como fuente de verdad.
3. Se compara `estado operativo actual → snapshot histórico` y se conserva la revisión operativa obtenida como revisión CAS esperada.
4. El usuario debe aceptar el reemplazo y escribir exactamente `RESTAURAR`. Si el análisis es incompleto, debe aceptar además esa limitación.
5. El cliente invoca `restaurarRevision({ historialId, revisionEsperada })`. No envía data, turno, mes, acción, autor, rol, fecha ni revisión de origen.
6. La RPC crea una revisión operativa nueva y el trigger registra la acción `restauracion`; no baja el contador, no borra revisiones posteriores y no modifica el snapshot de origen.
7. Solo después del éxito se vuelve a cargar el estado operativo. App verifica turno, mes y revisión, y adopta la respuesta mediante la misma limpieza de cola, referencias base y metadatos usada para aceptar una versión del servidor.

Durante la llamada la edición del contexto queda temporalmente en modo de solo lectura. Esto evita generar una fotografía local posterior que no haya formado parte de la restauración.

La carga versionada distingue `existe` (hay un estado utilizable, incluido el fallback histórico) de `existeRemoto` (existe una fila operativa versionada). Antes de adoptar se normalizan ambos valores en `tieneEstado` y `existeRemoto`; una fila remota nunca puede convertirse accidentalmente en un estado mensual vacío.

## Conflictos y errores

Si el CAS detecta otra revisión, no se restaura ni se reintenta automáticamente. El panel muestra la revisión remota y exige ejecutar nuevamente “Actualizar estado actual” para preparar otro intento.

Si la RPC tuvo éxito pero falla la recarga posterior, no se repite la restauración. La clave queda en un conjunto de bloqueo, en modo de solo lectura y fuera del debounce y la cola, para evitar que el autosave publique el estado local antiguo. Ese bloqueo solamente desaparece después de adoptar una carga remota verificada o al recargar completamente la aplicación.

Cambiar filtros, cerrar el detalle o la sección, cambiar turno, mes o sesión invalida el preflight y la confirmación visual. Una operación ya enviada al servidor no puede cancelarse, pero su respuesta no adopta datos en un contexto diferente.

Al iniciar la restauración se conserva la cuenta que la inició. La adopción posterior exige la misma cuenta, el mismo turno, el mismo mes y la revisión confirmada por la RPC. Cerrar Historial no impide adoptar una restauración ya enviada cuando la cuenta y el contexto siguen siendo los mismos; cambiar de cuenta sí conserva el bloqueo y exige recargar.

## Impacto, privacidad y accesibilidad

La vista previa informa revisiones, fecha, cuenta registrada, secciones y totales. Un análisis truncado conserva totales completos; un análisis incompleto advierte que los totales pueden ser parciales y exige una casilla adicional.

Las cuentas pueden ser compartidas y no identifican necesariamente a la persona física. El diálogo no incluye el snapshot completo ni inicia descargas. Los controles tienen etiquetas, estado deshabilitado, mensajes `role="alert"` y avisos `aria-live`, con un diseño adaptable y scroll acotado.

## Activación posterior

La implementación no aplica migraciones ni realiza una restauración real durante las pruebas. La activación coordinada debe seguir este orden:

1. respaldar `public.estado_por_turno_mes`;
2. aplicar manualmente la migración 24C;
3. comprobar RPC, trigger, RLS y permisos con datos controlados;
4. publicar la versión 24D2;
5. probar lectura, preflight, conflicto y restauración real en un turno y mes de prueba.

Si la activación falla antes de publicar, no se publica la interfaz. Si falla después, no debe volver a usarse un cliente heredado: se conserva la protección de revisión, se bloquean ediciones del contexto afectado y se corrige o revierte aplicación y SQL como una unidad compatible.
