-- A scanned customer DC is an input record, not our delivery challan.
--
-- The queue was a holding pen: a row existed while a scan was waiting and was
-- deleted the moment a challan was raised from it. That lost the link between
-- the customer's paper and our challan, and left no way to tell a scan that
-- had been entered from one that had never been scanned at all.
--
-- A scan now has a life of its own. It arrives pending, becomes converted when
-- our challan is created from it, and records which challan that was. Nothing
-- is deleted, so the customer DC that produced a challan can always be traced.
--
-- Existing rows take the default and stay pending, which is what they are.

alter table public.pending_dc_scans
  add column if not exists status text not null default 'pending',
  -- set null, not cascade: deleting a challan must not erase the record of the
  -- customer DC that came in. It goes back to being an input with no output.
  add column if not exists dc_id uuid references public.delivery_challans(id) on delete set null,
  add column if not exists converted_at timestamptz;

do $$
begin
  alter table public.pending_dc_scans
    add constraint pending_dc_scans_status_check
    check (status in ('pending', 'converted', 'discarded'));
exception
  when duplicate_object then null;
end
$$;

-- The list screen and the badge both ask for one status at a time.
create index if not exists pending_dc_scans_status_idx
  on public.pending_dc_scans (status, created_at);

-- Report: what is on file, so the change can be seen to have preserved it.
select status, count(*)::int as scans
  from public.pending_dc_scans
 group by status;
