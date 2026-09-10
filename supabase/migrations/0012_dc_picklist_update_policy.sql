-- Allow an admin to rename a component or material.
--
-- 0006 created select, insert and delete policies but no update policy, so
-- renaming was refused by row-level security. PostgREST reports that as a
-- success with zero rows matched, which made the failure silent: the toast said
-- "Renamed" and the name was unchanged.
--
-- Scanning reads part numbers off a photograph and gets them wrong often enough
-- that being unable to correct an entry is a real problem: "Flg" arrives as
-- "Fig", a zero as a letter O, and the only remedy was to delete the entry and
-- retype it, losing it from any challan that used it.

create policy "dc_picklist_items_update_admin"
  on public.dc_picklist_items for update
  using (public.is_admin())
  with check (public.is_admin());
