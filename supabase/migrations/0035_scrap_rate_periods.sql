-- Approved scrap rates are immutable effective-date periods. A105 and WCB
-- intentionally use the same group key so either name resolves to one rate.
create table if not exists public.scrap_rate_periods (
  id uuid primary key default gen_random_uuid(),
  material_group text not null,
  effective_from date not null,
  effective_to date not null,
  rate_per_kg numeric(12,2) not null check (rate_per_kg >= 0),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz not null default now(),
  constraint scrap_rate_periods_valid_dates check (effective_to >= effective_from)
);

create index if not exists scrap_rate_periods_group_dates_idx
  on public.scrap_rate_periods (material_group, effective_from, effective_to);

alter table public.scrap_rate_periods enable row level security;

drop policy if exists "scrap_rate_periods_select" on public.scrap_rate_periods;
create policy "scrap_rate_periods_select"
  on public.scrap_rate_periods for select to authenticated
  using ((select public.module_unlocked('weight')));

drop policy if exists "scrap_rate_periods_insert_admin" on public.scrap_rate_periods;
create policy "scrap_rate_periods_insert_admin"
  on public.scrap_rate_periods for insert to authenticated
  with check (public.is_admin() and (select public.module_unlocked('weight')));

revoke all on public.scrap_rate_periods from anon;
grant select, insert on public.scrap_rate_periods to authenticated;

-- The application derives material_group from the selected DC material. This
-- guard independently validates it and serializes approvals for the same group.
create or replace function public.guard_scrap_rate_period_insert()
returns trigger
language plpgsql
set search_path = public
as $guard$
declare
  v_expected_group text;
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'WEIGHT_ADMIN_ONLY: only an admin can approve scrap rates'
      using errcode = '42501';
  end if;

  if new.effective_to < new.effective_from or new.rate_per_kg < 0 then
    raise exception 'SCRAP_RATE_PERIOD_INVALID';
  end if;

  if new.material_group !~ '^[a-z0-9][a-z0-9 _.-]*$' then
    raise exception 'SCRAP_RATE_PERIOD_BAD_MATERIAL';
  end if;

  perform pg_advisory_xact_lock(hashtext('scrap-rate:' || new.material_group));

  if exists (
    select 1 from public.scrap_rate_periods p
    where p.material_group = new.material_group
      and daterange(p.effective_from, p.effective_to, '[]')
          && daterange(new.effective_from, new.effective_to, '[]')
  ) then
    raise exception 'SCRAP_RATE_PERIOD_OVERLAP';
  end if;

  new.approved_by := auth.uid();
  new.approved_at := now();
  return new;
end;
$guard$;

drop trigger if exists trg_guard_scrap_rate_period_insert on public.scrap_rate_periods;
create trigger trg_guard_scrap_rate_period_insert
  before insert on public.scrap_rate_periods
  for each row execute function public.guard_scrap_rate_period_insert();

-- Approvals are an audit history: once approved, they cannot be edited/deleted.
create or replace function public.prevent_scrap_rate_period_change()
returns trigger
language plpgsql
set search_path = public
as $prevent$
begin
  raise exception 'SCRAP_RATE_PERIOD_IMMUTABLE: approved scrap rate periods cannot be changed';
end;
$prevent$;

drop trigger if exists trg_prevent_scrap_rate_period_change on public.scrap_rate_periods;
create trigger trg_prevent_scrap_rate_period_change
  before update or delete on public.scrap_rate_periods
  for each row execute function public.prevent_scrap_rate_period_change();

revoke execute on function public.guard_scrap_rate_period_insert() from public, anon;
revoke execute on function public.prevent_scrap_rate_period_change() from public, anon;
