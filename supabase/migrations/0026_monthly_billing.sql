-- Stage 2, revised: monthly billing with any number of invoices per month.
--
-- Billing is organised by calendar month, and a customer may have one, two or
-- more invoices in the same month. What must never happen is the same Sent
-- quantity being billed twice, so the link between an invoice and a DC line
-- becomes an allocation:
--
--   invoice_items         one grouped line per component + material + rate + HSN
--   invoice_item_sources  the exact quantity each DC line contributes to it
--
-- Billed quantity on a DC line is the sum of its allocations on issued
-- invoices; unbilled is Sent less that. It is calculated, never stored.
-- Cancelling an invoice stops its allocations counting, so the quantity is
-- billable again, while the invoice and its number are kept.
--
-- There is deliberately NO unique rule on customer + billing month.
--
-- No delivery challan, challan line, DC number or scan is changed. The invoice
-- tables are empty, so dropping the single-DC link from 0025 loses nothing.

-- ---------------------------------------------------------------------------
-- Retire the invoice-per-DC pieces of 0025.
drop view if exists public.dc_line_billing;
drop function if exists public.save_invoice(uuid, jsonb, jsonb, jsonb);

-- ---------------------------------------------------------------------------
-- Billing month on every invoice: always the first day of a calendar month.
alter table public.invoices add column if not exists billing_month date;
alter table public.invoices alter column billing_month set not null;
do $c$
begin
  alter table public.invoices add constraint invoices_billing_month_first_day
    check (billing_month = date_trunc('month', billing_month)::date);
exception when duplicate_object then null;
end $c$;
create index if not exists invoices_customer_billing_month_idx
  on public.invoices (customer_id, billing_month);

-- ---------------------------------------------------------------------------
-- Allocations: which DC line, and how much of it, each grouped line bills.
create table if not exists public.invoice_item_sources (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  invoice_item_id uuid not null references public.invoice_items(id) on delete restrict,
  dc_item_id uuid not null references public.delivery_challan_items(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  unique (invoice_item_id, dc_item_id)
);
create index if not exists invoice_item_sources_dc_item_id_idx on public.invoice_item_sources (dc_item_id);
create index if not exists invoice_item_sources_invoice_id_idx on public.invoice_item_sources (invoice_id);

alter table public.invoice_item_sources enable row level security;
drop policy if exists "invoice_item_sources_select_authenticated" on public.invoice_item_sources;
create policy "invoice_item_sources_select_authenticated"
  on public.invoice_item_sources for select to authenticated using (true);
drop policy if exists "invoice_item_sources_insert_authenticated" on public.invoice_item_sources;
create policy "invoice_item_sources_insert_authenticated"
  on public.invoice_item_sources for insert to authenticated with check (true);
revoke all on public.invoice_item_sources from anon;

-- The allocation replaces the single DC link on the line.
alter table public.invoice_items drop constraint if exists invoice_items_dc_link_check;
alter table public.invoice_items drop column if exists dc_item_id;

-- ---------------------------------------------------------------------------
-- Guards for the allocation table: written only by create_invoice, never
-- changed, never deleted through the API.
create or replace function public.guard_invoice_source_write()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if current_user in ('authenticated', 'anon')
     and (tg_op <> 'INSERT' or not public.invoice_write_via_save()) then
    raise exception 'INVOICE_WRITE_VIA_SAVE_ONLY: invoice allocations cannot be changed'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$guard$;

drop trigger if exists trg_guard_invoice_source_write on public.invoice_item_sources;
create trigger trg_guard_invoice_source_write
  before insert or update or delete on public.invoice_item_sources
  for each row execute function public.guard_invoice_source_write();

-- Checked at commit, so a transaction can write the line and then its sources:
-- a work line's quantity equals its sources, a charge line has none, and every
-- source belongs to the same invoice, its customer and its billing month.
create or replace function public.check_invoice_allocation()
returns trigger
language plpgsql
set search_path = public
as $check$
declare
  v_item_id uuid;
  v_item public.invoice_items;
  v_sum numeric;
  v_bad int;
begin
  -- Separate branches: a row only has the fields of its own table.
  if tg_table_name = 'invoice_items' then
    v_item_id := new.id;
  else
    v_item_id := new.invoice_item_id;
  end if;
  select * into v_item from public.invoice_items where id = v_item_id;
  if not found then
    return null;
  end if;

  select coalesce(sum(s.quantity), 0) into v_sum
    from public.invoice_item_sources s where s.invoice_item_id = v_item.id;

  if v_item.line_type = 'dc_work' and v_sum <> v_item.quantity then
    raise exception 'ALLOCATION_MISMATCH: line % bills % but its DC sources add up to %', v_item.id, v_item.quantity, v_sum;
  end if;
  if v_item.line_type = 'charge' and v_sum <> 0 then
    raise exception 'ALLOCATION_MISMATCH: other charge % cannot bill DC quantity', v_item.id;
  end if;

  select count(*) into v_bad
    from public.invoice_item_sources s
    join public.invoices inv on inv.id = v_item.invoice_id
    join public.delivery_challan_items i on i.id = s.dc_item_id
    join public.delivery_challans d on d.id = i.dc_id
   where s.invoice_item_id = v_item.id
     and (s.invoice_id <> v_item.invoice_id
          or d.customer_id <> inv.customer_id
          or date_trunc('month', d.dc_date)::date <> inv.billing_month);
  if v_bad > 0 then
    raise exception 'ALLOCATION_MISMATCH: a source of line % is from another invoice, customer or month', v_item.id;
  end if;
  return null;
end;
$check$;

drop trigger if exists trg_check_invoice_item_allocation on public.invoice_items;
create constraint trigger trg_check_invoice_item_allocation
  after insert or update on public.invoice_items
  deferrable initially deferred
  for each row execute function public.check_invoice_allocation();

drop trigger if exists trg_check_invoice_source_allocation on public.invoice_item_sources;
create constraint trigger trg_check_invoice_source_allocation
  after insert or update on public.invoice_item_sources
  deferrable initially deferred
  for each row execute function public.check_invoice_allocation();

-- ---------------------------------------------------------------------------
-- Billing per DC line, by the calendar month of its DC date.
create or replace view public.dc_line_billing
with (security_invoker = true)
as
select
  i.id as dc_item_id,
  i.dc_id,
  d.customer_id,
  date_trunc('month', d.dc_date)::date as billing_month,
  case when d.status::text = 'draft' then 0 else i.sent_qty end as billable_qty,
  coalesce(b.billed, 0) as billed_qty,
  (case when d.status::text = 'draft' then 0 else i.sent_qty end) - coalesce(b.billed, 0) as unbilled_qty
from public.delivery_challan_items i
join public.delivery_challans d on d.id = i.dc_id
left join lateral (
  select sum(s.quantity) as billed
    from public.invoice_item_sources s
    join public.invoices inv on inv.id = s.invoice_id
   where s.dc_item_id = i.id and inv.status = 'issued'
) b on true;
revoke all on public.dc_line_billing from anon;
grant select on public.dc_line_billing to authenticated;

-- Totals per customer and month, and how many invoices the month has.
create or replace view public.customer_month_billing
with (security_invoker = true)
as
with lines as (
  select customer_id, billing_month,
         sum(billable_qty) as sent_qty, sum(billed_qty) as billed_qty, sum(unbilled_qty) as unbilled_qty
    from public.dc_line_billing
   group by customer_id, billing_month
),
inv as (
  select customer_id, billing_month,
         count(*) filter (where status = 'issued') as issued_invoices,
         count(*) filter (where status = 'cancelled') as cancelled_invoices,
         coalesce(sum(grand_total) filter (where status = 'issued'), 0) as issued_total,
         coalesce(sum(amount_paid) filter (where status = 'issued'), 0) as paid_total
    from public.invoices
   group by customer_id, billing_month
)
select
  coalesce(l.customer_id, v.customer_id) as customer_id,
  coalesce(l.billing_month, v.billing_month) as billing_month,
  coalesce(l.sent_qty, 0) as sent_qty,
  coalesce(l.billed_qty, 0) as billed_qty,
  coalesce(l.unbilled_qty, 0) as unbilled_qty,
  coalesce(v.issued_invoices, 0) as issued_invoices,
  coalesce(v.cancelled_invoices, 0) as cancelled_invoices,
  coalesce(v.issued_total, 0) as issued_total,
  coalesce(v.paid_total, 0) as paid_total
from lines l
full join inv v on v.customer_id = l.customer_id and v.billing_month = l.billing_month;
revoke all on public.customer_month_billing from anon;
grant select on public.customer_month_billing to authenticated;

-- ---------------------------------------------------------------------------
-- DC header rules once a DC is billed: its month and customer are fixed, and
-- it cannot be reopened to draft.
create or replace function public.guard_dc_reopen_billed()
returns trigger
language plpgsql
set search_path = public
as $guard$
declare
  v_billed boolean;
begin
  select exists (
    select 1
      from public.delivery_challan_items i
      join public.invoice_item_sources s on s.dc_item_id = i.id
      join public.invoices inv on inv.id = s.invoice_id and inv.status = 'issued'
     where i.dc_id = old.id
  ) into v_billed;

  if not v_billed then
    return new;
  end if;
  if new.status::text = 'draft' and old.status::text <> 'draft' then
    raise exception 'DC_BILLED_CANNOT_REOPEN: % is billed on an issued invoice', old.dc_number
      using errcode = '42501';
  end if;
  if date_trunc('month', new.dc_date) <> date_trunc('month', old.dc_date) then
    raise exception 'DC_BILLED_MONTH_LOCKED: % is billed for %, so its date cannot move to another month',
      old.dc_number, to_char(old.dc_date, 'FMMonth YYYY')
      using errcode = '42501';
  end if;
  if new.customer_id <> old.customer_id then
    raise exception 'DC_BILLED_CUSTOMER_LOCKED: % is billed, so its customer cannot change', old.dc_number
      using errcode = '42501';
  end if;
  return new;
end;
$guard$;

-- ---------------------------------------------------------------------------
-- Create an invoice for one customer and one billing month, in one transaction.
create or replace function public.create_invoice(
  p_request_key uuid,
  p_customer_id uuid,
  p_billing_month date,
  p_header jsonb,
  p_lines jsonb,
  p_charges jsonb default '[]'::jsonb
)
returns table (invoice_id uuid, invoice_number text, already_saved boolean)
language plpgsql
security invoker
set search_path = public
as $create$
declare
  v_inv public.invoices;
  v_settings public.company_billing_settings;
  v_customer public.customers;
  v_line record;
  v_item record;
  v_group record;
  v_charge record;
  v_rows jsonb := '[]'::jsonb;
  v_charge_rows jsonb := '[]'::jsonb;
  v_requested int;
  v_distinct int;
  v_billed numeric;
  v_available numeric;
  v_list_rate numeric;
  v_hsn text;
  v_amount numeric;
  v_gst_rate numeric;
  v_discount numeric;
  v_work numeric := 0;
  v_charges numeric := 0;
  v_subtotal numeric;
  v_taxable numeric;
  v_intra boolean;
  v_cgst_rate numeric := 0;
  v_sgst_rate numeric := 0;
  v_igst_rate numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_igst numeric := 0;
  v_invoice_date date;
  v_due_date date;
  v_index int := 0;
  v_item_id uuid;
  v_source jsonb;
begin
  perform set_config('app.invoice_save', 'on', true);

  -- A repeated request returns the invoice it already made.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('invoice:' || p_request_key::text, 0));
    select * into v_inv from public.invoices i where i.request_key = p_request_key;
    if found then
      perform set_config('app.invoice_save', '', true);
      return query select v_inv.id, v_inv.invoice_number, true;
      return;
    end if;
  end if;

  if p_billing_month is null or p_billing_month <> date_trunc('month', p_billing_month)::date then
    raise exception 'BILLING_MONTH_INVALID';
  end if;

  select * into v_customer from public.customers c where c.id = p_customer_id;
  if p_customer_id is null or not found then
    raise exception 'INVOICE_NO_CUSTOMER';
  end if;

  if coalesce(jsonb_array_length(coalesce(p_lines, '[]'::jsonb)), 0)
     + coalesce(jsonb_array_length(coalesce(p_charges, '[]'::jsonb)), 0) = 0 then
    raise exception 'INVOICE_NO_LINES';
  end if;

  select * into v_settings from public.company_billing_settings s where s.id;
  if not found or nullif(btrim(v_settings.legal_name), '') is null then
    raise exception 'SETTINGS_MISSING:company legal name';
  end if;
  if nullif(btrim(v_settings.gstin), '') is null then
    raise exception 'SETTINGS_MISSING:company GSTIN';
  end if;
  if nullif(btrim(v_settings.state), '') is null then
    raise exception 'SETTINGS_MISSING:company state';
  end if;
  if nullif(btrim(v_customer.state), '') is null then
    raise exception 'CUSTOMER_STATE_MISSING:%', v_customer.name;
  end if;

  if nullif(p_header->>'gst_rate', '') is null then
    raise exception 'GST_RATE_MISSING';
  end if;
  v_gst_rate := (p_header->>'gst_rate')::numeric;
  if v_gst_rate < 0 or v_gst_rate > 100 then
    raise exception 'GST_RATE_INVALID';
  end if;
  v_discount := coalesce(nullif(p_header->>'discount', '')::numeric, 0);
  if v_discount < 0 then
    raise exception 'DISCOUNT_INVALID';
  end if;
  v_invoice_date := nullif(p_header->>'invoice_date', '')::date;
  if v_invoice_date is null then
    raise exception 'INVOICE_DATE_MISSING';
  end if;
  if v_invoice_date < p_billing_month then
    raise exception 'INVOICE_DATE_BEFORE_MONTH';
  end if;
  v_due_date := nullif(p_header->>'due_date', '')::date;
  if v_due_date is not null and v_due_date < v_invoice_date then
    raise exception 'DUE_BEFORE_INVOICE';
  end if;

  select count(*), count(distinct e->>'dc_item_id') into v_requested, v_distinct
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e;
  if v_requested <> v_distinct then
    raise exception 'DUPLICATE_DC_LINE';
  end if;

  -- Lock every DC line being billed, in id order. A second invoice billing
  -- the same line waits here, then sees the first one's allocation.
  perform 1
     from public.delivery_challan_items i
    where i.id in (
      select nullif(e->>'dc_item_id', '')::uuid from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
    )
    order by i.id
      for update of i;

  for v_line in
    select nullif(e->>'dc_item_id', '')::uuid as dc_item_id,
           nullif(e->>'quantity', '')::numeric as quantity,
           nullif(e->>'rate', '')::numeric as rate,
           nullif(btrim(e->>'hsn_sac'), '') as hsn_sac,
           t.ord
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(e, ord)
     order by t.ord
  loop
    select i.id, i.component, i.component_id, i.material, i.sent_qty,
           d.dc_number, d.dc_date, d.customer_id, d.status::text as dc_status
      into v_item
      from public.delivery_challan_items i
      join public.delivery_challans d on d.id = i.dc_id
     where i.id = v_line.dc_item_id;
    if v_line.dc_item_id is null or v_item.id is null then
      raise exception 'DC_LINE_MISSING';
    end if;
    if v_item.customer_id <> p_customer_id then
      raise exception 'DC_OTHER_CUSTOMER:%', v_item.dc_number;
    end if;
    if v_item.dc_status = 'draft' then
      raise exception 'DC_NOT_ISSUED:%', v_item.dc_number;
    end if;
    if date_trunc('month', v_item.dc_date)::date <> p_billing_month then
      raise exception 'DC_OTHER_MONTH:%|%', v_item.dc_number, to_char(v_item.dc_date, 'FMMonth YYYY');
    end if;
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'QUANTITY_INVALID:%|%', v_item.component, v_item.dc_number;
    end if;
    if v_line.rate is null or v_line.rate < 0 then
      raise exception 'RATE_INVALID:%|%', v_item.component, v_item.dc_number;
    end if;

    -- Billed and unbilled, read after the lock, from issued invoices only.
    select coalesce(sum(s.quantity), 0) into v_billed
      from public.invoice_item_sources s
      join public.invoices inv on inv.id = s.invoice_id
     where s.dc_item_id = v_item.id and inv.status = 'issued';
    v_available := v_item.sent_qty - v_billed;
    if v_line.quantity > v_available then
      raise exception 'QUANTITY_NO_LONGER_AVAILABLE:%|%|%|%', v_item.component, v_item.dc_number,
        greatest(v_available, 0), v_line.quantity;
    end if;

    select r.rate, r.hsn_sac into v_list_rate, v_hsn
      from public.component_rates r
     where r.component_id = v_item.component_id and r.material = coalesce(v_item.material, '');
    v_hsn := coalesce(v_line.hsn_sac, v_hsn, nullif(btrim(v_settings.default_hsn_sac), ''));
    if v_hsn is null then
      raise exception 'HSN_MISSING:%', v_item.component;
    end if;

    v_rows := v_rows || jsonb_build_object(
      'ord', v_line.ord, 'dc_item_id', v_item.id, 'description', v_item.component,
      'component_id', v_item.component_id, 'material', coalesce(v_item.material, ''),
      'quantity', v_line.quantity, 'rate', v_line.rate, 'hsn_sac', v_hsn, 'list_rate', v_list_rate
    );
    v_list_rate := null;
    v_hsn := null;
  end loop;

  -- Other charges: invoice-level, never allocated to a DC line.
  for v_charge in
    select nullif(btrim(e->>'description'), '') as description,
           nullif(e->>'amount', '')::numeric as amount,
           nullif(btrim(e->>'hsn_sac'), '') as hsn_sac
      from jsonb_array_elements(coalesce(p_charges, '[]'::jsonb)) with ordinality as t(e, ord)
     order by t.ord
  loop
    if v_charge.description is null then
      raise exception 'CHARGE_DESCRIPTION_MISSING';
    end if;
    if v_charge.amount is null or v_charge.amount < 0 then
      raise exception 'CHARGE_AMOUNT_INVALID:%', v_charge.description;
    end if;
    v_amount := round(v_charge.amount, 2);
    v_charges := v_charges + v_amount;
    v_charge_rows := v_charge_rows || jsonb_build_object(
      'description', v_charge.description, 'amount', v_amount, 'hsn_sac', v_charge.hsn_sac
    );
  end loop;

  -- Work total: each grouped line (component + material + rate + HSN) rounded once.
  select coalesce(sum(round(g.quantity * g.rate, 2)), 0) into v_work
    from (
      select sum((r->>'quantity')::numeric) as quantity, (r->>'rate')::numeric as rate
        from jsonb_array_elements(v_rows) r
       group by r->>'component_id', r->>'description', r->>'material', r->>'rate', r->>'hsn_sac'
    ) g;

  v_subtotal := v_work + v_charges;
  if v_discount > v_subtotal then
    raise exception 'DISCOUNT_TOO_LARGE';
  end if;
  v_taxable := v_subtotal - v_discount;

  v_intra := lower(regexp_replace(btrim(v_customer.state), '\s+', ' ', 'g'))
           = lower(regexp_replace(btrim(v_settings.state), '\s+', ' ', 'g'));
  if v_intra then
    v_cgst_rate := v_gst_rate / 2;
    v_sgst_rate := v_gst_rate / 2;
    v_cgst := round(v_taxable * v_cgst_rate / 100, 2);
    v_sgst := round(v_taxable * v_sgst_rate / 100, 2);
  else
    v_igst_rate := v_gst_rate;
    v_igst := round(v_taxable * v_igst_rate / 100, 2);
  end if;

  insert into public.invoices (
    customer_id, billing_month, invoice_date, due_date, subtotal, gst_rate, gst_amount, discount,
    grand_total, notes, created_by, status, request_key, tax_type, place_of_supply, taxable_value,
    other_charges, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
    seller_snapshot, buyer_snapshot
  )
  values (
    p_customer_id, p_billing_month, v_invoice_date, v_due_date, v_subtotal, v_gst_rate,
    v_cgst + v_sgst + v_igst, v_discount, v_taxable + v_cgst + v_sgst + v_igst,
    nullif(btrim(p_header->>'notes'), ''), auth.uid(), 'issued', p_request_key,
    case when v_intra then 'intra' else 'inter' end, v_customer.state, v_taxable, v_charges,
    v_cgst_rate, v_sgst_rate, v_igst_rate, v_cgst, v_sgst, v_igst,
    to_jsonb(v_settings) - 'id' - 'updated_at' - 'updated_by',
    jsonb_build_object(
      'name', v_customer.name, 'address', v_customer.address, 'state', v_customer.state,
      'gstin', v_customer.gst_number, 'phone', v_customer.phone, 'email', v_customer.email
    )
  )
  returning * into v_inv;

  -- One grouped line per component + material + rate + HSN, with every DC
  -- line that feeds it recorded as an allocation.
  for v_group in
    select r->>'description' as description,
           nullif(r->>'component_id', '')::uuid as component_id,
           nullif(r->>'material', '') as material,
           (r->>'rate')::numeric as rate,
           r->>'hsn_sac' as hsn_sac,
           sum((r->>'quantity')::numeric) as quantity,
           min(nullif(r->>'list_rate', '')::numeric) as list_rate,
           jsonb_agg(jsonb_build_object('dc_item_id', r->>'dc_item_id', 'quantity', r->>'quantity')
                     order by (r->>'ord')::int) as sources,
           min((r->>'ord')::int) as first_ord
      from jsonb_array_elements(v_rows) r
     group by r->>'component_id', r->>'description', r->>'material', r->>'rate', r->>'hsn_sac'
     order by min((r->>'ord')::int)
  loop
    insert into public.invoice_items (
      invoice_id, line_type, description, component_id, material,
      quantity, unit, unit_price, amount, hsn_sac, list_rate, sort_order
    )
    values (
      v_inv.id, 'dc_work', v_group.description, v_group.component_id, v_group.material,
      v_group.quantity, 'nos', v_group.rate, round(v_group.quantity * v_group.rate, 2),
      v_group.hsn_sac, v_group.list_rate, v_index
    )
    returning id into v_item_id;

    for v_source in select value from jsonb_array_elements(v_group.sources)
    loop
      insert into public.invoice_item_sources (invoice_id, invoice_item_id, dc_item_id, quantity)
      values (v_inv.id, v_item_id, (v_source->>'dc_item_id')::uuid, (v_source->>'quantity')::numeric);
    end loop;

    v_index := v_index + 1;
  end loop;

  for v_source in select value from jsonb_array_elements(v_charge_rows)
  loop
    insert into public.invoice_items (
      invoice_id, line_type, description, quantity, unit, unit_price, amount, hsn_sac, sort_order
    )
    values (
      v_inv.id, 'charge', v_source->>'description', 1, 'charge', (v_source->>'amount')::numeric,
      (v_source->>'amount')::numeric, nullif(v_source->>'hsn_sac', ''), v_index
    );
    v_index := v_index + 1;
  end loop;

  perform set_config('app.invoice_save', '', true);
  return query select v_inv.id, v_inv.invoice_number, false;
end;
$create$;

revoke all on function public.create_invoice(uuid, uuid, date, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_invoice(uuid, uuid, date, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function public.check_invoice_allocation() from public, anon;
revoke execute on function public.guard_invoice_source_write() from public, anon;

-- ---------------------------------------------------------------------------
-- Stage 1 save, unchanged apart from reading billed quantity from allocations.
create or replace function public.save_delivery_challan(
  p_dc_id uuid,
  p_request_key uuid,
  p_header jsonb,
  p_items jsonb,
  p_scan_ids uuid[] default '{}'
)
returns table (dc_id uuid, dc_number text, already_saved boolean)
language plpgsql
-- Invoker: the caller's row-level security still applies to every write.
security invoker
set search_path = public
as $$
declare
  v_dc public.delivery_challans;
  v_scan record;
  v_check record;
  v_line public.delivery_challan_items;
  v_used numeric;
  v_room numeric;
  v_missing int;
  v_parent_dcs uuid[];
  v_item jsonb;
  v_index int := 0;
  v_item_id uuid;
  v_keep uuid[] := '{}';
  v_component_id uuid;
  v_billed record;
begin
  -- Marks this transaction's writes as coming through the save, which the
  -- guards on delivery_challans and delivery_challan_items require (0024).
  perform set_config('app.dc_save', 'on', true);

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'DC_NO_ITEMS';
  end if;
  if nullif(p_header->>'customer_id', '') is null then
    raise exception 'DC_NO_CUSTOMER';
  end if;

  -- A repeated request: wait for any save still running under this key, then
  -- hand back what it saved.
  if p_dc_id is null and p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
    select * into v_dc from public.delivery_challans c where c.request_key = p_request_key;
    if found then
      perform set_config('app.dc_save', '', true);
      return query select v_dc.id, v_dc.dc_number, true;
      return;
    end if;
  end if;

  -- Scans convert exactly once. Locked, so a second tab waits here and then
  -- finds the scan already converted.
  for v_scan in
    select s.id, s.status, d.dc_number as converted_to
      from public.pending_dc_scans s
      left join public.delivery_challans d on d.id = s.dc_id
     where s.id = any(coalesce(p_scan_ids, '{}'))
       for update of s
  loop
    if v_scan.status <> 'pending' then
      raise exception 'SCAN_NOT_PENDING:%', coalesce(v_scan.converted_to, v_scan.status);
    end if;
  end loop;

  -- Every line a follow-up row continues must exist.
  select count(*) into v_missing
    from (
      select distinct (e->>'parent_item_id')::uuid as parent_id
        from jsonb_array_elements(p_items) e
       where nullif(e->>'parent_item_id', '') is not null
    ) wanted
   where not exists (select 1 from public.delivery_challan_items i where i.id = wanted.parent_id);
  if v_missing > 0 then
    raise exception 'PARENT_LINE_MISSING';
  end if;

  -- Follow-up rows against each original line, checked under a lock on that
  -- line so two saves against the same lot run one after the other. Room is
  -- what was received, less the line's own outward and everything already on
  -- its follow-ups (drafts included, as they have booked it), leaving out the
  -- challan being edited, whose rows these replace.
  for v_check in
    with recursive asked as (
      select (e->>'parent_item_id')::uuid as parent_id,
             coalesce((e->>'sent_qty')::numeric, 0)
               + coalesce((e->>'material_problem_qty')::numeric, 0)
               + coalesce((e->>'rejection_qty')::numeric, 0) as outward
        from jsonb_array_elements(p_items) e
       where nullif(e->>'parent_item_id', '') is not null
    ),
    up(start_id, id, parent_item_id, depth) as (
      select i.id, i.id, i.parent_item_id, 0
        from public.delivery_challan_items i
       where i.id in (select parent_id from asked)
      union all
      select up.start_id, i.id, i.parent_item_id, up.depth + 1
        from up
        join public.delivery_challan_items i on i.id = up.parent_item_id
       where up.depth < 100
    )
    select up.id as root_id, sum(asked.outward) as asked
      from asked
      join up on up.start_id = asked.parent_id and up.parent_item_id is null
     group by up.id
     order by up.id
  loop
    select * into v_line from public.delivery_challan_items i where i.id = v_check.root_id for update;

    with recursive down(id) as (
      select i.id from public.delivery_challan_items i where i.parent_item_id = v_check.root_id
      union
      select i.id from public.delivery_challan_items i join down on i.parent_item_id = down.id
    )
    select coalesce(sum(i.sent_qty + i.material_problem_qty + i.rejection_qty), 0) into v_used
      from public.delivery_challan_items i
     where i.id in (select id from down)
       and (p_dc_id is null or i.dc_id <> p_dc_id);

    v_room := v_line.received_qty
      - (v_line.sent_qty + v_line.material_problem_qty + v_line.rejection_qty)
      - v_used;

    if v_check.asked > v_room then
      raise exception 'OVER_DISPATCH:%|%|%', v_line.component, greatest(v_room, 0), v_check.asked;
    end if;
  end loop;

  if p_dc_id is null then
    -- The challan every continued line belongs to, when they share one.
    select array_agg(distinct i.dc_id) into v_parent_dcs
      from public.delivery_challan_items i
     where i.id in (
       select (e->>'parent_item_id')::uuid
         from jsonb_array_elements(p_items) e
        where nullif(e->>'parent_item_id', '') is not null
     );

    -- Saved as Active: saving our challan is issuing it. The number comes
    -- from the insert trigger, inside this transaction.
    insert into public.delivery_challans (
      customer_id, dc_date, customer_dc_number, customer_dc_date, authorized_by,
      status, parent_dc_id, request_key, created_by
    )
    values (
      (p_header->>'customer_id')::uuid,
      coalesce(nullif(p_header->>'dc_date', '')::date, current_date),
      (select array_agg(value) from jsonb_array_elements_text(p_header->'customer_dc_number')),
      (select array_agg(nullif(value, '')::date) from jsonb_array_elements_text(p_header->'customer_dc_date')),
      nullif(p_header->>'authorized_by', ''),
      'active',
      case when coalesce(array_length(v_parent_dcs, 1), 0) = 1 then v_parent_dcs[1] end,
      p_request_key,
      auth.uid()
    )
    returning * into v_dc;
  else
    select * into v_dc from public.delivery_challans c where c.id = p_dc_id for update;
    if not found then
      raise exception 'DC_NOT_FOUND';
    end if;

    -- Number and status are never changed by an edit.
    update public.delivery_challans c
       set customer_id = (p_header->>'customer_id')::uuid,
           dc_date = coalesce(nullif(p_header->>'dc_date', '')::date, c.dc_date),
           customer_dc_number = (select array_agg(value) from jsonb_array_elements_text(p_header->'customer_dc_number')),
           customer_dc_date = (select array_agg(nullif(value, '')::date) from jsonb_array_elements_text(p_header->'customer_dc_date')),
           authorized_by = nullif(p_header->>'authorized_by', '')
     where c.id = p_dc_id
    returning * into v_dc;
  end if;

  -- Lines. An edited line keeps its id, which is what follow-ups point at.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select p.id into v_component_id
      from public.dc_picklist_items p
     where p.kind = 'component'
       and lower(btrim(p.name)) = lower(btrim(v_item->>'component'))
     limit 1;

    v_item_id := nullif(v_item->>'id', '')::uuid;

    if p_dc_id is not null and v_item_id is not null
       and exists (select 1 from public.delivery_challan_items i where i.id = v_item_id and i.dc_id = v_dc.id) then
      update public.delivery_challan_items i
         set component = v_item->>'component',
             component_id = v_component_id,
             material = nullif(v_item->>'material', ''),
             received_qty = coalesce((v_item->>'received_qty')::numeric, 0),
             sent_qty = coalesce((v_item->>'sent_qty')::numeric, 0),
             material_problem_qty = coalesce((v_item->>'material_problem_qty')::numeric, 0),
             rejection_qty = coalesce((v_item->>'rejection_qty')::numeric, 0),
             parent_item_id = nullif(v_item->>'parent_item_id', '')::uuid,
             sort_order = v_index
       where i.id = v_item_id;
    else
      insert into public.delivery_challan_items (
        dc_id, parent_item_id, component, component_id, material,
        received_qty, sent_qty, material_problem_qty, rejection_qty, sort_order
      )
      values (
        v_dc.id,
        nullif(v_item->>'parent_item_id', '')::uuid,
        v_item->>'component',
        v_component_id,
        nullif(v_item->>'material', ''),
        coalesce((v_item->>'received_qty')::numeric, 0),
        coalesce((v_item->>'sent_qty')::numeric, 0),
        coalesce((v_item->>'material_problem_qty')::numeric, 0),
        coalesce((v_item->>'rejection_qty')::numeric, 0),
        v_index
      )
      returning id into v_item_id;
    end if;

    v_keep := v_keep || v_item_id;
    v_index := v_index + 1;
  end loop;

  if p_dc_id is not null then
    -- A line already billed on an invoice cannot be removed (0025).
    for v_billed in
      select i.component
        from public.delivery_challan_items i
       where i.dc_id = v_dc.id and not (i.id = any(v_keep))
         and exists (select 1 from public.invoice_item_sources s where s.dc_item_id = i.id)
    loop
      raise exception 'BILLED_LINE_REMOVED:%', v_billed.component;
    end loop;

    -- Lines removed on the form. One with follow-ups is refused by its
    -- foreign key, and the whole edit rolls back with it.
    delete from public.delivery_challan_items i
     where i.dc_id = v_dc.id and not (i.id = any(v_keep));

    -- An original line may not be cut below what its follow-ups already took.
    for v_check in
      select i.id, i.component,
             i.received_qty - (i.sent_qty + i.material_problem_qty + i.rejection_qty) as own_left
        from public.delivery_challan_items i
       where i.dc_id = v_dc.id and i.parent_item_id is null
         and exists (select 1 from public.delivery_challan_items c where c.parent_item_id = i.id)
    loop
      with recursive down(id) as (
        select i.id from public.delivery_challan_items i where i.parent_item_id = v_check.id
        union
        select i.id from public.delivery_challan_items i join down on i.parent_item_id = down.id
      )
      select coalesce(sum(i.sent_qty + i.material_problem_qty + i.rejection_qty), 0) into v_used
        from public.delivery_challan_items i
       where i.id in (select id from down);

      if v_check.own_left - v_used < 0 then
        raise exception 'BELOW_FOLLOW_UPS:%|%', v_check.component, v_used;
      end if;
    end loop;
  end if;

  -- A line may not have less sent than issued invoices have billed (0025).
  for v_billed in
    select i.component, sum(s.quantity) as billed
      from public.delivery_challan_items i
      join public.invoice_item_sources s on s.dc_item_id = i.id
      join public.invoices inv on inv.id = s.invoice_id and inv.status = 'issued'
     where i.dc_id = v_dc.id
     group by i.id, i.component, i.sent_qty
    having sum(s.quantity) > i.sent_qty
  loop
    raise exception 'BELOW_BILLED:%|%', v_billed.component, v_billed.billed;
  end loop;

  update public.pending_dc_scans s
     set status = 'converted', dc_id = v_dc.id, converted_at = now()
   where s.id = any(coalesce(p_scan_ids, '{}'));

  perform set_config('app.dc_save', '', true);
  return query select v_dc.id, v_dc.dc_number, false;
end;
$$;

select
  (select count(*)::int from public.delivery_challans) as challans_kept,
  (select count(*)::int from public.delivery_challan_items) as lines_kept,
  (select count(*)::int from public.invoices) as invoices,
  public.peek_dc_number() as next_dc_number,
  public.peek_invoice_number() as next_invoice_number,
  to_regprocedure('public.create_invoice(uuid, uuid, date, jsonb, jsonb, jsonb)') is not null as create_invoice_exists,
  to_regprocedure('public.save_invoice(uuid, jsonb, jsonb, jsonb)') is null as per_dc_save_removed,
  not exists (
    select 1 from pg_indexes
     where tablename = 'invoices' and indexdef ilike '%unique%' and indexdef ilike '%billing_month%'
  ) as no_unique_customer_month;
