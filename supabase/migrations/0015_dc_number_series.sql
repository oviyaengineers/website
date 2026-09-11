-- Customisable DC numbering, keyed to the Indian financial year.
--
-- Until now DC numbers were "DC-<calendar year>-<0001>", rolling over on 1
-- January and with no way to choose where the series starts. The business
-- works to a financial year (1 April to 31 March) and wants numbers of the
-- form 26-27-001, with the ability to set the year label and the next serial
-- without disturbing a single number already issued.
--
-- Existing challans are not touched by this migration. DC-2026-0001 keeps the
-- number it was given; only numbers issued from here on use the new series.

create table if not exists public.dc_number_series (
  -- One row, enforced: a second series would silently issue duplicate numbers.
  id boolean primary key default true check (id),
  /** Printed before the year, e.g. "OE/". Usually empty. */
  prefix text not null default '',
  /** The financial year as it should read, e.g. "26-27". */
  fy_label text not null,
  /** Digits in the serial, so 1 prints as "001". */
  padding int not null default 3 check (padding between 1 and 8),
  /** The number the next challan will take. */
  next_serial int not null default 1 check (next_serial >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

-- The financial year containing a date: April starts a new one.
create or replace function public.financial_year_label(p_on date default current_date)
returns text
language sql
immutable
as $$
  select case
    when extract(month from p_on)::int >= 4
      then lpad((extract(year from p_on)::int % 100)::text, 2, '0')
        || '-' || lpad(((extract(year from p_on)::int + 1) % 100)::text, 2, '0')
    else lpad(((extract(year from p_on)::int - 1) % 100)::text, 2, '0')
        || '-' || lpad((extract(year from p_on)::int % 100)::text, 2, '0')
  end;
$$;

-- Seed the single row from today's financial year, starting at 1.
insert into public.dc_number_series (id, fy_label)
values (true, public.financial_year_label())
on conflict (id) do nothing;

create or replace function public.format_dc_number(
  p_prefix text, p_fy text, p_serial int, p_padding int
)
returns text
language sql
immutable
as $$
  select p_prefix || p_fy || '-' || lpad(p_serial::text, p_padding, '0');
$$;

-- Next number WITHOUT consuming it, for the preview on the new-DC form.
create or replace function public.peek_dc_number()
returns text
language sql
stable
security definer set search_path = public
as $$
  select public.format_dc_number(prefix, fy_label, next_serial, padding)
    from public.dc_number_series
   where id;
$$;

-- Allocate the next number, called by the insert trigger.
--
-- Skips any number already issued rather than failing on the unique index.
-- Resetting the serial to a value that was used before is allowed — the
-- operator may be correcting a burned run — and must not then break saving.
create or replace function public.generate_dc_number()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.dc_number_series;
  v_candidate text;
begin
  select * into v_row from public.dc_number_series where id for update;
  if not found then
    insert into public.dc_number_series (id, fy_label)
    values (true, public.financial_year_label())
    returning * into v_row;
  end if;

  loop
    v_candidate := public.format_dc_number(
      v_row.prefix, v_row.fy_label, v_row.next_serial, v_row.padding
    );
    exit when not exists (
      select 1 from public.delivery_challans where dc_number = v_candidate
    );
    v_row.next_serial := v_row.next_serial + 1;
  end loop;

  update public.dc_number_series
     set next_serial = v_row.next_serial + 1,
         updated_at = now()
   where id;

  return v_candidate;
end;
$$;

alter table public.dc_number_series enable row level security;

-- Everyone signed in needs to read it, because the new-DC form previews the
-- next number. Only an admin may change where the series is going.
drop policy if exists "dc_number_series_select_authenticated" on public.dc_number_series;
create policy "dc_number_series_select_authenticated"
  on public.dc_number_series for select
  using (auth.role() = 'authenticated');

drop policy if exists "dc_number_series_update_admin" on public.dc_number_series;
create policy "dc_number_series_update_admin"
  on public.dc_number_series for update
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.dc_number_series to authenticated;
grant update on public.dc_number_series to authenticated;
grant execute on function public.peek_dc_number() to authenticated;
grant execute on function public.financial_year_label(date) to authenticated;
