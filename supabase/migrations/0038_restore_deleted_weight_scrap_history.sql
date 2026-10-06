-- Make the older Weight/Scrap delete audit snapshots visible in Scrap History.
-- This recovers records removed before the archive-and-reset feature existed.
alter table public.weight_scrap_archive
  add column if not exists source_history_id bigint;

create unique index if not exists weight_scrap_archive_source_history_idx
  on public.weight_scrap_archive (source_history_id);

insert into public.weight_scrap_archive (
  reset_id, source_weight_id, source_history_id, dc_id, dc_item_id,
  dc_number, dc_date, customer_name, component, material,
  current_sent_qty, sent_qty_at_save, weight_master_id,
  rough_weight_g, rough_unit, finished_weight_g, finished_unit,
  scrap_weight_g, scrap_rate_per_kg, total_scrap_g, scrap_value,
  recorded_at, archived_at, archived_by
)
select
  gen_random_uuid(),
  (h.old_values->>'id')::uuid,
  h.id,
  d.id,
  h.dc_item_id,
  d.dc_number,
  d.dc_date,
  coalesce(c.name, '-'),
  i.component,
  i.material,
  (h.old_values->>'sent_qty_at_save')::numeric,
  (h.old_values->>'sent_qty_at_save')::numeric,
  (h.old_values->>'weight_master_id')::uuid,
  (h.old_values->>'rough_weight_g')::numeric,
  h.old_values->>'rough_unit',
  (h.old_values->>'finished_weight_g')::numeric,
  h.old_values->>'finished_unit',
  (h.old_values->>'scrap_weight_g')::numeric,
  (h.old_values->>'scrap_rate_per_kg')::numeric,
  (h.old_values->>'total_scrap_g')::numeric,
  (h.old_values->>'scrap_value')::numeric,
  coalesce((h.old_values->>'updated_at')::timestamptz, h.changed_at),
  h.changed_at,
  h.changed_by
from public.dc_line_weight_history h
join public.delivery_challan_items i on i.id = h.dc_item_id
join public.delivery_challans d on d.id = i.dc_id
left join public.customers c on c.id = d.customer_id
where h.action = 'delete'
  and h.old_values is not null
  and h.old_values ? 'rough_unit'
  and h.old_values ? 'total_scrap_g'
  and h.old_values ? 'scrap_value'
on conflict (source_history_id) do nothing;
