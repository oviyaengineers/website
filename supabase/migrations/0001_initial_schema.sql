-- Oviya Engineers internal management app: initial schema
-- Run against a Supabase Postgres database.

create extension if not exists "pgcrypto";

-- ========== Enums ==========
create type user_role as enum ('admin', 'staff');
create type dc_status as enum ('draft', 'dispatched', 'delivered');
create type payment_status as enum ('unpaid', 'partial', 'paid');

-- ========== profiles ==========
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'staff')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ========== customers ==========
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  gst_number text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

-- ========== per-year auto-numbering ==========
-- Generic sequence table keyed by (doc_type, year) so DC and invoice numbers
-- each reset independently every calendar year.
create table document_number_counters (
  doc_type text not null,
  year int not null,
  last_value int not null default 0,
  primary key (doc_type, year)
);

create function next_document_number(p_doc_type text, p_prefix text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_next int;
begin
  insert into document_number_counters (doc_type, year, last_value)
  values (p_doc_type, v_year, 1)
  on conflict (doc_type, year)
  do update set last_value = document_number_counters.last_value + 1
  returning last_value into v_next;

  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- ========== delivery_challans ==========
create table delivery_challans (
  id uuid primary key default gen_random_uuid(),
  dc_number text not null unique,
  customer_id uuid not null references customers(id),
  dc_date date not null default current_date,
  vehicle_number text,
  driver_name text,
  status dc_status not null default 'draft',
  remarks text,
  authorized_by text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function generate_dc_number()
returns text
language sql
security definer set search_path = public
as $$
  select next_document_number('dc', 'DC');
$$;

create table delivery_challan_items (
  id uuid primary key default gen_random_uuid(),
  dc_id uuid not null references delivery_challans(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'nos',
  remarks text,
  sort_order int not null default 0
);

-- ========== invoices ==========
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid not null references customers(id),
  dc_id uuid references delivery_challans(id),
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 18,
  gst_amount numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  payment_status payment_status not null default 'unpaid',
  amount_paid numeric(14,2) not null default 0,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create function generate_invoice_number()
returns text
language sql
security definer set search_path = public
as $$
  select next_document_number('invoice', 'INV');
$$;

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'nos',
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  sort_order int not null default 0
);

-- ========== job_costs ==========
create table job_costs (
  id uuid primary key default gen_random_uuid(),
  dc_id uuid references delivery_challans(id),
  invoice_id uuid references invoices(id),
  job_name text not null,
  material_cost numeric(14,2) not null default 0,
  machine_hours numeric(10,2) not null default 0,
  machine_rate numeric(14,2) not null default 0,
  labor_cost numeric(14,2) not null default 0,
  tooling_cost numeric(14,2) not null default 0,
  overhead_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) generated always as (
    material_cost + (machine_hours * machine_rate) + labor_cost + tooling_cost + overhead_cost
  ) stored,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ========== updated_at trigger for delivery_challans ==========
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_dc_updated_at
  before update on delivery_challans
  for each row execute procedure set_updated_at();

-- ========== indexes ==========
create index idx_dc_customer on delivery_challans(customer_id);
create index idx_dc_status on delivery_challans(status);
create index idx_dc_date on delivery_challans(dc_date);
create index idx_dc_items_dc on delivery_challan_items(dc_id);
create index idx_invoices_customer on invoices(customer_id);
create index idx_invoices_dc on invoices(dc_id);
create index idx_invoices_status on invoices(payment_status);
create index idx_invoice_items_invoice on invoice_items(invoice_id);
create index idx_job_costs_dc on job_costs(dc_id);
create index idx_job_costs_invoice on job_costs(invoice_id);
