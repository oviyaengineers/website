-- Let billing admins choose the series prefix, year separator and serial width.
-- This only changes future numbers; existing invoice_number values are untouched.

alter table public.invoice_number_series
  drop constraint if exists invoice_number_series_prefix_check;
alter table public.invoice_number_series
  drop constraint if exists invoice_number_series_fy_label_check;

-- Store the series name without a trailing slash. The formatter inserts a
-- hyphen before the year, which supports formats such as BILL-26-27/001.
update public.invoice_number_series
   set prefix = regexp_replace(prefix, '/$', '');

alter table public.invoice_number_series
  add constraint invoice_number_series_prefix_check
  check (prefix ~ '^[A-Za-z0-9]{1,16}$');
alter table public.invoice_number_series
  add constraint invoice_number_series_fy_label_check
  check (length(fy_label) between 2 and 12 and fy_label ~ '^[A-Za-z0-9]+([-/][A-Za-z0-9]+)*$');

-- Prefixes differ without regard to case; since each is followed by a hyphen,
-- the two series cannot produce the same formatted number.
drop index if exists public.invoice_number_series_prefix_key;
create unique index invoice_number_series_prefix_key
  on public.invoice_number_series (lower(prefix));

create or replace function public.format_invoice_number(
  p_prefix text,
  p_fy text,
  p_serial int,
  p_padding int
)
returns text
language sql
immutable
set search_path = public
as $fmt$
  select p_prefix || '-' || p_fy || '/' || lpad(p_serial::text, p_padding, '0');
$fmt$;
