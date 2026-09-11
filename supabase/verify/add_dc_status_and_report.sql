-- Adds the two statuses and reports, in the same run, what the type holds
-- afterwards. Run the whole thing as one execution and send back both results.
--
-- Written this way because 0016 has now reported success four times while
-- public.dc_status kept only draft, dispatched and delivered, and every
-- theory so far has been wrong. Separating the change from the check left
-- room to doubt which one ran; this leaves none.
--
-- The second statement reads pg_catalog directly, so it cannot be fooled by
-- any API-side cache.

alter type public.dc_status add value if not exists 'active';
alter type public.dc_status add value if not exists 'completed';

select
  current_database()                                     as database,
  current_user                                           as running_as,
  n.nspname                                              as type_schema,
  string_agg(e.enumlabel, ', ' order by e.enumsortorder)  as values_now,
  (t.oid = (
     select a.atttypid
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace cn on cn.oid = c.relnamespace
      where cn.nspname = 'public'
        and c.relname = 'delivery_challans'
        and a.attname = 'status'
  ))                                                     as used_by_the_table
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
 where t.typname = 'dc_status'
 group by current_database(), current_user, n.nspname, t.oid;
