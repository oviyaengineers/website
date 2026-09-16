-- Weight and scrap for each delivery challan line (Stage 3).
--
-- A line's rough and finished weight per piece, entered in grams or kilograms,
-- and the scrap rate per kg typed by hand. Scrap per piece, total scrap and
-- scrap value are never stored: they are worked out from these and the line's
-- own current Sent Qty, so a quantity corrected through the DC save is always
-- the one used. sent_qty_at_save only records what Sent was when the weights
-- were last saved, so a later change can be flagged for checking.
--
-- Separate from everything that already exists. Nothing here writes to a
-- challan, a line, a quantity, a balance, a follow-up, an invoice or an
-- allocation, and no existing row is changed by this migration. The one new
-- rule on existing data: a line that has weight/scrap recorded cannot be
-- removed from its challan, or its challan deleted, until the weight is removed.
--
-- Weights are stored in grams (0.001 g precision); the unit each was entered
-- in is kept for display. Only an admin can save, change or remove them: the
-- table's row-level security, a guard trigger and the save function each check.

-- ---------------------------------------------------------------------------
-- Weights, one row per challan line.
create table if not exists public.dc_line_weights (
  id uuid primary key default gen_random_uuid(),
  -- restrict: a weighed line is never deleted out from under its weight.
  dc_item_id uuid not null references public.delivery_challan_items(id) on delete restrict,
  rough_weight_g numeric(14,3) not null,
  rough_unit text not null,
  finished_weight_g numeric(14,3) not null,
  finished_unit text not null,
  -- Rupees per kg. No default: a rate is never assumed.
  scrap_rate_per_kg numeric(12,2),
  sent_qty_at_save numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint dc_line_weights_one_per_line unique (dc_item_id),
  constraint dc_line_weights_units check (rough_unit in ('g', 'kg') and finished_unit in ('g', 'kg')),
  constraint dc_line_weights_not_negative check (rough_weight_g >= 0 and finished_weight_g >= 0),
  -- Scrap can be zero but never negative.
  constraint dc_line_weights_finished_within_rough check (finished_weight_g <= rough_weight_g),
  constraint dc_line_weights_rate_not_negative check (scrap_rate_per_kg is null or scrap_rate_per_kg >= 0)
);

-- ---------------------------------------------------------------------------
-- History: every change, written only by the trigger below.
create table if not exists public.dc_line_weight_history (
  id bigint generated always as identity primary key,
  weight_id uuid not null,
  -- No foreign key: history outlives the weight and, later, the line.
  dc_item_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists dc_line_weight_history_item_idx
  on public.dc_line_weight_history (dc_item_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security. Everyone signed in may read, as with challans; only an
-- admin may write weights; nobody writes history directly.
alter table public.dc_line_weights enable row level security;
alter table public.dc_line_weight_history enable row level security;

drop policy if exists "dc_line_weights_select_authenticated" on public.dc_line_weights;
create policy "dc_line_weights_select_authenticated"
  on public.dc_line_weights for select to authenticated using (true);
drop policy if exists "dc_line_weights_insert_admin" on public.dc_line_weights;
create policy "dc_line_weights_insert_admin"
  on public.dc_line_weights for insert to authenticated with check (public.is_admin());
drop policy if exists "dc_line_weights_update_admin" on public.dc_line_weights;
create policy "dc_line_weights_update_admin"
  on public.dc_line_weights for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "dc_line_weights_delete_admin" on public.dc_line_weights;
create policy "dc_line_weights_delete_admin"
  on public.dc_line_weights for delete to authenticated using (public.is_admin());

drop policy if exists "dc_line_weight_history_select_authenticated" on public.dc_line_weight_history;
create policy "dc_line_weight_history_select_authenticated"
  on public.dc_line_weight_history for select to authenticated using (true);

revoke all on public.dc_line_weights from anon;
revoke all on public.dc_line_weight_history from anon;
revoke insert, update, delete, truncate on public.dc_line_weight_history from authenticated;
grant select, insert, update, delete on public.dc_line_weights to authenticated;
grant select on public.dc_line_weight_history to authenticated;

-- ---------------------------------------------------------------------------
-- Guard on weight writes: admin only, an issued line, and the audit columns
-- and Sent-at-save set here rather than trusted from the caller.
create or replace function public.guard_dc_line_weight_write()
returns trigger
language plpgsql
set search_path = public
as $guard$
declare
  v_sent numeric;
  v_status text;
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'WEIGHT_ADMIN_ONLY: only an admin can change weight/scrap'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and new.dc_item_id <> old.dc_item_id then
    raise exception 'WEIGHT_LINE_FIXED: a weight cannot be moved to another line';
  end if;

  select i.sent_qty, d.status::text into v_sent, v_status
    from public.delivery_challan_items i
    join public.delivery_challans d on d.id = i.dc_id
   where i.id = new.dc_item_id;
  if not found then
    raise exception 'WEIGHT_LINE_NOT_FOUND';
  end if;
  if v_status = 'draft' then
    raise exception 'WEIGHT_DRAFT_DC: a draft challan has no weight/scrap';
  end if;

  new.sent_qty_at_save := v_sent;
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

drop trigger if exists trg_guard_dc_line_weight_write on public.dc_line_weights;
create trigger trg_guard_dc_line_weight_write
  before insert or update or delete on public.dc_line_weights
  for each row execute function public.guard_dc_line_weight_write();

-- ---------------------------------------------------------------------------
-- History writer. Definer, because nobody may insert history themselves.
create or replace function public.record_dc_line_weight_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $hist$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  -- A save that changes nothing leaves no history.
  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'updated_by') = (v_new - 'updated_at' - 'updated_by') then
    return null;
  end if;

  insert into public.dc_line_weight_history
    (weight_id, dc_item_id, action, old_values, new_values, changed_by)
  values (
    coalesce(new.id, old.id),
    coalesce(new.dc_item_id, old.dc_item_id),
    lower(tg_op),
    v_old,
    v_new,
    auth.uid()
  );
  return null;
end;
$hist$;

drop trigger if exists trg_record_dc_line_weight_history on public.dc_line_weights;
create trigger trg_record_dc_line_weight_history
  after insert or update or delete on public.dc_line_weights
  for each row execute function public.record_dc_line_weight_history();

-- ---------------------------------------------------------------------------
-- A weighed line stays on its challan. Fires for a line removed in the DC save
-- and for a line deleted with its challan; either is refused, and because the
-- save is one transaction nothing of that save is kept.
create or replace function public.guard_weighed_line_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  if exists (select 1 from public.dc_line_weights w where w.dc_item_id = old.id) then
    raise exception 'WEIGHED_LINE_REMOVED:%', old.component;
  end if;
  return old;
end;
$guard$;

drop trigger if exists trg_guard_weighed_line_delete on public.delivery_challan_items;
create trigger trg_guard_weighed_line_delete
  before delete on public.delivery_challan_items
  for each row execute function public.guard_weighed_line_delete();

-- ---------------------------------------------------------------------------
-- The save: every changed line on one challan in one transaction.
--
-- p_lines is an array of
--   { dc_item_id, rough_value, rough_unit, finished_value, finished_unit, scrap_rate }
-- or { dc_item_id, remove: true } to remove that line's weight.
-- Values arrive in the unit chosen and are converted to grams here.
create or replace function public.save_dc_line_weights(p_dc_id uuid, p_lines jsonb)
returns table (saved int, removed int)
language plpgsql
-- Invoker: the caller's row-level security applies to every write as well.
security invoker
set search_path = public
as $save$
declare
  v_status text;
  v_line jsonb;
  v_item public.delivery_challan_items;
  v_rough numeric;
  v_finished numeric;
  v_rate numeric;
  v_rough_unit text;
  v_finished_unit text;
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

  -- Held until the save ends, so the challan cannot be edited or deleted
  -- half-way through.
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

    v_rough_unit := v_line->>'rough_unit';
    v_finished_unit := v_line->>'finished_unit';
    if coalesce(v_rough_unit, '') not in ('g', 'kg')
       or coalesce(v_finished_unit, '') not in ('g', 'kg') then
      raise exception 'WEIGHT_BAD_UNIT:%', v_item.component;
    end if;

    begin
      v_rough := nullif(v_line->>'rough_value', '')::numeric;
      v_finished := nullif(v_line->>'finished_value', '')::numeric;
      v_rate := nullif(v_line->>'scrap_rate', '')::numeric;
    exception when others then
      raise exception 'WEIGHT_BAD_NUMBER:%', v_item.component;
    end;

    if v_rough is null or v_finished is null then
      raise exception 'WEIGHT_MISSING:%', v_item.component;
    end if;
    if v_rough < 0 or v_finished < 0 or coalesce(v_rate, 0) < 0 then
      raise exception 'WEIGHT_NEGATIVE:%', v_item.component;
    end if;

    v_rough := round(case when v_rough_unit = 'kg' then v_rough * 1000 else v_rough end, 3);
    v_finished := round(case when v_finished_unit = 'kg' then v_finished * 1000 else v_finished end, 3);

    if v_finished > v_rough then
      raise exception 'WEIGHT_FINISHED_OVER_ROUGH:%', v_item.component;
    end if;

    insert into public.dc_line_weights
      (dc_item_id, rough_weight_g, rough_unit, finished_weight_g, finished_unit, scrap_rate_per_kg)
    values
      (v_item.id, v_rough, v_rough_unit, v_finished, v_finished_unit, v_rate)
    on conflict (dc_item_id) do update
      set rough_weight_g = excluded.rough_weight_g,
          rough_unit = excluded.rough_unit,
          finished_weight_g = excluded.finished_weight_g,
          finished_unit = excluded.finished_unit,
          scrap_rate_per_kg = excluded.scrap_rate_per_kg;
    v_saved := v_saved + 1;
  end loop;

  return query select v_saved, v_removed;
end;
$save$;

revoke all on function public.save_dc_line_weights(uuid, jsonb) from public, anon;
grant execute on function public.save_dc_line_weights(uuid, jsonb) to authenticated;
revoke execute on function public.guard_dc_line_weight_write() from public, anon;
revoke execute on function public.record_dc_line_weight_history() from public, anon;
revoke execute on function public.guard_weighed_line_delete() from public, anon;

select
  (select count(*) from public.dc_line_weights)::int as weights,
  (select count(*) from public.delivery_challan_items)::int as challan_lines;
