-- Hold reviewed challan scans on the server rather than in the browser.
--
-- The queue lived in the browser: first sessionStorage, which died with the
-- tab, then localStorage, which survives that but never leaves the device. The
-- actual workflow is to photograph challans on the shop floor and raise the
-- delivery challan at a desk afterwards, so a scan has to travel between
-- devices to be any use.
--
-- Workshop-wide rather than per user: whoever walks the floor with the phone is
-- often not the person at the keyboard. created_by is recorded for traceability
-- but does not restrict access.
--
-- Kept to three statements on purpose. Longer scripts have twice arrived at the
-- database incomplete — 0012 lost its USING clause, and an earlier version of
-- this file created nothing at all.

create table if not exists public.pending_dc_scans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  customer_dc_number text,
  customer_dc_date date,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.pending_dc_scans enable row level security;

create policy "pending_dc_scans_all_authenticated"
  on public.pending_dc_scans for all
  to authenticated
  using (true)
  with check (true);
