-- Automatically snapshot weights from the active Component + Material master
-- when a DC is issued. Scrap rates remain blank for an admin to enter later.

-- Weight snapshots can exist before an admin enters the scrap rate. The
-- generated scrap value remains NULL until a rate is saved.
alter table public.dc_line_weights
  alter column scrap_rate_per_kg drop not null;

-- Keep reset/history behavior compatible with weight-only snapshots.
alter table public.weight_scrap_archive
  alter column scrap_rate_per_kg drop not null,
  alter column scrap_value drop not null;

create or replace function public.auto_record_dc_line_weight(p_dc_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $auto$
declare
  v_item public.delivery_challan_items;
  v_status text;
  v_master public.weight_master;
begin
  select i.* into v_item
    from public.delivery_challan_items i
   where i.id = p_dc_item_id;
  if not found then
    return;
  end if;

  select d.status::text into v_status
    from public.delivery_challans d
   where d.id = v_item.dc_id;
  if not found or v_status = 'draft' then
    return;
  end if;

  -- A saved snapshot is immutable. DC edits must not silently replace it.
  if exists (
    select 1 from public.dc_line_weights w where w.dc_item_id = v_item.id
  ) then
    return;
  end if;

  select m.* into v_master
    from public.weight_master m
   where m.component_id = v_item.component_id
     and m.material_key = lower(btrim(coalesce(v_item.material, '')))
     and m.is_active;
  if not found then
    return;
  end if;

  -- The existing guard replaces these values from the active master and
  -- stamps the line's current Sent Qty. The insert and its audit row share
  -- the DC save transaction.
  insert into public.dc_line_weights (
    dc_item_id,
    weight_master_id,
    rough_weight_g,
    rough_unit,
    finished_weight_g,
    finished_unit,
    scrap_rate_per_kg
  ) values (
    v_item.id,
    v_master.id,
    v_master.rough_weight_g,
    v_master.unit,
    v_master.finished_weight_g,
    v_master.unit,
    null
  )
  on conflict (dc_item_id) do nothing;
end;
$auto$;

create or replace function public.auto_record_dc_line_weight_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $trigger$
begin
  perform public.auto_record_dc_line_weight(new.id);
  return null;
end;
$trigger$;

create or replace function public.auto_record_dc_weights_on_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $trigger$
declare
  v_item_id uuid;
begin
  if old.status::text = 'draft' and new.status::text <> 'draft' then
    for v_item_id in
      select i.id
        from public.delivery_challan_items i
       where i.dc_id = new.id
    loop
      perform public.auto_record_dc_line_weight(v_item_id);
    end loop;
  end if;
  return null;
end;
$trigger$;

drop trigger if exists trg_auto_record_dc_line_weight on public.delivery_challan_items;
create trigger trg_auto_record_dc_line_weight
  after insert or update on public.delivery_challan_items
  for each row execute function public.auto_record_dc_line_weight_trigger();

drop trigger if exists trg_auto_record_dc_weights_on_issue on public.delivery_challans;
create trigger trg_auto_record_dc_weights_on_issue
  after update of status on public.delivery_challans
  for each row execute function public.auto_record_dc_weights_on_issue();

revoke all on function public.auto_record_dc_line_weight(uuid) from public, anon, authenticated;
revoke all on function public.auto_record_dc_line_weight_trigger() from public, anon, authenticated;
revoke all on function public.auto_record_dc_weights_on_issue() from public, anon, authenticated;
