-- Redesign delivery challan data model for job-work tracking:
-- customer DC reference fields + job order no. on the header, and
-- component/material/received/sent/balance columns on line items.
-- Depends on 0001_initial_schema.sql .. 0003_rpc_functions.sql.
-- Safe to run against an empty/fresh DC dataset (destructive column drops ok).

-- ========== delivery_challans: new header fields ==========
alter table public.delivery_challans
  add column if not exists customer_dc_number text,
  add column if not exists customer_dc_date date,
  add column if not exists job_order_no text;

-- ========== delivery_challan_items: job-work columns ==========
alter table public.delivery_challan_items
  drop column if exists description,
  drop column if exists quantity,
  drop column if exists unit;

alter table public.delivery_challan_items
  add column if not exists component text not null default '',
  add column if not exists material text,
  add column if not exists received_qty numeric(12,2) not null default 0,
  add column if not exists sent_qty numeric(12,2) not null default 0,
  add column if not exists balance numeric(12,2) generated always as (received_qty - sent_qty) stored;

alter table public.delivery_challan_items
  alter column component drop default;

-- RLS policies on delivery_challans / delivery_challan_items are row-level
-- (auth.role() = 'authenticated' / is_admin()) and do not reference the
-- changed columns, so no policy updates are required.

-- generate_dc_number() / next_document_number() only touch dc_number /
-- document_number_counters and are unaffected by this migration.
