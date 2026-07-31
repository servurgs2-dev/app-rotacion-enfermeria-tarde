create table if not exists public.envios_correo_pdf (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_email text,
  destinatario text not null,
  asunto text not null,
  nombre_archivo text not null,
  tipo_documento text not null,
  mes text,
  turno text,
  categoria text,
  fecha_documento date,
  tamano_bytes integer,
  estado text not null,
  proveedor text not null default 'resend',
  proveedor_message_id text,
  error_codigo text,
  error_mensaje text,
  creado_en timestamptz not null default now()
);

alter table public.envios_correo_pdf enable row level security;

revoke all on table public.envios_correo_pdf from anon, authenticated;

comment on table public.envios_correo_pdf is
  'Auditoría técnica de envíos de PDF. No almacena archivos, Base64 ni mensajes.';

-- Reversión manual:
-- drop table if exists public.envios_correo_pdf;
