-- Stage 2: GST Bill ON/OFF for each invoice, with two independent number series.
--
--   GST Bill ON   GST tax invoice  INV/26-27/001, INV/26-27/002 ...  CGST+SGST or IGST
--   GST Bill OFF  normal bill      BILL/26-27/001, BILL/26-27/002 ... no tax at all
--
-- The choice is stored on the invoice (gst_bill), never inferred from a zero
-- tax amount, and like every other issued field it cannot be changed: cancel
-- and create a new one. The monthly billing model, the DC-line allocations and
-- the locking against double billing are unchanged, and apply to both types.
--
-- No delivery challan, challan line, DC number or scan is changed. There are
-- no invoices yet; any invoice issued before 0027 was a GST tax invoice.

-- ---------------------------------------------------------------------------
-- Invoice type, and tax figures that must agree with it.
alter table public.invoices add column if not exists gst_bill boolean;
update public.invoices set gst_bill = true where gst_bill is null;
alter table public.invoices alter column gst_bill set not null;

alter table public.invoices drop constraint if exists invoices_gst_bill_tax_check;
alter table public.invoices add constraint invoices_gst_bill_tax_check check (
  case when gst_bill then
    -- "is not null" first: a bare IN on a null tax type is NULL, which a check would let through.
    tax_type is not null and tax_type in ('intra', 'inter')
    and gst_amount = cgst_amount + sgst_amount + igst_amount
    and grand_total = taxable_value + gst_amount
    and (
      (tax_type = 'intra' and igst_rate = 0 and igst_amount = 0)
      or (tax_type = 'inter' and cgst_rate = 0 and sgst_rate = 0 and cgst_amount = 0 and sgst_amount = 0)
    )
  else
    tax_type is null and place_of_supply is null
    and gst_rate = 0 and gst_amount = 0
    and cgst_rate = 0 and sgst_rate = 0 and igst_rate = 0
    and cgst_amount = 0 and sgst_amount = 0 and igst_amount = 0
    and grand_total = taxable_value
  end
);
alter table public.invoices drop constraint if exists invoices_taxable_value_check;
alter table public.invoices add constraint invoices_taxable_value_check
  check (taxable_value = subtotal - discount);

-- ---------------------------------------------------------------------------
-- Two series, one row each, keyed by kind instead of the single-row flag.
alter table public.invoice_number_series add column if not exists kind text;
update public.invoice_number_series set kind = 'gst' where kind is null;
alter table public.invoice_number_series alter column kind set not null;
alter table public.invoice_number_series drop constraint if exists invoice_number_series_pkey;
alter table public.invoice_number_series drop column if exists id;
alter table public.invoice_number_series add constraint invoice_number_series_pkey primary key (kind);

alter table public.invoice_number_series drop constraint if exists invoice_number_series_kind_check;
alter table public.invoice_number_series add constraint invoice_number_series_kind_check
  check (kind in ('gst', 'non_gst'));
-- Capital letters then "/", and a year label without "/": two different
-- prefixes can then never produce the same number, so the series stay apart.
alter table public.invoice_number_series drop constraint if exists invoice_number_series_prefix_check;
alter table public.invoice_number_series add constraint invoice_number_series_prefix_check
  check (prefix ~ '^[A-Z]{1,10}/$');
alter table public.invoice_number_series drop constraint if exists invoice_number_series_fy_label_check;
alter table public.invoice_number_series add constraint invoice_number_series_fy_label_check
  check (fy_label ~ '^[A-Za-z0-9-]{2,12}$');
create unique index if not exists invoice_number_series_prefix_key
  on public.invoice_number_series (prefix);

insert into public.invoice_number_series (kind, prefix, fy_label, padding, next_serial)
select 'non_gst', 'BILL/', s.fy_label, s.padding, 1
  from public.invoice_number_series s
 where s.kind = 'gst'
on conflict (kind) do nothing;

-- Allocates the next number of one series under its row lock, stepping past
-- any number already on an invoice (issued or cancelled). Only the insert
-- trigger calls it, inside the save, so a failed save gives the number back.
create or replace function public.generate_bill_number(p_gst_bill boolean)
returns text
language plpgsql
security definer set search_path = public
as $gen$
declare
  v_kind text := case when p_gst_bill then 'gst' else 'non_gst' end;
  v_row public.invoice_number_series;
  v_candidate text;
begin
  if p_gst_bill is null then
    raise exception 'GST_BILL_CHOICE_MISSING';
  end if;
  select * into v_row from public.invoice_number_series s where s.kind = v_kind for update;
  if not found then
    raise exception 'INVOICE_SERIES_MISSING:%', v_kind;
  end if;

  loop
    v_candidate := public.format_invoice_number(v_row.prefix, v_row.fy_label, v_row.next_serial, v_row.padding);
    exit when not exists (select 1 from public.invoices where invoice_number = v_candidate);
    v_row.next_serial := v_row.next_serial + 1;
  end loop;

  update public.invoice_number_series s
     set next_serial = v_row.next_serial + 1, updated_at = now()
   where s.kind = v_kind;

  return v_candidate;
end;
$gen$;

-- The number always comes from the series of the invoice's own type.
create or replace function public.set_invoice_number()
returns trigger
language plpgsql
security definer set search_path = public
as $set$
begin
  if new.gst_bill is null then
    raise exception 'GST_BILL_CHOICE_MISSING';
  end if;
  new.invoice_number := public.generate_bill_number(new.gst_bill);
  return new;
end;
$set$;

-- The single-series generator read the old single-row flag and could be
-- called directly; the per-type generator replaces it.
drop function if exists public.generate_invoice_number();

-- Next number of a series WITHOUT consuming it, for the invoice form preview.
create or replace function public.peek_bill_number(p_gst_bill boolean)
returns text
language sql
stable
security definer set search_path = public
as $peek$
  select public.format_invoice_number(s.prefix, s.fy_label, s.next_serial, s.padding)
    from public.invoice_number_series s
   where s.kind = case when p_gst_bill then 'gst' else 'non_gst' end;
$peek$;

-- Kept for existing callers: the GST tax invoice series.
create or replace function public.peek_invoice_number()
returns text
language sql
stable
security definer set search_path = public
as $peek$
  select public.peek_bill_number(true);
$peek$;

revoke all on function public.generate_bill_number(boolean) from public, anon, authenticated;
grant execute on function public.generate_bill_number(boolean) to service_role;
revoke all on function public.peek_bill_number(boolean) from public, anon;
grant execute on function public.peek_bill_number(boolean) to authenticated, service_role;
revoke execute on function public.peek_invoice_number() from public, anon;
grant execute on function public.peek_invoice_number() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Month totals, now also counting GST invoices and normal bills separately.
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
         coalesce(sum(amount_paid) filter (where status = 'issued'), 0) as paid_total,
         count(*) filter (where status = 'issued' and gst_bill) as issued_gst_invoices,
         count(*) filter (where status = 'issued' and not gst_bill) as issued_non_gst_invoices
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
  coalesce(v.paid_total, 0) as paid_total,
  coalesce(v.issued_gst_invoices, 0) as issued_gst_invoices,
  coalesce(v.issued_non_gst_invoices, 0) as issued_non_gst_invoices
from lines l
full join inv v on v.customer_id = l.customer_id and v.billing_month = l.billing_month;
revoke all on public.customer_month_billing from anon;
grant select on public.customer_month_billing to authenticated;

-- ---------------------------------------------------------------------------
-- Create a GST tax invoice or a normal bill for one customer and one billing month.
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
  v_gst_bill boolean;
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

  -- GST Bill ON or OFF is chosen for each invoice and never assumed.
  if coalesce(lower(btrim(p_header->>'gst_bill')), '') not in ('true', 'false') then
    raise exception 'GST_BILL_CHOICE_MISSING';
  end if;
  v_gst_bill := lower(btrim(p_header->>'gst_bill')) = 'true';

  select * into v_settings from public.company_billing_settings s where s.id;
  if not found or nullif(btrim(v_settings.legal_name), '') is null then
    raise exception 'SETTINGS_MISSING:company legal name';
  end if;
  -- GSTIN, both states and the GST rate are needed only for a GST bill. A
  -- normal bill carries no tax, so any GST rate sent with it is ignored.
  if v_gst_bill then
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
  else
    v_gst_rate := 0;
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
    if v_hsn is null and v_gst_bill then
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

  v_intra := v_gst_bill and lower(regexp_replace(btrim(v_customer.state), '\s+', ' ', 'g'))
           = lower(regexp_replace(btrim(v_settings.state), '\s+', ' ', 'g'));
  if not v_gst_bill then
    null; -- a normal bill: no CGST, SGST or IGST
  elsif v_intra then
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
    seller_snapshot, buyer_snapshot, gst_bill
  )
  values (
    p_customer_id, p_billing_month, v_invoice_date, v_due_date, v_subtotal, v_gst_rate,
    v_cgst + v_sgst + v_igst, v_discount, v_taxable + v_cgst + v_sgst + v_igst,
    nullif(btrim(p_header->>'notes'), ''), auth.uid(), 'issued', p_request_key,
    case when not v_gst_bill then null when v_intra then 'intra' else 'inter' end,
    case when v_gst_bill then v_customer.state end, v_taxable, v_charges,
    v_cgst_rate, v_sgst_rate, v_igst_rate, v_cgst, v_sgst, v_igst,
    to_jsonb(v_settings) - 'id' - 'updated_at' - 'updated_by',
    jsonb_build_object(
      'name', v_customer.name, 'address', v_customer.address, 'state', v_customer.state,
      'gstin', v_customer.gst_number, 'phone', v_customer.phone, 'email', v_customer.email
    ),
    v_gst_bill
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

select
  (select count(*)::int from public.delivery_challans) as challans_kept,
  (select count(*)::int from public.delivery_challan_items) as lines_kept,
  (select count(*)::int from public.invoices) as invoices,
  public.peek_dc_number() as next_dc_number,
  public.peek_bill_number(true) as next_gst_invoice,
  public.peek_bill_number(false) as next_normal_bill,
  to_regprocedure('public.generate_invoice_number()') is null as single_series_generator_removed,
  (select count(*)::int from public.invoice_number_series) as series_rows;
