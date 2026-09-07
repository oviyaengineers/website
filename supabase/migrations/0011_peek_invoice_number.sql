-- Preview the next invoice number WITHOUT consuming it.
--
-- Same defect as the DC number: next_document_number() increments the counter
-- on every call, so using generate_invoice_number() merely to show "Invoice
-- Number" on the new-invoice form burned a number on every page view. The real
-- number is still allocated by the trg_set_invoice_number insert trigger; this
-- function only looks.

create or replace function public.peek_invoice_number()
returns text
language sql
stable
security definer set search_path = public
as $$
  select 'INV-'
    || extract(year from now())::int
    || '-'
    || lpad(
         (coalesce(
            (select last_value
               from document_number_counters
              where doc_type = 'invoice'
                and year = extract(year from now())::int),
            0) + 1)::text,
         4, '0');
$$;

grant execute on function public.peek_invoice_number() to authenticated;
