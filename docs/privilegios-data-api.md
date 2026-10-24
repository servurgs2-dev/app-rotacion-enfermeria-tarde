# Privilegios de Supabase Data API

Toda migracion que cree una tabla en el schema `public` debe declarar en esa
misma migracion, sin depender de los privilegios por defecto de Supabase:

1. `GRANT`/`REVOKE` explicitos para `anon`, `authenticated` y `service_role`;
2. RLS habilitado cuando la tabla sea accesible mediante Data API;
3. las policies necesarias para cada operacion permitida;
4. solamente los privilegios de tabla requeridos por los consumidores reales.

Reglas del proyecto:

- `anon` no recibe acceso a tablas de negocio.
- Una tabla escrita exclusivamente mediante RPC no concede
  `INSERT`, `UPDATE` ni `DELETE` directos a `authenticated`.
- `service_role` no recibe acceso general. Cada Edge Function o proceso servidor
  debe justificar y declarar sólo las operaciones que utiliza.
- RLS y privilegios SQL son capas complementarias: una policy no sustituye un
  `GRANT`, y un `GRANT` no sustituye una policy.
- La prueba `tests/privilegios-data-api.test.mjs` debe actualizarse de forma
  consciente cuando se agregue una tabla pública o cambie su contrato.
