-- Every type named dc_status, in every schema, with the values it holds.
--
-- Run this if 0016 reports success again without changing anything. A second
-- dc_status in another schema, picked up through search_path, would explain an
-- ALTER TYPE that commits cleanly and yet leaves the table's own type alone.
--
-- The table's column points at exactly one of these; the last column says
-- which, and that is the row that has to gain 'active' and 'completed'.

select
  n.nspname                                             as schema,
  string_agg(e.enumlabel, ', ' order by e.enumsortorder) as values,
  (t.oid = (
     select a.atttypid
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace cn on cn.oid = c.relnamespace
      where cn.nspname = 'public'
        and c.relname = 'delivery_challans'
        and a.attname = 'status'
  ))                                                    as used_by_the_table
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
 where t.typname = 'dc_status'
 group by n.nspname, t.oid;
