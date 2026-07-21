begin;

do $$
declare
  esperado text[] := array[
    'supervision@app-urgencias.example.com',
    'lic_noche@app-urgencias.example.com',
    'lic_manana@app-urgencias.example.com',
    'lic_tarde@app-urgencias.example.com',
    'lic_vespertino@app-urgencias.example.com',
    'enfermeria@app-urgencias.example.com'
  ];
  correo text;
  cantidad integer;
  contradicciones text;
begin
  foreach correo in array esperado loop
    select count(*) into cantidad from auth.users where lower(email) = lower(correo);
    if cantidad <> 1 then
      raise exception 'Debe existir exactamente un usuario Auth para %. Coincidencias: %.', correo, cantidad;
    end if;
  end loop;

  with esperados(correo, usuario) as (values
    ('supervision@app-urgencias.example.com', 'supervision'),
    ('lic_noche@app-urgencias.example.com', 'lic_noche'),
    ('lic_manana@app-urgencias.example.com', 'lic_manana'),
    ('lic_tarde@app-urgencias.example.com', 'lic_tarde'),
    ('lic_vespertino@app-urgencias.example.com', 'lic_vespertino'),
    ('enfermeria@app-urgencias.example.com', 'enfermeria')
  ), resueltos as (
    select e.usuario, u.id
    from esperados e
    join auth.users u on lower(u.email) = lower(e.correo)
  )
  select string_agg(r.usuario || ' -> ' || p.usuario, ', ' order by r.usuario)
  into contradicciones
  from resueltos r
  join public.perfiles_usuario p on p.user_id = r.id
  where p.usuario <> r.usuario;

  if contradicciones is not null then
    raise exception 'Existen user_id esperados asociados a otro usuario visible: %.', contradicciones;
  end if;
end $$;

insert into public.perfiles_usuario (user_id, usuario, rol, turno, activo)
select u.id, datos.usuario, datos.rol, datos.turno, true
from (values
  ('supervision@app-urgencias.example.com', 'supervision', 'supervision', null::text),
  ('lic_noche@app-urgencias.example.com', 'lic_noche', 'licenciado', 'noche'),
  ('lic_manana@app-urgencias.example.com', 'lic_manana', 'licenciado', 'manana'),
  ('lic_tarde@app-urgencias.example.com', 'lic_tarde', 'licenciado', 'tarde'),
  ('lic_vespertino@app-urgencias.example.com', 'lic_vespertino', 'licenciado', 'vespertino'),
  ('enfermeria@app-urgencias.example.com', 'enfermeria', 'enfermeria', null::text)
) as datos(correo, usuario, rol, turno)
join auth.users u on lower(u.email) = lower(datos.correo)
on conflict (usuario) do update set
  user_id = excluded.user_id,
  rol = excluded.rol,
  turno = excluded.turno,
  activo = excluded.activo,
  updated_at = now();

commit;

select usuario, rol, turno, activo
from public.perfiles_usuario
where usuario in ('supervision', 'lic_noche', 'lic_manana', 'lic_tarde', 'lic_vespertino', 'enfermeria')
order by usuario;
