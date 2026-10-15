-- Backfill the older issued DC lines that were still missing weight snapshots.
-- The user asked to fill these from the saved Component + Material weight
-- master. The insert guard copies the current master weights and the DC's
-- current Sent Qty into the immutable line snapshot; scrap rate stays blank.
-- Keep this limited to the exact lines identified during the one-time review.

insert into public.dc_line_weights (
  dc_item_id,
  weight_master_id,
  rough_weight_g,
  rough_unit,
  finished_weight_g,
  finished_unit,
  scrap_rate_per_kg
)
select
  i.id,
  m.id,
  m.rough_weight_g,
  m.unit,
  m.finished_weight_g,
  m.unit,
  null
from public.delivery_challan_items i
join public.delivery_challans d
  on d.id = i.dc_id and d.status::text <> 'draft'
join public.weight_master m
  on m.component_id = i.component_id
 and m.material_key = lower(btrim(coalesce(i.material, '')))
 and m.is_active
where i.id in (
  'e665ab29-bced-4155-81b0-3fdd9e3a4f61'::uuid,
  '545dc602-0cac-4b1c-bdbd-68d402fece9f'::uuid,
  '4bedc161-bc38-4739-a6f9-ba8af631f157'::uuid,
  '821f847f-9e33-463f-8bef-4e9c23fbe304'::uuid,
  '38736210-e938-4e36-ac72-54d53e1c157c'::uuid,
  '7aef2ece-1bf4-4125-b6e2-2ae7d3843a26'::uuid,
  '1ba623d9-0e5b-40a6-99e2-0f2604851060'::uuid,
  'fab84c2c-5fcd-4b51-bf9d-26326bb585fc'::uuid,
  '00353c32-c7fb-4c7d-b8e9-8755f0f6ff0f'::uuid
)
and not exists (
  select 1 from public.dc_line_weights existing where existing.dc_item_id = i.id
)
on conflict (dc_item_id) do nothing;
