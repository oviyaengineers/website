-- Expose Rejection Qty in the Weight / Scrap lines view.
-- Scrap uses recorded Sent Qty plus the DC's current Rejection Qty.
-- Material Problem Qty remains excluded.
create or replace view public.dc_weight_lines
with (security_invoker = true)
as
select
  i.id as dc_item_id,
  d.id as dc_id,
  d.dc_number,
  d.dc_date,
  d.status::text as dc_status,
  d.customer_id,
  c.name as customer_name,
  i.component,
  i.component_id,
  i.material,
  i.sort_order,
  i.sent_qty,
  case
    when w.id is not null then 'recorded'
    when m.id is not null then 'pending'
    else 'not_configured'
  end as weight_state,
  w.id as weight_id,
  w.weight_master_id,
  w.rough_unit as recorded_unit,
  w.rough_weight_g as recorded_rough_g,
  w.finished_weight_g as recorded_finished_g,
  w.scrap_weight_g as recorded_scrap_g,
  w.sent_qty_at_save,
  w.scrap_rate_per_kg,
  w.total_scrap_g,
  w.scrap_value,
  w.updated_at as recorded_at,
  (w.id is not null and w.sent_qty_at_save <> i.sent_qty) as sent_qty_changed,
  m.id as master_id,
  m.unit as master_unit,
  m.rough_weight_g as master_rough_g,
  m.finished_weight_g as master_finished_g,
  m.scrap_weight_g as master_scrap_g,
  i.rejection_qty as rejection_qty
from public.delivery_challan_items i
join public.delivery_challans d on d.id = i.dc_id and d.status <> 'draft'
left join public.customers c on c.id = d.customer_id
left join public.dc_line_weights w on w.dc_item_id = i.id
left join public.weight_master m
  on w.id is null
 and m.component_id = i.component_id
 and m.material_key = lower(btrim(coalesce(i.material, '')))
 and m.is_active;
