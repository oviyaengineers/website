-- Convenience RPCs exposed to the client via supabase.rpc(...)

create function public.get_next_dc_number()
returns text
language sql
security definer set search_path = public
as $$
  select generate_dc_number();
$$;

create function public.get_next_invoice_number()
returns text
language sql
security definer set search_path = public
as $$
  select generate_invoice_number();
$$;

grant execute on function public.get_next_dc_number() to authenticated;
grant execute on function public.get_next_invoice_number() to authenticated;
