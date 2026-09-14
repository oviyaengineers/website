-- Stage 2: billing built on the delivery challan lines.
--
-- The DC line stays the only record of quantity. An invoice line bills part
-- or all of one DC line's Sent quantity and keeps a permanent link to it.
-- Billed quantity is never stored: it is the sum of that line's quantity on
-- issued invoices, so cancelling an invoice frees it at once and there is no
-- second quantity system to drift.
--
-- Additive. No delivery challan, challan line or DC number is changed. The
-- invoice tables are empty, so no invoice number exists to preserve.
--
--   company_billing_settings  seller details, entered by the business (empty)
--   customers.state           decides CGST+SGST or IGST
--   component_rates           default rate per component + material
--   invoice_number_series     INV/26-27/001, separate from DC numbering
--   invoices, invoice_items   status, tax split, snapshots, DC line link
--   dc_line_billing           billable / billed / unbilled per DC line
--   save_invoice              the only way to create an invoice (atomic)
--   cancel_invoice            issued -> cancelled, number kept
--   guards                    no delete, no renumber, writes only via the save
--   save_delivery_challan     refuses to cut or remove billed quantity

-- ---------------------------------------------------------------------------
-- Seller details. One row, created empty: nothing here is guessed.
create table if not exists public.company_billing_settings (
  id boolean primary key default true check (id),
  legal_name text,
  address text,
  state text,
  gstin text,
  phone text,
  email text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_branch text,
  default_hsn_sac text,
  default_gst_rate numeric(5,2) check (default_gst_rate is null or (default_gst_rate >= 0 and default_gst_rate <= 100)),
  payment_terms text,
  authorized_signatory text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.company_billing_settings (id) values (true) on conflict (id) do nothing;
alter table public.company_billing_settings enable row level security;
drop policy if exists "company_billing_settings_select_authenticated" on public.company_billing_settings;
create policy "company_billing_settings_select_authenticated"
  on public.company_billing_settings for select to authenticated using (true);
drop policy if exists "company_billing_settings_update_admin" on public.company_billing_settings;
create policy "company_billing_settings_update_admin"
  on public.company_billing_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.company_billing_settings from anon;

-- ---------------------------------------------------------------------------
-- The customer's state decides intra-state (CGST+SGST) or inter-state (IGST).
alter table public.customers add column if not exists state text;

-- ---------------------------------------------------------------------------
-- Rate list: one default rate per component and material, per piece.
create table if not exists public.component_rates (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.dc_picklist_items(id) on delete restrict,
  -- The material's name as on the challan line; '' means the component with no material.
  material text not null default '',
  rate numeric(14,2) not null check (rate >= 0),
  hsn_sac text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (component_id, material)
);
alter table public.component_rates enable row level security;
drop policy if exists "component_rates_select_authenticated" on public.component_rates;
create policy "component_rates_select_authenticated"
  on public.component_rates for select to authenticated using (true);
drop policy if exists "component_rates_insert_admin" on public.component_rates;
create policy "component_rates_insert_admin"
  on public.component_rates for insert to authenticated with check (public.is_admin());
drop policy if exists "component_rates_update_admin" on public.component_rates;
create policy "component_rates_update_admin"
  on public.component_rates for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "component_rates_delete_admin" on public.component_rates;
create policy "component_rates_delete_admin"
  on public.component_rates for delete to authenticated using (public.is_admin());
revoke all on public.component_rates from anon;

-- ---------------------------------------------------------------------------
-- Invoice numbering, independent of DC numbering: INV/26-27/001.
create table if not exists public.invoice_number_series (
  id boolean primary key default true check (id),
  prefix text not null default 'INV/',
  fy_label text not null,
  padding int not null default 3 check (padding between 1 and 8),
  next_serial int not null default 1 check (next_serial >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.invoice_number_series (id, fy_label)
values (true, public.financial_year_label())
on conflict (id) do nothing;
alter table public.invoice_number_series enable row level security;
drop policy if exists "invoice_number_series_select_authenticated" on public.invoice_number_series;
create policy "invoice_number_series_select_authenticated"
  on public.invoice_number_series for select to authenticated using (true);
drop policy if exists "invoice_number_series_update_admin" on public.invoice_number_series;
create policy "invoice_number_series_update_admin"
  on public.invoice_number_series for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.invoice_number_series from anon;

create or replace function public.format_invoice_number(p_prefix text, p_fy text, p_serial int, p_padding int)
returns text
language sql
immutable
set search_path = public
as $fmt$
  select p_prefix || p_fy || '/' || lpad(p_serial::text, p_padding, '0');
$fmt$;

-- Next number WITHOUT consuming it, for the preview on the invoice form.
create or replace function public.peek_invoice_number()
returns text
language sql
stable
security definer set search_path = public
as $peek$
  select public.format_invoice_number(prefix, fy_label, next_serial, padding)
    from public.invoice_number_series
   where id;
$peek$;

-- Allocates the next number under a row lock, stepping past any number
-- already on an invoice. Called only by the insert trigger, inside the save.
create or replace function public.generate_invoice_number()
returns text
language plpgsql
security definer set search_path = public
as $gen$
declare
  v_row public.invoice_number_series;
  v_candidate text;
begin
  select * into v_row from public.invoice_number_series where id for update;
  if not found then
    raise exception 'INVOICE_SERIES_MISSING';
  end if;

  loop
    v_candidate := public.format_invoice_number(v_row.prefix, v_row.fy_label, v_row.next_serial, v_row.padding);
    exit when not exists (select 1 from public.invoices where invoice_number = v_candidate);
    v_row.next_serial := v_row.next_serial + 1;
  end loop;

  update public.invoice_number_series
     set next_serial = v_row.next_serial + 1, updated_at = now()
   where id;

  return v_candidate;
end;
$gen$;

-- ---------------------------------------------------------------------------
-- Invoices: status, tax split and the details as they were when issued.
alter table public.invoices
  add column if not exists status text not null default 'issued',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancel_reason text,
  add column if not exists request_key uuid,
  add column if not exists tax_type text,
  add column if not exists place_of_supply text,
  add column if not exists taxable_value numeric(14,2) not null default 0,
  add column if not exists other_charges numeric(14,2) not null default 0,
  add column if not exists cgst_rate numeric(5,2) not null default 0,
  add column if not exists sgst_rate numeric(5,2) not null default 0,
  add column if not exists igst_rate numeric(5,2) not null default 0,
  add column if not exists cgst_amount numeric(14,2) not null default 0,
  add column if not exists sgst_amount numeric(14,2) not null default 0,
  add column if not exists igst_amount numeric(14,2) not null default 0,
  add column if not exists seller_snapshot jsonb,
  add column if not exists buyer_snapshot jsonb;

do $c$
begin
  alter table public.invoices add constraint invoices_status_check check (status in ('issued', 'cancelled'));
exception when duplicate_object then null;
end $c$;
do $c$
begin
  alter table public.invoices add constraint invoices_tax_type_check check (tax_type is null or tax_type in ('intra', 'inter'));
exception when duplicate_object then null;
end $c$;
do $c$
begin
  alter table public.invoices add constraint invoices_money_not_negative
    check (discount >= 0 and amount_paid >= 0 and subtotal >= 0 and grand_total >= 0);
exception when duplicate_object then null;
end $c$;

create unique index if not exists invoices_request_key_key
  on public.invoices (request_key) where request_key is not null;
create index if not exists invoices_invoice_date_idx on public.invoices (invoice_date);

-- ---------------------------------------------------------------------------
-- Invoice lines: DC work linked to its DC line, or a separate other charge.
alter table public.invoice_items
  add column if not exists line_type text not null default 'charge',
  add column if not exists dc_item_id uuid references public.delivery_challan_items(id) on delete restrict,
  add column if not exists component_id uuid references public.dc_picklist_items(id) on delete set null,
  add column if not exists material text,
  add column if not exists hsn_sac text,
  add column if not exists list_rate numeric(14,2);

do $c$
begin
  alter table public.invoice_items add constraint invoice_items_line_type_check check (line_type in ('dc_work', 'charge'));
exception when duplicate_object then null;
end $c$;
do $c$
begin
  alter table public.invoice_items add constraint invoice_items_dc_link_check
    check ((line_type = 'dc_work') = (dc_item_id is not null));
exception when duplicate_object then null;
end $c$;
do $c$
begin
  alter table public.invoice_items add constraint invoice_items_values_check
    check (quantity > 0 and unit_price >= 0 and amount >= 0);
exception when duplicate_object then null;
end $c$;

create index if not exists invoice_items_dc_item_id_idx on public.invoice_items (dc_item_id);

-- ---------------------------------------------------------------------------
-- Billing per DC line. Billable is Sent, once the challan is issued; billed
-- counts issued invoices only.
create or replace view public.dc_line_billing
with (security_invoker = true)
as
select
  i.id as dc_item_id,
  i.dc_id,
  d.customer_id,
  case when d.status::text = 'draft' then 0 else i.sent_qty end as billable_qty,
  coalesce(b.billed, 0) as billed_qty,
  (case when d.status::text = 'draft' then 0 else i.sent_qty end) - coalesce(b.billed, 0) as unbilled_qty
from public.delivery_challan_items i
join public.delivery_challans d on d.id = i.dc_id
left join lateral (
  select sum(ii.quantity) as billed
    from public.invoice_items ii
    join public.invoices inv on inv.id = ii.invoice_id
   where ii.dc_item_id = i.id and inv.status = 'issued'
) b on true;
revoke all on public.dc_line_billing from anon;
grant select on public.dc_line_billing to authenticated;

-- ---------------------------------------------------------------------------
-- Guards: invoices are written only by save_invoice / cancel_invoice.
create or replace function public.invoice_write_via_save()
returns boolean
language sql
stable
set search_path = public
as $allowed$
  select current_user not in ('authenticated', 'anon')
      or coalesce(current_setting('app.invoice_save', true), '') = 'on';
$allowed$;

create or replace function public.guard_invoice_write()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if tg_op = 'DELETE' then
    if current_user in ('authenticated', 'anon') then
      raise exception 'INVOICE_DELETE_NOT_ALLOWED: % is kept; cancel it instead', old.invoice_number
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.invoice_number is distinct from old.invoice_number then
    raise exception 'INVOICE_NUMBER_IMMUTABLE: % cannot be renumbered', old.invoice_number
      using errcode = '42501';
  end if;

  if public.invoice_write_via_save() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'payment_status' - 'amount_paid') = (to_jsonb(old) - 'payment_status' - 'amount_paid') then
    -- Recording a payment is the only direct change allowed.
    return new;
  end if;

  raise exception 'INVOICE_WRITE_VIA_SAVE_ONLY: invoices are issued and cancelled through their functions'
    using errcode = '42501';
end;
$guard$;

drop trigger if exists trg_guard_invoice_write on public.invoices;
create trigger trg_guard_invoice_write
  before insert or update or delete on public.invoices
  for each row execute function public.guard_invoice_write();

create or replace function public.guard_invoice_item_write()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if current_user in ('authenticated', 'anon')
     and (tg_op = 'DELETE' or not public.invoice_write_via_save()) then
    raise exception 'INVOICE_WRITE_VIA_SAVE_ONLY: invoice lines cannot be changed once issued'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$guard$;

drop trigger if exists trg_guard_invoice_item_write on public.invoice_items;
create trigger trg_guard_invoice_item_write
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_invoice_item_write();

-- A billed challan cannot be reopened to draft: that would take its billed
-- quantity out of billable while invoices still bill it.
create or replace function public.guard_dc_reopen_billed()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if new.status::text = 'draft' and old.status::text <> 'draft'
     and exists (
       select 1
         from public.delivery_challan_items i
         join public.invoice_items ii on ii.dc_item_id = i.id
         join public.invoices inv on inv.id = ii.invoice_id and inv.status = 'issued'
        where i.dc_id = old.id
     ) then
    raise exception 'DC_BILLED_CANNOT_REOPEN: % is billed on an issued invoice', old.dc_number
      using errcode = '42501';
  end if;
  return new;
end;
$guard$;

drop trigger if exists trg_guard_dc_reopen_billed on public.delivery_challans;
create trigger trg_guard_dc_reopen_billed
  before update on public.delivery_challans
  for each row execute function public.guard_dc_reopen_billed();

-- ---------------------------------------------------------------------------
-- Issue an invoice in one transaction.
create or replace function public.save_invoice(
  p_request_key uuid,
  p_header jsonb,
  p_lines jsonb,
  p_charges jsonb default '[]'::jsonb
)
returns table (invoice_id uuid, invoice_number text, already_saved boolean)
language plpgsql
security invoker
set search_path = public
as $save$
declare
  v_inv public.invoices;
  v_settings public.company_billing_settings;
  v_customer public.customers;
  v_customer_id uuid;
  v_line record;
  v_item record;
  v_charge record;
  v_rows jsonb := '[]'::jsonb;
  v_charge_rows jsonb := '[]'::jsonb;
  v_requested int;
  v_found int;
  v_billed numeric;
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
  v_row jsonb;
begin
  -- Marks this transaction's writes as coming through the save.
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

  v_customer_id := nullif(p_header->>'customer_id', '')::uuid;
  select * into v_customer from public.customers c where c.id = v_customer_id;
  if v_customer_id is null or not found then
    raise exception 'INVOICE_NO_CUSTOMER';
  end if;

  if coalesce(jsonb_array_length(coalesce(p_lines, '[]'::jsonb)), 0)
     + coalesce(jsonb_array_length(coalesce(p_charges, '[]'::jsonb)), 0) = 0 then
    raise exception 'INVOICE_NO_LINES';
  end if;

  -- Seller and buyer details must be the business's own, entered in Settings.
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
  v_invoice_date := coalesce(nullif(p_header->>'invoice_date', '')::date, current_date);
  v_due_date := nullif(p_header->>'due_date', '')::date;
  if v_due_date is not null and v_due_date < v_invoice_date then
    raise exception 'DUE_BEFORE_INVOICE';
  end if;

  -- The same DC line twice on one invoice is refused rather than summed.
  select count(*), count(distinct e->>'dc_item_id') into v_requested, v_found
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e;
  if v_requested <> v_found then
    raise exception 'DUPLICATE_DC_LINE';
  end if;

  -- Lock every DC line being billed, in id order. A second invoice billing
  -- the same line waits here, then sees this one's quantity once committed.
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
           nullif(btrim(e->>'hsn_sac'), '') as hsn_sac
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(e, ord)
     order by t.ord
  loop
    select i.id, i.component, i.component_id, i.material, i.sent_qty,
           d.dc_number, d.customer_id, d.status::text as dc_status
      into v_item
      from public.delivery_challan_items i
      join public.delivery_challans d on d.id = i.dc_id
     where i.id = v_line.dc_item_id;
    if v_line.dc_item_id is null or v_item.id is null then
      raise exception 'DC_LINE_MISSING';
    end if;
    if v_item.customer_id <> v_customer_id then
      raise exception 'DC_OTHER_CUSTOMER:%', v_item.dc_number;
    end if;
    if v_item.dc_status = 'draft' then
      raise exception 'DC_NOT_ISSUED:%', v_item.dc_number;
    end if;
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'QUANTITY_INVALID:%|%', v_item.component, v_item.dc_number;
    end if;
    if v_line.rate is null or v_line.rate < 0 then
      raise exception 'RATE_INVALID:%|%', v_item.component, v_item.dc_number;
    end if;

    -- Unbilled Sent, read after the lock.
    select coalesce(sum(ii.quantity), 0) into v_billed
      from public.invoice_items ii
      join public.invoices inv on inv.id = ii.invoice_id
     where ii.dc_item_id = v_item.id and inv.status = 'issued';
    if v_line.quantity > v_item.sent_qty - v_billed then
      raise exception 'OVER_BILLING:%|%|%|%', v_item.component, v_item.dc_number,
        greatest(v_item.sent_qty - v_billed, 0), v_line.quantity;
    end if;

    select r.rate, r.hsn_sac into v_list_rate, v_hsn
      from public.component_rates r
     where r.component_id = v_item.component_id and r.material = coalesce(v_item.material, '');
    v_hsn := coalesce(v_line.hsn_sac, v_hsn, nullif(btrim(v_settings.default_hsn_sac), ''));
    if v_hsn is null then
      raise exception 'HSN_MISSING:%', v_item.component;
    end if;

    v_amount := round(v_line.quantity * v_line.rate, 2);
    v_work := v_work + v_amount;
    v_rows := v_rows || jsonb_build_object(
      'dc_item_id', v_item.id, 'description', v_item.component, 'component_id', v_item.component_id,
      'material', v_item.material, 'quantity', v_line.quantity, 'rate', v_line.rate,
      'amount', v_amount, 'hsn_sac', v_hsn, 'list_rate', v_list_rate
    );
    v_list_rate := null;
    v_hsn := null;
  end loop;

  -- Other charges: separate lines, never linked to a DC line.
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

  -- The number comes from the insert trigger, inside this transaction.
  insert into public.invoices (
    customer_id, invoice_date, due_date, subtotal, gst_rate, gst_amount, discount, grand_total,
    notes, created_by, status, request_key, tax_type, place_of_supply, taxable_value, other_charges,
    cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
    seller_snapshot, buyer_snapshot
  )
  values (
    v_customer_id, v_invoice_date, v_due_date, v_subtotal, v_gst_rate, v_cgst + v_sgst + v_igst,
    v_discount, v_taxable + v_cgst + v_sgst + v_igst,
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

  for v_row in select value from jsonb_array_elements(v_rows)
  loop
    insert into public.invoice_items (
      invoice_id, line_type, dc_item_id, description, component_id, material,
      quantity, unit, unit_price, amount, hsn_sac, list_rate, sort_order
    )
    values (
      v_inv.id, 'dc_work', (v_row->>'dc_item_id')::uuid, v_row->>'description',
      nullif(v_row->>'component_id', '')::uuid, nullif(v_row->>'material', ''),
      (v_row->>'quantity')::numeric, 'nos', (v_row->>'rate')::numeric, (v_row->>'amount')::numeric,
      v_row->>'hsn_sac', nullif(v_row->>'list_rate', '')::numeric, v_index
    );
    v_index := v_index + 1;
  end loop;

  for v_row in select value from jsonb_array_elements(v_charge_rows)
  loop
    insert into public.invoice_items (
      invoice_id, line_type, description, quantity, unit, unit_price, amount, hsn_sac, sort_order
    )
    values (
      v_inv.id, 'charge', v_row->>'description', 1, 'charge', (v_row->>'amount')::numeric,
      (v_row->>'amount')::numeric, nullif(v_row->>'hsn_sac', ''), v_index
    );
    v_index := v_index + 1;
  end loop;

  -- The flag ends with the save, so nothing after it in the same transaction
  -- is treated as coming through it.
  perform set_config('app.invoice_save', '', true);
  return query select v_inv.id, v_inv.invoice_number, false;
end;
$save$;

-- Cancel an issued invoice. The number stays reserved; its quantity is freed.
create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security invoker
set search_path = public
as $cancel$
declare
  v_inv public.invoices;
begin
  perform set_config('app.invoice_save', 'on', true);

  if not public.is_admin() then
    raise exception 'CANCEL_ADMIN_ONLY';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'CANCEL_REASON_REQUIRED';
  end if;

  select * into v_inv from public.invoices i where i.id = p_invoice_id for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND';
  end if;
  if v_inv.status = 'cancelled' then
    raise exception 'INVOICE_ALREADY_CANCELLED:%', v_inv.invoice_number;
  end if;

  update public.invoices i
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where i.id = p_invoice_id;

  perform set_config('app.invoice_save', '', true);
  return query select v_inv.id, v_inv.invoice_number;
end;
$cancel$;

revoke all on function public.save_invoice(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_invoice(uuid, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.cancel_invoice(uuid, text) from public, anon;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;
revoke execute on function public.peek_invoice_number() from public, anon;
grant execute on function public.peek_invoice_number() to authenticated, service_role;
revoke execute on function public.format_invoice_number(text, text, int, int) from public, anon;
grant execute on function public.format_invoice_number(text, text, int, int) to authenticated, service_role;
revoke execute on function public.generate_invoice_number() from public, anon;
grant execute on function public.generate_invoice_number() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Stage 1 save, unchanged from 0024 apart from refusing to cut or remove
-- quantity already billed.
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
         and exists (select 1 from public.invoice_items ii where ii.dc_item_id = i.id)
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
    select i.component, sum(ii.quantity) as billed
      from public.delivery_challan_items i
      join public.invoice_items ii on ii.dc_item_id = i.id
      join public.invoices inv on inv.id = ii.invoice_id and inv.status = 'issued'
     where i.dc_id = v_dc.id
     group by i.id, i.component, i.sent_qty
    having sum(ii.quantity) > i.sent_qty
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
  public.peek_dc_number() as next_dc_number,
  public.peek_invoice_number() as next_invoice_number,
  (select count(*)::int from public.invoices) as invoices,
  to_regprocedure('public.save_invoice(uuid, jsonb, jsonb, jsonb)') is not null as save_invoice_exists;
