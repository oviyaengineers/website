-- Repair the update policy added by 0012, which landed without its USING clause.
--
-- For an UPDATE, Postgres uses USING to decide which existing rows are eligible
-- and WITH CHECK to validate the replacement. With USING absent no row is ever
-- eligible, so the statement matches nothing — and PostgREST reports that as a
-- success, which made renaming a component look like a no-op with no error
-- anywhere. pg_policies showed the policy present but its qual column empty.
--
-- Written to be safe to run whatever state the policy is currently in.

drop policy if exists "dc_picklist_items_update_admin" on public.dc_picklist_items;

create policy "dc_picklist_items_update_admin"
  on public.dc_picklist_items
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
