begin;

alter table public.estado_por_turno_mes
  add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estado_por_turno_mes_revision_check'
      and conrelid = 'public.estado_por_turno_mes'::regclass
  ) then
    alter table public.estado_por_turno_mes
      add constraint estado_por_turno_mes_revision_check
      check (revision >= 1);
  end if;
end
$$;

create or replace function public.preparar_revision_estado_turno_mes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.updated_at := now();
    return new;
  end if;

  if new.revision is distinct from old.revision + 1 then
    raise exception 'Actualización rechazada: revisión inválida.'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.preparar_revision_estado_turno_mes() from public;
revoke all on function public.preparar_revision_estado_turno_mes() from anon;

drop trigger if exists estado_turno_mes_revision_trigger
  on public.estado_por_turno_mes;

create trigger estado_turno_mes_revision_trigger
before insert or update on public.estado_por_turno_mes
for each row
execute function public.preparar_revision_estado_turno_mes();

create or replace function public.guardar_estado_turno_mes_si_revision(
  p_turno text,
  p_mes text,
  p_data jsonb,
  p_revision_esperada bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  fila public.estado_por_turno_mes%rowtype;
begin
  if p_turno is null
    or p_turno not in ('noche', 'manana', 'tarde', 'vespertino') then
    raise exception 'Turno inválido.';
  end if;

  if p_mes is null
    or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mes inválido. Debe tener formato YYYY-MM.';
  end if;

  if p_data is null then
    raise exception 'El estado mensual no puede ser null.';
  end if;

  if p_revision_esperada is null or p_revision_esperada < 0 then
    raise exception 'La revisión esperada debe ser un entero no negativo.';
  end if;

  if p_revision_esperada = 0 then
    insert into public.estado_por_turno_mes (
      turno,
      mes,
      data,
      revision,
      updated_at
    )
    values (
      p_turno,
      p_mes,
      p_data,
      1,
      now()
    )
    on conflict (turno, mes) do nothing
    returning * into fila;

    if found then
      return jsonb_build_object(
        'resultado', 'guardado',
        'existe', true,
        'revision', fila.revision::text,
        'updated_at', fila.updated_at,
        'data', null
      );
    end if;
  else
    update public.estado_por_turno_mes
    set
      data = p_data,
      revision = revision + 1,
      updated_at = now()
    where turno = p_turno
      and mes = p_mes
      and revision = p_revision_esperada
    returning * into fila;

    if found then
      return jsonb_build_object(
        'resultado', 'guardado',
        'existe', true,
        'revision', fila.revision::text,
        'updated_at', fila.updated_at,
        'data', null
      );
    end if;
  end if;

  select *
  into fila
  from public.estado_por_turno_mes
  where turno = p_turno
    and mes = p_mes;

  if found then
    return jsonb_build_object(
      'resultado', 'conflicto',
      'existe', true,
      'revision', fila.revision::text,
      'updated_at', fila.updated_at,
      'data', fila.data
    );
  end if;

  return jsonb_build_object(
    'resultado', 'conflicto',
    'existe', false,
    'revision', '0',
    'updated_at', null,
    'data', null
  );
end;
$$;

revoke all on function public.guardar_estado_turno_mes_si_revision(
  text,
  text,
  jsonb,
  bigint
) from public;
revoke all on function public.guardar_estado_turno_mes_si_revision(
  text,
  text,
  jsonb,
  bigint
) from anon;
grant execute on function public.guardar_estado_turno_mes_si_revision(
  text,
  text,
  jsonb,
  bigint
) to authenticated;

commit;
