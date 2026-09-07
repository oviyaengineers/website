-- Preview the next DC number WITHOUT consuming it.
--
-- next_document_number() increments the counter on every call, so using
-- generate_dc_number() merely to show "Our DC Number" on the new-DC form
-- burned a number on every page view. The real number is still allocated by
-- the trg_set_dc_number insert trigger; this function only looks.

create or replace function public.peek_dc_number()
returns text
language sql
stable
security definer set search_path = public
as $$
  select 'DC-'
    || extract(year from now())::int
    || '-'
    || lpad(
         (coalesce(
            (select last_value
               from document_number_counters
              where doc_type = 'dc'
                and year = extract(year from now())::int),
            0) + 1)::text,
         4, '0');
$$;

grant execute on function public.peek_dc_number() to authenticated;
