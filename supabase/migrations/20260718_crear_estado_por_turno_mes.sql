-- Persistencia futura independiente por turno y mes.
-- Esta migración no altera ni copia datos desde la tabla histórica.
create table if not exists public.estado_por_turno_mes (
  turno text not null,
  mes text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint estado_por_turno_mes_pkey primary key (turno, mes),
  constraint estado_por_turno_mes_turno_check
    check (turno in ('noche', 'manana', 'tarde', 'vespertino'))
);

-- RLS y sus políticas deben definirse después de auditar las políticas actuales
-- de producción. No se habilitan ni se crean políticas en esta etapa.
