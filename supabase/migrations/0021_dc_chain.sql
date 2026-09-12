-- Let one piece of work be completed by several delivery challans.
--
-- Until now a challan item carried both sides of a movement: the lot that came
-- in and what had gone back. That works when one challan finishes the job. It
-- does not when 500 arrive and go back as 200, then 150, then 150, because
-- each despatch is its own physical document with its own number, and the
-- quantities have to stay attached to the original lot.
--
-- Two links, both additive. Nothing is rewritten and no existing challan
-- changes: every row on file has both columns null, which means exactly what
-- it means today — an original lot, standing alone.
--
--   delivery_challans.parent_dc_id   the challan this one continues
--   delivery_challan_items.parent_item_id
--                                    the pending line this movement completes
--
-- The per-item link is the one that matters. A challan can carry three parts
-- where one is finished and two are not, and the next challan must be able to
-- pick up only the parts still owing.
--
-- A continuation row carries received_qty = 0: the pieces were received once,
-- on the original line, and counting them again would inflate stock. Its
-- outward quantities are subtracted from the original line's balance instead.

alter table public.delivery_challans
  -- restrict, not cascade: deleting an original must not silently take the
  -- despatch documents raised against it. The delete is refused instead.
  add column if not exists parent_dc_id uuid
    references public.delivery_challans(id) on delete restrict;

alter table public.delivery_challan_items
  add column if not exists parent_item_id uuid
    references public.delivery_challan_items(id) on delete restrict;

-- Balance now reads every descendant of a line, so both directions are looked
-- up constantly.
create index if not exists delivery_challans_parent_dc_id_idx
  on public.delivery_challans (parent_dc_id);
create index if not exists delivery_challan_items_parent_item_id_idx
  on public.delivery_challan_items (parent_item_id);

-- A line cannot continue itself.
do $$
begin
  alter table public.delivery_challan_items
    add constraint delivery_challan_items_parent_not_self
    check (parent_item_id is null or parent_item_id <> id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.delivery_challans
    add constraint delivery_challans_parent_not_self
    check (parent_dc_id is null or parent_dc_id <> id);
exception
  when duplicate_object then null;
end
$$;

select
  (select count(*) from delivery_challans)::int as challans,
  (select count(*) from delivery_challans where parent_dc_id is not null)::int as continuations,
  (select count(*) from delivery_challan_items where parent_item_id is not null)::int as movement_lines;
