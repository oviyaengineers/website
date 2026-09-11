-- Proves whether migrations 0015, 0016 and 0017 actually took.
--
-- Run this on its own after each migration. Every row should read "ok".
-- A failed migration in the Supabase SQL editor rolls back everything that
-- was run with it, so a single batch containing all three leaves no trace of
-- any of them.

select 'numbering table (0015)' as check,
       case when to_regclass('public.dc_number_series') is not null
            then 'ok' else 'MISSING' end as result
union all
select 'next number (0015)',
       coalesce(public.peek_dc_number(), 'MISSING')
union all
select 'status values (0016)',
       case when exists (
              select 1 from pg_enum e
                join pg_type t on t.oid = e.enumtypid
               where t.typname = 'dc_status' and e.enumlabel = 'completed')
            then 'ok' else 'MISSING' end
union all
select 'no legacy statuses left (0017)',
       case when exists (
              select 1 from public.delivery_challans
               where status in ('dispatched', 'delivered'))
            then 'STILL PRESENT' else 'ok' end;
