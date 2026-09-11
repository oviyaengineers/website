-- Point challan items at a component by id instead of by its printed name.
--
-- Until now an item row stored the part name as free text, copied in at the
-- moment the challan was raised. Two things followed from that. A part renamed
-- in Settings left every existing challan spelling it the old way until a
-- separate pass went round and rewrote them, and a name that arrived slightly
-- wrong — a misread from a scan, a stray table border — became a part of its
-- own that nothing could tell apart from the real one.
--
-- The name column stays. It is the fallback for a row whose component was
-- later removed from the master list, and it keeps every existing challan
-- readable if this migration is applied before the code that uses it.
--
-- Nothing is deleted and no row is rejected: the new column is nullable, so a
-- name that matches nothing in the master list keeps its text and simply has
-- no id. Those are worth looking at, and the last query here lists them.

alter table public.delivery_challan_items
  add column if not exists component_id uuid
    -- set null, not cascade: deleting a part from the master list must never
    -- delete a challan line that recorded real pieces.
    references public.dc_picklist_items(id) on delete set null;

-- Backfill by name, ignoring case and surrounding space, against components
-- only — a material sharing a name with a part must not be matched.
update public.delivery_challan_items as items
   set component_id = picklist.id
  from public.dc_picklist_items as picklist
 where items.component_id is null
   and picklist.kind = 'component'
   and lower(btrim(items.component)) = lower(btrim(picklist.name));

create index if not exists delivery_challan_items_component_id_idx
  on public.delivery_challan_items (component_id);

-- Report: every item row still without a component, which means its name
-- matches nothing in the master list. Expected to be none.
select count(*) as rows_without_a_component
  from public.delivery_challan_items
 where component_id is null;
