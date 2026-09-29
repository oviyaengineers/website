-- One current scrap value rate per material. DC line records keep the rate
-- they were saved with; this table supplies the default for new records.
create table if not exists public.scrap_material_rates (
  material_id uuid primary key references public.dc_picklist_items(id) on delete cascade,
  rate_per_kg numeric(12,2) not null check (rate_per_kg >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.scrap_material_rates enable row level security;

drop policy if exists "scrap_material_rates_select" on public.scrap_material_rates;
create policy "scrap_material_rates_select"
  on public.scrap_material_rates for select to authenticated
  using ((select public.module_unlocked('weight')));

drop policy if exists "scrap_material_rates_insert_admin" on public.scrap_material_rates;
create policy "scrap_material_rates_insert_admin"
  on public.scrap_material_rates for insert to authenticated
  with check (public.is_admin() and (select public.module_unlocked('weight')));

drop policy if exists "scrap_material_rates_update_admin" on public.scrap_material_rates;
create policy "scrap_material_rates_update_admin"
  on public.scrap_material_rates for update to authenticated
  using (public.is_admin() and (select public.module_unlocked('weight')))
  with check (public.is_admin() and (select public.module_unlocked('weight')));

revoke all on public.scrap_material_rates from anon;
grant select, insert, update on public.scrap_material_rates to authenticated;

create or replace function public.guard_scrap_material_rate_write()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'WEIGHT_ADMIN_ONLY: only an admin can change scrap rates'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.dc_picklist_items p
    where p.id = new.material_id and p.kind = 'material'
  ) then
    raise exception 'SCRAP_RATE_BAD_MATERIAL';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$guard$;

drop trigger if exists trg_guard_scrap_material_rate_write on public.scrap_material_rates;
create trigger trg_guard_scrap_material_rate_write
  before insert or update on public.scrap_material_rates
  for each row execute function public.guard_scrap_material_rate_write();

revoke execute on function public.guard_scrap_material_rate_write() from public, anon;
