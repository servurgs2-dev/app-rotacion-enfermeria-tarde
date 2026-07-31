# Configurar envío de PDF por correo

La interfaz genera el mismo PDF utilizado por la descarga y lo envía a una
Supabase Edge Function autenticada. La función usa la API transaccional de Brevo y registra auditoría
sin almacenar el PDF, Base64, JWT ni mensaje completo.

## Activación manual

1. Crear una cuenta en Brevo.
2. Agregar y verificar el remitente o dominio remitente en Brevo.
3. Crear una API key con el alcance mínimo necesario.
4. Identificar en Supabase Auth los UUID de las cuentas autorizadas.
5. Configurar los secrets, reemplazando los ejemplos por valores reales:

```sh
supabase secrets set BREVO_API_KEY="..."
supabase secrets set BREVO_SENDER_EMAIL="correo-remitente-verificado"
supabase secrets set BREVO_SENDER_NAME="nombre-remitente"
supabase secrets set EMAIL_ALLOWED_USER_IDS="uuid1,uuid2"
supabase secrets set EMAIL_REPLY_TO="correo-opcional@dominio"
```

`EMAIL_REPLY_TO` es opcional. Si `EMAIL_ALLOWED_USER_IDS` falta o está vacío,
todos los envíos quedan bloqueados.

6. Revisar y aplicar manualmente la migración
   `20260730_crear_auditoria_envios_correo_pdf.sql`.
7. Desplegar la función manteniendo la verificación JWT:

```sh
supabase functions deploy enviar-pdf-correo
```

No utilizar `--no-verify-jwt`.

8. Probar primero con `caservurgs2@casmu.com`.
9. Revisar Supabase Functions Logs sin imprimir adjuntos ni payloads.
10. Comprobar los registros de `envios_correo_pdf`.

## Reversión

Despublicar la Edge Function o retirar sus secrets para detener envíos. Si
también debe retirarse la auditoría, conservar antes el respaldo requerido y
ejecutar manualmente:

```sql
drop table if exists public.envios_correo_pdf;
```

El destinatario institucional confirmado se configura en el frontend como acceso
rápido, pero el campo continúa siendo editable y admite otro correo válido.

## Proveedor anterior

Los secrets antiguos de Resend pueden seguir existiendo en Supabase, pero la
configuración activa de esta función no los lee ni los utiliza. No es necesario
eliminarlos para desplegar la versión basada en Brevo.
