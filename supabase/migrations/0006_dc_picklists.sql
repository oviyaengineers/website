-- Managed picklists for DC item Component and Material fields (settings-page managed).
create table if not exists public.dc_picklist_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('component', 'material')),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (kind, name)
);

alter table public.dc_picklist_items enable row level security;

create policy "dc_picklist_items_select_authenticated"
  on public.dc_picklist_items for select
  using (auth.role() = 'authenticated');

create policy "dc_picklist_items_insert_admin"
  on public.dc_picklist_items for insert
  with check (public.is_admin());

create policy "dc_picklist_items_delete_admin"
  on public.dc_picklist_items for delete
  using (public.is_admin());
