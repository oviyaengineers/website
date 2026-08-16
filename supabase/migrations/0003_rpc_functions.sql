-- Grants for RPCs callable directly from the client via supabase.rpc(...)
-- (generate_dc_number / generate_invoice_number are used by the DC and
-- invoice creation forms to preview the next document number; is_admin is
-- used by RLS policies but is also safe to expose for client-side role
-- checks if ever needed.)

grant execute on function public.generate_dc_number() to authenticated;
grant execute on function public.generate_invoice_number() to authenticated;
grant execute on function public.is_admin() to authenticated;
