-- Oviya Engineers internal management app: RLS policies + numbering triggers
-- Depends on 0001_initial_schema.sql

-- ========== BEFORE INSERT triggers to auto-set document numbers ==========
create or replace function public.set_dc_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.dc_number is null then
    new.dc_number := public.generate_dc_number();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_dc_number on public.delivery_challans;
create trigger trg_set_dc_number
  before insert on public.delivery_challans
  for each row execute procedure public.set_dc_number();

create or replace function public.set_invoice_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.invoice_number is null then
    new.invoice_number := public.generate_invoice_number();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_invoice_number on public.invoices;
create trigger trg_set_invoice_number
  before insert on public.invoices
  for each row execute procedure public.set_invoice_number();

-- ========== is_admin() helper ==========
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ========== enable RLS ==========
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.delivery_challans enable row level security;
alter table public.delivery_challan_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.job_costs enable row level security;
alter table public.document_number_counters enable row level security;

-- ========== profiles ==========
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (id = auth.uid());

-- users may update their own row but never change their own role;
-- admins may update any row (including role)
create policy "profiles_update_self_no_role_change"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()))
  );

-- ========== customers ==========
create policy "customers_select_authenticated"
  on public.customers for select
  using (auth.role() = 'authenticated');

create policy "customers_insert_authenticated"
  on public.customers for insert
  with check (auth.role() = 'authenticated');

create policy "customers_update_authenticated"
  on public.customers for update
  using (auth.role() = 'authenticated');

create policy "customers_delete_admin"
  on public.customers for delete
  using (public.is_admin());

-- ========== delivery_challans ==========
create policy "dc_select_authenticated"
  on public.delivery_challans for select
  using (auth.role() = 'authenticated');

create policy "dc_insert_authenticated"
  on public.delivery_challans for insert
  with check (auth.role() = 'authenticated');

create policy "dc_update_authenticated"
  on public.delivery_challans for update
  using (auth.role() = 'authenticated');

create policy "dc_delete_admin"
  on public.delivery_challans for delete
  using (public.is_admin());

-- ========== delivery_challan_items ==========
create policy "dc_items_select_authenticated"
  on public.delivery_challan_items for select
  using (auth.role() = 'authenticated');

create policy "dc_items_insert_authenticated"
  on public.delivery_challan_items for insert
  with check (auth.role() = 'authenticated');

create policy "dc_items_update_authenticated"
  on public.delivery_challan_items for update
  using (auth.role() = 'authenticated');

create policy "dc_items_delete_authenticated"
  on public.delivery_challan_items for delete
  using (auth.role() = 'authenticated');

-- ========== invoices ==========
create policy "invoices_select_authenticated"
  on public.invoices for select
  using (auth.role() = 'authenticated');

create policy "invoices_insert_authenticated"
  on public.invoices for insert
  with check (auth.role() = 'authenticated');

create policy "invoices_update_authenticated"
  on public.invoices for update
  using (auth.role() = 'authenticated');

create policy "invoices_delete_admin"
  on public.invoices for delete
  using (public.is_admin());

-- ========== invoice_items ==========
create policy "invoice_items_select_authenticated"
  on public.invoice_items for select
  using (auth.role() = 'authenticated');

create policy "invoice_items_insert_authenticated"
  on public.invoice_items for insert
  with check (auth.role() = 'authenticated');

create policy "invoice_items_update_authenticated"
  on public.invoice_items for update
  using (auth.role() = 'authenticated');

create policy "invoice_items_delete_authenticated"
  on public.invoice_items for delete
  using (auth.role() = 'authenticated');

-- ========== job_costs (admin only, holds profitability data) ==========
create policy "job_costs_admin_only_select"
  on public.job_costs for select
  using (public.is_admin());

create policy "job_costs_admin_only_insert"
  on public.job_costs for insert
  with check (public.is_admin());

create policy "job_costs_admin_only_update"
  on public.job_costs for update
  using (public.is_admin());

create policy "job_costs_admin_only_delete"
  on public.job_costs for delete
  using (public.is_admin());

-- ========== document_number_counters (no direct client access) ==========
create policy "document_number_counters_no_access"
  on public.document_number_counters for all
  using (false)
  with check (false);
