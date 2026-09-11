-- Which database am I actually editing?
--
-- Migrations 0015 to 0017 reported success in the SQL editor three times over
-- while the application's database stayed untouched, which happens when the
-- editor is pointed at a different project or at a branch database.
--
-- The application talks to project ref hksgfizstuzofzaulqec. Compare that with
-- the ref in the browser address bar while this runs.

select
  current_database()                                as database,
  current_user                                      as running_as,
  (select count(*) from public.delivery_challans)   as challans_here,
  (select string_agg(dc_number, ', ' order by dc_number)
     from public.delivery_challans)                 as challan_numbers,
  to_regclass('public.dc_number_series')            as dc_number_series,
  public.peek_dc_number()                           as next_dc_number;
