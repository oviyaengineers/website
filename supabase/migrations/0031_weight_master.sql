-- Weight / Scrap Master (Stage 3, second step).
--
-- Rough and finished weight per piece now come from one master record per
-- Component + Material, kept by an admin under Settings. A DC line's weight/
-- scrap is recorded from the active master at that moment and never follows
-- the master afterwards: the recorded rough, finished and scrap per piece, the
-- Sent Qty they were worked out with, the scrap rate and the totals are all
-- stored on the record.
--
-- Decisions this follows:
--   1. A Sent Qty corrected on the DC after recording does not change the
--      recorded total. The record is flagged ("Sent Qty changed since weights
--      were saved") until an admin accepts the new Sent Qty for that record.
--   2. Master only: no rough or finished weight typed on a DC line.
--   3. A master edit never changes an existing record. There is no re-apply.
--   4. Every non-draft DC (dispatched, delivered, active, completed) appears.
--
-- Nothing here writes to a challan, a line, a quantity, a balance, a follow-up,
-- an invoice or an allocation. The live dc_line_weights table is empty; the
-- migration refuses to run if it is not, so no recorded result is ever
-- reinterpreted. Every new table sits behind the Weight / Scrap PIN (0030).

-- ---------------------------------------------------------------------------
-- 0. Safety: this changes what a dc_line_weights row means, so it only runs on
--    an empty table.
do $check$
begin
  if exists (select 1 from public.dc_line_weights) then
    raise exception 'MIGRATION_0031_WEIGHTS_EXIST: dc_line_weights has rows; stop and review';
  end if;
end;
$check$;

-- ---------------------------------------------------------------------------
-- 1. The master: one record per Component + Material.
create table if not exists public.weight_master (
  id uuid primary key default gen_random_uuid(),
  -- The component from Settings -> Components & Materials. Restrict: a
  -- component with a weight master cannot be deleted from the list.
  component_id uuid not null references public.dc_picklist_items(id) on delete restrict,
  -- The material name, as DC lines hold it. Matched ignoring case and spaces.
  material text not null,
  material_key text generated always as (lower(btrim(material))) stored,
  -- Both weights are entered in this unit and shown in it.
  unit text not null,
  -- Stored in grams, to 0.001 g.
  rough_weight_g numeric(14,3) not null,
  finished_weight_g numeric(14,3) not null,
  -- Worked out, never typed.
  scrap_weight_g numeric(14,3) generated always as (rough_weight_g - finished_weight_g) stored,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint weight_master_one_per_pair unique (component_id, material_key),
  constraint weight_master_material_present check (btrim(material) <> ''),
  constraint weight_master_unit check (unit in ('g', 'kg')),
  constraint weight_master_not_negative check (rough_weight_g >= 0 and finished_weight_g >= 0),
  -- Zero scrap is allowed; negative scrap is not.
  constraint weight_master_finished_within_rough check (finished_weight_g <= rough_weight_g),
  -- 10 tonnes a piece: far above any real part, and keeps totals in range.
  constraint weight_master_sane check (rough_weight_g <= 10000000)
);

-- History of every master change, written only by the trigger below.
create table if not exists public.weight_master_history (
  id bigint generated always as identity primary key,
  -- No foreign key: history outlives a deleted (never used) master.
  master_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists weight_master_history_master_idx
  on public.weight_master_history (master_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- 2. The recorded result on each DC line: new columns on dc_line_weights.
alter table public.dc_line_weights
  -- The master the weights were copied from. Restrict: a master that has been
  -- used can never be deleted, only made inactive.
  add column if not exists weight_master_id uuid
    references public.weight_master(id) on delete restrict,
  -- Recorded values, worked out from the recorded weights and Sent Qty.
  add column if not exists scrap_weight_g numeric(14,3)
    generated always as (rough_weight_g - finished_weight_g) stored,
  add column if not exists total_scrap_g numeric
    generated always as (round((rough_weight_g - finished_weight_g) * sent_qty_at_save, 3)) stored,
  add column if not exists scrap_value numeric
    generated always as (
      round((rough_weight_g - finished_weight_g) * sent_qty_at_save / 1000 * scrap_rate_per_kg, 2)
    ) stored,
  -- When an admin last accepted a changed Sent Qty for this record.
  add column if not exists sent_qty_accepted_at timestamptz,
  add column if not exists sent_qty_accepted_by uuid references public.profiles(id) on delete set null;

-- Every record now comes from a master and carries a rate. The table is
-- empty (checked above), so these apply to new records only.
alter table public.dc_line_weights alter column weight_master_id set not null;
alter table public.dc_line_weights alter column scrap_rate_per_kg set not null;
create index if not exists dc_line_weights_master_idx on public.dc_line_weights (weight_master_id);

-- ---------------------------------------------------------------------------
-- 3. Row-level security for the master: read with Weight unlocked; write as an
--    admin with Weight unlocked. History is read-only.
alter table public.weight_master enable row level security;
alter table public.weight_master_history enable row level security;

drop policy if exists "weight_master_select" on public.weight_master;
create policy "weight_master_select"
  on public.weight_master for select to authenticated
  using ((select public.module_unlocked('weight')));
drop policy if exists "weight_master_insert_admin" on public.weight_master;
create policy "weight_master_insert_admin"
  on public.weight_master for insert to authenticated
  with check (public.is_admin() and (select public.module_unlocked('weight')));
drop policy if exists "weight_master_update_admin" on public.weight_master;
create policy "weight_master_update_admin"
  on public.weight_master for update to authenticated
  using (public.is_admin() and (select public.module_unlocked('weight')))
  with check (public.is_admin() and (select public.module_unlocked('weight')));
drop policy if exists "weight_master_delete_admin" on public.weight_master;
create policy "weight_master_delete_admin"
  on public.weight_master for delete to authenticated
  using (public.is_admin() and (select public.module_unlocked('weight')));

drop policy if exists "weight_master_history_select" on public.weight_master_history;
create policy "weight_master_history_select"
  on public.weight_master_history for select to authenticated
  using ((select public.module_unlocked('weight')));

revoke all on public.weight_master from anon;
revoke all on public.weight_master_history from anon;
grant select, insert, update, delete on public.weight_master to authenticated;
revoke insert, update, delete, truncate on public.weight_master_history from authenticated;
grant select on public.weight_master_history to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Master guard: admin only, a real component and material, trimmed name,
--    audit columns set here. A used master cannot be deleted.
create or replace function public.guard_weight_master_write()
returns trigger
language plpgsql
-- Invoker, like 0029's guard: current_user must be the caller's role.
set search_path = public
as $guard$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'WEIGHT_ADMIN_ONLY: only an admin can change the weight master'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if exists (select 1 from public.dc_line_weights w where w.weight_master_id = old.id) then
      raise exception 'WEIGHT_MASTER_IN_USE: this master has been used; make it inactive instead';
    end if;
    return old;
  end if;

  new.material := btrim(new.material);
  if not exists (
    select 1 from public.dc_picklist_items p
     where p.id = new.component_id and p.kind = 'component'
  ) then
    raise exception 'WEIGHT_MASTER_BAD_COMPONENT';
  end if;
  if not exists (
    select 1 from public.dc_picklist_items p
     where p.kind = 'material' and lower(btrim(p.name)) = lower(new.material)
  ) then
    raise exception 'WEIGHT_MASTER_BAD_MATERIAL';
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$guard$;

drop trigger if exists trg_guard_weight_master_write on public.weight_master;
create trigger trg_guard_weight_master_write
  before insert or update or delete on public.weight_master
  for each row execute function public.guard_weight_master_write();

create or replace function public.record_weight_master_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $hist$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'updated_by') = (v_new - 'updated_at' - 'updated_by') then
    return null;
  end if;
  insert into public.weight_master_history (master_id, action, old_values, new_values, changed_by)
  values (coalesce(new.id, old.id), lower(tg_op), v_old, v_new, auth.uid());
  return null;
end;
$hist$;

drop trigger if exists trg_record_weight_master_history on public.weight_master;
create trigger trg_record_weight_master_history
  after insert or update or delete on public.weight_master
  for each row execute function public.record_weight_master_history();

-- ---------------------------------------------------------------------------
-- 5. Record guard, replacing 0029's. On INSERT the weights are copied from the
--    active master matching the line, whatever the caller sent. On UPDATE the
--    recorded weights, master and line are fixed; only the scrap rate may
--    change, and Sent-at-save only moves to the line's current Sent Qty when
--    an admin accepts it (sent_qty_accepted_at set in the same update).
create or replace function public.guard_dc_line_weight_write()
returns trigger
language plpgsql
set search_path = public
as $guard$
declare
  v_item public.delivery_challan_items;
  v_status text;
  v_master public.weight_master;
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'WEIGHT_ADMIN_ONLY: only an admin can change weight/scrap'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select i.* into v_item from public.delivery_challan_items i where i.id = new.dc_item_id;
  if not found then
    raise exception 'WEIGHT_LINE_NOT_FOUND';
  end if;
  select d.status::text into v_status from public.delivery_challans d where d.id = v_item.dc_id;
  if v_status = 'draft' then
    raise exception 'WEIGHT_DRAFT_DC: a draft challan has no weight/scrap';
  end if;

  if tg_op = 'INSERT' then
    select m.* into v_master
      from public.weight_master m
     where m.component_id = v_item.component_id
       and m.material_key = lower(btrim(coalesce(v_item.material, '')))
       and m.is_active;
    if not found then
      raise exception 'WEIGHT_NOT_CONFIGURED:%', v_item.component;
    end if;
    new.weight_master_id := v_master.id;
    new.rough_weight_g := v_master.rough_weight_g;
    new.finished_weight_g := v_master.finished_weight_g;
    new.rough_unit := v_master.unit;
    new.finished_unit := v_master.unit;
    new.sent_qty_at_save := v_item.sent_qty;
    new.sent_qty_accepted_at := null;
    new.sent_qty_accepted_by := null;
    new.created_at := now();
    new.created_by := auth.uid();
  else
    if new.dc_item_id <> old.dc_item_id
       or new.weight_master_id <> old.weight_master_id
       or new.rough_weight_g <> old.rough_weight_g
       or new.finished_weight_g <> old.finished_weight_g
       or new.rough_unit <> old.rough_unit
       or new.finished_unit <> old.finished_unit then
      raise exception 'WEIGHT_RECORD_FIXED: recorded weights cannot be changed';
    end if;
    if new.sent_qty_accepted_at is distinct from old.sent_qty_accepted_at then
      -- Accepting: only ever to the line's Sent Qty right now.
      new.sent_qty_at_save := v_item.sent_qty;
      new.sent_qty_accepted_at := now();
      new.sent_qty_accepted_by := auth.uid();
    else
      new.sent_qty_at_save := old.sent_qty_at_save;
      new.sent_qty_accepted_by := old.sent_qty_accepted_by;
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$guard$;

-- ---------------------------------------------------------------------------
-- 6. The save, replacing 0029's (same name and arguments). No weights are
--    accepted from the caller any more.
--
-- p_lines is an array of
--   { dc_item_id, scrap_rate }              record from the master, or change the rate
--   { dc_item_id, accept_sent_qty: true }   use the line's current Sent Qty
--   { dc_item_id, remove: true }            remove the record
create or replace function public.save_dc_line_weights(p_dc_id uuid, p_lines jsonb)
returns table (saved int, removed int)
language plpgsql
security invoker
set search_path = public
as $save$
declare
  v_status text;
  v_line jsonb;
  v_item public.delivery_challan_items;
  v_rate numeric;
  v_saved int := 0;
  v_removed int := 0;
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'WEIGHT_ADMIN_ONLY: only an admin can change weight/scrap'
      using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'WEIGHT_NO_LINES';
  end if;

  select d.status::text into v_status
    from public.delivery_challans d
   where d.id = p_dc_id
     for share;
  if not found then
    raise exception 'WEIGHT_DC_NOT_FOUND';
  end if;
  if v_status = 'draft' then
    raise exception 'WEIGHT_DRAFT_DC: a draft challan has no weight/scrap';
  end if;

  if (select count(*) from jsonb_array_elements(p_lines))
     <> (select count(distinct e->>'dc_item_id') from jsonb_array_elements(p_lines) e) then
    raise exception 'WEIGHT_DUPLICATE_LINE';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select i.* into v_item
      from public.delivery_challan_items i
     where i.id = nullif(v_line->>'dc_item_id', '')::uuid
       and i.dc_id = p_dc_id
       for share;
    if not found then
      raise exception 'WEIGHT_LINE_NOT_ON_DC';
    end if;

    if coalesce((v_line->>'remove')::boolean, false) then
      delete from public.dc_line_weights w where w.dc_item_id = v_item.id;
      get diagnostics v_count = row_count;
      v_removed := v_removed + v_count;
      continue;
    end if;

    if coalesce((v_line->>'accept_sent_qty')::boolean, false) then
      update public.dc_line_weights w
         set sent_qty_accepted_at = clock_timestamp()
       where w.dc_item_id = v_item.id;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception 'WEIGHT_NOT_RECORDED:%', v_item.component;
      end if;
      v_saved := v_saved + 1;
      continue;
    end if;

    begin
      v_rate := nullif(v_line->>'scrap_rate', '')::numeric;
    exception when others then
      raise exception 'WEIGHT_BAD_NUMBER:%', v_item.component;
    end;
    if v_rate is null then
      raise exception 'WEIGHT_RATE_MISSING:%', v_item.component;
    end if;
    if v_rate < 0 then
      raise exception 'WEIGHT_NEGATIVE:%', v_item.component;
    end if;

    -- An existing record only takes the new rate: its weights and Sent-at-save
    -- stay, even if its master has since changed or been made inactive.
    update public.dc_line_weights w
       set scrap_rate_per_kg = v_rate
     where w.dc_item_id = v_item.id;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      -- A new record: the guard fills the weights from the active master and
      -- refuses if there is none. The placeholders are never what is stored.
      insert into public.dc_line_weights
        (dc_item_id, weight_master_id, rough_weight_g, rough_unit,
         finished_weight_g, finished_unit, scrap_rate_per_kg)
      values
        (v_item.id, '00000000-0000-0000-0000-000000000000', 0, 'g', 0, 'g', v_rate);
    end if;
    v_saved := v_saved + 1;
  end loop;

  return query select v_saved, v_removed;
end;
$save$;

revoke all on function public.save_dc_line_weights(uuid, jsonb) from public, anon;
grant execute on function public.save_dc_line_weights(uuid, jsonb) to authenticated;
revoke execute on function public.guard_weight_master_write() from public, anon;
revoke execute on function public.record_weight_master_history() from public, anon;

-- ---------------------------------------------------------------------------
-- 7. One read for the Weight / Scrap screen: every line of every non-draft DC
--    with its recorded result, or the active master it would use, or neither.
--    security_invoker: the reader's own row-level security and PIN apply.
create or replace view public.dc_weight_lines
with (security_invoker = true)
as
select
  i.id as dc_item_id,
  d.id as dc_id,
  d.dc_number,
  d.dc_date,
  d.status::text as dc_status,
  d.customer_id,
  c.name as customer_name,
  i.component,
  i.component_id,
  i.material,
  i.sort_order,
  i.sent_qty,
  case
    when w.id is not null then 'recorded'
    when m.id is not null then 'pending'
    else 'not_configured'
  end as weight_state,
  -- Recorded result (null until recorded).
  w.id as weight_id,
  w.weight_master_id,
  w.rough_unit as recorded_unit,
  w.rough_weight_g as recorded_rough_g,
  w.finished_weight_g as recorded_finished_g,
  w.scrap_weight_g as recorded_scrap_g,
  w.sent_qty_at_save,
  w.scrap_rate_per_kg,
  w.total_scrap_g,
  w.scrap_value,
  w.updated_at as recorded_at,
  (w.id is not null and w.sent_qty_at_save <> i.sent_qty) as sent_qty_changed,
  -- The active master a pending line would use (null when not configured).
  m.id as master_id,
  m.unit as master_unit,
  m.rough_weight_g as master_rough_g,
  m.finished_weight_g as master_finished_g,
  m.scrap_weight_g as master_scrap_g
from public.delivery_challan_items i
join public.delivery_challans d on d.id = i.dc_id and d.status <> 'draft'
left join public.customers c on c.id = d.customer_id
left join public.dc_line_weights w on w.dc_item_id = i.id
left join public.weight_master m
  on w.id is null
 and m.component_id = i.component_id
 and m.material_key = lower(btrim(coalesce(i.material, '')))
 and m.is_active;

revoke all on public.dc_weight_lines from anon;
grant select on public.dc_weight_lines to authenticated;

select
  (select count(*) from public.weight_master)::int as masters,
  (select count(*) from public.dc_line_weights)::int as weights,
  (select count(*) from public.dc_weight_lines)::int as weight_lines;
