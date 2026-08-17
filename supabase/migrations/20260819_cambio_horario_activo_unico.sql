begin;

create unique index if not exists novedades_personal_cambio_horario_activo_unico_idx
  on public.novedades_personal (persona_id, fecha_desde, fecha_hasta, turno)
  where tipo = 'cambio_horario' and estado = 'activa';

commit;
