begin;

create unique index if not exists novedades_personal_adhesion_paro_activa_unica_idx
  on public.novedades_personal (persona_id, fecha_desde, fecha_hasta, turno)
  where tipo = 'adhesion_paro' and estado = 'activa';

commit;
