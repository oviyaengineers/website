-- Replace the Balance column with Material Problem / Rejection / Total reconciliation columns.
alter table public.delivery_challan_items
  drop column if exists balance;

alter table public.delivery_challan_items
  add column if not exists material_problem_qty numeric(12,2) not null default 0,
  add column if not exists rejection_qty numeric(12,2) not null default 0,
  add column if not exists total_qty numeric(12,2)
    generated always as (sent_qty + material_problem_qty + rejection_qty) stored;
