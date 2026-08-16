-- Remove the per-item Remarks column from delivery_challan_items.
alter table public.delivery_challan_items drop column if exists remarks;
