begin;

create unique index if not exists novedades_personal_olvido_tarjeta_no_cancelado_unico_idx
  on public.novedades_personal (persona_id, fecha_desde, fecha_hasta, turno)
  where tipo = 'olvido_tarjeta' and estado <> 'cancelada';

commit;
