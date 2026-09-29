-- A105 and WCB share one scrap rate. Backfill both material rows from the
-- most recently saved rate, then keep the pair synchronized on every update.
-- Define the function first so this file is safe to re-run with its trigger on.
create or replace function public.sync_a105_wcb_scrap_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $sync$
declare
  v_material_name text;
begin
  -- The sibling upsert below fires the same trigger once more; the nested
  -- invocation can stop because the outer call writes the same rate.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  select lower(btrim(p.name)) into v_material_name
    from public.dc_picklist_items p
   where p.id = new.material_id and p.kind = 'material';

  if v_material_name not in ('a105', 'wcb') then
    return null;
  end if;

  -- The original write is already protected by the authenticated admin RLS
  -- policies and guard trigger. This definer function only mirrors its value
  -- to the matching material row, including creating that row when needed.
  insert into public.scrap_material_rates (material_id, rate_per_kg)
  select p.id, new.rate_per_kg
    from public.dc_picklist_items p
   where p.kind = 'material'
     and lower(btrim(p.name)) in ('a105', 'wcb')
     and p.id <> new.material_id
  on conflict (material_id) do update
    set rate_per_kg = excluded.rate_per_kg;

  return null;
end;
$sync$;

do $backfill$
declare
  v_rate numeric(12,2);
begin
  select r.rate_per_kg into v_rate
    from public.scrap_material_rates r
    join public.dc_picklist_items p on p.id = r.material_id
   where p.kind = 'material'
     and lower(btrim(p.name)) in ('a105', 'wcb')
   order by r.updated_at desc,
            case lower(btrim(p.name)) when 'a105' then 0 else 1 end
   limit 1;

  if v_rate is not null then
    insert into public.scrap_material_rates (material_id, rate_per_kg)
    select p.id, v_rate
      from public.dc_picklist_items p
     where p.kind = 'material'
       and lower(btrim(p.name)) in ('a105', 'wcb')
    on conflict (material_id) do update
      set rate_per_kg = excluded.rate_per_kg;
  end if;
end;
$backfill$;

drop trigger if exists trg_sync_a105_wcb_scrap_rate on public.scrap_material_rates;
create trigger trg_sync_a105_wcb_scrap_rate
  after insert or update of rate_per_kg on public.scrap_material_rates
  for each row execute function public.sync_a105_wcb_scrap_rate();

revoke execute on function public.sync_a105_wcb_scrap_rate() from public, anon;

select p.name, r.rate_per_kg
  from public.dc_picklist_items p
  left join public.scrap_material_rates r on r.material_id = p.id
 where p.kind = 'material'
   and lower(btrim(p.name)) in ('a105', 'wcb', 'cf8m')
 order by case lower(btrim(p.name)) when 'wcb' then 0 when 'a105' then 1 else 2 end;
