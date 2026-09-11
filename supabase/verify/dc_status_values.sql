-- Lists the values the dc_status enum actually holds.
--
-- Migration 0016 has now reported success twice while the API still rejects
-- 'active' and 'completed' as invalid input for this type. That error comes
-- from Postgres itself, not from a stale API cache, so either the ALTER TYPE
-- is not committing or it is committing somewhere else.
--
-- Expected after 0016: draft, dispatched, delivered, active, completed.

select string_agg(e.enumlabel, ', ' order by e.enumsortorder) as dc_status_values
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
 where t.typname = 'dc_status'
   and n.nspname = 'public';
