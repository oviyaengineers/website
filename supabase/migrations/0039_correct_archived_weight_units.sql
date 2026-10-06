-- Some old deleted snapshots were recorded with a unit different from the
-- current master, while both saved weights match it exactly after a 1,000x
-- conversion. Correct only those archived snapshots; active DC records and
-- the historical scrap rate are left untouched.
update public.weight_scrap_archive a
set rough_weight_g = m.rough_weight_g,
    rough_unit = m.unit,
    finished_weight_g = m.finished_weight_g,
    finished_unit = m.unit,
    scrap_weight_g = m.scrap_weight_g,
    total_scrap_g = m.scrap_weight_g * a.sent_qty_at_save,
    scrap_value = round((m.scrap_weight_g * a.sent_qty_at_save) / 1000 * a.scrap_rate_per_kg, 2)
from public.weight_master m
where a.source_history_id is not null
  and m.id = a.weight_master_id
  and (
    (
      a.rough_unit = 'g' and m.unit = 'kg'
      and abs(a.rough_weight_g * 1000 - m.rough_weight_g) < 0.001
      and abs(a.finished_weight_g * 1000 - m.finished_weight_g) < 0.001
    )
    or
    (
      a.rough_unit = 'kg' and m.unit = 'g'
      and abs(a.rough_weight_g / 1000 - m.rough_weight_g) < 0.001
      and abs(a.finished_weight_g / 1000 - m.finished_weight_g) < 0.001
    )
  );
