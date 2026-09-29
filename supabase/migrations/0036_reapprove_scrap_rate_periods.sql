-- Allow a newer approval to supersede an older rate for the selected dates.
-- The original row remains immutable audit history; the newest approval wins.
create or replace function public.guard_scrap_rate_period_insert()
returns trigger
language plpgsql
set search_path = public
as $guard$
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

  new.approved_by := auth.uid();
  new.approved_at := clock_timestamp();
  return new;
end;
$guard$;
