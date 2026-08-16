-- Allow multiple Customer DC Number / Date pairs per delivery challan.
alter table public.delivery_challans
  alter column customer_dc_number type text[]
  using case when customer_dc_number is null then null else array[customer_dc_number] end;

alter table public.delivery_challans
  alter column customer_dc_date type date[]
  using case when customer_dc_date is null then null else array[customer_dc_date] end;
